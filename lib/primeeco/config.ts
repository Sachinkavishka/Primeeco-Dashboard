/**
 * PrimeEco API (v2) configuration.
 *
 * All credentials are read from server-only environment variables — never
 * expose these with a NEXT_PUBLIC_ prefix. On Vercel, set them as encrypted
 * Environment Variables. Locally, put them in apps/web/.env.local.
 *
 * OAuth2 "password" grant (Laravel Passport style):
 *   POST {PRIMEECO_API_URL}/oauth/token
 *   { grant_type, username, password, client_id, client_secret }
 */

export const primeecoConfig = {
  apiUrl: (process.env.PRIMEECO_API_URL ?? "https://www.primeeco.tech/api.prime/v2").replace(/\/$/, ""),
  clientId: process.env.PRIMEECO_CLIENT_ID ?? "",
  clientSecret: process.env.PRIMEECO_CLIENT_SECRET ?? "",
  username: process.env.PRIMEECO_USERNAME ?? "",
  password: process.env.PRIMEECO_PASSWORD ?? "",
  /** Optional: skip the password grant and use a pre-issued token (handy for testing). */
  staticToken: process.env.PRIMEECO_ACCESS_TOKEN ?? "",
  /** v2 resources are negotiated via this Accept header. */
  acceptHeader: "application/vnd.api.v2+json",
} as const

/**
 * True when enough is configured to talk to the live API. When false, the
 * dashboard falls back to mock data so the UI still renders (e.g. before
 * credentials are added, or in preview deployments).
 */
export function isPrimeecoConfigured(): boolean {
  if (primeecoConfig.staticToken) return true
  return Boolean(
    primeecoConfig.clientId &&
      primeecoConfig.clientSecret &&
      primeecoConfig.username &&
      primeecoConfig.password,
  )
}
