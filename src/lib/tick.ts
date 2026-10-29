/**
 * The hourly tick: fetch boards, upsert jobs, score new ones, record the run.
 * Steps 1–3 and 5 of CLAUDE.md "Tick". Step 4 (Telegram) is a no-op hook until Phase 4.
 */
import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs, tickRuns, type Company, type NewJob, type Settings } from "@/db/schema";
import { getSource, type NormalizedJob } from "@/sources";
import { evaluate } from "./match";
import { loadSettings } from "./settings";

export const MAX_COMPANIES_PER_RUN = 40;
export const FETCH_BATCH_SIZE = 8;
export const FAILURE_COOLDOWN_AFTER = 3;
export const FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const INSERT_CHUNK = 50;
const ID_CHUNK = 500;

export type TickOptions = {
  /** Fetch and evaluate, but write nothing and send nothing. */
  dryRun?: boolean;
  now?: Date;
  log?: (line: string) => void;
};

export type CompanyResult = {
  companyId: number;
  name: string;
  ats: Company["ats"];
  slug: string;
  ok: boolean;
  error?: string;
  listed: number;
  inserted: number;
  closed: number;
  matched: number;
};

export type TickMatch = {
  companyId: number;
  company: string;
  priority: number;
  title: string;
  location: string | null;
  locationMatch: string;
  postedAt: Date | null;
  score: number;
  matchedKeywords: string[];
  url: string;
  applyUrl: string;
};

export type TickResult = {
  fetched: number;
  new: number;
  notified: number;
  errors: string[];
  companies: CompanyResult[];
  /** New jobs that matched (would-be inserts in a dry run). */
  matches: TickMatch[];
  durationMs: number;
};

export { loadSettings } from "./settings";

/** Step 1: active companies not in failure cooldown, least-recently fetched first, capped. */
export async function selectCompaniesForTick(now: Date): Promise<Company[]> {
  const cooldownBefore = new Date(now.getTime() - FAILURE_COOLDOWN_MS);
  return db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.active, true),
        or(
          lt(companies.consecutiveFailures, FAILURE_COOLDOWN_AFTER),
          isNull(companies.lastFetchedAt),
          lt(companies.lastFetchedAt, cooldownBefore),
        ),
      ),
    )
    .orderBy(sql`${companies.lastFetchedAt} asc nulls first`, companies.id)
    .limit(MAX_COMPANIES_PER_RUN);
}

