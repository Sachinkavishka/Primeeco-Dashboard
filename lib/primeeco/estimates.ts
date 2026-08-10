import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"

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
  /** Which page this payload is, and how many there are (progressive loading). */
  page: number
  totalPages: number
  // Distinct values for the filter dropdowns (from this page's rows).
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

// The PrimeEco estimate endpoints are slow (and slower under concurrency), so we
// load ONE small page per request and the client streams the pages in. Each
// request stays well under the 10s serverless limit. Only AUTHORISED estimates
// (estimateType "Authorised Works", not Rejected) are kept.
const PER_PAGE = 50 // ~2s/page — big margin under the 10s serverless limit
const AUTHORISED_TYPES = new Set(["Authorised Works"])

/** Fetch one raw page of /estimates (cached per page id). */
const getCachedPage = unstable_cache(
  async (page: number) => apiFetch<Envelope>("/estimates", { searchParams: { page, per_page: PER_PAGE } }),
  ["primeeco-estimates-page-v1"],
  { revalidate: 1800, tags: ["primeeco-estimates"] },
)

function normalize(e: NonNullable<Envelope["data"]>[number]): EstimateRow {
  const a = e.attributes ?? {}
  return {
    id: e.id ?? crypto.randomUUID(),
    jobId: str(a.jobId) ?? "",
    jobNumber: "—", // filled in client-side from the (warm) job cache
    label: str(a.label) ?? "",
    estimator: str(a.createdBy) ?? "Unknown",
    status: str(a.estimateStatus) ?? "Unknown",
    type: str(a.estimateType) ?? "—",
    valueExGst: num(a.totalIncludingTax) / 1.1, // /estimates is tax-inclusive; ex-GST = ÷1.1
    client: "Unknown",
    division: "—",
    region: null,
    createdAt: iso(a.createdAt),
  }
}

const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()

/**
 * One page of authorised estimates. ONLY fetches the estimate page — no job
 * join here, because the job cache is slow to warm and would blow the 10s
 * serverless limit. The client enriches job/client/division afterward.
 */
export async function getEstimatesData(page = 1): Promise<EstimatesData> {
  let env: Envelope = { data: [] }
  let error: string | undefined
  try {
    env = await getCachedPage(page)
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load estimates"
  }
  const totalPages = Math.min(10, env.meta?.pagination?.total_pages ?? 1)
  const live = !error

  const estimates = (env.data ?? [])
    .map((e) => normalize(e))
    .filter((e) => AUTHORISED_TYPES.has(e.type) && e.status !== "Rejected")

  return {
    live,
    generatedAt: new Date().toISOString(),
    error: error ?? (estimates.length === 0 && page === 1 && !live ? "Not live — add credentials or check API" : undefined),
    page,
    totalPages,
    estimates,
    estimators: uniq(estimates.map((e) => e.estimator)),
    statuses: uniq(estimates.map((e) => e.status)),
    types: uniq(estimates.map((e) => e.type)),
    divisions: uniq(estimates.map((e) => e.division)),
    clients: uniq(estimates.map((e) => e.client)),
  }
}
