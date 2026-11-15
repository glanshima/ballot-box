# Decisions

Where the brief was ambiguous or something had to change, the simplest consistent option was chosen and is recorded here.

## Roles and permissions (new requirement)

| Capability | Super admin | Admin (assigned to the election) |
|---|---|---|
| Create / delete elections (delete: drafts only) | yes | no |
| Create, deactivate, reset admins; assign admins to elections | yes | no |
| Edit title, description, type, times, options, images (draft) | yes | yes |
| Manage nomination form settings and review nominations (draft) | yes | yes |
| Manage voters, send invitations, export links | yes | yes |
| Extend `closes_at` while open (audit-logged) | yes | yes |
| Launch (draft → open) | yes | yes |
| Close early, publish, choose public/private results | yes | **no** |
| Toggle `live_results` | yes | **no** |
| View results / export CSV (when visible per the rules) | yes | yes (read-only) |
| Modify ballots / results | **nobody** | **nobody** |

- "Without being able to alter results" is enforced three ways: (1) no code path anywhere updates or deletes ballot rows; (2) everything that controls *when and to whom* results appear (close, publish, public visibility, live view) is super-admin-only; (3) admins can only edit an election while it is a draft, when no ballots can exist.
- The super admin is the single account in env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`). Delegated admins live in the `admins` table (bcrypt hashes) and are linked to elections via `election_admins`.
- Admin sessions are JWTs (8h). Delegated admins are re-checked against the database on every request, so deactivating one takes effect immediately.

## Nomination form

- Public page `/nominate/<electionId>`; candidate elections only; accepts submissions only while the election is a **draft** and before an optional `nominations_close_at`.
- Fields: name, email, phone, position (from a list the admin configures), manifesto, **photo (required)**, **evidence of form purchase (optional, can be made required per election)** as image/PDF plus an optional reference number.
- Admins approve → the nomination becomes an option (position, bio and photo copied; the photo blob is shared and only deleted once nothing references it). Pending nominations block launch, because options lock at launch.
- Public uploads are possible only through `/api/upload` while that election's nominations are open, rate-limited per IP, 2 MB, type-restricted by the Blob token. Submissions are rate-limited and Zod-validated, and the uploaded URL/path must be one of *our* blob URLs for *that* election.
- **Known limitation:** Vercel Blob objects served through public URLs are unlisted but not access-controlled. Receipts get unguessable random names and URLs are shown only to admins, but anyone holding a URL can fetch it. Do not collect anything more sensitive than a payment receipt.

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
- **Rate limiter fails open** if Upstash is unreachable (voters are not locked out by an outage) and is a no-op with a console warning when env vars are missing.
- **Cron runs daily** (Vercel Hobby limit). This is safe because `castVote` enforces `opens_at..closes_at` itself with the database clock; the job only flips `status` so results can be reviewed.
- **Percentages** are shares of all ballots for a position, including abstentions. A tie for first place is flagged and no winner is highlighted.
- **Dates**: the browser submits ISO-8601 instants (local time → UTC), so no server time-zone guessing.
- **Migrations**: generate with `npm run db:generate` and commit `drizzle/` (see README). They were not pre-generated because the project was written without network access to install drizzle-kit.
- **Orphaned blobs**: an image uploaded but never saved (admin abandons the form) is not cleaned up automatically. This is a rare, small leak; delete from the Blob dashboard if needed.
