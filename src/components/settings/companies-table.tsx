"use client";

import { useState, useTransition } from "react";
import { setCompanyActiveAction, setCompanyPriorityAction, testFetchAction } from "@/app/(app)/settings/actions";
import type { Company } from "@/db/schema";
import { useToast } from "../toast";
import { btnSecondary, input, muted } from "../ui";

export type CompanyRow = Pick<Company, "id" | "name" | "ats" | "slug" | "priority" | "active" | "lastFetchStatus" | "lastFetchError" | "consecutiveFailures"> & {
  lastFetchedLabel: string;
};

function Row({ c }: { c: CompanyRow }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [test, setTest] = useState<string | null>(null);

  return (
    <tr className={`border-t border-neutral-200 dark:border-neutral-800 ${!c.active ? "opacity-60" : ""} ${pending ? "opacity-50" : ""}`}>
      <td className="px-2 py-1.5 font-medium">{c.name}</td>
      <td className={`px-2 py-1.5 font-mono text-xs ${muted}`}>
        {c.ats}/{c.slug}
      </td>
      <td className="px-2 py-1.5">
        <select
          aria-label={`Priority for ${c.name}`}
          defaultValue={c.priority}
          onChange={(e) => {
            const priority = Number(e.target.value);
            start(async () => {
              const r = await setCompanyPriorityAction({ companyId: c.id, priority });
              toast.show(r?.message ?? "");
            });
          }}
          className={`${input} min-w-16 px-2 text-sm`}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={c.active}
            onChange={(e) => {
              const active = e.target.checked;
              start(async () => {
                const r = await setCompanyActiveAction({ companyId: c.id, active });
                toast.show(r?.message ?? "");
              });
            }}
            className="size-5 accent-neutral-900 dark:accent-neutral-100"
          />
          {c.active ? "Active" : "Off"}
        </label>
      </td>
      <td className="px-2 py-1.5 text-xs">
        {c.lastFetchStatus ? (
          <span className={c.lastFetchStatus === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"} title={c.lastFetchError ?? undefined}>
            {c.lastFetchStatus}
            {c.consecutiveFailures ? ` ×${c.consecutiveFailures}` : ""}
          </span>
        ) : (
          <span className={muted}>never</span>
        )}
        <div className={muted}>{c.lastFetchedLabel}</div>
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setTest("…");
            start(async () => {
              const r = await testFetchAction({ companyId: c.id });
              setTest(r.ok ? `${r.count} jobs in ${(r.ms / 1000).toFixed(1)}s` : `error: ${r.message}`);
            });
          }}
          className={`${btnSecondary} whitespace-nowrap`}
        >
          Test fetch
        </button>
        {test ? <div className={`mt-1 max-w-40 text-xs ${test.startsWith("error") ? "text-red-700 dark:text-red-400" : muted}`}>{test}</div> : null}
      </td>
    </tr>
  );
}

export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  if (!companies.length) return <p className={`text-sm ${muted}`}>No companies yet. Add one below.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className={`text-left text-xs uppercase tracking-wide ${muted}`}>
            <th className="px-2 py-1">Name</th>
            <th className="px-2 py-1">ATS / slug</th>
            <th className="px-2 py-1">Priority</th>
            <th className="px-2 py-1">Active</th>
            <th className="px-2 py-1">Last fetch</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
