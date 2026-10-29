/**
 * pnpm reevaluate [--all]
 * Re-runs evaluate() on open jobs with status new/ignored (never manual ignores or jobs acted on).
 * --all includes closed jobs too (backfills).
 */
import { count, desc } from "drizzle-orm";
import { db } from "../src/db";
import { jobs } from "../src/db/schema";
import { reevaluateJobs } from "../src/lib/reevaluate";
import { printTable } from "./lib/table";

async function main() {
  const includeClosed = process.argv.includes("--all");
  const r = await reevaluateJobs({ includeClosed });
  console.log(`reevaluate${includeClosed ? " (all)" : ""}: scanned=${r.scanned} changed=${r.changed} (${(r.durationMs / 1000).toFixed(1)}s)`);

  const byStatus = await db.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status).orderBy(desc(count()));
  console.log("\njobs by status:");
  printTable(byStatus, [{ key: "status" }, { key: "count", align: "right" }]);

  const byReason = await db
    .select({ ignore_reason: jobs.ignoreReason, count: count() })
    .from(jobs)
    .groupBy(jobs.ignoreReason)
    .orderBy(desc(count()));
  console.log("\njobs by ignore_reason:");
  printTable(byReason.map((r) => ({ ...r, ignore_reason: r.ignore_reason ?? "(null)" })), [{ key: "ignore_reason" }, { key: "count", align: "right" }]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
