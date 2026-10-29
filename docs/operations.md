# Operations

Day-to-day tasks, in the order you are likely to need them. Every command loads `.env.local`.
Replace `<...>` placeholders with your values; never paste real secrets into a doc or a chat.

## Adding a company

1. Find the ATS and slug (next section).
2. Probe it:
   ```sh
   pnpm companies:detect https://jobs.lever.co/<slug>
   pnpm companies:detect "<Company name>"
   ```
   The script guesses a slug from the URL path (or the lowercased name), tries all three ATSes
   and prints which one responded and how many jobs it lists.
3. Add it with the ATS and slug that responded, and a priority (1 dream company, 2 normal, 3 nice to have):
   ```sh
   pnpm companies:add "<Company name>" <greenhouse|lever|ashby> <slug> <1|2|3>
   ```
   Adding the same (ats, slug) again updates the name and priority instead of duplicating.
4. Or use Settings → Companies → Add: type the URL or name, press Detect, pick the board that
   responded, choose a priority, Save.
5. The next tick fetches it (new companies sort first because `last_fetched_at` is null).
   Press Test fetch in Settings to see the count now without writing anything.

## Finding a slug for each ATS

Open the company's careers page and look at the URL once you click into a job:

| ATS | URL pattern | Slug | Endpoint the app reads |
| --- | --- | --- | --- |
| Greenhouse | `boards.greenhouse.io/<token>` or `job-boards.greenhouse.io/<token>` | `<token>` | `boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` |
| Lever | `jobs.lever.co/<slug>` | `<slug>` | `api.lever.co/v0/postings/<slug>?mode=json` |
| Ashby | `jobs.ashbyhq.com/<name>` | `<name>` | `api.ashbyhq.com/posting-api/job-board/<name>` |

If the careers page is on the company's own domain, the job's "Apply" link usually points at
one of these hosts. If detect finds nothing, try the lowercased company name and obvious
variants (`acme`, `acmeinc`, `acme-corp`). A board that answers 404 on all three is not on any
of these ATSes and cannot be watched in v1.

## Removing or pausing a company

There is no delete button. Turn off Active in Settings → Companies: the tick skips it and its
jobs stay in the database with their status. To remove it entirely, delete the row in
`pnpm db:studio`; jobs cascade.

## Tuning keywords

Settings → Matching: title include, title exclude, description boosts, locations, the remote
and unknown-location switches, max age in days and the minimum score for a Telegram alert.
Terms are matched whole-word and case-insensitive; `next.js`, `full-stack` and `.net` are safe.
Saving changes only future scoring. Then:

```sh
pnpm reevaluate          # open jobs first seen in the last 30 days, batches of 200
pnpm reevaluate --all    # also closed and older jobs; slow on a big table
```

or press Re-evaluate open jobs in Settings → Maintenance. Re-evaluation never touches jobs you
have acted on (applied onwards) or ignored by hand. Run it after any change to the lists, the
switches or max age. See [scoring.md](scoring.md) for what the rules do.

## Quiet hours, digest time, daily cap

`quiet_start`, `quiet_end` and `digest_time` are columns on the `settings` row (times in IST).
They are not on the Settings page yet; change them in `pnpm db:studio`. The cap of 25 is the
constant `DAILY_CAP` in `src/lib/messaging.ts`. Alerts that arrive in quiet hours are held and
go out on the first tick at or after `quiet_end`; the digest goes out on the first tick at or
after `digest_time`, once per IST day. See [telegram.md](telegram.md).

## Rotating secrets

Each secret lives in three places at most: Vercel environment variables, `.env.local`, and one
external system. Order matters because the deployed code compares against the Vercel value.

### APP_PASSCODE

1. Set the new value in Vercel → Settings → Environment Variables.
2. Redeploy.
3. Update `.env.local`.

Nothing breaks in between: existing sessions keep working because the cookie is signed with
`AUTH_SECRET`, not the passcode. Only new logins need the new passcode.

### AUTH_SECRET

1. Set the new value in Vercel. 2. Redeploy. 3. Update `.env.local`.

Every browser is logged out at the redeploy; sign in again. Nothing else depends on it.

### TICK_SECRET

1. Set the new value in Vercel and redeploy.
2. Change the `x-tick-secret` header on the cron-job.org job.
3. Update `.env.local` (for `pnpm tick:prod`).

Between steps 1 and 2 cron-job.org gets 401 and the tick_runs table shows a gap. If you do
step 2 first, cron-job.org gets 401 until the deploy finishes. Either way you lose at most one
hourly run; run `pnpm tick:prod` afterwards to catch up.

### TELEGRAM_WEBHOOK_SECRET

1. Set the new value in Vercel and redeploy.
2. Update `.env.local`.
3. Run `pnpm bot:set-webhook` so Telegram starts sending the new header value.

If you run step 3 before the deploy finishes, Telegram sends the new value, the old deployment
answers 401, and Telegram keeps retrying those updates: `pnpm bot:webhook-info` shows a rising
pending count and a last error. They are delivered once the deploy is live. If you deploy and
forget step 3, Telegram keeps sending the old value, every update gets 401, and the bot looks
dead until you run `bot:set-webhook`.

### TELEGRAM_BOT_TOKEN

1. In BotFather, revoke the token. The old token stops working at once; the bot is down from here.
2. Set the new token in Vercel and in `.env.local`.
3. Redeploy.
4. Run `pnpm bot:set-webhook` (the webhook and command list are safest re-registered).
5. Send `/stats` to confirm. Pairing survives: the chat id is in the database, not the token.

While the bot is down, alerts fail inside the tick, are recorded as tick errors and stay
un-notified, so they go out on the first tick after step 4.

## Redeploying

Push to `main`; Vercel builds and deploys. For a change that does not come from a commit, use
Deployments → Redeploy in Vercel. A redeploy is also how a changed environment variable takes
effect.

## Migrations

Local scripts and production share one Neon database, so a schema change is applied once:

1. Edit `src/db/schema.ts`, run `pnpm db:generate`, review the new file in `drizzle/`.
2. Run `pnpm db:migrate` **before** pushing the code. Keep migrations additive (new columns
   with defaults, new tables) so the deployment that is still running keeps working until the
   new one is live.
3. Push. `pnpm typecheck` and `pnpm lint` must pass first.

`drizzle/meta/_journal.json` records what has been applied; commit it with the migration.

## cron-job.org changes

The job is a POST to `https://<project>.vercel.app/api/tick` with header
`x-tick-secret: <TICK_SECRET>`, hourly, timezone Asia/Kolkata. The route answers 202 within a
second; the work finishes in the background, so a 202 in the cron log means "accepted", not
"done". Check Settings → Maintenance (last five runs) or `GET /api/tick/latest` with the header
for the outcome. To pause alerts, disable the job there; to change the hour offset, edit the
schedule (minute 5 avoids the top-of-hour rush on the boards).

## bot:dev deletes the webhook

`pnpm bot:dev` must delete the webhook so that long polling can receive updates. Production
receives nothing while it runs, and nothing after it stops either, until you run
`pnpm bot:set-webhook`. Make that the last command of every local bot session, and confirm with
`pnpm bot:webhook-info`.
