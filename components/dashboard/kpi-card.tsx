import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  label: string
  value: string
  sublabel?: string
  icon: LucideIcon
  /** One of the tint keys below — sets the icon chip + number colour. */
  tint?: keyof typeof TINTS
}

const TINTS = {
  blue: { chip: "bg-blue-100 text-blue-600", value: "text-blue-700", bar: "bg-blue-500" },
  orange: { chip: "bg-orange-100 text-orange-600", value: "text-orange-700", bar: "bg-orange-500" },
  green: { chip: "bg-emerald-100 text-emerald-600", value: "text-emerald-700", bar: "bg-emerald-500" },
  violet: { chip: "bg-violet-100 text-violet-600", value: "text-violet-700", bar: "bg-violet-500" },
  amber: { chip: "bg-amber-100 text-amber-600", value: "text-amber-700", bar: "bg-amber-500" },
  teal: { chip: "bg-teal-100 text-teal-600", value: "text-teal-700", bar: "bg-teal-500" },
  rose: { chip: "bg-rose-100 text-rose-600", value: "text-rose-700", bar: "bg-rose-500" },
} as const

/** A headline metric tile, sized large for wall-display legibility. */
export function KpiCard({ label, value, sublabel, icon: Icon, tint = "blue" }: KpiCardProps) {
  const t = TINTS[tint]
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <span className={`absolute left-0 top-0 h-full w-1.5 ${t.bar}`} />
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${t.chip}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`mt-3 text-4xl font-extrabold tracking-tight tabular-nums ${t.value}`}>{value}</div>
      {sublabel && <div className="mt-1 text-sm text-slate-400">{sublabel}</div>}
    </div>
  )
}
