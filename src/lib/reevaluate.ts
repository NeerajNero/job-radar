/**
 * Re-run evaluate() on jobs the user has not acted on (status new or ignored, never a manual
 * ignore) after settings change. Open jobs only unless includeClosed is set (used for backfills).
 */
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs, type IgnoreReason, type JobStatus } from "@/db/schema";
import { evaluate } from "./match";
import { loadSettings } from "./tick";

const UPDATE_PARALLELISM = 25;

export type ReevaluateResult = {
  scanned: number;
  changed: number;
  byStatus: Record<"new" | "ignored", number>;
  byReason: Record<IgnoreReason | "none", number>;
  durationMs: number;
};

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function reevaluateJobs(opts: { includeClosed?: boolean; now?: Date } = {}): Promise<ReevaluateResult> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const settings = await loadSettings();

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      isRemote: jobs.isRemote,
      postedAt: jobs.postedAt,
      descriptionText: jobs.descriptionText,
      firstSeenAt: jobs.firstSeenAt,
      matchScore: jobs.matchScore,
      matchedKeywords: jobs.matchedKeywords,
      locationMatch: jobs.locationMatch,
      status: jobs.status,
      ignoreReason: jobs.ignoreReason,
      priority: companies.priority,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        inArray(jobs.status, ["new", "ignored"] satisfies JobStatus[]),
        or(isNull(jobs.ignoreReason), ne(jobs.ignoreReason, "manual")),
        opts.includeClosed ? undefined : eq(jobs.isOpen, true),
      ),
    );

  const byStatus = { new: 0, ignored: 0 };
  const byReason: ReevaluateResult["byReason"] = { title: 0, location: 0, age: 0, manual: 0, none: 0 };
  const updates: Array<() => Promise<unknown>> = [];

  for (const r of rows) {
    const ev = evaluate(r, { priority: r.priority }, settings, now, r.firstSeenAt);
    byStatus[ev.status]++;
    byReason[ev.ignoreReason ?? "none"]++;
    const unchanged =
      ev.score === r.matchScore &&
      sameArray(ev.matchedKeywords, r.matchedKeywords) &&
      ev.locationMatch === r.locationMatch &&
      ev.status === r.status &&
      ev.ignoreReason === r.ignoreReason;
    if (unchanged) continue;
    updates.push(() =>
      db
        .update(jobs)
        .set({
          matchScore: ev.score,
          matchedKeywords: ev.matchedKeywords,
          locationMatch: ev.locationMatch,
          status: ev.status,
          ignoreReason: ev.ignoreReason,
          ...(ev.status !== r.status ? { statusChangedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(jobs.id, r.id)),
    );
  }

  for (let i = 0; i < updates.length; i += UPDATE_PARALLELISM) {
    await Promise.all(updates.slice(i, i + UPDATE_PARALLELISM).map((fn) => fn()));
  }

  return { scanned: rows.length, changed: updates.length, byStatus, byReason, durationMs: Date.now() - started };
}
