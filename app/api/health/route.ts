import { NextResponse } from "next/server"
import { primeecoConfig, isPrimeecoConfigured } from "@/lib/primeeco/config"

/**
 * TEMPORARY diagnostic endpoint. Reports whether the PrimeEco env vars are
 * present in the Vercel runtime and whether the OAuth token call succeeds —
 * WITHOUT exposing any secret values (only booleans, lengths, and the API's
 * own error text). Remove once the live connection is confirmed.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const present = {
    PRIMEECO_API_URL: Boolean(process.env.PRIMEECO_API_URL),
    PRIMEECO_CLIENT_ID: Boolean(process.env.PRIMEECO_CLIENT_ID),
    PRIMEECO_CLIENT_SECRET: Boolean(process.env.PRIMEECO_CLIENT_SECRET),
    PRIMEECO_USERNAME: Boolean(process.env.PRIMEECO_USERNAME),
    PRIMEECO_PASSWORD: Boolean(process.env.PRIMEECO_PASSWORD),
  }

  // Expected lengths: clientId 36, clientSecret 40, username 30, password 13.
  // A mismatch (e.g. password 14) usually means a trailing space/newline.
  const lengths = {
    clientId: (process.env.PRIMEECO_CLIENT_ID ?? "").length,
    clientSecret: (process.env.PRIMEECO_CLIENT_SECRET ?? "").length,
    username: (process.env.PRIMEECO_USERNAME ?? "").length,
    password: (process.env.PRIMEECO_PASSWORD ?? "").length,
  }

  let tokenTest = "not attempted (not configured)"
  if (isPrimeecoConfigured()) {
    try {
      const body = new URLSearchParams({
        grant_type: "password",
        username: primeecoConfig.username,
        password: primeecoConfig.password,
        client_id: primeecoConfig.clientId,
        client_secret: primeecoConfig.clientSecret,
      })
      const r = await fetch(`${primeecoConfig.apiUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: primeecoConfig.acceptHeader,
        },
        body,
        cache: "no-store",
      })
      const text = await r.text()
      tokenTest = r.ok
        ? "OK — token received"
        : `FAILED ${r.status}: ${text.slice(0, 200)}`
    } catch (e) {
      tokenTest = `ERROR: ${e instanceof Error ? e.message : "unknown"}`
    }
  }

  return NextResponse.json({
    configured: isPrimeecoConfigured(),
    apiUrl: primeecoConfig.apiUrl,
    present,
    lengths,
    tokenTest,
  })
}
