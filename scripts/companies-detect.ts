/**
 * pnpm companies:detect <careers-url-or-name>
 * Guesses the board slug and tries Greenhouse, Lever and Ashby. Prints which respond.
 */
import { detectBoards } from "../src/lib/detect";
import { printTable } from "./lib/table";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error("usage: pnpm companies:detect <careers-url-or-name>");
    process.exit(2);
  }
  const { slug, hint, results } = await detectBoards(input);
  console.log(`input: ${input}\nslug guess: ${slug}${hint ? ` (URL looks like ${hint})` : ""}\n`);
  printTable(
    results.map((r) => ({ ...r, jobs: r.jobs ?? "-" })),
    [
      { key: "ats" },
      { key: "slug" },
      { key: "status", label: "HTTP" },
      { key: "jobs", align: "right" },
      { key: "sample", label: "sample title", max: 60 },
    ],
  );
  const hits = results.filter((r) => (r.jobs ?? 0) > 0);
  console.log(
    hits.length
      ? `\n→ pnpm companies:add "<Name>" ${hits[0].ats} ${hits[0].slug} [priority] [careers_url]`
      : "\n→ no board responded with listings; check the careers page for the real slug",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
