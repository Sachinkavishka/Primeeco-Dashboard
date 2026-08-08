"use client"

import { useEffect, useState } from "react"
import { fmtNumber } from "@/lib/format"

export interface AnimatedDonutDatum {
  label: string
  value: number
  color: string
}

/**
 * Donut that reveals its segments ONE AT A TIME (every `secPer` seconds), the
 * newly-revealed segment popping/zooming in, with the current status shown big
 * in the centre. Built for the slideshow so a pie animates status-by-status.
 */
export function AnimatedDonut({
  data,
  size = 360,
  secPer = 2,
}: {
  data: AnimatedDonutDatum[]
  size?: number
  secPer?: number
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const [n, setN] = useState(1)

  useEffect(() => {
    setN(1)
    if (data.length <= 1) return
    const id = setInterval(() => setN((v) => (v >= data.length ? v : v + 1)), secPer * 1000)
    return () => clearInterval(id)
  }, [data, secPer])

  const stroke = 30
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = 2

  let offset = 0
  const segs = data.map((d) => {
    const frac = d.value / total
    const len = Math.max(0, frac * c - gap)
    const s = { ...d, dash: `${len} ${c - len}`, off: -offset, frac }
    offset += frac * c
    return s
  })

  const shown = segs.slice(0, n)
  const current = segs[Math.min(n, segs.length) - 1]

  return (
    <div className="flex flex-col items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
          {shown.map((s, idx) => {
            const isCurrent = idx === n - 1
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={isCurrent ? stroke + 9 : stroke}
                strokeDasharray={s.dash}
                strokeDashoffset={s.off}
                strokeLinecap="butt"
                style={{ transition: "stroke-width 0.45s ease" }}
              />
            )
          })}
        </g>
        {/* centre: current status (re-keyed so it pops each step) */}
        <g key={n} className="pop-zoom">
          <text x="50%" y="45%" textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: current?.color ?? "#0f172a" }}>
            {current?.label ?? ""}
          </text>
          <text x="50%" y="57%" textAnchor="middle" style={{ fontSize: 34, fontWeight: 800, fill: "#0f172a" }}>
            {fmtNumber(current?.value ?? 0)}
          </text>
          <text x="50%" y="66%" textAnchor="middle" style={{ fontSize: 14, fill: "#94a3b8" }}>
            {Math.round((current?.frac ?? 0) * 100)}%
          </text>
        </g>
      </svg>

      {/* legend — items brighten as they're revealed */}
      <div className="flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2">
        {data.map((d, idx) => (
          <span
            key={d.label}
            className="inline-flex items-center gap-2 text-base transition-opacity duration-500"
            style={{ opacity: idx < n ? 1 : 0.28 }}
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-700">{d.label}</span>
            <b className="tabular-nums text-slate-900">{fmtNumber(d.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}
