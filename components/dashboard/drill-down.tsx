"use client"

import { useEffect, useMemo } from "react"
import { X } from "lucide-react"
import type { DashboardJob } from "@/lib/primeeco/types"
import { fmtDate, fmtMoney } from "@/lib/format"
import { catColor } from "./charts/palette"
import { DonutChart } from "./charts/donut-chart"

export interface DrillState {
  title: string
  jobs: DashboardJob[]
}

/**
 * Drill-down overlay: shows the jobs behind a clicked segment (an assignee,
 * estimator, status, region…) — a status summary plus the full job list.
 */
export function DrillDown({ drill, onClose }: { drill: DrillState; onClose: () => void }) {
  // Esc to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  const { jobs, title } = drill

  // Status summary (counts by status), coloured consistently by rank.
  const statusSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jobs) map.set(j.status, (map.get(j.status) ?? 0) + 1)
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    return entries.map(([status, count], i) => ({ status, count, color: catColor(i) }))
  }, [jobs])

  const statusColor = new Map(statusSummary.map((s) => [s.status, s.color]))
  const totalValue = jobs.reduce((a, j) => a + j.value, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-5">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {jobs.length} job{jobs.length === 1 ? "" : "s"} · {fmtMoney(totalValue)} total
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Jobs-by-status donut */}
        <div className="border-b border-slate-100 px-7 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Jobs by status</p>
          <DonutChart
            data={statusSummary.map((s) => ({ label: s.status, value: s.count, color: s.color }))}
            centerLabel="jobs"
            size={160}
          />
        </div>

        {/* Jobs table */}
        <div className="overflow-y-auto px-7 py-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4 font-semibold">Job #</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Client</th>
                <th className="py-2 pr-4 text-right font-semibold">Value</th>
                <th className="py-2 text-right font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-2.5 pr-4 font-semibold text-slate-900">{job.jobNumber}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: statusColor.get(job.status) ?? "#94a3b8" }}
                      />
                      {job.status}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate py-2.5 pr-4 text-slate-600">{job.client ?? "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-slate-900">
                    {fmtMoney(job.value)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-slate-400">
                    {fmtDate(job.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
