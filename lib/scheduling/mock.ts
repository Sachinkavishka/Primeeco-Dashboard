import type { ApprovalSource } from "./types"

/**
 * Sample approved jobs, used only when PrimeEco isn't configured so the SAMPLE
 * scheduling board is fully populated (mirrors how Operations shows mock jobs).
 *
 * A few job numbers are chosen to match the mock roster's ctJobId tokens
 * (CT-1001…) so the approval↔shift join demonstrates the "scheduled" vs "needs
 * booking" split. See getMockRoster() in lib/connecteam/mock.ts.
 */

const CLIENTS = ["AAMI", "Suncorp", "RACV", "Allianz", "QBE", "Budget Direct"]
const DIVISIONS = ["DFM-VIC", "Mould Squad", "DFM-QLD", "SOLU TAS"]
const ESTIMATORS = ["Sarah Chen", "Mark Taylor", "Jess Kaur"]

export function getMockApprovals(): ApprovalSource[] {
  const now = Date.now()
  const rows: ApprovalSource[] = []
  for (let i = 0; i < 9; i++) {
    // Half of these line up with a mock shift (scheduled); half don't (need booking).
    const jobNumber = i % 2 === 0 ? String(1001 + i) : `J-${9000 + i}`
    rows.push({
      jobId: `mock-job-${i}`,
      jobNumber,
      estimator: ESTIMATORS[i % ESTIMATORS.length],
      status: "Authorised",
      valueExGst: 3000 + ((i * 2137) % 22000),
      client: CLIENTS[i % CLIENTS.length],
      division: DIVISIONS[i % DIVISIONS.length],
      // Spread approvals across the last ~12 days.
      createdAt: new Date(now - i * 1.4 * 86_400_000).toISOString(),
    })
  }
  return rows
}
