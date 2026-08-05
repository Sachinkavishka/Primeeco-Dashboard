/**
 * Region → geography mapping + simplified SVG shapes for the region maps.
 *
 * PrimeEco regions are names like "Metropolitan Melbourne - Eastern Suburbs" or
 * "Interstate - New South Wales". We roll them up two ways: to an Australian
 * STATE (for the national map) and to a Melbourne METRO zone (for the local map).
 *
 * The shapes are deliberately SIMPLIFIED (schematic, not survey-accurate) — each
 * cell is labelled, so the data reads unambiguously even though the geometry is
 * stylised.
 */

export interface MapShape {
  code: string
  name: string
  d: string
  labelX: number
  labelY: number
}

/** Map a PrimeEco region name to an Australian state code. */
export function regionToState(region: string | null): string | null {
  if (!region) return null
  const r = region.toLowerCase()
  if (r.includes("new south wales")) return "NSW"
  if (r.includes("victoria") || r.includes("melbourne")) return "VIC"
  if (r.includes("tasmania")) return "TAS"
  if (r.includes("queensland")) return "QLD"
  if (r.includes("western australia")) return "WA"
  if (r.includes("south australia")) return "SA"
  if (r.includes("northern territory")) return "NT"
  if (r.includes("capital territory") || r.includes("canberra") || /\bact\b/.test(r)) return "ACT"
  return null
}

/** Map a PrimeEco region name to a greater-Melbourne metro zone. */
export function regionToMetro(region: string | null): string | null {
  if (!region) return null
  const r = region.toLowerCase()
  if (!r.includes("melbourne")) return null
  if (r.includes("central")) return "Central"
  if (r.includes("north")) return "North"
  if (r.includes("southeast")) return "Southeast"
  if (r.includes("east")) return "East"
  if (r.includes("west")) return "West"
  return null
}

/** Simplified Australia states (viewBox 0 0 1000 900). */
export const AUSTRALIA_SHAPES: MapShape[] = [
  { code: "WA", name: "Western Australia", d: "M80,300 L95,210 L150,175 L250,165 L430,165 L430,600 L360,650 L240,660 L140,600 L90,470 Z", labelX: 250, labelY: 430 },
  { code: "NT", name: "Northern Territory", d: "M430,165 L610,165 L610,430 L430,430 Z", labelX: 520, labelY: 300 },
  { code: "SA", name: "South Australia", d: "M430,430 L610,430 L660,485 L650,620 L560,680 L470,660 L430,600 Z", labelX: 535, labelY: 545 },
  { code: "QLD", name: "Queensland", d: "M610,165 L790,150 L885,255 L920,365 L840,455 L660,455 L610,430 Z", labelX: 745, labelY: 300 },
  { code: "NSW", name: "New South Wales", d: "M660,455 L840,455 L905,525 L860,590 L700,595 L650,545 L660,485 Z", labelX: 765, labelY: 525 },
  { code: "VIC", name: "Victoria", d: "M700,595 L860,590 L840,665 L720,685 L650,645 L650,600 Z", labelX: 748, labelY: 638 },
  { code: "TAS", name: "Tasmania", d: "M740,735 L820,728 L810,838 L735,828 Z", labelX: 777, labelY: 788 },
]

/** ACT is a dot inside NSW (too small for a labelled cell). */
export const ACT_DOT = { cx: 812, cy: 565, r: 11, labelX: 840, labelY: 560 }

/** Schematic greater-Melbourne metro zones (viewBox 0 0 300 280). */
export const MELBOURNE_SHAPES: MapShape[] = [
  { code: "North", name: "Northern Suburbs", d: "M55,18 L245,18 L245,88 L55,88 Z", labelX: 150, labelY: 55 },
  { code: "West", name: "Western Suburbs", d: "M28,88 L120,88 L120,215 L30,205 Z", labelX: 74, labelY: 150 },
  { code: "Central", name: "Central Suburbs", d: "M120,88 L192,88 L192,172 L120,172 Z", labelX: 156, labelY: 132 },
  { code: "East", name: "Eastern Suburbs", d: "M192,88 L252,94 L258,182 L192,172 Z", labelX: 224, labelY: 138 },
  { code: "Southeast", name: "Southeastern Suburbs", d: "M120,172 L258,182 L248,258 L132,252 L120,215 Z", labelX: 190, labelY: 220 },
]
