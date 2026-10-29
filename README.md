# Job Radar

A single-user job-alert feed and application tracker. It watches the public JSON job boards
(Greenhouse, Lever, Ashby) of a curated list of target companies, scores new roles against my
profile, and pushes matches to Telegram within the hour with one-tap Apply, Find-referrer and
status buttons. Applying and messaging stay manual by design; nothing is scraped.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored). Every script loads it with `node --env-file`.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (pooled, with `sslmode=require`). |
| `AUTH_SECRET` | HMAC key for the login cookie. `openssl rand -hex 32`. |
| `APP_PASSCODE` | The passcode typed on `/login`. |
| `TICK_SECRET` | Value of the `x-tick-secret` header that `/api/tick` requires. `openssl rand -hex 32`. |
| `TELEGRAM_BOT_TOKEN` | From BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram sends it back as `X-Telegram-Bot-Api-Secret-Token`. Letters, digits, `_` and `-` only. `openssl rand -hex 16`. |
| `TELEGRAM_PAIR_CODE` | Any short word. Typed once as `/start <code>` to pair your chat. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, the Vercel URL in production. Used for "Open in app" links and by the webhook/tick scripts. |

## Local development

```sh
pnpm install
pnpm db:migrate      # apply drizzle/ migrations to DATABASE_URL
pnpm seed            # settings row with defaults (idempotent, never overwrites)
pnpm dev             # http://localhost:3000, sign in with APP_PASSCODE
pnpm bot:dev         # long-poll the Telegram bot against the local database
```

