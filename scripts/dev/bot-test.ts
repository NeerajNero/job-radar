/**
 * Phase 4 verification harness (not a pnpm script). Feeds real Telegram update objects to the bot
 * with the Telegram HTTP API mocked, so every outbound call is captured and printed while the
 * database writes are real. Restores the test state at the end.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import type { Transformer } from "grammy";
import { getApi } from "../../src/bot/api";
import { getBot } from "../../src/bot";
import { db } from "../../src/db";
import { jobs, messagesSent, settings } from "../../src/db/schema";
import { fromZonedTime } from "date-fns-tz";
import { sendDigestIfDue, sendNewJobAlerts } from "../../src/lib/notify";
import { IST, todayIst } from "../../src/lib/dates";

const CHAT = 123456789;
const STRANGER = 999000111;
const PAIR_CODE = process.env.TELEGRAM_PAIR_CODE!;
type Call = { method: string; payload: Record<string, unknown> };
const calls: Call[] = [];
let msgId = 100;
let failures = 0;

const mock: Transformer = async (_prev, method, payload) => {
  calls.push({ method, payload: (payload ?? {}) as Record<string, unknown> });
  const result = (() => {
    switch (method) {
      case "getMe":
        return { id: 1, is_bot: true, first_name: "test", username: "testbot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false };
      case "sendMessage":
        return { message_id: ++msgId, date: 0, chat: { id: Number((payload as { chat_id: number }).chat_id), type: "private" }, text: (payload as { text: string }).text };
      default:
        return true;
    }
  })();
  return { ok: true, result } as never;
};

function check(name: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function ist(hhmm: string, date = "2026-10-29") {
  return fromZonedTime(`${date}T${hhmm}:00`, IST);
}
let updId = 1;
function msg(chat: number, text: string) {
  return { update_id: updId++, message: { message_id: ++msgId, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" as const, first_name: "t" }, from: { id: chat, is_bot: false, first_name: "t" }, text, entities: text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }] : [] } };
}
function cb(chat: number, data: string, messageId: number) {
  return { update_id: updId++, callback_query: { id: "cbq1", from: { id: chat, is_bot: false, first_name: "t" }, chat_instance: "x", data, message: { message_id: messageId, date: 0, chat: { id: chat, type: "private" as const, first_name: "t" }, text: "alert" } } };
}
function sent(from = 0) {
  return calls.slice(from).filter((c) => c.method === "sendMessage");
}
function show(c: Call) {
  const p = c.payload;
  const kb = p.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } | undefined;
  console.log(`  → ${c.method} chat=***${String(p.chat_id ?? "").slice(-3)}${p.parse_mode ? ` [${p.parse_mode}]` : ""}${p.text !== undefined ? `\n     ${String(p.text).split("\n").join("\n     ")}` : ""}${kb?.inline_keyboard ? `\n     buttons: ${kb.inline_keyboard.flat().map((b) => `${b.text} (${b.callback_data})`).join(" · ")}` : ""}${p.text === undefined && c.method === "answerCallbackQuery" ? ` text="${p.text ?? ""}"` : ""}`);
}

async function main() {
  const bot = getBot();
  bot.api.config.use(mock);
  getApi().config.use(mock);
  await bot.init();

  const [before] = await db.select({ chat: settings.telegramChatId }).from(settings).where(eq(settings.id, 1));
  const candidates = await db.select({ id: jobs.id, status: jobs.status, notifiedAt: jobs.notifiedAt, score: jobs.matchScore }).from(jobs).where(and(eq(jobs.status, "new")));
  console.log(`setup: paired chat before = ${before.chat ?? "null"}; new jobs: ${candidates.map((j) => `#${j.id} score ${j.score}`).join(", ")}`);

  // 1. strangers and wrong code
  let m = calls.length;
  await bot.handleUpdate(msg(CHAT, "/start wrongcode"));
  check("wrong pair code → one 'not for you'", sent(m).length === 1 && sent(m)[0].payload.text === "not for you");
  show(sent(m)[0]);
  m = calls.length;
  await bot.handleUpdate(msg(CHAT, "/stats"));
  check("unpaired /stats → one 'not for you'", sent(m).length === 1 && sent(m)[0].payload.text === "not for you");

  // 2. pairing
  m = calls.length;
  await bot.handleUpdate(msg(CHAT, `/start ${PAIR_CODE}`));
  const [paired] = await db.select({ chat: settings.telegramChatId }).from(settings).where(eq(settings.id, 1));
  check("/start <code> pairs and replies 'paired'", paired.chat === String(CHAT) && sent(m).length === 1 && sent(m)[0].payload.text === "paired");
  show(sent(m)[0]);

  // 3. commands
  for (const cmd of ["/stats", "/new", "/due"]) {
    m = calls.length;
    await bot.handleUpdate(msg(CHAT, cmd));
    check(`${cmd} → one HTML reply`, sent(m).length === 1 && sent(m)[0].payload.parse_mode === "HTML");
    show(sent(m)[0]);
  }
  m = calls.length;
  await bot.handleUpdate(msg(STRANGER, "/stats"));
  check("different chat /stats → one 'not for you'", sent(m).length === 1 && sent(m)[0].payload.text === "not for you" && String(sent(m)[0].payload.chat_id) === String(STRANGER));

  // 4. /tick (real tick against live boards, mocked sends)
  m = calls.length;
  const t0 = Date.now();
  await bot.handleUpdate(msg(CHAT, "/tick"));
  const tickSends = sent(m);
  const alerts = tickSends.filter((c) => (c.payload.reply_markup as { inline_keyboard?: unknown } | undefined)?.inline_keyboard);
  const summary = tickSends[tickSends.length - 1];
  check(`/tick → ${alerts.length} alert(s) with buttons + summary (${((Date.now() - t0) / 1000).toFixed(1)}s)`, alerts.length >= 1 && String(summary.payload.text).startsWith("Tick:"));
  for (const c of tickSends) show(c);
  const alertedIds = alerts.map((c) => Number(String((c.payload.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard[0][0].callback_data).split(":")[1]));
  const notifiedRows = await db.select({ id: jobs.id, notifiedAt: jobs.notifiedAt }).from(jobs).where(inArray(jobs.id, alertedIds.length ? alertedIds : [-1]));
  check("notified_at set on alerted jobs", notifiedRows.length === alertedIds.length && notifiedRows.every((r) => r.notifiedAt !== null));
  const alertRows = await db.select({ id: messagesSent.id }).from(messagesSent).where(and(eq(messagesSent.chatId, String(CHAT)), eq(messagesSent.kind, "alert")));
  check("messages_sent has one alert row per alert", alertRows.length === alerts.length, `${alertRows.length} rows`);

  // 5. press Applied on the first alert
  const target = alertedIds[0];
  m = calls.length;
  await bot.handleUpdate(cb(CHAT, `s:${target}:applied`, 101));
  const [after] = await db.select({ status: jobs.status, appliedAt: jobs.appliedAt, nextAction: jobs.nextAction, nextActionDate: jobs.nextActionDate }).from(jobs).where(eq(jobs.id, target));
  const edit = calls.slice(m).find((c) => c.method === "editMessageText");
  const ans = calls.slice(m).find((c) => c.method === "answerCallbackQuery");
  check(`Applied button → job #${target} applied in DB`, after.status === "applied" && !!after.appliedAt && after.nextAction === "follow up" && !!after.nextActionDate, `next action ${after.nextAction} on ${after.nextActionDate}`);
  check("message edited in place with result, buttons removed", !!edit && String(edit.payload.text).includes("Marked applied") && !edit.payload.reply_markup && edit.payload.parse_mode === "HTML");
  check("callback answered", !!ans && ans.payload.text === "Marked applied");
  if (edit) show(edit);
  check("no new message sent for a button press", sent(m).length === 0);

  // 6. quiet hours hold and release (put the test job back to new and un-notified first)
  const quietJob = target;
  await db.update(jobs).set({ status: "new", appliedAt: null, nextAction: null, nextActionDate: null, ignoreReason: null, notifiedAt: null }).where(eq(jobs.id, quietJob));
  m = calls.length;
  const hold = await sendNewJobAlerts(ist("23:15"));
  const heldRows = await db.select({ id: messagesSent.id }).from(messagesSent).where(and(eq(messagesSent.kind, "held"), eq(messagesSent.jobId, quietJob)));
  check("23:15 IST → alert held, nothing sent, held row recorded", hold.sent === 0 && hold.held >= 1 && sent(m).length === 0 && heldRows.length === 1);
  await sendNewJobAlerts(ist("02:00", "2026-10-30"));
  const heldRows2 = await db.select({ id: messagesSent.id }).from(messagesSent).where(and(eq(messagesSent.kind, "held"), eq(messagesSent.jobId, quietJob)));
  check("02:00 IST → still held, not recorded twice", sent(m).length === 0 && heldRows2.length === 1);
  const release = await sendNewJobAlerts(ist("08:00", "2026-10-30"));
  check("08:00 IST (quiet_end) → held alert released", release.sent === 1 && sent(m).length === 1);
  show(sent(m)[0]);

  // 7. digest timing
  m = calls.length;
  const d1 = await sendDigestIfDue(ist("07:00", "2026-10-30"));
  const d2 = await sendDigestIfDue(ist("08:30", "2026-10-30"));
  const d3 = await sendDigestIfDue(ist("09:30", "2026-10-30"));
  check("digest: 07:00 not due, 08:30 sent, 09:30 already sent today", !d1.sent && d2.sent && !d3.sent && d3.reason === "already sent today", `${d1.reason} / ${d2.reason} / ${d3.reason}`);
  show(sent(m)[0]);

  // 8. daily cap
  const today = ist("12:00", todayIst());
  await db.insert(messagesSent).values(Array.from({ length: 25 }, () => ({ chatId: String(CHAT), kind: "alert" as const, sentAt: today })));
  await db.delete(messagesSent).where(and(eq(messagesSent.chatId, String(CHAT)), eq(messagesSent.kind, "digest")));
  await db.update(jobs).set({ notifiedAt: null, status: "new" }).where(eq(jobs.id, quietJob));
  m = calls.length;
  await bot.handleUpdate(msg(CHAT, "/stats"));
  const capAlerts = await sendNewJobAlerts(today);
  const capDigest = await sendDigestIfDue(today);
  check("25 alerts today → /stats reply still sent, alerts and digest dropped", sent(m).length === 1 && capAlerts.sent === 0 && !capDigest.sent && capDigest.reason === "daily cap reached", `${sent(m).length} reply, alerts ${capAlerts.sent}, digest ${capDigest.reason}`);

  // cleanup: restore pairing, remove test rows, un-apply the test job, reset notified_at
  await db.delete(messagesSent).where(or(eq(messagesSent.chatId, String(CHAT)), eq(messagesSent.chatId, String(STRANGER))));
  await db.update(settings).set({ telegramChatId: before.chat }).where(eq(settings.id, 1));
  await db.update(jobs).set({ status: "new", appliedAt: null, nextAction: null, nextActionDate: null, ignoreReason: null, statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, target));
  if (alertedIds.length) await db.update(jobs).set({ notifiedAt: null }).where(inArray(jobs.id, alertedIds));
  console.log(`cleanup: pairing restored to ${before.chat ?? "null"}, test messages deleted, job #${target} back to new, notified_at cleared on ${alertedIds.join(", ")}`);
  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} (${calls.length} Telegram API calls captured)`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
