# Member nominations, consent and suggestions

Member mode is an opt-in workflow for candidate elections and polls. It is off
unless an admin sets `nomination_mode = 'member'` on a **draft** election; every
existing election stays on `'self'` and keeps the original public nomination
form.

The vote path is untouched: member mode reads only `voters.email` / `voters.name`
to verify a nominator. Nothing here links `voters` to `ballots`, reads or writes
`voters.has_voted`, or changes ballot secrecy.

## Settings

All settings live on the election row and are editable while it is a draft.

| Setting | Default | Meaning |
|---|---|---|
| `nomination_mode` | `self` | `member` enables the verified-member flow |
| `nominations_enabled` | off | Must also be on for the public page to accept anything |
| `min_nominators` | 2 | Verified nominators needed before a nominee is `ready` (1–10) |
| `max_nominators` | 3 | Hard cap per nominee and position (1–10, `min <= max`) |
| `consent_hours` | 72 | Lifetime of a consent link |
| `max_option_suggestions` | 10 | Cap on pending + approved poll suggestions |
| `nomination_positions` | empty | Positions a member can nominate for |

Member nominations follow the same window as the self form: the election must be
a draft, `nominations_enabled` must be true, and the optional nominations closing
time must not have passed (`memberNominationsOpen` / `memberFlowOpen` in
`lib/election-rules.ts`).

## Who may nominate

A nominator proves they are on the voter roll with a one-time code:

1. `POST /api/nominations/otp/request` (`{ electionId, email }`). The response is
   always `{ ok: true }`, whether or not the address is on the roll, so the
   endpoint cannot be used to enumerate members. If the address is on the roll
   and the flow is open, a 6-digit CSPRNG code is emailed; previous unused codes
   for that address are invalidated. Codes are HMAC-hashed at rest and expire
   after 10 minutes.
2. `POST /api/nominations/otp/verify` (`{ electionId, email, code }`). Five wrong
   attempts exhaust the code. On success a signed, HttpOnly, `SameSite=Lax`,
   election-scoped cookie is issued for 30 minutes. It is a stateless HMAC
   payload; no session row is stored and Auth.js sessions are not used.
3. `POST /api/nominations/member` accepts the nomination form plus optional
   attachments, using that cookie.

Both OTP endpoints and the nomination endpoint check Origin, use `.strict()` Zod
schemas and fail-closed rate limits (`otpRequestIp`, `otpRequestEmail`,
`otpVerifyIp`, `otpVerifyEmail`, `nominate`).

### Nominator rules

- One member may nominate several different people and may nominate the same
  person for more than one position.
- A member cannot nominate themselves (`isSelfNomination`, case-insensitive).
- The unique constraint `nominators (nominee_id, voter_id)` stops the same member
  nominating the same nominee twice.
- The position is required when the election defines positions and must be one
  of them.
- The nominee is created once per `(election, position, lower(email))`; later
  nominators never overwrite the first name/phone entry.
- Submissions are refused with `409` once the nominee is at `max_nominators` or
  has moved past `ready` (`duplicate`, `full` or `closed`).
- Reaching `min_nominators` moves the nominee `collecting → ready`. It never
  moves back by itself; if storing attachments fails, the nominator row is
  removed and a `ready` nominee drops back to `collecting` when the count falls
  below the minimum.

## Attachments and the on-screen signature

Each nominator may attach:

- **Proof of membership** (optional): JPEG, PNG, WebP or PDF.
- **Signature** (optional): drawn on screen with `components/SignaturePad.tsx`
  (pointer events, device-pixel-ratio canvas, trimmed white PNG) or uploaded as a
  PNG/JPEG scan.

Both are limited to 2 MB, verified by magic bytes (`lib/nominations/attachments.ts`)
and stored as base64 in `nomination_attachments`. They are never served by a
public URL, never appear on the ballot, public results or the public results API,
and are readable only by admins through the nominations PDF. pdf-lib cannot embed
WebP proofs, so those are listed with a note in the PDF instead of being appended.

## Consent

When a nominee is `ready`, an admin of the election can send a consent link, one
at a time or in batches of 10 (550 ms apart for Resend). Consent can only be sent
while the election is a draft.

- The link contains a 32-byte random token; only its SHA-256 hash is stored
  (`nominees.consent_token_hash`, unique). Sending again rotates the token and
  invalidates the previous link.
- It expires after `consent_hours`. An expired link sets the nominee to
  `expired`; the admin can send a new one.
- `/consent/<token>` shows only the election title, the nominee's name and the
  position. It does not reveal nominators.
