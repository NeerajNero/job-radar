# Telegram how-to

The bot talks to exactly one chat. Everything it sends is HTML with company names and titles
escaped. Examples below use placeholders.

## Pairing

Send `/start <TELEGRAM_PAIR_CODE>` from the chat you want alerts in. Reply: `paired`.
Doing it again from another chat moves the pairing there. Settings → Telegram shows
"Paired with chat ••••123" (all but the last three digits hidden).

Any other chat, or a wrong code, gets one reply, `not for you`, and nothing else, ever. A button
press from another chat gets the same text as a popup.

## Commands

| Command | What it does | Example reply |
| --- | --- | --- |
| `/new` | Today's new matches (status new, first seen today IST), top 10 by score | `New today (2)` then one line per job: `• <Company> · <Title> · score 4` with the title linked to the posting; `• and more in the app` if there are over 10 |
| `/due` | Follow-ups due today or overdue (next action date ≤ today, any status after new) | `Due (1)` then `• <Company> · <Title> · follow up · Applied · overdue since 2026-10-27`; or `Nothing due today.` |
| `/stats` | Funnel counts | `Funnel: new 2 · applied 1 · referral asked 0 · replied 0 · interviewing 0 · offer 0` |
| `/tick` | Runs a full tick now, then reports | `Tick: fetched 5, new 2, notified 2, errors 0 (8.3s)` and one `• <company>: <error>` line per failed board. Alerts from that tick arrive just before the summary. |
| `/start`, `/help` (when paired) | Lists the commands | `Paired. Commands:` then `/new — ...` per command |

The command list is registered with Telegram by `pnpm bot:dev` and `pnpm bot:set-webhook`, so
the `/` menu in the chat shows them.

## An alert

One message per job, at most 10 per tick:

```
<Company> · <Title>
<Location> · posted 2h ago · score 4
Apply · Find referrer · Open in app
[ Applied ] [ Referral asked ] [ Ignore ]
```

The three words on the last text line are links: the apply page, a LinkedIn people search for
"<Company> software engineer", and the Feed with that card pinned and highlighted
(`/?job=<id>`). When more than 10 qualify, one extra message says `and N more in the app:
open feed`; the rest go out on the next tick.

A job is alerted when it is open, status new, score ≥ `min_notify_score`, and not alerted
before. `notified_at` is set on send so nothing is sent twice.

## The buttons

| Button | Effect |
| --- | --- |
| Applied | Status applied, `applied_at` now, next action "follow up" three working days out (IST). Same as Mark → applied in the Feed. |
| Referral asked | Status referral_asked. |
| Ignore | Status ignored with `ignore_reason` manual; re-evaluation will not bring it back. |

After a press the alert is edited in place: same text, a final line `Marked applied` (or
referral asked, ignored), buttons removed, and a small confirmation popup. Pressing again does
nothing harmful: the status is already set and the message is re-rendered.

## The digest

Once per IST day, on the first tick at or after `digest_time` (seeded 08:30):

```
Daily digest · 2026-10-30

New matches since last digest (3)
• <Company> · <Title> · score 4
...

Follow-ups due (1)
• <Company> · <Title> · follow up (overdue 2026-10-27)

Chase — no reply after 3 working days (1)
• <Company> · <Title> · applied 2026-10-24

Funnel: new 2 · applied 1 · referral asked 0 · replied 0 · interviewing 0 · offer 0
```

Empty sections are left out; "No new matches since the last digest." replaces the first one
when there is nothing. "New" here means status new since the previous digest, regardless of
the alert threshold. "Chase" lists jobs still in status applied whose applied date is three or
more working days ago.

## Quiet hours

Nothing is sent between `quiet_start` and `quiet_end` IST (seeded 22:00–08:00, wrapping past
midnight). Alerts that qualify during that window are recorded as held and go out on the first
tick at or after quiet end, in score order, still 10 per tick. The digest also waits. Settings
→ Telegram shows how many alerts are held.

## The daily cap

At most 25 messages per IST day, counted across **alerts and digests**. Once reached, further
alerts stay un-notified and go out tomorrow; the digest is skipped for the day. Exempt from
the cap:

- replies to your own commands (`/new`, `/due`, `/stats`, `/tick`, `/start`, `/help`);
- button presses (an edit and a popup, not a new message);
- `not for you` replies to strangers, so nobody else can use up your allowance.

Settings → Telegram shows "Alerts and digests today: N of 25".
