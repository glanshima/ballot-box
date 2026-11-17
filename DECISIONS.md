# Decisions

Where the brief was ambiguous or something had to change, the simplest consistent option was chosen and is recorded here.

## Roles and permissions (new requirement)

| Capability | Super admin | Admin (assigned to the election) |
|---|---|---|
| Create / delete elections (delete: drafts only) | yes | no |
| Create, deactivate, reset admins; assign admins to elections | yes | no |
| Edit title, description, type, times, options, images (draft) | yes | yes |
| Manage nomination form settings and review nominations (draft) | yes | yes |
| Enable member mode, set nominator limits and review member nominees (draft) | yes | yes |
| Send consent links, approve accepted nominees, review poll suggestions (draft) | yes | yes |
| Purge stored signatures and proofs | yes | **no** |
| Manage voters, send invitations, export links | yes | yes |
| Extend `closes_at` while open (audit-logged) | yes | yes |
| Launch (draft → open) | yes | yes |
| Close early, publish, choose public/private results | yes | **no** |
| Toggle `live_results` | yes | **no** |
| View results / export CSV or PDF (when visible per the rules) | yes | yes (read-only) |
| Modify ballots / results | **nobody** | **nobody** |

- "Without being able to alter results" is enforced three ways: (1) no code path anywhere updates or deletes ballot rows; (2) everything that controls *when and to whom* results appear (close, publish, public visibility, live view) is super-admin-only; (3) admins can only edit an election while it is a draft, when no ballots can exist.
- The super admin is a `role = 'super_admin'` row in `admins`, like any other admin; there can be several. `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` are read only by `npm run db:bootstrap`, which seeds the first one idempotently — login never consults env vars. The last active super admin cannot be deactivated or demoted.
- Admin sessions are JWTs (8h). Every admin is re-read from the database on each request (active flag, role, and `session_version`), so deactivation, role changes and password changes take effect immediately.
- **Password management**: `npm run db:bootstrap` is idempotent, but `-- --reset-password` is the break-glass path: it replaces the hash from env, sets `role = 'super_admin'` and `is_active = true`, and bumps `session_version`. It exists because email may be unconfigured and nobody may be able to sign in to issue a reset link; anyone able to run it already has database access. Admins change their own password from `/admin/account` (min 12 characters, bcrypt cost 12) and are signed out everywhere. Creation and resets use single-use links (`admin_password_tokens`, SHA-256 of a 32-byte token, 30 minutes, invalidated on issue/reuse). `/admin/forgot` answers identically whether or not the account exists. Resend is optional: super admins can copy a link when email is not configured.

## Nomination form

- Public page `/nominate/<electionId>`; candidate elections only; accepts submissions only while the election is a **draft** and before an optional `nominations_close_at`.
- Fields: name, email, phone, position (from a list the admin configures), manifesto, **photo (required)**, **evidence of form purchase (optional, can be made required per election)** as image/PDF plus an optional reference number.
- Admins approve → the nomination becomes an option (position, bio and photo copied; the photo blob is shared and only deleted once nothing references it). Pending nominations block launch, because options lock at launch.
- Public uploads are possible only through `/api/upload` while that election's nominations are open, rate-limited per IP, 2 MB, type-restricted by the Blob token. Submissions are rate-limited and Zod-validated, and the uploaded URL/path must be one of *our* blob URLs for *that* election.
- **Known limitation:** Vercel Blob objects served through public URLs are unlisted but not access-controlled. Receipts get unguessable random names and URLs are shown only to admins, but anyone holding a URL can fetch it. Do not collect anything more sensitive than a payment receipt.

## Member nominations, consent, suggestions and exports

