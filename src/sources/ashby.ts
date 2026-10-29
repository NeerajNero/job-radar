import { z } from "zod";
import { fetchJson, SourceError } from "./http";
import { joinLocations, toDate, truncateDescription, type NormalizedJob, type SourceAdapter } from "./types";

// Verified 2026-10-29 against api.ashbyhq.com/posting-api/job-board/notion: every expected
// field present; isRemote may be null; locations may carry trailing whitespace; isListed exists.
const AshbyJob = z
  .object({
    id: z.string(),
    title: z.string(),
    jobUrl: z.string(),
    applyUrl: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    secondaryLocations: z
      .array(z.object({ location: z.string().nullable().optional() }).passthrough())
      .nullable()
      .optional(),
    isRemote: z.boolean().nullable().optional(),
    isListed: z.boolean().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
  })
  .passthrough();

const AshbyBoard = z.object({ jobs: z.array(AshbyJob) }).passthrough();

function normalise(j: z.infer<typeof AshbyJob>): NormalizedJob {
  const location = joinLocations([j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)]);
  return {
    source: "ashby",
    externalId: j.id,
    title: j.title.trim(),
    location,
    isRemote: j.isRemote === true || (location ? /\bremote\b/i.test(location) : false),
    url: j.jobUrl,
    applyUrl: j.applyUrl || j.jobUrl,
    postedAt: toDate(j.publishedAt),
    descriptionText: truncateDescription(j.descriptionPlain),
  };
}

export const ashby: SourceAdapter = {
  ats: "ashby",
  boardUrl: (slug) =>
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  parseBoard(data) {
    const parsed = AshbyBoard.safeParse(data);
    if (!parsed.success) throw new SourceError(`unexpected ashby shape: ${parsed.error.issues[0]?.message ?? "?"}`);
    return parsed.data.jobs.filter((j) => j.isListed !== false).map(normalise);
  },
  async fetchBoard(slug) {
    return ashby.parseBoard(await fetchJson(ashby.boardUrl(slug)));
  },
};
