"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  SLIDESHOW_WIDGETS,
  SLIDESHOW_KEY,
  loadSlideshowConfig,
  type SlideshowConfig,
} from "@/components/slideshow/widgets"

/**
 * Kiosk display controller for the office wall screens.
 *
 * Each physical screen opens this page with ?screen=1 / ?screen=2. An admin
 * settings panel (gear icon) assigns any dashboard page to any screen, with
 * optional rotation and auto-scroll. Config is saved to localStorage and synced
 * live across the browser windows via the `storage` event — so changing a
 * setting on one screen updates the other instantly. No login required.
 */

const VIEWS = {
  slideshow: { label: "Slideshow (widget by widget)", url: "/slideshow" },
  operations: { label: "Operations", url: "/dashboard" },
  financial: { label: "Financial", url: "/finance" },
  receivable: { label: "Receivable", url: "/receivables" },
  estimates: { label: "Estimates", url: "/estimates" },
} as const

type ViewKey = keyof typeof VIEWS
const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[]

interface ScreenConfig {
  views: ViewKey[]
  rotateSec: number
  autoScroll: boolean
}
interface Config {
  screens: Record<string, ScreenConfig>
}

const STORAGE_KEY = "dfm-kiosk-config-v1"
const DEFAULT: Config = {
  screens: {
    "1": { views: ["operations"], rotateSec: 0, autoScroll: false },
    "2": { views: ["financial"], rotateSec: 0, autoScroll: false },
  },
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Config
    return parsed.screens ? parsed : DEFAULT
  } catch {
    return DEFAULT
  }
}

