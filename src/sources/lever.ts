import { z } from "zod";
import { htmlToText } from "@/lib/html";
import { fetchJson, SourceError } from "./http";
import { joinLocations, toDate, truncateDescription, type NormalizedJob, type SourceAdapter } from "./types";

// Verified 2026-10-29 against api.lever.co/v0/postings/spotify?mode=json: bare array; every
// expected field present; workplaceType ∈ {hybrid, onsite, remote}; no updatedAt;
// categories.allLocations is an array alongside categories.location. descriptionPlain is only
// the intro (empty on 15/89 postings): the body lives in lists[].content (HTML) and additionalPlain.
const LeverJob = z
  .object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    applyUrl: z.string().nullable().optional(),
    categories: z
      .object({
        location: z.string().nullable().optional(),
        allLocations: z.array(z.string()).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    workplaceType: z.string().nullable().optional(),
    createdAt: z.number().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    openingPlain: z.string().nullable().optional(),
    descriptionBodyPlain: z.string().nullable().optional(),
    lists: z
      .array(z.object({ text: z.string().nullable().optional(), content: z.string().nullable().optional() }).passthrough())
      .nullable()
      .optional(),
    additionalPlain: z.string().nullable().optional(),
  })
  .passthrough();

const LeverBoard = z.array(LeverJob);

function description(j: z.infer<typeof LeverJob>): string | null {
  const parts: string[] = [];
  const intro = j.descriptionPlain?.trim() || [j.openingPlain, j.descriptionBodyPlain].map((s) => s?.trim() ?? "").filter(Boolean).join("\n\n");
  if (intro) parts.push(intro);
  for (const l of j.lists ?? []) {
    const heading = l.text?.trim();
    const body = l.content ? htmlToText(l.content) : "";
    if (heading || body) parts.push([heading, body].filter(Boolean).join("\n"));
  }
  if (j.additionalPlain?.trim()) parts.push(j.additionalPlain.trim());
  return parts.length ? parts.join("\n\n") : null;
}

function normalise(j: z.infer<typeof LeverJob>): NormalizedJob {
  const all = j.categories?.allLocations ?? [];
  const location = joinLocations(all.length ? all : [j.categories?.location]);
  const remoteType = (j.workplaceType ?? "").toLowerCase() === "remote";
  return {
    source: "lever",
    externalId: j.id,
    title: j.text.trim(),
    location,
    isRemote: remoteType || (location ? /\bremote\b/i.test(location) : false),
    url: j.hostedUrl,
    applyUrl: j.applyUrl || j.hostedUrl,
    postedAt: toDate(j.createdAt),
    descriptionText: truncateDescription(description(j)),
  };
}

export const lever: SourceAdapter = {
  ats: "lever",
  boardUrl: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  parseBoard(data) {
    const parsed = LeverBoard.safeParse(data);
    if (!parsed.success) throw new SourceError(`unexpected lever shape: ${parsed.error.issues[0]?.message ?? "?"}`);
    return parsed.data.map(normalise);
  },
  async fetchBoard(slug) {
    return lever.parseBoard(await fetchJson(lever.boardUrl(slug)));
  },
};
