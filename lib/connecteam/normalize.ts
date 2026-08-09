import type { RawShift, RawCtUser, Shift, CtUser } from "./types"

/**
 * Anti-corruption layer for Connecteam. Converts raw shifts/users into the
 * clean shapes the scheduling dashboard consumes. ALL Connecteam field
 * knowledge lives here so it can be tuned against a real payload without
 * touching any UI code (mirrors lib/primeeco/normalize.ts).
 */

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim()
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

/** Connecteam times are unix epoch SECONDS; also tolerate ms and ISO strings. */
function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // < 10^12 ⇒ seconds, otherwise already milliseconds.
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const s = toStr(value)
  if (!s) return null
  if (/^\d+$/.test(s)) return toIso(Number(s))
  const d = new Date(s.replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Classify an appointment "type" from a shift title. Coordinators encode the
 * type in the title (e.g. "Moisture Check — 12 Smith St"), so we match known
 * keywords and fall back to "Other". TUNE this table against the real titles
 * once we can read live data — add every type the ops team actually uses.
 */
const TYPE_RULES: Array<{ type: string; re: RegExp }> = [
  { type: "Moisture Check", re: /moisture|reading|drop\s*off|monitor/i },
  { type: "Make Safe", re: /make\s*safe|emergency|mitigation/i },
  { type: "Inspection", re: /inspect|assess|scope/i },
  { type: "Install / Setup", re: /install|set\s*up|setup|equipment|dehu|air\s*mover/i },
  { type: "Collection", re: /collect|pick\s*up|pickup|de-?rig|derig|removal/i },
  { type: "Demolition / Strip", re: /demo|strip|tear\s*out/i },
  { type: "Cleaning", re: /clean|sanitis|sanitiz|antimicrobial/i },
  { type: "Repairs / Reinstate", re: /repair|reinstate|rebuild|carpentry|paint/i },
]

export function classifyType(title: string): string {
  for (const rule of TYPE_RULES) if (rule.re.test(title)) return rule.type
  return "Other"
}

export function normalizeShift(raw: RawShift, schedulerId: string, userName: Map<string, string>): Shift {
  const id = toStr(raw.id) ?? crypto.randomUUID()
  const title = toStr(raw.title) ?? "Untitled shift"
  const userIds = (raw.userIds ?? []).map((u) => String(u)).filter(Boolean)

  // Draft detection: Connecteam has exposed this as isPublished OR isDraft
  // depending on version. Treat "explicitly published" as the only confirmed
  // state; anything else is tentative/draft.
  const published = raw.isPublished === true || raw.isDraft === false
  const status: Shift["status"] = published ? "published" : "draft"

  return {
    id,
    title,
    start: toIso(raw.startTime) ?? new Date().toISOString(),
    end: toIso(raw.endTime) ?? toIso(raw.startTime) ?? new Date().toISOString(),
    ctJobId: toStr(raw.jobId),
    userIds,
    userNames: userIds.map((uid) => userName.get(uid) ?? "Unknown").filter(Boolean),
    status,
    open: raw.isOpenShift === true || userIds.length === 0,
    schedulerId,
    type: classifyType(title),
  }
}

export function normalizeUser(raw: RawCtUser): CtUser | null {
  const id = toStr(raw.userId) ?? toStr(raw.id)
  if (!id) return null
  const name =
    toStr(raw.fullName) ?? [toStr(raw.firstName), toStr(raw.lastName)].filter(Boolean).join(" ").trim()
  return { id, name: name || `User ${id}` }
}
