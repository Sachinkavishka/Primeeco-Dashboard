import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"
import { getDashboardData } from "./index"

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

async function fetchSnapshot(): Promise<Envelope["data"]> {
  const rows: NonNullable<Envelope["data"]> = []
  for (let p = 1; p <= 30; p++) {
    const r = await apiFetch<Envelope>("/estimates-snapshot", { searchParams: { page: p, per_page: 100 } })
    const items = r.data ?? []
    rows.push(...items)
    const tp = r.meta?.pagination?.total_pages
    if (items.length < 100 || (tp !== undefined && p >= tp)) break
  }
  return rows
}

const getCachedSnapshot = unstable_cache(fetchSnapshot, ["primeeco-estimates-snapshot-v1"], {
  revalidate: 1800,
  tags: ["primeeco-estimates"],
})

export async function getEstimatesData(): Promise<EstimatesData> {
  const dash = await getDashboardData()
  const jobById = new Map(dash.jobs.map((j) => [j.id, j]))

  let raw: Envelope["data"] = []
  try {
    raw = await getCachedSnapshot()
  } catch {
    raw = []
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
    live: dash.live,
    generatedAt: new Date().toISOString(),
    estimates,
    estimators: uniq(estimates.map((e) => e.estimator)),
    statuses: uniq(estimates.map((e) => e.status)),
    types: uniq(estimates.map((e) => e.type)),
    divisions: uniq(estimates.map((e) => e.division)),
    clients: uniq(estimates.map((e) => e.client)),
  }
}
