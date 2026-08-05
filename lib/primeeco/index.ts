import "server-only"
import { aggregateDashboard } from "./aggregate"
import { isPrimeecoConfigured } from "./config"
import { fetchAllJobs } from "./jobs"
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
    const jobs = await fetchAllJobs()
    return aggregateDashboard(jobs, { live: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error contacting PrimeEco"
    // Degrade gracefully rather than blanking the display.
    return aggregateDashboard(getMockJobs(), { live: false, error: message })
  }
}