`pnpm bot:dev` **deletes the bot's webhook** so that long polling can receive updates. After any
local bot session, run `pnpm bot:set-webhook` again or production stops receiving Telegram
updates. `pnpm bot:webhook-info` shows which mode the bot is in. If the bot goes quiet after a
local session, see [Webhook gone after bot:dev](docs/troubleshooting.md#webhook-gone-after-botdev).

Other scripts: `pnpm tick:dry` (fetch and score without writing or sending, prints the
would-be matches), `pnpm tick:local` (a real tick against the local `.env.local` database),
`pnpm reevaluate` (re-score open jobs after changing keywords), `pnpm db:studio`,
`pnpm typecheck`, `pnpm lint`.

## Deploying to Vercel

1. Import the GitHub repo in Vercel (Hobby plan, framework preset Next.js, build `pnpm build`).
2. Set every variable from the table above in Project → Settings → Environment Variables.
   `NEXT_PUBLIC_APP_URL` is the production URL, `https://<project>.vercel.app`.
3. Deploy. Migrations are not run by the build: run `pnpm db:migrate` locally with `.env.local`
   pointing at the same Neon database whenever `drizzle/` gains a file (order and rules in
   [operations.md](docs/operations.md#migrations)). A first request that takes 20 s or fails once
   is Neon waking up: [Neon cold-start failures](docs/troubleshooting.md#neon-cold-start-failures).
4. Open `https://<project>.vercel.app/login` and sign in.

Route limits: `/api/tick` and `/api/telegram` export `maxDuration = 60`, the Hobby maximum.

## Setting the Telegram webhook

With `NEXT_PUBLIC_APP_URL` set to the production URL in `.env.local`:

```sh
pnpm bot:set-webhook     # prints the host, asks y/N, sets the webhook with the secret token,
                         # drops pending updates and registers the command list
pnpm bot:webhook-info    # confirm: url, pending updates, last error
```

Then in Telegram send `/start <TELEGRAM_PAIR_CODE>` to the bot. It replies "paired"; the
Settings page shows the chat id with all but the last three digits masked. Any other chat gets
"not for you" and nothing else. Commands: `/new`, `/due`, `/stats`, `/tick`. No reply at all:
[Bot not replying](docs/troubleshooting.md#bot-not-replying).

## cron-job.org

Create one job:

| Field | Value |
| --- | --- |
| URL | `https://<project>.vercel.app/api/tick` |
| Method | `POST` |
| Header | `x-tick-secret: <TICK_SECRET>` |
| Schedule | every hour at minute 5 (`5 * * * *`) |
| Timezone | `Asia/Kolkata` |
| Expected response | `202` with `{ "runId": <n> }` |

The route answers 202 immediately and finishes the run in the background within 60 seconds.
`GET /api/tick/latest` with the same header returns the most recent `tick_runs` row;
`pnpm tick:prod` POSTs the tick, polls `latest` every 3 seconds and prints the summary.
The Settings page lists the last five runs. A 401 in the cron log:
[401 from cron-job.org or tick:prod](docs/troubleshooting.md#401-from-cron-joborg-or-tickprod).
Runs near 60 s: [Tick runs long or times out](docs/troubleshooting.md#tick-runs-long-or-times-out).

## Adding companies

Find the ATS and slug from a careers page (`boards.greenhouse.io/<token>` or
`job-boards.greenhouse.io/<token>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<name>`):

```sh
pnpm companies:detect https://jobs.lever.co/acme     # tries all three ATSes, prints job counts
pnpm companies:detect "Acme Corp"                    # guesses the slug from the name
pnpm companies:add "Acme" lever acme 1               # name, ats, slug, priority (1 dream … 3)
```

Or in Settings → Companies: type a URL or name, press Detect, pick the board that responded,
set a priority and Save. "Test fetch" runs the adapter once and shows the count without writing.
Detect finds nothing or a board keeps failing:
[A company shows error or in cooldown](docs/troubleshooting.md#a-company-shows-error-or-in-cooldown).

## Tuning keywords and re-evaluating

Settings → Matching holds the title include/exclude lists, description boosts, locations,
remote and unknown-location switches, max age in days and the minimum score for a Telegram alert.
Saving does not re-score existing jobs: press "Re-evaluate open jobs" (or run `pnpm reevaluate`).
It re-scores open jobs first seen in the last 30 days whose status is new or ignored, in batches
of 200, and never touches jobs you have acted on or ignored by hand. `pnpm reevaluate --all`
also covers closed and older jobs. A role you expected is not in the Feed:
[A job missing or duplicated](docs/troubleshooting.md#a-job-missing-or-duplicated); the chip is
empty: [Older matches empty](docs/troubleshooting.md#older-matches-empty).

## Failing boards and cooldown

In Settings → Companies the "last fetch" column shows `ok` or `error` with the message (HTTP
status, timeout, parse failure) and the time. Each failure increments the company's consecutive
failure count; after 3 the company is skipped for 6 hours, then retried. One success resets the
count. A failed fetch never closes that company's jobs; only a successful response that no
longer lists a job marks it closed. Timeouts: Lever 25 s, Greenhouse and Ashby 12 s. Each tick
fetches at most 40 companies (oldest `last_fetched_at` first) in batches of 8; the next tick
continues with the rest.

## Daily cap and quiet hours

The bot sends at most 25 alerts and digests per day (IST) to the paired chat. Replies to your own
commands and button presses are not counted. Each tick sends at most 10 alerts, then one
"and N more in the app" line; the rest go out on later ticks. Nothing is sent during quiet hours
(default 22:00–08:00 IST); alerts that come in then are held and released by the first tick at or
after quiet end. The digest goes out on the first tick at or after the digest time (default
08:30 IST), once per day. Settings → Telegram shows today's count, held alerts and the last digest.
Expected an alert that never came: [No alerts arriving](docs/troubleshooting.md#no-alerts-arriving).

## Documentation

- [docs/README.md](docs/README.md) — index of everything below.
- [docs/architecture.md](docs/architecture.md) — what runs where, request flows, data model, status transitions, map of `src/`.
- [docs/operations.md](docs/operations.md) — companies, slugs, keyword tuning, quiet hours and cap, rotating secrets, redeploys, migrations, cron-job.org.
- [docs/troubleshooting.md](docs/troubleshooting.md) — symptom → cause → fix, and where to look first.
- [docs/scoring.md](docs/scoring.md) — matching rules and score table with worked examples.
- [docs/telegram.md](docs/telegram.md) — pairing, commands, alerts, digest, buttons, quiet hours, cap.
- [CHANGELOG.md](CHANGELOG.md) — one entry per build phase.
- [CLAUDE.md](CLAUDE.md) — the spec, kept in step with the code.
