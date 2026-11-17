'use server';

import { and, count, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError, getBool, getStr, run, type ActionState } from '@/lib/action-utils';
import { logAudit } from '@/lib/audit';
import { requireElectionAction, requireSuperAction } from '@/lib/authz';
import { deleteBlobsByUrl } from '@/lib/blob';
import { getDb } from '@/lib/db/client';
import { getOptions, isUuid } from '@/lib/db/queries';
import { admins, electionAdmins, elections, nominations, options, voters } from '@/lib/db/schema';
import { assertDraft, launchProblems } from '@/lib/election-rules';
import { dateSchema, electionSchema } from '@/lib/validators';

function electionInput(fd: FormData) {
  const positions = (getStr(fd, 'nominationPositions') ?? '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const type = getStr(fd, 'type');
  const candidate = type === 'candidate';
  const int = (key: string, fallback: number) => {
    const n = Number.parseInt(getStr(fd, key) ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    title: getStr(fd, 'title'),
    description: getStr(fd, 'description'),
    type,
    requireImages: candidate && getBool(fd, 'requireImages'),
    opensAt: getStr(fd, 'opensAt'),
    closesAt: getStr(fd, 'closesAt'),
    nominationsEnabled: getBool(fd, 'nominationsEnabled'),
    nominationsCloseAt: getStr(fd, 'nominationsCloseAt'),
    nominationPositions: candidate ? [...new Set(positions)] : [],
    requirePurchaseEvidence: candidate && getBool(fd, 'requirePurchaseEvidence'),
    nominationInstructions: getStr(fd, 'nominationInstructions'),
    nominationMode: getStr(fd, 'nominationMode') === 'member' ? ('member' as const) : ('self' as const),
    minNominators: int('minNominators', 2),
    maxNominators: int('maxNominators', 3),
    consentHours: int('consentHours', 72),
    maxOptionSuggestions: int('maxOptionSuggestions', 10),
    liveResults: getBool(fd, 'liveResults'),
  };
}

const refresh = (id: string) => {
  revalidatePath('/admin');
  revalidatePath(`/admin/elections/${id}`, 'layout');
};

/** Super admin only. */
export async function createElection(_p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const v = electionSchema.parse(electionInput(fd));
    const db = getDb();
    const [row] = await db
      .insert(elections)
      .values({
        title: v.title,
        description: v.description ?? null,
        type: v.type,
        requireImages: v.requireImages,
        opensAt: v.opensAt,
        closesAt: v.closesAt,
        liveResults: v.liveResults ?? false,
        nominationsEnabled: v.nominationsEnabled,
        nominationsCloseAt: v.nominationsCloseAt ?? null,
        nominationPositions: v.nominationPositions,
        requirePurchaseEvidence: v.requirePurchaseEvidence,
        nominationInstructions: v.nominationInstructions ?? null,
        nominationMode: v.nominationMode,
        minNominators: v.minNominators,
        maxNominators: v.maxNominators,
        consentHours: v.consentHours,
        maxOptionSuggestions: v.maxOptionSuggestions,
      })
      .returning({ id: elections.id });
    if (!row) throw new AppError('Could not create the election.');

    const adminIds = fd.getAll('adminIds').filter((x): x is string => typeof x === 'string' && isUuid(x));
    if (adminIds.length > 0) {
      const valid = await db.select({ id: admins.id }).from(admins).where(inArray(admins.id, adminIds));
      if (valid.length > 0) {
        await db.insert(electionAdmins).values(valid.map((a) => ({ electionId: row.id, adminId: a.id })));
      }
    }
    await logAudit({ actor: user.email, action: 'election.create', electionId: row.id, meta: { title: v.title, assignedAdmins: adminIds.length } });
    revalidatePath('/admin');
    redirect(`/admin/elections/${row.id}`);
  });
}

/**
 * Admins and the super admin may edit setup details while the election is a DRAFT.
 * Once OPEN, the only permitted change is extending closes_at (audit-logged).
 * Neither role can touch ballots; admins also cannot change live-results visibility.
 */
export async function updateElection(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    const db = getDb();
    const input = electionInput(fd);

    if (election.status === 'open') {
      const v = dateSchema.parse(input.closesAt);
      if (v <= election.closesAt) throw new AppError('While voting is open you can only extend the closing time.');
      await db.batch([
        db.update(elections).set({ closesAt: v }).where(eq(elections.id, electionId)),
        // keep already-issued links valid until the new close time
        db
          .update(voters)
          .set({ tokenExpiresAt: v })
          .where(and(eq(voters.electionId, electionId), eq(voters.hasVoted, false))),
      ]);
      await logAudit({ actor: user.email, action: 'election.extend_close', electionId, meta: { from: election.closesAt.toISOString(), to: v.toISOString() } });
      refresh(electionId);
      return 'Closing time extended.';
    }

    assertDraft(election);
    const v = electionSchema.parse(input);
    if (v.type !== election.type) {
      const existing = await getOptions(electionId);
      if (existing.length > 0) throw new AppError('Remove all options before changing the election type.');
    }
    const liveResults = user.role === 'super_admin' ? (v.liveResults ?? false) : election.liveResults;
    await db.batch([
      db
        .update(elections)
        .set({
          title: v.title,
          description: v.description ?? null,
          type: v.type,
          requireImages: v.requireImages,
          opensAt: v.opensAt,
          closesAt: v.closesAt,
          liveResults,
          nominationsEnabled: v.nominationsEnabled,
          nominationsCloseAt: v.nominationsCloseAt ?? null,
          nominationPositions: v.nominationPositions,
          requirePurchaseEvidence: v.requirePurchaseEvidence,
          nominationInstructions: v.nominationInstructions ?? null,
          nominationMode: v.nominationMode,
          minNominators: v.minNominators,
          maxNominators: v.maxNominators,
          consentHours: v.consentHours,
          maxOptionSuggestions: v.maxOptionSuggestions,
        })
        .where(eq(elections.id, electionId)),
      db
        .update(voters)
        .set({ tokenExpiresAt: v.closesAt })
        .where(and(eq(voters.electionId, electionId), eq(voters.hasVoted, false))),
    ]);
    await logAudit({ actor: user.email, action: 'election.update', electionId, meta: { title: v.title } });
    refresh(electionId);
    return 'Saved.';
  });
}

