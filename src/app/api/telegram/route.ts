/**
 * Telegram webhook. Rejects any request whose X-Telegram-Bot-Api-Secret-Token header does not
 * equal TELEGRAM_WEBHOOK_SECRET, then hands the update to grammY.
 */
import { webhookCallback } from "grammy";
import { NextResponse } from "next/server";
import { getBot } from "@/bot";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// /tick from the bot runs a full tick inside this request; keep under the plan maximum.
export const maxDuration = 60;

let handler: ((req: Request) => Promise<Response>) | undefined;

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !(await safeEqual(given, expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "bot not configured" }, { status: 503 });
  }
  handler ??= webhookCallback(getBot(), "std/http", { secretToken: expected, timeoutMilliseconds: 55_000, onTimeout: "return" });
  try {
    return await handler(request);
  } catch (err) {
    // In webhook mode grammY does not route handler errors through bot.catch; a non-2xx here
    // would make Telegram retry the same update, so log it and acknowledge.
    console.error("telegram update failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false });
  }
}
