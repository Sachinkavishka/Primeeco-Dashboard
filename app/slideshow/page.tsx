import { getDashboardData } from "@/lib/primeeco"
import { SlideshowView } from "@/components/slideshow/slideshow-view"

export const dynamic = "force-dynamic"

export default async function SlideshowPage() {
  const data = await getDashboardData()
  return <SlideshowView initial={data} />
}
