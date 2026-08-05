import type { DashboardJob } from "./types"

/**
 * Deterministic mock dataset used when PrimeEco isn't configured. It mirrors the
 * shape of a normalized job so the dashboard renders identically to live mode —
 * only the numbers differ. Restoration-industry flavoured for realism.
 */

const STATUSES = [
  "New",
  "Allocated",
  "On Site",
  "In Progress",
  "Awaiting Approval",
  "Estimate Sent",
  "Works Complete",
  "Invoiced",
  "Closed",
  "Cancelled",
]

const ESTIMATORS = ["Sarah Nguyen", "James O'Brien", "Priya Patel", "Marco Rossi", "Unassigned"]
const CASE_MANAGERS = ["Emma Wilson", "David Chen", "Aisha Khan", "Tom Baker"]
const ASSIGNEES = ["Field Crew A", "Field Crew B", "Field Crew C", "Subcontractor: DryTech"]
const REGIONS = ["Sydney Metro", "Newcastle", "Wollongong", "Central Coast", "Blue Mountains"]
const CLIENTS = ["AAMI Insurance", "Suncorp", "Allianz", "IAG", "QBE", "Strata Plus"]

/** Small seeded PRNG so the mock is stable across renders (mulberry32). */
function makeRng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]

export function getMockJobs(count = 128): DashboardJob[] {
  const rng = makeRng(42)
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    const status = pick(rng, STATUSES)
    const closedStatuses = ["Closed", "Cancelled"]
    const ageDays = Math.floor(rng() * 120)
    const createdAt = new Date(now - ageDays * 86_400_000).toISOString()
    const value = Math.round((2000 + rng() * 48000) / 50) * 50

    return {
      id: String(100000 + i),
      jobNumber: `JOB-${100000 + i}`,
      status,
      statusId: String(STATUSES.indexOf(status) + 1),
      statusType: closedStatuses.includes(status) ? "Closed" : "Open",
      client: pick(rng, CLIENTS),
      estimator: pick(rng, ESTIMATORS),
      caseManager: pick(rng, CASE_MANAGERS),
      assignedTo: pick(rng, ASSIGNEES),
      region: pick(rng, REGIONS),
      value,
      excessCollected: rng() > 0.6 ? Math.round(rng() * 1500) : 0,
      incidentDate: new Date(now - (ageDays + 2) * 86_400_000).toISOString(),
      createdAt,
      updatedAt: new Date(now - Math.floor(rng() * ageDays) * 86_400_000).toISOString(),
      ageDays,
    } satisfies DashboardJob
  })
}
