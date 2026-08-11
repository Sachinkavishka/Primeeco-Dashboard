import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"

/**
 * Estimated labour time per job, extracted from /estimate-items-snapshot for
 * RECENTLY AUTHORISED estimates (the coordinator plans the upcoming week from
 * these — we deliberately don't scan the full 21k-row history).
 *
 * Field knowledge (confirmed against live payloads 2026-08-11):
 *   - labour time lives on lines with labourQuantity > 0
 *   - labourUnit is "hr" for hours, "days"/"wk" for day-based lines
 *   - the ROLE is in the description ("Technician Hours - Standard Rate",
 *     "Project Manager Hours…", "Supervisor Hours…", "Labourer Hours…")
 *
 * Per the coordinators: the 4 roles are reported separately, and hours vs days
 * are shown separately (no conversion).
 *
 * The endpoint ignores filters entirely and pages take ~1s each, so we pull
 * newest-first (order=createdAt|DESC) and stop once we've covered the window.
 *
 * HOBBY-SAFE fetch strategy: a full window is ~12 pages (~9s+), which would
 * blow Vercel Hobby's 10s function limit when stacked on the other dashboard
 * fetches. So each REQUEST spends at most TIME_BUDGET_MS fetching; every page
 * fetched goes through Next's Data Cache (4h TTL), so subsequent requests skip
 * straight past cached pages and extend coverage. The client polls faster while
 * `complete` is false, so the table fills within a poll or two and then serves
 * instantly for the next 4 hours.
 */

export type HoursRole = "Technician" | "Project Manager" | "Supervisor" | "Labourer" | "Other"

export interface RoleTime {
  hours: number
  days: number
}

/** Per-job estimated labour time, broken out by role. */
export interface JobEstimateHours {
  jobId: string
  byRole: Partial<Record<HoursRole, RoleTime>>
  totalHours: number
  totalDays: number
}

export interface EstimateHoursData {
  live: boolean
  generatedAt: string
  /** Days of estimate-item history covered (createdAt window). */
  windowDays: number
  /**
   * False while the time-budgeted fetch hasn't covered the whole window yet —
   * the client should poll again soon to extend coverage.
   */
  complete: boolean
  byJob: Record<string, JobEstimateHours>
  error?: string
}

interface SnapshotEnvelope {
  data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
  meta?: { pagination?: { total_pages?: number } }
}

const WINDOW_DAYS = 21
const PER_PAGE = 500
const MAX_PAGES = 16 // hard cap (~8k newest lines) even if the window isn't reached
const BATCH = 4 // PrimeEco allows 5 concurrent; leave one slot for other calls
const REVALIDATE_S = 4 * 60 * 60 // "every few hours" freshness
/**
 * Max time one request may spend on UNCACHED page fetches. Hobby gives the
 * whole function 10s and the scheduling page also loads estimates + roster,
 * so keep this tight; coverage completes across the client's polls.
 */
const TIME_BUDGET_MS = 4_000

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => (typeof v === "string" ? v : "")

export function roleOf(description: string): HoursRole {
  const d = description.toLowerCase()
  if (/technician/.test(d)) return "Technician"
  if (/project\s*manager/.test(d)) return "Project Manager"
  if (/supervisor/.test(d)) return "Supervisor"
  if (/labou?rer/.test(d)) return "Labourer"
  return "Other"
}

export const isHourUnit = (u: string) => /^hr/i.test(u)
export const isDayUnit = (u: string) => /^(day|wk|week)/i.test(u)

/**
 * Equipment Hire lines are RENTAL periods (dehumidifier days etc.), not people
 * time — measured live, 185 of 186 day-unit lines were Equipment Hire. They are
 * excluded from labour time entirely (per the coordinators).
 */
export const isEquipmentHireTrade = (trade: string) => /equipment\s*hire/i.test(trade)

function parseCreatedAt(v: unknown): number {
  const s = str(v)
  if (!s) return 0
  const t = new Date(s.replace(" ", "T")).getTime()
  return Number.isNaN(t) ? 0 : t
}

async function fetchPage(page: number): Promise<SnapshotEnvelope> {
  return apiFetch<SnapshotEnvelope>("/estimate-items-snapshot", {
    searchParams: { page, per_page: PER_PAGE, order: "createdAt|DESC" },
  })
}

