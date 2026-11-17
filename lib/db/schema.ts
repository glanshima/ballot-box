import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// All primary keys are random v4 UUIDs (gen_random_uuid()).

/** Admins (including super admins). The first super admin is seeded from env by scripts/bootstrap-admin.ts. */
export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['super_admin', 'admin'] })
    .notNull()
    .default('admin'),
  /** Bumped on password change or role change; JWTs carrying an older value are rejected. */
  sessionVersion: integer('session_version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Single-use links for admin invites and password resets. Only the SHA-256 hash is stored. */
export const adminPasswordTokens = pgTable(
  'admin_password_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: text('purpose', { enum: ['reset', 'invite'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_password_tokens_admin_idx').on(t.adminId)],
);

export const elections = pgTable('elections', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type', { enum: ['candidate', 'poll'] }).notNull(),
  requireImages: boolean('require_images').notNull().default(false),
  opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['draft', 'open', 'closed', 'published'] })
    .notNull()
    .default('draft'),
  resultsPublic: boolean('results_public').notNull().default(false),
  liveResults: boolean('live_results').notNull().default(false),
  // Nomination form (candidate elections only; only accepts submissions while status = 'draft')
  nominationsEnabled: boolean('nominations_enabled').notNull().default(false),
  nominationsCloseAt: timestamp('nominations_close_at', { withTimezone: true }),
  nominationPositions: text('nomination_positions').array().notNull().default([]),
  requirePurchaseEvidence: boolean('require_purchase_evidence').notNull().default(false),
  nominationInstructions: text('nomination_instructions'),
  // Member-nominated mode (opt-in per election; 'self' keeps the original form).
  nominationMode: text('nomination_mode', { enum: ['self', 'member'] })
    .notNull()
    .default('self'),
  minNominators: integer('min_nominators').notNull().default(2),
  maxNominators: integer('max_nominators').notNull().default(3),
  consentHours: integer('consent_hours').notNull().default(72),
  maxOptionSuggestions: integer('max_option_suggestions').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Which delegated admins may manage which elections. */
export const electionAdmins = pgTable(
  'election_admins',
  {
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.electionId, t.adminId] }), index('election_admins_admin_idx').on(t.adminId)],
);

export const options = pgTable(
  'options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    imagePath: text('image_path'), // Blob pathname; used to detect shared/orphaned blobs
    position: text('position'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('options_election_idx').on(t.electionId)],
);

export const nominations = pgTable(
  'nominations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    position: text('position'),
    manifesto: text('manifesto'),
    photoUrl: text('photo_url').notNull(),
    photoPath: text('photo_path').notNull(),
    receiptUrl: text('receipt_url'), // evidence of nomination-form purchase (image or PDF)
    receiptPath: text('receipt_path'),
    receiptReference: text('receipt_reference'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by'),
    optionId: uuid('option_id').references(() => options.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('nominations_election_email_uq').on(t.electionId, t.email),
    index('nominations_election_idx').on(t.electionId),
  ],
);

export const voters = pgTable(
  'voters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    // SHA-256 hex of the raw token. The raw token is NEVER stored. Null until invited.
    tokenHash: text('token_hash').unique(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    inviteStatus: text('invite_status', { enum: ['pending', 'sent', 'failed', 'exported'] })
      .notNull()
      .default('pending'),
    hasVoted: boolean('has_voted').notNull().default(false),
    votedAt: timestamp('voted_at', { withTimezone: true }), // rounded to the day (ballot secrecy)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('voters_election_email_uq').on(t.electionId, t.email),
    index('voters_election_idx').on(t.electionId),
  ],
);

/**
 * BALLOT SECRECY: this table deliberately has NO voter_id and no reference of any
 * kind to `voters`. Ids are random UUIDs; `cast_bucket` is rounded to the hour.
 * `option_id` is NULL for an explicit abstention (position still recorded).
 */
export const ballots = pgTable(
  'ballots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id').references(() => options.id, { onDelete: 'cascade' }),
    position: text('position'),
    castBucket: timestamp('cast_bucket', { withTimezone: true }),
  },
  (t) => [index('ballots_election_idx').on(t.electionId)],
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  electionId: uuid('election_id'),
  meta: jsonb('meta').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Member nominations (nomination_mode = 'member') ----------

