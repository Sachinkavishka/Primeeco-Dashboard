import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  label: string
  value: string
  sublabel?: string
  icon: LucideIcon
  /** Tailwind text color for the accent (icon + value tint). */
  accent?: string
}

/** A single headline metric tile, sized large for wall-display legibility. */
export function KpiCard({ label, value, sublabel, icon: Icon, accent = "text-sky-400" }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between min-h-[130px]">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium uppercase tracking-wider text-slate-400">{label}</span>
        <Icon className={cn("h-5 w-5 shrink-0", accent)} />
      </div>
      <div>
        <div className={cn("text-3xl font-bold tabular-nums leading-tight", accent)}>{value}</div>
        {sublabel && <div className="mt-1 text-xs text-slate-500">{sublabel}</div>}
      </div>
    </div>
  )
}
