"use client"

import { fmtNumber } from "@/lib/format"

export interface DonutDatum {
  label: string
  value: number
  color: string
}

/**
 * Donut chart with a clickable legend. Segments are drawn with stroke-dasharray
 * arcs (with a small gap between them). Clicking a legend row calls onSelect.
 */
export function DonutChart({
  data,
  centerLabel,
  onSelect,
  size = 180,
}: {
  data: DonutDatum[]
  centerLabel?: string
  onSelect?: (label: string) => void
  size?: number
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = 2 // px gap between segments

  let offset = 0
  const segments = data.map((d) => {
    const frac = d.value / total
    const len = Math.max(0, frac * c - gap)
    const seg = { ...d, dash: `${len} ${c - len}`, dashoffset: -offset, frac }
    offset += frac * c
    return seg
  })

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
          {segments.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={s.dash}
              strokeDashoffset={s.dashoffset}
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${fmtNumber(s.value)} (${Math.round(s.frac * 100)}%)`}</title>
            </circle>
          ))}
        </g>
        <text x="50%" y="46%" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 800 }}>
          {fmtNumber(total)}
        </text>
        {centerLabel && (
          <text x="50%" y="60%" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 12, fontWeight: 600 }}>
            {centerLabel}
          </text>
        )}
      </svg>

      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {data.map((d) => {
          const pct = Math.round((d.value / total) * 100)
          const Row = onSelect ? "button" : "div"
          return (
            <li key={d.label}>
              <Row
                {...(onSelect ? { onClick: () => onSelect(d.label), type: "button" as const } : {})}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left ${
                  onSelect ? "hover:bg-slate-50" : ""
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="flex-1 truncate text-sm text-slate-700">{d.label}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{fmtNumber(d.value)}</span>
                <span className="w-9 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
              </Row>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
