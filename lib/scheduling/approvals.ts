import "server-only"
import { getDashboardData } from "@/lib/primeeco"
import { fetchRecentEstimateChanges } from "@/lib/primeeco/estimate-changes"
import type { EstimateChange } from "@/lib/primeeco/estimate-changes"
import { getEstimateSnapshot } from "@/lib/primeeco/estimate-snapshot"
import type { EstimateSnapshot } from "@/lib/primeeco/estimate-snapshot"
import { isEquipmentHireTrade } from "@/lib/primeeco/estimate-labour"
import { isPrimeecoConfigured } from "@/lib/primeeco/config"
import { getArInvoiceIndex } from "@/lib/primeeco/receivables"
import type { ArInvoiceFact } from "@/lib/primeeco/receivables"
import type { ApprovalSource, InvoicedInfo } from "./types"

/**
 * Builds the list of recently approved estimates for the scheduling board.
 *
 * This module ORCHESTRATES; it deliberately owns no API knowledge of its own.
 * The flow is two-phase, and the split matters:
 *
 *   1. DISCOVER  estimate-changes.ts pages the line-item feed to find which
 *                estimates changed recently. Identifiers and timestamps only.
 *   2. LOAD      estimate-snapshot.ts fetches each of those estimates in full.
 *                Every value, line and labour figure comes from here.
 *
 * Phase 2 is not an optimisation — it is the correctness boundary. Totalling
 * an estimate from the phase-1 feed under-reports it, because the feed holds
 * only whatever subset of its lines fell inside the page window.
 *
 * Enrichment (job details, invoices) reuses caches owned by other pages, so
 * this adds no extra API calls, and each enrichment failure degrades only its
 * own column rather than emptying the board.
 */

/* ------------------------------------------------------------------ *
 * Tuning                                                              *
 * ------------------------------------------------------------------ */

/** Snapshots fetched concurrently; PrimeEco allows 5 requests in flight. */
const SNAPSHOT_BATCH = 5
/**
 * Time one request may spend loading UNCACHED snapshots.
 *
 * Sized against the platform's function timeout rather than the API: discovery
 * may already have spent several seconds, and being killed mid-request returns
 * nothing at all, which is worse than returning a partial list. Cached
 * snapshots are effectively free, so this ceiling only binds while warming up.
 */
const SNAPSHOT_BUDGET_MS = 4_000

/* ------------------------------------------------------------------ *
 * Result                                                              *
 * ------------------------------------------------------------------ */

export interface RecentApprovals {
  live: boolean
  rows: ApprovalSource[]
  /**
   * False while discovery or snapshot loading is still catching up; the client
   * polls faster until it flips true.
   */
  complete: boolean
  error?: string
}

/* ------------------------------------------------------------------ *
 * Invoice matching                                                    *
 * ------------------------------------------------------------------ */

/**
 * Find the invoices that bill this approval's works.
 *
 * PrimeEco invoices reference the JOB, never the estimate, so the match is
 * job-level: any non-draft invoice dated on or after the approval is taken as
 * billing for it. A full invoice outranks a progress payment as evidence the
 * works are finished.
 *
 * LIMITATION: on a job carrying several concurrent estimates, an invoice for
 * one of them will also mark its siblings. There is no field available to
 * disambiguate.
 */
function matchInvoices(
  invoices: ArInvoiceFact[] | undefined,
  approvedAt: string | null,
): { primary: InvoicedInfo | null; all: InvoicedInfo[] } {
  if (!invoices?.length || !approvedAt) return { primary: null, all: [] }

  const approvedDay = approvedAt.slice(0, 10)
  const toInfo = (invoice: ArInvoiceFact): InvoicedInfo => ({
    invoiceNumber: invoice.invoiceNumber,
    invoicedDate: invoice.invoicedDate,
    status: invoice.status,
    paid: invoice.paid,
    progress: invoice.progressPct < 1,
  })

  const onOrAfter = invoices
    .filter((invoice) => invoice.invoicedDate !== null && invoice.invoicedDate >= approvedDay)
    .sort((a, b) => (b.invoicedDate ?? "").localeCompare(a.invoicedDate ?? ""))

  if (onOrAfter.length === 0) return { primary: null, all: [] }

  const final = onOrAfter.find((invoice) => invoice.progressPct >= 1)
  return { primary: toInfo(final ?? onOrAfter[0]), all: onOrAfter.map(toInfo) }
}

/* ------------------------------------------------------------------ *
 * Snapshot loading                                                    *
 * ------------------------------------------------------------------ */

/**
 * Load the full estimate behind each change, in small concurrent batches and
 * within a time budget. Cached snapshots cost nothing, so the budget applies
 * in practice only to estimates not seen before.
 */
