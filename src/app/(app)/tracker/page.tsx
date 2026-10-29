import { count, desc, eq, notInArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Funnel } from "@/components/tracker/funnel";
import { TrackerRow, type TrackerJob } from "@/components/tracker/tracker-row";
import { muted } from "@/components/ui";
import { db } from "@/db";
import { companies, jobs } from "@/db/schema";
import { fmtIst, isOverdue } from "@/lib/dates";

export const metadata: Metadata = { title: "Tracker" };

export default async function TrackerPage() {
  const now = new Date();
  const [rows, statusCounts] = await Promise.all([
    db
      .select({ job: jobs, company: companies.name })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(notInArray(jobs.status, ["new", "ignored"]))
      .orderBy(sql`${jobs.nextActionDate} asc nulls last`, desc(jobs.statusChangedAt)),
    db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status),
  ]);
  const counts = Object.fromEntries(statusCounts.map((r) => [r.status, r.n]));

  const items: TrackerJob[] = rows.map(({ job, company }) => ({
    id: job.id,
    company,
    title: job.title,
    url: job.url,
    status: job.status,
    appliedLabel: job.appliedAt ? fmtIst(job.appliedAt, "dd MMM") : "-",
    referrerName: job.referrerName,
    nextAction: job.nextAction,
    nextActionDate: job.nextActionDate,
    notes: job.notes,
    overdue: isOverdue(job.nextActionDate, now),
  }));

  return (
    <section>
      <h1 className="sr-only">Tracker</h1>
      <Funnel counts={counts} />
      {items.length === 0 ? (
        <p className={`mt-8 text-center text-sm ${muted}`}>Nothing tracked yet. Mark a job applied or referral asked from the Feed.</p>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className={`text-left text-xs uppercase tracking-wide ${muted}`}>
                <th className="px-2 py-1">Company</th>
                <th className="px-2 py-1">Title</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Applied</th>
                <th className="px-2 py-1">Referrer</th>
                <th className="px-2 py-1">Next action</th>
                <th className="px-2 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <TrackerRow key={j.id} job={j} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`mt-3 text-xs ${muted}`}>Edits save when a field loses focus. Rows with a past next-action date are tinted.</p>
    </section>
  );
}
