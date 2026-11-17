import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { electionFor, getAdminUser } from '@/lib/authz';
import { getElection, isUuid } from '@/lib/db/queries';
import { nominationsOpen } from '@/lib/election-rules';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { pathnameAllowed, policyFor, UPLOAD_KINDS } from '@/lib/upload-policy';

export const dynamic = 'force-dynamic';

const payloadSchema = z
  .object({ kind: z.enum(UPLOAD_KINDS as [string, ...string[]]), electionId: z.string().uuid() })
  .strict();

/**
 * Client-upload token endpoint (avoids the ~4.5 MB serverless body limit).
 *  - kind "option": admin session required, with access to that election, election must be a draft.
 *  - kind "nomination-*": public, but only while that election's nomination form is open; rate limited by IP.
 * The returned token restricts content type and size (2 MB) at the Blob service itself.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const ip = getClientIp(request.headers);

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(JSON.parse(clientPayload ?? '{}'));
        if (!parsed.success) throw new Error('Invalid upload request');
        const kind = parsed.data.kind as 'option' | 'nomination-photo' | 'nomination-receipt';
        const { electionId } = parsed.data;
        if (!isUuid(electionId) || !pathnameAllowed(kind, electionId, pathname)) throw new Error('Invalid path');
        if (!(await checkLimitClosed('upload', ip))) throw new Error('Rate limited');

        const election = await getElection(electionId);
        if (!election) throw new Error('Not found');

        if (kind === 'option') {
          const user = await getAdminUser(); // verify the admin session here, as required
          if (!user || !(await electionFor(user, electionId))) throw new Error('Unauthorised');
          if (election.status !== 'draft') throw new Error('Election is locked');
        } else if (!nominationsOpen(election, new Date())) {
          throw new Error('Nominations are closed');
        }

        const p = policyFor(kind);
        return {
          allowedContentTypes: p.allowedContentTypes,
          maximumSizeInBytes: p.maximumSizeInBytes,
          addRandomSuffix: true, // unguessable URL even for the (public) blob
          tokenPayload: JSON.stringify({ kind, electionId }),
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do: the url/path are saved by the form that follows.
      },
    });
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: 'Upload not permitted' }, { status: 400 });
  }
}
