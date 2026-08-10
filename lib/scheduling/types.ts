import type { Shift } from "@/lib/connecteam/types"

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
