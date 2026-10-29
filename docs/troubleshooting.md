# Troubleshooting

Where to look, in order: **Settings** (companies' last fetch, Telegram status, last five runs),
the **tick_runs** table (`pnpm db:studio` or `GET /api/tick/latest` with the header), the
**cron-job.org response log** (status code per run), and the **Vercel logs** for
`/api/tick` and `/api/telegram` (every tick prints one line per company and a summary).

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No alerts arriving | Not paired, quiet hours, daily cap reached, score below threshold, or the tick is not running | Settings → Telegram and Maintenance; see [No alerts arriving](#no-alerts-arriving) |
| Bot never replies | Webhook missing or wrong secret, or you are writing from a different chat | `pnpm bot:webhook-info`; see [Bot not replying](#bot-not-replying) |
| Company shows `error ×3` | Board slug wrong, board removed, or the board is slow | Test fetch in Settings; see [A company shows error or in cooldown](#a-company-shows-error-or-in-cooldown) |
| Tick takes close to 60 s or never finishes | Many slow Lever boards or a cold Neon | tick_runs durations; see [Tick runs long or times out](#tick-runs-long-or-times-out) |
| 401 from cron-job.org or `tick:prod` | Header name or value does not match `TICK_SECRET` on Vercel | See [401 from cron-job.org or tick:prod](#401-from-cron-joborg-or-tickprod) |
| A job is missing or appears twice | Title/location/age rule, or the board changed the job's id | See [A job missing or duplicated](#a-job-missing-or-duplicated) |
| Older matches is empty | No age-ignored open jobs with a posted date in the last 30 days | See [Older matches empty](#older-matches-empty) |
| "Failed query" or a 25 s first request | Neon compute was asleep | Retry; see [Neon cold-start failures](#neon-cold-start-failures) |
| Bot stopped after local testing | `bot:dev` deleted the webhook | `pnpm bot:set-webhook`; see [Webhook gone after bot:dev](#webhook-gone-after-botdev) |

## No alerts arriving

Look first at Settings → Telegram: it must say "Paired with chat ••••123", and the count line
shows how many of the 25 capped messages went out today, how many alerts are held for quiet
hours, and when the last digest went. Then Settings → Maintenance: the last five runs show
whether ticks are happening at all and how many jobs were notified.

Causes, most common first:

- **Not paired.** Send `/start <TELEGRAM_PAIR_CODE>` to the bot. Pairing a second time just
  overwrites the chat id.
- **Nothing qualifies.** Alerts go only for jobs that are open, status `new`, never notified,
  and score at or above `min_notify_score`. Check the Feed: if the new matches show a score
  below the threshold, lower it in Settings → Matching.
- **Quiet hours** (default 22:00–08:00 IST). The alert is held; it goes out on the first tick
  at or after quiet end. The Settings line says "N alerts held".
- **Cap reached.** 25 alerts and digests per IST day. Tomorrow's first tick resumes.
- **No ticks.** The cron-job.org log shows the status of each call; `tick_runs` should gain a
  row every hour. If the rows stop, the cron job is paused or getting 401.
- **Sends failing.** The tick never fails on Telegram errors; it records them in the run's
  `errors` column ("telegram alerts: ..."). A revoked token shows up here.

## Bot not replying

Run `pnpm bot:webhook-info`. The URL must be your production host with `/api/telegram`,
pending updates should be near zero, and last error empty.

- **URL empty.** `pnpm bot:set-webhook` (with `NEXT_PUBLIC_APP_URL` set to production).
- **Last error 401.** The `TELEGRAM_WEBHOOK_SECRET` Telegram sends differs from the one on
  Vercel. Set it on Vercel, redeploy, then `bot:set-webhook` again.
- **Last error 5xx or timeout.** Open the Vercel logs for `/api/telegram`. A missing
  `TELEGRAM_BOT_TOKEN` gives 503.
- **"not for you".** You are writing from a chat that is not the paired one. Pair from this
  chat with `/start <code>` or go back to the paired chat.
- **Silence after a command.** The route logs "telegram update failed: ..." when a handler
  throws; the usual cause is a database error. Replies to your commands are never capped.
- **A `/tick` from the bot never answers.** It runs a full tick inside the webhook request.
  With many slow boards it can pass the 55 s handler timeout and the reply is dropped, while
  the tick itself still finishes. Use `pnpm tick:prod` instead.

## A company shows error or in cooldown

Settings → Companies shows `ok` or `error` per company, a `×N` counter for consecutive
failures, and the time of the last fetch; hover the status for the error text. After three
failures in a row the company is skipped for six hours, then retried. There is no explicit
"in cooldown" label: `error ×3` (or more) with a last fetch less than six hours ago means it
is being skipped. One successful fetch resets the counter.

- **404 on every fetch.** The slug is wrong or the company left that ATS. Run
  `pnpm companies:detect <careers url>` and fix the row (add again with the right slug; set the
  old one inactive).
- **timeout.** The board is slow. Lever gets 25 s, the others 12 s. Press Test fetch a couple
  of times; if it only fails at the hour, it is load on their side and the cooldown handles it.
- **parse error.** The board returned a shape the adapter does not expect. Fetch the endpoint
  with curl and compare to `src/sources/<ats>.ts`.

A failed fetch never closes that company's jobs, so an error does not make your Feed shrink.

## Tick runs long or times out

`tick_runs` has `started_at` and `finished_at`; the Vercel log line per tick prints the
seconds. A run with `finished_at` null and no later row means the function hit the 60 s limit
(or crashed) before writing the result.

- The tick fetches at most 40 companies per run, in batches of 8; each batch waits for its
  slowest board. Five Lever boards at 20 s each in one batch cost 20 s, not 100 s.
- Set slow, low-value boards to priority 3 and inactive if they keep timing out.
- The first query after Neon has been idle can take 20–25 s; see
  [Neon cold-start failures](#neon-cold-start-failures). Hourly ticks normally keep it warm.
- If you have more than 40 active companies, each tick covers 40 and the next continues with
  the oldest-fetched ones; this is by design, not a hang.

## 401 from cron-job.org or tick:prod

The route compares the `x-tick-secret` header to `TICK_SECRET` on the deployment,
constant-time, and answers 401 on any mismatch or when the header is missing.

- On cron-job.org, check the header name is exactly `x-tick-secret` and the value has no
  quotes or trailing space.
- For `pnpm tick:prod`, the value comes from `.env.local`; it must equal the Vercel value.
- After rotating the secret, redeploy before changing the header (see
  [operations.md](operations.md#tick_secret)).
- `GET /api/tick/latest` needs the same header.

## A job missing or duplicated

Missing from the Feed:

- It was fetched but not matched. Find it in `pnpm db:studio` (`jobs`, filter by title):
  `ignore_reason` says why (`title`, `location`, `age`) and `matched_keywords` shows what hit.
  Adjust the rules and run `pnpm reevaluate`. `age` jobs within 30 days are under the Older
  matches chip.
- The board does not list it in its JSON (some companies hide roles from the API). The app
  reads only the JSON endpoints.
- It is closed: `is_open` false because the board stopped listing it after a successful fetch.

Appearing twice:

- Jobs are unique on (source, external_id). Two rows mean the board re-posted the role with a
  new id; the old one closes on the next successful fetch. Mark the old one ignored.
- The same company added twice under two ATSes or two slugs shows up as two rows in Settings;
  set one inactive.

## Older matches empty

The chip lists jobs that are open, have `ignore_reason = age`, and have a `posted_at` within the
last 30 days. It is empty when every open job is either fresh enough to be a match, excluded
for title or location, or older than 30 days. Jobs with no posted date on the board never
appear here (their age is counted from first seen, but the 30-day window uses `posted_at`).
Raising `max_age_days` in Settings and re-evaluating moves jobs from this chip to New.

## Neon cold-start failures

On the free tier Neon suspends the compute after a few minutes idle. The first query then takes
up to 25 s and occasionally fails with "Failed query" or a connection error. Where it shows:

- Settings → Maintenance "Run tick now" or "Re-evaluate" failing on the first click: click again.
- `pnpm reevaluate` taking 20 s or failing once: rerun.
- A tick run with an `errors` text mentioning the database: the next hourly run will be fine.

Hourly ticks keep the compute warm most of the day. Nothing is lost on a failed run; jobs not
yet notified are picked up by the next one.

## Webhook gone after bot:dev

`pnpm bot:dev` deletes the webhook on start so it can long-poll. `pnpm bot:webhook-info` then
shows an empty URL and production receives no updates. Run `pnpm bot:set-webhook` (it asks
for the host, sets the secret token, drops pending updates and registers the command list)
and confirm with `bot:webhook-info`. Stop `bot:dev` first; two pollers or a poller plus a
webhook conflict and Telegram returns errors to both.
