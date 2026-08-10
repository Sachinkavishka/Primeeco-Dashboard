import { classifyType } from "./normalize"
import type { CtUser, Shift } from "./types"

/**
 * Seeded sample roster so the scheduling dashboard renders end-to-end before
 * Connecteam credentials are added (mirrors lib/primeeco/mock.ts). Generates a
 * spread of shifts across the next 7 days: multiple appointment types, a few
 * drafts and one open/unassigned shift.
 */

const TECHS: CtUser[] = [
  { id: "u1", name: "Dave Miller" },
  { id: "u2", name: "Priya Nair" },
  { id: "u3", name: "Tom Fletcher" },
  { id: "u4", name: "Sofia Rossi" },
  { id: "u5", name: "Liam O'Brien" },
]

const TITLES = [
  "Moisture Check — 12 Smith St",
  "Make Safe — 88 Ocean Rd",
  "Inspection / Scope — 5 King St",
  "Install dehus — 40 Park Ave",
  "Moisture Check — 7 River Ln",
  "Collection / de-rig — 22 Hill St",
  "Cleaning — 3 Bay St",
  "Moisture Check — 91 Forest Dr",
  "Repairs — 14 Church St",
  "Inspection — 60 Market St",
]

function atHour(dayOffset: number, hour: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour)
  return d.getTime()
}

export function getMockRoster(): { shifts: Shift[]; users: CtUser[] } {
  const shifts: Shift[] = []
  let n = 0
  for (let day = 0; day < 7; day++) {
    const perDay = 2 + (day % 3) // 2–4 shifts a day
    for (let i = 0; i < perDay; i++) {
      const title = TITLES[n % TITLES.length]
      const hour = 8 + i * 2
      const tech = TECHS[n % TECHS.length]
      const open = n % 11 === 5 // occasional unassigned shift
      const draft = n % 4 === 3 // ~1 in 4 still in draft
      const userIds = open ? [] : [tech.id]
      shifts.push({
        id: `mock-shift-${n}`,
        title,
        start: new Date(atHour(day, hour)).toISOString(),
        end: new Date(atHour(day, hour + 2)).toISOString(),
        ctJobId: `CT-${1000 + n}`,
        userIds,
        userNames: userIds.map((id) => TECHS.find((t) => t.id === id)?.name ?? "Unknown"),
        status: draft ? "draft" : "published",
        open,
        schedulerId: "mock",
        type: classifyType(title),
      })
      n++
    }
  }
  return { shifts, users: TECHS }
}
