/**
 * Maps a job status to a stable colour by keyword, so the same status always
 * renders the same hue across charts, badges, and tables. Falls back to a
 * deterministic palette slot for unrecognised statuses.
 */

const KEYWORD_COLORS: { match: string; bar: string; dot: string; text: string }[] = [
  { match: "new", bar: "bg-sky-500", dot: "bg-sky-500", text: "text-sky-400" },
  { match: "allocat", bar: "bg-indigo-500", dot: "bg-indigo-500", text: "text-indigo-400" },
  { match: "site", bar: "bg-cyan-500", dot: "bg-cyan-500", text: "text-cyan-400" },
  { match: "progress", bar: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-400" },
  { match: "approv", bar: "bg-orange-500", dot: "bg-orange-500", text: "text-orange-400" },
  { match: "estimate", bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-400" },
  { match: "invoic", bar: "bg-teal-500", dot: "bg-teal-500", text: "text-teal-400" },
  { match: "complet", bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-400" },
  { match: "clos", bar: "bg-emerald-600", dot: "bg-emerald-600", text: "text-emerald-500" },
  { match: "cancel", bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-400" },
]

const FALLBACK = [
  { bar: "bg-slate-400", dot: "bg-slate-400", text: "text-slate-300" },
  { bar: "bg-fuchsia-500", dot: "bg-fuchsia-500", text: "text-fuchsia-400" },
  { bar: "bg-lime-500", dot: "bg-lime-500", text: "text-lime-400" },
  { bar: "bg-blue-500", dot: "bg-blue-500", text: "text-blue-400" },
]

export function statusColor(status: string) {
  const s = status.toLowerCase()
  const hit = KEYWORD_COLORS.find((k) => s.includes(k.match))
  if (hit) return { bar: hit.bar, dot: hit.dot, text: hit.text }
  // Stable fallback based on a simple hash of the label.
  let hash = 0
  for (let i = 0; i < status.length; i++) hash = (hash * 31 + status.charCodeAt(i)) >>> 0
  return FALLBACK[hash % FALLBACK.length]
}
