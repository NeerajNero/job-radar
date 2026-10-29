# Matching and scoring

Everything here is `src/lib/match.ts`, pure functions with no I/O. A job is evaluated once
when it is first inserted, and again by re-evaluation. The settings row holds every list and
switch; the values below are the seeded defaults and are editable in Settings → Matching.

## Term matching

A term matches when it appears in the text as a whole word, case-insensitively. "Whole word"
means the character before and after it is not a letter or a digit, so `node` does not match
`nodejs`, `.net` and `c#` match literally, and a space inside a term matches any run of
spaces or hyphens (`full stack` matches `Full-Stack`). Terms are escaped, never interpreted as
patterns.

## Is it a match?

All three must hold:

1. **Title**: at least one `title_include` term and no `title_exclude` term.
2. **Location**, evaluated in this order:
   - `explicit`: the location text contains a `locations` term (default: bengaluru, bangalore, india);
   - `remote`: the board flags it remote, or the location text contains "remote", and
     `include_remote` is on;
   - `unknown`: the board gives no location and `include_unknown_location` is on;
   - otherwise `none`, which is a non-match.
3. **Age**: days since `posted_at` (or since first seen when the board gives no date) is at
   most `max_age_days` (seeded 7).

A non-match is stored with `status = ignored`, `score = 0` and an `ignore_reason` of the first
failed check in the order title, location, age. Matches get `status = new` and
`ignore_reason` null. A job you ignore by hand gets `ignore_reason = manual`.

Default lists:

- title_include: full stack, fullstack, full-stack, backend, back-end, software engineer,
  software developer, sde, node, nodejs, node.js, nestjs, next.js, nextjs, react, typescript,
  javascript, web developer, frontend, front-end, product engineer, member of technical staff, mts
- title_exclude: intern, internship, manager, director, principal, staff, architect, vp, head
  of, react native, android, ios, flutter, qa, test, sdet, devops, sre, data, ml, machine
  learning, ai engineer, php, .net, c#, golang, go engineer, python, java engineer, ruby, rails,
  salesforce, sap, new grad, graduate, fresher, trainee, entry level, junior, associate
- description_boost: nestjs, next.js, postgresql, postgres, prisma, drizzle, redis, bullmq, aws,
  docker, graphql, openai

## Score

Computed for every job; stored as 0 for non-matches.

| Rule | Points |
| --- | --- |
| Title contains full stack, fullstack or full-stack | +3 |
| Title contains node, nodejs, node.js, nestjs, next, next.js or nextjs | +2 |
| Title contains react or typescript | +1 |
| Each `description_boost` term found in the description, capped at 3 | +1 each, max +3 |
| Company priority 1 | +2 |
| Company priority 2 | +1 |
| Location match explicit | +1 |
| Location match unknown | −1 |

`matched_keywords` stores the include terms and boost terms that hit, for the pills on the
card. The Telegram alert threshold `min_notify_score` (seeded 2) is compared against this score.

## Worked examples

Real rows from the database on 29 Oct 2026, with the seeded rules. Priority 2 for all three
stand-in companies.

### Supabase · Software Engineer - Storage (job 75)

- Location "Remote, Global", flagged remote; posted 24 Oct, 4.8 days old.
- Title: include hit `software engineer`; no exclude hit. No full-stack, node or react term.
- Location: no locations term → remote flag and include_remote on → `remote`.
- Age: 4.8 ≤ 7, fresh.
- Description boosts found: next.js, postgresql, postgres, aws, docker → 5 hits, capped at +3.
- Score: 0 + 0 + 0 + 3 (boosts) + 1 (priority 2) + 0 (remote) = **4**.
- Result: status `new`, ignore_reason null, keywords software engineer, next.js, postgresql,
  postgres, aws, docker. Alerted (4 ≥ 2).

### GitLab · Software Engineer, Delivery : Release (job 585)

- Location "Bangalore, India", not flagged remote; posted 28 Oct, 1.3 days old.
- Title: include hit `software engineer`; no exclude hit.
- Location: contains `bangalore` → `explicit`.
- Age: fresh.
- Boosts: none found in the description.
- Score: 0 + 0 + 0 + 0 + 1 (priority 2) + 1 (explicit) = **2**.
- Result: status `new`, keywords software engineer. Alerted (2 ≥ 2, exactly at the threshold).

### Supabase · Software Engineer - Turso (job 112)

- Location "Remote, Global", flagged remote; posted 21 Oct, 7.5 days old.
- Title: include hit `software engineer`; no exclude hit.
- Location: `remote`.
- Age: 7.5 > 7, stale.
- Boosts found: postgres, aws (would have been +2).
- Score would have been 0 + 2 + 1 + 0 = 3, but the job is a non-match, so stored as **0**.
- Result: status `ignored`, ignore_reason `age`, keywords software engineer, postgres, aws.
  It shows under the Older matches chip while it stays open and was posted within 30 days;
  raising max_age_days to 8 and re-evaluating would make it `new` with score 3.

A fourth, for the location rule: Stripe · Software Engineer, Fraud System Interventions
(job 1096), "South San Francisco, CA", not remote, posted 0.4 days ago. Title passes, location
is `none`, so status `ignored` with ignore_reason `location` and score 0.

## Re-evaluation

`pnpm reevaluate` or Settings → Re-evaluate runs `evaluate()` again over open jobs first seen
in the last 30 days whose status is `new` or `ignored` and whose ignore_reason is not `manual`,
in batches of 200, and writes only the rows whose score, keywords, location match, status or
reason changed. `--all` includes closed jobs and the full history. Jobs with any other status
are never touched.
