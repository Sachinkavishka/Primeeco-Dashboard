import "server-only"
import { cookies } from "next/headers"
import { getRoster } from "@/lib/connecteam"
import type { Shift } from "@/lib/connecteam/types"
import { getEstimatesData } from "@/lib/primeeco/estimates"
import { getEstimateHours } from "@/lib/primeeco/estimate-hours"
import type { JobEstimateHours } from "@/lib/primeeco/estimate-hours"
import { getMockApprovals, getMockHours } from "./mock"
import type { ApprovalSource, ApprovedJob, DayColumn, SchedulingData, TechAvailability, TypeBucket } from "./types"

/**
 * Scheduling facade. Joins two systems for the coordinator view:
 *   • PrimeEco  — approvals (authorised estimates = "we won the job").
 *   • Connecteam — the roster (who is scheduled when, incl. drafts / open shifts).
 *
 * Both reads are already cached inside their own facades, so this just shapes
 * and joins their output; no extra caching layer is needed here.
 */

const DAY_MS = 86_400_000
const APPROVAL_WINDOW_DAYS = 14
const RECENT_DAYS = 7

/** Our "approved" signal: authorised estimates only. */
const APPROVED_STATUS = /authoris|approved/i

/**
 * Job $ values are financial data (management-only, per the finance-tab rule),
 * so we only expose them when the management passcode is unlocked — same
 * httpOnly `dfm_fin` cookie the finance pages gate on. When locked, values are
 * stripped server-side and never reach the coordinator's browser.
 */
