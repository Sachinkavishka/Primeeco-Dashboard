import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"
import { aggregateLabour, labourRoleFor } from "./estimate-labour"
import type { EstimateLine, JobEstimateHours } from "./estimate-labour"

/**
 * Repository for a single PrimeEco estimate snapshot — the AUTHORITATIVE
 * source for what an estimate contains.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/estimate-items-snapshot` (see estimate-changes.ts) is a flat, paged feed of
 * line items. It is excellent for discovering which estimates changed recently
 * and useless for totalling one, because:
 *
 *   • an estimate's lines do NOT share a single version number — each line
 *     carries its own, so filtering to "the highest version" drops real lines;
 *   • a page window holds an arbitrary subset of any one estimate's lines.
 *
 * Reconstructing a total from that feed produced silently wrong figures — job
 * DFM-0861 summed to $333.50 from the 8 lines that happened to be in the
 * window, against $8,128.00 across its true 55 lines.
 *
 * `GET /estimates-snapshot/{id}` returns the whole aggregate — every category
 * and every line — so all values, lines and labour hours are derived from here
 * and never from the feed.
 */

/* ------------------------------------------------------------------ *
 * Raw API shapes (permissive: we consume a small, documented subset)  *
 * ------------------------------------------------------------------ */

interface RawEstimateItem {
  authorised?: number | string | boolean
  trade?: string
  description?: string
  notes?: string | null
  materialUnit?: string | null
  materialQuantity?: number | string
  materialTotal?: number | string
  materialMarkupTotal?: number | string
  labourUnit?: string | null
  labourQuantity?: number | string
  labourTotal?: number | string
  labourMarkupTotal?: number | string
  [key: string]: unknown
}

interface RawEstimateCategory {
  label?: string
  estimateItems?: RawEstimateItem[]
  [key: string]: unknown
}

interface RawEstimateSnapshot {
  jobId?: string
  label?: string
  description?: string | null
  estimateStatus?: string
  estimateType?: string
  authorisedTotalExcludingTax?: number | string
  totalIncludingTax?: number | string
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  estimateCategories?: RawEstimateCategory[]
  [key: string]: unknown
}

interface SingleEnvelope {
  data?: { attributes?: RawEstimateSnapshot }
}

/* ------------------------------------------------------------------ *
 * Domain shape                                                        *
 * ------------------------------------------------------------------ */

/** A complete estimate as the dashboard uses it. */
export interface EstimateSnapshot {
  estimateId: string
  jobId: string
  /** Display name in PrimeEco; there is no separate estimate-number field. */
  label: string | null
  description: string | null
  /** "Authorised" | "Pending" | "Rejected" | "Missing" (deleted upstream). */
  status: string
  /** "Authorised Works" | "Direct Allocation". */
  type: string | null
  /** Authoritative value ex-GST — see resolveValueExGst for the precedence. */
  valueExGst: number
  createdBy: string
  /** Every line of the estimate, across all categories. */
  lines: EstimateLine[]
  /** Labour time across those lines, or null when the estimate has none. */
  labour: JobEstimateHours | null
}

/** Status used when PrimeEco no longer has the estimate (404). */
export const MISSING_STATUS = "Missing"

/* ------------------------------------------------------------------ *
 * Parsing                                                             *
 * ------------------------------------------------------------------ */

const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

const isFlaggedAuthorised = (value: unknown): boolean => value === 1 || value === "1" || value === true

/** A line's ex-GST value: materials and labour, each including their markup. */
function lineValueExGst(item: RawEstimateItem): number {
  return (
    toNumber(item.materialTotal) +
    toNumber(item.materialMarkupTotal) +
    toNumber(item.labourTotal) +
    toNumber(item.labourMarkupTotal)
  )
}

