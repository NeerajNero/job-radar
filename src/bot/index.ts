/**
 * The Telegram bot (grammY). One instance, used by the webhook route and by `pnpm bot:dev`.
 * Pairing: /start <code> with code = TELEGRAM_PAIR_CODE stores (overwrites) the chat id.
 * Any update from an unpaired or different chat gets exactly one "not for you" and nothing else.
 * Commands call the library functions directly; inline buttons use the same status transitions
 * as the Feed. HTML parse mode everywhere, with titles and company names escaped.
 */
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { Api, Bot, Context } from "grammy";
import type { BotCommand } from "grammy/types";
import { db } from "@/db";
import { companies, jobs, settings as settingsTable, type JobStatus } from "@/db/schema";
import { istDayStart, todayIst } from "@/lib/dates";
import { STATUS_LABELS } from "@/lib/job-status";
import { setJobStatus } from "@/lib/jobs";
import { SendBudget, appUrl, escapeHtml } from "@/lib/messaging";
import { formatAlert, loadAlertJob } from "@/lib/notify";
import { loadSettings } from "@/lib/settings";
import { funnelLine, statusCounts } from "@/lib/stats";
import { runTick } from "@/lib/tick";
import { botToken } from "./api";

export const BOT_COMMANDS: BotCommand[] = [
  { command: "new", description: "Today's new matches, top 10 by score" },
  { command: "due", description: "Follow-ups due today or overdue" },
  { command: "stats", description: "Funnel counts" },
  { command: "tick", description: "Run the tick now" },
];

const NOT_FOR_YOU = "not for you";
const CALLBACK_RE = /^s:(\d+):(applied|referral_asked|ignored)$/;

export async function registerCommands(api: Api): Promise<void> {
  await api.setMyCommands(BOT_COMMANDS);
}

function startCode(text: string | undefined): string | null {
  const m = text?.match(/^\/start(?:@\w+)?\s+(\S+)\s*$/);
  return m ? m[1] : null;
}

/** Reply to the paired chat, recorded as kind=reply (replies to own commands are never capped). */
async function reply(ctx: Context, html: string): Promise<boolean> {
  const chatId = String(ctx.chat?.id ?? "");
  const budget = await SendBudget.open(chatId);
  const r = await budget.send(html, { kind: "reply" });
  return r.ok;
}

const line = (company: string, title: string, url: string, tail: string) =>
  `• <b>${escapeHtml(company)}</b> · <a href="${escapeHtml(url)}">${escapeHtml(title)}</a> · ${escapeHtml(tail)}`;

async function newToday(): Promise<string> {
  const rows = await db
    .select({ id: jobs.id, company: companies.name, title: jobs.title, url: jobs.url, score: jobs.matchScore })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.status, "new"), gte(jobs.firstSeenAt, istDayStart())))
    .orderBy(desc(jobs.matchScore), desc(jobs.postedAt))
    .limit(11);
  if (rows.length === 0) return "No new matches today.";
  const out = [`<b>New today</b> (${rows.length > 10 ? "10+" : rows.length})`, ...rows.slice(0, 10).map((j) => line(j.company, j.title, j.url, `score ${j.score}`))];
  if (rows.length > 10) out.push(`• and more in the <a href="${escapeHtml(appUrl("/"))}">app</a>`);
  return out.join("\n");
}

async function dueToday(): Promise<string> {
  const today = todayIst();
  const actionable: JobStatus[] = ["applied", "referral_asked", "replied", "interviewing", "rejected", "offer"];
  const where: SQL | undefined = and(inArray(jobs.status, actionable), lte(jobs.nextActionDate, today));
  const rows = await db
    .select({ company: companies.name, title: jobs.title, url: jobs.url, nextAction: jobs.nextAction, nextActionDate: jobs.nextActionDate, status: jobs.status })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(where)
    .orderBy(asc(jobs.nextActionDate));
  if (rows.length === 0) return "Nothing due today.";
  return [
    `<b>Due</b> (${rows.length})`,
    ...rows.map((j) =>
      line(j.company, j.title, j.url, `${j.nextAction ?? "follow up"} · ${STATUS_LABELS[j.status]}${j.nextActionDate && j.nextActionDate < today ? ` · overdue since ${j.nextActionDate}` : ""}`),
    ),
  ].join("\n");
}

let bot: Bot | undefined;

export function getBot(): Bot {
  if (bot) return bot;
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const b = new Bot(token);

  // Gate: pairing first, then exactly one "not for you" for anyone else.
  b.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return; // inline queries etc.: nothing to say
    const code = startCode(ctx.message?.text);
    if (code !== null && process.env.TELEGRAM_PAIR_CODE && code === process.env.TELEGRAM_PAIR_CODE) {
      await db.update(settingsTable).set({ telegramChatId: String(chatId) }).where(eq(settingsTable.id, 1));
      await reply(ctx, "paired");
      return;
    }
    const settings = await loadSettings();
    if (!settings.telegramChatId || settings.telegramChatId !== String(chatId)) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: NOT_FOR_YOU });
      else await ctx.reply(NOT_FOR_YOU);
      return;
    }
    await next();
  });

  b.command(["start", "help"], (ctx) => reply(ctx, ["Paired. Commands:", ...BOT_COMMANDS.map((c) => `/${c.command} — ${escapeHtml(c.description)}`)].join("\n")));
  b.command("new", async (ctx) => reply(ctx, await newToday()));
  b.command("due", async (ctx) => reply(ctx, await dueToday()));
  b.command("stats", async (ctx) => reply(ctx, `Funnel: ${escapeHtml(funnelLine(await statusCounts()))}`));
  b.command("tick", async (ctx) => {
    const r = await runTick({ log: (l) => console.log(l) });
    const errors = r.errors.length ? `\n${r.errors.map((e) => `• ${escapeHtml(e)}`).join("\n")}` : "";
    await reply(ctx, `Tick: fetched ${r.fetched}, new ${r.new}, notified ${r.notified}, errors ${r.errors.length} (${(r.durationMs / 1000).toFixed(1)}s)${errors}`);
  });

  b.callbackQuery(CALLBACK_RE, async (ctx) => {
    const m = ctx.match as RegExpMatchArray;
    const jobId = Number(m[1]);
    const status = m[2] as JobStatus;
    await setJobStatus(jobId, status);
    const job = await loadAlertJob(jobId);
    const label = STATUS_LABELS[status];
    if (job) {
      // Edit the original alert in place: same text, result line appended, buttons removed.
      await ctx.editMessageText(formatAlert(job, `Marked ${escapeHtml(label.toLowerCase())}`), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    }
    await ctx.answerCallbackQuery({ text: `Marked ${label.toLowerCase()}` });
  });

  b.catch((err) => {
    console.error("bot error:", err.error instanceof Error ? err.error.message : String(err.error));
  });

  bot = b;
  return b;
}
