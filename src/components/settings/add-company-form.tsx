"use client";

import { useActionState, useState, useTransition } from "react";
import { addCompanyAction, detectAction, type FormState } from "@/app/(app)/settings/actions";
import type { Ats } from "@/db/schema";
import type { ProbeResult } from "@/lib/detect";
import { btnPrimary, btnSecondary, input, label, muted } from "../ui";

export function AddCompanyForm() {
  const [query, setQuery] = useState("");
  const [detecting, startDetect] = useTransition();
  const [detect, setDetect] = useState<{ slug: string; results: ProbeResult[] } | { error: string } | null>(null);
  const [pick, setPick] = useState<{ ats: Ats; slug: string } | null>(null);
  const [state, formAction, saving] = useActionState<FormState, FormData>(addCompanyAction, null);

  function runDetect() {
    if (!query.trim()) return;
    startDetect(async () => {
      const r = await detectAction({ query });
      if (!r.ok) {
        setDetect({ error: r.message });
        setPick(null);
        return;
      }
      setDetect(r);
      const hit = r.results.find((x) => (x.jobs ?? 0) > 0) ?? r.results.find((x) => x.status === "200");
      setPick(hit ? { ats: hit.ats, slug: hit.slug } : null);
    });
  }

  const isUrl = /^https?:\/\//i.test(query.trim());
  const nameGuess = isUrl ? "" : query.trim();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="detect-query" className={label}>
          Careers URL or company name
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="detect-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runDetect();
              }
            }}
            placeholder="https://jobs.lever.co/acme or Acme"
            className={input}
          />
          <button type="button" onClick={runDetect} disabled={detecting || !query.trim()} className={`${btnSecondary} shrink-0`}>
            {detecting ? "Detecting…" : "Detect"}
          </button>
        </div>
      </div>

      {detect && "error" in detect ? <p className="text-sm text-red-700 dark:text-red-400">{detect.error}</p> : null}
      {detect && "results" in detect ? (
        <div role="radiogroup" aria-label="Detected boards" className="flex flex-col gap-1">
          {detect.results.map((r) => {
            const ok = (r.jobs ?? 0) > 0;
            const selected = pick?.ats === r.ats;
            return (
              <label
                key={r.ats}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm ${
                  selected ? "border-neutral-900 dark:border-neutral-100" : "border-neutral-200 dark:border-neutral-800"
                } ${!ok ? "opacity-60" : ""}`}
              >
                <input type="radio" name="pick" checked={selected} onChange={() => setPick({ ats: r.ats, slug: r.slug })} className="size-4" />
                <span className="w-24 font-medium">{r.ats}</span>
                <span className={muted}>
                  {r.status} · {r.jobs == null ? "-" : `${r.jobs} jobs`}
                  {r.sample ? ` · ${r.sample}` : ""}
                </span>
              </label>
            );
          })}
          {!detect.results.some((r) => (r.jobs ?? 0) > 0) ? (
            <p className={`text-xs ${muted}`}>No board responded with listings. You can still pick one and edit the slug.</p>
          ) : null}
        </div>
      ) : null}

      {pick ? (
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="ats" value={pick.ats} />
          <div>
            <label htmlFor="add-name" className={label}>
              Name
            </label>
            <input id="add-name" name="name" required defaultValue={nameGuess} className={`${input} mt-1`} />
          </div>
          <div>
            <label htmlFor="add-slug" className={label}>
              Slug ({pick.ats})
            </label>
            <input id="add-slug" name="slug" required defaultValue={pick.slug} className={`${input} mt-1`} />
          </div>
          <div>
            <label htmlFor="add-priority" className={label}>
              Priority
            </label>
            <select id="add-priority" name="priority" defaultValue={2} className={`${input} mt-1`}>
              <option value={1}>1 — dream company</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <div>
            <label htmlFor="add-careers" className={label}>
              Careers URL (optional)
            </label>
            <input id="add-careers" name="careersUrl" type="url" defaultValue={isUrl ? query.trim() : ""} className={`${input} mt-1`} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className={`${btnPrimary} w-full sm:w-auto`}>
              {saving ? "Saving…" : "Save company"}
            </button>
            {state ? <p className={`mt-2 text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{state.message}</p> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
