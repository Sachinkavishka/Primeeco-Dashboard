"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  Gauge,
  PlusCircle,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react"
import type { DashboardData, DashboardJob } from "@/lib/primeeco/types"
import { isCompleted } from "@/lib/primeeco/aggregate"
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { KpiCard } from "./kpi-card"
import { Panel } from "./panel"
import { JobsTable } from "./jobs-table"
import { DonutChart } from "./charts/donut-chart"
import { BarList } from "./charts/bar-list"
import { ColumnChart } from "./charts/column-chart"
import { TrendChart } from "./charts/trend-chart"
import { ChoroplethMap } from "./charts/choropleth-map"
import { MiniDonut } from "./charts/mini-donut"
import { AUSTRALIA_SHAPES, MELBOURNE_SHAPES, ACT_DOT, regionToState, regionToMetro } from "./charts/region-maps"
import { catColor, OTHER_COLOR } from "./charts/palette"
import { DrillDown, type DrillState } from "./drill-down"
import { NavTabs } from "@/components/nav-tabs"
import { Logo } from "@/components/logo"

const REFRESH_MS = 120_000 // poll every 2 min; server data cache refreshes every 5 min
const AGING_COLORS = ["#1baf7a", "#84cc16", "#eda100", "#eb6834", "#e34948"]

