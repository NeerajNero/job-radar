import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { runTick } from "@/lib/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby allows up to 60 s for a route; the tick keeps itself under ~50 s by batching.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const expected = process.env.TICK_SECRET;
  const given = request.headers.get("x-tick-secret") ?? "";
  if (!expected || !(await safeEqual(given, expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runTick({ log: (line) => console.log(line) });
    return NextResponse.json({
      fetched: result.fetched,
      new: result.new,
      notified: result.notified,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tick failed:", message);
    return NextResponse.json({ fetched: 0, new: 0, notified: 0, errors: [message] }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
