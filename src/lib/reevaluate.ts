/**
 * Re-run evaluate() on jobs the user has not acted on (status new or ignored, never a manual
 * ignore) after settings change. Bounded to open jobs first seen in the last 30 days and processed
 * in batches of 200 so the runtime stays flat as the company list grows. includeClosed lifts both
 * bounds (backfills only).
 */
import { and, asc, eq, gt, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs, type IgnoreReason, type JobStatus } from "@/db/schema";
import { evaluate } from "./match";
import { loadSettings } from "./tick";

const UPDATE_PARALLELISM = 25;
export const REEVALUATE_BATCH = 200;
export const REEVALUATE_WINDOW_DAYS = 30;

export type ReevaluateResult = {
  scanned: number;
  changed: number;
  batches: number;
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

  const windowStart = new Date(now.getTime() - REEVALUATE_WINDOW_DAYS * 86_400_000);
  const byStatus = { new: 0, ignored: 0 };
  const byReason: ReevaluateResult["byReason"] = { title: 0, location: 0, age: 0, manual: 0, none: 0 };
  let scanned = 0;
  let changed = 0;
  let batches = 0;
  let afterId = 0;

  for (;;) {
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
          gt(jobs.id, afterId),
          inArray(jobs.status, ["new", "ignored"] satisfies JobStatus[]),
          or(isNull(jobs.ignoreReason), ne(jobs.ignoreReason, "manual")),
          opts.includeClosed ? undefined : eq(jobs.isOpen, true),
          opts.includeClosed ? undefined : gte(jobs.firstSeenAt, windowStart),
        ),
      )
      .orderBy(asc(jobs.id))
      .limit(REEVALUATE_BATCH);
    if (rows.length === 0) break;
    batches++;
    scanned += rows.length;
    afterId = rows[rows.length - 1].id;

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
    changed += updates.length;
    if (rows.length < REEVALUATE_BATCH) break;
  }

  return { scanned, changed, batches, byStatus, byReason, durationMs: Date.now() - started };
}
