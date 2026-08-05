"use client"

import { fmtNumber } from "@/lib/format"
import type { MapShape } from "./region-maps"

const EMPTY = "#eef2f7"
const LOW = "#cde2fb" // blue 100
const HIGH = "#184f95" // blue 600

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

function fillFor(count: number, max: number): string {
  if (count <= 0) return EMPTY
  return hexLerp(LOW, HIGH, max > 0 ? count / max : 0)
}

interface ActDot {
  cx: number
  cy: number
  r: number
  labelX: number
  labelY: number
}

/**
 * Reusable choropleth: SVG shapes shaded by a per-code count, with the code +
 * count labelled on each cell. Cells with jobs are clickable (drill-down).
 */
export function ChoroplethMap({
  shapes,
  counts,
  viewBox,
  onSelect,
  actDot,
  actCode = "ACT",
  height = 300,
}: {
  shapes: MapShape[]
  counts: Record<string, number>
  viewBox: string
  onSelect?: (code: string) => void
  actDot?: ActDot
  actCode?: string
  height?: number
}) {
  const max = Math.max(1, ...shapes.map((s) => counts[s.code] ?? 0), actDot ? counts[actCode] ?? 0 : 0)

  const cell = (shape: MapShape) => {
    const count = counts[shape.code] ?? 0
    const fill = fillFor(count, max)
    const ratio = count / max
    const textColor = ratio > 0.45 ? "#ffffff" : "#334155"
    const clickable = onSelect && count > 0
    return (
      <g
        key={shape.code}
        onClick={clickable ? () => onSelect!(shape.code) : undefined}
        style={{ cursor: clickable ? "pointer" : "default" }}
      >
        <path d={shape.d} fill={fill} stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round">
          <title>{`${shape.name}: ${fmtNumber(count)} jobs`}</title>
        </path>
        <text x={shape.labelX} y={shape.labelY - 4} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: textColor }}>
          {shape.code}
        </text>
        <text x={shape.labelX} y={shape.labelY + 20} textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: textColor }}>
          {fmtNumber(count)}
        </text>
      </g>
    )
  }

  return (
    <div>
      <svg viewBox={viewBox} width="100%" height={height} preserveAspectRatio="xMidYMid meet">
        {shapes.map(cell)}
        {actDot &&
          (() => {
            const count = counts[actCode] ?? 0
            const clickable = onSelect && count > 0
            return (
              <g
                onClick={clickable ? () => onSelect!(actCode) : undefined}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <circle cx={actDot.cx} cy={actDot.cy} r={actDot.r} fill={fillFor(count, max)} stroke="#fff" strokeWidth={2}>
                  <title>{`ACT: ${fmtNumber(count)} jobs`}</title>
                </circle>
                <text x={actDot.labelX} y={actDot.labelY} style={{ fontSize: 16, fontWeight: 700, fill: "#64748b" }}>
                  ACT {fmtNumber(count)}
                </text>
              </g>
            )
          })()}
      </svg>

      {/* legend */}
      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-400">
        <span>fewer</span>
        <span className="h-3 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${LOW}, ${HIGH})` }} />
        <span>more jobs</span>
      </div>
    </div>
  )
}
