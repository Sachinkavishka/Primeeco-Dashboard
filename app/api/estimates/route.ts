import { NextResponse } from "next/server"
import { getEstimatesData } from "@/lib/primeeco/estimates"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const data = await getEstimatesData()
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
