"use client";

import { useActionState } from "react";
import { saveProfileAction, type FormState } from "@/app/(app)/settings/actions";
import type { Settings } from "@/db/schema";
import { btnPrimary, input, label } from "../ui";

const FIELDS: Array<{ name: keyof Pick<Settings, "myName" | "myPortfolioUrl" | "myAvailabilityLine" | "myStackLine">; label: string; type?: string }> = [
  { name: "myName", label: "Name ({name})" },
  { name: "myPortfolioUrl", label: "Portfolio URL ({portfolio})", type: "url" },
  { name: "myAvailabilityLine", label: "Availability line ({availability})" },
  { name: "myStackLine", label: "Stack line ({stack})" },
];

export function ProfileForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveProfileAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className={label}>
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} required defaultValue={settings[f.name]} className={`${input} mt-1`} />
        </div>
      ))}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={`${btnPrimary} w-full sm:w-auto`}>
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state ? <p className={`mt-2 text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
