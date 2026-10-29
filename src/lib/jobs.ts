/** Status transitions shared by the Feed, Tracker and (later) the Telegram bot. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, type JobStatus } from "@/db/schema";
import { followUpDate } from "./dates";

export { ACTIONABLE_STATUSES, STATUS_LABELS } from "./job-status";

/**
 * Set a job's status. Marking applied (for the first time) also stamps applied_at and schedules
 * the "follow up" next action 3 working days out (IST). A manual ignore is remembered so
 * re-evaluation never flips it back.
 */
export async function setJobStatus(jobId: number, status: JobStatus, now: Date = new Date()): Promise<void> {
  const [current] = await db
    .select({ status: jobs.status, appliedAt: jobs.appliedAt })
    .from(jobs)
    .where(eq(jobs.id, jobId));
  if (!current) throw new Error(`job ${jobId} not found`);
  if (current.status === status) return;

  const patch: Partial<typeof jobs.$inferInsert> = { status, statusChangedAt: now, updatedAt: now };
  if (status === "ignored") patch.ignoreReason = "manual";
  else patch.ignoreReason = null;
  if (status === "applied" && !current.appliedAt) {
    patch.appliedAt = now;
    patch.nextAction = "follow up";
    patch.nextActionDate = followUpDate(now);
  }
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}
