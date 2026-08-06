import "server-only"
import { getReceivablesData } from "./receivables"
import type { ArRow } from "./receivables"

/**
 * Financial aggregation for the management dashboard — now sourced from the
 * ACCURATE Accounts Receivable invoices (validated against PrimeEco: last month
 * = 369,758.68). Every figure is EX-GST (invoice subtotal), grouped by
 * invoicedDate, excluding Draft & Cancelled (handled in receivables.ts).
 *
 * Reuses getReceivablesData() so it shares the same cached AR fetch.
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
    allTime: number // total invoiced (ex-GST)
    earned: number // collected (paid)
    thisYear: number
    thisMonth: number
    today: number
    avgPerJob: number // avg per invoice
    jobCount: number // invoice count
  }
  byYear: { year: number; value: number; count: number }[]
  /** Last 12 actual months + a 3-month forecast (projected: true). */
  monthly: FinancePoint[]
  byClient: FinanceClient[]
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

function aggregate(invoices: ArRow[], meta: { live: boolean; error?: string }): FinanceData {
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

  for (const inv of invoices) {
    const v = inv.exGst
    allTime += v
    if (inv.paid) earned += v

    const cName = inv.client || "Unknown"
    const c = clientMap.get(cName) ?? { value: 0, count: 0 }
    c.value += v
    c.count += 1
    clientMap.set(cName, c)

    if (!inv.invoicedDate) continue
    const [yy, mm] = inv.invoicedDate.split("-")
    const jy = Number(yy)
    const jm = Number(mm) - 1

    const ym = yearMap.get(jy) ?? { value: 0, count: 0 }
    ym.value += v
    ym.count += 1
    yearMap.set(jy, ym)

    monthMap.set(`${jy}-${String(jm + 1).padStart(2, "0")}`, (monthMap.get(`${jy}-${String(jm + 1).padStart(2, "0")}`) ?? 0) + v)

    if (jy === y) thisYear += v
    if (jy === y && jm === mth) thisMonth += v
    if (inv.invoicedDate === todayKey) today += v
  }

  const monthly: FinancePoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, mth - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthly.push({ key, label: MONTHS[d.getMonth()], value: monthMap.get(key) ?? 0 })
  }
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
      jobCount: invoices.length,
      avgPerJob: invoices.length ? allTime / invoices.length : 0,
    },
    byYear,
    monthly,
    byClient,
    forecastTotal: proj.reduce((a, b) => a + b, 0),
  }
}

export async function getFinanceData(): Promise<FinanceData> {
  const ar = await getReceivablesData()
  return aggregate(ar.invoices, { live: ar.live, error: ar.error })
}
