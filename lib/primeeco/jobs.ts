import "server-only"
import { apiFetch } from "./client"
import { normalizeJob } from "./normalize"
import type { DashboardJob, RawJob } from "./types"

/**
 * Repository for PrimeEco jobs. Returns already-normalized `DashboardJob`s so
 * callers never see the raw upstream shape.
 */

/** Loosely-typed list envelope covering both JSON:API and plain-array responses. */
interface ListEnvelope<T> {
  data?: T[]
  meta?: { pagination?: { total_pages?: number; current_page?: number; total?: number } }
  links?: { next?: string | null }
}

const PER_PAGE = 100
/** Safety cap so a runaway dataset can't exhaust the 60-req/min rate limit. */
const MAX_PAGES = 20

function extractList<T>(payload: ListEnvelope<T> | T[]): {
  items: T[]
  totalPages?: number
  hasNext: boolean
} {
  if (Array.isArray(payload)) return { items: payload, hasNext: false }
  const items = payload.data ?? []
  const totalPages = payload.meta?.pagination?.total_pages
  const hasNext = Boolean(payload.links?.next)
  return { items, totalPages, hasNext }
}

/**
 * Fetch all jobs across pages (bounded by MAX_PAGES).
 * @param signal optional AbortSignal to cancel in-flight requests.
 */
export async function fetchAllJobs(signal?: AbortSignal): Promise<DashboardJob[]> {
  const all: DashboardJob[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = await apiFetch<ListEnvelope<RawJob>>("/jobs", {
      searchParams: {
        page,
        per_page: PER_PAGE,
        order: "createdAt|DESC",
      },
      signal,
    })

    const { items, totalPages, hasNext } = extractList(payload)
    all.push(...items.map(normalizeJob))

    const reachedEnd =
      items.length < PER_PAGE ||
      (totalPages !== undefined && page >= totalPages) ||
      (totalPages === undefined && !hasNext)
    if (reachedEnd) break
  }

  return all
}
