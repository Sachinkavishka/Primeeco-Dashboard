import "server-only"
import { apiFetch } from "./client"
import type { RawJob } from "./types"

/**
 * Repository for PrimeEco jobs. Returns RAW jobs; the facade (index.ts) resolves
 * their UUID references to names via the lookups, then normalizes.
 */

interface ListEnvelope<T> {
  data?: T[]
  meta?: { pagination?: { total_pages?: number; current_page?: number; total?: number } }
  links?: { next?: string | null }
}

const PER_PAGE = 500
/** Safety cap so a runaway dataset can't exhaust the 60-req/min rate limit. */
const MAX_PAGES = 12

/**
 * Fetch all jobs across pages (bounded by MAX_PAGES), newest first.
 * @param signal optional AbortSignal to cancel in-flight requests.
 */
export async function fetchAllRawJobs(signal?: AbortSignal): Promise<RawJob[]> {
  const all: RawJob[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = await apiFetch<ListEnvelope<RawJob>>("/jobs", {
      searchParams: { page, per_page: PER_PAGE, order: "createdAt|DESC" },
      signal,
    })

    const items = payload.data ?? []
    all.push(...items)

    const totalPages = payload.meta?.pagination?.total_pages
    const reachedEnd =
      items.length < PER_PAGE || (totalPages !== undefined && page >= totalPages)
    if (reachedEnd) break
  }

  return all
}
