import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { JobCard, type FeedCard } from "@/components/feed/job-card";
import { muted } from "@/components/ui";
import { fillAllTemplates } from "@/content/templates";
import { db } from "@/db";
import { companies, jobs } from "@/db/schema";
import { fmtAgo, fmtIst } from "@/lib/dates";
import { findReferrerUrl, hiringPostsUrl } from "@/lib/links";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Feed" };

const VIEWS = [
  { key: "new", label: "New" },
  { key: "applied", label: "Applied" },
  { key: "referral", label: "Referral asked" },
  { key: "open", label: "All open" },
  { key: "older", label: "Older matches" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const FEED_LIMIT = 200;
const OLDER_WINDOW_DAYS = 30;

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === sp.view) ? (sp.view as ViewKey) : "new";
  const highlightId = typeof sp.job === "string" && /^\d+$/.test(sp.job) ? Number(sp.job) : null;
  const now = new Date();
  const olderCutoff = new Date(now.getTime() - OLDER_WINDOW_DAYS * 86_400_000);

  const openWhere = and(ne(jobs.status, "ignored"), eq(jobs.isOpen, true));
  const olderWhere = and(eq(jobs.ignoreReason, "age"), eq(jobs.isOpen, true), gte(jobs.postedAt, olderCutoff));
  const where = {
    new: eq(jobs.status, "new"),
    applied: eq(jobs.status, "applied"),
    referral: eq(jobs.status, "referral_asked"),
    open: openWhere,
    older: olderWhere,
  }[view];
  const orderBy =
    view === "older"
      ? [desc(jobs.postedAt)]
      : view === "applied" || view === "referral"
        ? [desc(jobs.statusChangedAt)]
        : [desc(jobs.matchScore), sql`${jobs.postedAt} desc nulls last`];

  const [settings, rows, statusCounts, [open], [older]] = await Promise.all([
    loadSettings(),
    db
      .select({ job: jobs, company: companies.name, priority: companies.priority })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where)
      .orderBy(...orderBy)
      .limit(FEED_LIMIT),
    db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status),
    db.select({ n: count() }).from(jobs).where(openWhere),
    db.select({ n: count() }).from(jobs).where(olderWhere),
  ]);
  // "Open in app" from a Telegram alert: make sure that job is on the page even if its status
  // moved it out of the current view, then scroll to and highlight it.
  if (highlightId !== null && !rows.some((r) => r.job.id === highlightId)) {
    const [pinned] = await db
      .select({ job: jobs, company: companies.name, priority: companies.priority })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(jobs.id, highlightId));
    if (pinned) rows.unshift(pinned);
  }
  const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r.n]));
  const counts: Record<ViewKey, number> = {
    new: byStatus.new ?? 0,
    applied: byStatus.applied ?? 0,
    referral: byStatus.referral_asked ?? 0,
    open: open.n,
    older: older.n,
  };

  const cards: FeedCard[] = rows.map(({ job, company, priority }) => ({
    id: job.id,
    company,
    priority,
    title: job.title,
    location: job.location,
    postedAgo: fmtAgo(job.postedAt),
    postedIst: fmtIst(job.postedAt, "dd MMM yyyy HH:mm 'IST'"),
    score: job.matchScore,
    keywords: job.matchedKeywords,
    status: job.status,
    description: job.descriptionText,
    url: job.url,
    applyUrl: job.applyUrl,
    referrerUrl: findReferrerUrl(company),
    hiringUrl: hiringPostsUrl(company),
    templates: fillAllTemplates({ company, title: job.title }, settings),
  }));

  return (
    <section>
      <h1 className="sr-only">Feed</h1>
      <nav aria-label="Feed views" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={v.key === "new" ? "/" : `/?view=${v.key}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {v.label}
              <span className={active ? "opacity-70" : muted}>{counts[v.key]}</span>
            </Link>
          );
        })}
      </nav>

      {cards.length === 0 ? (
        <p className={`mt-8 text-center text-sm ${muted}`}>
          {view === "new"
            ? "No new matches. Run a tick from Settings or widen the matching rules."
            : "Nothing here yet."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {cards.map((c) => (
            <li key={c.id}>
              <JobCard job={c} highlighted={c.id === highlightId} />
            </li>
          ))}
        </ul>
      )}
      {rows.length === FEED_LIMIT ? <p className={`mt-4 text-center text-xs ${muted}`}>Showing the first {FEED_LIMIT}.</p> : null}
    </section>
  );
}