/**
 * One page through Next's cross-invocation Data Cache. The page number is part
 * of the cache key (unstable_cache keys include the fn arguments), so each page
 * is fetched from PrimeEco at most once per 4h across ALL instances. Newer
 * items shifting pages between refreshes is acceptable at this cadence.
 */
const getCachedPage = unstable_cache(fetchPage, ["primeeco-estimate-items-page-v1"], {
  revalidate: REVALIDATE_S,
  tags: ["primeeco-estimate-hours"],
})

/**
 * Fetch newest-first pages in small parallel batches until the window is
 * covered, the cap is hit, or the per-request time budget runs out (cached
 * pages are ~free, so budget effectively applies to uncached fetches only).
 * Items older than the window are discarded.
 *
 * Exported so the scheduling board's approvals derive from the SAME cached
 * pages (each line carries estimateId/jobId/createdAt/createdBy and its
 * money totals) — /estimates-snapshot itself proved too slow (13–90s/page)
 * to call from a serverless function at all.
 */
export async function fetchRecentItems(): Promise<{ items: Array<Record<string, unknown>>; complete: boolean }> {
  const started = Date.now()
  const cutoff = started - WINDOW_DAYS * 86_400_000
  const out: Array<Record<string, unknown>> = []
  let complete = false

  for (let start = 1; start <= MAX_PAGES; start += BATCH) {
    const pageNums = Array.from({ length: Math.min(BATCH, MAX_PAGES - start + 1) }, (_, i) => start + i)
    const pages = await Promise.all(pageNums.map((p) => getCachedPage(p)))

    let reachedWindowEnd = false
    for (const p of pages) {
      const rows = p.data ?? []
      for (const row of rows) {
        const a = row.attributes ?? {}
        if (parseCreatedAt(a.createdAt) < cutoff) {
          reachedWindowEnd = true
          continue
        }
        out.push(a)
      }
      if (rows.length < PER_PAGE) reachedWindowEnd = true
    }
    if (reachedWindowEnd || start + BATCH > MAX_PAGES) {
      complete = true
      break
    }
    // Out of budget — return what we have; the next poll continues from cache.
    if (Date.now() - started > TIME_BUDGET_MS) break
  }
  return { items: out, complete }
}

function aggregate(items: Array<Record<string, unknown>>): Record<string, JobEstimateHours> {
  const byJob: Record<string, JobEstimateHours> = {}
  for (const a of items) {
    const jobId = str(a.jobId)
    if (!jobId) continue
    const qty = num(a.labourQuantity)
    if (qty <= 0) continue
    // Rental periods (dehu days etc.), not people time — excluded entirely.
    if (isEquipmentHireTrade(str(a.trade))) continue
    const unit = str(a.labourUnit)
    const hr = isHourUnit(unit)
    if (!hr && !isDayUnit(unit)) continue

    const job = (byJob[jobId] ??= { jobId, byRole: {}, totalHours: 0, totalDays: 0 })
    const role = roleOf(str(a.description))
    const bucket = (job.byRole[role] ??= { hours: 0, days: 0 })
    if (hr) {
      bucket.hours += qty
      job.totalHours += qty
    } else {
      bucket.days += qty
      job.totalDays += qty
    }
  }
  return byJob
}

/**
 * NOTE: deliberately NOT wrapped in an outer unstable_cache — that would freeze
 * a partial (over-budget) result for the full TTL. The per-page cache above
 * already makes repeat calls cheap; this function just re-aggregates.
 */
let lastGood: EstimateHoursData | null = null

export async function getEstimateHours(): Promise<EstimateHoursData> {
  try {
    const { items, complete } = await fetchRecentItems()
    const data: EstimateHoursData = {
      live: true,
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      complete,
      byJob: aggregate(items),
    }
    // Prefer a previously complete result over a fresh partial one.
    if (!complete && lastGood?.complete) return lastGood
    lastGood = data
    return data
  } catch (err) {
    if (lastGood) return lastGood
    return {
      live: false,
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      complete: false,
      byJob: {},
      error: err instanceof Error ? err.message : "Failed to load estimate hours",
    }
  }
}
