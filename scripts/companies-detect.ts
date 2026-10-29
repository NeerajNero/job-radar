/**
 * pnpm companies:detect <careers-url-or-name>
 * Guesses the board slug and tries Greenhouse, Lever and Ashby. Prints which respond.
 */
import { ATS_LIST, getSource } from "../src/sources";
import { getJson, SourceError } from "../src/sources/http";
import { printTable } from "./lib/table";

const KNOWN_HOSTS: Array<{ host: RegExp; ats: string }> = [
  { host: /^(boards|job-boards)\.greenhouse\.io$/i, ats: "greenhouse" },
  { host: /^jobs\.lever\.co$/i, ats: "lever" },
  { host: /^jobs\.ashbyhq\.com$/i, ats: "ashby" },
];

export function guessSlug(input: string): { slug: string; hint: string | null } {
  const raw = input.trim();
  const looksLikeUrl = /^[a-z]+:\/\//i.test(raw) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw);
  if (looksLikeUrl) {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    const segments = url.pathname.split("/").filter(Boolean);
    for (const k of KNOWN_HOSTS) {
      if (k.host.test(url.hostname) && segments[0]) return { slug: segments[0], hint: k.ats };
    }
    // Any other careers URL: use the registrable label of the hostname (careers.acme.com → acme).
    const labels = url.hostname.replace(/^www\./i, "").split(".");
    const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    return { slug: label.toLowerCase(), hint: null };
  }
  return { slug: raw.toLowerCase().replace(/\s+/g, ""), hint: null };
}

type Row = { ats: string; slug: string; status: string; jobs: number | string; sample: string };

async function probe(ats: (typeof ATS_LIST)[number], slug: string): Promise<Row> {
  const source = getSource(ats);
  try {
    const { status, data } = await getJson(source.boardUrl(slug));
    if (status < 200 || status >= 300) return { ats, slug, status: String(status), jobs: "-", sample: "" };
    const jobs = source.parseBoard(data);
    return { ats, slug, status: String(status), jobs: jobs.length, sample: jobs[0]?.title ?? "(no listings)" };
  } catch (err) {
    const msg = err instanceof SourceError ? err.message : err instanceof Error ? err.message : String(err);
    return { ats, slug, status: "error", jobs: "-", sample: msg.slice(0, 60) };
  }
}

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error("usage: pnpm companies:detect <careers-url-or-name>");
    process.exit(2);
  }
  const { slug, hint } = guessSlug(input);
  console.log(`input: ${input}\nslug guess: ${slug}${hint ? ` (URL looks like ${hint})` : ""}\n`);
  const rows = await Promise.all(ATS_LIST.map((ats) => probe(ats, slug)));
  printTable(rows, [
    { key: "ats" },
    { key: "slug" },
    { key: "status", label: "HTTP" },
    { key: "jobs", align: "right" },
    { key: "sample", label: "sample title", max: 60 },
  ]);
  const hits = rows.filter((r) => typeof r.jobs === "number" && r.jobs > 0);
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
