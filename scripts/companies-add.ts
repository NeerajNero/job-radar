/**
 * pnpm companies:add "<Name>" <ats> <slug> [priority=2] [careers_url]
 * Upserts on (ats, slug); re-running updates name, priority, careers_url and re-activates.
 */
import { z } from "zod";
import { db } from "../src/db";
import { atsEnum, companies } from "../src/db/schema";

const Args = z.object({
  name: z.string().trim().min(1),
  ats: z.enum(atsEnum.enumValues),
  slug: z.string().trim().min(1),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  careersUrl: z.string().url().optional(),
});

async function main() {
  const [name, ats, slug, priority, careersUrl] = process.argv.slice(2);
  const parsed = Args.safeParse({ name, ats, slug, priority: priority ?? undefined, careersUrl: careersUrl || undefined });
  if (!parsed.success) {
    console.error('usage: pnpm companies:add "<Name>" <greenhouse|lever|ashby> <slug> [priority 1-3] [careers_url]');
    console.error(parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(2);
  }
  const a = parsed.data;
  const [row] = await db
    .insert(companies)
    .values({ name: a.name, ats: a.ats, slug: a.slug, priority: a.priority, careersUrl: a.careersUrl ?? null })
    .onConflictDoUpdate({
      target: [companies.ats, companies.slug],
      set: { name: a.name, priority: a.priority, careersUrl: a.careersUrl ?? null, active: true },
    })
    .returning({ id: companies.id, name: companies.name, ats: companies.ats, slug: companies.slug, priority: companies.priority });
  console.log(`upserted #${row.id}: ${row.name} (${row.ats}/${row.slug}) priority ${row.priority}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