async function loadSnapshots(
  changes: readonly EstimateChange[],
): Promise<{ snapshots: Map<string, EstimateSnapshot>; complete: boolean }> {
  const startedAt = Date.now()
  const snapshots = new Map<string, EstimateSnapshot>()
  let complete = true

  for (let index = 0; index < changes.length; index += SNAPSHOT_BATCH) {
    if (Date.now() - startedAt > SNAPSHOT_BUDGET_MS) {
      complete = false
      break
    }

    const batch = changes.slice(index, index + SNAPSHOT_BATCH)
    const results = await Promise.allSettled(
      batch.map((change) => getEstimateSnapshot(change.estimateId, change.version)),
    )

    results.forEach((result, offset) => {
      if (result.status === "fulfilled") snapshots.set(batch[offset].estimateId, result.value)
      else complete = false
    })
  }

  return { snapshots, complete }
}

/* ------------------------------------------------------------------ *
 * Assembly                                                            *
 * ------------------------------------------------------------------ */

/** Combine a change, its estimate, and job/invoice enrichment into one row. */
function toApprovalSource(
  change: EstimateChange,
  snapshot: EstimateSnapshot,
  job: { jobNumber: string; client: string | null; division: string | null; statusType: string | null; jobType: string | null; address: string | null; description: string | null; primeUrl: string | null } | undefined,
  invoices: { primary: InvoicedInfo | null; all: InvoicedInfo[] },
): ApprovalSource {
  const lines = snapshot.lines

  return {
    jobId: snapshot.jobId || change.jobId,
    jobNumber: job?.jobNumber ?? "—",
    client: job?.client ?? "Unknown",
    division: job?.division ?? "—",
    estimator: snapshot.createdBy,
    valueExGst: snapshot.valueExGst,
    status: snapshot.status,
    createdAt: change.changedAt,
    statusType: job?.statusType ?? null,
    jobType: job?.jobType ?? null,
    address: job?.address ?? null,
    jobDescription: job?.description ?? null,
    primeUrl: job?.primeUrl ?? null,
    // An estimate made up entirely of equipment rental is not works to crew.
    equipmentHireOnly: lines.length > 0 && lines.every((line) => isEquipmentHireTrade(line.trade)),
    estimateId: snapshot.estimateId,
    estimateLabel: snapshot.label,
    estimateDescription: snapshot.description,
    // PrimeEco issues no estimate number, so a short slice of the id is the
    // only stable reference a coordinator can quote.
    estimateRef: snapshot.estimateId.slice(0, 8).toUpperCase(),
    estimateType: snapshot.type,
    invoiced: invoices.primary,
    invoices: invoices.all,
    estHours: snapshot.labour,
    lines,
  }
}

/** Last successful result, served if a later refresh fails outright. */
let lastGood: RecentApprovals | null = null

export async function getRecentApprovals(): Promise<RecentApprovals> {
  if (!isPrimeecoConfigured()) return { live: false, rows: [], complete: true }

  try {
    // Phase 1 (discovery) plus enrichment, all concurrent. Jobs and invoices
    // are optional: losing either degrades a column, not the board.
    const [changeSet, dashboard, invoiceIndex] = await Promise.all([
      fetchRecentEstimateChanges(),
      getDashboardData().catch(() => null),
      getArInvoiceIndex().catch(() => null),
    ])

    // Phase 2: the authoritative content of each estimate.
    const { snapshots, complete: snapshotsComplete } = await loadSnapshots(changeSet.changes)

    const jobsById = new Map((dashboard?.jobs ?? []).map((job) => [job.id, job]))

    const rows = changeSet.changes.reduce<ApprovalSource[]>((accumulated, change) => {
      const snapshot = snapshots.get(change.estimateId)
      // Not yet loaded (budget) or permanently gone: leave it out entirely
      // rather than showing a row with unknown status and no value.
      if (!snapshot) return accumulated

      const jobId = snapshot.jobId || change.jobId
      accumulated.push(
        toApprovalSource(change, snapshot, jobsById.get(jobId), matchInvoices(invoiceIndex?.get(jobId), change.changedAt)),
      )
      return accumulated
    }, [])

    const complete = changeSet.complete && snapshotsComplete
    const result: RecentApprovals = { live: true, rows, complete }

    // A finished earlier result beats a partial fresh one.
    if (!complete && lastGood?.complete) return lastGood
    lastGood = result
    return result
  } catch (error) {
    if (lastGood) return lastGood
    return {
      live: false,
      rows: [],
      complete: false,
      error: error instanceof Error ? error.message : "Failed to load recent approvals",
    }
  }
}
