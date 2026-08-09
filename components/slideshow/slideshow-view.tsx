"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Briefcase, CheckCircle2, DollarSign, Gauge, PlusCircle, TrendingUp, Wallet } from "lucide-react"
import type { DashboardData, DashboardJob } from "@/lib/primeeco/types"
import { isCompleted } from "@/lib/primeeco/aggregate"
import { fmtMoney, fmtMoneyCompact, fmtNumber } from "@/lib/format"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { AnimatedDonut } from "@/components/dashboard/charts/animated-donut"
import { DonutChart } from "@/components/dashboard/charts/donut-chart"
import { TrendChart } from "@/components/dashboard/charts/trend-chart"
import { ColumnChart } from "@/components/dashboard/charts/column-chart"
import { BarList } from "@/components/dashboard/charts/bar-list"
import { MiniDonut } from "@/components/dashboard/charts/mini-donut"
import { ChoroplethMap } from "@/components/dashboard/charts/choropleth-map"
import { JobsTable } from "@/components/dashboard/jobs-table"
import { catColor, OTHER_COLOR } from "@/components/dashboard/charts/palette"
import { AUSTRALIA_SHAPES, ACT_DOT, MELBOURNE_SHAPES, regionToState, regionToMetro, divisionToState } from "@/components/dashboard/charts/region-maps"
import { loadSlideshowConfig, SLIDESHOW_KEY, SLIDESHOW_WIDGETS, secFor, type SlideshowConfig } from "./widgets"

const REFRESH_MS = 120_000
const AGING_COLORS = ["#1baf7a", "#84cc16", "#eda100", "#eb6834", "#e34948"]

interface Slide {
  id: string
  title: string
  node: React.ReactNode
}

