import { getDashboardData } from "@/lib/primeeco"
import { DashboardView } from "@/components/dashboard/dashboard-view"

// Wall display: always render fresh on load; the client then polls every 60s.
export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardView initial={data} />
}
