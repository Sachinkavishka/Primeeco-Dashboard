import { EstimatesView } from "@/components/estimates/estimates-view"

// Renders instantly (no server-side PrimeEco fetch); the view loads estimate
// pages client-side, so there is no SSR request that can time out.
export const dynamic = "force-dynamic"

export default function EstimatesPage() {
  return <EstimatesView />
}
