import "server-only"
import { getDashboardData } from "./index"
import { isCompleted } from "./aggregate"
import type { DashboardJob } from "./types"

/**
 * Financial aggregation for the management dashboard. Every figure is EX-GST —
 * it uses DashboardJob.value, which is sourced from
 * authorisedTotalExcludingTax. Jobs are grouped by their created date.
 *
 * Reuses getDashboardData() so it shares the same cached PrimeEco fetch (no
 * extra API calls / rate-limit cost).
 */

export interface FinancePoint {
  key: string
  label: string
  value: number
  projected?: boolean
}

export interface FinanceClient {
  name: string
  value: number
  count: number
}

export interface FinanceData {
  live: boolean
  error?: string
  generatedAt: string
  totals: {
    allTime: number
    earned: number // completed / settled jobs
    thisYear: number
    thisMonth: number
    today: number
    avgPerJob: number
    jobCount: number
  }
  byYear: { year: number; value: number; count: number }[]
  /** Last 12 actual months + a 3-month forecast (projected: true). */
  monthly: FinancePoint[]
  byClient: FinanceClient[]
  /** Sum of the forecast months, for the headline "projected" figure. */
  forecastTotal: number
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Least-squares linear projection of the next `periods` values from history. */
function forecast(history: number[], periods: number): number[] {
  const w = history.slice(-6)
  const m = w.length
  if (m < 2) return Array(periods).fill(w[m - 1] ?? 0)
  const xs = w.map((_, i) => i)
  const sx = xs.reduce((a, b) => a + b, 0)
  const sy = w.reduce((a, b) => a + b, 0)
  const sxx = xs.reduce((a, b) => a + b * b, 0)
  const sxy = xs.reduce((a, b, i) => a + b * w[i], 0)
  const denom = m * sxx - sx * sx
  const slope = denom !== 0 ? (m * sxy - sx * sy) / denom : 0
  const intercept = (sy - slope * sx) / m
  return Array.from({ length: periods }, (_, k) => Math.max(0, intercept + slope * (m + k)))
}

export function aggregateFinance(
  jobs: DashboardJob[],
  meta: { live: boolean; error?: string },
): FinanceData {
  const now = new Date()
  const y = now.getFullYear()
  const mth = now.getMonth()
  const todayKey = now.toISOString().slice(0, 10)

  let allTime = 0
  let earned = 0
  let thisYear = 0
  let thisMonth = 0
  let today = 0

  const yearMap = new Map<number, { value: number; count: number }>()
  const monthMap = new Map<string, number>()
  const clientMap = new Map<string, { value: number; count: number }>()

  for (const j of jobs) {
    const v = j.value
    allTime += v
    if (isCompleted(j)) earned += v

    const cName = j.client ?? "Unknown"
    const c = clientMap.get(cName) ?? { value: 0, count: 0 }
    c.value += v
    c.count += 1
    clientMap.set(cName, c)

    if (!j.createdAt) continue
    const d = new Date(j.createdAt)
    const jy = d.getFullYear()
    const ym = yearMap.get(jy) ?? { value: 0, count: 0 }
    ym.value += v
    ym.count += 1
    yearMap.set(jy, ym)

    const mKey = `${jy}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthMap.set(mKey, (monthMap.get(mKey) ?? 0) + v)

    if (jy === y) thisYear += v
    if (jy === y && d.getMonth() === mth) thisMonth += v
    if (j.createdAt.slice(0, 10) === todayKey) today += v
  }

  // Last 12 months of actuals.
  const monthly: FinancePoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, mth - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthly.push({ key, label: MONTHS[d.getMonth()], value: monthMap.get(key) ?? 0 })
  }

  // 3-month forecast appended.
  const proj = forecast(monthly.map((p) => p.value), 3)
  proj.forEach((value, k) => {
    const d = new Date(y, mth + 1 + k, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthly.push({ key, label: MONTHS[d.getMonth()], value, projected: true })
  })

  const byYear = [...yearMap.entries()]
    .map(([year, v]) => ({ year, value: v.value, count: v.count }))
    .sort((a, b) => a.year - b.year)

  const byClient = [...clientMap.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .sort((a, b) => b.value - a.value)

  return {
    live: meta.live,
    error: meta.error,
    generatedAt: new Date().toISOString(),
    totals: {
      allTime,
      earned,
      thisYear,
      thisMonth,
      today,
      jobCount: jobs.length,
      avgPerJob: jobs.length ? allTime / jobs.length : 0,
    },
    byYear,
    monthly,
    byClient,
    forecastTotal: proj.reduce((a, b) => a + b, 0),
  }
}

export async function getFinanceData(): Promise<FinanceData> {
  const dash = await getDashboardData()
  return aggregateFinance(dash.jobs, { live: dash.live, error: dash.error })
}
