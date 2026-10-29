"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Rss, Settings } from "lucide-react";

const tabs = [
  { href: "/", label: "Feed", icon: Rss },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-screen-md items-stretch px-2"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                active
                  ? "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                  : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
              ].join(" ")}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
