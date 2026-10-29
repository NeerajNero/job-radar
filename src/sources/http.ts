export const USER_AGENT = "job-radar/1.0 (personal use)";
export const DEFAULT_TIMEOUT_MS = 12_000;

export class SourceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SourceError";
  }
}

export type JsonResponse = { status: number; data: unknown };

/**
 * GET a JSON document with the project User-Agent and a hard 12 s timeout.
 * Resolves for any HTTP status (the caller decides); rejects with SourceError
 * on timeout, network failure or a non-JSON body.
 */
export async function getJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Error pages (e.g. Ashby 404) are plain text; only a 2xx must be JSON.
        if (res.ok) throw new SourceError(`HTTP ${res.status}: body is not JSON`, res.status);
        data = null;
      }
    }
    return { status: res.status, data };
  } catch (err) {
    if (err instanceof SourceError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new SourceError(`timeout after ${timeoutMs / 1000}s`);
    }
    throw new SourceError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** getJson that additionally rejects on a non-2xx status. */
export async function fetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const { status, data } = await getJson(url, timeoutMs);
  if (status < 200 || status >= 300) throw new SourceError(`HTTP ${status}`, status);
  return data;
}
