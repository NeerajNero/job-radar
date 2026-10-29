"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { jobs, jobStatusEnum } from "@/db/schema";
import { setJobStatus } from "@/lib/jobs";

export type ActionResult = { ok: true } | { ok: false; error: string };

const StatusInput = z.object({
  jobId: z.number().int().positive(),
  status: z.enum(jobStatusEnum.enumValues),
});

export async function setJobStatusAction(input: z.infer<typeof StatusInput>): Promise<ActionResult> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  try {
    await setJobStatus(parsed.data.jobId, parsed.data.status);
    revalidatePath("/");
    revalidatePath("/tracker");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

const emptyToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .optional();

const FieldsInput = z.object({
  jobId: z.number().int().positive(),
  notes: emptyToNull(5000),
  nextAction: emptyToNull(200),
  nextActionDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "yyyy-mm-dd")
    .transform((s) => (s === "" ? null : s))
    .optional(),
  referrerName: emptyToNull(200),
});

export async function updateJobFieldsAction(input: z.infer<typeof FieldsInput>): Promise<ActionResult> {
  const parsed = FieldsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const { jobId, ...fields } = parsed.data;
  const patch: Partial<typeof jobs.$inferInsert> = { updatedAt: new Date() };
  if (fields.notes !== undefined) patch.notes = fields.notes;
  if (fields.nextAction !== undefined) patch.nextAction = fields.nextAction;
  if (fields.nextActionDate !== undefined) patch.nextActionDate = fields.nextActionDate;
  if (fields.referrerName !== undefined) patch.referrerName = fields.referrerName;
  try {
    await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
    revalidatePath("/tracker");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}
