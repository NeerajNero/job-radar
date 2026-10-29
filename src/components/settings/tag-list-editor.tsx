"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { input, label as labelCls, muted } from "../ui";

/** Pills with remove buttons plus an add box; serialises to a hidden JSON field. */
export function TagListEditor({ name, label, initial, hint }: { name: string; label: string; initial: string[]; hint?: string }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const parts = draft
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    setItems((cur) => [...cur, ...parts.filter((p) => !cur.includes(p))]);
    setDraft("");
  }

  return (
    <fieldset className="min-w-0">
      <legend className={labelCls}>
        {label} <span className={muted}>({items.length})</span>
      </legend>
      {hint ? <p className={`mt-0.5 text-xs ${muted}`}>{hint}</p> : null}
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((t) => (
          <li key={t} className="inline-flex items-center rounded-full border border-neutral-300 bg-neutral-50 pl-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => setItems((cur) => cur.filter((x) => x !== t))}
              className="inline-flex size-11 items-center justify-center rounded-full text-neutral-500 hover:text-red-600 dark:text-neutral-400"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add term, Enter to add"
          aria-label={`Add to ${label}`}
          className={input}
        />
        <button type="button" onClick={add} className="min-h-11 shrink-0 rounded-md border border-neutral-300 px-3 text-sm font-medium dark:border-neutral-700">
          Add
        </button>
      </div>
    </fieldset>
  );
}
