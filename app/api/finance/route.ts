import { NextResponse } from "next/server"
import { getFinanceData } from "@/lib/primeeco/finance"

/** Polling endpoint for the financial dashboard (shares the cached PrimeEco data). */
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const data = await getFinanceData()
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
