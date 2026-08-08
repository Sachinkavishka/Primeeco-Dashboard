import { NextResponse, type NextRequest } from "next/server"

/**
 * Gate financial pages behind a passcode so the public wall display shows
 * Operations only. Management unlocks once (passcode set via FINANCE_PASSCODE)
 * to view Financial / Receivable / Estimates. No per-user login.
 *
 * The httpOnly `dfm_fin` cookie (checked here) equals the passcode; a readable
 * `dfm_fin_ok` cookie just tells the nav to reveal the financial tabs.
 */

const PROTECTED_PAGES = ["/finance", "/receivables", "/estimates"]
const PROTECTED_API = ["/api/finance", "/api/receivables", "/api/estimates"]

function passcode() {
  return process.env.FINANCE_PASSCODE || "detail"
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPage = PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isApi = PROTECTED_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!isPage && !isApi) return NextResponse.next()

  const authed = req.cookies.get("dfm_fin")?.value === passcode()
  if (authed) return NextResponse.next()

  if (isApi) return NextResponse.json({ error: "locked" }, { status: 401 })

  const url = req.nextUrl.clone()
  url.pathname = "/unlock"
  url.searchParams.set("next", pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    "/finance/:path*",
    "/receivables/:path*",
    "/estimates/:path*",
    "/api/finance/:path*",
    "/api/receivables/:path*",
    "/api/estimates/:path*",
  ],
}
