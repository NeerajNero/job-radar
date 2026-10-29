/**
 * Telegram send budget and bookkeeping shared by the alerts, the digest and the bot replies.
 * Every message to the paired chat is recorded in messages_sent; the daily cap, the
 * digest-sent-today check and the quiet-hours hold all read from that table. All times IST.
 * The cap applies to what the bot sends on its own (alerts and the digest); replies to the
 * user's own commands are recorded but never capped.
 */
import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { InlineKeyboard } from "grammy";
import { getApi } from "@/bot/api";
import { db } from "@/db";
import { jobs, messagesSent, type MessageKind, type Settings } from "@/db/schema";
import { istDayStart, istMinutes, timeToMinutes } from "./dates";

export const DAILY_CAP = 25;
/** Message kinds the daily cap counts. */
export const CAPPED_KINDS: MessageKind[] = ["alert", "digest"];
export const ALERTS_PER_TICK = 10;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Chat id for display: everything but the last 3 digits masked. */
export function maskChatId(chatId: string): string {
  const digits = chatId.replace(/^-/, "");
  return `${"•".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

export function appUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}${path}`;
}

/** True between quiet_start and quiet_end IST (wrapping past midnight). Equal times = never quiet. */
export function isQuietHours(settings: Pick<Settings, "quietStart" | "quietEnd">, now: Date = new Date()): boolean {
  const start = timeToMinutes(settings.quietStart);
  const end = timeToMinutes(settings.quietEnd);
  const m = istMinutes(now);
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** True once the IST clock has reached `time` ("HH:mm[:ss]") today. */
export function isAtOrAfter(time: string, now: Date = new Date()): boolean {
  return istMinutes(now) >= timeToMinutes(time);
}

/** Capped messages (alerts and digests) sent to this chat so far today (IST). */
export async function sentTodayCount(chatId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(messagesSent)
    .where(and(eq(messagesSent.chatId, chatId), inArray(messagesSent.kind, CAPPED_KINDS), gte(messagesSent.sentAt, istDayStart(now))));
  return row?.n ?? 0;
}

/** For the Settings page: today's capped sends, alerts still held (notified_at null), last digest. */
export async function telegramStatus(chatId: string, now: Date = new Date()): Promise<{ sent: number; held: number; lastDigest: Date | null }> {
  const [sent, [held], lastDigest] = await Promise.all([
    sentTodayCount(chatId, now),
    db
      .select({ n: count() })
      .from(messagesSent)
      .innerJoin(jobs, eq(jobs.id, messagesSent.jobId))
      .where(and(eq(messagesSent.chatId, chatId), eq(messagesSent.kind, "held"), isNull(jobs.notifiedAt))),
    lastSentOfKind(chatId, "digest"),
  ]);
  return { sent, held: held?.n ?? 0, lastDigest };
}

export async function lastSentOfKind(chatId: string, kind: MessageKind): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: messagesSent.sentAt })
    .from(messagesSent)
    .where(and(eq(messagesSent.chatId, chatId), eq(messagesSent.kind, kind)))
    .orderBy(desc(messagesSent.sentAt))
    .limit(1);
  return row?.sentAt ?? null;
}

export async function recordMessage(row: { chatId: string; kind: MessageKind; jobId?: number | null; sentAt?: Date }) {
  await db.insert(messagesSent).values({ chatId: row.chatId, kind: row.kind, jobId: row.jobId ?? null, sentAt: row.sentAt ?? new Date() });
}

export type SendOptions = { kind: MessageKind; jobId?: number | null; keyboard?: InlineKeyboard };
export type SendResult = { ok: true; messageId: number } | { ok: false; reason: "cap" };

/**
 * A per-run send budget for one chat: counts today's messages once, then decrements per send.
 * Opened at the start of a tick or of one bot update.
 */
export class SendBudget {
  private constructor(
    readonly chatId: string,
    private sentToday: number,
    readonly now: Date,
  ) {}

  static async open(chatId: string, now: Date = new Date()): Promise<SendBudget> {
    return new SendBudget(chatId, await sentTodayCount(chatId, now), now);
  }

  get remaining(): number {
    return Math.max(0, DAILY_CAP - this.sentToday);
  }

  /** Send one HTML message (capped kinds only while the cap allows), record it, return the id. */
  async send(html: string, opts: SendOptions): Promise<SendResult> {
    const capped = CAPPED_KINDS.includes(opts.kind);
    if (capped && this.remaining <= 0) return { ok: false, reason: "cap" };
    const msg = await getApi().sendMessage(this.chatId, html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.keyboard,
    });
    if (capped) this.sentToday++;
    await recordMessage({ chatId: this.chatId, kind: opts.kind, jobId: opts.jobId, sentAt: this.now });
    return { ok: true, messageId: msg.message_id };
  }
}
