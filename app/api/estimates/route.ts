import { NextResponse } from "next/server"
import { getEstimatesData } from "@/lib/primeeco/estimates"

export const dynamic = "force-dynamic"

export async function GET() {
  const data = await getEstimatesData()
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
