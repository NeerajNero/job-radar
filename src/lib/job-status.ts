/** Pure status constants, safe to import from client components (no DB import here). */
import type { JobStatus } from "@/db/schema";

export const ACTIONABLE_STATUSES: JobStatus[] = ["applied", "referral_asked", "replied", "interviewing", "rejected", "offer"];

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  ignored: "Ignored",
  applied: "Applied",
  referral_asked: "Referral asked",
  replied: "Replied",
  interviewing: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
};
