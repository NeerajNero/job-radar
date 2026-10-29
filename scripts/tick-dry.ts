/**
 * pnpm tick:dry — fetch and evaluate every selectable company with no database writes
 * and nothing sent. Prints a fetch-status line per company and the would-be matches.
 */
import { runTick } from "../src/lib/tick";
import { fmtAgo } from "./lib/format";
import { printTable } from "./lib/table";

async function main() {
  const result = await runTick({ dryRun: true, log: (l) => console.log(l) });
  console.log();
  if (!result.matches.length) {
    console.log("no would-be matches");
  } else {
    printTable(
      result.matches.map((m) => ({
        company: m.company,
        title: m.title,
        location: m.location ?? "(none)",
        posted: fmtAgo(m.postedAt),
        score: m.score,
        keywords: m.matchedKeywords.join(", "),
      })),
      [
        { key: "company", max: 18 },
        { key: "title", max: 48 },
        { key: "location", max: 28 },
        { key: "posted", max: 14 },
        { key: "score", align: "right" },
        { key: "keywords", max: 40 },
      ],
    );
  }
  const wouldInsert = result.companies.reduce((n, c) => n + c.inserted, 0);
  console.log(
    `\n[dry] ${result.fetched} companies fetched, ${wouldInsert} jobs would be inserted, ${result.matches.length} would match, ${result.errors.length} errors, ${(result.durationMs / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
