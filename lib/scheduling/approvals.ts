import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "@/lib/primeeco/client"
import {
  fetchRecentItems,
  isDayUnit,
  isEquipmentHireTrade,
  isHourUnit,
  roleOf,
} from "@/lib/primeeco/estimate-hours"
import type { JobEstimateHours } from "@/lib/primeeco/estimate-hours"
import { isPrimeecoConfigured } from "@/lib/primeeco/config"
import { getDashboardData } from "@/lib/primeeco"
import { getArInvoiceIndex } from "@/lib/primeeco/receivables"
import type { ArInvoiceFact } from "@/lib/primeeco/receivables"
import type { ApprovalSource, EstimateLine, InvoicedInfo } from "./types"

/**
 * Recent approvals for the scheduling board, DERIVED from the estimate line
 * items (/estimate-items-snapshot) that the labour-hours feature already
 * fetches and caches per page.
 *
 * Why not /estimates-snapshot (list)? Measured live: 13–90s per page
 * regardless of page size — it can never run inside a serverless function.
 * The ITEMS endpoint is fast, newest-first, and each line carries estimateId,
 * jobId, createdAt (= authorisation time), createdBy (estimator), an
 * `authorised` 0/1 flag, and its money totals. Summing material/labour totals
 * + markups reproduces the official authorisedTotalExcludingTax exactly
 * (validated to the cent on live data).
 *
 * Estimate META (label + estimateType "Authorised Works" vs "Direct
 * Allocation") lives only on the estimate record, so it is fetched per
 * estimate via /estimates-snapshot/{id} — individually cached 4h and
 * time-budgeted, so a slow API day only delays the type chips, never the
 * board.
 *
 * Versioning: a re-authorised estimate snapshots again with a higher `version`
 * on every line; older versions carry authorised=0. We keep only the highest
 * version per estimateId and require authorised lines on it.
 */

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined
const iso = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  const d = new Date(s.replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/* ---------------- estimate meta (label / type) ---------------- */

interface EstimateMeta {
  label: string | null
  description: string | null
  estimateType: string | null
  /**
   * "Authorised" | "Pending" | "Cancelled" | … — the estimate's REAL status.
   * The line-level authorised flag alone is not enough: pending/cancelled
   * estimates keep authorised lines, which put them on the board incorrectly.
   */
  estimateStatus: string | null
  /** Official authorised total ex-GST, preferred over the line sum. */
  valueExGst: number | null
}

interface SingleEnvelope {
  data?: { attributes?: Record<string, unknown> }
}

async function fetchEstimateMeta(estimateId: string): Promise<EstimateMeta> {
  let env: SingleEnvelope
  try {
    env = await apiFetch<SingleEnvelope>(`/estimates-snapshot/${estimateId}`)
  } catch (err) {
    // A missing snapshot (deleted/cancelled estimate) is a PERMANENT answer —
    // return it as a cacheable "Missing" meta so it doesn't block the
    // completeness flag or get refetched every request. Transient errors
    // rethrow (and stay uncached) so they retry on the next poll.
    const message = err instanceof Error ? err.message : ""
    if (/\(404\)/.test(message)) {
      return {
        label: null,
        description: null,
        estimateType: null,
        estimateStatus: "Missing",
        valueExGst: null,
      }
    }
    throw err
  }
  const a = env.data?.attributes ?? {}
  const value = a.authorisedTotalExcludingTax
  return {
    label: str(a.label) ?? null,
    description: str(a.description) ?? null,
    estimateType: str(a.estimateType) ?? null,
    estimateStatus: str(a.estimateStatus) ?? null,
    valueExGst: value === undefined || value === null ? null : num(value),
  }
}

/**
 * Per-estimate meta through the Data Cache. The snapshot `version` is part of
 * the cache key (unstable_cache keys include the arguments), so re-authorising
 * an estimate — which re-snapshots it with a new version — misses the cache and
 * refetches immediately, while unchanged estimates stay cheap.
 */
const getCachedMeta = unstable_cache(
  (estimateId: string, _version: number) => fetchEstimateMeta(estimateId),
  ["primeeco-estimate-meta-v3"],
  { revalidate: 60 * 60, tags: ["primeeco-estimate-meta"] },
)

const META_BATCH = 4
const META_BUDGET_MS = 2_500

/**
 * Fetch metas for the given estimate ids within a small time budget. Cached
 * ids are ~free; uncached ones fill over successive polls. Returns whatever is
 * known plus whether everything was covered.
 */
async function fetchMetas(
  ids: ReadonlyArray<readonly [string, number]>,
): Promise<{ metas: Map<string, EstimateMeta>; complete: boolean }> {
  const started = Date.now()
  const metas = new Map<string, EstimateMeta>()
  let complete = true
  for (let i = 0; i < ids.length; i += META_BATCH) {
    if (Date.now() - started > META_BUDGET_MS) {
      complete = false
      break
    }
    const batch = ids.slice(i, i + META_BATCH)
    const settled = await Promise.allSettled(batch.map(([id, version]) => getCachedMeta(id, version)))
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") metas.set(batch[idx][0], res.value)
      else complete = false
    })
  }
  return { metas, complete }
}

