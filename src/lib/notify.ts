/**
 * Telegram alerts and the daily digest, sent from the tick (CLAUDE.md "Telegram bot").
 * - Alerts: one message per open, still-new job with score ≥ min_notify_score and notified_at
 *   null (a job acted on from the Feed before the alert fired is not alerted), at most
 *   ALERTS_PER_TICK per tick, the rest summarised as "and N more in the app". notified_at is set
 *   on send. Quiet hours hold alerts (recorded as kind=held) and the first tick at or after
 *   quiet_end releases them, since they are still notified_at null.
 * - Digest: at the first tick at or after digest_time, once per IST day, outside quiet hours.
 * - The DAILY_CAP counts every message to the paired chat.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { botToken } from "@/bot/api";
import { db } from "@/db";
import { companies, jobs, messagesSent, type JobStatus, type Settings } from "@/db/schema";
import { fmtAgo, istDate, subWorkingDays, todayIst } from "./dates";
import { findReferrerUrl } from "./links";
import { ALERTS_PER_TICK, SendBudget, appUrl, escapeHtml, isAtOrAfter, isQuietHours, lastSentOfKind, recordMessage } from "./messaging";
import { loadSettings } from "./settings";
import { funnelLine, statusCounts } from "./stats";

export type AlertJob = {
  id: number;
  company: string;
  title: string;
  location: string | null;
  isRemote: boolean;
  postedAt: Date | null;
  matchScore: number;
  url: string;
  applyUrl: string;
};

export type AlertsResult = { sent: number; held: number; skipped: string | null };

const ALERT_JOB_COLUMNS = {
  id: jobs.id,
  company: companies.name,
  title: jobs.title,
  location: jobs.location,
  isRemote: jobs.isRemote,
  postedAt: jobs.postedAt,
  matchScore: jobs.matchScore,
  url: jobs.url,
  applyUrl: jobs.applyUrl,
};

/** Telegram is usable only with a token and a paired chat. Returns the reason when not. */
export async function telegramTarget(settings?: Settings): Promise<{ chatId: string; settings: Settings } | { skipped: string }> {
  if (!botToken()) return { skipped: "TELEGRAM_BOT_TOKEN not set" };
  const s = settings ?? (await loadSettings());
  if (!s.telegramChatId) return { skipped: "no paired chat" };
  return { chatId: s.telegramChatId, settings: s };
}

export function jobOpenUrl(jobId: number): string {
  return appUrl(`/?job=${jobId}`);
}

/** The alert text (HTML). Also used to re-render the message after a button press. */
export function formatAlert(job: AlertJob, suffix?: string): string {
  const location = job.location ?? (job.isRemote ? "Remote" : "Location unknown");
  const lines = [
    `<b>${escapeHtml(job.company)}</b> · ${escapeHtml(job.title)}`,
    `${escapeHtml(location)} · posted ${job.postedAt ? fmtAgo(job.postedAt) : "unknown"} · score ${job.matchScore}`,
    `<a href="${escapeHtml(job.applyUrl)}">Apply</a> · <a href="${escapeHtml(findReferrerUrl(job.company))}">Find referrer</a> · <a href="${escapeHtml(jobOpenUrl(job.id))}">Open in app</a>`,
  ];
  if (suffix) lines.push("", suffix);
  return lines.join("\n");
}

export function alertKeyboard(jobId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Applied", `s:${jobId}:applied`)
    .text("Referral asked", `s:${jobId}:referral_asked`)
    .text("Ignore", `s:${jobId}:ignored`);
}

export async function loadAlertJob(jobId: number): Promise<AlertJob | null> {
  const [row] = await db.select(ALERT_JOB_COLUMNS).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(eq(jobs.id, jobId));
  return row ?? null;
}

async function pendingAlertJobs(minScore: number): Promise<AlertJob[]> {
  return db
    .select(ALERT_JOB_COLUMNS)
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(gte(jobs.matchScore, minScore), isNull(jobs.notifiedAt), eq(jobs.status, "new"), eq(jobs.isOpen, true)))
    .orderBy(desc(jobs.matchScore), asc(jobs.firstSeenAt));
}

