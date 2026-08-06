"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Banknote,
  CalendarDays,
  CalendarRange,
  Clock,
  Coins,
  Gauge,
  Sun,
  TrendingUp,
} from "lucide-react"
import type { FinanceData, FinancePoint } from "@/lib/primeeco/finance"
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { Panel } from "@/components/dashboard/panel"
import { NavTabs } from "@/components/nav-tabs"
import { catColor } from "@/components/dashboard/charts/palette"
import { useCountUp } from "./use-count-up"

const REFRESH_MS = 120_000

export function FinanceView({ initial }: { initial: FinanceData }) {
  const [data, setData] = useState(initial)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/finance", { cache: "no-store" })
        if (res.ok) setData((await res.json()) as FinanceData)
      } catch {
        /* keep last good */
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const t = data.totals

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 px-7 py-6 text-white shadow-lg shadow-emerald-600/20">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Financial Dashboard</h1>
          <p className="mt-1 text-sm text-emerald-100">Invoiced revenue · ex-GST · matches PrimeEco receivables</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NavTabs />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              data.live ? "bg-emerald-300/25 text-white" : "bg-amber-300/25 text-white"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${data.live ? "bg-emerald-200 animate-pulse" : "bg-amber-200"}`} />
            {data.live ? "LIVE" : "SAMPLE"}
          </span>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Clock className="h-4 w-4 text-emerald-200" />
            {fmtTime(data.generatedAt)}
          </div>
        </div>
      </header>

      {/* Headline earnings */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MoneyTile label="Invoiced — All Time" value={t.allTime} icon={Banknote} tint="emerald" big />
        <MoneyTile label="Invoiced — This Year" value={t.thisYear} icon={CalendarRange} tint="teal" big />
        <MoneyTile label="Invoiced — This Month" value={t.thisMonth} icon={CalendarDays} tint="blue" big />
        <MoneyTile label="Invoiced — Today" value={t.today} icon={Sun} tint="amber" big />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MoneyTile label="Collected (paid)" value={t.earned} icon={Coins} tint="green" />
        <MoneyTile label="Forecast — Next 3 Mo" value={data.forecastTotal} icon={TrendingUp} tint="violet" />
        <MoneyTile label="Avg per Invoice" value={t.avgPerJob} icon={Gauge} tint="blue" />
        <CountTile label="Invoices" value={t.jobCount} icon={CalendarDays} />
      </div>

      {/* Monthly revenue + forecast */}
      <div className="mt-5">
        <Panel title="Monthly Invoiced Revenue & Forecast" subtitle="invoiced ex-GST · last 12 months + 3-month projection">
          <RevenueForecastChart monthly={data.monthly} mounted={mounted} />
        </Panel>
      </div>

      {/* By year + by client */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Revenue by Year" subtitle="ex-GST">
          <YearBars data={data.byYear} mounted={mounted} />
        </Panel>
        <Panel title="Top Clients by Revenue" subtitle="ex-GST · top 10">
          <ClientBars data={data.byClient.slice(0, 10)} mounted={mounted} />
        </Panel>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        All figures ex-GST · from receivable invoices (excl. Draft/Cancelled) · by invoiced date · matches PrimeEco
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- tiles --- */

const TINTS = {
  emerald: "bg-emerald-100 text-emerald-600",
  teal: "bg-teal-100 text-teal-600",
  blue: "bg-blue-100 text-blue-600",
  amber: "bg-amber-100 text-amber-600",
  green: "bg-green-100 text-green-600",
  violet: "bg-violet-100 text-violet-600",
} as const

function MoneyTile({
  label,
  value,
  icon: Icon,
  tint,
  big = false,
}: {
  label: string
  value: number
  icon: LucideIcon
  tint: keyof typeof TINTS
  big?: boolean
}) {
  const v = useCountUp(value)
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${TINTS[tint]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`mt-2 font-extrabold tabular-nums text-slate-900 ${big ? "text-4xl" : "text-2xl"}`}>
        {fmtMoneyCompact(v)}
      </div>
      <div className="mt-0.5 text-xs text-slate-400">{fmtMoney(Math.round(value))}</div>
    </div>
  )
}

function CountTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  const v = useCountUp(value)
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{fmtNumber(Math.round(v))}</div>
    </div>
  )
}

/* -------------------------------------------------------- year columns --- */

function YearBars({ data, mounted }: { data: { year: number; value: number; count: number }[]; mounted: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-56 items-end justify-between gap-4">
      {data.map((d, i) => (
        <div key={d.year} className="flex h-full flex-1 flex-col items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-slate-900">{fmtMoneyCompact(d.value)}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-xl transition-[height] duration-1000 ease-out"
              style={{ height: mounted ? `${Math.max(2, (d.value / max) * 100)}%` : "0%", background: catColor(i) }}
              title={`${d.year}: ${fmtMoney(d.value)} · ${d.count} jobs`}
            />
          </div>
          <span className="text-sm font-semibold text-slate-500">{d.year}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-slate-400">No data</p>}
    </div>
  )
}

/* ------------------------------------------------------- client bars ----- */

function ClientBars({ data, mounted }: { data: { name: string; value: number; count: number }[]; mounted: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-700" title={d.name}>
            {d.name}
          </span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out"
              style={{ width: mounted ? `${(d.value / max) * 100}%` : "0%", background: catColor(i % 8) }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
            {fmtMoneyCompact(d.value)}
          </span>
        </li>
      ))}
      {data.length === 0 && <li className="text-sm text-slate-400">No data</li>}
    </ul>
  )
}

/* -------------------------------------------------- revenue + forecast --- */

function RevenueForecastChart({ monthly, mounted }: { monthly: FinancePoint[]; mounted: boolean }) {
  const W = 720
  const H = 260
  const padX = 20
  const padTop = 28
  const padBottom = 32
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom

  const max = Math.max(1, ...monthly.map((p) => p.value))
  const stepX = monthly.length > 1 ? plotW / (monthly.length - 1) : 0
  const pts = monthly.map((p, i) => ({
    ...p,
    x: padX + i * stepX,
    y: padTop + plotH - (p.value / max) * plotH,
  }))

  const firstForecastIdx = pts.findIndex((p) => p.projected)
  const actual = firstForecastIdx === -1 ? pts : pts.slice(0, firstForecastIdx)
  // Forecast line starts at the last actual point so it connects.
  const forecast = firstForecastIdx === -1 ? [] : pts.slice(firstForecastIdx - 1)

  const line = (ps: typeof pts) => ps.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const actualLine = line(actual)
  const actualArea = `${actualLine} L ${actual[actual.length - 1]?.x ?? padX} ${padTop + plotH} L ${padX} ${padTop + plotH} Z`
  const divider = forecast.length ? (forecast[0].x + forecast[1].x) / 2 : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line x1={padX} y1={padTop + plotH} x2={W - padX} y2={padTop + plotH} stroke="#e2e8f0" strokeWidth="1" />

      {/* forecast region shading + divider */}
      {divider != null && (
        <>
          <rect x={divider} y={padTop} width={W - padX - divider} height={plotH} fill="#8b5cf6" opacity="0.05" />
          <line x1={divider} y1={padTop} x2={divider} y2={padTop + plotH} stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="4 4" />
          <text x={divider + 6} y={padTop + 12} style={{ fontSize: 11, fontWeight: 700, fill: "#8b5cf6" }}>
            forecast
          </text>
        </>
      )}

      {/* actual area + line (draws in on mount) */}
      <path d={actualArea} fill="url(#revFill)" opacity={mounted ? 1 : 0} style={{ transition: "opacity 1s ease-out" }} />
      <path
        d={actualLine}
        fill="none"
        stroke="#059669"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={mounted ? 0 : 1}
        style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
      />

      {/* forecast line (dashed) */}
      {forecast.length > 0 && (
        <path
          d={line(forecast)}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          strokeLinecap="round"
          opacity={mounted ? 1 : 0}
          style={{ transition: "opacity 0.8s ease-out 0.8s" }}
        />
      )}

      {/* points + month labels */}
      {pts.map((p) => (
        <g key={p.key}>
          <circle
            cx={p.x}
            cy={p.y}
            r={4}
            fill={p.projected ? "#8b5cf6" : "#059669"}
            stroke="#fff"
            strokeWidth="2"
            opacity={mounted ? 1 : 0}
            style={{ transition: "opacity 0.6s ease-out 0.6s" }}
          >
            <title>{`${p.label}: ${fmtMoney(p.value)}${p.projected ? " (forecast)" : ""}`}</title>
          </circle>
          <text x={p.x} y={H - 10} textAnchor="middle" style={{ fontSize: 10, fill: p.projected ? "#8b5cf6" : "#94a3b8" }}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
