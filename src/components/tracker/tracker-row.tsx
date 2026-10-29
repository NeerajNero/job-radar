"use client";

import { useState, useTransition } from "react";
import { setJobStatusAction, updateJobFieldsAction } from "@/app/(app)/jobs/actions";
import type { JobStatus } from "@/db/schema";
import { ACTIONABLE_STATUSES, STATUS_LABELS } from "@/lib/jobs";
import { useToast } from "../toast";
import { input } from "../ui";

export type TrackerJob = {
  id: number;
  company: string;
  title: string;
  url: string;
  status: JobStatus;
  appliedLabel: string;
  referrerName: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string | null;
  overdue: boolean;
};

const cell = "px-2 py-1.5 align-top";
const compact = `${input} min-w-32 px-2 text-sm`;

export function TrackerRow({ job }: { job: TrackerJob }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [referrer, setReferrer] = useState(job.referrerName ?? "");
  const [nextAction, setNextAction] = useState(job.nextAction ?? "");
  const [nextDate, setNextDate] = useState(job.nextActionDate ?? "");
  const [notes, setNotes] = useState(job.notes ?? "");

  function save(fields: Parameters<typeof updateJobFieldsAction>[0] extends infer T ? Omit<T, "jobId"> : never) {
    startTransition(async () => {
      const r = await updateJobFieldsAction({ jobId: job.id, ...fields });
      toast.show(r.ok ? "Saved" : `Failed: ${r.error}`);
    });
  }

  function changeStatus(status: JobStatus) {
    startTransition(async () => {
      const r = await setJobStatusAction({ jobId: job.id, status });
      toast.show(r.ok ? `Status: ${STATUS_LABELS[status]}` : `Failed: ${r.error}`);
    });
  }

  return (
    <tr
      className={`border-t border-neutral-200 dark:border-neutral-800 ${job.overdue ? "bg-red-50 dark:bg-red-950/30" : ""} ${pending ? "opacity-60" : ""}`}
      aria-busy={pending}
    >
      <td className={`${cell} whitespace-nowrap font-medium`}>{job.company}</td>
      <td className={`${cell} min-w-48`}>
        <a href={job.url} target="_blank" rel="noreferrer" className="hover:underline">
          {job.title}
        </a>
      </td>
      <td className={cell}>
        <select
          aria-label="Status"
          value={job.status}
          onChange={(e) => changeStatus(e.target.value as JobStatus)}
          className={`${compact} min-w-36`}
        >
          {[...ACTIONABLE_STATUSES, "new", "ignored"].map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s as JobStatus]}
            </option>
          ))}
        </select>
      </td>
      <td className={`${cell} whitespace-nowrap text-sm`}>{job.appliedLabel}</td>
      <td className={cell}>
        <input
          aria-label="Referrer"
          value={referrer}
          onChange={(e) => setReferrer(e.target.value)}
          onBlur={() => referrer !== (job.referrerName ?? "") && save({ referrerName: referrer })}
          placeholder="Referrer"
          className={compact}
        />
      </td>
      <td className={cell}>
        <div className="flex min-w-56 flex-col gap-1">
          <input
            aria-label="Next action"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            onBlur={() => nextAction !== (job.nextAction ?? "") && save({ nextAction })}
            placeholder="Next action"
            className={compact}
          />
          <input
            aria-label="Next action date"
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            onBlur={() => nextDate !== (job.nextActionDate ?? "") && save({ nextActionDate: nextDate })}
            className={compact}
          />
        </div>
      </td>
      <td className={cell}>
        <textarea
          aria-label="Notes"
          value={notes}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (job.notes ?? "") && save({ notes })}
          placeholder="Notes"
          className={`${compact} min-w-56 py-2`}
        />
      </td>
    </tr>
  );
}
