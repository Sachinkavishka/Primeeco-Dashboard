"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, DollarSign, Layers, Users } from "lucide-react"
import type { EstimatesData, EstimateRow } from "@/lib/primeeco/estimates"
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { Panel } from "@/components/dashboard/panel"
import { BarList } from "@/components/dashboard/charts/bar-list"
import { NavTabs } from "@/components/nav-tabs"

const REFRESH_MS = 300_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

interface Filters {
  estimator: string
  status: string
  type: string
  division: string
  client: string
}
const EMPTY: Filters = { estimator: "", status: "", type: "", division: "", client: "" }

export function EstimatesView({ initial }: { initial: EstimatesData }) {
  const [data, setData] = useState(initial)
  const [f, setF] = useState<Filters>(EMPTY)

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/estimates", { cache: "no-store" })
        if (res.ok) setData((await res.json()) as EstimatesData)
      } catch {
        /* keep last good */
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(
    () =>
      data.estimates.filter(
        (e) =>
          (!f.estimator || e.estimator === f.estimator) &&
          (!f.status || e.status === f.status) &&
          (!f.type || e.type === f.type) &&
          (!f.division || e.division === f.division) &&
          (!f.client || e.client === f.client),
      ),
    [data.estimates, f],
  )

  const totalValue = rows.reduce((a, e) => a + e.valueExGst, 0)
  const byEstimator = groupBy(rows, (e) => e.estimator)
  const byClient = groupBy(rows, (e) => e.client)
  const months = monthly(rows)
  const maxMonth = Math.max(1, ...months.map((m) => m.value))

  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }))

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 py-6 text-white shadow-lg shadow-violet-600/20">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Estimates by Estimator</h1>
          <p className="mt-1 text-sm text-violet-100">Authorised / locked estimates · all figures exclude GST</p>
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
          <span className="text-sm">{fmtTime(data.generatedAt)}</span>
        </div>
      </header>

      {(data.error || data.estimates.length === 0) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.estimates.length === 0
            ? "No estimates loaded yet"
            : `${data.estimates.length} estimates loaded`}
          {data.error ? ` — ${data.error}` : ". If this persists, reload in a moment (the data refreshes periodically)."}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Select label="Estimator" value={f.estimator} options={data.estimators} onChange={(v) => set({ estimator: v })} />
        <Select label="Status" value={f.status} options={data.statuses} onChange={(v) => set({ status: v })} />
        <Select label="Type" value={f.type} options={data.types} onChange={(v) => set({ type: v })} />
        <Select label="Division" value={f.division} options={data.divisions} onChange={(v) => set({ division: v })} />
        <Select label="Client" value={f.client} options={data.clients} onChange={(v) => set({ client: v })} />
        <button
          onClick={() => setF(EMPTY)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Total Estimated" value={fmtMoneyCompact(totalValue)} sub={fmtMoney(Math.round(totalValue))} icon={DollarSign} tint="text-emerald-600 bg-emerald-100" />
        <Kpi label="Estimates" value={fmtNumber(rows.length)} icon={ClipboardList} tint="text-blue-600 bg-blue-100" />
        <Kpi label="Estimators" value={fmtNumber(byEstimator.length)} icon={Users} tint="text-violet-600 bg-violet-100" />
        <Kpi label="Avg / Estimate" value={fmtMoneyCompact(rows.length ? totalValue / rows.length : 0)} icon={Layers} tint="text-amber-600 bg-amber-100" />
      </div>

      {/* By estimator + by month */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="By Estimator" subtitle="value estimated (ex-GST) · click to filter" className="lg:col-span-2">
          <BarList items={byEstimator} limit={12} color="#4a3aa7" onSelect={(name) => set({ estimator: name })} />
        </Panel>
        <Panel title="By Month" subtitle="last 12 months (ex-GST)">
          <div className="flex h-56 items-end justify-between gap-1.5">
            {months.map((m, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-indigo-500 transition-all"
                    style={{ height: `${Math.max(2, (m.value / maxMonth) * 100)}%` }}
                    title={`${m.label}: ${fmtMoney(m.value)}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* By client */}
      <div className="mt-5">
        <Panel title="By Client" subtitle="value estimated (ex-GST) · click to filter">
          <BarList items={byClient} limit={10} color="#1baf7a" onSelect={(name) => set({ client: name })} />
        </Panel>
      </div>

      {/* Estimate lines (job numbers) */}
      <div className="mt-5">
        <Panel title="Estimates" subtitle={`${rows.length} rows · job numbers`}>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-semibold">Job #</th>
                  <th className="py-2 pr-4 font-semibold">Estimator</th>
                  <th className="py-2 pr-4 font-semibold">Client</th>
                  <th className="py-2 pr-4 font-semibold">Division</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Type</th>
                  <th className="py-2 pr-4 text-right font-semibold">Value (ex-GST)</th>
                  <th className="py-2 text-right font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => b.valueExGst - a.valueExGst)
                  .slice(0, 300)
                  .map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap py-2 pr-4 font-semibold text-slate-900">{e.jobNumber}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{e.estimator}</td>
                      <td className="max-w-[180px] truncate py-2 pr-4 text-slate-600">{e.client}</td>
                      <td className="max-w-[140px] truncate py-2 pr-4 text-slate-500">{e.division}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{e.status}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{e.type}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-slate-900">
                        {fmtMoney(e.valueExGst)}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-400">{fmtDate(e.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Source: /estimates-snapshot (locked/authorised estimates) · all figures exclude GST
      </p>
    </div>
  )
}

/* helpers */
function groupBy(rows: EstimateRow[], key: (e: EstimateRow) => string) {
  const m = new Map<string, { count: number; value: number }>()
  for (const e of rows) {
    const k = key(e) || "Unknown"
    const v = m.get(k) ?? { count: 0, value: 0 }
    v.count += 1
    v.value += e.valueExGst
    m.set(k, v)
  }
  return [...m.entries()].map(([name, v]) => ({ name, count: v.count, value: v.value })).sort((a, b) => b.value - a.value)
}

function monthly(rows: EstimateRow[]) {
  const now = new Date()
  const pts: { label: string; value: number }[] = []
  const idx = new Map<string, { label: string; value: number }>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const p = { label: MONTHS[d.getMonth()], value: 0 }
    pts.push(p)
    idx.set(`${d.getFullYear()}-${d.getMonth()}`, p)
  }
  for (const e of rows) {
    if (!e.createdAt) continue
    const d = new Date(e.createdAt)
    const p = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (p) p.value += e.valueExGst
  }
  return pts
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tint,
}: {
  label: string
  value: string
  sub?: string
  icon: typeof DollarSign
  tint: string
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
