"use client"

import { fmtNumber } from "@/lib/format"

export interface MiniDonutDatum {
  label: string
  value: number
  color: string
}

/**
 * Compact donut for small-multiples (a row of per-assignee pies). No legend of
 * its own — the caller shows one shared legend for all the donuts. Clickable.
 */
export function MiniDonut({
  data,
  title,
  size = 118,
  onClick,
}: {
  data: MiniDonutDatum[]
  title?: string
  size?: number
  onClick?: () => void
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = 2

  let offset = 0
  const segs = data.map((d) => {
    const frac = d.value / total
    const len = Math.max(0, frac * c - gap)
    const s = { ...d, dash: `${len} ${c - len}`, off: -offset }
    offset += frac * c
    return s
  })

  const Wrap = onClick ? "button" : "div"
  return (
    <Wrap
      {...(onClick ? { onClick, type: "button" as const } : {})}
      className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 ${onClick ? "transition-colors hover:bg-slate-50" : ""}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
          {segs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={s.dash}
              strokeDashoffset={s.off}
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${fmtNumber(s.value)}`}</title>
            </circle>
          ))}
        </g>
        <text x="50%" y="53%" textAnchor="middle" style={{ fontSize: 20, fontWeight: 800, fill: "#0f172a" }}>
          {fmtNumber(total)}
        </text>
      </svg>
      {title && <span className="max-w-[130px] truncate text-center text-sm font-semibold text-slate-700">{title}</span>}
    </Wrap>
  )
}
