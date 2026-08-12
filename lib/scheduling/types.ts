import type { Shift } from "@/lib/connecteam/types"
import type { EstimateLine, JobEstimateHours } from "@/lib/primeeco/estimate-labour"

/**
 * The subset of a PrimeEco estimate row the scheduling board actually needs.
 * Kept as a standalone shape (not `EstimateRow`) so ongoing changes to the
 * estimates module's interface can't break the scheduling build — the real
 * `EstimateRow` is a structural superset and assigns cleanly to this.
 */
export interface ApprovalSource {
  jobId: string
  jobNumber: string
  client: string
  division: string
  estimator: string
  valueExGst: number
  status: string
  createdAt: string | null
  /** "Open" | "Closed" from the job's status lookup; null when unknown. */
  statusType: string | null
  /** PrimeEco job type (Makesafe, Job, Quote, Restoration, …). */
  jobType: string | null
  /** Formatted site address. */
  address: string | null
  /** The job's works-requested / incident description. */
  jobDescription: string | null
  /** Deep link into PrimeEco for this job. */
  primeUrl: string | null
  /** True when every line of the estimate is Equipment Hire (rental only). */
  equipmentHireOnly: boolean
  /** PrimeEco estimate id (UUID). */
  estimateId: string
  /**
   * The quote's NAME in PrimeEco (e.g. "Quote - 11 Aug | DFM-0672",
   * "Variation Works"). PrimeEco has no separate estimate-number field, so
   * this label plus `estimateRef` are the identifiers.
   */
  estimateLabel: string | null
  /** The quote's own description line, when the estimator set one. */
  estimateDescription: string | null
  /** Short human-quotable reference derived from the estimate id (8 chars). */
  estimateRef: string
  /** "Authorised Works" | "Direct Allocation" (the allocations section). */
  estimateType: string | null
  /**
   * Set when the job has an AR invoice dated on/after this approval —
   * invoiced means the works are already completed, so the estimate doesn't
   * need scheduling. This is the primary (final over progress) invoice.
   */
  invoiced: InvoicedInfo | null
  /** Every invoice raised on the job on/after this approval, newest first. */
  invoices: InvoicedInfo[]
  /**
   * Labour time from THIS estimate's own lines. Null when it has none (or,
   * for mock rows, when the facade should fall back to the mock hours map).
   */
  estHours: JobEstimateHours | null
  /** The estimate's line items — the full "inside" detail. */
  lines: EstimateLine[]
}

/** Invoice evidence that an approved estimate's works are done. */
export interface InvoicedInfo {
  invoiceNumber: string
  /** Date-only (YYYY-MM-DD). */
  invoicedDate: string | null
  /** AR status (Sent/Pending/Approved/Paid). */
  status: string
  paid: boolean
  /** True when it's a progress payment (<100%), not the final invoice. */
  progress: boolean
}

/**
 * One line item of an estimate. Defined in the PrimeEco layer alongside the
 * labour rules that populate `role`; re-exported here so UI code has a single
 * import for every scheduling shape.
 */
export type { EstimateLine } from "@/lib/primeeco/estimate-labour"

/** An approved job (authorised estimate) with its scheduling state. */
export interface ApprovedJob {
  jobId: string
  jobNumber: string
  client: string
  division: string
  estimator: string
  valueExGst: number
  /** When the estimate was authorised (our "approved" signal). */
  approvedAt: string | null
  /** True when we found a matching Connecteam shift for this job. */
  scheduled: boolean
  /** Start day of the first matching shift, if scheduled. */
  firstShiftAt: string | null
  /**
   * Estimated labour time from the authorised estimate's line items, broken
   * out by role (Technician / PM / Supervisor / Labourer / Other), hours and
   * days reported separately. Null when no labour lines were found.
   */
  estHours: JobEstimateHours | null
  /** PrimeEco job type (Makesafe, Job, Quote, Restoration, …). */
  jobType: string | null
  /** Formatted site address. */
  address: string | null
  /** The job's works-requested / incident description. */
  jobDescription: string | null
  /** Deep link into PrimeEco for this job. */
  primeUrl: string | null
  /** PrimeEco estimate id — unique row key (a job can have several). */
  estimateId: string
  /** The quote's NAME in PrimeEco (no separate number field exists). */
  estimateLabel: string | null
  /** The quote's own description line, when the estimator set one. */
  estimateDescription: string | null
  /** Short human-quotable reference derived from the estimate id (8 chars). */
  estimateRef: string
  /** "Authorised Works" | "Direct Allocation" (the allocations section). */
  estimateType: string | null
  /** Set when the works are already invoiced (= completed). */
  invoiced: InvoicedInfo | null
  /** Every invoice raised on the job on/after this approval, newest first. */
  invoices: InvoicedInfo[]
  /** The estimate's line items — full scope detail for the drill-down. */
  lines: EstimateLine[]
}

/** One appointment-type row: how many upcoming, split draft vs confirmed. */
export interface TypeBucket {
  type: string
  total: number
  draft: number
  confirmed: number
}

/**
 * A roster shift enriched with the PrimeEco job it belongs to. Connecteam's
 * `jobId` IS the PrimeEco job UUID (the systems are synced), so the calendar
 * can show the job number and client alongside the appointment.
 */
export interface CalendarShift extends Shift {
  /** PrimeEco job number, when the shift is linked to a known job. */
  jobNumber: string | null
  /** Client name from the job. */
  client: string | null
}

/** A single day column in the week strip. */
export interface DayColumn {
  /** ISO date (midnight) for the day. */
  date: string
  /** Short label, e.g. "Mon 11". */
  label: string
  shifts: CalendarShift[]
}

/** A field worker's availability snapshot for today. */
export interface TechAvailability {
  userId: string
  name: string
  /** Their Connecteam "Title", e.g. "Restoration Technician". */
  title: string | null
  /** True when no Title is set in Connecteam (included on roster evidence). */
  titleMissing: boolean
  /** Published shifts assigned to them today. */
  todayShifts: number
  /** Next shift start (any day), if any. */
  nextAt: string | null
  /** False when they have at least one published shift today. */
  available: boolean
}

export interface SchedulingData {
  live: boolean
  /** True when BOTH sources are live; false if either falls back to sample. */
  primeecoLive: boolean
  connecteamLive: boolean
  generatedAt: string
  /** True when management is unlocked; when false, $ values are stripped. */
  showValues: boolean
  /**
   * False while estimated-hours coverage is still building (time-budgeted
   * fetch) — the client polls faster until this flips true.
   */
  hoursComplete: boolean
  error?: string

  counts: {
    approved7d: number
    unscheduled: number
    upcoming: number
    draft: number
    openShifts: number
    techsOnToday: number
    /** Office staff (coordinators/admin) excluded from the availability list. */
    officeHidden: number
  }

  /** Recently approved jobs (last 14 days), newest first. */
  approvals: ApprovedJob[]
  /** Approved but with no matching Connecteam shift yet — the action list. */
  needsScheduling: ApprovedJob[]
  /** Next 7 days of shifts. */
  week: DayColumn[]
  /** Per appointment-type outstanding counts. */
  typeBreakdown: TypeBucket[]
  /** Technician availability for today. */
  availability: TechAvailability[]
  /** Unassigned (open) shifts that still need someone. */
  openShifts: CalendarShift[]
}
