"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Lock } from "lucide-react"

const PUBLIC_TABS = [
  { href: "/dashboard", label: "Operations" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/settings", label: "Settings" },
]
const FINANCE_TABS = [
  { href: "/finance", label: "Financial" },
  { href: "/receivables", label: "Receivable" },
  { href: "/estimates", label: "Estimates" },
]

/** Tab switcher. Financial tabs appear only once management has unlocked
 *  (readable `dfm_fin_ok` cookie); otherwise a lock link is shown. Hidden
 *  entirely inside a kiosk (?kiosk=1) for a clean TV view. */
export function NavTabs() {
  const pathname = usePathname()
  const [kiosk, setKiosk] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    setKiosk(new URLSearchParams(window.location.search).has("kiosk"))
    setUnlocked(document.cookie.split("; ").some((c) => c.startsWith("dfm_fin_ok=")))
  }, [])

  if (kiosk) return null

  const tabs = unlocked ? [...PUBLIC_TABS, ...FINANCE_TABS] : PUBLIC_TABS

  return (
    <nav className="flex flex-wrap gap-1 rounded-xl bg-white/15 p-1 backdrop-blur">
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
      {!unlocked && (
        <Link
          href="/unlock"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
          title="Management access"
        >
          <Lock className="h-3.5 w-3.5" />
          Management
        </Link>
      )}
    </nav>
  )
}
