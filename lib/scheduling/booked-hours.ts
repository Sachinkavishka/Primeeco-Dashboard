import type { Shift } from "@/lib/connecteam/types"
import type { JobEstimateHours } from "@/lib/primeeco/estimate-labour"

/**
 * Reconciles ESTIMATED labour (PrimeEco) against BOOKED labour (Connecteam).
 *
 * This is the question coordinators actually plan from: an estimate was
 * authorised for N hours of technician time — how much of that has already
 * been rostered, and how much still needs a crew?
 *
 * The two systems join on the job: a Connecteam shift's `jobId` is the PrimeEco
 * job UUID. Only shifts falling on or after the approval date are counted, so
 * work rostered for an earlier estimate on the same job isn't double-counted
 * against this one.
 *
 * This module is PURE — it takes shifts and an estimate and returns numbers, so
 * the rules can be read and tested without touching either API.
 */

/** Labour booked against one approval, measured in technician-hours. */
export interface BookedHours {
  /**
   * Confirmed (published) technician-hours rostered since approval.
   * A 4-hour shift with 2 technicians counts as 8 technician-hours, matching
   * how estimators write them up ("2 x Technicians x 2 Days = 16 hours").
   */
  confirmed: number
  /** Same measure, for shifts still sitting in draft. */
  draft: number
  /** Number of shifts counted (confirmed + draft). */
  shiftCount: number
  /** Shifts on the job that carry no assignee yet; they book no hours. */
  openShiftCount: number
  /** Estimated technician hours from the authorised estimate. */
  estimated: number
  /**
   * Estimated minus confirmed, floored at zero. Null when the estimate quotes
   * no technician hours, since "remaining" is meaningless without a target.
   */
  remaining: number | null
  /** True when confirmed booking has passed the estimate. */
  overBooked: boolean
}

/** Technician-hours a single shift represents. Unassigned shifts book none. */
function technicianHours(shift: Shift): number {
  const durationHours = (new Date(shift.end).getTime() - new Date(shift.start).getTime()) / 3_600_000
  if (!Number.isFinite(durationHours) || durationHours <= 0) return 0
  return durationHours * shift.userIds.length
}

/**
 * Index shifts by the PrimeEco job they belong to, so each approval can be
 * reconciled without rescanning the whole roster.
 */
export function indexShiftsByJob(shifts: readonly Shift[]): Map<string, Shift[]> {
  const byJob = new Map<string, Shift[]>()
  for (const shift of shifts) {
    if (!shift.ctJobId) continue
    const existing = byJob.get(shift.ctJobId)
    if (existing) existing.push(shift)
    else byJob.set(shift.ctJobId, [shift])
  }
  return byJob
}

/**
 * Reconcile one approval against the shifts booked on its job.
 *
 * @param shifts    every roster shift on the job (any date).
 * @param approvedAt when the estimate was authorised; shifts before this belong
 *                   to earlier work and are ignored.
 * @param estimate   labour from the authorised estimate, or null if it has none.
 */
export function reconcileHours(
  shifts: readonly Shift[] | undefined,
  approvedAt: string | null,
  estimate: JobEstimateHours | null,
): BookedHours {
  const estimated = estimate?.byRole.Technician?.hours ?? 0
  const empty: BookedHours = {
    confirmed: 0,
    draft: 0,
    shiftCount: 0,
    openShiftCount: 0,
    estimated,
    remaining: estimated > 0 ? estimated : null,
    overBooked: false,
  }
  if (!shifts?.length || !approvedAt) return empty

  const approvedMs = new Date(approvedAt).getTime()
  if (Number.isNaN(approvedMs)) return empty

  let confirmed = 0
  let draft = 0
  let shiftCount = 0
  let openShiftCount = 0

  for (const shift of shifts) {
    // Compare on the shift's START: a shift is "since approval" if the work
    // itself happens on or after the day the estimate was authorised.
    if (new Date(shift.start).getTime() < approvedMs) continue

    if (shift.open || shift.userIds.length === 0) {
      openShiftCount += 1
      continue
    }

    const hours = technicianHours(shift)
    if (hours <= 0) continue

    shiftCount += 1
    if (shift.status === "published") confirmed += hours
    else draft += hours
  }

  return {
    confirmed,
    draft,
    shiftCount,
    openShiftCount,
    estimated,
    remaining: estimated > 0 ? Math.max(estimated - confirmed, 0) : null,
    overBooked: estimated > 0 && confirmed > estimated,
  }
}
