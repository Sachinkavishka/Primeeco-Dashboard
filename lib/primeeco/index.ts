import "server-only"
import { aggregateDashboard } from "./aggregate"
import { isPrimeecoConfigured } from "./config"
import { fetchAllRawJobs } from "./jobs"
import { getLookups } from "./lookups"
import { normalizeJob } from "./normalize"
import { getMockJobs } from "./mock"
import type { DashboardData } from "./types"

export type { DashboardData } from "./types"
export { isPrimeecoConfigured } from "./config"

/**
 * Single entry point for the dashboard. Resolves the source (live PrimeEco vs
 * mock), aggregates, and — importantly — never throws: if the live API fails,
 * it falls back to mock data with an `error` message so a wall display never
 * goes blank. The UI surfaces the state via the `live`/`error` flags.
 */
export async function getDashboardData(): Promise<DashboardData> {
  if (!isPrimeecoConfigured()) {
    return aggregateDashboard(getMockJobs(), { live: false })
  }

  try {
    // Jobs and lookups fetch in parallel; lookups are cached so the 60s refresh
    // reuses them. Then resolve each job's UUID references to names.
    const [rawJobs, lookups] = await Promise.all([fetchAllRawJobs(), getLookups()])
    const jobs = rawJobs.map((raw) => normalizeJob(raw, lookups))
    return aggregateDashboard(jobs, { live: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error contacting PrimeEco"
    // Degrade gracefully rather than blanking the display.
    return aggregateDashboard(getMockJobs(), { live: false, error: message })
  }
}
