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

export type Admin = typeof admins.$inferSelect;
export type Election = typeof elections.$inferSelect;
export type Option = typeof options.$inferSelect;
export type Nomination = typeof nominations.$inferSelect;
export type Voter = typeof voters.$inferSelect;
