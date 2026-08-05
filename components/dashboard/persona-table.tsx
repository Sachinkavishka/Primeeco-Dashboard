import type { PersonaBreakdownItem } from "@/lib/primeeco/types"
import { fmtMoneyCompact, fmtNumber } from "@/lib/format"
import { Panel } from "./panel"

interface PersonaTableProps {
  title: string
  items: PersonaBreakdownItem[]
  /** Cap rows so a wall panel stays glanceable; remainder folds into "Others". */
  limit?: number
}

/** Ranked people/entity breakdown (estimator, case manager, assignee, region). */
export function PersonaTable({ title, items, limit = 6 }: PersonaTableProps) {
  const shown = items.slice(0, limit)
  const rest = items.slice(limit)
  const maxCount = Math.max(1, ...items.map((i) => i.count))

  if (rest.length) {
    shown.push({
      name: `+${rest.length} others`,
      count: rest.reduce((a, b) => a + b.count, 0),
      value: rest.reduce((a, b) => a + b.value, 0),
    })
  }

  return (
    <Panel title={title} subtitle={`${items.length} total`}>
      <ul className="space-y-2.5">
        {shown.map((item) => (
          <li key={item.name} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-slate-200" title={item.name}>
              {item.name}
            </span>
            <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500/80"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">
              {fmtNumber(item.count)}
            </span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
              {fmtMoneyCompact(item.value)}
            </span>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-slate-500">No data</li>}
      </ul>
    </Panel>
  )
}
