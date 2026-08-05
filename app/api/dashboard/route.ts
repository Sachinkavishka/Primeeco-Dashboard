import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData } from "@/lib/primeeco"

/**
 * Polling endpoint for the wall-display dashboard. Auth-guarded (Supabase) so
 * PrimeEco data is only served to signed-in sessions. Always dynamic — never
 * cached — so the display sees fresh numbers on every interval.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const data = await getDashboardData()
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  })
}
