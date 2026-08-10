"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Clock, DollarSign, FolderOpen, Layers, Receipt, RefreshCw, TrendingUp, Users } from "lucide-react"
import type { EstimatesData, EstimateRow, EstimateState } from "@/lib/primeeco/estimates"
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtNumber, fmtTime } from "@/lib/format"
import { Panel } from "@/components/dashboard/panel"
import { BarList } from "@/components/dashboard/charts/bar-list"
import { NavTabs } from "@/components/nav-tabs"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// The estimate snapshot is heavy (~2k rows streamed page-by-page) and changes
// slowly, so we cache the fully-loaded result in the browser keyed to the day.
// A normal page refresh then hydrates instantly from cache with NO network
// calls; the feeds are only fetched on the first visit of the day (when the
// cached date no longer matches) or when the user hits Refresh.
// v3: bumped when the pending-value fix landed so cached $0 rows get refetched.
const CK_EST = "dfm-est-snapshot-v3"
const CK_JOBS = "dfm-est-jobs-v2"
const CK_INV = "dfm-est-invoiced-v2"
const CACHE_ROLLOVER_MS = 3_600_000 // re-check once an hour for the date rolling over (always-on displays)

const todayStr = () => new Date().toISOString().slice(0, 10)

function readDayCache<T extends object>(key: string): (T & { date: string }) | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as (T & { date: string }) | null
    return v && typeof v.date === "string" && v.date === todayStr() ? v : null
  } catch {
    return null
  }
}

function writeDayCache(key: string, value: object) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify({ date: todayStr(), ...value }))
  } catch {
    /* quota exceeded / private mode — cache is best-effort */
  }
}

interface Filters {
  state: "" | EstimateState
  estimator: string
  status: string
  type: string
  division: string
  client: string
}
// Default to Authorised — the accurate "won work" (locked + authorised) figure.
const EMPTY: Filters = { state: "authorised", estimator: "", status: "", type: "", division: "", client: "" }

const STATE_TABS: { value: "" | EstimateState; label: string }[] = [
  { value: "authorised", label: "Lock + Authorised" },
  { value: "pending", label: "Lock + Pending" },
  { value: "", label: "All" },
]

