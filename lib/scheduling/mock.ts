import type { JobEstimateHours } from "@/lib/primeeco/estimate-hours"
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
      statusType: "Open",
      jobType: ["Job", "Makesafe", "Restoration"][i % 3],
      address: `${10 + i * 7} Sample St, Melbourne VIC 3000`,
      jobDescription: "Works Requested:\nWater damage restoration — dry out and reinstate affected areas.",
      primeUrl: null,
      equipmentHireOnly: false,
      estimateId: `mock-est-${i}`,
      estimateLabel: i % 2 === 0 ? `Quote - ${10 + i} Aug | DFM-0${600 + i}` : `Variation Works ${i}`,
      estimateDescription: i % 3 === 0 ? "Scope of works as per site inspection" : null,
      estimateRef: `MOCK${1000 + i}`,
      // Direct Allocations are filtered off the board, so the sample only
      // carries the type coordinators actually plan from.
      estimateType: "Authorised Works",
      invoiced:
        i === 4
          ? { invoiceNumber: "INV-2041", invoicedDate: new Date(now - 86_400_000).toISOString().slice(0, 10), status: "Paid", paid: true, progress: false }
          : i === 6
            ? { invoiceNumber: "INV-2044", invoicedDate: new Date(now).toISOString().slice(0, 10), status: "Sent", paid: false, progress: true }
            : null,
      invoices:
        i === 4
          ? [
              { invoiceNumber: "INV-2041", invoicedDate: new Date(now - 86_400_000).toISOString().slice(0, 10), status: "Paid", paid: true, progress: false },
              { invoiceNumber: "INV-2038", invoicedDate: new Date(now - 3 * 86_400_000).toISOString().slice(0, 10), status: "Paid", paid: true, progress: true },
            ]
          : i === 6
            ? [{ invoiceNumber: "INV-2044", invoicedDate: new Date(now).toISOString().slice(0, 10), status: "Sent", paid: false, progress: true }]
            : [],
      estHours: null,
      lines: [
        {
          trade: "Labour",
          description: "Technician Hours - Standard Rate\nRemove wet carpet and underlay, treat affected areas.",
          notes: null,
          labourQuantity: 8,
          labourUnit: "hr",
          materialQuantity: 0,
          materialUnit: null,
          role: "Technician",
        },
        {
          trade: "Chemicals/Consumables",
          description: "Antimicrobial treatment - all affected areas",
          notes: null,
          labourQuantity: 0,
          labourUnit: null,
          materialQuantity: 2,
          materialUnit: "litre",
          role: null,
        },
      ],
    })
  }
  return rows
}

/** Sample estimated-hours per mock job (shapes mirror real aggregation). */
export function getMockHours(): Record<string, JobEstimateHours> {
  const out: Record<string, JobEstimateHours> = {}
  for (let i = 0; i < 9; i++) {
    const tech = 8 + ((i * 13) % 40)
    const pm = i % 3 === 0 ? 3 : 0
    const sup = i % 4 === 0 ? 4 : 0
    const lab = i % 2 === 0 ? 6 : 0
    const days = i % 3 === 2 ? 2 + (i % 5) : 0
    out[`mock-job-${i}`] = {
      jobId: `mock-job-${i}`,
      byRole: {
        Technician: { hours: tech, days: 0 },
        ...(pm ? { "Project Manager": { hours: pm, days: 0 } } : {}),
        ...(sup ? { Supervisor: { hours: sup, days: 0 } } : {}),
        ...(lab ? { Labourer: { hours: lab, days: 0 } } : {}),
        ...(days ? { Other: { hours: 0, days } } : {}),
      },
      totalHours: tech + pm + sup + lab,
      totalDays: days,
    }
  }
  return out
}
