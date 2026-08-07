"use client"

import { useEffect, useState } from "react"
import { SLIDESHOW_WIDGETS, SLIDESHOW_KEY, loadSlideshowConfig, type SlideshowConfig } from "./widgets"

/** Self-contained slideshow widget/order/interval picker (reads+writes the shared config). */
export function SlideshowWidgetPicker() {
  const [cfg, setCfg] = useState<SlideshowConfig | null>(null)

  useEffect(() => {
    setCfg(loadSlideshowConfig())
    const on = (e: StorageEvent) => {
      if (e.key === SLIDESHOW_KEY) setCfg(loadSlideshowConfig())
    }
    window.addEventListener("storage", on)
    return () => window.removeEventListener("storage", on)
  }, [])

  const sc: SlideshowConfig = cfg ?? { widgets: SLIDESHOW_WIDGETS.map((w) => w.id), sec: 15 }
  const save = (n: SlideshowConfig) => {
    setCfg(n)
    localStorage.setItem(SLIDESHOW_KEY, JSON.stringify(n))
  }
  const labelOf = (id: string) => SLIDESHOW_WIDGETS.find((w) => w.id === id)?.label ?? id
  const move = (id: string, d: number) => {
    const a = [...sc.widgets]
    const i = a.indexOf(id)
    const j = i + d
    if (i < 0 || j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    save({ ...sc, widgets: a })
  }
  const rm = (id: string) => save({ ...sc, widgets: sc.widgets.filter((w) => w !== id) })
  const add = (id: string) => save({ ...sc, widgets: [...sc.widgets, id] })

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Slideshow — widgets &amp; order</h3>
        <label className="text-sm text-slate-600">
          Seconds / slide{" "}
          <input
            type="number"
            min={3}
            value={sc.sec}
            onChange={(e) => save({ ...sc, sec: Math.max(3, Number(e.target.value) || 15) })}
            className="w-16 rounded border border-slate-200 px-2 py-1 text-right"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Showing ({sc.widgets.length})</p>
          <ul className="space-y-1">
            {sc.widgets.map((id, idx) => (
              <li key={id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                <span className="flex-1 truncate text-slate-700">{idx + 1}. {labelOf(id)}</span>
                <button onClick={() => move(id, -1)} className="px-1.5 text-slate-400 hover:text-slate-800" aria-label="Move up">↑</button>
                <button onClick={() => move(id, 1)} className="px-1.5 text-slate-400 hover:text-slate-800" aria-label="Move down">↓</button>
                <button onClick={() => rm(id)} className="px-1.5 text-rose-400 hover:text-rose-600" aria-label="Remove">✕</button>
              </li>
            ))}
            {sc.widgets.length === 0 && <li className="text-xs text-slate-400">None — the slideshow shows all widgets by default.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Available</p>
          <ul className="space-y-1">
            {SLIDESHOW_WIDGETS.filter((w) => !sc.widgets.includes(w.id)).map((w) => (
              <li key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <span className="flex-1 truncate text-slate-500">{w.label}</span>
                <button onClick={() => add(w.id)} className="rounded bg-blue-50 px-2 py-0.5 text-blue-600 hover:bg-blue-100">+ add</button>
              </li>
            ))}
            {SLIDESHOW_WIDGETS.every((w) => sc.widgets.includes(w.id)) && <li className="text-xs text-slate-400">All widgets added.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
