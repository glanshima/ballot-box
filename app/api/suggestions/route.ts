import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db/client';
import { getElection, isUuid } from '@/lib/db/queries';
import { optionSuggestions, options } from '@/lib/db/schema';
import { memberSuggestionsOpen } from '@/lib/election-rules';
import { normalizeTitle } from '@/lib/nominations/rules';
import { sessionVoter } from '@/lib/nominations/member';
import { readMemberSession } from '@/lib/nominations/session';
import { checkLimitClosed, getClientIp } from '@/lib/ratelimit';
import { countsTowardCap, duplicateTitleError, type SuggestionStatus } from '@/lib/suggestions';
import { isOwnUpload } from '@/lib/upload-policy';
import { suggestionSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

/** Verified-member poll suggestion. It only becomes an option after an admin approves it. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Forbidden', 403);
  const ip = getClientIp(request.headers);
  if (!(await checkLimitClosed('nominate', ip))) {
    return fail('Too many submissions. Please try again later.', 429);
  }

  const parsed = suggestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid suggestion.', 400);
  const v = parsed.data;
  if (!isUuid(v.electionId)) return fail('Invalid election.', 400);

  const session = await readMemberSession(v.electionId);
  if (!session) return fail('Please verify your email address again.', 401);

  const election = await getElection(v.electionId);
  if (!election || !memberSuggestionsOpen(election, new Date())) {
    return fail('Suggestions are closed.', 403);
  }

  const voter = await sessionVoter(election.id, session.voterId);
  if (!voter) return fail('Please verify your email address again.', 401);

  if (v.imageUrl && v.imagePath && !isOwnUpload('suggestion', election.id, v.imageUrl, v.imagePath)) {
    return fail('Invalid image upload. Please upload it again.', 400);
  }

  const db = getDb();
  const [currentOptions, suggestions] = await Promise.all([
    db.select({ label: options.label }).from(options).where(eq(options.electionId, election.id)),
    db
      .select({ title: optionSuggestions.title, status: optionSuggestions.status })
      .from(optionSuggestions)
      .where(eq(optionSuggestions.electionId, election.id)),
  ]);

  const duplicate = duplicateTitleError(
    [...currentOptions.map((o) => o.label), ...suggestions.map((s) => s.title)],
    v.title,
  );
  if (duplicate) return fail(duplicate, 409);

  const used = suggestions.filter((s) => countsTowardCap(s.status as SuggestionStatus)).length;
  if (used >= election.maxOptionSuggestions) {
    return fail(`This election is not accepting more suggestions (maximum ${election.maxOptionSuggestions}).`, 409);
  }

  const [created] = await db
    .insert(optionSuggestions)
    .values({
      electionId: election.id,
      suggestedByVoterId: voter.id,
      title: v.title,
      normalizedTitle: normalizeTitle(v.title),
      description: v.description ?? null,
      imageUrl: v.imageUrl ?? null,
      imagePath: v.imagePath ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: optionSuggestions.id });

  if (!created) {
    return fail('This item has already been suggested or added. Please pick a different title.', 409);
  }

  try {
    await logAudit({
      actor: 'public',
      action: 'suggestion.submitted',
      electionId: election.id,
      meta: { suggestionId: created.id, hasImage: !!v.imageUrl },
    });
  } catch {
    // The suggestion is stored; a failed audit entry must not make the member resubmit.
    console.error('[suggestions] audit write failed');
  }
  return json({ ok: true, id: created.id });
}
