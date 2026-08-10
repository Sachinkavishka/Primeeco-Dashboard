import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"

/**
 * Estimates dashboard data. Uses /estimates-snapshot (the LOCKED estimates),
 * which carries authorisedTotalExcludingTax (ex-GST) directly and a real
 * estimateStatus ("Authorised" / "Variation Authorised" / a pending state).
 * Each row is joined to its job (client-side) for the job number, client and
 * division.
 *
 * Snapshots are pathologically slow (~30s / 500-row page, ~12s / 200-row page),
 * and the full set is ~2,000+ rows — more than fits in a single 60s Vercel Pro
 * invocation. So we fetch ONE page per request (per_page=200, ~12s, big margin
 * under 60s) and the client streams the pages in and accumulates them.
 *
 * IMPORTANT — version history: the snapshot holds MULTIPLE rows per estimate
 * (one per saved version). Summing raw rows over-counts. We therefore carry an
 * `estimateKey` + `version` on each row and the client keeps only the latest
 * version per estimate before aggregating (see estimates-view.tsx).
 *
 * Cached separately (30 min) and only fetched when the /estimates page loads,
 * so it doesn't add to the ops dashboard's per-refresh API cost.
 */

/** Coarse state buckets derived from estimateStatus, for the quick filter. */
export type EstimateState = "authorised" | "pending" | "rejected"

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
  // NOTE: the fields below are OPTIONAL only because the scheduling module
  // reuses EstimateRow to build mock rows and predates them. getEstimatesData /
  // normalize() ALWAYS populate them, so the estimates page can rely on them.
  /** Coarse bucket: authorised / pending / rejected (derived from status). */
  state?: EstimateState
  /** Identifies the underlying estimate so versions can be de-duplicated. */
  estimateKey?: string
  /** Higher = newer version; used to keep the latest snapshot per estimate. */
  version?: number
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

// On Vercel Pro (60s), a 200-row snapshot page is ~12s — a big margin — while
// keeping the number of round-trips (and rate-limit pressure) low. The whole
// snapshot is ~2,000+ rows, so the client still streams pages progressively.
const PER_PAGE = 200
// Safety ceiling on pages so a runaway total_pages can't loop forever. At
// per_page=200 the real snapshot is ~11 pages; 45 is generous headroom.
const MAX_PAGES = 45

/** Classify a raw estimateStatus into a coarse state bucket. */
function classify(status: string): EstimateState {
  const s = status.toLowerCase()
  if (/(reject|cancel|declin|void)/.test(s)) return "rejected"
  if (s.includes("authoris") || s.includes("authoriz") || s.includes("approv")) return "authorised"
  return "pending"
}

/** Fetch one raw page of /estimates-snapshot (cached per page id). */
const getCachedPage = unstable_cache(
  async (page: number) =>
    apiFetch<Envelope>("/estimates-snapshot", { searchParams: { page, per_page: PER_PAGE } }),
  ["primeeco-estimates-snapshot-v1"],
  { revalidate: 1800, tags: ["primeeco-estimates"] },
)

function normalize(e: NonNullable<Envelope["data"]>[number]): EstimateRow {
  const a = e.attributes ?? {}
  const status = str(a.estimateStatus) ?? "Unknown"
  // /estimates-snapshot carries the real ex-GST authorised total. Fall back to
  // deriving from the tax-inclusive total only if the direct field is absent.
  const exGst = a.authorisedTotalExcludingTax != null ? num(a.authorisedTotalExcludingTax) : num(a.totalIncludingTax) / 1.1
  const id = e.id ?? crypto.randomUUID()
  const jobId = str(a.jobId) ?? ""
  return {
    id,
    jobId,
    jobNumber: "—", // filled in client-side from the (warm) job cache
    label: str(a.label) ?? "",
    estimator: str(a.createdBy) ?? "Unknown", // snapshot createdBy = estimator NAME
    status,
    state: classify(status),
    type: str(a.estimateType) ?? "—",
    valueExGst: exGst,
    client: "Unknown",
    division: "—",
    region: null,
    createdAt: iso(a.createdAt),
    // De-dup key: prefer an explicit estimate id; otherwise fall back to a
    // composite that's stable across versions of the same estimate.
    estimateKey:
      str(a.estimateId) ?? str(a.estimate_id) ?? str(a.estimateNumber) ?? `${jobId}|${str(a.label) ?? ""}|${str(a.estimateType) ?? ""}`,
    // Newer version wins. Use an explicit version if present, else the
    // created-at timestamp as a monotonic proxy.
    version: num(a.version ?? a.estimateVersion ?? a.revision) || new Date(iso(a.createdAt) ?? 0).getTime(),
  }
}

const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()

/**
 * One page of snapshot estimates. ONLY fetches the estimate page — no job join
 * here, because the job cache is slow to warm and would blow the serverless
 * limit. The client enriches job/client/division afterward, de-duplicates
 * versions, and filters by state.
 */
export async function getEstimatesData(page = 1): Promise<EstimatesData> {
  let env: Envelope = { data: [] }
  let error: string | undefined
  try {
    env = await getCachedPage(page)
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load estimates"
  }
  const totalPages = Math.min(MAX_PAGES, env.meta?.pagination?.total_pages ?? 1)
  const live = !error

  // Bring ALL snapshot rows (both pending and authorised) so the client can
  // filter between them. Version de-duplication happens client-side once all
  // pages have accumulated.
  const estimates = (env.data ?? []).map((e) => normalize(e))

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
