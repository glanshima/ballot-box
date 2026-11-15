import { NextResponse } from 'next/server';
import { checkLimit, getClientIp } from '@/lib/ratelimit';
import { hashToken } from '@/lib/tokens';
import { castVote, type CastResult } from '@/lib/voting';
import { voteSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const STATUS: Record<Extract<CastResult, { ok: false }>['code'], number> = {
  invalid: 404,
  expired: 410,
  not_open: 403,
  closed: 403,
  voted: 409,
  invalid_choice: 400,
};

export async function POST(request: Request) {
  const noStore = { 'Cache-Control': 'no-store' };
  try {
    // Same-origin only (the voter page is the only legitimate caller).
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore });
    }

    const ip = getClientIp(request.headers);
    if (!(await checkLimit('vote', ip))) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429, headers: noStore });
    }

    const parsed = voteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore });

    if (!(await checkLimit('voteToken', hashToken(parsed.data.token)))) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429, headers: noStore });
    }

    const result = await castVote(parsed.data.token, parsed.data.choices);
    if (result.ok) return NextResponse.json({ ok: true }, { headers: noStore });
    return NextResponse.json({ ok: false, code: result.code }, { status: STATUS[result.code], headers: noStore });
  } catch {
    // Never log the request body: it contains the token and the ballot.
    console.error('[vote] unexpected error');
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: noStore });
  }
}
