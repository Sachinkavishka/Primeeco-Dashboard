"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  Gauge,
  PlusCircle,
  RefreshCw,
  Wallet,
} from "lucide-react"
import type { DashboardData } from "@/lib/primeeco/types"
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { KpiCard } from "./kpi-card"
import { StatusBreakdown } from "./status-breakdown"
import { PersonaTable } from "./persona-table"
import { AgingChart } from "./aging-chart"
import { JobsTable } from "./jobs-table"

/** Auto-refresh cadence for the wall display. */
const REFRESH_MS = 60_000

export function DashboardView({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" })
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`)
      const next = (await res.json()) as DashboardData
      setData(next)
      setLastError(null)
    } catch (err) {
      // Keep showing the last good data; note the fetch failure quietly.
      setLastError(err instanceof Error ? err.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    timer.current = setInterval(refresh, REFRESH_MS)
    // Refresh immediately when the display is re-focused (e.g. tab wake).
    const onVisible = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const { kpis } = data

  return (
    <div className="min-h-full bg-slate-950 p-6 text-slate-100">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Jobs Dashboard</h1>
          <p className="text-sm text-slate-400">
            {fmtNumber(data.totalJobs)} jobs · sourced from PrimeEco
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SourceBadge live={data.live} />
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <div className="text-right text-sm">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock className="h-4 w-4 text-slate-500" />
              {fmtTime(data.generatedAt)}
            </div>
            <div className="text-xs text-slate-500">auto every 60s</div>
          </div>
        </div>
      </header>

      {/* Degradation / connectivity banners */}
      {data.error && (
        <Banner tone="warn">
          Live PrimeEco fetch failed — showing sample data. <span className="opacity-80">{data.error}</span>
        </Banner>
      )}
      {!data.live && !data.error && (
        <Banner tone="info">
          Sample data — add PrimeEco credentials to <code className="font-mono">.env.local</code> (or Vercel env)
          to go live.
        </Banner>
      )}
      {lastError && <Banner tone="warn">Last refresh failed ({lastError}); showing previous data.</Banner>}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Total Jobs" value={fmtNumber(kpis.totalJobs)} icon={Briefcase} accent="text-sky-400" />
        <KpiCard label="Active" value={fmtNumber(kpis.activeJobs)} icon={Gauge} accent="text-amber-400" />
        <KpiCard label="Completed" value={fmtNumber(kpis.completedJobs)} icon={CheckCircle2} accent="text-emerald-400" />
        <KpiCard label="Created 30d" value={fmtNumber(kpis.jobsCreated30d)} icon={PlusCircle} accent="text-indigo-400" />
        <KpiCard label="Total Value" value={fmtMoneyCompact(kpis.totalValue)} sublabel={fmtMoney(kpis.totalValue)} icon={DollarSign} accent="text-emerald-400" />
        <KpiCard label="Active Pipeline" value={fmtMoneyCompact(kpis.activeValue)} sublabel={fmtMoney(kpis.activeValue)} icon={Wallet} accent="text-amber-400" />
        <KpiCard label="Avg Job Value" value={fmtMoneyCompact(kpis.avgJobValue)} icon={Gauge} accent="text-sky-400" />
        <KpiCard label="Excess Collected" value={fmtMoneyCompact(kpis.excessCollected)} icon={DollarSign} accent="text-teal-400" />
      </div>

      {/* Status + Aging */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatusBreakdown items={data.statusBreakdown} />
        </div>
        <AgingChart buckets={data.aging} />
      </div>

      {/* People breakdowns */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PersonaTable title="By Estimator" items={data.byEstimator} />
        <PersonaTable title="By Case Manager" items={data.byCaseManager} />
        <PersonaTable title="By Assignee" items={data.byAssignee} />
        <PersonaTable title="By Region" items={data.byRegion} />
      </div>

      {/* Recent jobs */}
      <div className="mt-4">
        <JobsTable jobs={data.recentJobs} />
      </div>
    </div>
  )
}

function SourceBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        live ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
      {live ? "LIVE" : "SAMPLE"}
    </span>
  )
}

function Banner({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const styles =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-sky-500/30 bg-sky-500/10 text-sky-200"
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm ${styles}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
