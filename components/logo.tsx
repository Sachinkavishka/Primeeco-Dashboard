"use client"

import { useState } from "react"

/**
 * Brand logo. Renders /logo.png (upload your file to public/logo.png). Until
 * that file exists it falls back to a text wordmark, so nothing looks broken.
 * Sits on a white chip so it reads on the coloured header backgrounds.
 */
export function Logo({ className = "", height = 34 }: { className?: string; height?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-sm ${className}`}>
      {failed ? (
        <span className="text-sm font-extrabold text-slate-900">
          Detail <span className="font-semibold text-orange-500">FM</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo.png"
          alt="Detail Facility Management"
          style={{ height, width: "auto" }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