export const NOMINEE_STATUSES = [
  'collecting',
  'ready',
  'consent_sent',
  'accepted',
  'declined',
  'expired',
  'approved',
  'rejected',
] as const;

/** One-time codes proving a nominator's email is on the voter roll. Hashes only. */
export const memberOtps = pgTable(
  'member_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    emailHash: text('email_hash').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('member_otps_election_email_idx').on(t.electionId, t.emailHash)],
);

/** A person proposed for the ballot, plus consent and review state. */
export const nominees = pgTable(
  'nominees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    position: text('position'),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    status: text('status', { enum: NOMINEE_STATUSES }).notNull().default('collecting'),
    consentTokenHash: text('consent_token_hash').unique(),
    consentExpiresAt: timestamp('consent_expires_at', { withTimezone: true }),
    photoUrl: text('photo_url'),
    photoPath: text('photo_path'),
    bio: text('bio'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by'),
    optionId: uuid('option_id').references(() => options.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('nominees_election_position_email_uq').on(t.electionId, t.position, sql`lower(${t.email})`),
    // Poll suggestions have no position, and Postgres treats NULLs as distinct.
    uniqueIndex('nominees_election_email_poll_uq')
      .on(t.electionId, sql`lower(${t.email})`)
      .where(sql`${t.position} is null`),
    index('nominees_election_status_idx').on(t.electionId, t.status),
  ],
);

/** A verified member backing a nominee. `voter_id` is used only to dedupe. */
export const nominators = pgTable(
  'nominators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nomineeId: uuid('nominee_id')
      .notNull()
      .references(() => nominees.id, { onDelete: 'cascade' }),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    voterId: uuid('voter_id')
      .notNull()
      .references(() => voters.id, { onDelete: 'cascade' }),
    nominatorName: text('nominator_name'),
    nominatorEmail: text('nominator_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('nominators_nominee_voter_uq').on(t.nomineeId, t.voterId),
    index('nominators_election_idx').on(t.electionId),
  ],
);

/** Signatures and proof of membership. Base64 in Postgres: never publicly readable. */
export const nominationAttachments = pgTable(
  'nomination_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nominatorId: uuid('nominator_id')
      .notNull()
      .references(() => nominators.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['membership_proof', 'signature'] }).notNull(),
    contentType: text('content_type').notNull(),
    dataBase64: text('data_base64').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('nomination_attachments_nominator_idx').on(t.nominatorId)],
);

/** Poll items suggested by verified members; approved ones become options. */
export const optionSuggestions = pgTable(
  'option_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    suggestedByVoterId: uuid('suggested_by_voter_id').references(() => voters.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** Lower-cased, whitespace-collapsed title used for duplicate detection. */
    normalizedTitle: text('normalized_title').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    imagePath: text('image_path'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by'),
    optionId: uuid('option_id').references(() => options.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('option_suggestions_election_title_uq').on(t.electionId, t.normalizedTitle),
    index('option_suggestions_election_status_idx').on(t.electionId, t.status),
  ],
);

export type Admin = typeof admins.$inferSelect;
export type Election = typeof elections.$inferSelect;
export type Option = typeof options.$inferSelect;
export type Nomination = typeof nominations.$inferSelect;
export type Voter = typeof voters.$inferSelect;
export type MemberOtp = typeof memberOtps.$inferSelect;
export type Nominee = typeof nominees.$inferSelect;
export type NomineeStatus = (typeof NOMINEE_STATUSES)[number];
export type Nominator = typeof nominators.$inferSelect;
export type NominationAttachment = typeof nominationAttachments.$inferSelect;
export type OptionSuggestion = typeof optionSuggestions.$inferSelect;
