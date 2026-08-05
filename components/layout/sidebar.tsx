"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Settings,
  GitBranch,
  Calendar,
  FileText,
  ClipboardList,
  LogOut,
} from "lucide-react"
import { logout } from "@/app/auth/actions"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/appointments", label: "Appointments", icon: Calendar },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/site-forms", label: "Site Forms", icon: FileText },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
]

const adminItems = [
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 bg-gray-900 flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-white font-bold text-lg">Detail FM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        <div className="pt-4 mt-4 border-t border-gray-800">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Admin
          </p>
          {adminItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