- **Per-election opt-in, additive schema.** `elections.nomination_mode` defaults to `'self'`; the migration adds only tables and defaulted columns. The old build keeps serving traffic after it is applied. Existing elections are untouched until an admin switches a draft election to `member`.
- **Separate `nominees` / `nominators` / `option_suggestions` tables** instead of reusing `nominations`. The member flow has consent state, multiple nominators per nominee and a unique position; poll suggestions have no position or photo/consent. Keeping them separate avoids making the existing `nominations` columns nullable and keeps the old flow's constraints intact.
- **Nominator identity is the voter row.** `nominators.voter_id` exists only to dedupe and is never exposed on the ballot side. A member may nominate different people, and the same person for several positions; the unique constraint is `(nominee_id, voter_id)`. Self-nomination is refused case-insensitively.
- **OTP sessions are stateless.** Codes are HMAC-hashed with keys derived from `AUTH_SECRET`; the member cookie is a signed 30-minute payload scoped to one election and voter. No session table and no Auth.js session. Request responses are identical for roll and non-roll addresses.
- **Consent is an admin action.** A nominee becomes `ready` at `min_nominators`; only then can an admin send a hashed, single-use, `consent_hours`-lived link. Sending again rotates it. The nominee must add their own photo and optional bio, or decline. Approval is draft-only and inserts the option plus updates the nominee in one `db.batch`.
- **Attachments are private Postgres base64** (locked decision): proof of membership and signature, magic-byte verified, 2 MB cap. They are never public blobs. WebP proofs cannot be embedded by pdf-lib and are noted instead in the PDF.
- **Signature is drawn by default.** `SignaturePad` exports a trimmed white PNG; uploading a scan is always visible as an alternative. A blank canvas cannot be submitted.
- **Poll suggestions are capped and deduplicated.** Titles are normalised (trim, collapse whitespace, lower-case). Pending + approved suggestions count toward `max_option_suggestions`; rejected ones do not. Concurrent submissions can briefly exceed the cap; admin review is the final gate, the same scale assumption as the nominator race.
- **Exports are server-rendered where possible.** Results and nominations PDFs use `pdf-lib`; the results image is drawn client-side from data already on the page. The invitations PDF queries an explicit column whitelist (`name`, `email`, `inviteStatus`, `hasVoted`) with no token column, so links cannot leak. Row/attachment caps keep the functions inside `maxDuration = 60`.
- **Integrity reconciliation is read-only.** `lib/integrity.ts` re-derives `ballots = voted × positions` and position agreement. It never repairs or writes ballots.
- **Retention purge.** A super admin can delete all signatures/proofs for an election after typing its title; the count is audit-logged. This is the only path that removes already-stored member data, and it leaves nominees, votes and results intact.

## Other decisions

