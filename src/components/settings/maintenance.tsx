"use client";

import { useState, useTransition } from "react";
import { reevaluateAction, runTickAction } from "@/app/(app)/settings/actions";
import { btnPrimary, btnSecondary, muted } from "../ui";

export function Maintenance() {
  const [tickPending, startTick] = useTransition();
  const [reevalPending, startReeval] = useTransition();
  const [tickMsg, setTickMsg] = useState<string | null>(null);
  const [reevalMsg, setReevalMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <button
          type="button"
          disabled={tickPending}
          onClick={() =>
            startTick(async () => {
              setTickMsg("Running… this can take up to a minute.");
              const r = await runTickAction();
              setTickMsg(
                r.ok
                  ? `Fetched ${r.fetched}, ${r.new} new, ${r.notified} notified, ${r.errors.length} errors in ${(r.ms / 1000).toFixed(1)}s${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`
                  : `Failed: ${r.message}`,
              );
            })
          }
          className={`${btnPrimary} w-full`}
        >
          {tickPending ? "Running tick…" : "Run tick now"}
        </button>
        {tickMsg ? <p className={`mt-2 text-sm ${muted}`}>{tickMsg}</p> : null}
      </div>
      <div className="flex-1">
        <button
          type="button"
          disabled={reevalPending}
          onClick={() =>
            startReeval(async () => {
              setReevalMsg("Re-evaluating…");
              const r = await reevaluateAction();
              setReevalMsg(
                r.ok
                  ? `Scanned ${r.scanned}, changed ${r.changed}: ${r.byStatus.new} new, ${r.byStatus.ignored} ignored (title ${r.byReason.title}, location ${r.byReason.location}, age ${r.byReason.age}) in ${(r.durationMs / 1000).toFixed(1)}s`
                  : `Failed: ${r.message}`,
              );
            })
          }
          className={`${btnSecondary} w-full`}
        >
          {reevalPending ? "Re-evaluating…" : "Re-evaluate open jobs"}
        </button>
        {reevalMsg ? <p className={`mt-2 text-sm ${muted}`}>{reevalMsg}</p> : null}
      </div>
    </div>
  );
}
