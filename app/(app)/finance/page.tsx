import { getFinanceData } from "@/lib/primeeco/finance"
import { FinanceView } from "@/components/finance/finance-view"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function FinancePage() {
  const data = await getFinanceData()
  return <FinanceView initial={data} />
}
