/** Slug guessing and board probing shared by `pnpm companies:detect` and the Settings form. */
import type { Ats } from "@/db/schema";
import { ATS_LIST, getSource } from "@/sources";
import { getJson, SourceError } from "@/sources/http";

const KNOWN_HOSTS: Array<{ host: RegExp; ats: Ats }> = [
  { host: /^(boards|job-boards)\.greenhouse\.io$/i, ats: "greenhouse" },
  { host: /^jobs\.lever\.co$/i, ats: "lever" },
  { host: /^jobs\.ashbyhq\.com$/i, ats: "ashby" },
];

export function guessSlug(input: string): { slug: string; hint: Ats | null } {
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

export type ProbeResult = { ats: Ats; slug: string; status: string; jobs: number | null; sample: string };

export async function probeBoard(ats: Ats, slug: string): Promise<ProbeResult> {
  const source = getSource(ats);
  try {
    const { status, data } = await getJson(source.boardUrl(slug), source.timeoutMs);
    if (status < 200 || status >= 300) return { ats, slug, status: String(status), jobs: null, sample: "" };
    const jobs = source.parseBoard(data);
    return { ats, slug, status: String(status), jobs: jobs.length, sample: jobs[0]?.title ?? "(no listings)" };
  } catch (err) {
    const msg = err instanceof SourceError ? err.message : err instanceof Error ? err.message : String(err);
    return { ats, slug, status: "error", jobs: null, sample: msg.slice(0, 80) };
  }
}

export async function detectBoards(input: string): Promise<{ slug: string; hint: Ats | null; results: ProbeResult[] }> {
  const { slug, hint } = guessSlug(input);
  const results = await Promise.all(ATS_LIST.map((ats) => probeBoard(ats, slug)));
  return { slug, hint, results };
}