- Accepting requires a photo (uploaded through the existing `nomination-photo`
  kind) and allows a bio up to 1,500 characters. Declining records the decision.
- The token is single use: the decision update is conditional on
  `status = 'consent_sent'`, so a replay gets `409`.
- Only `accepted` nominees can be approved. Approval inserts the candidate
  option and marks the nominee `approved` in one `db.batch`. Rejection stores an
  optional note.

Statuses: `collecting → ready → consent_sent → accepted | declined | expired →
approved | rejected`. Once the election leaves draft, the list is frozen.

## Poll suggestions

For poll-type elections in member mode, the same verified-member session submits
a suggestion instead of a nomination (`POST /api/suggestions`):

- Title (2–200 chars), optional description and optional image.
- Titles are compared after trimming, collapsing whitespace and lower-casing
  (`normalizeTitle`); duplicates against existing options and suggestions are
  refused.
- The number of suggestions that are not `rejected` (pending + approved) is
  capped by `max_option_suggestions`.
- Admins review on the **Suggestions** tab while the poll is a draft. Approving
  inserts an option and links it to the suggestion in one batch; rejecting stores
  a note and deletes an unreferenced image.
- Concurrent submissions can briefly exceed the cap by the number in flight; at
  club scale this is acceptable and the admin review is the final gate.

## Exports

All exports are authenticated, rate-limited with the `api` preset, audited and
served with `Cache-Control: private, no-store`.

- **Results PDF** (`/api/admin/elections/<id>/results-pdf`): only when results
  are visible to admins. Includes the results payload SHA-256, turnout, per
  position tallies, tie notes and the integrity reconciliation report.
- **Nominations PDF** (`/api/admin/elections/<id>/nominations-pdf`): member mode
  appends proofs and signatures, up to 100 nominees, 80 attachments and 20 MB of
  attachments per document. Footers name the exporting admin and timestamp.
  Marked confidential.
- **Invitations status PDF** (`/api/admin/elections/<id>/invitations-pdf`):
  name, email, invite status and voted yes/no only. The query selects an explicit
  column whitelist, so it can never include links or token hashes. The audited
  CSV export remains the only way to obtain voting links.
- **Results image**: drawn in the browser from `/admin/.../results` and the
  public results page. PNG by default, JPEG optional, showing the title,
  timestamp and the same server-computed hash.

The existing audited results CSV remains available alongside the PDF.

## Privacy notice shown to nominators

> **What happens with this information**
>
> - Your verified member email is recorded with the nomination so organisers can
>   check that each nomination comes from a member.
> - The nominee's name, email and optional phone are shared with the election
>   organisers so they can ask the nominee for consent.
> - Proof of membership and signatures are private: only the organisers of this
>   election can see them. They never appear on the ballot or public results.
> - Records are kept until the election is complete and results are published.
>   Organisers may delete proof and signature files sooner.

The consent page tells the nominee that their email and the nominators' details
are never shown on the ballot.

## Retention and the purge action

`nomination_attachments` can contain the most sensitive data in the system.
Recommended retention: keep proofs and signatures only while the nomination is
being reviewed and the result may be challenged, then delete them.

A super admin sees **Delete signatures and proofs** on the Nominations tab when
attachments exist. The action:

1. requires the exact election title to be typed;
2. deletes every attachment for the election's nominators
   (`nomination.attachments_purged` in the audit log records the count);
3. leaves nominees, nominators, votes and results untouched.

Deleting an election cascades to nominees, nominators and attachments. Deleted
attachments cannot be restored except from a database backup/restore point.

## Deploy checklist (live system)

1. In Neon, create a branch or restore point of production and note its name.
2. Apply the additive migration with the pooled production URL:
   `DATABASE_URL="<prod pooled url>" npm run db:migrate`.
3. Confirm the five new tables and five new `elections` columns exist; confirm
   existing elections still have `nomination_mode = 'self'`.
4. Deploy the new build. Existing self-mode elections keep working unchanged.
5. On a throwaway draft candidate election, switch to member mode and smoke test:
   - request an OTP for a roll email and for a non-roll email (same response);
   - verify the code, nominate one person twice from different roll emails;
   - send consent, accept with a photo, approve the candidate;
   - launch, vote, close, publish;
   - export the results PDF, nominations PDF, invitations PDF and results image;
   - open the invitations PDF and confirm it contains no `/vote/` link or token.
6. Only then switch real elections to member mode (draft elections only).
7. If the rollout must be reversed, see the rollback SQL in
   [`docs/MIGRATIONS.md`](./MIGRATIONS.md). Rolling back discards all member-mode
   data.
