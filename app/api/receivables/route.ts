import { NextResponse } from "next/server"
import { getReceivablesData } from "@/lib/primeeco/receivables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const data = await getReceivablesData()
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
