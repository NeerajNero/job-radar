"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { atsEnum, companies, settings } from "@/db/schema";
import { detectBoards, type ProbeResult } from "@/lib/detect";
import { reevaluateJobs, type ReevaluateResult } from "@/lib/reevaluate";
import { runTick } from "@/lib/tick";
import { getSource } from "@/sources";

export type FormState = { ok: boolean; message: string } | null;

function fail(err: unknown): { ok: false; message: string } {
  return { ok: false, message: err instanceof Error ? err.message : "failed" };
}

function issues(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

/* ---------- companies ---------- */

const Id = z.number().int().positive();

export async function setCompanyActiveAction(input: { companyId: number; active: boolean }): Promise<FormState> {
  const p = z.object({ companyId: Id, active: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, message: issues(p.error) };
  try {
    await db.update(companies).set({ active: p.data.active }).where(eq(companies.id, p.data.companyId));
    revalidatePath("/settings");
    return { ok: true, message: p.data.active ? "Activated" : "Deactivated" };
  } catch (e) {
    return fail(e);
  }
}

export async function setCompanyPriorityAction(input: { companyId: number; priority: number }): Promise<FormState> {
  const p = z.object({ companyId: Id, priority: z.number().int().min(1).max(3) }).safeParse(input);
  if (!p.success) return { ok: false, message: issues(p.error) };
  try {
    await db.update(companies).set({ priority: p.data.priority }).where(eq(companies.id, p.data.companyId));
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: `Priority ${p.data.priority}` };
  } catch (e) {
    return fail(e);
  }
}

export async function testFetchAction(input: { companyId: number }): Promise<{ ok: true; count: number; ms: number } | { ok: false; message: string }> {
  const p = z.object({ companyId: Id }).safeParse(input);
  if (!p.success) return { ok: false, message: issues(p.error) };
  const [c] = await db.select().from(companies).where(eq(companies.id, p.data.companyId));
  if (!c) return { ok: false, message: "company not found" };
  const t0 = Date.now();
  try {
    const jobs = await getSource(c.ats).fetchBoard(c.slug);
    return { ok: true, count: jobs.length, ms: Date.now() - t0 };
  } catch (e) {
    return fail(e);
  }
}

export async function detectAction(input: { query: string }): Promise<
  { ok: true; slug: string; results: ProbeResult[] } | { ok: false; message: string }
> {
  const p = z.object({ query: z.string().trim().min(1).max(300) }).safeParse(input);
  if (!p.success) return { ok: false, message: issues(p.error) };
  try {
    const { slug, results } = await detectBoards(p.data.query);
    return { ok: true, slug, results };
  } catch (e) {
    return fail(e);
  }
}

const AddCompany = z.object({
  name: z.string().trim().min(1).max(120),
  ats: z.enum(atsEnum.enumValues),
  slug: z.string().trim().min(1).max(120),
  priority: z.coerce.number().int().min(1).max(3),
  careersUrl: z
    .string()
    .trim()
    .max(500)
    .transform((s) => (s === "" ? null : s))
    .pipe(z.string().url().nullable()),
});

export async function addCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = AddCompany.safeParse({
    name: formData.get("name"),
    ats: formData.get("ats"),
    slug: formData.get("slug"),
    priority: formData.get("priority"),
    careersUrl: formData.get("careersUrl") ?? "",
  });
  if (!p.success) return { ok: false, message: issues(p.error) };
  const a = p.data;
  try {
    const [row] = await db
      .insert(companies)
      .values({ name: a.name, ats: a.ats, slug: a.slug, priority: a.priority, careersUrl: a.careersUrl })
      .onConflictDoUpdate({
        target: [companies.ats, companies.slug],
        set: { name: a.name, priority: a.priority, careersUrl: a.careersUrl, active: true },
      })
      .returning({ id: companies.id });
    revalidatePath("/settings");
    return { ok: true, message: `Saved ${a.name} (${a.ats}/${a.slug}) as #${row.id}` };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- matching settings ---------- */

const TermList = z
  .string()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "bad list" });
      return z.NEVER;
    }
  })
  .pipe(z.array(z.string().trim().min(1).max(80)).max(200))
  .transform((arr) => [...new Set(arr.map((t) => t.toLowerCase()))]);

const Matching = z.object({
  titleInclude: TermList,
  titleExclude: TermList,
  descriptionBoost: TermList,
  locations: TermList,
  includeRemote: z.coerce.boolean(),
  includeUnknownLocation: z.coerce.boolean(),
  maxAgeDays: z.coerce.number().int().min(1).max(90),
  minNotifyScore: z.coerce.number().int().min(-5).max(20),
});

export async function saveMatchingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = Matching.safeParse({
    titleInclude: formData.get("titleInclude"),
    titleExclude: formData.get("titleExclude"),
    descriptionBoost: formData.get("descriptionBoost"),
    locations: formData.get("locations"),
    includeRemote: formData.get("includeRemote") === "on",
    includeUnknownLocation: formData.get("includeUnknownLocation") === "on",
    maxAgeDays: formData.get("maxAgeDays"),
    minNotifyScore: formData.get("minNotifyScore"),
  });
  if (!p.success) return { ok: false, message: issues(p.error) };
  try {
    await db.update(settings).set(p.data).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true, message: "Matching rules saved. Run Re-evaluate to apply them to existing jobs." };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- profile (my_*) ---------- */

const Profile = z.object({
  myName: z.string().trim().min(1).max(80),
  myPortfolioUrl: z.string().trim().url().max(300),
  myAvailabilityLine: z.string().trim().min(1).max(200),
  myStackLine: z.string().trim().min(1).max(200),
});

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = Profile.safeParse({
    myName: formData.get("myName"),
    myPortfolioUrl: formData.get("myPortfolioUrl"),
    myAvailabilityLine: formData.get("myAvailabilityLine"),
    myStackLine: formData.get("myStackLine"),
  });
  if (!p.success) return { ok: false, message: issues(p.error) };
  try {
    await db.update(settings).set(p.data).where(eq(settings.id, 1));
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- maintenance ---------- */

export async function runTickAction(): Promise<
  { ok: true; fetched: number; new: number; notified: number; errors: string[]; ms: number } | { ok: false; message: string }
> {
  try {
    const r = await runTick({ log: (l) => console.log(l) });
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true, fetched: r.fetched, new: r.new, notified: r.notified, errors: r.errors, ms: r.durationMs };
  } catch (e) {
    return fail(e);
  }
}

export async function reevaluateAction(): Promise<({ ok: true } & ReevaluateResult) | { ok: false; message: string }> {
  try {
    const r = await reevaluateJobs();
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}