export async function sendNewJobAlerts(now: Date = new Date(), log: (line: string) => void = () => {}): Promise<AlertsResult> {
  const target = await telegramTarget();
  if ("skipped" in target) {
    log(`alerts: skipped (${target.skipped})`);
    return { sent: 0, held: 0, skipped: target.skipped };
  }
  const { chatId, settings } = target;
  const pending = await pendingAlertJobs(settings.minNotifyScore);
  if (pending.length === 0) return { sent: 0, held: 0, skipped: null };

  if (isQuietHours(settings, now)) {
    // Hold: record once per job so the Settings page can show what is waiting; notified_at stays
    // null so the first tick at or after quiet_end sends them.
    const alreadyHeld = new Set(
      (
        await db
          .select({ jobId: messagesSent.jobId })
          .from(messagesSent)
          .where(and(eq(messagesSent.kind, "held"), inArray(messagesSent.jobId, pending.map((j) => j.id))))
      ).map((r) => r.jobId),
    );
    let held = 0;
    for (const job of pending) {
      if (alreadyHeld.has(job.id)) continue;
      await recordMessage({ chatId, kind: "held", jobId: job.id, sentAt: now });
      held++;
    }
    log(`alerts: quiet hours, ${pending.length} held (${held} newly recorded)`);
    return { sent: 0, held: pending.length, skipped: "quiet hours" };
  }

  const budget = await SendBudget.open(chatId, now);
  const toSend = pending.slice(0, Math.min(ALERTS_PER_TICK, budget.remaining));
  let sent = 0;
  for (const job of toSend) {
    const r = await budget.send(formatAlert(job), { kind: "alert", jobId: job.id, keyboard: alertKeyboard(job.id) });
    if (!r.ok) break;
    await db.update(jobs).set({ notifiedAt: now, updatedAt: now }).where(eq(jobs.id, job.id));
    sent++;
  }
  const more = pending.length - sent;
  if (more > 0 && budget.remaining > 0) {
    await budget.send(`and ${more} more in the app: <a href="${escapeHtml(appUrl("/"))}">open feed</a>`, { kind: "alert" });
  }
  log(`alerts: ${sent} sent, ${more} more pending, ${budget.remaining} left today`);
  return { sent, held: 0, skipped: null };
}

export type DigestResult = { sent: boolean; reason: string };

export async function buildDigest(chatId: string, now: Date = new Date()): Promise<string> {
  const today = todayIst(now);
  const lastDigest = await lastSentOfKind(chatId, "digest");
  const since = lastDigest ?? new Date(now.getTime() - 86_400_000);
  const actionable: JobStatus[] = ["applied", "referral_asked", "replied", "interviewing", "rejected", "offer"];

  const [fresh, due, applied, counts] = await Promise.all([
    db
      .select(ALERT_JOB_COLUMNS)
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(jobs.status, "new"), gte(jobs.firstSeenAt, since)))
      .orderBy(desc(jobs.matchScore), desc(jobs.postedAt))
      .limit(11),
    db
      .select({ id: jobs.id, company: companies.name, title: jobs.title, nextAction: jobs.nextAction, nextActionDate: jobs.nextActionDate, url: jobs.url })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(inArray(jobs.status, actionable), lte(jobs.nextActionDate, today)))
      .orderBy(asc(jobs.nextActionDate)),
    db
      .select({ id: jobs.id, company: companies.name, title: jobs.title, appliedAt: jobs.appliedAt, url: jobs.url })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(jobs.status, "applied"))
      .orderBy(asc(jobs.appliedAt)),
    statusCounts(),
  ]);

  const chaseCutoff = subWorkingDays(today, 3);
  const chase = applied.filter((j) => j.appliedAt && istDate(j.appliedAt) <= chaseCutoff);

  const line = (company: string, title: string, url: string, tail: string) =>
    `• <b>${escapeHtml(company)}</b> · <a href="${escapeHtml(url)}">${escapeHtml(title)}</a>${tail ? ` · ${escapeHtml(tail)}` : ""}`;

  const parts: string[] = [`<b>Daily digest</b> · ${escapeHtml(todayIst(now))}`];
  if (fresh.length) {
    parts.push("", `<b>New matches since last digest</b> (${fresh.length > 10 ? "10+" : fresh.length})`);
    for (const j of fresh.slice(0, 10)) parts.push(line(j.company, j.title, j.url, `score ${j.matchScore}`));
    if (fresh.length > 10) parts.push(`• and more in the <a href="${escapeHtml(appUrl("/"))}">app</a>`);
  } else parts.push("", "No new matches since the last digest.");
  if (due.length) {
    parts.push("", `<b>Follow-ups due</b> (${due.length})`);
    for (const j of due) parts.push(line(j.company, j.title, j.url, `${j.nextAction ?? "follow up"}${j.nextActionDate && j.nextActionDate < today ? ` (overdue ${j.nextActionDate})` : ""}`));
  }
  if (chase.length) {
    parts.push("", `<b>Chase — no reply after 3 working days</b> (${chase.length})`);
    for (const j of chase) parts.push(line(j.company, j.title, j.url, `applied ${j.appliedAt ? istDate(j.appliedAt) : ""}`));
  }
  parts.push("", `Funnel: ${escapeHtml(funnelLine(counts))}`);
  return parts.join("\n");
}

export async function sendDigestIfDue(now: Date = new Date(), log: (line: string) => void = () => {}): Promise<DigestResult> {
  const target = await telegramTarget();
  if ("skipped" in target) return { sent: false, reason: target.skipped };
  const { chatId, settings } = target;
  if (!isAtOrAfter(settings.digestTime, now)) return { sent: false, reason: "not yet due" };
  if (isQuietHours(settings, now)) return { sent: false, reason: "quiet hours" };
  const last = await lastSentOfKind(chatId, "digest");
  if (last && istDate(last) === todayIst(now)) return { sent: false, reason: "already sent today" };

  const budget = await SendBudget.open(chatId, now);
  const r = await budget.send(await buildDigest(chatId, now), { kind: "digest" });
  log(r.ok ? "digest: sent" : "digest: daily cap reached");
  return r.ok ? { sent: true, reason: "sent" } : { sent: false, reason: "daily cap reached" };
}
