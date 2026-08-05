"use client"

import { fmtNumber } from "@/lib/format"

export interface Column {
  label: string
  value: number
  color?: string
}

/** Vertical column chart with value labels on top and category labels below. */
export function ColumnChart({ data, height = 200 }: { data: Column[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="flex items-end justify-between gap-3" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center gap-2">
          <span className="text-base font-bold tabular-nums text-slate-900">{fmtNumber(d.value)}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-lg transition-all duration-500"
              style={{ height: `${Math.max(3, (d.value / max) * 100)}%`, background: d.color ?? "#2a78d6" }}
              title={`${d.label}: ${fmtNumber(d.value)}`}
            />
          </div>
          <span className="text-center text-xs font-medium leading-tight text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
