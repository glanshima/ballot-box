# Security audit

A control-by-control description of the current build, including the member
nomination features added after the original voting system. It records what the
code does, not a claim that every control was penetration-tested. Commands that
were actually run are listed at the end.

## Scope

- Public: `/`, `/nominate/<electionId>`, `/consent/<token>`, `/vote/<token>`,
  `/results/<electionId>` and their APIs.
- Admin: `/admin/**` and `/api/admin/**`.
- Cron: `/api/cron/close-elections`.

## Authentication and authorization

- **Admin login** is credentials-only (bcrypt, cost 12) with a dummy-hash compare
  for unknown emails so response timing does not reveal accounts. Sessions are
  JWTs valid for 8 hours.
- **Every admin request re-reads the admin row** (`getAdminUser`): `is_active`,
  `role` and `session_version` are checked against the token. Deactivation, role
  changes and password changes take effect immediately, not after 8 hours.
- `/admin/**` and `/api/admin/**` are guarded by middleware and again by
  `requireAdminPage` / `requireAdminAction`. Election-scoped work goes through
  `requireElectionPage` / `requireElectionAction`, which call `electionFor`:
  super admins may manage every election; a plain admin only elections linked in
  `election_admins`; everyone else gets a 404 (not a 403 that would confirm the
  election exists).
- Super-admin-only mutations (close, publish, delete, admin management, election
  assignments, attachment purge) call `requireSuperAction` and re-check inside
  the action.
- The last active super admin cannot be deactivated or demoted
  (`isLastActiveSuperAdmin`).
- Password resets use single-use 30-minute tokens stored as SHA-256 hashes; the
  forgot-password endpoint answers identically for known and unknown addresses.
- **No MFA/TOTP is implemented in this codebase.** The implementation brief
  referred to preserving MFA, but no MFA existed before this work; nothing was
  removed, and adding it remains a follow-up.

## Voting and ballot secrecy

- Voting tokens are 32 random bytes (base64url); only the SHA-256 hash is stored;
  they are single-use and expire at the election's `closes_at`.
- Vote submission is a single data-modifying CTE on the Neon HTTP driver: the
  voter row is flipped (`has_voted`) and ballot rows are inserted in the same
  statement, with the open window evaluated by the database clock. Twenty
  parallel submissions with one token produce exactly one accepted vote.
- `ballots` has no voter reference, no voter id, random ids, and timestamps
  bucketed to the hour; `voters.voted_at` is rounded to the day.
- Member mode does not touch this path. It reads `voters.email` / `voters.name`
  only to verify nominators; it never reads or writes `has_voted`.

## Member verification and consent

- OTP codes are 6 digits from a CSPRNG, hashed with HMAC-SHA256 keys derived from
  `AUTH_SECRET` (HKDF). Stored values are email and code hashes, never the code.
  Codes expire after 10 minutes, allow 5 attempts, and issuing a new one
  invalidates earlier unused codes.
- `POST /api/nominations/otp/request` returns `{ ok: true }` for roll and non-roll
  addresses alike; whether an email was actually sent is recorded only in the
  audit metadata as a boolean. This prevents voter-roll enumeration.
- The member session is a signed HMAC payload in an HttpOnly, `SameSite=Lax`
  cookie, `Secure` in production, scoped to one election and voter, valid for 30
  minutes. No server-side session row exists.
- All public submission endpoints require `Origin` to equal the request origin in
  addition to `SameSite` cookies, and validate bodies with `.strict()` Zod
  schemas.
- Consent tokens are 32 random bytes; only the SHA-256 hash is stored, unique per
  nominee. They expire after `consent_hours`, are rotated on resend, and the
  decision update is conditional on `status = 'consent_sent'`, so replay and
  concurrent use produce a single decision.
- Consent decisions are only accepted while the election is a draft in member
  mode. The consent page reveals only the election title, nominee name and
  position, never the nominators.
- The nominee's photo must be one of our Blob uploads for that election
  (`isOwnUpload`), not an arbitrary URL.

## Attachments and uploads

- Public uploads go through `/api/upload`, which checks Origin, rate-limits
  (fail closed), and issues client tokens scoped by content type, size and Blob
  path prefix for the election and upload kind.
