import "server-only"
import { unstable_cache } from "next/cache"
import { apiFetch } from "./client"
import { getDashboardData } from "./index"
import { getLookups } from "./lookups"

/**
 * Accounts Receivable data from /accounts-receivable-invoices.
 *
 * Definition validated against PrimeEco's own figure (last month = 369,758.68):
 *   receivable amount = subtotal (EX-GST), by invoicedDate,
 *   EXCLUDING statuses "Draft" and "Cancelled".
 * Outstanding = counted & not Paid. Collected = Paid.
 *
 * Cached 30 min; only fetched when the /receivables page loads.
 */

const EXCLUDED = new Set(["Draft", "Cancelled"])

export interface ArRow {
  id: string
  invoiceNumber: string
  jobNumber: string
  status: string
  paid: boolean
  exGst: number
  incGst: number
  invoicedDate: string | null
  dueDate: string | null
  client: string
  division: string
  region: string | null
}

export interface ReceivablesData {
  live: boolean
  generatedAt: string
  error?: string
  invoices: ArRow[]
  divisions: string[]
  clients: string[]
  regions: string[]
}

interface Envelope {
  data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
  meta?: { pagination?: { total_pages?: number } }
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)
const dateOnly = (v: unknown): string | null => {
  const s = str(v)
  return s ? s.slice(0, 10) : null
}

async function fetchAr(): Promise<Envelope["data"]> {
  const rows: NonNullable<Envelope["data"]> = []
  let failed = false
  for (let p = 1; p <= 8; p++) {
    let r: Envelope
    try {
      r = await apiFetch<Envelope>("/accounts-receivable-invoices", { searchParams: { page: p, per_page: 500 } })
    } catch {
      failed = true
      break
    }
    const items = r.data ?? []
    rows.push(...items)
    const tp = r.meta?.pagination?.total_pages
    if (items.length < 500 || (tp !== undefined && p >= tp)) break
  }
  if (rows.length === 0 && failed) throw new Error("AR invoice fetch failed (rate limit?)")
  return rows
}

const getCachedAr = unstable_cache(fetchAr, ["primeeco-ar-invoices-v1"], {
  revalidate: 1800,
  tags: ["primeeco-receivables"],
})

export async function getReceivablesData(): Promise<ReceivablesData> {
  // Fetch invoices and the job data concurrently. The money figures come from
  // the invoices alone, so a slow/failed job fetch never blocks them — it only
  // affects the client/division/region enrichment.
  const [dashRes, arRes, lookRes] = await Promise.allSettled([getDashboardData(), getCachedAr(), getLookups()])

  const dash = dashRes.status === "fulfilled" ? dashRes.value : null
  const jobById = new Map((dash?.jobs ?? []).map((j) => [j.id, j]))
  const live = dash?.live ?? false
  // All configured divisions (so e.g. DFM-QLD shows in the filter even with no invoices yet).
  const allDivisions = lookRes.status === "fulfilled" ? [...lookRes.value.divisionName.values()].sort() : []

  let raw: Envelope["data"] = []
  let error: string | undefined
  if (arRes.status === "fulfilled") {
    raw = arRes.value
  } else {
    error = arRes.reason instanceof Error ? arRes.reason.message : "Failed to load receivables"
  }

  const invoices: ArRow[] = (raw ?? [])
    .filter((e) => !EXCLUDED.has(str((e.attributes ?? {}).accountsReceivableInvoiceStatus) ?? ""))
    .map((e) => {
      const a = e.attributes ?? {}
      const job = jobById.get(str(a.jobId) ?? "")
      const status = str(a.accountsReceivableInvoiceStatus) ?? "Unknown"
      return {
        id: e.id ?? crypto.randomUUID(),
        invoiceNumber: str(a.invoiceNumber) ?? "—",
        jobNumber: job?.jobNumber ?? "—",
        status,
        paid: status === "Paid",
        exGst: num(a.subtotal),
        incGst: num(a.total),
        invoicedDate: dateOnly(a.invoicedDate),
        dueDate: dateOnly(a.dueDate),
        client: job?.client ?? "Unknown",
        division: job?.division ?? "—",
        region: job?.region ?? null,
      }
    })

  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter((x): x is string => Boolean(x)))].sort()

  return {
    live,
    generatedAt: new Date().toISOString(),
    error,
    invoices,
    divisions: allDivisions.length ? allDivisions : uniq(invoices.map((e) => e.division)),
    clients: uniq(invoices.map((e) => e.client)),
    regions: uniq(invoices.map((e) => e.region)),
  }
}
