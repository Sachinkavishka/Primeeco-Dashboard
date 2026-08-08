import { NextResponse } from "next/server"

const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function passcode() {
  return process.env.FINANCE_PASSCODE || "detail"
}

/** Verify the management passcode and set the unlock cookies. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { passcode?: string }
  if (!body.passcode || body.passcode !== passcode()) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set("dfm_fin", body.passcode, { httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE })
  res.cookies.set("dfm_fin_ok", "1", { httpOnly: false, sameSite: "lax", path: "/", maxAge: MAX_AGE })
  return res
}

/** Lock again — clear the cookies. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set("dfm_fin", "", { path: "/", maxAge: 0 })
  res.cookies.set("dfm_fin_ok", "", { path: "/", maxAge: 0 })
  return res
}
