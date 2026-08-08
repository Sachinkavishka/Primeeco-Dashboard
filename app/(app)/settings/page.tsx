"use client"

import Link from "next/link"
import { Monitor, Play } from "lucide-react"
import { NavTabs } from "@/components/nav-tabs"
import { Logo } from "@/components/logo"
import { SlideshowWidgetPicker } from "@/components/slideshow/widget-picker"

const LAUNCH = [
  { href: "/slideshow", label: "Slideshow", desc: "Widget-by-widget — press F11 for fullscreen", primary: true },
  { href: "/dashboard", label: "Operations", desc: "Jobs, status, maps, assignee pies" },
  { href: "/finance", label: "Financial", desc: "Invoiced revenue + forecast" },
  { href: "/receivables", label: "Receivable", desc: "Invoiced / outstanding / collected" },
  { href: "/estimates", label: "Estimates", desc: "By estimator" },
]

export default function SettingsPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100 p-5 lg:p-7">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-slate-800 to-slate-700 px-7 py-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Display Settings</h1>
            <p className="mt-1 text-sm text-slate-300">Configure the slideshow here, then open a display and press F11 for fullscreen.</p>
          </div>
        </div>
        <NavTabs />
      </header>

      {/* Launch a display */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Open a display</h2>
        <p className="mb-4 text-sm text-slate-500">Opens in a new tab. On the display, press <b>F11</b> for fullscreen.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAUNCH.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              target="_blank"
              className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:shadow-md ${
                l.primary ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-white"
              }`}
            >
              <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${l.primary ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                {l.primary ? <Play className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              </span>
              <span>
                <span className="block font-bold text-slate-900">{l.label} ↗</span>
                <span className="block text-xs text-slate-500">{l.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Slideshow config */}
      <section className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
        <SlideshowWidgetPicker />
        <p className="mt-4 text-xs text-slate-400">
          Changes save automatically to this browser and apply to the slideshow instantly. Set it up here, then open <b>Slideshow</b> above and press F11.
        </p>
      </section>

      {/* Two-screen note */}
      <section className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-6 text-sm text-slate-600 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
        <h2 className="mb-2 text-lg font-bold text-slate-900">Two-screen wall setup</h2>
        <p>One PC, two HDMI outputs (set Windows displays to <b>Extend</b>). Open a display in one browser window per screen, drag each to its TV, and press <b>F11</b>. Example: Slideshow on one screen, Operations on the other. No login required.</p>
      </section>
    </div>
  )
}
