/**
 * pnpm bot:set-webhook — point Telegram at NEXT_PUBLIC_APP_URL/api/telegram with the secret token
 * and drop pending updates, then register the command list. Prints only the host and asks y/N.
 */
import { createInterface } from "node:readline/promises";
import { getApi } from "../src/bot/api";
import { registerCommands } from "../src/bot";

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
  const url = new URL("/api/telegram", base);
  if (url.protocol !== "https:") throw new Error(`Telegram requires an https webhook; NEXT_PUBLIC_APP_URL is ${url.protocol}//`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Set the Telegram webhook to host ${url.host} (drops pending updates)? y/N `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("aborted");
    return;
  }
  const api = getApi();
  await api.setWebhook(url.toString(), { secret_token: secret, drop_pending_updates: true, allowed_updates: ["message", "callback_query"] });
  await registerCommands(api);
  const info = await api.getWebhookInfo();
  console.log(`webhook set: host=${info.url ? new URL(info.url).host : "(none)"} pending=${info.pending_update_count} commands registered`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
