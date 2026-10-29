# Job Radar — personal job-alert feed and application tracker

## What this is
A single-user web app plus Telegram bot that watches the public job boards of a curated list of
target companies, surfaces new roles that match my profile within the hour, and tracks what I did
about each one (applied, asked for a referral, replied, interviewing). It also generates the outreach
message for a given job and deep-links to the apply page and to a LinkedIn people search for that
company, so acting on a job takes one tap.

It is NOT a scraper and NOT an auto-applier. It reads only the documented public JSON endpoints that
Greenhouse, Lever and Ashby publish for every customer's careers page. It never touches LinkedIn,
Naukri or any HTML page. Applying and messaging stay manual by design.

Exactly one user (me). Total running cost must stay ₹0. Timebox: one working day. Mobile-first
(Android phone, 412 px), but also used on a laptop. All dates and times are IST.

## Stack (same as the fitness tracker, so patterns carry over)
- Next.js (App Router, TypeScript, Tailwind, src/ directory, pnpm). No PWA in v1.
- Postgres on Neon (free tier), Drizzle ORM via drizzle-orm/neon-http + @neondatabase/serverless.
- Auth: a passcode gate, not OAuth (zero console setup). See Auth.
- Telegram bot via grammY in webhook mode → `src/app/api/telegram/route.ts`.
- Scheduler: one secured `/api/tick` route, pinged hourly by cron-job.org.
- Hosting: Vercel Hobby. Zod for all input validation. date-fns + date-fns-tz for IST. lucide-react icons.
- No UI kit beyond Tailwind. No test framework in v1.

## Auth
- `/login` page with one passcode field. POST compares against `APP_PASSCODE` (constant-time), on
  success sets an HttpOnly, Secure, SameSite=Lax cookie holding an HMAC-signed token (secret
  `AUTH_SECRET`, 30-day expiry).
- `middleware.ts` protects every route except `/login`, `/api/telegram` and `/api/tick`.
- `/api/telegram` is protected by Telegram's `X-Telegram-Bot-Api-Secret-Token` header matching
  `TELEGRAM_WEBHOOK_SECRET`. `/api/tick` is protected by header `x-tick-secret` matching `TICK_SECRET`.

## Sources
Each source is an adapter in `src/sources/<name>.ts` implementing:

```ts
type NormalizedJob = {
  source: 'greenhouse' | 'lever' | 'ashby';
  externalId: string;
  title: string;
  location: string | null;   // joined, comma-separated if several
  isRemote: boolean;
  url: string;               // hosted posting page
  applyUrl: string;          // direct apply page (fall back to url)
  postedAt: Date | null;
  descriptionText: string | null; // plain text, truncated to 20 000 chars
};
fetchBoard(slug: string): Promise<NormalizedJob[]>
```

Endpoints (all public, no key, no cookies):
- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` → `{ jobs: [...] }`.
  Fields to expect: `id`, `title`, `absolute_url`, `location.name`, `updated_at`, `first_published`, `content` (HTML → strip to text).
- Lever: `GET https://api.lever.co/v0/postings/{slug}?mode=json` → bare array.
  Fields to expect: `id`, `text`, `hostedUrl`, `applyUrl`, `categories.location`, `workplaceType`, `createdAt` (ms), `descriptionPlain`.
- Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` → `{ jobs: [...] }`.
  Fields to expect: `id`, `title`, `jobUrl`, `applyUrl`, `location`, `secondaryLocations[].location`, `isRemote`, `publishedAt`, `descriptionPlain`.

Before writing an adapter, curl the live endpoint for one real board and confirm the field names
against the response; the lists above are expectations, not guarantees. Parse with Zod using
`.passthrough()` and tolerate missing optional fields.

Fetch rules: 12 s timeout per board, `User-Agent: job-radar/1.0 (personal use)`, one failing board
never aborts the run, each result records `last_fetched_at`, `last_fetch_status` and
`last_fetch_error` on the company row. After 3 consecutive failures a company is skipped for 6 hours.

Finding a company's slug: open its careers page. `boards.greenhouse.io/<token>` or
`job-boards.greenhouse.io/<token>` → greenhouse; `jobs.lever.co/<slug>` → lever;
`jobs.ashbyhq.com/<name>` → ashby. Script `pnpm companies:detect <careers-url-or-name>` tries all
three endpoints with the slug guessed from the URL (or the lowercase name) and prints which one
responds and how many jobs it has. `pnpm companies:add "<Name>" <ats> <slug> [priority]` inserts a row.

Optional, Phase 6 only: Adzuna (`api.adzuna.com/v1/api/jobs/in/search/1`, needs free app id/key)
as a fourth source for companies not on the list. Skip until everything else works.

## Data model (Drizzle, pg-core; `timestamptz` for timestamps, `date` for IST calendar dates)

**companies** — id, name, ats (enum greenhouse|lever|ashby), slug, careers_url (nullable),
priority (int 1–3, 1 = dream company), active (bool default true), consecutive_failures (int 0),
last_fetched_at, last_fetch_status (ok|error|null), last_fetch_error (text), created_at.
Unique (ats, slug).

**jobs** — id, company_id (fk), source, external_id, title, location, is_remote, url, apply_url,
posted_at (nullable), first_seen_at, last_seen_at, is_open (bool, false when a board stops listing it),
description_text, match_score (int), matched_keywords (text[]), location_match
(enum explicit|remote|unknown|none),
status (enum new|ignored|applied|referral_asked|replied|interviewing|rejected|offer, default new),
status_changed_at, applied_at (nullable), referrer_name, notes, next_action, next_action_date (date),
notified_at (nullable), created_at, updated_at.
Unique (source, external_id). Indexes on (status), (posted_at), (next_action_date), (company_id).

**settings** — single row id=1, explicit columns, no JSON blob: title_include (text[]),
title_exclude (text[]), description_boost (text[]), locations (text[]), include_remote (bool),
include_unknown_location (bool default true), max_age_days (int default 3), min_notify_score (int
default 2), telegram_chat_id (nullable), quiet_start (time default 22:00), quiet_end (time default
08:00), digest_time (time default 08:30), my_name, my_portfolio_url, my_availability_line, my_stack_line.

**tick_runs** — id, started_at, finished_at, companies_fetched, jobs_new, jobs_notified, errors (text),
so the Settings page can show the last run.

## Matching and scoring (pure functions in `src/lib/match.ts`, unit-testable by hand via tick:dry)
Title matching is whole-word, case-insensitive. Defaults, all editable in Settings:
- title_include: full stack, fullstack, full-stack, backend, back-end, software engineer, software
  developer, sde, node, nodejs, node.js, nestjs, next.js, nextjs, react, typescript, javascript, web developer
- title_exclude: intern, internship, manager, director, principal, staff, architect, vp, head of,
  react native, android, ios, flutter, qa, test, sdet, devops, sre, data, ml, machine learning, ai
  engineer, php, .net, c#, golang, go engineer, python, java engineer, ruby, rails, salesforce, sap
- description_boost: nestjs, next.js, postgresql, postgres, prisma, drizzle, redis, bullmq, aws,
  docker, graphql, openai
- locations: bengaluru, bangalore, india; include_remote true.

A job is a match when: title hits ≥1 include term AND 0 exclude terms; AND location_match is
explicit (location contains a locations term), remote (isRemote or location contains "remote" and
include_remote), or unknown (no location given and include_unknown_location); AND age ≤ max_age_days
where age uses posted_at, else first_seen_at.

Score: +3 title has full stack/fullstack/full-stack; +2 title has node/nestjs/next; +1 title has
react/typescript; +1 per description_boost hit, capped at +3; +2 if company priority 1, +1 if 2;
+1 if location_match explicit; −1 if unknown. Store matched_keywords for display. Non-matches are
still stored (status ignored, score 0) so a board's full state is known and nothing re-surfaces.

## Screens (three tabs: Feed, Tracker, Settings)

**Feed (`/`)** — default view is status=new sorted by score desc then posted_at desc; chips to switch
to Applied, Referral asked, All open. Each card: company name + priority dot, title, location,
"posted 3h ago", score badge, matched keyword pills. Actions on the card:
- **Apply** → opens apply_url in a new tab.
- **Find referrer** → opens `https://www.linkedin.com/search/results/people/?keywords=<company>%20software%20engineer`.
- **Hiring posts** → opens `https://www.linkedin.com/search/results/content/?keywords=<company>%20hiring&sortBy=%22date_posted%22`.
- **Copy message** → menu with three templates (referral, recruiter, hiring manager); copies the
  filled text to the clipboard and shows a toast.
