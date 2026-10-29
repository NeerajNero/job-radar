import { ChevronRight } from "lucide-react";
import { muted } from "../ui";

export const FUNNEL_STEPS = [
  { key: "new", label: "New" },
  { key: "applied", label: "Applied" },
  { key: "referral_asked", label: "Referral asked" },
  { key: "replied", label: "Replied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
] as const;

export function Funnel({ counts }: { counts: Record<string, number> }) {
  return (
    <ol aria-label="Funnel" className="-mx-4 flex items-stretch gap-1 overflow-x-auto px-4 pb-1">
      {FUNNEL_STEPS.map((s, i) => (
        <li key={s.key} className="flex shrink-0 items-center gap-1">
          <div className="flex min-h-11 min-w-20 flex-col items-center justify-center rounded-md border border-neutral-200 px-2 py-1 dark:border-neutral-800">
            <span className="text-base font-semibold leading-tight">{counts[s.key] ?? 0}</span>
            <span className={`text-[11px] leading-tight ${muted}`}>{s.label}</span>
          </div>
          {i < FUNNEL_STEPS.length - 1 ? <ChevronRight className={`size-4 ${muted}`} aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
