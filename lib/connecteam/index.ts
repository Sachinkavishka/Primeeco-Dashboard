import "server-only"
import { unstable_cache } from "next/cache"
import { isConnecteamConfigured } from "./config"
import { getMockRoster } from "./mock"
import { fetchShifts, fetchUsers } from "./shifts"
import type { CtUser, Shift } from "./types"

export type { Shift, CtUser } from "./types"
export { isConnecteamConfigured } from "./config"

/**
 * Facade for the Connecteam roster used by the scheduling dashboard.
 *
 * Returns every shift in a rolling window (yesterday → +21 days) plus the user
 * directory, or a seeded mock roster when Connecteam isn't configured. Cached
 * cross-invocation for 5 min (like the PrimeEco facade) to stay well within
 * Connecteam's rate limits on Vercel serverless.
 */

export interface Roster {
  live: boolean
  shifts: Shift[]
  users: CtUser[]
  error?: string
}

const REVALIDATE_S = 300
const WINDOW_BACK_MS = 1 * 24 * 60 * 60 * 1000
const WINDOW_FWD_MS = 21 * 24 * 60 * 60 * 1000

async function fetchLive(): Promise<Roster> {
  const users = await fetchUsers()
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const now = Date.now()
  const shifts = await fetchShifts(now - WINDOW_BACK_MS, now + WINDOW_FWD_MS, userName)
  return { live: true, shifts, users }
}

const getCachedLive = unstable_cache(fetchLive, ["connecteam-roster-v1"], {
  revalidate: REVALIDATE_S,
  tags: ["connecteam-roster"],
})

let lastGood: Roster | null = null

export async function getRoster(): Promise<Roster> {
  if (!isConnecteamConfigured()) {
    const { shifts, users } = getMockRoster()
    // Name the cause explicitly — a silent fallback made prod misconfiguration
    // (missing/renamed env var) indistinguishable from an API outage.
    return {
      live: false,
      shifts,
      users,
      error: "Connecteam: CONNECTEAM_API_KEY env var is not set on this deployment — roster is sample",
    }
  }
  try {
    const data = await getCachedLive()
    lastGood = data
    return data
  } catch (err) {
    if (lastGood) return lastGood
    const { shifts, users } = getMockRoster()
    const message = err instanceof Error ? err.message : "Unknown error contacting Connecteam"
    return { live: false, shifts, users, error: `Connecteam: ${message}` }
  }
}
