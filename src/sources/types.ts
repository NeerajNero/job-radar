import type { Ats } from "@/db/schema";

export type NormalizedJob = {
  source: Ats;
  externalId: string;
  title: string;
  location: string | null; // joined, comma-separated if several
  isRemote: boolean;
  url: string; // hosted posting page
  applyUrl: string; // direct apply page (falls back to url)
  postedAt: Date | null;
  descriptionText: string | null; // plain text, truncated to 20 000 chars
};

export type SourceAdapter = {
  ats: Ats;
  /** The public JSON endpoint for a board slug. */
  boardUrl(slug: string): string;
  /** Validate a raw JSON body and normalise it. Throws on an unexpected shape. */
  parseBoard(data: unknown): NormalizedJob[];
  /** boardUrl + fetch + parseBoard. Throws SourceError on HTTP/timeout/shape problems. */
  fetchBoard(slug: string): Promise<NormalizedJob[]>;
};

export const DESCRIPTION_MAX_CHARS = 20_000;

export function truncateDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  return t.length > DESCRIPTION_MAX_CHARS ? t.slice(0, DESCRIPTION_MAX_CHARS) : t;
}

/** ISO string or epoch-ms → Date, or null when absent/invalid. */
export function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Join several location strings, trimmed, de-duplicated, comma-separated. */
export function joinLocations(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = (p ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length ? out.join(", ") : null;
}
