import type { StatusBreakdownItem } from "@/lib/primeeco/types"
import { fmtMoneyCompact, fmtNumber } from "@/lib/format"
import { statusColor } from "./status-colors"
import { Panel } from "./panel"

/** Horizontal bar list of job counts per status, with value totals. */
export function StatusBreakdown({ items }: { items: StatusBreakdownItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.count))

  return (
    <Panel title="Jobs by Status" subtitle={`${items.length} statuses`}>
      <div className="space-y-3">
        {items.map((item) => {
          const c = statusColor(item.status)
          return (
            <div key={item.status}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-slate-200">{item.status}</span>
                <span className="tabular-nums text-slate-400">
                  <span className="text-slate-100 font-semibold">{fmtNumber(item.count)}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  {fmtMoneyCompact(item.value)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.bar} transition-all duration-500`}
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
