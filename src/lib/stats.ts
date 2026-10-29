/** Funnel counts shared by the Tracker strip, /stats and the digest. */
import { count } from "drizzle-orm";
import { db } from "@/db";
import { jobs, type JobStatus } from "@/db/schema";

export const FUNNEL: Array<{ status: JobStatus; label: string }> = [
  { status: "new", label: "new" },
  { status: "applied", label: "applied" },
  { status: "referral_asked", label: "referral asked" },
  { status: "replied", label: "replied" },
  { status: "interviewing", label: "interviewing" },
  { status: "offer", label: "offer" },
];

export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function funnelLine(counts: Record<string, number>): string {
  return FUNNEL.map((f) => `${f.label} ${counts[f.status] ?? 0}`).join(" · ");
}
