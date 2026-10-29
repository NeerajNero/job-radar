/**
 * pnpm bot:dev — delete any webhook, then long-poll with the same bot instance for local testing.
 * Replies go to real Telegram; the database is DATABASE_URL from .env.local.
 */
import { getBot, registerCommands } from "../src/bot";

async function main() {
  const bot = getBot();
  await bot.api.deleteWebhook();
  await registerCommands(bot.api);
  bot.use(async (ctx, next) => {
    const chat = String(ctx.chat?.id ?? "");
    const what = ctx.message?.text ?? (ctx.callbackQuery ? `callback ${ctx.callbackQuery.data}` : ctx.update.message ? "message" : "update");
    console.log(`${new Date().toISOString()} chat ***${chat.slice(-3)}: ${what}`);
    await next();
  });
  await bot.start({
    onStart: (me) => console.log(`bot:dev polling as @${me.username} (webhook deleted, commands registered). Ctrl-C to stop.`),
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
