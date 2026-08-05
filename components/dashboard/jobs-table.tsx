import type { DashboardJob } from "@/lib/primeeco/types"
import { fmtDate, fmtMoney } from "@/lib/format"
import { statusColor } from "./status-colors"
import { Panel } from "./panel"

/** Compact recent-jobs table with status badges. */
export function JobsTable({ jobs }: { jobs: DashboardJob[] }) {
  return (
    <Panel title="Recent Jobs" subtitle={`latest ${jobs.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4 font-medium">Job #</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Client</th>
              <th className="py-2 pr-4 font-medium">Estimator</th>
              <th className="py-2 pr-4 font-medium">Region</th>
              <th className="py-2 pr-4 font-medium text-right">Value</th>
              <th className="py-2 font-medium text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const c = statusColor(job.status)
              return (
                <tr key={job.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2 pr-4 font-medium text-slate-100 whitespace-nowrap">{job.jobNumber}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                      <span className="text-slate-300">{job.status}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-300 truncate max-w-[160px]">{job.client ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-300 truncate max-w-[140px]">{job.estimator ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{job.region ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-100">{fmtMoney(job.value)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400 whitespace-nowrap">
                    {fmtDate(job.createdAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
