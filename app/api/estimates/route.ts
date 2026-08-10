import { NextResponse } from "next/server"
import { getEstimatesData } from "@/lib/primeeco/estimates"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page")) || 1)
  const data = await getEstimatesData(page)
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
