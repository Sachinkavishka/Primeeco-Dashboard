import "server-only"
import { unstable_cache } from "next/cache"
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
 * Single entry point for the dashboard.
 *
 * PrimeEco enforces 60 req/min + 5,000 req/day, and one full refresh is ~10
 * (jobs) + ~19 (lookups) requests. The client polls every couple of minutes and
 * Vercel runs on serverless (in-memory caches don't survive between
 * invocations), so without a shared cache we'd blow the minute limit (→ 429 →
 * SAMPLE) and exhaust the daily quota.
 *
 * `unstable_cache` uses Next.js's cross-invocation Data Cache with
 * stale-while-revalidate: the live fetch runs at most once per REVALIDATE_S
 * across ALL requests/instances, and while revalidating (or if it errors) the
 * last cached result keeps serving — so the wall display never flips to fake
 * SAMPLE data over a transient blip.
 */

const REVALIDATE_S = 300 // refresh live data at most once every 5 minutes

async function fetchLive(): Promise<DashboardData> {
  const [rawJobs, lookups] = await Promise.all([fetchAllRawJobs(), getLookups()])
  const jobs = rawJobs.map((raw) => normalizeJob(raw, lookups))
  return aggregateDashboard(jobs, { live: true })
}

const getCachedLive = unstable_cache(fetchLive, ["primeeco-dashboard-v1"], {
  revalidate: REVALIDATE_S,
  tags: ["primeeco-dashboard"],
})

/** Last successful result in this instance — last-resort fallback before mock. */
let lastGood: DashboardData | null = null

export async function getDashboardData(): Promise<DashboardData> {
  if (!isPrimeecoConfigured()) {
    return aggregateDashboard(getMockJobs(), { live: false })
  }

  try {
    const data = await getCachedLive()
    lastGood = data
    return data
  } catch (err) {
    if (lastGood) return lastGood
    const message = err instanceof Error ? err.message : "Unknown error contacting PrimeEco"
    return aggregateDashboard(getMockJobs(), { live: false, error: message })
  }
}
