CREATE TYPE "public"."message_kind" AS ENUM('alert', 'digest', 'reply', 'held');--> statement-breakpoint
CREATE TABLE "messages_sent" (
	"id" serial PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "message_kind" NOT NULL,
	"job_id" integer,
	"chat_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages_sent" ADD CONSTRAINT "messages_sent_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_sent_sent_at_idx" ON "messages_sent" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "messages_sent_job_id_idx" ON "messages_sent" USING btree ("job_id");