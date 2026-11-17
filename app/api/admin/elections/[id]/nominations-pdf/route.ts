import { asc, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { electionFor, getAdminUser } from '@/lib/authz';
import { getDb } from '@/lib/db/client';
import { nominationAttachments, nominations, nominees, nominators } from '@/lib/db/schema';
import {
  buildNominationsPdf,
  PDF_LIMITS,
  pdfResponseBody,
  type AttachmentExport,
  type NominatorExport,
  type SelfNominationExport,
} from '@/lib/pdf';
import { checkLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nominations PDF. Member mode appends every stored proof and signature; the
 * export is restricted to admins of the election, audited and marked confidential.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const election = await electionFor(user, id);
  if (!election) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await checkLimit('api', user.email))) {
    return NextResponse.json({ error: 'Too many exports. Please wait a minute.' }, { status: 429 });
  }

  const db = getDb();
  const exportedAt = new Date();
  let pdf: Uint8Array;
  let meta: Record<string, unknown>;

  if (election.nominationMode === 'member') {
    const allNominees = await db
      .select()
      .from(nominees)
      .where(eq(nominees.electionId, id))
      .orderBy(asc(nominees.position), desc(nominees.createdAt));
    const included = allNominees.slice(0, PDF_LIMITS.nominees);
    const omittedNominees = allNominees.length - included.length;
    const nomineeIds = included.map((n) => n.id);

    const nominatorRows = nomineeIds.length
      ? await db
          .select()
          .from(nominators)
          .where(inArray(nominators.nomineeId, nomineeIds))
          .orderBy(asc(nominators.createdAt))
      : [];
    const nominatorIds = nominatorRows.map((n) => n.id);

    const attachmentMeta = nominatorIds.length
      ? await db
          .select({
            id: nominationAttachments.id,
            nominatorId: nominationAttachments.nominatorId,
            kind: nominationAttachments.kind,
            contentType: nominationAttachments.contentType,
            size: nominationAttachments.size,
          })
          .from(nominationAttachments)
          .where(inArray(nominationAttachments.nominatorId, nominatorIds))
          .orderBy(asc(nominationAttachments.createdAt))
      : [];

    let budgetBytes = PDF_LIMITS.attachmentBytes;
    let omittedAttachments = 0;
    const allowedIds: string[] = [];
    for (const a of attachmentMeta) {
      if (allowedIds.length >= PDF_LIMITS.attachments || a.size > budgetBytes) {
        omittedAttachments++;
        continue;
      }
      allowedIds.push(a.id);
      budgetBytes -= a.size;
    }

    const attachmentRows = allowedIds.length
      ? await db
          .select({
            id: nominationAttachments.id,
            nominatorId: nominationAttachments.nominatorId,
            kind: nominationAttachments.kind,
            contentType: nominationAttachments.contentType,
            dataBase64: nominationAttachments.dataBase64,
            size: nominationAttachments.size,
          })
          .from(nominationAttachments)
          .where(inArray(nominationAttachments.id, allowedIds))
          .orderBy(asc(nominationAttachments.createdAt))
      : [];

    const attachmentsByNominator = new Map<string, AttachmentExport[]>();
    for (const a of attachmentRows) {
      const list = attachmentsByNominator.get(a.nominatorId) ?? [];
      list.push({ kind: a.kind, contentType: a.contentType, dataBase64: a.dataBase64, size: a.size });
      attachmentsByNominator.set(a.nominatorId, list);
    }
    const nominatorsByNominee = new Map<string, NominatorExport[]>();
    for (const n of nominatorRows) {
      const list = nominatorsByNominee.get(n.nomineeId) ?? [];
      list.push({
        name: n.nominatorName,
        email: n.nominatorEmail,
        createdAt: n.createdAt,
        attachments: attachmentsByNominator.get(n.id) ?? [],
      });
      nominatorsByNominee.set(n.nomineeId, list);
    }

    pdf = await buildNominationsPdf({
      electionTitle: election.title,
      electionId: id,
      mode: 'member',
      nominees: included.map((n) => ({
        position: n.position,
        fullName: n.fullName,
        email: n.email,
        phone: n.phone,
        status: n.status,
        bio: n.bio,
        reviewNote: n.reviewNote,
        consentExpiresAt: n.consentExpiresAt,
        createdAt: n.createdAt,
        nominators: nominatorsByNominee.get(n.id) ?? [],
      })),
      nominations: [],
      exportedBy: user.email,
      exportedAt,
      omittedNominees,
      omittedAttachments,
    });
    meta = {
      mode: 'member',
      nominees: included.length,
      nominators: nominatorRows.length,
      attachments: allowedIds.length,
      omittedNominees,
      omittedAttachments,
    };
  } else {
    const rows = await db
      .select()
      .from(nominations)
      .where(eq(nominations.electionId, id))
      .orderBy(desc(nominations.createdAt));
    const selfNominations: SelfNominationExport[] = rows.map((n) => ({
      fullName: n.fullName,
      email: n.email,
      phone: n.phone,
      position: n.position,
      status: n.status,
      manifesto: n.manifesto,
      receiptReference: n.receiptReference,
      hasReceipt: !!n.receiptUrl,
      reviewNote: n.reviewNote,
      createdAt: n.createdAt,
    }));
    pdf = await buildNominationsPdf({
      electionTitle: election.title,
      electionId: id,
      mode: 'self',
      nominees: [],
      nominations: selfNominations,
      exportedBy: user.email,
      exportedAt,
    });
    meta = { mode: 'self', nominations: rows.length };
  }

  await logAudit({ actor: user.email, action: 'nominations.export_pdf', electionId: id, meta });

  return new NextResponse(pdfResponseBody(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="nominations-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
