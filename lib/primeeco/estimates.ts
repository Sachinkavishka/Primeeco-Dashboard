import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"
import { getDashboardData } from "./index"
import { getLookups } from "./lookups"

/**
 * Estimates dashboard data. Uses /estimates-snapshot (the LOCKED / authorised
 * estimates), which carries authorisedTotalExcludingTax (ex-GST) directly and
 * an estimateStatus of "Authorised". Each row is joined to its job for the job
 * number, client, division and region.
 *
 * Cached separately (30 min) and only fetched when the /estimates page loads,
 * so it doesn't add to the ops dashboard's per-refresh API cost.
 */

export interface EstimateRow {
  id: string
  jobId: string
  jobNumber: string
  label: string
  estimator: string
  status: string
  type: string
  valueExGst: number
  client: string
  division: string
  region: string | null
  createdAt: string | null
}

export interface EstimatesData {
  live: boolean
  generatedAt: string
  error?: string
  estimates: EstimateRow[]
  // Distinct values for the filter dropdowns.
  estimators: string[]
  statuses: string[]
  types: string[]
  divisions: string[]
  clients: string[]
}

interface Envelope {
  data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
  meta?: { pagination?: { total_pages?: number } }
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)
const iso = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  const d = new Date(s.replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const PER_PAGE = 500

async function fetchSnapshot(): Promise<Envelope["data"]> {
  const rows: NonNullable<Envelope["data"]> = []
  let failed = false
  for (let p = 1; p <= 12; p++) {
    let r: Envelope
    try {
      r = await apiFetch<Envelope>("/estimates-snapshot", { searchParams: { page: p, per_page: PER_PAGE } })
    } catch {
      // Rate limit or transient error — keep whatever pages we already got.
      failed = true
      break
    }
    const items = r.data ?? []
    rows.push(...items)
    const tp = r.meta?.pagination?.total_pages
    if (items.length < PER_PAGE || (tp !== undefined && p >= tp)) break
  }
  // Only a TOTAL failure throws (so unstable_cache doesn't cache an empty result);
  // a partial result is returned and cached.
  if (rows.length === 0 && failed) throw new Error("estimates snapshot fetch failed (rate limit?)")
  return rows
}

const getCachedSnapshot = unstable_cache(fetchSnapshot, ["primeeco-estimates-snapshot-v1"], {
  revalidate: 1800,
  tags: ["primeeco-estimates"],
})

export async function getEstimatesData(): Promise<EstimatesData> {
  // Fetch estimates and job data concurrently; a slow/failed job fetch only
  // affects the job-number/client/division enrichment, not the estimate totals.
  const [dashRes, snapRes, lookRes] = await Promise.allSettled([getDashboardData(), getCachedSnapshot(), getLookups()])

  const dash = dashRes.status === "fulfilled" ? dashRes.value : null
  const jobById = new Map((dash?.jobs ?? []).map((j) => [j.id, j]))
  const live = dash?.live ?? false
  const allDivisions = lookRes.status === "fulfilled" ? [...lookRes.value.divisionName.values()].sort() : []

  let raw: Envelope["data"] = []
  let error: string | undefined
  if (snapRes.status === "fulfilled") {
    raw = snapRes.value
  } else {
    error = snapRes.reason instanceof Error ? snapRes.reason.message : "Failed to load estimates"
  }

  const estimates: EstimateRow[] = (raw ?? []).map((e) => {
    const a = e.attributes ?? {}
    const jobId = str(a.jobId) ?? ""
    const job = jobById.get(jobId)
    return {
      id: e.id ?? crypto.randomUUID(),
      jobId,
      jobNumber: job?.jobNumber ?? "—",
      label: str(a.label) ?? "",
      estimator: str(a.createdBy) ?? "Unknown",
      status: str(a.estimateStatus) ?? "Unknown",
      type: str(a.estimateType) ?? "—",
      valueExGst: num(a.authorisedTotalExcludingTax),
      client: job?.client ?? "Unknown",
      division: job?.division ?? "—",
      region: job?.region ?? null,
      createdAt: iso(a.createdAt),
    }
  })

  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()

  return {
    live,
    generatedAt: new Date().toISOString(),
    error: error ?? (estimates.length === 0 && !live ? "Not live — add credentials or check API" : undefined),
    estimates,
    estimators: uniq(estimates.map((e) => e.estimator)),
    statuses: uniq(estimates.map((e) => e.status)),
    types: uniq(estimates.map((e) => e.type)),
    divisions: allDivisions.length ? allDivisions : uniq(estimates.map((e) => e.division)),
    clients: uniq(estimates.map((e) => e.client)),
  }
}
