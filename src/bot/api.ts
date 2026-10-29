/** A bare grammY Api client (no update handling) used for outbound sends from the tick. */
import { Api } from "grammy";

let api: Api | undefined;

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function getApi(): Api {
  if (!api) {
    const token = botToken();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    api = new Api(token);
  }
  return api;
}
