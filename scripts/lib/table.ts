/** Tiny fixed-width table printer for CLI scripts (no index column, truncation with …). */
export type Column<T> = { key: keyof T & string; label?: string; max?: number; align?: "left" | "right" };

function cell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function fit(s: string, width: number, max: number | undefined, align: "left" | "right"): string {
  let t = s.replace(/\s+/g, " ");
  if (max && t.length > max) t = t.slice(0, max - 1) + "…";
  return align === "right" ? t.padStart(width) : t.padEnd(width);
}

export function formatTable<T extends object>(rows: T[], columns: Column<T>[]): string {
  const widths = columns.map((c) => {
    const label = c.label ?? c.key;
    const longest = rows.reduce((w, r) => {
      let s = cell(r[c.key]);
      if (c.max && s.length > c.max) s = s.slice(0, c.max);
      return Math.max(w, s.length);
    }, label.length);
    return c.max ? Math.min(longest, c.max) : longest;
  });
  const line = (vals: string[]) => vals.map((v, i) => fit(v, widths[i], columns[i].max, columns[i].align ?? "left")).join("  ");
  const header = line(columns.map((c) => c.label ?? c.key));
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows.map((r) => line(columns.map((c) => cell(r[c.key]))));
  return [header, sep, ...body].join("\n");
}

export function printTable<T extends object>(rows: T[], columns: Column<T>[]): void {
  console.log(formatTable(rows, columns));
}