- **Mark** → applied / referral asked / ignore. Marking applied sets applied_at = now and
  next_action = "follow up", next_action_date = +3 working days.
Long-press or a ⋯ menu opens the full description inline (no new page).

**Tracker (`/tracker`)** — table of jobs whose status is not new/ignored. Columns: company, title,
status (dropdown, inline), applied date, referrer, next action + date, notes (inline edit, autosave).
Sorted by next_action_date asc; overdue rows tinted. A funnel strip at the top: new → applied →
referral asked → replied → interviewing → offer, with counts.

**Settings (`/settings`)** — companies table (name, ATS, slug, priority, active toggle, last fetch
status, "Test fetch" button that runs one adapter and shows the count); add-company form; the
keyword/location/age/score fields; my_* fields used by templates; Telegram pairing status;
"Run tick now" button; last 5 tick_runs.

Design: Tailwind only, mobile-first at 412 px, max-w-screen-md centred on desktop, dark mode via
`prefers-color-scheme`, tap targets ≥ 44 px, no emoji in the UI chrome.

## Message templates (`src/content/templates.ts`)
Placeholders: `{company}`, `{title}`, `{name}`, `{portfolio}`, `{availability}`, `{stack}`, `{reason}`.
`{reason}` is left as a visible `[why this company]` for me to fill before sending.

Referral:
> Hi — I saw {company} is hiring a {title}. I'm {name}, a full-stack engineer ({stack}); I built the
> AI content-moderation pipeline for a live dating platform and {availability}. I'd like to join
> {company} because [why this company]. Resume and projects: {portfolio}. Would you be open to
> referring me, or pointing me to the right person?

Recruiter (reply to a posting or InMail):
> Hi — I'm interested in the {title} role at {company}. Quick facts: {stack}, 4+ years, currently at
> GeekyAnts, {availability}. Resume and projects: {portfolio}. Happy to do a quick call this week —
> is the process still open?

Hiring manager:
> Hi — I came across the {title} opening on your team at {company}. I'm {name}, a full-stack engineer
> ({stack}) who shipped an AI moderation pipeline and a NestJS migration of 100+ modules in
> production, and {availability}. I'd value 15 minutes to hear what the team is building: {portfolio}.

Defaults for my_* in settings seed: my_name "Neeraj", my_portfolio_url "https://neerajnero.com",
my_availability_line "can join within 3 weeks (offer in hand)", my_stack_line "React, Next.js, Node.js,
NestJS, TypeScript, PostgreSQL".

## Telegram bot
- Pairing: on `/start <code>` where code equals `TELEGRAM_PAIR_CODE`, store the chat id in settings
  and reply "paired". Any message from an unpaired or different chat gets "not for you" and nothing else.
