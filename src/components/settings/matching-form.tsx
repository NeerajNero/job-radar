"use client";

import { useActionState } from "react";
import { saveMatchingAction, type FormState } from "@/app/(app)/settings/actions";
import type { Settings } from "@/db/schema";
import { TagListEditor } from "./tag-list-editor";
import { btnPrimary, input, label } from "../ui";

export function MatchingForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveMatchingAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <TagListEditor name="titleInclude" label="Title include" initial={settings.titleInclude} hint="A title must contain at least one of these (whole word)." />
      <TagListEditor name="titleExclude" label="Title exclude" initial={settings.titleExclude} hint="Any of these in the title rejects the job." />
      <TagListEditor name="descriptionBoost" label="Description boost" initial={settings.descriptionBoost} hint="+1 score each, capped at +3." />
      <TagListEditor name="locations" label="Locations" initial={settings.locations} hint="Explicit location match: +1 score." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="includeRemote" defaultChecked={settings.includeRemote} className="size-5 accent-neutral-900 dark:accent-neutral-100" />
          Include remote roles
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="includeUnknownLocation" defaultChecked={settings.includeUnknownLocation} className="size-5 accent-neutral-900 dark:accent-neutral-100" />
          Include roles with no location (−1 score)
        </label>
        <div>
          <label htmlFor="maxAgeDays" className={label}>
            Max age (days)
          </label>
          <input id="maxAgeDays" name="maxAgeDays" type="number" min={1} max={90} defaultValue={settings.maxAgeDays} className={`${input} mt-1`} />
        </div>
        <div>
          <label htmlFor="minNotifyScore" className={label}>
            Min score to notify (Telegram)
          </label>
          <input id="minNotifyScore" name="minNotifyScore" type="number" min={-5} max={20} defaultValue={settings.minNotifyScore} className={`${input} mt-1`} />
        </div>
      </div>
      <div>
        <button type="submit" disabled={pending} className={`${btnPrimary} w-full sm:w-auto`}>
          {pending ? "Saving…" : "Save matching rules"}
        </button>
        {state ? <p className={`mt-2 text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