export function EstimatesView() {
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [meta, setMeta] = useState({
    live: false,
    generatedAt: new Date().toISOString(),
    error: undefined as string | undefined,
    totalPages: 1,
    loaded: 0,
  })
  const [f, setF] = useState<Filters>(EMPTY)
  // Bumped by the Refresh button / daily rollover to force a fresh network load.
  const [refreshTick, setRefreshTick] = useState(0)
  const [fromCache, setFromCache] = useState(false)

  // Estimates: hydrate from today's cache instantly, else stream page-by-page
  // and write the result to the day cache.
  useEffect(() => {
    let cancelled = false

    const cached = readDayCache<{ estimates: EstimateRow[]; generatedAt: string }>(CK_EST)
    if (cached && cached.estimates?.length) {
      setEstimates(cached.estimates)
      setFromCache(true)
      setMeta((m) => ({ ...m, live: true, generatedAt: cached.generatedAt, error: undefined, loaded: 1, totalPages: 1 }))
      return
    }

    setFromCache(false)
    const load = async () => {
      const acc: EstimateRow[] = []
      let p = 1
      let total = 1
      do {
        try {
          const res = await fetch(`/api/estimates?page=${p}`, { cache: "no-store" })
          if (!res.ok) {
            setMeta((m) => ({ ...m, error: `Load failed (${res.status})` }))
            break
          }
          const d = (await res.json()) as EstimatesData
          if (cancelled) return
          acc.push(...d.estimates)
          total = d.totalPages
          setEstimates([...acc])
          setMeta((m) => ({ ...m, live: d.live, generatedAt: d.generatedAt, error: d.error, totalPages: total, loaded: p }))
          p++
        } catch {
          setMeta((m) => ({ ...m, error: "Load failed — retrying next refresh" }))
          break
        }
      } while (p <= total)
      if (!cancelled) {
        setEstimates(acc)
        if (acc.length) writeDayCache(CK_EST, { estimates: acc, generatedAt: new Date().toISOString() })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  // Enrich estimates with job number / client / division / open-closed status
  // from the ops job cache (day-cached alongside the estimates).
  type JobInfo = { jobNumber: string; client: string | null; division: string | null; region: string | null; statusType: string | null }
  const [jobMap, setJobMap] = useState<Map<string, JobInfo>>(new Map())
  useEffect(() => {
    let cancelled = false
    const cached = readDayCache<{ jobs: [string, JobInfo][] }>(CK_JOBS)
    if (cached?.jobs) {
      setJobMap(new Map(cached.jobs))
      return
    }
    ;(async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" })
        if (!res.ok) return
        const dash = (await res.json()) as { jobs: ({ id: string } & JobInfo)[] }
        if (cancelled) return
        const entries: [string, JobInfo][] = dash.jobs.map((j) => [
          j.id,
          { jobNumber: j.jobNumber, client: j.client, division: j.division, region: j.region, statusType: j.statusType },
        ])
        setJobMap(new Map(entries))
        writeDayCache(CK_JOBS, { jobs: entries })
      } catch {
        /* ignore — estimator totals still work without job detail */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  // Which jobs already have an AR invoice — powers the invoiced vs to-be-invoiced
  // split. Fetched from the same finance-gated API the /receivables page uses;
  // failures just leave every authorised estimate counted as "to invoice".
  const [invoicedJobIds, setInvoicedJobIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    const cached = readDayCache<{ invoiced: string[] }>(CK_INV)
    if (cached?.invoiced) {
      setInvoicedJobIds(new Set(cached.invoiced))
      return
    }
    ;(async () => {
      try {
        const res = await fetch("/api/receivables", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { invoices: { jobId: string }[] }
        if (cancelled) return
        const ids = data.invoices.map((i) => i.jobId).filter(Boolean)
        setInvoicedJobIds(new Set(ids))
        writeDayCache(CK_INV, { invoiced: ids })
      } catch {
        /* ignore — invoicing split degrades to "all to invoice" */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  // Daily rollover: on an always-on wall display, force a fresh load once the
  // calendar day changes (the cache read then misses and re-fetches).
  useEffect(() => {
    const id = setInterval(() => {
      if (!readDayCache(CK_EST)) setRefreshTick((t) => t + 1)
    }, CACHE_ROLLOVER_MS)
    return () => clearInterval(id)
  }, [])

  // Manual refresh: drop the day caches and re-fetch everything now.
  const refresh = () => {
    if (typeof window !== "undefined") {
      try {
        for (const k of [CK_EST, CK_JOBS, CK_INV]) window.localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
    setEstimates([])
    setMeta((m) => ({ ...m, loaded: 0, totalPages: 1 }))
    setRefreshTick((t) => t + 1)
  }

  const enriched = useMemo(
    () =>
      estimates.map((e) => {
        const j = jobMap.get(e.jobId)
        return j ? { ...e, jobNumber: j.jobNumber, client: j.client ?? "Unknown", division: j.division ?? "—", region: j.region } : e
      }),
    [estimates, jobMap],
  )

  // De-duplicate version history: the snapshot holds multiple rows per estimate
  // (one per saved version). Keep only the latest version of each estimate so
  // totals don't over-count. This runs across the FULL accumulated set.
  const deduped = useMemo(() => {
    const latest = new Map<string, EstimateRow>()
    for (const e of enriched) {
      const key = e.estimateKey ?? e.id
      const prev = latest.get(key)
      if (!prev || (e.version ?? 0) > (prev.version ?? 0)) latest.set(key, e)
    }
    return [...latest.values()]
  }, [enriched])

  // OPEN JOBS ONLY: estimates on Closed jobs are history — if a job comes back
  // it gets re-opened (status change), so it reappears here automatically.
  // Only rows whose job is known-Closed are dropped: while the job feed is
  // still loading (or for a job missing from it) nothing is hidden.
  const openOnly = useMemo(
    () => deduped.filter((e) => jobMap.get(e.jobId)?.statusType !== "Closed"),
    [deduped, jobMap],
  )

  const options = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()
    // Filter dropdown options respect the current state tab, so e.g. the status
    // list only shows statuses that exist within the selected state.
    const scope = f.state ? openOnly.filter((e) => e.state === f.state) : openOnly
    return {
      estimators: uniq(scope.map((e) => e.estimator)),
      statuses: uniq(scope.map((e) => e.status)),
      types: uniq(scope.map((e) => e.type)),
      divisions: uniq(scope.map((e) => e.division)),
      clients: uniq(scope.map((e) => e.client)),
    }
  }, [openOnly, f.state])

  // Counts per state tab (open jobs only), for the tab badges.
  const stateCounts = useMemo(() => {
    const c = { authorised: 0, pending: 0, rejected: 0, all: openOnly.length }
    for (const e of openOnly) if (e.state) c[e.state]++
    return c
  }, [openOnly])

  // Pipeline metrics span BOTH states (pending → approval, authorised →
  // invoicing), so they read the open-jobs set directly — respecting the
  // business filters (estimator/division/client) but NOT the state tab /
  // status / type.
  const pipeline = useMemo(() => {
    const base = openOnly.filter(
      (e) =>
        (!f.estimator || e.estimator === f.estimator) &&
        (!f.division || e.division === f.division) &&
        (!f.client || e.client === f.client),
    )
    const jobs = (list: EstimateRow[]) => new Set(list.map((e) => e.jobId).filter(Boolean)).size
    const value = (list: EstimateRow[]) => list.reduce((a, e) => a + e.valueExGst, 0)
    // Keep the row list on each stat so the drill-down can show the exact
    // estimates behind the number.
    const stat = (list: EstimateRow[]) => ({ jobs: jobs(list), value: value(list), count: list.length, list })

    const authorised = base.filter((e) => e.state === "authorised")
    return {
      hasInvoiceData: invoicedJobIds.size > 0,
      openJob: stat(base),
      pending: stat(base.filter((e) => e.state === "pending")),
      invoiced: stat(authorised.filter((e) => invoicedJobIds.has(e.jobId))),
      toInvoice: stat(authorised.filter((e) => !invoicedJobIds.has(e.jobId))),
    }
  }, [openOnly, invoicedJobIds, f.estimator, f.division, f.client])

  // Pipeline drill-down: which card's estimate list is open, if any.
  const [drill, setDrill] = useState<{ title: string; explain: string; rows: EstimateRow[] } | null>(null)

  const rows = useMemo(
    () =>
      openOnly.filter(
        (e) =>
          (!f.state || e.state === f.state) &&
          (!f.estimator || e.estimator === f.estimator) &&
          (!f.status || e.status === f.status) &&
          (!f.type || e.type === f.type) &&
          (!f.division || e.division === f.division) &&
          (!f.client || e.client === f.client),
      ),
    [openOnly, f],
  )

  const loadingMore = meta.loaded < meta.totalPages
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
          <p className="mt-1 text-sm text-violet-100">
            Locked snapshot estimates · OPEN jobs only (re-opened jobs reappear) · real authorised ex-GST
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NavTabs />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              meta.live ? "bg-emerald-300/25 text-white" : "bg-amber-300/25 text-white"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${meta.live ? "bg-emerald-200 animate-pulse" : "bg-amber-200"}`} />
            {meta.live ? "LIVE" : "SAMPLE"}
          </span>
          <span className="text-sm" title={fromCache ? "Loaded from today's cache" : "Freshly fetched"}>
            {fromCache ? "Cached " : "Updated "}
            {fmtTime(meta.generatedAt)}
          </span>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/25"
            title="Fetch fresh estimates now (otherwise data is cached for the day)"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {loadingMore && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          Loading estimates… page {meta.loaded} of {meta.totalPages} · {estimates.length} so far
        </div>
      )}
      {!loadingMore && (meta.error || estimates.length === 0) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {estimates.length === 0 ? "No authorised estimates loaded" : `${estimates.length} estimates loaded`}
          {meta.error ? ` — ${meta.error}` : ". Reload in a moment if this persists."}
        </div>
      )}

      {/* State tabs: Lock + Authorised / Lock + Pending / All */}
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {STATE_TABS.map((t) => {
          const count =
            t.value === "" ? stateCounts.all : t.value === "authorised" ? stateCounts.authorised : stateCounts.pending
          const active = f.state === t.value
          return (
            <button
              key={t.label}
              onClick={() => set({ state: t.value })}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span className={`ml-2 tabular-nums ${active ? "text-violet-100" : "text-slate-400"}`}>{fmtNumber(count)}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Select label="Estimator" value={f.estimator} options={options.estimators} onChange={(v) => set({ estimator: v })} />
        <Select label="Status" value={f.status} options={options.statuses} onChange={(v) => set({ status: v })} />
        <Select label="Type" value={f.type} options={options.types} onChange={(v) => set({ type: v })} />
        <Select label="Division" value={f.division} options={options.divisions} onChange={(v) => set({ division: v })} />
        <Select label="Client" value={f.client} options={options.clients} onChange={(v) => set({ client: v })} />
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

      {/* Pipeline: estimate → approval → invoicing */}
      <div className="mt-5">
        <Panel
          title="Pipeline"
          subtitle="estimate → approval → invoicing · distinct jobs · ex-GST · respects estimator / division / client filters"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PipelineCard
              label="Estimates on open jobs"
              value={fmtMoneyCompact(pipeline.openJob.value)}
              jobs={pipeline.openJob.jobs}
              note={`${fmtNumber(pipeline.openJob.count)} estimates · click for detail`}
              icon={FolderOpen}
              accent="sky"
              onClick={() =>
                setDrill({
                  title: "Estimates on open jobs",
                  explain:
                    "Every snapshot estimate (latest version, any status) on the open jobs. Closed jobs are excluded page-wide — if a job is re-opened its estimates come back automatically.",
                  rows: pipeline.openJob.list,
                })
              }
            />
            <PipelineCard
              label="Awaiting approval"
              badge="Lock + Pending"
              value={fmtMoneyCompact(pipeline.pending.value)}
              jobs={pipeline.pending.jobs}
              note="jobs to approve · click for detail"
              icon={Clock}
              accent="amber"
              onClick={() =>
                setDrill({
                  title: "Awaiting approval (Lock + Pending)",
                  explain:
                    "Locked snapshot estimates whose status is not yet authorised — the estimate's own ex-GST total (nothing authorised yet).",
                  rows: pipeline.pending.list,
                })
              }
            />
            <PipelineCard
              label="Authorised & invoiced"
              badge="Lock + Authorised"
              value={fmtMoneyCompact(pipeline.invoiced.value)}
              jobs={pipeline.invoiced.jobs}
              note={pipeline.hasInvoiceData ? "jobs invoiced · click for detail" : "invoice data unavailable"}
              icon={Receipt}
              accent="emerald"
              onClick={() =>
                setDrill({
                  title: "Authorised & invoiced (Lock + Authorised)",
                  explain:
                    "Authorised estimates (real authorisedTotalExcludingTax) whose job already has at least one AR invoice (any status except Draft/Cancelled). The $ figure is the ESTIMATE value, not the invoice total.",
                  rows: pipeline.invoiced.list,
                })
              }
            />
            <PipelineCard
              label="Authorised, to invoice"
              badge="Lock + Authorised"
              value={fmtMoneyCompact(pipeline.toInvoice.value)}
              jobs={pipeline.toInvoice.jobs}
              note="future revenue to bill · click for detail"
              icon={TrendingUp}
              accent="violet"
              onClick={() =>
                setDrill({
                  title: "Authorised, to invoice (Lock + Authorised)",
                  explain:
                    "Authorised estimates whose job has NO AR invoice yet — authorised work still to be billed (future revenue).",
                  rows: pipeline.toInvoice.list,
                })
              }
            />
          </div>
          {!pipeline.hasInvoiceData && (
            <p className="mt-3 text-xs text-slate-400">
              Invoiced / to-invoice split needs the receivables feed — everything authorised is shown as “to invoice” until it loads.
            </p>
          )}
        </Panel>
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
        Source: /estimates-snapshot (locked estimates, latest version each) · OPEN jobs only — closed jobs excluded, re-opened jobs
        reappear · real authorisedTotalExcludingTax · all figures exclude GST
      </p>

      {/* Pipeline drill-down: the exact estimate rows behind a card's figure */}
      {drill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setDrill(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{drill.title}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {fmtNumber(drill.rows.length)} estimates · {fmtNumber(new Set(drill.rows.map((e) => e.jobId).filter(Boolean)).size)} jobs ·{" "}
                  {fmtMoney(drill.rows.reduce((a, e) => a + e.valueExGst, 0))} ex-GST
                </p>
                <p className="mt-1 max-w-2xl text-xs text-slate-400">{drill.explain}</p>
              </div>
              <button
                onClick={() => setDrill(null)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-2">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-semibold">Job #</th>
                    <th className="py-2 pr-4 font-semibold">Estimator</th>
                    <th className="py-2 pr-4 font-semibold">Client</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold">Invoiced</th>
                    <th className="py-2 pr-4 text-right font-semibold">Value (ex-GST)</th>
                    <th className="py-2 text-right font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {[...drill.rows]
                    .sort((a, b) => b.valueExGst - a.valueExGst)
                    .map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap py-2.5 pr-4 font-semibold text-slate-900">{e.jobNumber}</td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-slate-600">{e.estimator}</td>
                        <td className="max-w-[200px] truncate py-2.5 pr-4 text-slate-600">{e.client}</td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-slate-600">{e.status}</td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          {invoicedJobIds.has(e.jobId) ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Yes</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">No</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-slate-900">{fmtMoney(e.valueExGst)}</td>
                        <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-slate-400">{fmtDate(e.createdAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
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

const ACCENTS = {
  sky: { icon: "text-sky-600 bg-sky-100", jobs: "text-sky-700", ring: "hover:border-sky-300" },
  amber: { icon: "text-amber-600 bg-amber-100", jobs: "text-amber-700", ring: "hover:border-amber-300" },
  emerald: { icon: "text-emerald-600 bg-emerald-100", jobs: "text-emerald-700", ring: "hover:border-emerald-300" },
  violet: { icon: "text-violet-600 bg-violet-100", jobs: "text-violet-700", ring: "hover:border-violet-300" },
} as const

function PipelineCard({
  label,
  badge,
  value,
  jobs,
  note,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string
  badge?: string
  value: string
  jobs: number
  note: string
  icon: typeof DollarSign
  accent: keyof typeof ACCENTS
  onClick?: () => void
}) {
  const a = ACCENTS[accent]
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors ${
        onClick ? `cursor-pointer ${a.ring}` : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${a.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {badge && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{badge}</span>}
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{value}</div>
      <div className={`mt-1 text-sm font-bold tabular-nums ${a.jobs}`}>{fmtNumber(jobs)} jobs</div>
      <div className="mt-0.5 text-xs text-slate-400">{note}</div>
    </Tag>
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
