import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings as settingsTable, type Settings } from "@/db/schema";

export async function loadSettings(): Promise<Settings> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  if (!row) throw new Error("settings row id=1 is missing — run `pnpm seed`");
  return row;
}
