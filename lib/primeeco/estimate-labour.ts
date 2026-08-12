/**
 * Domain rules for labour time on PrimeEco estimates.
 *
 * This module is PURE: no I/O, no framework imports. It owns the answer to
 * two questions and nothing else:
 *
 *   1. Is a given estimate line "people time", and whose time is it?
 *   2. How much time does a set of lines add up to?
 *
 * Keeping these rules in one dependency-free place means they can be reasoned
 * about and unit-tested without touching the API, and the repositories above
 * (estimate-snapshot.ts) stay focused on fetching and mapping.
 */

/**
 * Who performs a labour line.
 *
 * "Labour" is the catch-all for lines under the Labour TRADE whose description
 * names no specific role — estimators frequently rewrite descriptions into
 * free scope text, and those hours must still be counted.
 * "Other" is reserved for time-lines under a non-Labour trade.
 */
export type HoursRole = "Technician" | "Project Manager" | "Supervisor" | "Labourer" | "Labour" | "Other"

/** Time booked against one role, kept split because the units aren't equivalent. */
export interface RoleTime {
  hours: number
  days: number
}

/**
 * Labour time for a single job or estimate, broken out by role.
 *
 * Hours and days are reported SEPARATELY and never converted into one another:
 * a "day" in an estimate is a billing unit, not a fixed number of hours, so
 * summing them would invent precision that isn't in the source data.
 */
export interface JobEstimateHours {
  jobId: string
  byRole: Partial<Record<HoursRole, RoleTime>>
  totalHours: number
  totalDays: number
}

/**
 * One line item of an estimate, in the shape the dashboard consumes.
 *
 * Defined here (rather than alongside the snapshot repository) so the labour
 * rules stay free of any dependency on the API layer.
 */
export interface EstimateLine {
  /** PrimeEco trade, e.g. "Labour", "Equipment Hire", "Chemicals/Consumables". */
  trade: string
  /** Scope text. May be a role heading ("Technician Hours - Standard Rate") or free text. */
  description: string
  /** Estimator guidance notes, when present. */
  notes: string | null
  labourQuantity: number
  labourUnit: string | null
  materialQuantity: number
  materialUnit: string | null
  /** Set only for labour-TIME lines; null for materials and equipment hire. */
  role: HoursRole | null
  /** True when PrimeEco flagged this specific line as authorised. */
  authorised: boolean
  /** Line value ex-GST (materials + labour + their markups). */
  valueExGst: number
}

/** Labour units that denote hours. */
export const isHourUnit = (unit: string) => /^hr/i.test(unit)

/** Labour units that denote whole days or weeks. */
export const isDayUnit = (unit: string) => /^(day|wk|week)/i.test(unit)

/**
 * Equipment Hire lines carry day quantities that are RENTAL periods (a
 * dehumidifier on site for 3 days), not people time. Measured against live
 * data, 185 of 186 day-unit lines were equipment hire — counting them as
 * labour would have made the day totals meaningless.
 */
export const isEquipmentHireTrade = (trade: string) => /equipment\s*hire/i.test(trade)

/** True when the trade is PrimeEco's Labour trade (exact match, not a substring). */
const isLabourTrade = (trade: string) => /^labour$/i.test(trade.trim())

/**
 * Classify a labour line by role.
 *
 * The description is only a HINT: it usually starts with a role heading, but
 * estimators often replace it with scope text. The TRADE is therefore checked
 * as a fallback so those lines are still counted as labour rather than
 * silently bucketed as "Other".
 *
 * Note the ordering: the specific role patterns run first because titles like
 * "State Manager / Estimator" must resolve to Estimator, and "project manager"
 * is matched explicitly so a bare "manager" never claims the line.
 */
export function roleOf(description: string, trade = ""): HoursRole {
  const text = description.toLowerCase()
  if (/technician/.test(text)) return "Technician"
  if (/project\s*manager/.test(text)) return "Project Manager"
  if (/supervisor/.test(text)) return "Supervisor"
  if (/labou?rer/.test(text)) return "Labourer"
  if (isLabourTrade(trade)) return "Labour"
  return "Other"
}

/**
 * Decide whether a line represents people time, and if so which role.
 * Returns null for materials, consumables and equipment hire.
 */
export function labourRoleFor(
  trade: string,
  description: string,
  labourQuantity: number,
  labourUnit: string | null,
): HoursRole | null {
  if (labourQuantity <= 0 || !labourUnit) return null
  if (isEquipmentHireTrade(trade)) return null
  if (!isHourUnit(labourUnit) && !isDayUnit(labourUnit)) return null
  return roleOf(description, trade)
}

/**
 * Total the labour time across a set of lines, split by role.
 * Returns null when the lines contain no people time at all, so callers can
 * distinguish "no labour on this estimate" from "zero hours".
 */
export function aggregateLabour(jobId: string, lines: readonly EstimateLine[]): JobEstimateHours | null {
  const totals: JobEstimateHours = { jobId, byRole: {}, totalHours: 0, totalDays: 0 }

  for (const line of lines) {
    if (!line.role || !line.labourUnit) continue
    const bucket = (totals.byRole[line.role] ??= { hours: 0, days: 0 })
    if (isHourUnit(line.labourUnit)) {
      bucket.hours += line.labourQuantity
      totals.totalHours += line.labourQuantity
    } else if (isDayUnit(line.labourUnit)) {
      bucket.days += line.labourQuantity
      totals.totalDays += line.labourQuantity
    }
  }

  return totals.totalHours > 0 || totals.totalDays > 0 ? totals : null
}
