import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"

/**
 * Change feed for estimates.
 *
 * PrimeEco offers no "estimates changed since X" endpoint and ignores query
 * filters, so recency is discovered by paging `/estimate-items-snapshot`
 * newest-first and reading the identifiers off the line items.
 *
 * SCOPE — read this before using anything here:
 * This module answers only "WHICH estimates changed recently, and when".
 * It must NOT be used to total an estimate or list its lines: the feed holds
 * an arbitrary subset of any one estimate's lines, and each line carries its
 * own version. Load the estimate itself (estimate-snapshot.ts) for content.
 *
 * ORDERING — by `updatedAt`, not `createdAt`:
 * Authorising an estimate created weeks ago updates its rows IN PLACE rather
 * than writing new ones (44 of 1,000 sampled lines had a later updatedAt than
 * createdAt). Ordering by creation date therefore hid approvals of older
 * estimates entirely.
 */

interface FeedEnvelope {
  data?: Array<{ attributes?: Record<string, unknown> }>
}

/** One estimate seen in the recent-changes window. */
export interface EstimateChange {
  estimateId: string
  jobId: string
  /** When the estimate was last touched — our "approved at" signal. */
  changedAt: string | null
  /** Highest line version seen; used to key the snapshot cache. */
  version: number
  /** Who created the estimate (PrimeEco stores the name, not an id). */
  createdBy: string
}

export interface EstimateChanges {
  changes: EstimateChange[]
  /**
   * False when the time budget ran out before the whole window was paged.
   * Callers should poll again shortly to extend coverage.
   */
  complete: boolean
}

/**
 * How far back to look for approvals.
 *
 * Kept equal to the board's display window (APPROVAL_WINDOW_DAYS in
 * lib/scheduling/index.ts): a wider net here costs real time — measured live,
 * 21 days discovered 163 estimates against 92 for 14 — and every extra
 * estimate is a snapshot to load for rows that are then filtered out anyway.
 */
const WINDOW_DAYS = 14
const PER_PAGE = 500
/** Safety cap so a runaway dataset can't exhaust the rate limit. */
const MAX_PAGES = 16
/** PrimeEco allows 5 concurrent requests; leave one spare for other fetches. */
const BATCH = 4
/**
 * Page cache TTLs, tiered by how volatile the page is.
 *
 * The feed is ordered newest-first, so a new approval always lands on page 1
 * while deeper pages hold history that only shifts as volume pushes it down.
 * Measured live, an uncached page can take upwards of 10s, so refetching all
 * of them on a short timer was the main reason cold requests ran out of budget
 * and returned partial lists.
 *
 * Page 1 therefore stays fresh (new approvals appear quickly) and the rest are
 * held long enough that a warm request rarely pays for them.
 */
const FIRST_PAGE_TTL_S = 5 * 60
const DEEPER_PAGE_TTL_S = 6 * 60 * 60
/**
 * Time one request may spend on UNCACHED pages. Vercel's Hobby plan allows the
 * whole function 10s and the page loads other data too, so coverage is built up
 * across successive polls rather than in one long request.
 */
const TIME_BUDGET_MS = 4_000

const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? n : 0
}

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

function toTimestamp(value: unknown): number {
  const text = toText(value)
  if (!text) return 0
  const ms = new Date(text.replace(" ", "T")).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

const toIso = (value: unknown): string | null => {
  const ms = toTimestamp(value)
  return ms === 0 ? null : new Date(ms).toISOString()
}

/** When a feed row last changed; updatedAt wins, createdAt is the fallback. */
function rowChangedAt(row: Record<string, unknown>): number {
  return Math.max(toTimestamp(row.updatedAt), toTimestamp(row.createdAt))
}

function fetchPage(page: number): Promise<FeedEnvelope> {
  return apiFetch<FeedEnvelope>("/estimate-items-snapshot", {
    searchParams: { page, per_page: PER_PAGE, order: "updatedAt|DESC" },
  })
}

/** Page 1 — refreshed often so newly approved work shows up quickly. */
const getCachedFirstPage = unstable_cache(fetchPage, ["primeeco-estimate-changes-head-v2"], {
  revalidate: FIRST_PAGE_TTL_S,
  tags: ["primeeco-estimate-changes"],
})

/** Pages 2+ — history, held long so warm requests don't refetch it. */
const getCachedDeeperPage = unstable_cache(fetchPage, ["primeeco-estimate-changes-tail-v2"], {
  revalidate: DEEPER_PAGE_TTL_S,
  tags: ["primeeco-estimate-changes"],
})

const getCachedPage = (page: number) =>
  page === 1 ? getCachedFirstPage(page) : getCachedDeeperPage(page)

/**
 * Page the feed newest-first and collapse it to one entry per estimate.
 * Stops at the window edge, the page cap, or the time budget.
 */
export async function fetchRecentEstimateChanges(): Promise<EstimateChanges> {
  const startedAt = Date.now()
  const cutoff = startedAt - WINDOW_DAYS * 86_400_000
  const byEstimate = new Map<string, EstimateChange>()
  let complete = false

  for (let firstPage = 1; firstPage <= MAX_PAGES; firstPage += BATCH) {
    const pageNumbers = Array.from(
      { length: Math.min(BATCH, MAX_PAGES - firstPage + 1) },
      (_, offset) => firstPage + offset,
    )
    const pages = await Promise.all(pageNumbers.map(getCachedPage))

    let reachedWindowEdge = false
    for (const page of pages) {
      const rows = page.data ?? []
      for (const row of rows) {
        const attributes = row.attributes ?? {}
        const changedAtMs = rowChangedAt(attributes)
        if (changedAtMs < cutoff) {
          reachedWindowEdge = true
          continue
        }

        const estimateId = toText(attributes.estimateId)
        if (!estimateId) continue

        const version = toNumber(attributes.version)
        const existing = byEstimate.get(estimateId)
        // Keep the most recent sighting: it carries the latest change time and
        // the highest version, which keys the snapshot cache.
        if (!existing || version > existing.version) {
          byEstimate.set(estimateId, {
            estimateId,
            jobId: toText(attributes.jobId) ?? "",
            changedAt: toIso(attributes.updatedAt) ?? toIso(attributes.createdAt),
            version,
            createdBy: toText(attributes.createdBy) ?? "Unknown",
          })
        }
      }
      // A short page means there is nothing older left to read.
      if (rows.length < PER_PAGE) reachedWindowEdge = true
    }

    if (reachedWindowEdge || firstPage + BATCH > MAX_PAGES) {
      complete = true
      break
    }
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
  }

  const changes = [...byEstimate.values()].sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? ""))
  return { changes, complete }
}
