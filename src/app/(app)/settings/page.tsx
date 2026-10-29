import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { AddCompanyForm } from "@/components/settings/add-company-form";
import { CompaniesTable, type CompanyRow } from "@/components/settings/companies-table";
import { Maintenance } from "@/components/settings/maintenance";
import { MatchingForm } from "@/components/settings/matching-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { card, muted, sectionTitle } from "@/components/ui";
import { db } from "@/db";
import { companies, tickRuns } from "@/db/schema";
import { fmtIst } from "@/lib/dates";
import { DAILY_CAP, maskChatId, telegramStatus } from "@/lib/messaging";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
// "Run tick now" and "Test fetch" call the adapters from server actions on this route.
export const maxDuration = 60;

export default async function SettingsPage() {
  const [settings, companyRows, runs] = await Promise.all([
    loadSettings(),
    db.select().from(companies).orderBy(companies.priority, companies.name),
    db.select().from(tickRuns).orderBy(desc(tickRuns.id)).limit(5),
  ]);
  const telegramToday = settings.telegramChatId ? await telegramStatus(settings.telegramChatId) : { sent: 0, held: 0, lastDigest: null };

  const rows: CompanyRow[] = companyRows.map((c) => ({
    id: c.id,
    name: c.name,
    ats: c.ats,
    slug: c.slug,
    priority: c.priority,
    active: c.active,
    lastFetchStatus: c.lastFetchStatus,
    lastFetchError: c.lastFetchError,
    consecutiveFailures: c.consecutiveFailures,
    lastFetchedLabel: c.lastFetchedAt ? fmtIst(c.lastFetchedAt) : "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Settings</h1>

      <section className={card} aria-labelledby="companies-h">
        <h2 id="companies-h" className={sectionTitle}>
          Companies
        </h2>
        <div className="mt-3">
          <CompaniesTable companies={rows} />
        </div>
        <h3 className="mt-5 text-sm font-semibold">Add a company</h3>
        <div className="mt-2">
          <AddCompanyForm />
        </div>
      </section>

      <section className={card} aria-labelledby="matching-h">
        <h2 id="matching-h" className={sectionTitle}>
          Matching
        </h2>
        <div className="mt-3">
          <MatchingForm settings={settings} />
        </div>
      </section>

      <section className={card} aria-labelledby="profile-h">
        <h2 id="profile-h" className={sectionTitle}>
          Message templates
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>These fill the referral, recruiter and hiring-manager messages.</p>
        <div className="mt-3">
          <ProfileForm settings={settings} />
        </div>
      </section>

      <section className={card} aria-labelledby="telegram-h">
        <h2 id="telegram-h" className={sectionTitle}>
          Telegram
        </h2>
        <p className="mt-2 text-sm">
          {settings.telegramChatId ? (
            <span className="text-emerald-700 dark:text-emerald-400">Paired with chat {maskChatId(settings.telegramChatId)}.</span>
          ) : (
            <span className={muted}>Not paired. Send /start &lt;pair code&gt; to the bot.</span>
          )}
        </p>
        {settings.telegramChatId ? (
          <p className={`mt-1 text-sm ${muted}`}>
            Alerts and digests today: {telegramToday.sent} of {DAILY_CAP} (replies to your commands are not counted)
            {telegramToday.held ? ` · ${telegramToday.held} alert${telegramToday.held === 1 ? "" : "s"} held for quiet hours` : ""}
            {telegramToday.lastDigest ? ` · last digest ${fmtIst(telegramToday.lastDigest)}` : ""}. Quiet {settings.quietStart.slice(0, 5)}–
            {settings.quietEnd.slice(0, 5)} IST, digest at {settings.digestTime.slice(0, 5)} IST.
          </p>
        ) : null}
      </section>

      <section className={card} aria-labelledby="maintenance-h">
        <h2 id="maintenance-h" className={sectionTitle}>
          Maintenance
        </h2>
        <div className="mt-3">
          <Maintenance />
        </div>
        <h3 className="mt-5 text-sm font-semibold">Last 5 ticks</h3>
        {runs.length === 0 ? (
          <p className={`mt-1 text-sm ${muted}`}>No ticks yet.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="mt-1 w-full min-w-[520px] text-sm">
              <thead>
                <tr className={`text-left text-xs uppercase tracking-wide ${muted}`}>
                  <th className="px-2 py-1">Started (IST)</th>
                  <th className="px-2 py-1">Took</th>
                  <th className="px-2 py-1">Fetched</th>
                  <th className="px-2 py-1">New</th>
                  <th className="px-2 py-1">Notified</th>
                  <th className="px-2 py-1">Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtIst(r.startedAt, "dd MMM HH:mm")}</td>
                    <td className="px-2 py-1.5">{r.finishedAt ? `${((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)}s` : "-"}</td>
                    <td className="px-2 py-1.5">{r.companiesFetched}</td>
                    <td className="px-2 py-1.5">{r.jobsNew}</td>
                    <td className="px-2 py-1.5">{r.jobsNotified}</td>
                    <td className={`px-2 py-1.5 ${r.errors ? "text-red-700 dark:text-red-400" : muted}`}>{r.errors ?? "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
