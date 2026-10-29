"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AUTH_COOKIE,
  passcodeMatches,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";

const schema = z.object({
  passcode: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/** Only allow same-origin relative paths as a post-login destination. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function login(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    passcode: formData.get("passcode"),
    next: formData.get("next") ?? undefined,
  });
  const next = safeNext(parsed.success ? parsed.data.next : undefined);

  if (!parsed.success || !(await passcodeMatches(parsed.data.passcode))) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await signSession();
  (await cookies()).set(AUTH_COOKIE, token, sessionCookieOptions);
  redirect(next);
}
