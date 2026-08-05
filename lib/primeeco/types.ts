/**
 * Types for the PrimeEco v2 API and the normalized shapes the dashboard uses.
 *
 * The RAW types describe (loosely) what the API returns. Because the exact
 * relationship field names aren't fully documented, RawJob is intentionally
 * permissive — the mapping lives in one place (normalize.ts) so it can be tuned
 * against a real payload without touching any UI code.
 */

/** A PrimeEco job as returned by GET /jobs (attributes may be flat or JSON:API-wrapped). */
export interface RawJob {
  jobId?: string | number
  id?: string | number
  jobNumber?: string
  jobStatus?: string
  jobStatusId?: string | number

  incidentDate?: string | null
  allocatedDate?: string | null
  initialStartDate?: string | null
  initialEndDate?: string | null

  regionId?: string | number | null
  brokerReference?: string | null
  strataReference?: string | null
  adjusterReference?: string | null

  // Financials — the documented authorised total plus other commonly-present fields.
  authorisedTotalExcludingTaxExcludingMarginExcludingMarkup?: number | string | null
  authorisedTotal?: number | string | null
  estimateTotal?: number | string | null
  excessCollected?: number | string | null

  // People — best-effort field names; resolved defensively in normalize.ts.
  estimator?: NamedRef | string | null
  estimatorName?: string | null
  caseManager?: NamedRef | string | null
  caseManagerName?: string | null
  assignedTo?: NamedRef | string | null
  assignedToName?: string | null

  client?: NamedRef | string | null
  clientName?: string | null

  createdAt?: string | null
  updatedAt?: string | null

  // JSON:API escape hatches.
  attributes?: Record<string, unknown>
  relationships?: Record<string, unknown>

  [key: string]: unknown
}

export interface NamedRef {
  id?: string | number
  name?: string
  fullName?: string
  firstName?: string
  lastName?: string
}

export interface RawStatus {
  id?: string | number
  statusId?: string | number
  name?: string
  colour?: string | null
  color?: string | null
  attributes?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawUser {
  id?: string | number
  userId?: string | number
  name?: string
  fullName?: string
  firstName?: string
  lastName?: string
  attributes?: Record<string, unknown>
  [key: string]: unknown
}

/** Clean, UI-facing job shape. Everything the dashboard renders comes from this. */
export interface DashboardJob {
  id: string
  jobNumber: string
  status: string
  statusId: string | null
  client: string | null
  estimator: string | null
  caseManager: string | null
  assignedTo: string | null
  region: string | null
  /** Primary money figure used across the dashboard (authorised total, ex-tax). */
  value: number
  excessCollected: number
  incidentDate: string | null
  createdAt: string | null
  updatedAt: string | null
  /** Days since the job was created (for aging). */
  ageDays: number | null
}

export interface StatusBreakdownItem {
  status: string
  count: number
  value: number
}

export interface PersonaBreakdownItem {
  name: string
  count: number
  value: number
}

export interface AgingBucket {
  label: string
  count: number
}

export interface DashboardData {
  live: boolean
  generatedAt: string
  totalJobs: number
  kpis: {
    totalJobs: number
    activeJobs: number
    completedJobs: number
    totalValue: number
    activeValue: number
    excessCollected: number
    avgJobValue: number
    jobsCreated30d: number
  }
  statusBreakdown: StatusBreakdownItem[]
  byEstimator: PersonaBreakdownItem[]
  byCaseManager: PersonaBreakdownItem[]
  byAssignee: PersonaBreakdownItem[]
  byRegion: PersonaBreakdownItem[]
  aging: AgingBucket[]
  recentJobs: DashboardJob[]
  /** Present when the API could not be reached; dashboard shows a banner. */
  error?: string
}
