/**
 * pnpm tick:local — a real tick against DATABASE_URL from .env.local (writes jobs, companies,
 * tick_runs; sends nothing in Phase 2). Prints the summary and job counts by status.
 */
import { count, desc } from "drizzle-orm";
import { db } from "../src/db";
import { jobs } from "../src/db/schema";
import { runTick } from "../src/lib/tick";
import { printTable } from "./lib/table";

async function main() {
  const result = await runTick({ dryRun: false, log: (l) => console.log(l) });
  console.log(
    `\nsummary: fetched=${result.fetched} new=${result.new} notified=${result.notified} errors=${result.errors.length} (${(result.durationMs / 1000).toFixed(1)}s)`,
  );
  for (const e of result.errors) console.log(`  ! ${e}`);

  const byStatus = await db
    .select({ status: jobs.status, count: count() })
    .from(jobs)
    .groupBy(jobs.status)
    .orderBy(desc(count()));
  console.log("\njobs by status:");
  printTable(byStatus, [{ key: "status" }, { key: "count", align: "right" }]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
