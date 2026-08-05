import type { DashboardJob, NamedRef, RawJob } from "./types"

/**
 * Anti-corruption layer: converts PrimeEco's raw job payload into the clean
 * `DashboardJob` the UI consumes. ALL field-name knowledge lives here — if the
 * live API uses different keys for, say, the estimator relationship, this is the
 * only file that changes. Keep the UI ignorant of the upstream schema.
 */

/** JSON:API resources wrap fields under `attributes`; flat payloads don't. Merge both. */
function flatten(raw: RawJob): Record<string, unknown> {
  if (raw.attributes && typeof raw.attributes === "object") {
    return { id: raw.id ?? raw.jobId, ...raw.attributes, ...raw }
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

/** Resolve a person/entity reference that may be a string, a NamedRef, or split name fields. */
function toName(ref: unknown, ...fallbackKeys: unknown[]): string | null {
  for (const candidate of [ref, ...fallbackKeys]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    if (candidate && typeof candidate === "object") {
      const r = candidate as NamedRef
      if (r.fullName?.trim()) return r.fullName.trim()
      if (r.name?.trim()) return r.name.trim()
      const composed = [r.firstName, r.lastName].filter(Boolean).join(" ").trim()
      if (composed) return composed
    }
  }
  return null
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  return diff < 0 ? 0 : Math.floor(diff / 86_400_000)
}

export function normalizeJob(raw: RawJob): DashboardJob {
  const f = flatten(raw)

  const id = String(f.jobId ?? f.id ?? f.jobNumber ?? crypto.randomUUID())
  const createdAt = toIsoOrNull(f.createdAt)

  return {
    id,
    jobNumber: String(f.jobNumber ?? id),
    status: (typeof f.jobStatus === "string" && f.jobStatus) || "Unknown",
    statusId: f.jobStatusId != null ? String(f.jobStatusId) : null,
    client: toName(f.client, f.clientName),
    estimator: toName(f.estimator, f.estimatorName),
    caseManager: toName(f.caseManager, f.caseManagerName),
    assignedTo: toName(f.assignedTo, f.assignedToName),
    region: toName(f.region, f.regionName, f.regionId),
    value: toNumber(
      f.authorisedTotalExcludingTaxExcludingMarginExcludingMarkup ??
        f.authorisedTotal ??
        f.estimateTotal,
    ),
    excessCollected: toNumber(f.excessCollected),
    incidentDate: toIsoOrNull(f.incidentDate),
    createdAt,
    updatedAt: toIsoOrNull(f.updatedAt),
    ageDays: daysSince(createdAt),
  }
}
