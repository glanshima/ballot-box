# Ballot Box

Small, secure online voting for clubs, associations and cooperatives, plus general polls. Runs on free tiers and deploys to Vercel.

- **Super admin** creates elections/polls and admin accounts, assigns admins to elections, and alone controls closing and publishing results.
- **Admins** set up and edit the elections assigned to them (name, times, options, images, nominations, voters, invitations). They can never alter results.
- **Voters** use one-time personal links (no accounts).
- **Aspirants** can submit a public **nomination form** with a photo and optional evidence of form purchase; admins approve them into candidates.
- **Member mode** (opt-in per election) lets verified members nominate candidates with proof of membership and an on-screen signature, and lets nominees accept or decline through a single-use consent link. Polls in member mode accept member-suggested items for admin approval. See [`docs/NOMINATIONS.md`](docs/NOMINATIONS.md).
- **Exports**: results, nominations and an invitations status report as PDF; results also as PNG/JPEG. The invitations report never contains voting links.

Stack: Next.js 15 (App Router, TypeScript strict), Tailwind 3, Neon Postgres + Drizzle, Auth.js (credentials), Zod, Upstash rate limiting, Resend, Vercel Blob, Vercel Cron, pdf-lib, Vitest. See `DECISIONS.md` for every design decision.

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in values (see below)
npm run hash-password -- "your admin password"   # paste output into ADMIN_PASSWORD_HASH
npm run db:generate             # first time only: creates ./drizzle migrations; commit them
npm run db:migrate              # applies them (or `npm run db:push` for a throwaway dev DB)
npm run db:bootstrap            # creates the first super admin from ADMIN_EMAIL / ADMIN_PASSWORD_HASH (idempotent)
                                # `npm run db:bootstrap -- --reset-password` replaces that admin's password from env
                                # and (re)grants super-admin access
npm run seed                    # optional demo election + poll + demo admin (prints voting links)
npm run dev
```

Sign in at `/` with your admin email and password — the landing page is the only administrator sign-in (the old `/admin/login` route redirects there). Admins are database rows: super admins can promote other admins and issue one-time password links. `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` are read only by `db:bootstrap`; login never consults them. Without Upstash variables rate limiting is disabled (with a console warning); without Resend variables use **Export links as CSV** and hand out reset links manually; without a Blob token image upload/delete is unavailable.

> `.env` files: each `$` in the bcrypt hash must be written `\$` (the `hash-password` script prints that form). In the Vercel dashboard paste it unescaped.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `TEST_DATABASE_URL` | Separate Neon branch for integration tests only |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | Bootstrap only: seed the first super admin (`npm run db:bootstrap`). Rotate a password from `/admin/account`, or if locked out use `db:bootstrap -- --reset-password` (also restores super-admin access). |
| `APP_URL` | Public URL, used in invitation links |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `BLOB_READ_WRITE_TOKEN` | Image storage |
| `CRON_SECRET` | Protects `/api/cron/close-elections` |

## Email (Resend)

Sending domain: `ballotbox.sidgakstech.me`, a subdomain so the root domain's Zoho SPF (`v=spf1 include:zohomail.com -all`) is left alone.

1. Resend → **Domains** → **Add domain**: `ballotbox.sidgakstech.me`, region `us-east-1` (use the region Resend shows in the records).
2. Add the records Resend displays at the DNS provider (Namecheap for `sidgakstech.me`). The DKIM value is unique per domain; the others are:

   | Type | Host (Namecheap) | Value |
   |---|---|---|
   | MX | `send.ballotbox` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
   | TXT | `send.ballotbox` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey.ballotbox` | the `p=MIGf...` DKIM key Resend shows |

   Optionally add `TXT _dmarc.ballotbox` = `v=DMARC1; p=none;` to start collecting DMARC reports. Namecheap's **Host** field takes the part before `.sidgakstech.me`.
3. Wait for **Verified**, then create an API key scoped to this domain (**Sending access**).
4. Set `RESEND_API_KEY` and `EMAIL_FROM="Ballot Box <no-reply@ballotbox.sidgakstech.me>"` in Vercel (Production and Preview) and locally; keep `APP_URL=https://ballotbox.sidgakstech.me` so invitation and reset links use the custom domain.
5. Verify: `npm run email:test -- you@example.com` sends through the same env vars as the app and prints the Resend message id. Without the two variables, invitations must be exported as CSV and password-reset links copied by hand — the app never pretends an email was sent.

## How it works

