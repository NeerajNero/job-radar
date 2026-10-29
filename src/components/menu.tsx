"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { btnSecondary } from "./ui";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

export function Menu({
  label,
  icon,
  items,
  align = "left",
  className = "",
  disabled,
}: {
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${btnSecondary} w-full`}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute z-20 mt-1 min-w-44 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`block min-h-11 w-full px-3 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${it.danger ? "text-red-700 dark:text-red-400" : ""}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
