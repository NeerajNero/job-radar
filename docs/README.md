# Documentation

The root [README](../README.md) is the runbook (setup, deploy, cron). These go deeper:

- [architecture.md](architecture.md) — what runs where, request flows for a tick, an alert, a button press and a command, the data model, status transitions, map of `src/`.
- [operations.md](operations.md) — adding and removing companies, finding slugs, tuning keywords, quiet hours and the cap, rotating each secret in the right order, redeploying, migrations, cron-job.org, the bot:dev webhook rule.
- [troubleshooting.md](troubleshooting.md) — symptom → cause → fix table, then a section per symptom saying where to look before what to change.
- [scoring.md](scoring.md) — the matching rules and score table as implemented, with worked examples from real jobs.
- [telegram.md](telegram.md) — pairing, every command with an example reply, what alerts and the digest look like, the buttons, quiet hours, the cap and its exemptions.
- [../CHANGELOG.md](../CHANGELOG.md) — one entry per build phase.
- [../CLAUDE.md](../CLAUDE.md) — the spec, kept in step with the code.
