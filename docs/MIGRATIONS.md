# Migrations

Migrations are generated with `npm run db:generate` and applied with
`npm run db:migrate` against the database in `DATABASE_URL`.

## 0004 — member nominations (additive)

`drizzle/0004_optimal_richard_fisk.sql`

Adds:

- `elections.nomination_mode` (`'self' | 'member'`, default `'self'`),
  `min_nominators` (2), `max_nominators` (3), `consent_hours` (72),
  `max_option_suggestions` (10).
- `member_otps`, `nominees`, `nominators`, `nomination_attachments`,
  `option_suggestions`.

Every change is additive: new tables and new columns with defaults. The
pre-0004 application keeps working unchanged after this migration is applied,
so it is safe to migrate before deploying the new build.

### Before applying to production

1. In the Neon console, create a branch or restore point of the production
   database and note its name/timestamp.
2. Apply with the pooled production URL:

   ```sh
   DATABASE_URL="<prod pooled url>" npm run db:migrate
   ```

3. Confirm the five tables exist and the five `elections` columns are present:

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('member_otps','nominees','nominators','nomination_attachments','option_suggestions');

   SELECT column_name, column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'elections'
     AND column_name IN ('nomination_mode','min_nominators','max_nominators','consent_hours','max_option_suggestions');
   ```

   Existing elections must still report `nomination_mode = 'self'`.

4. Deploy the build that contains this code. Member mode stays dormant until an
   admin switches a draft election; the pre-0004 build keeps working if the
   migration is applied first.

Do not run `npm run seed`, `db:push`, or integration tests against production.

### Rollback (destructive)

Only for returning to the pre-0004 build. Take a restore point first; this
discards all member-nomination data.

```sql
DROP TABLE IF EXISTS "option_suggestions";
DROP TABLE IF EXISTS "nomination_attachments";
DROP TABLE IF EXISTS "nominators";
DROP TABLE IF EXISTS "nominees";
DROP TABLE IF EXISTS "member_otps";

ALTER TABLE "elections" DROP COLUMN IF EXISTS "max_option_suggestions";
ALTER TABLE "elections" DROP COLUMN IF EXISTS "consent_hours";
ALTER TABLE "elections" DROP COLUMN IF EXISTS "max_nominators";
ALTER TABLE "elections" DROP COLUMN IF EXISTS "min_nominators";
ALTER TABLE "elections" DROP COLUMN IF EXISTS "nomination_mode";
```

Then remove the `0004` entry from `drizzle/__drizzle_migrations` if the
database must accept the old migration history. Prefer restoring the Neon
branch instead of editing that table by hand.
