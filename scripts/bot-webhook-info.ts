/** pnpm bot:webhook-info — print Telegram's view of the webhook (never the token or secret). */
import { getApi } from "../src/bot/api";

async function main() {
  const api = getApi();
  const [me, info] = await Promise.all([api.getMe(), api.getWebhookInfo()]);
  console.log(`bot: @${me.username}`);
  const u = info.url ? new URL(info.url) : null;
  console.log(`url: ${u ? `${u.host}${u.pathname}` : "(none — long polling or not set)"}`);
  console.log(`pending updates: ${info.pending_update_count}`);
  console.log(`last error: ${info.last_error_message ? `${new Date((info.last_error_date ?? 0) * 1000).toISOString()} ${info.last_error_message}` : "none"}`);
  if (info.allowed_updates) console.log(`allowed updates: ${info.allowed_updates.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
