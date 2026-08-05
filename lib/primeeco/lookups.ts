import "server-only"
import { apiFetch } from "./client"

/**
 * Reference-data lookups. PrimeEco jobs reference statuses/users/contacts by
 * UUID, so we resolve those to display names here.
 *
 * These change rarely, so the result is cached in module scope with a TTL —
 * the dashboard's 60s job refresh reuses cached lookups instead of re-pulling
 * ~1,600 contacts every cycle.
 */

export interface Lookups {
  /** statusId -> status name */
  statusName: Map<string, string>
  /** statusId -> "Open" | "Closed" (used for the active/completed split) */
  statusType: Map<string, string>
  /** userId -> full name */
  userName: Map<string, string>
  /** contactId -> name (used for client names) */
  contactName: Map<string, string>
}

interface ListEnvelope {
  data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
  meta?: { pagination?: { total_pages?: number } }
}

const TTL_MS = 10 * 60 * 1000 // lookups are stable; refresh every 10 min
const PER_PAGE = 100
const MAX_PAGES = 30 // safety cap (~3,000 rows) to respect rate limits

let cache: { data: Lookups; expiresAt: number } | null = null
let inflight: Promise<Lookups> | null = null

/** Fetch all pages of a lookup endpoint (sequential to stay within rate limits). */
async function fetchAll(path: string): Promise<ListEnvelope["data"]> {
  const rows: NonNullable<ListEnvelope["data"]> = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiFetch<ListEnvelope>(path, {
      searchParams: { page, per_page: PER_PAGE },
    })
    const items = res.data ?? []
    rows.push(...items)
    const totalPages = res.meta?.pagination?.total_pages
    if (items.length < PER_PAGE || (totalPages !== undefined && page >= totalPages)) break
  }
  return rows
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

async function build(): Promise<Lookups> {
  const [statuses, users, contacts] = await Promise.all([
    fetchAll("/statuses"),
    fetchAll("/users"),
    fetchAll("/contacts"),
  ])

  const statusName = new Map<string, string>()
  const statusType = new Map<string, string>()
  for (const s of statuses ?? []) {
    if (!s.id) continue
    const a = s.attributes ?? {}
    if (str(a.name)) statusName.set(s.id, str(a.name)!)
    if (str(a.statusType)) statusType.set(s.id, str(a.statusType)!)
  }

  const userName = new Map<string, string>()
  for (const u of users ?? []) {
    if (!u.id) continue
    const a = u.attributes ?? {}
    const name =
      str(a.fullName) ?? [str(a.firstName), str(a.lastName)].filter(Boolean).join(" ").trim()
    if (name) userName.set(u.id, name)
  }

  const contactName = new Map<string, string>()
  for (const c of contacts ?? []) {
    if (!c.id) continue
    const a = c.attributes ?? {}
    const name =
      str(a.name) ?? [str(a.firstName), str(a.lastName)].filter(Boolean).join(" ").trim()
    if (name) contactName.set(c.id, name)
  }

  return { statusName, statusType, userName, contactName }
}

export async function getLookups(): Promise<Lookups> {
  if (cache && cache.expiresAt > Date.now()) return cache.data
  if (!inflight) {
    inflight = build()
      .then((data) => {
        cache = { data, expiresAt: Date.now() + TTL_MS }
        return data
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}
