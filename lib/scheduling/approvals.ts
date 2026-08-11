import "server-only"
import { fetchRecentItems } from "@/lib/primeeco/estimate-hours"
import { isPrimeecoConfigured } from "@/lib/primeeco/config"
import { getDashboardData } from "@/lib/primeeco"
import type { ApprovalSource } from "./types"

/**
 * Recent approvals for the scheduling board, DERIVED from the estimate line
 * items (/estimate-items-snapshot) that the labour-hours feature already
 * fetches and caches per page.
 *
 * Why not /estimates-snapshot? Measured live: 13–90s per page regardless of
 * page size — it can never run inside a serverless function. The ITEMS
 * endpoint is fast, newest-first, and each line carries estimateId, jobId,
 * createdAt (= authorisation time; snapshots are created when an estimate is
 * locked), createdBy (estimator name), an `authorised` 0/1 flag, and its money
 * totals. Summing material/labour totals + markups reproduces the official
 * authorisedTotalExcludingTax exactly (validated to the cent on live data).
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

interface EstimateAccumulator {
  jobId: string
  createdAt: string | null
  createdBy: string
  version: number
  value: number
  authorisedLines: number
}

export interface RecentApprovals {
  live: boolean
  rows: ApprovalSource[]
  /** Mirrors the underlying items fetch — false while coverage is building. */
  complete: boolean
  error?: string
}

let lastGood: RecentApprovals | null = null

export async function getRecentApprovals(): Promise<RecentApprovals> {
  if (!isPrimeecoConfigured()) return { live: false, rows: [], complete: true }

  try {
    // Jobs are only enrichment (number/client/division) — reuse the dashboard's
    // cached fetch and tolerate its failure without losing the approvals list.
    const [{ items, complete }, dashRes] = await Promise.all([
      fetchRecentItems(),
      getDashboardData().catch(() => null),
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
          jobId: str(a.jobId) ?? "",
          createdAt: iso(a.createdAt),
          createdBy: str(a.createdBy) ?? "Unknown",
          version,
          value: 0,
          authorisedLines: 0,
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
      }
    }

    const rows: ApprovalSource[] = [...byEstimate.values()]
      .filter((e) => e.authorisedLines > 0)
      .map((e) => {
        const job = jobById.get(e.jobId)
        return {
          jobId: e.jobId,
          jobNumber: job?.jobNumber ?? "—",
          client: job?.client ?? "Unknown",
          division: job?.division ?? "—",
          estimator: e.createdBy,
          valueExGst: e.value,
          status: "Authorised",
          createdAt: e.createdAt,
        }
      })

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
