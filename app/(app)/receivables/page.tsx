import { getReceivablesData } from "@/lib/primeeco/receivables"
import { ReceivablesView } from "@/components/receivables/receivables-view"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function ReceivablesPage() {
  const data = await getReceivablesData()
  return <ReceivablesView initial={data} />
}
