# Ballot Box

Small, secure online voting for clubs, associations and cooperatives, plus general polls. Runs on free tiers and deploys to Vercel.

- **Super admin** creates elections/polls and admin accounts, assigns admins to elections, and alone controls closing and publishing results.
- **Admins** set up and edit the elections assigned to them (name, times, options, images, nominations, voters, invitations). They can never alter results.
- **Voters** use one-time personal links (no accounts).
- **Aspirants** can submit a public **nomination form** with a photo and optional evidence of form purchase; admins approve them into candidates.

Stack: Next.js 15 (App Router, TypeScript strict), Tailwind 3, Neon Postgres + Drizzle, Auth.js (credentials), Zod, Upstash rate limiting, Resend, Vercel Blob, Vercel Cron, Vitest. See `DECISIONS.md` for every design decision.

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in values (see below)
npm run hash-password -- "your admin password"   # paste output into ADMIN_PASSWORD_HASH
npm run db:generate             # first time only: creates ./drizzle migrations; commit them
npm run db:migrate              # applies them (or `npm run db:push` for a throwaway dev DB)
npm run seed                    # optional demo election + poll + demo admin (prints voting links)
npm run dev
```

Sign in at `/admin/login` with `ADMIN_EMAIL` and your password. Without Upstash variables rate limiting is disabled (with a console warning); without Resend variables use **Export links as CSV**; without a Blob token image upload/delete is unavailable.

> `.env` files: each `$` in the bcrypt hash must be written `\$` (the `hash-password` script prints that form). In the Vercel dashboard paste it unescaped.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `TEST_DATABASE_URL` | Separate Neon branch for integration tests only |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | The super admin |
| `APP_URL` | Public URL, used in invitation links |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `BLOB_READ_WRITE_TOKEN` | Image storage |
| `CRON_SECRET` | Protects `/api/cron/close-elections` |

## How it works

1. **Super admin** → *Admins*: create admin accounts (share the initial password securely). *New election*: set details and tick the admins who manage it (or assign later on the election's *Admins* tab).
2. **Admin** → opens their election: edits details, adds options (candidates need a photo only if the election requires it; polls have an optional collapsed image field), imports voters from CSV with a preview, and optionally enables the **nomination form** and shares `/nominate/<electionId>`.
3. Review **Nominations** (approve → becomes a candidate), then **Launch**. Options, voters and times lock (the closing time can still be extended; this is audit-logged).
4. **Invitations**: email in batches, or *Export links as CSV*. Re-sending rotates that voter's token.
5. Voting happens at `/vote/<token>`: select → review → submit → "Vote recorded".
6. When voting ends (cron or the super admin closes early) the super admin **publishes** results and chooses whether the public page `/results/<electionId>` is visible. Admins can view results (read-only) once closed, and export a CSV whose SHA-256 is shown and stored in the audit log.

## Security model

- Tokens: 32 random bytes, URL-safe; only the SHA-256 hash is stored; single use; expire at the election close time.
- Atomic vote: a single SQL statement (data-modifying CTE) flips `has_voted` and inserts ballots together, checking token expiry and the open window with the database clock. Concurrent submissions with one token produce exactly one result.
- Results visibility and open/close windows are enforced only on the server.
- Rate limits on voting, token pages, login, nominations and uploads; Zod `.strict()` validation everywhere; CSRF via same-site cookies plus Origin checks; CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`; `/vote/*` and `/admin/*` are `no-store` + `noindex`.
- No raw tokens, full emails or ballot contents are logged.

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

Integration tests (including the 20-parallel-submission concurrency test) need a Neon test branch with the schema applied: `DATABASE_URL=$TEST_DATABASE_URL npm run db:push`.

## Deploy to Vercel

1. Push this repository to GitHub and **Import** it as a new Vercel project.
2. Add integrations/services: **Neon** (Vercel Marketplace; copy the *pooled* URL to `DATABASE_URL`), **Upstash Redis** (Marketplace), **Vercel Blob** (Storage tab → creates `BLOB_READ_WRITE_TOKEN`), **Resend** (API key + verified sender → `RESEND_API_KEY`, `EMAIL_FROM`).
3. Set the remaining env vars (`AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` unescaped, `APP_URL`, `CRON_SECRET`) for Production and Preview (use a separate Neon branch for Preview).
4. Run migrations against the production database from your machine: `DATABASE_URL=<prod pooled url> npm run db:migrate`. Optionally seed demo data (`npm run seed`), then delete it.
5. Deploy. Verify: `/admin/login` works; create an election; upload an image; send or export a link; vote; close and publish.
6. Cron: Vercel → Project → Settings → Cron Jobs shows `/api/cron/close-elections`. Test with `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/close-elections` (expect `{"closed":0}` or a count).
