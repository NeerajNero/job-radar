/**
 * pnpm tick:prod — POST the deployed /api/tick with the secret (prints only the host, asks y/N),
 * then poll /api/tick/latest every 3 s until finished_at is set (max 90 s) and print the summary.
 */
import { createInterface } from "node:readline/promises";

const POLL_MS = 3_000;
const MAX_MS = 90_000;

type Run = { id: number; startedAt: string; finishedAt: string | null; companiesFetched: number; jobsNew: number; jobsNotified: number; errors: string | null };

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TICK_SECRET;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  if (!secret) throw new Error("TICK_SECRET is not set");
  const tickUrl = new URL("/api/tick", base);
  const latestUrl = new URL("/api/tick/latest", base);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Run the tick on host ${tickUrl.host}? y/N `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("aborted");
    return;
  }

  const headers = { "x-tick-secret": secret };
  const started = await fetch(tickUrl, { method: "POST", headers });
  if (started.status !== 202) throw new Error(`POST /api/tick → ${started.status} ${await started.text()}`);
  const { runId } = (await started.json()) as { runId: number };
  console.log(`tick run ${runId} started; polling /api/tick/latest every ${POLL_MS / 1000}s…`);

  const t0 = Date.now();
  while (Date.now() - t0 < MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(latestUrl, { headers });
    if (!res.ok) throw new Error(`GET /api/tick/latest → ${res.status}`);
    const run = (await res.json()) as Run | null;
    if (run && run.id === runId && run.finishedAt) {
      const secs = (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
      console.log(`tick ${run.id}: fetched=${run.companiesFetched} new=${run.jobsNew} notified=${run.jobsNotified} (${secs.toFixed(1)}s)`);
      if (run.errors) console.log(`errors:\n${run.errors.split("\n").map((e) => `  ! ${e}`).join("\n")}`);
      return;
    }
    process.stdout.write(".");
  }
  console.log(`\ntick ${runId} did not finish within ${MAX_MS / 1000}s; check /api/tick/latest or the Vercel logs`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
