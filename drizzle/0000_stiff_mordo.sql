CREATE TYPE "public"."ats" AS ENUM('greenhouse', 'lever', 'ashby');--> statement-breakpoint
CREATE TYPE "public"."fetch_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('new', 'ignored', 'applied', 'referral_asked', 'replied', 'interviewing', 'rejected', 'offer');--> statement-breakpoint
CREATE TYPE "public"."location_match" AS ENUM('explicit', 'remote', 'unknown', 'none');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ats" "ats" NOT NULL,
	"slug" text NOT NULL,
	"careers_url" text,
	"priority" integer DEFAULT 2 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_fetch_status" "fetch_status",
	"last_fetch_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_priority_range" CHECK ("companies"."priority" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"source" "ats" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"is_remote" boolean DEFAULT false NOT NULL,
	"url" text NOT NULL,
	"apply_url" text NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"description_text" text,
	"match_score" integer DEFAULT 0 NOT NULL,
	"matched_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"location_match" "location_match" DEFAULT 'none' NOT NULL,
	"status" "job_status" DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"referrer_name" text,
	"notes" text,
	"next_action" text,
	"next_action_date" date,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"title_include" text[] DEFAULT '{}'::text[] NOT NULL,
	"title_exclude" text[] DEFAULT '{}'::text[] NOT NULL,
	"description_boost" text[] DEFAULT '{}'::text[] NOT NULL,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"include_remote" boolean DEFAULT true NOT NULL,
	"include_unknown_location" boolean DEFAULT true NOT NULL,
	"max_age_days" integer DEFAULT 3 NOT NULL,
	"min_notify_score" integer DEFAULT 2 NOT NULL,
	"telegram_chat_id" text,
	"quiet_start" time DEFAULT '22:00' NOT NULL,
	"quiet_end" time DEFAULT '08:00' NOT NULL,
	"digest_time" time DEFAULT '08:30' NOT NULL,
	"my_name" text DEFAULT '' NOT NULL,
	"my_portfolio_url" text DEFAULT '' NOT NULL,
	"my_availability_line" text DEFAULT '' NOT NULL,
	"my_stack_line" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tick_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"companies_fetched" integer DEFAULT 0 NOT NULL,
	"jobs_new" integer DEFAULT 0 NOT NULL,
	"jobs_notified" integer DEFAULT 0 NOT NULL,
	"errors" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_ats_slug_uq" ON "companies" USING btree ("ats","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_external_id_uq" ON "jobs" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "jobs_next_action_date_idx" ON "jobs" USING btree ("next_action_date");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");