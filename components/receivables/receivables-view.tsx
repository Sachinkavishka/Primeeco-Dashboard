"use client"

import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Banknote, CalendarDays, CalendarRange, CheckCircle2, Clock8, FileText, Hourglass, Sun } from "lucide-react"
import type { ReceivablesData, ArRow } from "@/lib/primeeco/receivables"
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { Panel } from "@/components/dashboard/panel"
import { BarList } from "@/components/dashboard/charts/bar-list"
import { NavTabs } from "@/components/nav-tabs"

const REFRESH_MS = 300_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

interface Filters {
  division: string
  client: string
  region: string
}

export function ReceivablesView({ initial }: { initial: ReceivablesData }) {
  const [data, setData] = useState(initial)
  const [f, setF] = useState<Filters>({ division: "", client: "", region: "" })

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/receivables", { cache: "no-store" })
        if (res.ok) setData((await res.json()) as ReceivablesData)
      } catch {
        /* keep last good */
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(
    () =>
      data.invoices.filter(
        (e) =>
          (!f.division || e.division === f.division) &&
          (!f.client || e.client === f.client) &&
          (!f.region || e.region === f.region),
      ),
    [data.invoices, f],
  )

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, "0")}`
  const thisYear = String(now.getFullYear())
  const today = now.toISOString().slice(0, 10)

  const sum = (pred: (e: ArRow) => boolean) => rows.filter(pred).reduce((a, e) => a + e.exGst, 0)
  const invoicedAll = sum(() => true)
  const kpis = {
    thisMonth: sum((e) => e.invoicedDate?.slice(0, 7) === thisMonth),
    lastMonth: sum((e) => e.invoicedDate?.slice(0, 7) === lastMonth),
    thisYear: sum((e) => e.invoicedDate?.slice(0, 4) === thisYear),
    today: sum((e) => e.invoicedDate === today),
    allTime: invoicedAll,
    outstanding: sum((e) => !e.paid),
    collected: sum((e) => e.paid),
  }

  const byClient = group(rows, (e) => e.client)
  const byDivision = group(rows, (e) => e.division)
  const months = monthly(rows)
  const maxMonth = Math.max(1, ...months.map((m) => m.value))
  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }))

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-teal-600 to-cyan-600 px-7 py-6 text-white shadow-lg shadow-teal-600/20">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Accounts Receivable</h1>
          <p className="mt-1 text-sm text-teal-100">Invoiced to date · ex-GST · matches PrimeEco (excl. Draft/Cancelled)</p>
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

      {(data.error || data.invoices.length === 0) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.invoices.length === 0 ? "No invoices loaded yet" : `${data.invoices.length} invoices loaded`}
          {data.error ? ` — ${data.error}` : ". Reload in a moment if this persists."}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Select label="Division" value={f.division} options={data.divisions} onChange={(v) => set({ division: v })} />
        <Select label="Client" value={f.client} options={data.clients} onChange={(v) => set({ client: v })} />
        <Select label="Region" value={f.region} options={data.regions} onChange={(v) => set({ region: v })} />
        <button
          onClick={() => setF({ division: "", client: "", region: "" })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Invoiced — This Month" value={fmtMoneyCompact(kpis.thisMonth)} sub={fmtMoney(Math.round(kpis.thisMonth))} icon={CalendarDays} tint="text-teal-600 bg-teal-100" />
        <Kpi label="Invoiced — Last Month" value={fmtMoneyCompact(kpis.lastMonth)} sub={fmtMoney(Math.round(kpis.lastMonth))} icon={CalendarRange} tint="text-cyan-600 bg-cyan-100" />
        <Kpi label="Invoiced — This Year" value={fmtMoneyCompact(kpis.thisYear)} sub={fmtMoney(Math.round(kpis.thisYear))} icon={Banknote} tint="text-blue-600 bg-blue-100" />
        <Kpi label="Today" value={fmtMoneyCompact(kpis.today)} icon={Sun} tint="text-amber-600 bg-amber-100" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Outstanding (unpaid)" value={fmtMoneyCompact(kpis.outstanding)} sub={fmtMoney(Math.round(kpis.outstanding))} icon={Hourglass} tint="text-orange-600 bg-orange-100" />
        <Kpi label="Collected (paid)" value={fmtMoneyCompact(kpis.collected)} sub={fmtMoney(Math.round(kpis.collected))} icon={CheckCircle2} tint="text-emerald-600 bg-emerald-100" />
        <Kpi label="Invoiced — All Time" value={fmtMoneyCompact(kpis.allTime)} icon={Clock8} tint="text-violet-600 bg-violet-100" />
        <Kpi label="Invoices" value={fmtNumber(rows.length)} icon={FileText} tint="text-slate-600 bg-slate-100" isCount />
      </div>

      {/* By month */}
      <div className="mt-5">
        <Panel title="Invoiced by Month" subtitle="ex-GST · last 12 months">
          <div className="flex h-56 items-end justify-between gap-2">
            {months.map((m, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums text-slate-700">{fmtMoneyCompact(m.value)}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-teal-500 transition-all"
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

      {/* By client + division */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="By Client" subtitle="invoiced ex-GST · click to filter">
          <BarList items={byClient} limit={10} color="#1baf7a" onSelect={(name) => set({ client: name })} />
        </Panel>
        <Panel title="By Division" subtitle="invoiced ex-GST · click to filter">
          <BarList items={byDivision} limit={6} color="#2a78d6" onSelect={(name) => set({ division: name })} />
        </Panel>
      </div>

      {/* Invoice table */}
      <div className="mt-5">
        <Panel title="Invoices" subtitle={`${rows.length} rows`}>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-semibold">Invoice #</th>
                  <th className="py-2 pr-4 font-semibold">Job #</th>
                  <th className="py-2 pr-4 font-semibold">Client</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 text-right font-semibold">Ex-GST</th>
                  <th className="py-2 pr-4 text-right font-semibold">Invoiced</th>
                  <th className="py-2 text-right font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => (b.invoicedDate ?? "").localeCompare(a.invoicedDate ?? ""))
                  .slice(0, 300)
                  .map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap py-2 pr-4 font-semibold text-slate-900">{e.invoiceNumber}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{e.jobNumber}</td>
                      <td className="max-w-[200px] truncate py-2 pr-4 text-slate-600">{e.client}</td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        <span className={e.paid ? "text-emerald-600" : "text-orange-600"}>{e.status}</span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-slate-900">{fmtMoney(e.exGst)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-slate-400">{fmtDate(e.invoicedDate)}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-400">{fmtDate(e.dueDate)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Ex-GST (subtotal) · excludes Draft & Cancelled · by invoiced date · matches PrimeEco receivable totals
      </p>
    </div>
  )
}

/* helpers */
function group(rows: ArRow[], key: (e: ArRow) => string) {
  const m = new Map<string, { count: number; value: number }>()
  for (const e of rows) {
    const k = key(e) || "Unknown"
    const v = m.get(k) ?? { count: 0, value: 0 }
    v.count += 1
    v.value += e.exGst
    m.set(k, v)
  }
  return [...m.entries()].map(([name, v]) => ({ name, count: v.count, value: v.value })).sort((a, b) => b.value - a.value)
}

function monthly(rows: ArRow[]) {
  const now = new Date()
  const pts: { label: string; value: number }[] = []
  const idx = new Map<string, { label: string; value: number }>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const p = { label: MONTHS[d.getMonth()], value: 0 }
    pts.push(p)
    idx.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, p)
  }
  for (const e of rows) {
    if (!e.invoicedDate) continue
    const p = idx.get(e.invoicedDate.slice(0, 7))
    if (p) p.value += e.exGst
  }
  return pts
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"
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

function Kpi({ label, value, sub, icon: Icon, tint, isCount }: { label: string; value: string; sub?: string; icon: LucideIcon; tint: string; isCount?: boolean }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`mt-2 font-extrabold tabular-nums text-slate-900 ${isCount ? "text-3xl" : "text-3xl"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
