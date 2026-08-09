/**
 * Connecteam API configuration.
 *
 * Connecteam is the scheduling source of truth: coordinators build the roster
 * there (some appointments sit in DRAFT until confirmed), and on publish it
 * syncs into PrimeEco. We read shifts + users directly so we can see drafts too.
 *
 * Auth: an API key sent in a request header (Connecteam issues this from the
 * admin console → Integrations → API). Server-only — never expose with a
 * NEXT_PUBLIC_ prefix.
 *
 *   GET https://api.connecteam.com/scheduler/v1/schedulers
 *   GET https://api.connecteam.com/scheduler/v1/schedulers/{id}/shifts
 */

/** Split a comma/space separated env list into trimmed, non-empty ids. */
function idList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export const connecteamConfig = {
  apiUrl: (process.env.CONNECTEAM_API_URL ?? "https://api.connecteam.com").replace(/\/$/, ""),
  apiKey: process.env.CONNECTEAM_API_KEY ?? "",
  /**
   * Which scheduler(s) to read. Leave blank to auto-discover every scheduler on
   * the account (one extra call). Set explicitly to limit to the ops roster.
   */
  schedulerIds: idList(process.env.CONNECTEAM_SCHEDULER_IDS),
  /** Header name Connecteam expects the API key in. */
  apiKeyHeader: "X-API-KEY",
} as const

/** True when we have enough to talk to Connecteam (otherwise: mock roster). */
export function isConnecteamConfigured(): boolean {
  return Boolean(connecteamConfig.apiKey)
}