function toLine(item: RawEstimateItem): EstimateLine {
  const trade = toText(item.trade) ?? "—"
  const description = toText(item.description) ?? ""
  const labourQuantity = toNumber(item.labourQuantity)
  const labourUnit = toText(item.labourUnit)

  return {
    trade,
    description,
    notes: toText(item.notes),
    labourQuantity,
    labourUnit,
    materialQuantity: toNumber(item.materialQuantity),
    materialUnit: toText(item.materialUnit),
    role: labourRoleFor(trade, description, labourQuantity, labourUnit),
    authorised: isFlaggedAuthorised(item.authorised),
    valueExGst: lineValueExGst(item),
  }
}

/**
 * Resolve the estimate's ex-GST value, in order of trustworthiness:
 *
 *   1. `authorisedTotalExcludingTax` — PrimeEco's own figure, when non-zero.
 *   2. The sum of lines FLAGGED authorised, when any are.
 *   3. The sum of ALL lines.
 *
 * Steps 2 and 3 matter because an estimate can be status-Authorised while its
 * authorised total is 0 and no line carries the flag (observed on DFM-0015
 * "Estimate 1"). Falling through to the line sums means an approved estimate
 * is never reported as $0.
 */
function resolveValueExGst(raw: RawEstimateSnapshot, lines: EstimateLine[]): number {
  const official = toNumber(raw.authorisedTotalExcludingTax)
  if (official > 0) return official

  const flagged = lines.filter((line) => line.authorised)
  const source = flagged.length > 0 ? flagged : lines
  return source.reduce((total, line) => total + line.valueExGst, 0)
}

function toSnapshot(estimateId: string, raw: RawEstimateSnapshot): EstimateSnapshot {
  const jobId = toText(raw.jobId) ?? ""
  const lines = (raw.estimateCategories ?? []).flatMap((category) => (category.estimateItems ?? []).map(toLine))

  return {
    estimateId,
    jobId,
    label: toText(raw.label),
    description: toText(raw.description),
    status: toText(raw.estimateStatus) ?? "Unknown",
    type: toText(raw.estimateType),
    valueExGst: resolveValueExGst(raw, lines),
    createdBy: toText(raw.createdBy) ?? "Unknown",
    lines,
    labour: aggregateLabour(jobId, lines),
  }
}

/** Snapshot returned for an estimate PrimeEco no longer serves. */
function missingSnapshot(estimateId: string): EstimateSnapshot {
  return {
    estimateId,
    jobId: "",
    label: null,
    description: null,
    status: MISSING_STATUS,
    type: null,
    valueExGst: 0,
    createdBy: "Unknown",
    lines: [],
    labour: null,
  }
}

/* ------------------------------------------------------------------ *
 * Fetching                                                            *
 * ------------------------------------------------------------------ */

async function fetchEstimateSnapshot(estimateId: string): Promise<EstimateSnapshot> {
  try {
    const envelope = await apiFetch<SingleEnvelope>(`/estimates-snapshot/${estimateId}`)
    return toSnapshot(estimateId, envelope.data?.attributes ?? {})
  } catch (error) {
    // A 404 is a PERMANENT answer (the estimate was deleted or cancelled
    // upstream), so it is returned as a cacheable value rather than thrown —
    // otherwise it would be retried on every request and would hold the
    // "coverage complete" flag down forever. Transient failures still throw so
    // they are retried and never cached.
    const message = error instanceof Error ? error.message : ""
    if (/\(404\)/.test(message)) return missingSnapshot(estimateId)
    throw error
  }
}

/** How long a snapshot stays cached when its version hasn't changed. */
const SNAPSHOT_TTL_S = 60 * 60

/**
 * Cached read of one estimate.
 *
 * `version` is part of the cache key (unstable_cache keys include the
 * arguments) even though it is unused in the body: re-authorising an estimate
 * re-snapshots it with a new version, which misses the cache and refetches
 * immediately, while untouched estimates keep serving from cache.
 */
export const getEstimateSnapshot = unstable_cache(
  (estimateId: string, _version: number) => fetchEstimateSnapshot(estimateId),
  ["primeeco-estimate-snapshot-v1"],
  { revalidate: SNAPSHOT_TTL_S, tags: ["primeeco-estimate-snapshot"] },
)

export type { EstimateLine, JobEstimateHours } from "./estimate-labour"
