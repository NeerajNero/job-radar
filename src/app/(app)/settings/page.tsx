import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        Companies, matching rules and Telegram pairing will live here.
      </p>
    </section>
  );
}
