import type { AgingBucket } from "@/lib/primeeco/types"
import { fmtNumber } from "@/lib/format"
import { Panel } from "./panel"

/** Vertical column chart of active-job age buckets — highlights stale jobs. */
export function AgingChart({ buckets }: { buckets: AgingBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <Panel title="Active Job Aging" subtitle="days since created">
      <div className="flex h-44 items-end justify-between gap-3">
        {buckets.map((b, i) => {
          // Older buckets shade warmer to draw the eye to aging work.
          const warm = ["bg-emerald-500", "bg-lime-500", "bg-amber-500", "bg-orange-500", "bg-rose-500"]
          return (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-100">{fmtNumber(b.count)}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md ${warm[i] ?? "bg-slate-500"} transition-all duration-500`}
                  style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
                />
              </div>
              <span className="text-center text-[11px] leading-tight text-slate-400">{b.label}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
