import type { Ats } from "@/db/schema";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { SourceAdapter } from "./types";

export const sources: Record<Ats, SourceAdapter> = { greenhouse, lever, ashby };

export const ATS_LIST = Object.keys(sources) as Ats[];

export function getSource(ats: Ats): SourceAdapter {
  return sources[ats];
}

export type { NormalizedJob, SourceAdapter } from "./types";
export { SourceError } from "./http";