export function SlideshowView({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<SlideshowConfig | null>(null)

  // load widget selection/order + interval from kiosk config; sync live.
  useEffect(() => {
    setConfig(loadSlideshowConfig())
    const urlSec = Number(new URLSearchParams(window.location.search).get("sec"))
    if (urlSec && urlSec >= 3) setConfig((c) => ({ ...(c ?? loadSlideshowConfig()), sec: urlSec }))
    const onStorage = (e: StorageEvent) => {
      if (e.key === SLIDESHOW_KEY) setConfig(loadSlideshowConfig())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // live wall clock
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // --- slideshow config editing (writes localStorage; kiosk stays in sync) --
  const sc: SlideshowConfig = config ?? { widgets: SLIDESHOW_WIDGETS.map((w) => w.id), sec: 15 }
  const saveConfig = (next: SlideshowConfig) => {
    setConfig(next)
    localStorage.setItem(SLIDESHOW_KEY, JSON.stringify(next))
  }
  const labelOf = (id: string) => SLIDESHOW_WIDGETS.find((w) => w.id === id)?.label ?? id
  const moveWidget = (id: string, dir: number) => {
    const arr = [...sc.widgets]
    const idx = arr.indexOf(id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    saveConfig({ ...sc, widgets: arr })
  }
  const removeWidget = (id: string) => saveConfig({ ...sc, widgets: sc.widgets.filter((w) => w !== id) })
  const addWidget = (id: string) => saveConfig({ ...sc, widgets: [...sc.widgets, id] })
  const setDuration = (id: string, val: number) =>
    saveConfig({ ...sc, durations: { ...(sc.durations ?? {}), [id]: Math.max(3, val || 15) } })

  // poll data
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" })
        if (res.ok) setData((await res.json()) as DashboardData)
      } catch {
        /* keep last good */
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const slides = useMemo(() => {
    const all = buildSlides(data)
    if (!config) return all
    const byId = new Map(all.map((s) => [s.id, s]))
    const chosen = config.widgets.map((id) => byId.get(id)).filter((s): s is Slide => Boolean(s))
    return chosen.length ? chosen : all
  }, [data, config])

  // auto-advance — each slide waits for ITS OWN duration (per-slide time)
  const advance = useCallback((dir: number) => setI((p) => (p + dir + slides.length) % slides.length), [slides.length])
  useEffect(() => {
    if (paused || slides.length <= 1) return
    const sec = config ? secFor(config, slides[i]?.id ?? "") : 15
    const timer = setTimeout(() => advance(1), Math.max(3, sec) * 1000)
    return () => clearTimeout(timer)
  }, [i, paused, config, slides, advance])

  // keyboard: arrows navigate, space pauses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1)
      else if (e.key === "ArrowLeft") advance(-1)
      else if (e.key === " ") setPaused((v) => !v)
      else if (e.key.toLowerCase() === "s") setShowSettings((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [advance])

  useEffect(() => {
    if (i >= slides.length) setI(0)
  }, [slides.length, i])

  const slide = slides[i] ?? slides[0]

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header — brand colours (navy → orange) + Poppins */}
      <header
        className="flex items-center justify-between gap-4 bg-gradient-to-r from-[#173a5e] via-[#1f4f7d] to-[#f2682c] px-8 py-5 text-white"
        style={{ fontFamily: "var(--font-poppins), system-ui, sans-serif" }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Now showing</p>
          <h1 className="text-4xl font-extrabold tracking-tight">{slide.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              data.live ? "bg-emerald-400/20 text-emerald-100" : "bg-amber-400/20 text-amber-100"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${data.live ? "bg-emerald-300 animate-pulse" : "bg-amber-300"}`} />
            {data.live ? "LIVE" : "SAMPLE"}
          </span>
          <span className="tabular-nums text-white/80">
            {i + 1} / {slides.length}
          </span>
          {now && (
            <div className="text-right leading-tight">
              <div className="text-2xl font-extrabold tabular-nums">
                {now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div className="text-xs text-white/75">
                {now.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Slide body */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
        <div key={i} className="slide-anim w-full max-w-7xl">{slide.node}</div>

        {/* click zones for manual nav */}
        <button aria-label="Previous" onClick={() => advance(-1)} className="absolute inset-y-0 left-0 w-1/6" />
        <button aria-label="Next" onClick={() => advance(1)} className="absolute inset-y-0 right-0 w-1/6" />
      </main>

      {/* Progress dots */}
      <footer className="flex items-center justify-center gap-2 py-4">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-2.5 rounded-full transition-all ${idx === i ? "w-8 bg-blue-600" : "w-2.5 bg-slate-300 hover:bg-slate-400"}`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
        <button
          onClick={() => setPaused((v) => !v)}
          className="ml-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500"
        >
          {paused ? "▶ Play" : "⏸ Pause"}
        </button>
      </footer>

      {/* Settings button (always visible) */}
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900/85 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
        title="Slideshow settings (or press S)"
      >
        ⚙ Settings
      </button>

      {/* Settings overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Slideshow — widgets &amp; order</h2>
                <p className="text-sm text-slate-500">Pick what shows and in what order. Changes apply live.</p>
              </div>
              <label className="text-sm text-slate-600">
                Default sec{" "}
                <input
                  type="number"
                  min={3}
                  value={sc.sec}
                  onChange={(e) => saveConfig({ ...sc, sec: Math.max(3, Number(e.target.value) || 15) })}
                  className="w-14 rounded border border-slate-200 px-2 py-1 text-right"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Showing ({sc.widgets.length}) · secs per slide</p>
                <ul className="space-y-1">
                  {sc.widgets.map((id, idx) => (
                    <li key={id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-sm">
                      <span className="flex-1 truncate text-slate-700">{idx + 1}. {labelOf(id)}</span>
                      <input
                        type="number"
                        min={3}
                        value={secFor(sc, id)}
                        onChange={(e) => setDuration(id, Number(e.target.value))}
                        title="Seconds on this slide"
                        className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right"
                      />
                      <button onClick={() => moveWidget(id, -1)} className="px-1 text-slate-400 hover:text-slate-800" aria-label="Move up">↑</button>
                      <button onClick={() => moveWidget(id, 1)} className="px-1 text-slate-400 hover:text-slate-800" aria-label="Move down">↓</button>
                      <button onClick={() => removeWidget(id)} className="px-1 text-rose-400 hover:text-rose-600" aria-label="Remove">✕</button>
                    </li>
                  ))}
                  {sc.widgets.length === 0 && <li className="text-xs text-slate-400">None — showing all by default</li>}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Available</p>
                <ul className="space-y-1">
                  {SLIDESHOW_WIDGETS.filter((w) => !sc.widgets.includes(w.id)).map((w) => (
                    <li key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
                      <span className="flex-1 truncate text-slate-500">{w.label}</span>
                      <button onClick={() => addWidget(w.id)} className="rounded bg-blue-50 px-2 py-0.5 text-blue-600 hover:bg-blue-100">+ add</button>
                    </li>
                  ))}
                  {SLIDESHOW_WIDGETS.every((w) => sc.widgets.includes(w.id)) && <li className="text-xs text-slate-400">All added</li>}
                </ul>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- slides --- */

function TitledCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <h3 className="mb-4 text-xl font-bold text-slate-800">{title}</h3>
      {children}
    </div>
  )
}

/** Grouped slides: related widgets share a slide (row by row). */
function buildSlides(data: DashboardData): Slide[] {
  const { kpis } = data
  const active = data.jobs.filter((j) => !isCompleted(j))

  // status donut (top 7 + other)
  const top = data.statusBreakdown.slice(0, 7)
  const rest = data.statusBreakdown.slice(7)
  const statusDonut = top.map((s, idx) => ({ label: s.status, value: s.count, color: catColor(idx) }))
  if (rest.length) statusDonut.push({ label: "Other", value: rest.reduce((a, b) => a + b.count, 0), color: OTHER_COLOR })

  // open vs completed
  const splitDonut = [
    { label: "Open / Active", value: kpis.activeJobs, color: "#2a78d6" },
    { label: "Completed", value: kpis.completedJobs, color: "#1baf7a" },
  ]

  // assignee pies
  const statusCount = new Map<string, number>()
  for (const j of active) statusCount.set(j.status, (statusCount.get(j.status) ?? 0) + 1)
  const topStatuses = [...statusCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([s]) => s)
  const byAsg = new Map<string, DashboardJob[]>()
  for (const j of active) {
    const a = j.assignedTo ?? "Unassigned"
    ;(byAsg.get(a) ?? byAsg.set(a, []).get(a)!).push(j)
  }
  const asgPies = [...byAsg.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([name, jobs]) => {
      const m = new Map<string, number>()
      for (const j of jobs) {
        const key = topStatuses.includes(j.status) ? j.status : "Other"
        m.set(key, (m.get(key) ?? 0) + 1)
      }
      return {
        name,
        data: [...m.entries()]
          .map(([label, value]) => ({ label, value, color: label === "Other" ? OTHER_COLOR : catColor(topStatuses.indexOf(label)) }))
          .sort((a, b) => b.value - a.value),
      }
    })

  // region + division rollups (division wins so DFM-QLD lands on QLD)
  const stateCounts: Record<string, number> = {}
  const metroCounts: Record<string, number> = {}
  for (const j of data.jobs) {
    const s = divisionToState(j.division) ?? regionToState(j.region)
    if (s) stateCounts[s] = (stateCounts[s] ?? 0) + 1
    const z = regionToMetro(j.region)
    if (z) metroCounts[z] = (metroCounts[z] ?? 0) + 1
  }

  const two = "grid grid-cols-1 gap-6 lg:grid-cols-2"

  return [
    {
      id: "overview",
      title: "Key Metrics",
      node: (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <KpiCard label="Total Jobs" value={fmtNumber(kpis.totalJobs)} icon={Briefcase} tint="blue" />
          <KpiCard label="Active" value={fmtNumber(kpis.activeJobs)} icon={Gauge} tint="amber" />
          <KpiCard label="Completed" value={fmtNumber(kpis.completedJobs)} icon={CheckCircle2} tint="green" />
          <KpiCard label="Created 30d" value={fmtNumber(kpis.jobsCreated30d)} icon={PlusCircle} tint="violet" />
          <KpiCard label="Total Value" value={fmtMoneyCompact(kpis.totalValue)} sublabel={fmtMoney(kpis.totalValue)} icon={DollarSign} tint="green" />
          <KpiCard label="Active Pipeline" value={fmtMoneyCompact(kpis.activeValue)} icon={Wallet} tint="orange" />
          <KpiCard label="Avg Job Value" value={fmtMoneyCompact(kpis.avgJobValue)} icon={TrendingUp} tint="blue" />
          <KpiCard label="Excess Collected" value={fmtMoneyCompact(kpis.excessCollected)} icon={DollarSign} tint="teal" />
        </div>
      ),
    },
    {
      id: "statusMix",
      title: "Job Status",
      node: (
        <div className={two}>
          <TitledCard title="Open Jobs by Status"><AnimatedDonut data={statusDonut} size={240} secPer={2} /></TitledCard>
          <TitledCard title="Open vs Completed"><div className="flex justify-center py-2"><DonutChart data={splitDonut} centerLabel="all jobs" size={210} /></div></TitledCard>
        </div>
      ),
    },
    {
      id: "trendAging",
      title: "Jobs Created & Aging",
      node: (
        <div className={two}>
          <TitledCard title="Jobs Created — 12 Months"><TrendChart data={data.trend} height={340} /></TitledCard>
          <TitledCard title="Active Job Aging"><ColumnChart data={data.aging.map((a, idx) => ({ label: a.label, value: a.count, color: AGING_COLORS[idx] }))} height={340} /></TitledCard>
        </div>
      ),
    },
    {
      id: "people",
      title: "By Estimator & Case Manager",
      node: (
        <div className={two}>
          <TitledCard title="By Estimator"><BarList items={data.byEstimator} limit={10} color="#2a78d6" /></TitledCard>
          <TitledCard title="By Case Manager"><BarList items={data.byCaseManager} limit={10} color="#1baf7a" /></TitledCard>
        </div>
      ),
    },
    {
      id: "assigneeDivision",
      title: "By Assignee & Division",
      node: (
        <div className={two}>
          <TitledCard title="By Assignee"><BarList items={data.byAssignee} limit={10} color="#eb6834" /></TitledCard>
          <TitledCard title="By Division"><BarList items={data.byDivision} limit={8} color="#008300" /></TitledCard>
        </div>
      ),
    },
    {
      id: "assigneePies",
      title: "Assignee Jobs by Status",
      node: (
        <TitledCard title="Active jobs per assignee, by status">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
            {topStatuses.map((s, idx) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <span className="h-3 w-3 rounded-full" style={{ background: catColor(idx) }} />
                {s}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {asgPies.map((p) => (
              <MiniDonut key={p.name} data={p.data} title={p.name} size={160} />
            ))}
          </div>
        </TitledCard>
      ),
    },
    {
      id: "geography",
      title: "Where the Work Is",
      node: (
        <div className={two}>
          <TitledCard title="Jobs by State"><ChoroplethMap shapes={AUSTRALIA_SHAPES} counts={stateCounts} viewBox="0 0 1000 900" actDot={ACT_DOT} height={420} /></TitledCard>
          <TitledCard title="Greater Melbourne"><ChoroplethMap shapes={MELBOURNE_SHAPES} counts={metroCounts} viewBox="0 0 300 280" height={420} /></TitledCard>
        </div>
      ),
    },
    { id: "recentJobs", title: "Recent Jobs", node: <JobsTable jobs={data.jobs.slice(0, 14)} /> },
  ]
}
