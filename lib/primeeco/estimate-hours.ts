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
 * Cached ~4h — authorised-estimate hours don't change intraday.
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

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => (typeof v === "string" ? v : "")

function roleOf(description: string): HoursRole {
  const d = description.toLowerCase()
  if (/technician/.test(d)) return "Technician"
  if (/project\s*manager/.test(d)) return "Project Manager"
  if (/supervisor/.test(d)) return "Supervisor"
  if (/labou?rer/.test(d)) return "Labourer"
  return "Other"
}

const isHourUnit = (u: string) => /^hr/i.test(u)
const isDayUnit = (u: string) => /^(day|wk|week)/i.test(u)

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
 * Fetch newest-first pages in small parallel batches until the whole window is
 * covered (or the cap is hit). Items older than the window are discarded.
 */
async function fetchRecentItems(): Promise<Array<Record<string, unknown>>> {
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000
  const out: Array<Record<string, unknown>> = []

  for (let start = 1; start <= MAX_PAGES; start += BATCH) {
    const pageNums = Array.from({ length: Math.min(BATCH, MAX_PAGES - start + 1) }, (_, i) => start + i)
    const pages = await Promise.all(pageNums.map(fetchPage))

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
    if (reachedWindowEnd) break
  }
  return out
}

function aggregate(items: Array<Record<string, unknown>>): Record<string, JobEstimateHours> {
  const byJob: Record<string, JobEstimateHours> = {}
  for (const a of items) {
    const jobId = str(a.jobId)
    if (!jobId) continue
    const qty = num(a.labourQuantity)
    if (qty <= 0) continue
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

async function fetchLive(): Promise<EstimateHoursData> {
  const items = await fetchRecentItems()
  return {
    live: true,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    byJob: aggregate(items),
  }
}

const getCached = unstable_cache(fetchLive, ["primeeco-estimate-hours-v1"], {
  revalidate: REVALIDATE_S,
  tags: ["primeeco-estimate-hours"],
})

let lastGood: EstimateHoursData | null = null

export async function getEstimateHours(): Promise<EstimateHoursData> {
  try {
    const data = await getCached()
    lastGood = data
    return data
  } catch (err) {
    if (lastGood) return lastGood
    return {
      live: false,
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      byJob: {},
      error: err instanceof Error ? err.message : "Failed to load estimate hours",
    }
  }
}
