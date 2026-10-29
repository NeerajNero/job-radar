import { addDays, formatDistanceToNowStrict, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const IST = "Asia/Kolkata";

/** Today's IST calendar date as yyyy-MM-dd. */
export function todayIst(now: Date = new Date()): string {
  return formatInTimeZone(now, IST, "yyyy-MM-dd");
}

/** yyyy-MM-dd (an IST calendar date) + n working days (Mon–Fri), as yyyy-MM-dd. */
export function addWorkingDays(dateIso: string, n: number): string {
  let d = parseISO(dateIso); // treated as a plain calendar date; only weekday arithmetic matters
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return formatInTimeZone(fromZonedTime(d, IST), IST, "yyyy-MM-dd");
}

export function followUpDate(now: Date = new Date()): string {
  return addWorkingDays(todayIst(now), 3);
}

export function fmtIst(d: Date | null | undefined, pattern = "dd MMM HH:mm"): string {
  return d ? formatInTimeZone(d, IST, pattern) : "-";
}

export function fmtIstDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return formatInTimeZone(toZonedTime(parseISO(iso), IST), IST, "dd MMM");
}

export function fmtAgo(d: Date | null | undefined): string {
  return d ? `${formatDistanceToNowStrict(d)} ago` : "unknown";
}

export function isOverdue(iso: string | null | undefined, now: Date = new Date()): boolean {
  return !!iso && iso < todayIst(now);
}