export function DashboardView({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" })
      if (res.ok) setData((await res.json()) as DashboardData)
    } catch {
      /* keep last good data */
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    timer.current = setInterval(refresh, REFRESH_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [refresh])

  const { kpis } = data

  // --- drill-down helpers -------------------------------------------------
  const drillByPersona = (label: string, get: (j: DashboardJob) => string | null) => (name: string) => {
    setDrill({ title: `${label}: ${name}`, jobs: data.jobs.filter((j) => (get(j) ?? "Unassigned") === name) })
  }

  // --- status donut (open jobs, top 7 + Other) ----------------------------
  const topStatus = data.statusBreakdown.slice(0, 7)
  const restStatus = data.statusBreakdown.slice(7)
  const topStatusNames = topStatus.map((s) => s.status)
  const statusDonut = useMemo(() => {
    const d = topStatus.map((s, i) => ({ label: s.status, value: s.count, color: catColor(i) }))
    if (restStatus.length)
      d.push({ label: "Other", value: restStatus.reduce((a, b) => a + b.count, 0), color: OTHER_COLOR })
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.statusBreakdown])

  const onStatusSelect = (label: string) => {
    if (label === "Other") {
      setDrill({
        title: "Open status: Other",
        jobs: data.jobs.filter((j) => !isCompleted(j) && !topStatusNames.includes(j.status)),
      })
    } else {
      setDrill({ title: `Status: ${label}`, jobs: data.jobs.filter((j) => j.status === label) })
    }
  }

  // --- open vs completed donut -------------------------------------------
  const splitDonut = [
    { label: "Open / Active", value: kpis.activeJobs, color: "#2a78d6" },
    { label: "Completed", value: kpis.completedJobs, color: "#1baf7a" },
  ]
  const onSplitSelect = (label: string) => {
    const completed = label === "Completed"
    setDrill({ title: label, jobs: data.jobs.filter((j) => isCompleted(j) === completed) })
  }

  // --- region maps (roll region names up to state + Melbourne metro zone) --
  const stateCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const j of data.jobs) {
      const s = regionToState(j.region)
      if (s) m[s] = (m[s] ?? 0) + 1
    }
    return m
  }, [data.jobs])

  const metroCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const j of data.jobs) {
      const z = regionToMetro(j.region)
      if (z) m[z] = (m[z] ?? 0) + 1
    }
    return m
  }, [data.jobs])

  const onStateSelect = (code: string) =>
    setDrill({ title: `State: ${code}`, jobs: data.jobs.filter((j) => regionToState(j.region) === code) })
  const onMetroSelect = (code: string) =>
    setDrill({ title: `Melbourne — ${code}`, jobs: data.jobs.filter((j) => regionToMetro(j.region) === code) })

  // --- per-assignee status pies (active jobs, shared status colours) -------
  const assigneePies = useMemo(() => {
    const active = data.jobs.filter((j) => !isCompleted(j))
    const statusCount = new Map<string, number>()
    for (const j of active) statusCount.set(j.status, (statusCount.get(j.status) ?? 0) + 1)
    const topStatuses = [...statusCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([s]) => s)
    const colorOf = (s: string) => {
      const i = topStatuses.indexOf(s)
      return i >= 0 ? catColor(i) : OTHER_COLOR
    }
    const byAsg = new Map<string, DashboardJob[]>()
    for (const j of active) {
      const a = j.assignedTo ?? "Unassigned"
      const arr = byAsg.get(a) ?? []
      arr.push(j)
      byAsg.set(a, arr)
    }
    const pies = [...byAsg.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([name, jobs]) => {
        const m = new Map<string, number>()
        for (const j of jobs) m.set(topStatuses.includes(j.status) ? j.status : "Other", (m.get(topStatuses.includes(j.status) ? j.status : "Other") ?? 0) + 1)
        const dd = [...m.entries()]
          .map(([label, value]) => ({ label, value, color: label === "Other" ? OTHER_COLOR : colorOf(label) }))
          .sort((a, b) => b.value - a.value)
        return { name, data: dd }
      })
    return { pies, topStatuses }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.jobs])

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      {/* Header banner */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 px-7 py-6 text-white shadow-lg shadow-blue-600/20">
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Jobs Dashboard</h1>
            <p className="mt-1 text-sm text-blue-100">{fmtNumber(data.totalJobs)} jobs · sourced live from PrimeEco</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NavTabs />
          <SourceBadge live={data.live} />
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-blue-200" />
              {fmtTime(data.generatedAt)}
            </div>
            <div className="text-xs text-blue-200">auto-refresh</div>
          </div>
        </div>
      </header>

      {data.error && (
        <Banner>
          Live PrimeEco fetch failed — showing sample data. <span className="opacity-80">{data.error}</span>
        </Banner>
      )}
      {!data.live && !data.error && <Banner>Sample data — add PrimeEco credentials to go live.</Banner>}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Total Jobs" value={fmtNumber(kpis.totalJobs)} icon={Briefcase} tint="blue" />
        <KpiCard label="Active" value={fmtNumber(kpis.activeJobs)} icon={Gauge} tint="amber" />
        <KpiCard label="Completed" value={fmtNumber(kpis.completedJobs)} icon={CheckCircle2} tint="green" />
        <KpiCard label="Created 30d" value={fmtNumber(kpis.jobsCreated30d)} icon={PlusCircle} tint="violet" />
        <KpiCard label="Total Value" value={fmtMoneyCompact(kpis.totalValue)} sublabel={fmtMoney(kpis.totalValue)} icon={DollarSign} tint="green" />
        <KpiCard label="Active Pipeline" value={fmtMoneyCompact(kpis.activeValue)} sublabel={fmtMoney(kpis.activeValue)} icon={Wallet} tint="orange" />
        <KpiCard label="Avg Job Value" value={fmtMoneyCompact(kpis.avgJobValue)} icon={TrendingUp} tint="blue" />
        <KpiCard label="Excess Collected" value={fmtMoneyCompact(kpis.excessCollected)} icon={DollarSign} tint="teal" />
      </div>

      {/* Donuts row */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Open Jobs by Status" subtitle="click a status to see its jobs" className="lg:col-span-2">
          <DonutChart data={statusDonut} centerLabel="open jobs" onSelect={onStatusSelect} size={190} />
        </Panel>
        <Panel title="Open vs Completed" subtitle="click to drill in">
          <DonutChart data={splitDonut} centerLabel="all jobs" onSelect={onSplitSelect} size={190} />
        </Panel>
      </div>

      {/* Trend + Aging */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Jobs Created" subtitle="last 12 months" className="lg:col-span-2">
          <TrendChart data={data.trend} />
        </Panel>
        <Panel title="Active Job Aging" subtitle="days since created">
          <ColumnChart data={data.aging.map((a, i) => ({ label: a.label, value: a.count, color: AGING_COLORS[i] }))} />
        </Panel>
      </div>

      {/* People breakdowns (horizontal bars, clickable) */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Panel title="By Estimator" subtitle="active jobs · click to drill">
          <BarList items={data.byEstimator} onSelect={drillByPersona("Estimator", (j) => j.estimator)} color="#2a78d6" />
        </Panel>
        <Panel title="By Case Manager" subtitle="active jobs · click to drill">
          <BarList items={data.byCaseManager} onSelect={drillByPersona("Case Manager", (j) => j.caseManager)} color="#1baf7a" />
        </Panel>
        <Panel title="By Assignee" subtitle="active jobs · click to drill">
          <BarList items={data.byAssignee} onSelect={drillByPersona("Assignee", (j) => j.assignedTo)} color="#eb6834" />
        </Panel>
        <Panel title="By Region" subtitle="all jobs · click to drill">
          <BarList items={data.byRegion} onSelect={drillByPersona("Region", (j) => j.region)} color="#4a3aa7" />
        </Panel>
        <Panel title="By Division" subtitle="all jobs · click to drill">
          <BarList items={data.byDivision} onSelect={drillByPersona("Division", (j) => j.division)} color="#008300" />
        </Panel>
      </div>

      {/* Per-assignee status pies */}
      <div className="mt-5">
        <Panel title="Active Jobs by Assignee" subtitle="each pie = an assignee's active jobs by status · click to drill">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
            {assigneePies.topStatuses.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(i) }} />
                {s}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: OTHER_COLOR }} />
              Other
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
            {assigneePies.pies.map((p) => (
              <MiniDonut key={p.name} data={p.data} title={p.name} onClick={() => drillByPersona("Assignee", (j) => j.assignedTo)(p.name)} />
            ))}
          </div>
        </Panel>
      </div>

      {/* Region maps */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Jobs by State" subtitle="Australia · click a state to drill in">
          <ChoroplethMap
            shapes={AUSTRALIA_SHAPES}
            counts={stateCounts}
            viewBox="0 0 1000 900"
            onSelect={onStateSelect}
            actDot={ACT_DOT}
            height={340}
          />
        </Panel>
        <Panel title="Greater Melbourne" subtitle="metro zones · click a zone to drill in">
          <ChoroplethMap
            shapes={MELBOURNE_SHAPES}
            counts={metroCounts}
            viewBox="0 0 300 280"
            onSelect={onMetroSelect}
            height={340}
          />
        </Panel>
      </div>

      {/* Recent jobs */}
      <div className="mt-5">
        <JobsTable jobs={data.jobs.slice(0, 25)} />
      </div>

      {drill && <DrillDown drill={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}

function SourceBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        live ? "bg-emerald-400/20 text-emerald-100" : "bg-amber-400/20 text-amber-100"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-300 animate-pulse" : "bg-amber-300"}`} />
      {live ? "LIVE" : "SAMPLE"}
    </span>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
