import "server-only"
import { ctFetch } from "./client"
import { connecteamConfig } from "./config"
import { normalizeShift, normalizeUser } from "./normalize"
import type { CtUser, RawCtUser, RawShift, Shift } from "./types"

/**
 * Repository for Connecteam scheduler data. Pulls the user directory (to resolve
 * assignee names) and every shift in a date window across the configured
 * scheduler(s), returning clean, normalized `Shift`s.
 */

/** Connecteam list envelope: { requestId, data: { <key>: [...] }, paging }. */
interface Envelope<K extends string, T> {
  data?: Partial<Record<K, T[]>>
  paging?: { offset?: number; limit?: number; total?: number }
}

const PAGE_LIMIT = 200
const MAX_PAGES = 20 // safety cap

/** Page through a Connecteam list endpoint using offset/limit paging. */
async function fetchPaged<K extends string, T>(
  path: string,
  key: K,
  extraParams: Record<string, string | number | undefined> = {},
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT
    const env = await ctFetch<Envelope<K, T>>(path, {
      searchParams: { limit: PAGE_LIMIT, offset, ...extraParams },
    })
    const items = env.data?.[key] ?? []
    rows.push(...items)
    const total = env.paging?.total
    if (items.length < PAGE_LIMIT || (total !== undefined && rows.length >= total)) break
  }
  return rows
}

/** Resolve the scheduler ids to read — explicit config, else auto-discover. */
async function resolveSchedulerIds(): Promise<string[]> {
  if (connecteamConfig.schedulerIds.length) return connecteamConfig.schedulerIds
  const schedulers = await fetchPaged<"schedulers", { id?: string | number }>(
    "/scheduler/v1/schedulers",
    "schedulers",
  )
  return schedulers.map((s) => String(s.id)).filter(Boolean)
}

export async function fetchUsers(): Promise<CtUser[]> {
  const raw = await fetchPaged<"users", RawCtUser>("/users/v1/users", "users")
  return raw.map(normalizeUser).filter((u): u is CtUser => u !== null)
}

/**
 * Fetch all shifts between `startMs` and `endMs` (epoch ms) across schedulers.
 * @param userName id→name map so shifts arrive with resolved assignee names.
 */
export async function fetchShifts(startMs: number, endMs: number, userName: Map<string, string>): Promise<Shift[]> {
  const schedulerIds = await resolveSchedulerIds()
  const startSec = Math.floor(startMs / 1000)
  const endSec = Math.floor(endMs / 1000)

  const perScheduler = await Promise.all(
    schedulerIds.map(async (sid) => {
      const raw = await fetchPaged<"shifts", RawShift>(
        `/scheduler/v1/schedulers/${sid}/shifts`,
        "shifts",
        { startTime: startSec, endTime: endSec },
      )
      return raw.map((r) => normalizeShift(r, sid, userName))
    }),
  )

  return perScheduler.flat()
}
