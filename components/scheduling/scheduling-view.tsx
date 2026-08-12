"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  UserCheck,
  Users,
} from "lucide-react"
import type { ApprovedJob, SchedulingData } from "@/lib/scheduling/types"
import type { Shift } from "@/lib/connecteam/types"
import type { HoursRole, JobEstimateHours } from "@/lib/primeeco/estimate-hours"
import { fmtDate, fmtMoneyCompact, fmtNumber } from "@/lib/format"
import { Panel } from "@/components/dashboard/panel"
import { NavTabs } from "@/components/nav-tabs"

const REFRESH_MS = 300_000
/** Faster poll while the estimated-hours coverage is still building. */
const WARMUP_REFRESH_MS = 15_000

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
const dayName = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short" })

export function SchedulingView({ initial }: { initial: SchedulingData }) {
  const [data, setData] = useState(initial)

  useEffect(() => {
    // Poll fast while hours coverage is building, then settle to the normal
    // cadence once complete.
    const id = setInterval(
      async () => {
        try {
          const res = await fetch("/api/scheduling", { cache: "no-store" })
          if (res.ok) setData((await res.json()) as SchedulingData)
        } catch {
          /* keep last good */
        }
      },
      data.hoursComplete ? REFRESH_MS : WARMUP_REFRESH_MS,
    )
    return () => clearInterval(id)
  }, [data.hoursComplete])

  const c = data.counts
  const available = data.availability.filter((t) => t.available)
  const onRoad = data.availability.filter((t) => !t.available)
  const maxType = Math.max(1, ...data.typeBreakdown.map((t) => t.total))

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-teal-600 to-cyan-600 px-7 py-6 text-white shadow-lg shadow-teal-600/20">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Scheduling</h1>
          <p className="mt-1 text-sm text-teal-100">
            Approvals · appointments · who&apos;s on — PrimeEco + Connecteam
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NavTabs />
          <SourceBadge label="PrimeEco" live={data.primeecoLive} />
          <SourceBadge label="Connecteam" live={data.connecteamLive} />
          <span className="text-sm">{hm(data.generatedAt)}</span>
        </div>
      </header>

      {data.error && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Approved (7d)" value={fmtNumber(c.approved7d)} icon={CalendarCheck} tint="text-emerald-600 bg-emerald-100" />
        <Kpi label="Needs scheduling" value={fmtNumber(c.unscheduled)} icon={AlertTriangle} tint="text-rose-600 bg-rose-100" />
        <Kpi label="Upcoming appts" value={fmtNumber(c.upcoming)} icon={CalendarClock} tint="text-blue-600 bg-blue-100" />
        <Kpi label="Draft (tentative)" value={fmtNumber(c.draft)} icon={FileText} tint="text-amber-600 bg-amber-100" />
        <Kpi label="Open shifts" value={fmtNumber(c.openShifts)} icon={Clock} tint="text-violet-600 bg-violet-100" />
        <Kpi label="Techs on today" value={fmtNumber(c.techsOnToday)} icon={Users} tint="text-teal-600 bg-teal-100" />
      </div>

      {/* Row: recently approved + needs scheduling */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Recently Approved" subtitle={approvalSubtitle(data.approvals)}>
          <ul className="max-h-[420px] space-y-2 overflow-auto">
            {data.approvals.length === 0 && <li className="text-sm text-slate-400">No recent approvals</li>}
            {data.approvals.map((a) => (
              <ApprovalRow key={a.estimateId} a={a} showValues={data.showValues} tone="plain" />
            ))}
          </ul>
        </Panel>

        <Panel title="Needs Scheduling" subtitle="approved but no appointment booked yet" className="ring-1 ring-rose-100">
          <ul className="max-h-[420px] space-y-2 overflow-auto">
            {data.needsScheduling.length === 0 && (
              <li className="text-sm text-emerald-600">🎉 Everything approved is on the roster.</li>
            )}
            {data.needsScheduling.map((a) => (
              <ApprovalRow key={a.estimateId} a={a} showValues={data.showValues} tone="rose" />
            ))}
          </ul>
        </Panel>
      </div>

      {/* Week strip */}
      <div className="mt-5">
        <Panel title="This Week" subtitle="appointments by day · amber = draft, rose = unassigned">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {data.week.map((col) => (
              <div key={col.date} className="min-w-[220px] flex-1 rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-700">{col.label}</span>
                  <span className="text-xs text-slate-400">{col.shifts.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {col.shifts.length === 0 && <li className="text-xs text-slate-300">—</li>}
                  {col.shifts.map((s) => (
                    <ShiftCard key={s.id} shift={s} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Row: appointment types + availability */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Appointments by Type" subtitle="upcoming · confirmed vs draft">
          <ul className="space-y-3">
            {data.typeBreakdown.length === 0 && <li className="text-sm text-slate-400">No upcoming appointments</li>}
            {data.typeBreakdown.map((t) => (
              <li key={t.type} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-700" title={t.type}>
                  {t.type}
                </span>
                <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(t.confirmed / maxType) * 100}%` }}
                    title={`${t.confirmed} confirmed`}
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${(t.draft / maxType) * 100}%` }}
                    title={`${t.draft} draft`}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                  {fmtNumber(t.total)}
                </span>
                {t.draft > 0 && <Chip tone="amber">{t.draft} draft</Chip>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Who's Available Today" subtitle={`${available.length} free · ${onRoad.length} on the road`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600">
                <UserCheck className="h-4 w-4" /> Available
              </h3>
              <ul className="space-y-1.5">
                {available.length === 0 && <li className="text-xs text-slate-400">Nobody free</li>}
                {available.map((t) => (
                  <li key={t.userId} className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-2.5 py-1.5">
                    <span className="truncate text-sm text-slate-700">{t.name}</span>
                    <span className="text-xs text-slate-400">{t.nextAt ? `next ${fmtDate(t.nextAt)}` : "free"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Users className="h-4 w-4" /> On the road
              </h3>
              <ul className="space-y-1.5">
                {onRoad.length === 0 && <li className="text-xs text-slate-400">Nobody booked</li>}
                {onRoad.map((t) => (
                  <li key={t.userId} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span className="truncate text-sm text-slate-700">{t.name}</span>
                    <span className="text-xs font-semibold tabular-nums text-slate-500">{t.todayShifts} today</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {data.openShifts.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-600">
                Unassigned shifts ({data.openShifts.length})
              </h3>
              <ul className="space-y-1.5">
                {data.openShifts.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg bg-rose-50/60 px-2.5 py-1.5">
                    <span className="truncate text-sm text-slate-700" title={s.title}>{s.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{dayName(s.start)} {hm(s.start)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* Estimated labour per approved job — the week-planning table */}
      <div className="mt-5">
        <Panel
          title="Estimated Labour — Recently Approved"
          subtitle={
            data.hoursComplete
              ? "from authorised estimate line items · hours and days reported separately"
              : "loading estimate hours… coverage is still building, this fills in shortly"
          }
        >
          <EstimatedLabourTable approvals={data.approvals} />
        </Panel>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Approvals: PrimeEco authorised estimates · Roster: Connecteam scheduler (drafts included). Refreshes every 5 min.
      </p>
    </div>
  )
}

/* ---- estimated labour ---- */

const ROLE_ORDER: HoursRole[] = ["Technician", "Project Manager", "Supervisor", "Labourer", "Labour", "Other"]
const ROLE_SHORT: Record<HoursRole, string> = {
  Technician: "Tech",
  "Project Manager": "PM",
  Supervisor: "Sup",
  Labourer: "Lab",
  // Labour-trade lines whose description was rewritten (no role keyword).
  Labour: "Labour",
  Other: "Other",
}

const fmtH = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Compact per-role hour chips shown on an approved-job row. */
function HoursChips({ est }: { est: JobEstimateHours | null }) {
  if (!est) return null
  const parts: string[] = []
  for (const role of ROLE_ORDER) {
    const t = est.byRole[role]
    if (!t) continue
    if (t.hours > 0) parts.push(`${ROLE_SHORT[role]} ${fmtH(t.hours)}h`)
    if (t.days > 0) parts.push(`${ROLE_SHORT[role]} ${fmtH(t.days)}d`)
  }
  if (parts.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p} className="inline-flex rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
          {p}
        </span>
      ))}
    </div>
  )
}

/** Week-planning table: estimated labour per approved job, by role. */
function EstimatedLabourTable({ approvals }: { approvals: ApprovedJob[] }) {
  const rows = approvals.filter((a) => a.estHours && (a.estHours.totalHours > 0 || a.estHours.totalDays > 0))
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No labour lines found on recent authorised estimates.</p>
  }
  const totals: Record<HoursRole, { hours: number; days: number }> = {
    Technician: { hours: 0, days: 0 },
    "Project Manager": { hours: 0, days: 0 },
    Supervisor: { hours: 0, days: 0 },
    Labourer: { hours: 0, days: 0 },
    Labour: { hours: 0, days: 0 },
    Other: { hours: 0, days: 0 },
  }
  for (const a of rows) {
    for (const role of ROLE_ORDER) {
      const t = a.estHours!.byRole[role]
      if (!t) continue
      totals[role].hours += t.hours
      totals[role].days += t.days
    }
  }
  const cell = (t?: { hours: number; days: number }) => {
    if (!t || (t.hours === 0 && t.days === 0)) return <span className="text-slate-300">—</span>
    return (
      <>
        {t.hours > 0 && <span>{fmtH(t.hours)}h</span>}
        {t.hours > 0 && t.days > 0 && <span className="text-slate-300"> · </span>}
        {t.days > 0 && <span className="text-amber-700">{fmtH(t.days)}d</span>}
      </>
    )
  }
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-4 font-semibold">Job #</th>
            <th className="py-2 pr-4 font-semibold">Client</th>
            <th className="py-2 pr-4 font-semibold">Scheduled</th>
            {ROLE_ORDER.map((r) => (
              <th key={r} className="py-2 pr-4 text-right font-semibold">
                {ROLE_SHORT[r]}
              </th>
            ))}
            <th className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.jobId} className="border-b border-slate-50 hover:bg-slate-50/60">
              <td className="whitespace-nowrap py-2 pr-4 font-semibold text-slate-900">{a.jobNumber}</td>
              <td className="max-w-[180px] truncate py-2 pr-4 text-slate-600">{a.client}</td>
              <td className="whitespace-nowrap py-2 pr-4">
                {a.scheduled ? <Chip tone="emerald">{a.firstShiftAt ? fmtDate(a.firstShiftAt) : "yes"}</Chip> : <Chip tone="rose">not yet</Chip>}
              </td>
              {ROLE_ORDER.map((r) => (
                <td key={r} className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-slate-700">
                  {cell(a.estHours!.byRole[r])}
                </td>
              ))}
              <td className="whitespace-nowrap py-2 text-right font-bold tabular-nums text-slate-900">
                {cell({ hours: a.estHours!.totalHours, days: a.estHours!.totalDays })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 text-sm font-bold text-slate-900">
            <td className="py-2 pr-4" colSpan={3}>
              Total ({rows.length} jobs)
            </td>
            {ROLE_ORDER.map((r) => (
              <td key={r} className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                {cell(totals[r])}
              </td>
            ))}
            <td className="whitespace-nowrap py-2 text-right tabular-nums">
              {cell({
                hours: ROLE_ORDER.reduce((s, r) => s + totals[r].hours, 0),
                days: ROLE_ORDER.reduce((s, r) => s + totals[r].days, 0),
              })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ---- small building blocks ---- */

/** Panel subtitle — the board shows Authorised Works on open jobs only. */
function approvalSubtitle(rows: ApprovedJob[]): string {
  const scheduled = rows.filter((a) => a.scheduled).length
  return `${rows.length} authorised works · open jobs · last 14 days · ${scheduled} scheduled`
}

/**
 * One approval row: click to expand the full detail — estimate label/type,
 * job type, site address, works description and every estimate line (scope).
 */
function ApprovalRow({ a, showValues, tone }: { a: ApprovedJob; showValues: boolean; tone: "plain" | "rose" }) {
  const [open, setOpen] = useState(false)
  const shell = tone === "rose" ? "bg-rose-50/60" : "border border-slate-100"
  return (
    <li className={`rounded-xl ${shell}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{a.jobNumber}</span>
            {a.jobType && <Chip tone="slate">{a.jobType}</Chip>}
            {a.invoiced && !a.invoiced.progress ? (
              <Chip tone="emerald">✓ invoiced {a.invoiced.invoiceNumber} · works done</Chip>
            ) : a.scheduled ? (
              <Chip tone="emerald">scheduled {a.firstShiftAt ? `· ${fmtDate(a.firstShiftAt)}` : ""}</Chip>
            ) : (
              <Chip tone="rose">needs booking</Chip>
            )}
            {a.invoiced?.progress && <Chip tone="amber">progress invoice {a.invoiced.invoiceNumber}</Chip>}
          </div>
          {/* Quote identity: PrimeEco has no estimate number, so name + ref. */}
          <div className="truncate text-xs font-medium text-slate-700">
            {a.estimateLabel ?? "Untitled quote"}
            <span className="ml-1.5 font-normal tabular-nums text-slate-400">#{a.estimateRef}</span>
          </div>
          <div className="truncate text-xs text-slate-500">
            {a.client} · {a.division} · {a.estimator}
          </div>
          <HoursChips est={a.estHours} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            {showValues && (
              <div className="text-sm font-bold tabular-nums text-slate-900">{fmtMoneyCompact(a.valueExGst)}</div>
            )}
            <div className="text-xs text-slate-400">{fmtDate(a.approvedAt)}</div>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 text-sm">
          <div className="mb-1.5 text-xs text-slate-600">
            <span className="font-semibold">Quote:</span> {a.estimateLabel ?? "Untitled"}{" "}
            <span className="tabular-nums text-slate-400">#{a.estimateRef}</span>
            {a.estimateDescription ? ` — ${a.estimateDescription}` : ""}
          </div>

          {a.invoices.length > 0 && (
            <div className="mb-2 rounded-lg bg-emerald-50/70 p-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                Invoiced ({a.invoices.length})
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {a.invoices.map((inv) => (
                  <li key={inv.invoiceNumber} className="text-xs text-emerald-800">
                    {inv.invoiceNumber} · {inv.invoicedDate ?? "—"} · {inv.status}
                    {inv.progress ? " · progress payment" : " · final"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.address && (
            <div className="mb-1.5 flex items-start gap-1.5 text-slate-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{a.address}</span>
            </div>
          )}
          {a.jobDescription && (
            <div className="mb-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {a.jobDescription}
            </div>
          )}

          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            Estimate lines ({a.lines.length})
          </div>
          <ul className="max-h-64 space-y-1.5 overflow-auto">
            {a.lines.length === 0 && <li className="text-xs text-slate-400">Line detail still loading…</li>}
            {a.lines.map((l, i) => (
              <li key={i} className="rounded-lg border border-slate-100 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="slate">{l.trade}</Chip>
                  {l.role && <Chip tone="teal">{l.role}</Chip>}
                  {l.labourQuantity > 0 && l.labourUnit && (
                    <span className="text-xs font-semibold tabular-nums text-slate-700">
                      {l.labourQuantity} {l.labourUnit}
                    </span>
                  )}
                  {l.materialQuantity > 0 && l.materialUnit && (
                    <span className="text-xs tabular-nums text-slate-500">
                      {l.materialQuantity} {l.materialUnit}
                    </span>
                  )}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{l.description}</div>
                {l.notes && <div className="mt-1 text-[11px] italic text-slate-400">{l.notes}</div>}
              </li>
            ))}
          </ul>

          {a.primeUrl && (
            <a
              href={a.primeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline"
            >
              Open in PrimeEco <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </li>
  )
}

function ShiftCard({ shift }: { shift: Shift }) {
  const tone = shift.open ? "border-rose-200 bg-rose-50" : shift.status === "draft" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
  return (
    <li className={`rounded-lg border px-2 py-1.5 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-slate-600">{hm(shift.start)}</span>
        <div className="flex gap-1">
          {shift.status === "draft" && <Chip tone="amber">draft</Chip>}
          {shift.open && <Chip tone="rose">open</Chip>}
        </div>
      </div>
      <div className="truncate text-xs font-medium text-slate-800" title={shift.title}>
        {shift.type}
      </div>
      <div className="truncate text-[11px] text-slate-400">
        {shift.open ? "unassigned" : shift.userNames.join(", ")}
      </div>
    </li>
  )
}

const CHIP_TONES = {
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  violet: "bg-violet-100 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
  teal: "bg-teal-100 text-teal-700",
} as const

function Chip({ tone, children }: { tone: keyof typeof CHIP_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  )
}

function SourceBadge({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        live ? "bg-emerald-300/25 text-white" : "bg-amber-300/25 text-white"
      }`}
      title={`${label}: ${live ? "live data" : "sample data"}`}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-200 animate-pulse" : "bg-amber-200"}`} />
      {label}
    </span>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string
  value: string
  icon: typeof CalendarCheck
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
    </div>
  )
}