/* ---------------- approvals from line items ---------------- */

interface EstimateAccumulator {
  estimateId: string
  jobId: string
  /** When the estimate was last changed — our "approved at" signal. */
  approvedAt: string | null
  createdBy: string
  version: number
  /** Value summed from lines FLAGGED authorised (often none — see below). */
  authorisedValue: number
  /** Value summed from every line, used when no line carries the flag. */
  allValue: number
  authorisedLines: EstimateLine[]
  allLines: EstimateLine[]
}

export interface RecentApprovals {
  live: boolean
  rows: ApprovalSource[]
  /** False while items/meta coverage is still building — poll again soon. */
  complete: boolean
  error?: string
}

function toLine(a: Record<string, unknown>): EstimateLine {
  const description = str(a.description) ?? ""
  const labourQuantity = num(a.labourQuantity)
  const labourUnit = str(a.labourUnit) ?? null
  const isTime = labourQuantity > 0 && labourUnit !== null && (isHourUnit(labourUnit) || isDayUnit(labourUnit))
  return {
    trade: str(a.trade) ?? "—",
    description,
    notes: str(a.notes) ?? null,
    labourQuantity,
    labourUnit,
    materialQuantity: num(a.materialQuantity),
    materialUnit: str(a.materialUnit) ?? null,
    role: isTime && !isEquipmentHireTrade(str(a.trade) ?? "") ? roleOf(description, str(a.trade)) : null,
  }
}

/**
 * Was this approval's work already invoiced? Invoices don't reference the
 * estimate, so we match on the JOB: an invoice dated on/after the approval
 * date is taken as billing for these works (Direct Allocations often invoice
 * the same day). Prefers a full/final invoice over a progress payment.
 */
function findInvoice(
  invoices: ArInvoiceFact[] | undefined,
  approvedAt: string | null,
): { primary: InvoicedInfo | null; all: InvoicedInfo[] } {
  if (!invoices?.length || !approvedAt) return { primary: null, all: [] }
  const approvedDay = approvedAt.slice(0, 10)
  const toInfo = (inv: ArInvoiceFact): InvoicedInfo => ({
    invoiceNumber: inv.invoiceNumber,
    invoicedDate: inv.invoicedDate,
    status: inv.status,
    paid: inv.paid,
    progress: inv.progressPct < 1,
  })
  const after = invoices
    .filter((inv) => inv.invoicedDate !== null && inv.invoicedDate >= approvedDay)
    .sort((a, b) => (b.invoicedDate ?? "").localeCompare(a.invoicedDate ?? ""))
  if (after.length === 0) return { primary: null, all: [] }
  // A full/final invoice is stronger evidence the works are done.
  const final = after.find((inv) => inv.progressPct >= 1)
  return { primary: toInfo(final ?? after[0]), all: after.map(toInfo) }
}

/**
 * Estimated labour time for ONE estimate, from its own (already role-tagged,
 * EH-excluded) lines. Derived here — rather than from the job-wide hours
 * aggregate — so hours only ever come from estimates whose STATUS is
 * authorised; a pending or cancelled sibling estimate on the same job no
 * longer pollutes the numbers.
 */
function aggregateLines(jobId: string, lines: EstimateLine[]): JobEstimateHours | null {
  const out: JobEstimateHours = { jobId, byRole: {}, totalHours: 0, totalDays: 0 }
  for (const l of lines) {
    if (!l.role || !l.labourUnit) continue
    const bucket = (out.byRole[l.role as keyof typeof out.byRole] ??= { hours: 0, days: 0 })
    if (isHourUnit(l.labourUnit)) {
      bucket.hours += l.labourQuantity
      out.totalHours += l.labourQuantity
    } else if (isDayUnit(l.labourUnit)) {
      bucket.days += l.labourQuantity
      out.totalDays += l.labourQuantity
    }
  }
  return out.totalHours > 0 || out.totalDays > 0 ? out : null
}

let lastGood: RecentApprovals | null = null

