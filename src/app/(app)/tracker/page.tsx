import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tracker" };

export default function TrackerPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Tracker</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        Applications and follow-ups will be tracked here.
      </p>
    </section>
  );
}
