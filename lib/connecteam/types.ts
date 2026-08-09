/**
 * Types for the Connecteam scheduler API and the clean shapes the dashboard
 * consumes.
 *
 * RAW types are intentionally permissive — Connecteam's exact field names for
 * a few things (the draft/published flag, the timezone, custom fields) aren't
 * fully documented and vary by account, so ALL upstream field knowledge lives
 * in normalize.ts and can be tuned against a real payload without touching UI.
 */

/** A raw Connecteam shift as returned by GET .../shifts. */
export interface RawShift {
  id?: string | number
  title?: string
  /** Unix epoch SECONDS (Connecteam) — normalize.ts converts to ISO. */
  startTime?: number | string
  endTime?: number | string
  /** Connecteam's own job id (NOT the PrimeEco job UUID). */
  jobId?: string | number | null
  /** Employees assigned to the shift; empty ⇒ an open/unassigned shift. */
  userIds?: Array<string | number>
  /** Draft vs published. Connecteam has used both names across versions. */
  isPublished?: boolean
  isDraft?: boolean
  isOpenShift?: boolean
  color?: string | null
  notes?: string | null
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
  [key: string]: unknown
}

/** Clean, UI-facing shift shape. */
export interface Shift {
  id: string
  title: string
  /** ISO start / end. */
  start: string
  end: string
  /** Connecteam job id, if the shift is tied to a Connecteam job. */
  ctJobId: string | null
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
}
