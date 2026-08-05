import type { DashboardJob } from "@/lib/primeeco/types"
import { fmtDate, fmtMoney } from "@/lib/format"
import { Panel } from "./panel"

/** Compact recent-jobs table (light theme). */
export function JobsTable({ jobs }: { jobs: DashboardJob[] }) {
  return (
    <Panel title="Recent Jobs" subtitle={`latest ${jobs.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-4 font-semibold">Job #</th>
              <th className="py-2.5 pr-4 font-semibold">Status</th>
              <th className="py-2.5 pr-4 font-semibold">Client</th>
              <th className="py-2.5 pr-4 font-semibold">Estimator</th>
              <th className="py-2.5 pr-4 font-semibold">Region</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Value</th>
              <th className="py-2.5 text-right font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="whitespace-nowrap py-2.5 pr-4 font-semibold text-slate-900">{job.jobNumber}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-slate-600">{job.status}</td>
                <td className="max-w-[180px] truncate py-2.5 pr-4 text-slate-600">{job.client ?? "—"}</td>
                <td className="max-w-[150px] truncate py-2.5 pr-4 text-slate-600">{job.estimator ?? "—"}</td>
                <td className="max-w-[130px] truncate py-2.5 pr-4 text-slate-400">{job.region ?? "—"}</td>
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
    </Panel>
  )
}
