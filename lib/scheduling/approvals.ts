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
  estimateType: string | null
  /** Official authorised total ex-GST, preferred over the line sum. */
  valueExGst: number | null
}

interface SingleEnvelope {
  data?: { attributes?: Record<string, unknown> }
}

async function fetchEstimateMeta(estimateId: string): Promise<EstimateMeta> {
  const env = await apiFetch<SingleEnvelope>(`/estimates-snapshot/${estimateId}`)
  const a = env.data?.attributes ?? {}
  const value = a.authorisedTotalExcludingTax
  return {
    label: str(a.label) ?? null,
    estimateType: str(a.estimateType) ?? null,
    valueExGst: value === undefined || value === null ? null : num(value),
  }
}

/** Per-estimate meta through the Data Cache (estimateId is in the cache key). */
const getCachedMeta = unstable_cache(fetchEstimateMeta, ["primeeco-estimate-meta-v1"], {
  revalidate: 4 * 60 * 60,
  tags: ["primeeco-estimate-meta"],
})

const META_BATCH = 4
const META_BUDGET_MS = 2_500

/**
 * Fetch metas for the given estimate ids within a small time budget. Cached
 * ids are ~free; uncached ones fill over successive polls. Returns whatever is
 * known plus whether everything was covered.
 */
async function fetchMetas(ids: string[]): Promise<{ metas: Map<string, EstimateMeta>; complete: boolean }> {
  const started = Date.now()
  const metas = new Map<string, EstimateMeta>()
  let complete = true
  for (let i = 0; i < ids.length; i += META_BATCH) {
    if (Date.now() - started > META_BUDGET_MS) {
      complete = false
      break
    }
    const batch = ids.slice(i, i + META_BATCH)
    const settled = await Promise.allSettled(batch.map((id) => getCachedMeta(id)))
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") metas.set(batch[idx], res.value)
      else complete = false
    })
  }
  return { metas, complete }
}

/* ---------------- approvals from line items ---------------- */

interface EstimateAccumulator {
  estimateId: string
  jobId: string
  createdAt: string | null
  createdBy: string
  version: number
  value: number
  authorisedLines: number
  lines: EstimateLine[]
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
    role: isTime && !isEquipmentHireTrade(str(a.trade) ?? "") ? roleOf(description) : null,
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
): InvoicedInfo | null {
  if (!invoices?.length || !approvedAt) return null
  const approvedDay = approvedAt.slice(0, 10)
  const after = invoices.filter((inv) => inv.invoicedDate !== null && inv.invoicedDate >= approvedDay)
  if (after.length === 0) return null
  const final = after.find((inv) => inv.progressPct >= 1)
  const pick = final ?? after[0]
  return {
    invoiceNumber: pick.invoiceNumber,
    invoicedDate: pick.invoicedDate,
    status: pick.status,
    paid: pick.paid,
    progress: pick.progressPct < 1,
  }
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
          createdAt: iso(a.createdAt),
          createdBy: str(a.createdBy) ?? "Unknown",
          version,
          value: 0,
          authorisedLines: 0,
          lines: [],
        }
        byEstimate.set(estimateId, acc)
      } else if (version < acc.version) {
        continue
      }
      const authorised = a.authorised === 1 || a.authorised === "1" || a.authorised === true
      if (authorised) {
        acc.authorisedLines += 1
        acc.value +=
          num(a.materialTotal) + num(a.materialMarkupTotal) + num(a.labourTotal) + num(a.labourMarkupTotal)
        acc.lines.push(toLine(a))
      }
    }

    const authorisedEstimates = [...byEstimate.values()].filter((e) => e.authorisedLines > 0)

    // Estimate label + type ("Authorised Works" vs "Direct Allocation").
    const { metas, complete: metaComplete } = await fetchMetas(authorisedEstimates.map((e) => e.estimateId))

    const rows: ApprovalSource[] = authorisedEstimates.map((e) => {
      const job = jobById.get(e.jobId)
      const meta = metas.get(e.estimateId)
      return {
        jobId: e.jobId,
        jobNumber: job?.jobNumber ?? "—",
        client: job?.client ?? "Unknown",
        division: job?.division ?? "—",
        estimator: e.createdBy,
        valueExGst: meta?.valueExGst ?? e.value,
        status: "Authorised",
        createdAt: e.createdAt,
        statusType: job?.statusType ?? null,
        jobType: job?.jobType ?? null,
        address: job?.address ?? null,
        jobDescription: job?.description ?? null,
        primeUrl: job?.primeUrl ?? null,
        equipmentHireOnly: e.lines.length > 0 && e.lines.every((l) => isEquipmentHireTrade(l.trade)),
        estimateId: e.estimateId,
        estimateLabel: meta?.label ?? null,
        estimateType: meta?.estimateType ?? null,
        invoiced: findInvoice(invoiceIndex?.get(e.jobId), e.createdAt),
        lines: e.lines,
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
