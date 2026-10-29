"use client";

import { Copy, ExternalLink, Megaphone, MoreHorizontal, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { setJobStatusAction } from "@/app/(app)/jobs/actions";
import type { JobStatus } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/job-status";
import { Menu } from "../menu";
import { copyText, useToast } from "../toast";
import { PRIORITY_DOT, STATUS_PILL, btnPrimary, btnSecondary, card, muted, pill } from "../ui";

export type FeedCard = {
  id: number;
  company: string;
  priority: number;
  title: string;
  location: string | null;
  postedAgo: string;
  postedIst: string;
  score: number;
  keywords: string[];
  status: JobStatus;
  description: string | null;
  url: string;
  applyUrl: string;
  referrerUrl: string;
  hiringUrl: string;
  templates: Array<{ kind: string; label: string; text: string }>;
};

export function JobCard({ job }: { job: FeedCard }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function mark(status: JobStatus) {
    startTransition(async () => {
      const r = await setJobStatusAction({ jobId: job.id, status });
      toast.show(r.ok ? `Marked ${STATUS_LABELS[status].toLowerCase()}` : `Failed: ${r.error}`);
    });
  }

  async function copy(label: string, text: string) {
    const ok = await copyText(text);
    toast.show(ok ? `${label} message copied` : "Copy failed");
  }

  return (
    <article className={`${card} ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block size-2.5 shrink-0 rounded-full ${PRIORITY_DOT[job.priority] ?? PRIORITY_DOT[3]}`} aria-label={`priority ${job.priority}`} />
            <span className="truncate font-medium">{job.company}</span>
            {job.status !== "new" ? (
              <span className={`${pill} ${STATUS_PILL[job.status] ?? ""}`}>{STATUS_LABELS[job.status]}</span>
            ) : null}
          </div>
          <h2 className="mt-1 text-base font-semibold leading-snug">
            <a href={job.url} target="_blank" rel="noreferrer" className="hover:underline">
              {job.title}
            </a>
          </h2>
          <p className={`mt-1 text-sm ${muted}`}>
            {job.location ?? "Location not given"} · <span title={job.postedIst}>posted {job.postedAgo}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="inline-flex min-w-9 items-center justify-center rounded-md bg-neutral-900 px-2 py-1 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
            aria-label={`score ${job.score}`}
          >
            {job.score}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide description" : "Show description"}
            className="inline-flex size-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </div>

      {job.keywords.length ? (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="matched keywords">
          {job.keywords.map((k) => (
            <li key={k} className={pill}>
              {k}
            </li>
          ))}
        </ul>
      ) : null}

      {expanded ? (
        <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-950">
          {job.description ?? "No description captured."}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <a href={job.applyUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
          <ExternalLink className="size-4" aria-hidden />
          Apply
        </a>
        <a href={job.referrerUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
          <Users className="size-4" aria-hidden />
          Find referrer
        </a>
        <a href={job.hiringUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
          <Megaphone className="size-4" aria-hidden />
          Hiring posts
        </a>
        <Menu
          label="Copy message"
          icon={<Copy className="size-4" aria-hidden />}
          className="col-span-2"
          items={job.templates.map((t) => ({ label: t.label, onSelect: () => copy(t.label, t.text) }))}
        />
        <Menu
          label="Mark"
          align="right"
          disabled={pending}
          items={[
            { label: "Applied", onSelect: () => mark("applied") },
            { label: "Referral asked", onSelect: () => mark("referral_asked") },
            { label: "Ignore", onSelect: () => mark("ignored"), danger: true },
          ]}
        />
      </div>
    </article>
  );
}