- Commands: `/new` (today's new matches, top 10 by score), `/due` (follow-ups due today or overdue),
  `/stats` (funnel counts), `/tick` (runs the tick, replies with the summary).
- New-job alerts, sent from the tick: one message per job with score ≥ min_notify_score and
  notified_at null, at most 10 per tick (the rest: "and N more in the app"). Format:
  `{company} · {title}` / `{location} · posted 2h ago · score 5` / links: Apply, Find referrer, Open in
  app. Inline buttons: Applied · Referral asked · Ignore, each updating status and editing the message
  to show the result. Set notified_at on send.
- Daily digest at digest_time: new matches since yesterday's digest, follow-ups due today,
  applications with no reply after 3 working days ("chase"), and the funnel line.
- Quiet hours: nothing is sent between quiet_start and quiet_end IST; held alerts go out at quiet_end.
- Hard cap 25 messages per day across everything.

## Tick (`/api/tick`)
1. Load settings. Pick active companies not in failure cooldown, ordered by last_fetched_at asc
   (nulls first), at most 40 per run so slow boards never block the rest; the next tick continues.
2. Fetch adapters in parallel batches of 8. For each company: upsert every job by (source,
   external_id) — insert sets first_seen_at, update bumps last_seen_at; jobs for that company not in
   the response get is_open=false. Update the company's fetch columns.
3. Score every newly inserted job; non-matches become status=ignored, score 0.
4. Send Telegram alerts per the rules above, then the digest if due and not yet sent today.
5. Write a tick_runs row. Respond with JSON `{ fetched, new, notified, errors }`.
Set the route's `maxDuration` to the plan maximum and keep a run under ~50 s by the batching above.
`pnpm tick:dry` runs steps 1–3 locally against the database without writing or sending and prints
the would-be matches as a table; `pnpm tick:prod` calls the deployed route with the secret.

## Seed data
Settings row with the defaults above. Companies: none hard-coded — I add my 30–50 targets through
`companies:detect` + `companies:add` or the Settings form. The seed script must be idempotent.

## Env (`.env.example` committed, `.env.local` gitignored, never printed)
```
DATABASE_URL=                 # Neon connection string
AUTH_SECRET=                  # openssl rand -hex 32
APP_PASSCODE=                 # the login passcode
TICK_SECRET=                  # openssl rand -hex 32
TELEGRAM_BOT_TOKEN=           # from BotFather (Phase 4)
TELEGRAM_WEBHOOK_SECRET=      # openssl rand -hex 16 — letters, digits, _ - only
TELEGRAM_PAIR_CODE=           # any short word; typed once as /start <code>
NEXT_PUBLIC_APP_URL=          # http://localhost:3000 locally, the Vercel URL in prod
```

## Build order (one day; each phase is one CLI prompt and one commit)
1. Scaffold, env, passcode gate, schema + migrations, app shell with three empty tabs. (~1 h)
2. Source adapters, normaliser, matching + scoring, tick route, `tick:dry`, `companies:detect`,
   `companies:add`. Verified against five real boards. (~2 h)
3. Feed, Tracker, Settings screens; templates; copy-to-clipboard; LinkedIn links. (~2 h)
4. Telegram: pairing, commands, alerts with inline buttons, digest, quiet hours; `bot:set-webhook`
   and `bot:webhook-info` scripts; cron-job.org. (~1.5 h)
5. Deploy to Vercel, env, first live tick, first alert, README with the runbook. (~30 min)
6. Optional later: Adzuna source, PWA install, Playwright smoke tests.

## Rules
- `pnpm typecheck` and `pnpm lint` must pass before each commit. One commit per phase, and
  `git push` after every commit — the remote is the backup.
- Secrets never appear in code, logs, commits or printed output. Scripts load `.env.local` via
  `node --env-file`; prod-targeting scripts print only the host and ask for y/N.
- Only the JSON endpoints listed in Sources. No HTML scraping, no LinkedIn or Naukri access, no
  automated applying or messaging, ever.
- Do only the phase asked. When the spec is silent, choose the simplest option and print the
  decision; when it is ambiguous, print a question and stop rather than invent.
- Finish every phase by printing: what was built, how to verify it, and any deviation from this file.
