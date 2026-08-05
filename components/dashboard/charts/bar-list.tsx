"use client"

import { fmtMoneyCompact, fmtNumber } from "@/lib/format"

export interface BarItem {
  name: string
  count: number
  value: number
}

/**
 * Ranked horizontal bar list. Rows are clickable (drill-down) unless the row is
 * the aggregate "+N others" bucket. Bar length encodes count (sequential blue).
 */
export function BarList({
  items,
  limit = 7,
  color = "#2a78d6",
  onSelect,
}: {
  items: BarItem[]
  limit?: number
  color?: string
  onSelect?: (name: string) => void
}) {
  const shown = items.slice(0, limit)
  const rest = items.slice(limit)
  const others =
    rest.length > 0
      ? {
          name: `+${rest.length} others`,
          count: rest.reduce((a, b) => a + b.count, 0),
          value: rest.reduce((a, b) => a + b.value, 0),
        }
      : null

  const max = Math.max(1, ...items.map((i) => i.count))
  const rows = others ? [...shown, others] : shown

  return (
    <ul className="space-y-2.5">
      {rows.map((item) => {
        const isOthers = others != null && item === others
        const clickable = onSelect && !isOthers
        const Row = clickable ? "button" : "div"
        return (
          <li key={item.name}>
            <Row
              {...(clickable ? { onClick: () => onSelect!(item.name), type: "button" as const } : {})}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors ${
                clickable ? "cursor-pointer hover:bg-slate-50" : ""
              }`}
            >
              <span className="w-36 shrink-0 truncate text-sm font-medium text-slate-700" title={item.name}>
                {item.name}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(item.count / max) * 100}%`, background: isOthers ? "#cbd5e1" : color }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                {fmtNumber(item.count)}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {fmtMoneyCompact(item.value)}
              </span>
            </Row>
          </li>
        )
      })}
      {rows.length === 0 && <li className="text-sm text-slate-400">No data</li>}
    </ul>
  )
}
