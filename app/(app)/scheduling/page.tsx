import { getSchedulingData } from "@/lib/scheduling"
import { SchedulingView } from "@/components/scheduling/scheduling-view"

export const dynamic = "force-dynamic"
// Joins the estimates snapshot (large) with the Connecteam roster — allow time.
export const maxDuration = 60

export default async function SchedulingPage() {
  const data = await getSchedulingData()
  return <SchedulingView initial={data} />
}