export async function getRecentApprovals(): Promise<RecentApprovals> {
  if (!isPrimeecoConfigured()) return { live: false, rows: [], complete: true }

  try {
    // Jobs and invoices are enrichment — reuse their cached fetches and
    // tolerate failure of either without losing the approvals list.
    const [{ items, complete: itemsComplete }, dashRes, invoiceIndex] = await Promise.all([
      fetchRecentItems(),
      getDashboardData().catch(() => null),
      getArInvoiceIndex().catch(() => null),
    ])
    const jobById = new Map((dashRes?.jobs ?? []).map((j) => [j.id, j]))

    // Group lines into estimates, keeping only the highest version per
    // estimateId (older versions are superseded snapshots).
    const byEstimate = new Map<string, EstimateAccumulator>()
    for (const a of items) {
      const estimateId = str(a.estimateId)
      if (!estimateId) continue
      const version = num(a.version)
      let acc = byEstimate.get(estimateId)
      if (!acc || version > acc.version) {
        acc = {
          estimateId,
          jobId: str(a.jobId) ?? "",
          approvedAt: iso(a.updatedAt) ?? iso(a.createdAt),
          createdBy: str(a.createdBy) ?? "Unknown",
          version,
          authorisedValue: 0,
          allValue: 0,
          authorisedLines: [],
          allLines: [],
        }
        byEstimate.set(estimateId, acc)
      } else if (version < acc.version) {
        continue
      }
      const lineValue =
        num(a.materialTotal) + num(a.materialMarkupTotal) + num(a.labourTotal) + num(a.labourMarkupTotal)
      const line = toLine(a)
      acc.allValue += lineValue
      acc.allLines.push(line)
      if (a.authorised === 1 || a.authorised === "1" || a.authorised === true) {
        acc.authorisedValue += lineValue
        acc.authorisedLines.push(line)
      }
    }

    // NOTE: we deliberately do NOT require line-level authorised flags here.
    // An estimate can be status-Authorised with every line still flagged 0
    // (seen live on DFM-0015 "Estimate 1": status Authorised, 7 lines, none
    // flagged, authorised totals 0). The estimate's STATUS is the authority;
    // the flags only refine which lines/value to report.
    const candidates = [...byEstimate.values()]
    const { metas, complete: metaComplete } = await fetchMetas(
      candidates.map((e) => [e.estimateId, e.version] as const),
    )

    const rows: ApprovalSource[] = candidates.map((e) => {
      const job = jobById.get(e.jobId)
      const meta = metas.get(e.estimateId)
      const inv = findInvoice(invoiceIndex?.get(e.jobId), e.approvedAt)
      // Fall back through: official authorised total -> authorised lines ->
      // every line, so a fully-authorised estimate never shows as $0.
      const hasFlagged = e.authorisedLines.length > 0
      const lines = hasFlagged ? e.authorisedLines : e.allLines
      const value = meta?.valueExGst || (hasFlagged ? e.authorisedValue : e.allValue)
      return {
        jobId: e.jobId,
        jobNumber: job?.jobNumber ?? "—",
        client: job?.client ?? "Unknown",
        division: job?.division ?? "—",
        estimator: e.createdBy,
        valueExGst: value,
        // Real estimate status — the facade keeps only authorised ones, so
        // Pending/Rejected/Cancelled estimates stay off the board. Unknown
        // until the meta loads.
        status: meta?.estimateStatus ?? "Unknown",
        createdAt: e.approvedAt,
        statusType: job?.statusType ?? null,
        jobType: job?.jobType ?? null,
        address: job?.address ?? null,
        jobDescription: job?.description ?? null,
        primeUrl: job?.primeUrl ?? null,
        equipmentHireOnly: lines.length > 0 && lines.every((l) => isEquipmentHireTrade(l.trade)),
        estimateId: e.estimateId,
        estimateLabel: meta?.label ?? null,
        estimateDescription: meta?.description ?? null,
        // PrimeEco has no estimate-number field — a short slice of the id is
        // the only stable, quotable reference.
        estimateRef: e.estimateId.slice(0, 8).toUpperCase(),
        estimateType: meta?.estimateType ?? null,
        invoiced: inv.primary,
        invoices: inv.all,
        estHours: aggregateLines(e.jobId, lines),
        lines,
      }
    })

    const complete = itemsComplete && metaComplete
    const data: RecentApprovals = { live: true, rows, complete }
    // Prefer a previously complete result over a fresh partial one.
    if (!complete && lastGood?.complete) return lastGood
    lastGood = data
    return data
  } catch (err) {
    if (lastGood) return lastGood
    return {
      live: false,
      rows: [],
      complete: false,
      error: err instanceof Error ? err.message : "Failed to load recent approvals",
    }
  }
}
