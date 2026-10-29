import { z } from "zod";
import { htmlToText } from "@/lib/html";
import { fetchJson, SourceError } from "./http";
import { joinLocations, toDate, truncateDescription, type NormalizedJob, type SourceAdapter } from "./types";

// Verified 2026-10-29 against boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true:
// every expected field present; `content` is entity-encoded HTML; no separate apply URL.
const GreenhouseJob = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    absolute_url: z.string(),
    location: z.object({ name: z.string().nullable().optional() }).passthrough().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    first_published: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
  })
  .passthrough();

const GreenhouseBoard = z.object({ jobs: z.array(GreenhouseJob) }).passthrough();

function normalise(j: z.infer<typeof GreenhouseJob>): NormalizedJob {
  const location = joinLocations([j.location?.name]);
  return {
    source: "greenhouse",
    externalId: String(j.id),
    title: j.title.trim(),
    location,
    isRemote: location ? /\bremote\b/i.test(location) : false,
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    postedAt: toDate(j.first_published) ?? toDate(j.updated_at),
    descriptionText: truncateDescription(j.content ? htmlToText(j.content) : null),
  };
}

export const greenhouse: SourceAdapter = {
  ats: "greenhouse",
  timeoutMs: 12_000,
  boardUrl: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  parseBoard(data) {
    const parsed = GreenhouseBoard.safeParse(data);
    if (!parsed.success) throw new SourceError(`unexpected greenhouse shape: ${parsed.error.issues[0]?.message ?? "?"}`);
    return parsed.data.jobs.map(normalise);
  },
  async fetchBoard(slug) {
    return greenhouse.parseBoard(await fetchJson(greenhouse.boardUrl(slug), greenhouse.timeoutMs));
  },
};
