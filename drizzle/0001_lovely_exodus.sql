CREATE TYPE "public"."ignore_reason" AS ENUM('title', 'location', 'age', 'manual');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ignore_reason" "ignore_reason";