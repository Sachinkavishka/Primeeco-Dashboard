import "server-only"
import { connecteamConfig } from "./config"

/**
 * Low-level Connecteam API client: API-key auth + a thin JSON fetch helper.
 *
 * Connecteam wraps list responses as:
 *   { requestId, data: { <resource>: [...] }, paging: { offset, limit, total } }
 * and paginates with `offset`/`limit` query params. We keep the envelope
 * permissive here and unwrap in the repos.
 */

export interface CtFetchOptions {
  searchParams?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

/** Fetch a Connecteam JSON resource with the API key header + one 429 note. */
export async function ctFetch<T>(path: string, opts: CtFetchOptions = {}): Promise<T> {
  const url = new URL(`${connecteamConfig.apiUrl}${path.startsWith("/") ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(opts.searchParams ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: {
      [connecteamConfig.apiKeyHeader]: connecteamConfig.apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: opts.signal,
  })

  if (res.status === 429) {
    const retry = res.headers.get("retry-after")
    throw new Error(`Connecteam rate limit hit (429). Retry after ${retry ?? "?"}s.`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Connecteam ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }

  return (await res.json()) as T
}
