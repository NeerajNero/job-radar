import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export const IST = "Asia/Kolkata";

export function fmtIst(d: Date | null | undefined, pattern = "dd MMM HH:mm"): string {
  return d ? formatInTimeZone(d, IST, pattern) : "-";
}

export function fmtAgo(d: Date | null | undefined): string {
  return d ? `${formatDistanceToNowStrict(d)} ago` : "unknown";
}