function dedupeByExternalId(list: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return list.filter((j) => (seen.has(j.externalId) ? false : (seen.add(j.externalId), true)));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function processCompany(
  company: Company,
  settings: Settings,
  now: Date,
  dryRun: boolean,
  matches: TickMatch[],
): Promise<CompanyResult> {
  const base = { companyId: company.id, name: company.name, ats: company.ats, slug: company.slug };
  let listed: NormalizedJob[];
  try {
    listed = dedupeByExternalId(await getSource(company.ats).fetchBoard(company.slug));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await db
        .update(companies)
        .set({
          lastFetchedAt: now,
          lastFetchStatus: "error",
          lastFetchError: message.slice(0, 1000),
          consecutiveFailures: sql`${companies.consecutiveFailures} + 1`,
        })
        .where(eq(companies.id, company.id));
    }
    // A failed fetch never closes jobs: the board's state is unknown.
    return { ...base, ok: false, error: message, listed: 0, inserted: 0, closed: 0, matched: 0 };
  }

  const existing = await db
    .select({ externalId: jobs.externalId, isOpen: jobs.isOpen })
    .from(jobs)
    .where(eq(jobs.companyId, company.id));
  const existingIds = new Set(existing.map((e) => e.externalId));
  const seenIds = new Set(listed.map((j) => j.externalId));

  const fresh = listed.filter((j) => !existingIds.has(j.externalId));
  const seenExisting = listed.filter((j) => existingIds.has(j.externalId)).map((j) => j.externalId);
  const toClose = existing.filter((e) => e.isOpen && !seenIds.has(e.externalId)).map((e) => e.externalId);

  // Step 3: evaluate on insert only.
  const rows: NewJob[] = [];
  let matched = 0;
  for (const j of fresh) {
    const ev = evaluate(j, company, settings, now, now);
    if (ev.isMatch) {
      matched++;
      matches.push({
        companyId: company.id,
        company: company.name,
        priority: company.priority,
        title: j.title,
        location: j.location,
        locationMatch: ev.locationMatch,
        postedAt: j.postedAt,
        score: ev.score,
        matchedKeywords: ev.matchedKeywords,
        url: j.url,
        applyUrl: j.applyUrl,
      });
    }
    rows.push({
      companyId: company.id,
      source: j.source,
      externalId: j.externalId,
      title: j.title,
      location: j.location,
      isRemote: j.isRemote,
      url: j.url,
      applyUrl: j.applyUrl,
      postedAt: j.postedAt,
      firstSeenAt: now,
      lastSeenAt: now,
      isOpen: true,
      descriptionText: j.descriptionText,
      matchScore: ev.score,
      matchedKeywords: ev.matchedKeywords,
      locationMatch: ev.locationMatch,
      status: ev.status,
      ignoreReason: ev.ignoreReason,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!dryRun) {
    // Step 2: upsert. Inserts set first_seen_at; the conflict target guards a race on (source, external_id).
    for (const part of chunk(rows, INSERT_CHUNK)) {
      await db.insert(jobs).values(part).onConflictDoNothing({ target: [jobs.source, jobs.externalId] });
    }
    for (const part of chunk(seenExisting, ID_CHUNK)) {
      await db
        .update(jobs)
        .set({ lastSeenAt: now, isOpen: true, updatedAt: now })
        .where(and(eq(jobs.companyId, company.id), inArray(jobs.externalId, part)));
    }
    if (toClose.length) {
      const seen = [...seenIds];
      await db
        .update(jobs)
        .set({ isOpen: false, updatedAt: now })
        .where(
          and(
            eq(jobs.companyId, company.id),
            eq(jobs.isOpen, true),
            seen.length ? notInArray(jobs.externalId, seen) : sql`true`,
          ),
        );
    }
    await db
      .update(companies)
      .set({ lastFetchedAt: now, lastFetchStatus: "ok", lastFetchError: null, consecutiveFailures: 0 })
      .where(eq(companies.id, company.id));
  }

  return { ...base, ok: true, listed: listed.length, inserted: rows.length, closed: toClose.length, matched };
}

/* ------------------------------------------------------------------------------------------ */
/* PHASE 4 HOOK — Telegram alerts (Tick step 4). Deliberately a no-op in Phase 2.              */
/* Phase 4 replaces the body: alerts for matches with score ≥ min_notify_score and            */
/* notified_at null (max 10), then the digest if due, honouring quiet hours and the daily cap. */
/* Must return the number of alerts actually sent.                                            */
/* ------------------------------------------------------------------------------------------ */
async function sendAlerts(ctx: {
  settings: Settings;
  matches: TickMatch[];
  now: Date;
  dryRun: boolean;
}): Promise<number> {
  void ctx; // unused until Phase 4
  return 0;
}

export async function runTick(options: TickOptions = {}): Promise<TickResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? (() => {});
  const started = Date.now();

  const settings = await loadSettings();
  const selected = await selectCompaniesForTick(now);
  log(`${dryRun ? "[dry] " : ""}tick: ${selected.length} companies selected`);

  const results: CompanyResult[] = [];
  const matches: TickMatch[] = [];
  for (const batch of chunk(selected, FETCH_BATCH_SIZE)) {
    const settled = await Promise.all(
      batch.map((c) =>
        processCompany(c, settings, now, dryRun, matches).catch(
          (err): CompanyResult => ({
            companyId: c.id,
            name: c.name,
            ats: c.ats,
            slug: c.slug,
            ok: false,
            error: `internal: ${err instanceof Error ? err.message : String(err)}`,
            listed: 0,
            inserted: 0,
            closed: 0,
            matched: 0,
          }),
        ),
      ),
    );
    for (const r of settled) {
      results.push(r);
      log(
        r.ok
          ? `  ok     ${r.name} (${r.ats}/${r.slug}): ${r.listed} listed, ${r.inserted} new, ${r.matched} matched, ${r.closed} closed`
          : `  error  ${r.name} (${r.ats}/${r.slug}): ${r.error}`,
      );
    }
  }

  matches.sort((a, b) => b.score - a.score || (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));

  const errors = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);
  const jobsNew = results.reduce((n, r) => n + r.inserted, 0);
  const notified = await sendAlerts({ settings, matches, now, dryRun });

  if (!dryRun) {
    await db.insert(tickRuns).values({
      startedAt: now,
      finishedAt: new Date(),
      companiesFetched: results.length,
      jobsNew,
      jobsNotified: notified,
      errors: errors.length ? errors.join("\n") : null,
    });
  }

  return {
    fetched: results.length,
    new: jobsNew,
    notified,
    errors,
    companies: results,
    matches,
    durationMs: Date.now() - started,
  };
}
