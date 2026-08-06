import type { TrendPoint } from "@/lib/primeeco/types"
import { fmtNumber } from "@/lib/format"

/**
 * Area + line chart of jobs created per month. Pure SVG, scales to width via
 * viewBox. The most recent point is emphasised with a filled marker + label.
 */
export function TrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const W = 640
  const H = height
  const padX = 16
  const padTop = 24
  const padBottom = 28
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom

  const max = Math.max(1, ...data.map((d) => d.count))
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0

  const pts = data.map((d, i) => ({
    ...d,
    x: padX + i * stepX,
    y: padTop + plotH - (d.count / max) * plotH,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${linePath} L ${pts[pts.length - 1]?.x ?? padX} ${padTop + plotH} L ${padX} ${padTop + plotH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a78d6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2a78d6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* baseline */}
      <line x1={padX} y1={padTop + plotH} x2={W - padX} y2={padTop + plotH} stroke="#e2e8f0" strokeWidth="1" />

      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="#2a78d6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {pts.map((p, i) => (
        <g key={p.month}>
          {/* count label above every point */}
          <text x={p.x} y={p.y - 10} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#1e293b" }}>
            {fmtNumber(p.count)}
          </text>
          <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3.5} fill="#2a78d6" stroke="#fff" strokeWidth="2">
            <title>{`${p.label}: ${fmtNumber(p.count)} jobs`}</title>
          </circle>
          <text x={p.x} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: "#94a3b8" }}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
