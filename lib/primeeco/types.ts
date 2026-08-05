/**
 * Types for the PrimeEco v2 API and the normalized shapes the dashboard uses.
 *
 * The RAW types describe (loosely) what the API returns. Because the exact
 * relationship field names aren't fully documented, RawJob is intentionally
 * permissive — the mapping lives in one place (normalize.ts) so it can be tuned
 * against a real payload without touching any UI code.
 */

/**
 * A PrimeEco job. GET /jobs returns JSON:API resources: `{ type, id, attributes }`.
 * The attributes reference related entities by UUID (statusId, estimatorId, ...),
 * which normalize.ts resolves to names via the lookups. `[key: string]: unknown`
 * keeps this tolerant of the many fields we don't consume.
 */
export interface RawJob {
  id?: string | number
  jobNumber?: string

  // UUID references — resolved to names in normalize.ts via Lookups.
  statusId?: string | null
  estimatorId?: string | null
  caseManagerId?: string | null
  assignedId?: string | null
  supervisorId?: string | null
  clientId?: string | null

  // Region is sometimes an inline string, sometimes just an id.
  region?: string | null
  regionId?: string | null

  // Financials (strings like "700.80"). authorisedTotalExcludingTax is the
  // primary "job value" figure used across the dashboard.
  authorisedTotalIncludingTax?: number | string | null
  authorisedTotalExcludingTax?: number | string | null
  authorisedTotalExcludingTaxExcludingMarginExcludingMarkup?: number | string | null
  excessCollected?: number | string | null

  incidentDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null

  // JSON:API wrapper — attributes are merged in normalize.ts.
  attributes?: Record<string, unknown>

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
  /** "Open" | "Closed" from the status lookup — drives the active/completed split. */
  statusType: string | null
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
