# Changelog

One entry per build phase. Dates are from the git log.

## Phase 5 — async tick, runbook (2026-10-29, `2dfeb26`)

- `/api/tick` inserts the run row, answers 202 with `{ runId }` and finishes the work in `after()`.
- `GET /api/tick/latest` behind the same secret; `pnpm tick:prod` POSTs then polls it.
- Replies to your own commands no longer count toward the 25-per-day cap; alerts and digests still do.
- README rewritten as the runbook: env, local dev, Vercel, webhook, cron-job.org, companies, tuning, cooldown, cap.

## Phase 4 — Telegram bot, alerts, digest (2026-10-29, `28bfa20`)

- grammY bot: pairing by `/start <code>`, "not for you" for anyone else, `/new` `/due` `/stats` `/tick`, inline Applied / Referral asked / Ignore buttons that edit the alert in place.
- Alerts from the tick (score threshold, 10 per tick, "and N more"), daily digest, quiet hours with held alerts, 25-per-day cap; `messages_sent` table and migration 0002.
- Webhook route with the secret header check; scripts `bot:dev`, `bot:set-webhook`, `bot:webhook-info`.
- Re-evaluation bounded to open jobs from the last 30 days in batches of 200.
- "Open in app" links pin and highlight the card on the Feed.

## Phase 3 — screens, templates, re-evaluate (2026-10-29, `7ede7a0`, fix `ab9b9e6`)

- Feed with New / Applied / Referral asked / All open / Older matches views, cards with Apply, Find referrer, Hiring posts, Copy message (three templates) and Mark.
- Tracker with inline status, notes and next-action editing, overdue tint, funnel strip.
- Settings: companies table with Test fetch, add-company with detect, matching rules as tag lists, profile fields, Telegram status, Run tick now, Re-evaluate, last five runs.
- `ignore_reason` column (title, location, age, manual) and migration 0001; new default terms; max age 7 days; Lever timeout 25 s.
- Fix: status labels moved to a pure module so the database client never reaches the browser bundle.

## Phase 2 — sources, matching, tick (2026-10-29, `7acad86`)

- Greenhouse, Lever and Ashby adapters checked against live boards, Zod with passthrough, HTML to text, 20 000-character descriptions.
- Pure matcher and scorer in `src/lib/match.ts`; `runTick` with 40 companies per run, batches of 8, upserts, closing, failure cooldown, `tick_runs`.
- `/api/tick` with `x-tick-secret`; scripts `companies:detect`, `companies:add`, `tick:dry`, `tick:local`.

## Phase 1 — scaffold, auth gate, schema (2026-10-29, `186ef2c`)

- Next.js 16 app with TypeScript, Tailwind, pnpm; `.env.example`.
- Passcode login with a constant-time compare and an HMAC-signed 30-day cookie; `src/proxy.ts` guards every route except login, telegram and tick.
- Drizzle schema for companies, jobs, settings and tick_runs; migration 0000 on Neon; idempotent seed.
- App shell with the three tabs.
