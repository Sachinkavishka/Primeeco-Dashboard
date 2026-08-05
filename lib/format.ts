/** Shared display formatters (AUD, restoration industry is Australia-based). */

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
})

const number = new Intl.NumberFormat("en-AU")

export const fmtMoney = (n: number) => currency.format(n)
export const fmtMoneyCompact = (n: number) => compactCurrency.format(n)
export const fmtNumber = (n: number) => number.format(n)

export function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
