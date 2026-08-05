import "server-only"
import { primeecoConfig } from "./config"

/**
 * Low-level PrimeEco API client: OAuth token management + rate-limit-aware fetch.
 *
 * Token is cached in module scope (per serverless instance) and refreshed a
 * little before expiry. This is intentionally simple; if you later need
 * cross-instance token sharing, back this with Supabase/Redis.
 */

interface CachedToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number // epoch ms
}

let cachedToken: CachedToken | null = null
let inflightToken: Promise<CachedToken> | null = null

const TOKEN_SAFETY_WINDOW_MS = 60_000 // refresh 1 min before expiry

async function requestToken(): Promise<CachedToken> {
  if (primeecoConfig.staticToken) {
    return {
      accessToken: primeecoConfig.staticToken,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }
  }

  const res = await fetch(`${primeecoConfig.apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "password",
      username: primeecoConfig.username,
      password: primeecoConfig.password,
      client_id: primeecoConfig.clientId,
      client_secret: primeecoConfig.clientSecret,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PrimeEco OAuth failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  const expiresInMs = (json.expires_in ?? 3600) * 1000
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + expiresInMs,
  }
}

async function getToken(): Promise<string> {
  const valid = cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_WINDOW_MS > Date.now()
  if (valid) return cachedToken!.accessToken

  // De-dupe concurrent token requests.
  if (!inflightToken) {
    inflightToken = requestToken()
      .then((t) => {
        cachedToken = t
        return t
      })
      .finally(() => {
        inflightToken = null
      })
  }
  const t = await inflightToken
  return t.accessToken
}

export interface ApiFetchOptions {
  searchParams?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

/** Fetch a v2 JSON resource, handling auth headers and one 401 retry. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const url = new URL(`${primeecoConfig.apiUrl}${path.startsWith("/") ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(opts.searchParams ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
  }

  const doFetch = async (token: string) =>
    fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: primeecoConfig.acceptHeader,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: opts.signal,
    })

  let token = await getToken()
  let res = await doFetch(token)

  // Token expired/revoked mid-flight — clear cache and retry once.
  if (res.status === 401) {
    cachedToken = null
    token = await getToken()
    res = await doFetch(token)
  }

  if (res.status === 429) {
    const reset = res.headers.get("x-ratelimit-minute-reset")
    throw new Error(`PrimeEco rate limit hit (429). Retry after ${reset ?? "?"}s.`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PrimeEco ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }

  return (await res.json()) as T
}

/** Reset cached auth state — used by tests and on credential changes. */
export function _resetPrimeecoAuth() {
  cachedToken = null
  inflightToken = null
}
