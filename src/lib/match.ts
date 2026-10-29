/**
 * Matching and scoring. Pure functions, no I/O. See CLAUDE.md "Matching and scoring".
 */
import type { IgnoreReason, LocationMatch, Settings } from "@/db/schema";

export type MatchSettings = Pick<
  Settings,
  | "titleInclude"
  | "titleExclude"
  | "descriptionBoost"
  | "locations"
  | "includeRemote"
  | "includeUnknownLocation"
  | "maxAgeDays"
>;

export type MatchJob = {
  title: string;
  location: string | null;
  isRemote: boolean;
  postedAt: Date | null;
  descriptionText: string | null;
};

export type MatchCompany = { priority: number };

export type Evaluation = {
  isMatch: boolean;
  score: number;
  matchedKeywords: string[];
  locationMatch: LocationMatch;
  status: "new" | "ignored";
  /** Why a non-match was ignored (title > location > age precedence); null for matches. */
  ignoreReason: IgnoreReason | null;
  /** Human-readable reasons a job was rejected (empty for matches). */
  reasons: string[];
};

const DAY_MS = 86_400_000;

/** Score term groups from the spec ("node/nestjs/next" taken to include the obvious spellings). */
export const SCORE_TERMS = {
  fullStack: ["full stack", "fullstack", "full-stack"],
  node: ["node", "nodejs", "node.js", "nestjs", "next", "next.js", "nextjs"],
  react: ["react", "typescript"],
} as const;

export const BOOST_CAP = 3;

const patternCache = new Map<string, RegExp>();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-term, case-insensitive matcher. Boundaries are "not a letter or digit" on both sides so
 * terms like `next.js`, `full-stack`, `.net`, `c#` match literally and `node` does not hit `nodejs`.
 * Internal whitespace in a term matches any run of whitespace or hyphens.
 */
export function termPattern(term: string): RegExp {
  const key = term.trim().toLowerCase();
  let re = patternCache.get(key);
  if (!re) {
    const body = key.split(/\s+/).map(escapeRegex).join("[\\s-]+");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
    patternCache.set(key, re);
  }
  return re;
}

export function hasTerm(text: string, term: string): boolean {
  if (!term.trim()) return false;
  return termPattern(term).test(text);
}

/** Terms (in their given order) that occur in text. */
export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => hasTerm(text, t));
}

export function matchTitle(
  title: string,
  include: readonly string[],
  exclude: readonly string[],
): { ok: boolean; includeHits: string[]; excludeHits: string[] } {
  const includeHits = findTerms(title, include);
  const excludeHits = findTerms(title, exclude);
  return { ok: includeHits.length > 0 && excludeHits.length === 0, includeHits, excludeHits };
}

export function matchLocation(
  job: Pick<MatchJob, "location" | "isRemote">,
  settings: Pick<MatchSettings, "locations" | "includeRemote" | "includeUnknownLocation">,
): LocationMatch {
  const location = job.location?.trim() ?? "";
  if (location && findTerms(location, settings.locations).length > 0) return "explicit";
  const remote = job.isRemote || (location !== "" && hasTerm(location, "remote"));
  if (remote && settings.includeRemote) return "remote";
  if (!location && settings.includeUnknownLocation) return "unknown";
  return "none";
}

/** Age uses postedAt, else firstSeenAt; fresh when age ≤ maxAgeDays. */
export function isFresh(
  postedAt: Date | null,
  firstSeenAt: Date,
  maxAgeDays: number,
  now: Date = new Date(),
): boolean {
  const ref = postedAt ?? firstSeenAt;
  const ageMs = now.getTime() - ref.getTime();
  return ageMs <= maxAgeDays * DAY_MS;
}

export function score(input: {
  title: string;
  descriptionText: string | null;
  descriptionBoost: readonly string[];
  priority: number;
  locationMatch: LocationMatch;
}): { score: number; boostHits: string[] } {
  let s = 0;
  const { title } = input;
  if (findTerms(title, SCORE_TERMS.fullStack).length) s += 3;
  if (findTerms(title, SCORE_TERMS.node).length) s += 2;
  if (findTerms(title, SCORE_TERMS.react).length) s += 1;
  const boostHits = input.descriptionText ? findTerms(input.descriptionText, input.descriptionBoost) : [];
  s += Math.min(boostHits.length, BOOST_CAP);
  if (input.priority === 1) s += 2;
  else if (input.priority === 2) s += 1;
  if (input.locationMatch === "explicit") s += 1;
  else if (input.locationMatch === "unknown") s -= 1;
  return { score: s, boostHits };
}

export function evaluate(
  job: MatchJob,
  company: MatchCompany,
  settings: MatchSettings,
  now: Date = new Date(),
  firstSeenAt: Date = now,
): Evaluation {
  const reasons: string[] = [];
  let ignoreReason: IgnoreReason | null = null;
  const title = matchTitle(job.title, settings.titleInclude, settings.titleExclude);
  if (title.includeHits.length === 0) reasons.push("no include term");
  if (title.excludeHits.length > 0) reasons.push(`excluded: ${title.excludeHits.join(", ")}`);
  if (!title.ok) ignoreReason = "title";

  const locationMatch = matchLocation(job, settings);
  if (locationMatch === "none") {
    reasons.push("location");
    ignoreReason ??= "location";
  }

  if (!isFresh(job.postedAt, firstSeenAt, settings.maxAgeDays, now)) {
    reasons.push("stale");
    ignoreReason ??= "age";
  }

  const { score: s, boostHits } = score({
    title: job.title,
    descriptionText: job.descriptionText,
    descriptionBoost: settings.descriptionBoost,
    priority: company.priority,
    locationMatch,
  });
  const matchedKeywords = [...new Set([...title.includeHits, ...boostHits])];

  const isMatch = reasons.length === 0;
  return {
    isMatch,
    score: isMatch ? s : 0,
    matchedKeywords,
    locationMatch,
    status: isMatch ? "new" : "ignored",
    ignoreReason,
    reasons,
  };
}