- Membership proofs and signatures do not use public Blob URLs. They are checked
  by magic bytes (`lib/nominations/attachments.ts`), capped at 2 MB, and stored as
  base64 in `nomination_attachments`. They are readable only through the
  authenticated nominations PDF; no public route or API returns them.
- Signatures may be JPEG/PNG only. Membership proofs may also be WebP/PDF.
- The on-screen signature pad cannot submit a blank canvas; the uploaded-scan
  alternative remains available.

## Rate limiting

`lib/ratelimit.ts` has two policies:

- `checkLimit` fails **open** when Upstash is missing or unreachable. It is used
  only by voter-facing endpoints (vote, voter token page, public results, admin
  password reset) so an outage cannot stop an election.
- `checkLimitClosed` fails **closed**. It is used by everything that sends email
  or accepts uploads/submissions: invitations, OTP request/verify, member
  nominations, suggestions, consent decisions and the PDF export routes.

Presets: vote 10/min per IP; vote token 5/min; token pages 30/min; login 8/10min
per IP and per email; nominations 5/10min; uploads 30/10min; OTP request
5/15min per IP and per election+email hash; OTP verify 10/15min; email sends
6/10min per admin; consent submissions 10/10min; API/export reads 60/min; password
reset 3/hour.

## Exports

- All export routes call `getAdminUser` (401), then `electionFor` (404), then the
  `api` rate limit, then audit the export. Responses are
  `Cache-Control: private, no-store` with attachment filenames.
- Results PDF is gated by `loadResultsForViewer(id, 'admin')`, the same rule as
  the admin results page.
- Invitations PDF selects an explicit column whitelist: `name`, `email`,
  `inviteStatus`, `hasVoted`. There is no token column in the query, so links
  cannot appear. This is covered by a unit test.
- Nominations PDF is limited to 100 nominees, 80 attachments and 20 MB of
  attachments per document to stay inside the function timeout. Appended PDF
  pages are copied without the narrative footer; the outer document is marked
  confidential and names the exporter.
- Results images are rendered from data already loaded for a viewer who is
  allowed to see results; the server-computed SHA-256 is displayed on the image.

## Audit logging

`audit_log` is append-only by convention: actions only insert. Member-mode events
include OTP requested/failed/verified, nomination added/rejected, consent
sent/accepted/declined/expired, nominee approve/reject, suggestion
submit/approve/reject, PDF exports and attachment purge. Tokens, raw codes, full
voter emails and ballot contents are never written to audit metadata; hashed
identifiers are used where correlation is needed.

## Residual risks and limitations

- **Signatures are club-level records, not legal e-signatures.** There is no
  identity document check, certificate, timestamp authority or tamper-evident
  seal. Treat them as evidence that a member drew/uploaded something while
  verified on the roll.
- Anyone who can read an election's roll email can pass verification for that
  address. This is inherent to email-based membership proof.
- A database operator can read `nomination_attachments` in plain base64. The
  control is access control, not encryption at rest beyond the database
  provider's disk encryption.
- WebP proofs cannot be embedded by pdf-lib; the PDF lists them with a note.
  Appended PDF pages are included up to 5 pages per attachment.
- Poll suggestion cap and nominator maximum are enforced inside single
  statements, but concurrent submissions can overshoot briefly at very high
  concurrency. The admin review is the final gate.
- `ballots` secrecy still has the documented residual timing-correlation risk for
  someone with raw database and provider-log access.
- CSP still allows `'unsafe-inline'` for scripts and styles (Next.js bootstrap);
  nonces are a follow-up. MFA/TOTP is a follow-up.
- Published results are cached with ISR for an hour; publishing calls
  `revalidatePath` so the page updates immediately, but a CDN edge could still
  serve a brief stale copy.

## What was actually run

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (warnings only, unused server-action parameters).
- `npm run test:unit` — 76 tests passed.
- `npm run build` — succeeded for the phases that introduced the export and
  member-mode code.
- `npm test` — 112 tests passed, including the 36 integration tests, against a
  dedicated Neon branch (`integration-test`, empty `ballotbox_test` database
  migrated from scratch with `db:test:migrate`). The branch is a child of
  production but the tests never use its `neondb` copy.
