/**
 * The hourly tick (CLAUDE.md "Tick"), pinged by cron-job.org with header x-tick-secret.
 * Inserts the tick_runs row, responds 202 { runId } at once, and runs the work inside after()
 * so it continues past the response within maxDuration. GET /api/tick/latest reports the row.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { failTickRun, runTick, startTickRun } from "@/lib/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby allows up to 60 s for a route; the tick keeps itself under ~50 s by batching.
export const maxDuration = 60;

async function tickAuthorized(request: NextRequest): Promise<boolean> {
  const expected = process.env.TICK_SECRET;
  const given = request.headers.get("x-tick-secret") ?? "";
  return !!expected && (await safeEqual(given, expected));
}

async function handle(request: NextRequest) {
  if (!(await tickAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  let runId: number;
  try {
    runId = await startTickRun(now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tick could not start:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  after(async () => {
    try {
      const r = await runTick({ now, runId, log: (line) => console.log(line) });
      console.log(`tick ${runId}: fetched=${r.fetched} new=${r.new} notified=${r.notified} errors=${r.errors.length} (${(r.durationMs / 1000).toFixed(1)}s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`tick ${runId} failed:`, message);
      await failTickRun(runId, message).catch(() => {});
    }
  });
  return NextResponse.json({ runId }, { status: 202 });
}

export { handle as GET, handle as POST };
