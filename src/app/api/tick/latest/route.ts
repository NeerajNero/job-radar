/** GET /api/tick/latest — the most recent tick_runs row, behind the same x-tick-secret header. */
import { desc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { tickRuns } from "@/db/schema";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.TICK_SECRET;
  const given = request.headers.get("x-tick-secret") ?? "";
  if (!expected || !(await safeEqual(given, expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [row] = await db.select().from(tickRuns).orderBy(desc(tickRuns.id)).limit(1);
  return NextResponse.json(row ?? null);
}
