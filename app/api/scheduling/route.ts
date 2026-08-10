import { NextResponse } from "next/server"
import { getSchedulingData } from "@/lib/scheduling"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const data = await getSchedulingData()
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
