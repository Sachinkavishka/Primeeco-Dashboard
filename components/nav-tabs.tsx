"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/dashboard", label: "Operations" },
  { href: "/finance", label: "Financial" },
  { href: "/estimates", label: "Estimates" },
]

/** Tab switcher between the Operations and Financial dashboards (sits in the
 *  coloured header banner, so styling assumes a dark background). */
export function NavTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 rounded-xl bg-white/15 p-1 backdrop-blur">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? "bg-white text-slate-900 shadow" : "text-white/90 hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
