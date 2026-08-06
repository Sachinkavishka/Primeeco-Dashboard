import { getEstimatesData } from "@/lib/primeeco/estimates"
import { EstimatesView } from "@/components/estimates/estimates-view"

export const dynamic = "force-dynamic"
// The estimates snapshot is large; allow more time than the 10s default.
export const maxDuration = 60

export default async function EstimatesPage() {
  const data = await getEstimatesData()
  return <EstimatesView initial={data} />
}
