import type {
  AgingBucket,
  DashboardData,
  DashboardJob,
  PersonaBreakdownItem,
  StatusBreakdownItem,
} from "./types"

/**
 * Pure aggregation: DashboardJob[] -> DashboardData. No I/O, no side effects,
 * so this is trivially unit-testable and reusable on both the server and (if
 * ever needed) the client.
 */

/** Status-name keywords used only as a fallback when statusType is absent. */
const COMPLETED_STATUS_HINTS = ["complete", "closed", "finalised", "finalized", "cancelled", "canceled"]

/**
 * A job is "completed" when its status lookup says statusType === "Closed".
 * Falls back to name keywords if the type is missing (e.g. mock/legacy data).
 */
function isCompleted(job: DashboardJob): boolean {
  if (job.statusType) return job.statusType.toLowerCase() === "closed"
  const s = job.status.toLowerCase()
  return COMPLETED_STATUS_HINTS.some((hint) => s.includes(hint))
}

function sumValue(jobs: DashboardJob[]): number {
  return jobs.reduce((acc, j) => acc + j.value, 0)
}

/** Group jobs by a keyed accessor, returning count + value totals sorted by count desc. */
function groupBy(
  jobs: DashboardJob[],
  key: (j: DashboardJob) => string | null,
  unassignedLabel = "Unassigned",
): PersonaBreakdownItem[] {
  const map = new Map<string, { count: number; value: number }>()
  for (const job of jobs) {
    const name = key(job) ?? unassignedLabel
    const entry = map.get(name) ?? { count: 0, value: 0 }
    entry.count += 1
    entry.value += job.value
    map.set(name, entry)
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, value: v.value }))
    .sort((a, b) => b.count - a.count)
}

function buildStatusBreakdown(jobs: DashboardJob[]): StatusBreakdownItem[] {
  const grouped = groupBy(jobs, (j) => j.status, "Unknown")
  return grouped.map((g) => ({ status: g.name, count: g.count, value: g.value }))
}

const AGING_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0–7 days", min: 0, max: 7 },
  { label: "8–30 days", min: 8, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
]

function buildAging(jobs: DashboardJob[]): AgingBucket[] {
  const active = jobs.filter((j) => !isCompleted(j))
  return AGING_BUCKETS.map(({ label, min, max }) => ({
    label,
    count: active.filter((j) => j.ageDays !== null && j.ageDays >= min && j.ageDays <= max).length,
  }))
}

export function aggregateDashboard(
  jobs: DashboardJob[],
  meta: { live: boolean; error?: string } = { live: false },
): DashboardData {
  const active = jobs.filter((j) => !isCompleted(j))
  const completed = jobs.filter((j) => isCompleted(j))

  const now = Date.now()
  const THIRTY_DAYS = 30 * 86_400_000
  const jobsCreated30d = jobs.filter(
    (j) => j.createdAt && now - new Date(j.createdAt).getTime() <= THIRTY_DAYS,
  ).length

  const totalValue = sumValue(jobs)

  return {
    live: meta.live,
    error: meta.error,
    generatedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    kpis: {
      totalJobs: jobs.length,
      activeJobs: active.length,
      completedJobs: completed.length,
      totalValue,
      activeValue: sumValue(active),
      excessCollected: jobs.reduce((acc, j) => acc + j.excessCollected, 0),
      avgJobValue: jobs.length ? totalValue / jobs.length : 0,
      jobsCreated30d,
    },
    statusBreakdown: buildStatusBreakdown(jobs),
    byEstimator: groupBy(active, (j) => j.estimator),
    byCaseManager: groupBy(active, (j) => j.caseManager),
    byAssignee: groupBy(active, (j) => j.assignedTo),
    byRegion: groupBy(jobs, (j) => j.region),
    aging: buildAging(jobs),
    recentJobs: [...jobs]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 25),
  }
}
