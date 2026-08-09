/**
 * Shared catalogue of slideshow widgets + the config the kiosk edits and the
 * slideshow reads (both same-origin, synced via localStorage `storage` events).
 */

export const SLIDESHOW_WIDGETS = [
  { id: "overview", label: "Key Metrics (totals)" },
  { id: "statusMix", label: "Status + Open vs Completed" },
  { id: "trendAging", label: "Jobs Created + Aging" },
  { id: "people", label: "Estimator + Case Manager" },
  { id: "assigneeDivision", label: "Assignee + Division" },
  { id: "assigneePies", label: "Assignee Status Pies" },
  { id: "geography", label: "Maps (State + Melbourne)" },
  { id: "recentJobs", label: "Recent Jobs" },
] as const

export type SlideshowWidgetId = (typeof SLIDESHOW_WIDGETS)[number]["id"]

export const SLIDESHOW_KEY = "dfm-slideshow-v1"

export interface SlideshowConfig {
  /** Ordered list of enabled widget ids. */
  widgets: string[]
  /** Default seconds per slide (fallback when a slide has no specific time). */
  sec: number
  /** Optional per-slide seconds, keyed by widget id. */
  durations?: Record<string, number>
}

export const DEFAULT_SLIDESHOW: SlideshowConfig = {
  widgets: SLIDESHOW_WIDGETS.map((w) => w.id),
  sec: 15,
  durations: {},
}

export function loadSlideshowConfig(): SlideshowConfig {
  try {
    const raw = localStorage.getItem(SLIDESHOW_KEY)
    if (!raw) return DEFAULT_SLIDESHOW
    const c = JSON.parse(raw) as SlideshowConfig
    return Array.isArray(c.widgets) && c.widgets.length
      ? { widgets: c.widgets, sec: c.sec || 15, durations: c.durations ?? {} }
      : DEFAULT_SLIDESHOW
  } catch {
    return DEFAULT_SLIDESHOW
  }
}

/** Seconds for a specific slide: its per-slide time if set, else the default. */
export function secFor(config: SlideshowConfig, id: string): number {
  const d = config.durations?.[id]
  return d && d >= 3 ? d : config.sec
}
