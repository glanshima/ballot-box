CREATE TABLE "member_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nomination_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nominator_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nominators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nominee_id" uuid NOT NULL,
	"election_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"nominator_name" text,
	"nominator_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nominators_nominee_voter_uq" UNIQUE("nominee_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "nominees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"position" text,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'collecting' NOT NULL,
	"consent_token_hash" text,
	"consent_expires_at" timestamp with time zone,
	"photo_url" text,
	"photo_path" text,
	"bio" text,
	"accepted_at" timestamp with time zone,
	"review_note" text,
	"reviewed_by" text,
	"option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nominees_consent_token_hash_unique" UNIQUE("consent_token_hash")
);
--> statement-breakpoint
CREATE TABLE "option_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"suggested_by_voter_id" uuid,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"description" text,
	"image_url" text,
	"image_path" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_suggestions_election_title_uq" UNIQUE("election_id","normalized_title")
);
--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "nomination_mode" text DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "min_nominators" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "max_nominators" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "consent_hours" integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "max_option_suggestions" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_otps" ADD CONSTRAINT "member_otps_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomination_attachments" ADD CONSTRAINT "nomination_attachments_nominator_id_nominators_id_fk" FOREIGN KEY ("nominator_id") REFERENCES "public"."nominators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominators" ADD CONSTRAINT "nominators_nominee_id_nominees_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."nominees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominators" ADD CONSTRAINT "nominators_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominators" ADD CONSTRAINT "nominators_voter_id_voters_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominees" ADD CONSTRAINT "nominees_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominees" ADD CONSTRAINT "nominees_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_suggestions" ADD CONSTRAINT "option_suggestions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_suggestions" ADD CONSTRAINT "option_suggestions_suggested_by_voter_id_voters_id_fk" FOREIGN KEY ("suggested_by_voter_id") REFERENCES "public"."voters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_suggestions" ADD CONSTRAINT "option_suggestions_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_otps_election_email_idx" ON "member_otps" USING btree ("election_id","email_hash");--> statement-breakpoint
CREATE INDEX "nomination_attachments_nominator_idx" ON "nomination_attachments" USING btree ("nominator_id");--> statement-breakpoint
CREATE INDEX "nominators_election_idx" ON "nominators" USING btree ("election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nominees_election_position_email_uq" ON "nominees" USING btree ("election_id","position",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "nominees_election_email_poll_uq" ON "nominees" USING btree ("election_id",lower("email")) WHERE "nominees"."position" is null;--> statement-breakpoint
CREATE INDEX "nominees_election_status_idx" ON "nominees" USING btree ("election_id","status");--> statement-breakpoint
CREATE INDEX "option_suggestions_election_status_idx" ON "option_suggestions" USING btree ("election_id","status");