async function financeUnlocked(): Promise<boolean> {
  const store = await cookies()
  const passcode = process.env.FINANCE_PASSCODE || "detail"
  return store.get("dfm_fin")?.value === passcode
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Fallback token match for the sample data (job number inside the shift title /
 * id). Live data uses the exact jobId match below, so this only matters offline.
 */
function shiftMatchesJob(shift: Shift, jobNumber: string): boolean {
  const num = jobNumber.replace(/[^0-9a-z]/gi, "").toLowerCase()
  if (num.length < 3) return false
  const hay = `${shift.title} ${shift.ctJobId ?? ""}`.replace(/[^0-9a-z]/gi, "").toLowerCase()
  return hay.includes(num)
}

function toApprovedJob(e: ApprovalSource, shifts: Shift[], hoursByJob: Record<string, JobEstimateHours>): ApprovedJob {
  // Connecteam shift.jobId IS the PrimeEco job UUID (systems are synced), so we
  // join exactly on it; the title-token heuristic is a fallback for sample data.
  const matches = shifts.filter(
    (s) =>
      (s.ctJobId && e.jobId && s.ctJobId === e.jobId) ||
      (e.jobNumber && e.jobNumber !== "—" && shiftMatchesJob(s, e.jobNumber)),
  )
  const firstShift = matches
    .map((s) => s.start)
    .sort()
    .at(0)
  return {
    jobId: e.jobId,
    jobNumber: e.jobNumber,
    client: e.client,
    division: e.division,
    estimator: e.estimator,
    valueExGst: e.valueExGst,
    approvedAt: e.createdAt,
    scheduled: matches.length > 0,
    firstShiftAt: firstShift ?? null,
    estHours: hoursByJob[e.jobId] ?? null,
  }
}

function buildWeek(shifts: Shift[]): DayColumn[] {
  const today = startOfToday()
  const cols: DayColumn[] = []
  for (let i = 0; i < 7; i++) {
    const day = today + i * DAY_MS
    const next = day + DAY_MS
    const dayShifts = shifts
      .filter((s) => {
        const t = new Date(s.start).getTime()
        return t >= day && t < next
      })
      .sort((a, b) => a.start.localeCompare(b.start))
    cols.push({
      date: new Date(day).toISOString(),
      label: new Date(day).toLocaleDateString("en-AU", { weekday: "short", day: "2-digit" }),
      shifts: dayShifts,
    })
  }
  return cols
}

function buildTypeBreakdown(shifts: Shift[]): TypeBucket[] {
  const today = startOfToday()
  const upcoming = shifts.filter((s) => new Date(s.start).getTime() >= today)
  const byType = new Map<string, TypeBucket>()
  for (const s of upcoming) {
    const b = byType.get(s.type) ?? { type: s.type, total: 0, draft: 0, confirmed: 0 }
    b.total += 1
    if (s.status === "draft") b.draft += 1
    else b.confirmed += 1
    byType.set(s.type, b)
  }
  return [...byType.values()].sort((a, b) => b.total - a.total)
}

function buildAvailability(shifts: Shift[], users: { id: string; name: string }[]): TechAvailability[] {
  const today = startOfToday()
  const tomorrow = today + DAY_MS
  const todayPublished = shifts.filter(
    (s) => s.status === "published" && new Date(s.start).getTime() >= today && new Date(s.start).getTime() < tomorrow,
  )
  const upcomingByUser = new Map<string, string[]>()
  for (const s of shifts) {
    if (new Date(s.start).getTime() < today) continue
    for (const uid of s.userIds) {
      const arr = upcomingByUser.get(uid) ?? []
      arr.push(s.start)
      upcomingByUser.set(uid, arr)
    }
  }

  return users
    .map((u) => {
      const todayCount = todayPublished.filter((s) => s.userIds.includes(u.id)).length
      const next = (upcomingByUser.get(u.id) ?? []).sort().at(0) ?? null
      return {
        userId: u.id,
        name: u.name,
        todayShifts: todayCount,
        nextAt: next,
        available: todayCount === 0,
      }
    })
    .sort((a, b) => Number(a.available) - Number(b.available) || a.name.localeCompare(b.name))
}

export async function getSchedulingData(): Promise<SchedulingData> {
  const [est, roster, hoursRes] = await Promise.all([getEstimatesData(), getRoster(), getEstimateHours()])

  const shifts = roster.shifts
  const today = startOfToday()
  const windowStart = today - APPROVAL_WINDOW_DAYS * DAY_MS

  // When PrimeEco isn't configured, populate the SAMPLE board with mock
  // approvals so the join demonstrates (matches Operations' mock behaviour).
  const usingMockApprovals = !est.live && est.estimates.length === 0
  const estimateRows: ApprovalSource[] = usingMockApprovals ? getMockApprovals() : est.estimates
  // Estimated labour hours per job — mock hours accompany mock approvals so the
  // SAMPLE board demonstrates the feature end-to-end.
  const hoursByJob = usingMockApprovals ? getMockHours() : hoursRes.byJob

  // Approvals: authorised estimates within the recent window, newest first.
  const approvals: ApprovedJob[] = estimateRows
    .filter((e) => APPROVED_STATUS.test(e.status))
    .filter((e) => {
      if (!e.createdAt) return false
      return new Date(e.createdAt).getTime() >= windowStart
    })
    .map((e) => toApprovedJob(e, shifts, hoursByJob))
    .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))

  const recentCutoff = today - RECENT_DAYS * DAY_MS
  const approved7d = approvals.filter((a) => a.approvedAt && new Date(a.approvedAt).getTime() >= recentCutoff).length
  const needsScheduling = approvals.filter((a) => !a.scheduled)

  const upcomingShifts = shifts.filter((s) => new Date(s.start).getTime() >= today)
  const openShifts = upcomingShifts.filter((s) => s.open).sort((a, b) => a.start.localeCompare(b.start))

  const availability = buildAvailability(shifts, roster.users)

  // Gate financial figures: strip $ values unless management is unlocked.
  const showValues = await financeUnlocked()
  const mask = (a: ApprovedJob): ApprovedJob => (showValues ? a : { ...a, valueExGst: 0 })

  return {
    live: est.live && roster.live,
    primeecoLive: est.live,
    connecteamLive: roster.live,
    generatedAt: new Date().toISOString(),
    showValues,
    // Don't surface the PrimeEco "not configured" error on the sample board.
    error: (usingMockApprovals ? undefined : est.error) || roster.error,
    counts: {
      approved7d,
      unscheduled: needsScheduling.length,
      upcoming: upcomingShifts.length,
      draft: upcomingShifts.filter((s) => s.status === "draft").length,
      openShifts: openShifts.length,
      techsOnToday: availability.filter((t) => t.todayShifts > 0).length,
    },
    approvals: approvals.map(mask),
    needsScheduling: needsScheduling.map(mask),
    week: buildWeek(shifts),
    typeBreakdown: buildTypeBreakdown(shifts),
    availability,
    openShifts,
  }
}

export type { SchedulingData } from "./types"