1. **Super admin** → *Admins*: create an admin and copy the one-time link shown (they set their own password; links expire after 30 minutes and work once). *New election*: set details and tick the admins who manage it (or assign later on the election's *Admins* tab).
2. **Admin** → opens their election: edits details, adds options (candidates need a photo only if the election requires it; polls have an optional collapsed image field), imports voters from CSV with a preview, and optionally enables the **nomination form** and shares `/nominate/<electionId>`.
3. Review **Nominations** (approve → becomes a candidate), then **Launch**. Options, voters and times lock (the closing time can still be extended; this is audit-logged).
4. **Invitations**: email in batches, or *Export links as CSV*. Re-sending rotates that voter's token.
5. Voting happens at `/vote/<token>`: select → review → submit → "Vote recorded".
6. When voting ends (cron or the super admin closes early) the super admin **publishes** results and chooses whether the public page `/results/<electionId>` is visible. Admins can view results (read-only) once closed, and export a CSV whose SHA-256 is shown and stored in the audit log.

### Member mode (opt-in per draft election)

Switch `nomination_mode` to `member` on the Details tab. Members verify their roll email with a one-time code, nominate a person for a position (with optional proof of membership and an on-screen signature), and the nominee accepts or declines a single-use consent link before an admin can approve them onto the ballot. Minimum/maximum nominator counts, consent lifetime and the poll-suggestion cap are per-election settings. Poll elections in member mode accept member-suggested items with duplicate detection and admin review. Full flow, privacy text, retention and the super-admin attachment purge are in [`docs/NOMINATIONS.md`](docs/NOMINATIONS.md).

## Security model

- Tokens: 32 random bytes, URL-safe; only the SHA-256 hash is stored; single use; expire at the election close time.
- Atomic vote: a single SQL statement (data-modifying CTE) flips `has_voted` and inserts ballots together, checking token expiry and the open window with the database clock. Concurrent submissions with one token produce exactly one result.
- Results visibility and open/close windows are enforced only on the server.
- Rate limits on voting, token pages, login, nominations, uploads, OTP requests and exports; Zod `.strict()` validation everywhere; CSRF via same-site cookies plus Origin checks; CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`; `/vote/*` and `/admin/*` are `no-store` + `noindex`.
- Member verification uses HMAC-hashed one-time codes (10-minute expiry, 5 attempts) and a signed, HttpOnly, 30-minute election-scoped cookie. OTP responses never reveal whether an address is on the roll.
- Proof-of-membership files and signatures are stored privately in Postgres (never public URLs), magic-byte verified, capped at 2 MB, and included only in the authenticated nominations PDF. A super admin can purge them per election, audit-logged.
- New email, upload and OTP rate-limit presets **fail closed** when Upstash is missing or unreachable. Voter-facing vote/token/read presets still fail open so an Upstash outage cannot stop voting.
- The invitations status PDF selects an explicit column whitelist, so it can never contain voting links or token hashes.
- No raw tokens, full emails or ballot contents are logged.

## Security documentation

- [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) — controls and residual risks.
- [`docs/NOMINATIONS.md`](docs/NOMINATIONS.md) — member flow, privacy text and retention.
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) — additive migration and rollback SQL.

### Ballot secrecy: residual trust assumption

`ballots` has no voter id and no link to `voters`; ids are random UUIDs; timestamps are bucketed to the hour; `voters.voted_at` is rounded to the day. **An administrator with raw database access and server/provider logs could still attempt to correlate votes with voters** (for example through request timing in platform logs). This is suitable for club, association and cooperative elections, **not** for high-stakes public elections.

## Free-tier limits to know

- Vercel Hobby is for non-commercial use; crons run at most daily (safe: vote acceptance never depends on the cron).
- Blob free allowance is small (~1 GB, ~10k reads, ~2k writes/month; exceeding it blocks access for ~30 days). Images are compressed in the browser to ≤800 px / ~200 KB, served through `next/image`, and deleted when options, nominations or elections are removed.
- Resend free tier has a low daily limit: invitations are sent in batches with per-voter status; use the CSV export as fallback.
- Use separate Neon branches for Preview and Production.

## Tests

```bash
npm run test:unit      # no database needed
npm test               # also runs integration tests if TEST_DATABASE_URL is set
```

Integration tests (including the 20-parallel-submission concurrency test) need a Neon test branch with the schema applied: `DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate`. They use the Neon HTTP driver, so a plain local PostgreSQL instance cannot run them. `tests/integration/nominations.test.ts` covers the member-mode unique constraints, nominator counting, the consent flow and export permissions, and is skipped when `TEST_DATABASE_URL` is absent.

### Existing database created with `db:push`

The baseline migration creates every table, so running `npm run db:migrate` against a database that already has the schema (created earlier with `db:push`) fails with "relation already exists". Record the baseline as applied first, then future migrations run normally:

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
VALUES ('2409091ad8732a201abbfea87db51eb163b2c269cbf9d977b71d2f56c0d3182f', 1794757471374);
```

The hash is the SHA-256 of `drizzle/0000_curvy_stingray.sql`; `created_at` is the `when` value from `drizzle/meta/_journal.json`. Confirm the existing schema matches (`npm run db:push` can reconcile it) before baselining.

## Deploy to Vercel

1. Push this repository to GitHub and **Import** it as a new Vercel project.
2. Add integrations/services: **Neon** (Vercel Marketplace; copy the *pooled* URL to `DATABASE_URL`), **Upstash Redis** (Marketplace), **Vercel Blob** (Storage tab → creates `BLOB_READ_WRITE_TOKEN`), **Resend** (API key + verified sender → `RESEND_API_KEY`, `EMAIL_FROM`).
3. Set the remaining env vars (`AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` unescaped, `APP_URL`, `CRON_SECRET`) for Production and Preview (use a separate Neon branch for Preview).
4. Run migrations against the production database from your machine: `DATABASE_URL=<prod pooled url> npm run db:migrate`, then seed the first super admin: `DATABASE_URL=<prod pooled url> npm run db:bootstrap`. Optionally seed demo data (`npm run seed`), then delete it.
5. Deploy. Verify: `/` loads the landing page and admin sign-in works; create an election; upload an image; send or export a link; vote; close and publish. For member mode, follow the smoke test in [`docs/NOMINATIONS.md`](docs/NOMINATIONS.md#deploy-checklist-live-system) on a throwaway election before switching real elections.
6. Cron: Vercel → Project → Settings → Cron Jobs shows `/api/cron/close-elections`. Test with `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/close-elections` (expect `{"closed":0}` or a count).
7. After confirming the super admin can sign in, `ADMIN_PASSWORD_HASH` is no longer needed at runtime. Keep or remove it deliberately: `db:bootstrap` is the only reader. If you are ever locked out, generate a new hash, set `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`, and run `DATABASE_URL=<prod pooled url> npm run db:bootstrap -- --reset-password`. That is the break-glass path: it sets the password, makes the account an active super admin, and signs out its existing sessions.
