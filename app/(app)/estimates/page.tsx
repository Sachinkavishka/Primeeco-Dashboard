import { getEstimatesData } from "@/lib/primeeco/estimates"
import { EstimatesView } from "@/components/estimates/estimates-view"

export const dynamic = "force-dynamic"

export default async function EstimatesPage() {
  const data = await getEstimatesData()
  return <EstimatesView initial={data} />
}