- **Server Actions for admin mutations instead of `/api/admin/*` JSON routes.** Each action re-checks the session and election access itself; middleware also guards `/admin` and `/api/admin`. Server Actions get built-in Origin/Host CSRF protection from Next.js, and middleware additionally requires same-origin on every unsafe method under `/admin` and `/api/admin`. Admin routes that need file responses (results export, link export) are real route handlers under `/api/admin`.
- **Atomic vote = single-statement CTE** over the Neon HTTP driver (not a WebSocket `Pool` transaction). One statement is atomic, needs no connection state and works on serverless. Ballot rows are inserted *from* the updated-voter CTE, so zero updated voters means zero ballots. Abstentions are stored as a ballot row with `option_id = NULL` and the position set.
- **`ballots.option_id` is nullable** to record explicit abstentions (needed so abstentions can be shown).
- **`voters.token_hash` is nullable** (unique when set): voters are imported first and get a token only when invited or exported.
- **"Export links as CSV" rotates tokens**, since only hashes are stored. By default it covers voters who are pending/failed; a checkbox includes everyone who hasn't voted. Re-sending to one voter likewise rotates.
- **Token expiry = election `closes_at`**, kept in sync if the closing time changes.
- **Next.js 15 (not 16)** so `middleware.ts` and the documented Auth.js v5 beta setup apply unchanged. **Tailwind 3** for stable config. Pinned drizzle-orm/drizzle-kit versions are a known-compatible pair.
- **Extra dependency: `bcryptjs`** (pure JS, works in serverless; native `argon2`/`bcrypt` can fail to build on Vercel). No CSV or chart libraries: a ~40-line CSV parser and CSS bars are used instead.
- **Public results page returns 404 (not 403) when hidden**, so it doesn't reveal that an election exists. `GET /api/results/[id]` returns 403 as specified.
- **ISR for published results**: `revalidate = 3600`, plus `revalidatePath` on publish so a cached "not available" page is replaced immediately.
- **CSP uses `'unsafe-inline'` for scripts/styles**, because Next.js inlines bootstrap scripts. A nonce-based CSP is the next hardening step.
- **Referrer-Policy is `no-referrer` site-wide** (superset of the `/vote/*` requirement).
- **Rate limiting has two failure policies.** Voter-facing presets (vote, token page, public results, admin password reset) use `checkLimit`, which fails **open** so an Upstash outage cannot stop voting. Presets for anything that sends email or accepts uploads (invitations, OTP request/verify, member nominations, suggestions, consent submissions, exports) use `checkLimitClosed`, which fails **closed**: with Upstash missing or unreachable those requests are refused. This is a deliberate availability/safety split; no new sensitive endpoint uses the fail-open helper.
- **Cron runs daily** (Vercel Hobby limit). This is safe because `castVote` enforces `opens_at..closes_at` itself with the database clock; the job only flips `status` so results can be reviewed.
- **Percentages** are shares of all ballots for a position, including abstentions. A tie for first place is flagged and no winner is highlighted.
- **Dates**: the browser submits ISO-8601 instants (local time → UTC), so no server time-zone guessing.
- **Migrations**: generate with `npm run db:generate` and commit `drizzle/`. The baseline (`drizzle/0000_curvy_stingray.sql`) is committed, so a fresh database is created with `npm run db:migrate` and CI fails if the schema drifts from the committed migrations (see README for the baseline procedure for databases created with `db:push`).
- **`pg` is a dev dependency** used only by `drizzle-kit migrate`; the application runtime keeps using the Neon HTTP driver (`@neondatabase/serverless`).
- **Orphaned blobs**: an image uploaded but never saved (admin abandons the form) is not cleaned up automatically. This is a rare, small leak; delete from the Blob dashboard if needed.

## Landing page and admin sign-in

- **`/` is the only administrator sign-in.** The landing page carries the login card; there is no separate admin login page and no "Go to Admin Login" link. `/admin/login` remains only as a `307` redirect to `/` (preserving `?changed`/`?expired`), middleware sends unauthenticated `/admin/*` visitors to `/`, and `requireAdminPage` sends an expired session to `/?expired=1`.
- **No redirect loop for stale JWTs.** `/` calls `getAdminUser()`, which re-reads the admin row, and only redirects a *database-valid* admin to `/admin`. A JWT that outlived a password/role change renders the login card with the expiry notice instead of bouncing between `/` and `/admin`.
- **"Remember me" is email recall only.** The checkbox keeps the admin email in `localStorage` (`ballotbox:admin-email`); the password is never stored anywhere and the session lifetime stays 8h. Unchecking it removes the saved email on the next submit.
- **Contact actions** are fixed: `https://wa.me/2348032105862` (new tab), `tel:+2348032105862`, `mailto:info@sidgakstech.me`.
- **The hero artwork is decorative.** `/branding/ballotbox-hero-bg.png` is rendered with `next/image` (`fill`, `priority`, `sizes="100vw"`); every heading, control and button is real HTML. A pale gradient wash keeps copy legible where the illustration sits behind it, and the two-column hero stacks below the `xl` breakpoint.
- **Password visibility** is a client-side `type` toggle; it never clears or edits the input, is keyboard accessible, and exposes "Show password"/"Hide password" with `aria-pressed`.
