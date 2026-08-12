/**
 * Types for the Connecteam scheduler API and the clean shapes the dashboard
 * consumes.
 *
 * RAW types are intentionally permissive — Connecteam's exact field names for
 * a few things (the draft/published flag, the timezone, custom fields) aren't
 * fully documented and vary by account, so ALL upstream field knowledge lives
 * in normalize.ts and can be tuned against a real payload without touching UI.
 */

/** One entry in a shift's customFields array. */
export interface RawShiftCustomField {
  customFieldId?: number
  name?: string
  type?: string
  /** For dropdowns, an array of { id, value } objects. */
  value?: Array<{ id?: number | string; value?: string }> | string | null
}

/**
 * A raw Connecteam shift as returned by GET .../shifts. Field names confirmed
 * against the live Job Scheduler (2026-08-10): assignees are `assignedUserIds`,
 * the appointment type lives in a `customFields` entry named "Appoinment Type"
 * (their spelling), the title is often blank, and `jobId` is the PrimeEco job
 * UUID (the two systems are synced), which lets us join exactly.
 */
export interface RawShift {
  id?: string | number
  title?: string
  /** Unix epoch SECONDS (Connecteam) — normalize.ts converts to ISO. */
  startTime?: number | string
  endTime?: number | string
  /** The PrimeEco job UUID (synced), used to join to approvals. */
  jobId?: string | number | null
  /** Employees assigned to the shift; empty ⇒ an open/unassigned shift. */
  assignedUserIds?: Array<string | number>
  /** Draft vs published (unpublished = still tentative / not synced). */
  isPublished?: boolean
  isOpenShift?: boolean
  /** Appointment type + other per-shift fields. */
  customFields?: RawShiftCustomField[]
  /** Site location; `gps.address` is a human-readable address. */
  locationData?: { gps?: { address?: string } } | null
  color?: string | null
  [key: string]: unknown
}

/** A raw Connecteam user as returned by GET /users/v1/users. */
export interface RawCtUser {
  userId?: string | number
  id?: string | number
  firstName?: string
  lastName?: string
  fullName?: string
  isArchived?: boolean
  /** Per-user fields; the "Title" entry carries their role. */
  customFields?: RawShiftCustomField[]
  [key: string]: unknown
}

/** Clean, UI-facing shift shape. */
export interface Shift {
  id: string
  title: string
  /** ISO start / end. */
  start: string
  end: string
  /** The PrimeEco job UUID this shift is for (used to join to approvals). */
  ctJobId: string | null
  /** Site address from the shift's location, when present. */
  address: string | null
  userIds: string[]
  userNames: string[]
  /** "draft" = tentative (not yet published / not yet synced to PrimeEco). */
  status: "draft" | "published"
  /** True when nobody is assigned yet. */
  open: boolean
  schedulerId: string
  /**
   * Coarse appointment "type" derived from the shift title (e.g. "Moisture
   * Check", "Make Safe"). Coordinators encode the type in the title, so this is
   * a best-effort classification — see classifyType() in normalize.ts.
   */
  type: string
}

export interface CtUser {
  id: string
  name: string
  /** The "Title" custom field in Connecteam, e.g. "Restoration Technician". */
  title: string | null
  /**
   * Whether this person does field work.
   *   field   — technician / estimator / project manager (schedulable)
   *   office  — coordinator / admin / accounts / director (not schedulable)
   *   unknown — no Title set in Connecteam
   */
  staffType: "field" | "office" | "unknown"
}
