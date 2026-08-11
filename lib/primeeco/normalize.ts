import type { DashboardJob, RawJob } from "./types"
import type { Lookups } from "./lookups"

/**
 * Anti-corruption layer: converts PrimeEco's raw job payload into the clean
 * `DashboardJob` the UI consumes. ALL upstream field knowledge lives here — the
 * UI stays ignorant of PrimeEco's schema.
 *
 * Jobs reference status/estimator/caseManager/assignee/client by UUID, so we
 * resolve those to names via `lookups` (statuses, users, contacts).
 */

/** JSON:API resources wrap fields under `attributes`; merge them up with id. */
function flatten(raw: RawJob): Record<string, unknown> {
  if (raw.attributes && typeof raw.attributes === "object") {
    return { ...raw.attributes, ...raw, id: raw.id }
  }
  return raw as Record<string, unknown>
}

/** Coerce a possibly-string/null money value to a finite number. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function toIsoOrNull(value: unknown): string | null {
  const s = toStr(value)
  if (!s) return null
  // PrimeEco timestamps look like "2025-02-07 04:14:33" — normalise the space.
  const d = new Date(s.replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  return diff < 0 ? 0 : Math.floor(diff / 86_400_000)
}

/** Resolve a UUID against a lookup map, returning null if absent/unknown. */
function resolve(id: unknown, map: Map<string, string>): string | null {
  const key = toStr(id)
  return key ? map.get(key) ?? null : null
}

/** Jobs carry address as {addressLine1, suburb, state, postcode, …}. */
function formatAddress(value: unknown): string | null {
  if (!value || typeof value !== "object") return toStr(value)
  const a = value as Record<string, unknown>
  const line = [toStr(a.addressLine1), toStr(a.addressLine2)].filter(Boolean).join(" ")
  const locality = [toStr(a.suburb), toStr(a.state), toStr(a.postcode)].filter(Boolean).join(" ")
  const parts = [line, locality].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

export function normalizeJob(raw: RawJob, lookups: Lookups): DashboardJob {
  const f = flatten(raw)

  const id = String(f.id ?? f.jobNumber ?? crypto.randomUUID())
  const statusId = toStr(f.statusId)
  const createdAt = toIsoOrNull(f.createdAt)

  return {
    id,
    jobNumber: toStr(f.jobNumber) ?? id,
    status: (statusId && lookups.statusName.get(statusId)) || "Unknown",
    statusId,
    statusType: statusId ? lookups.statusType.get(statusId) ?? null : null,
    client: resolve(f.clientId, lookups.contactName),
    estimator: resolve(f.estimatorId, lookups.userName),
    caseManager: resolve(f.caseManagerId, lookups.userName),
    assignedTo: resolve(f.assignedId, lookups.userName),
    region: toStr(f.region),
    division: resolve(f.divisionId, lookups.divisionName),
    // Primary job value: authorised total ex-tax (falls back through variants).
    value: toNumber(
      f.authorisedTotalExcludingTax ??
        f.authorisedTotalIncludingTax ??
        f.authorisedTotalExcludingTaxExcludingMarginExcludingMarkup,
    ),
    excessCollected: toNumber(f.excessCollected),
    incidentDate: toIsoOrNull(f.incidentDate),
    createdAt,
    updatedAt: toIsoOrNull(f.updatedAt),
    ageDays: daysSince(createdAt),
    jobType: toStr(f.jobType),
    address: formatAddress(f.address),
    description: toStr(f.description),
    primeUrl: toStr(f.primeUrl),
  }
}
