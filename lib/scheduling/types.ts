import type { Shift } from "@/lib/connecteam/types"
import type { JobEstimateHours } from "@/lib/primeeco/estimate-hours"

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
  /** The estimate's display label in PrimeEco (its "number"/name). */
  estimateLabel: string | null
  /** "Authorised Works" | "Direct Allocation" (the allocations section). */
  estimateType: string | null
  /**
   * Set when the job has an AR invoice dated on/after this approval —
   * invoiced means the works are already completed, so the estimate doesn't
   * need scheduling.
   */
  invoiced: InvoicedInfo | null
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

/** One line item of an authorised estimate (scope detail for coordinators). */
export interface EstimateLine {
  trade: string
  /** The scope text, e.g. "Technician Hours - Standard Rate\n<works detail>". */
  description: string
  /** Estimator guidance notes, when present. */
  notes: string | null
  labourQuantity: number
  labourUnit: string | null
  materialQuantity: number
  materialUnit: string | null
  /** Labour role when this is a labour-time line (Technician / PM / …). */
  role: string | null
}

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
  /** The estimate's display label in PrimeEco (its "number"/name). */
  estimateLabel: string | null
  /** "Authorised Works" | "Direct Allocation" (the allocations section). */
  estimateType: string | null
  /** Set when the works are already invoiced (= completed). */
  invoiced: InvoicedInfo | null
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

/** A single day column in the week strip. */
export interface DayColumn {
  /** ISO date (midnight) for the day. */
  date: string
  /** Short label, e.g. "Mon 11". */
  label: string
  shifts: Shift[]
}

/** A technician's availability snapshot for today. */
export interface TechAvailability {
  userId: string
  name: string
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
  openShifts: Shift[]
}