/** draft -> open. Available to assigned admins and the super admin. */
export async function launchElection(electionId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const { user, election } = await requireElectionAction(electionId);
    assertDraft(election);
    const db = getDb();
    const opts = await getOptions(electionId);
    const [vc] = await db.select({ n: count() }).from(voters).where(eq(voters.electionId, electionId));
    const [pn] = await db
      .select({ n: count() })
      .from(nominations)
      .where(and(eq(nominations.electionId, electionId), eq(nominations.status, 'pending')));
    const problems = launchProblems({ election, options: opts, voterCount: Number(vc?.n ?? 0), pendingNominations: Number(pn?.n ?? 0), now: new Date() });
    if (problems.length > 0) throw new AppError(problems.join(' '));
    await db.update(elections).set({ status: 'open' }).where(and(eq(elections.id, electionId), eq(elections.status, 'draft')));
    await logAudit({ actor: user.email, action: 'election.launch', electionId });
    refresh(electionId);
    return 'Election launched. Voting follows the opening and closing times.';
  });
}

/** open -> closed. Super admin only (admins cannot influence when results appear). */
export async function closeElection(electionId: string, _p: ActionState, _fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const res = await getDb()
      .update(elections)
      .set({ status: 'closed' })
      .where(and(eq(elections.id, electionId), eq(elections.status, 'open')))
      .returning({ id: elections.id });
    if (res.length === 0) throw new AppError('Only an open election can be closed.');
    await logAudit({ actor: user.email, action: 'election.close', electionId });
    refresh(electionId);
    return 'Election closed.';
  });
}

/** closed -> published. Super admin only. Irreversible: results become immutable. */
export async function publishElection(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const resultsPublic = getBool(fd, 'resultsPublic');
    const res = await getDb()
      .update(elections)
      .set({ status: 'published', resultsPublic })
      .where(and(eq(elections.id, electionId), eq(elections.status, 'closed')))
      .returning({ id: elections.id });
    if (res.length === 0) throw new AppError('Only a closed election can be published.');
    await logAudit({ actor: user.email, action: 'election.publish', electionId, meta: { resultsPublic } });
    revalidatePath(`/results/${electionId}`); // drop any cached "not available" page
    refresh(electionId);
    return resultsPublic ? 'Results published and publicly visible.' : 'Results published (admins only).';
  });
}

/** Draft elections only. Removes the election and every stored image. */
export async function deleteElection(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const { election } = await requireElectionAction(electionId);
    assertDraft(election);
    if (getStr(fd, 'confirmTitle') !== election.title) throw new AppError('Type the election title exactly to confirm.');
    const db = getDb();
    const opts = await db.select({ u: options.imageUrl }).from(options).where(eq(options.electionId, electionId));
    const noms = await db
      .select({ p: nominations.photoUrl, r: nominations.receiptUrl })
      .from(nominations)
      .where(eq(nominations.electionId, electionId));
    await db.delete(elections).where(eq(elections.id, electionId));
    await deleteBlobsByUrl([...opts.map((o) => o.u), ...noms.flatMap((n) => [n.p, n.r])]);
    await logAudit({ actor: user.email, action: 'election.delete', electionId, meta: { title: election.title } });
    revalidatePath('/admin');
    redirect('/admin');
  });
}

/** Replace the set of delegated admins assigned to an election. Super admin only. */
export async function setElectionAdmins(electionId: string, _p: ActionState, fd: FormData) {
  return run(async () => {
    const user = await requireSuperAction();
    const { election } = await requireElectionAction(electionId);
    const ids = fd.getAll('adminIds').filter((x): x is string => typeof x === 'string' && isUuid(x));
    const db = getDb();
    const valid = ids.length > 0 ? await db.select({ id: admins.id }).from(admins).where(inArray(admins.id, ids)) : [];
    if (valid.length > 0) {
      await db.batch([
        db.delete(electionAdmins).where(eq(electionAdmins.electionId, election.id)),
        db.insert(electionAdmins).values(valid.map((a) => ({ electionId: election.id, adminId: a.id }))),
      ]);
    } else {
      await db.delete(electionAdmins).where(eq(electionAdmins.electionId, election.id));
    }
    await logAudit({ actor: user.email, action: 'election.set_admins', electionId, meta: { count: valid.length } });
    refresh(electionId);
    return 'Admin assignments saved.';
  });
}