export default function KioskPage() {
  const [screen, setScreen] = useState("1")
  const [config, setConfig] = useState<Config>(DEFAULT)
  const [idx, setIdx] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [slideConfig, setSlideConfig] = useState<SlideshowConfig | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Init from URL + storage, and sync across windows.
  useEffect(() => {
    setScreen(new URLSearchParams(window.location.search).get("screen") || "1")
    setConfig(loadConfig())
    setSlideConfig(loadSlideshowConfig())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConfig(loadConfig())
      if (e.key === SLIDESHOW_KEY) setSlideConfig(loadSlideshowConfig())
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "s") setShowSettings((v) => !v)
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  const sc = config.screens[screen] ?? DEFAULT.screens["1"]
  const views = sc.views.length ? sc.views : (["operations"] as ViewKey[])
  const current = views[idx % views.length]
  const url = `${VIEWS[current]?.url ?? "/dashboard"}?kiosk=1`

  // Rotation between multiple views.
  useEffect(() => {
    if (views.length < 2 || !sc.rotateSec) return
    const id = setInterval(() => setIdx((i) => (i + 1) % views.length), sc.rotateSec * 1000)
    return () => clearInterval(id)
  }, [views.length, sc.rotateSec])

  useEffect(() => {
    if (idx >= views.length) setIdx(0)
  }, [views.length, idx])

  // Gentle auto-scroll for tall pages (same-origin iframe).
  useEffect(() => {
    if (!sc.autoScroll) return
    let dir = 1
    const id = setInterval(() => {
      try {
        const w = iframeRef.current?.contentWindow
        const doc = w?.document.scrollingElement
        if (!w || !doc) return
        w.scrollBy(0, dir * 2)
        if (doc.scrollTop + w.innerHeight >= doc.scrollHeight - 2) dir = -1
        else if (doc.scrollTop <= 0) dir = 1
      } catch {
        /* ignore */
      }
    }, 40)
    return () => clearInterval(id)
  }, [sc.autoScroll, url])

  const save = useCallback((next: Config) => {
    setConfig(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const updateScreen = (key: string, patch: Partial<ScreenConfig>) => {
    const existing = config.screens[key] ?? { views: ["operations"], rotateSec: 0, autoScroll: false }
    save({ screens: { ...config.screens, [key]: { ...existing, ...patch } } })
  }

  const toggleView = (key: string, view: ViewKey) => {
    const existing = config.screens[key]?.views ?? []
    const views = existing.includes(view) ? existing.filter((v) => v !== view) : [...existing, view]
    updateScreen(key, { views })
  }

  // --- slideshow widget config -------------------------------------------
  const sc2: SlideshowConfig = slideConfig ?? { widgets: SLIDESHOW_WIDGETS.map((w) => w.id), sec: 15 }
  const saveSlide = (next: SlideshowConfig) => {
    setSlideConfig(next)
    localStorage.setItem(SLIDESHOW_KEY, JSON.stringify(next))
  }
  const labelOf = (id: string) => SLIDESHOW_WIDGETS.find((w) => w.id === id)?.label ?? id
  const moveWidget = (id: string, dir: number) => {
    const arr = [...sc2.widgets]
    const idx = arr.indexOf(id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    saveSlide({ ...sc2, widgets: arr })
  }
  const removeWidget = (id: string) => saveSlide({ ...sc2, widgets: sc2.widgets.filter((w) => w !== id) })
  const addWidget = (id: string) => saveSlide({ ...sc2, widgets: [...sc2.widgets, id] })

  return (
    <div className="fixed inset-0 bg-black">
      <iframe ref={iframeRef} key={url} src={url} className="h-full w-full border-0" title={`Screen ${screen}`} />

      {/* Settings button (visible, corner) */}
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900/85 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
        title="Display settings (or press S)"
        aria-label="Display settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Settings
      </button>

      {/* Settings overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Display Settings</h2>
                <p className="text-sm text-slate-500">This window is showing Screen {screen}. Changes apply live to both screens.</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {["1", "2"].map((key) => {
                const s = config.screens[key] ?? DEFAULT.screens["1"]
                return (
                  <div key={key} className={`rounded-2xl border p-4 ${key === screen ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
                    <h3 className="mb-2 font-bold text-slate-800">Screen {key}{key === screen ? " (this one)" : ""}</h3>
                    <div className="space-y-1.5">
                      {VIEW_KEYS.map((v) => (
                        <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" checked={s.views.includes(v)} onChange={() => toggleView(key, v)} className="h-4 w-4" />
                          {VIEWS[v].label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                      <label className="flex items-center justify-between gap-2 text-slate-600">
                        Rotate every
                        <span>
                          <input
                            type="number"
                            min={0}
                            value={s.rotateSec}
                            onChange={(e) => updateScreen(key, { rotateSec: Math.max(0, Number(e.target.value)) })}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-right"
                          />{" "}
                          s
                        </span>
                      </label>
                      <label className="flex items-center justify-between gap-2 text-slate-600">
                        Auto-scroll
                        <input type="checkbox" checked={s.autoScroll} onChange={(e) => updateScreen(key, { autoScroll: e.target.checked })} className="h-4 w-4" />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Slideshow widgets & order */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Slideshow — widgets & order</h3>
                <label className="text-sm text-slate-600">
                  Seconds / slide{" "}
                  <input
                    type="number"
                    min={3}
                    value={sc2.sec}
                    onChange={(e) => saveSlide({ ...sc2, sec: Math.max(3, Number(e.target.value) || 15) })}
                    className="w-16 rounded border border-slate-200 px-2 py-1 text-right"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Showing ({sc2.widgets.length})</p>
                  <ul className="space-y-1">
                    {sc2.widgets.map((id, idx) => (
                      <li key={id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-sm">
                        <span className="flex-1 truncate text-slate-700">{idx + 1}. {labelOf(id)}</span>
                        <button onClick={() => moveWidget(id, -1)} className="px-1 text-slate-400 hover:text-slate-800" aria-label="Move up">↑</button>
                        <button onClick={() => moveWidget(id, 1)} className="px-1 text-slate-400 hover:text-slate-800" aria-label="Move down">↓</button>
                        <button onClick={() => removeWidget(id)} className="px-1 text-rose-400 hover:text-rose-600" aria-label="Remove">✕</button>
                      </li>
                    ))}
                    {sc2.widgets.length === 0 && <li className="text-xs text-slate-400">None selected — showing all by default</li>}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Available</p>
                  <ul className="space-y-1">
                    {SLIDESHOW_WIDGETS.filter((w) => !sc2.widgets.includes(w.id)).map((w) => (
                      <li key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
                        <span className="flex-1 truncate text-slate-500">{w.label}</span>
                        <button onClick={() => addWidget(w.id)} className="rounded bg-blue-50 px-2 py-0.5 text-blue-600 hover:bg-blue-100">+ add</button>
                      </li>
                    ))}
                    {SLIDESHOW_WIDGETS.every((w) => sc2.widgets.includes(w.id)) && <li className="text-xs text-slate-400">All widgets added</li>}
                  </ul>
                </div>
              </div>
            </div>

            <p className="mt-5 text-xs text-slate-400">
              Tip: on each TV open <code className="font-mono">/kiosk?screen=1</code> and <code className="font-mono">/kiosk?screen=2</code>, press F11 for fullscreen. Press <b>S</b> anytime to reopen this panel. Set a screen&apos;s page to <b>Slideshow</b> to use the widget list above.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
