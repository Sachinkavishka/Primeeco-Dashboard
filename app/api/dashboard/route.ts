import { NextResponse } from "next/server"
import { getDashboardData } from "@/lib/primeeco"

/**
 * Polling endpoint for the wall-display dashboard. Always dynamic — never
 * cached — so the display sees fresh numbers on every interval.
 *
 * NOTE: login is currently disabled for the open office wall display. When an
 * access model is chosen, re-add a guard here (Supabase session or a shared
 * access code) before returning data.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const data = await getDashboardData()
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  })
}
