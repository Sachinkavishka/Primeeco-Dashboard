"use client"

import { useState } from "react"

/**
 * Brand logo on a white chip (reads on the coloured headers). Prefers your
 * uploaded /logo.png; if that file isn't present it falls back to an SVG
 * recreation of the Detail Facility Management mark + wordmark.
 *
 * Height is RESPONSIVE — small on phones, larger on big wall screens — via
 * Tailwind height utilities; width stays auto so the aspect ratio is kept.
 */

// base → sm → lg → xl → 2xl (2xl covers the large office TVs)
const SIZE = "h-7 sm:h-8 lg:h-9 xl:h-11 2xl:h-14"

export function Logo({ className = "" }: { className?: string }) {
  // Show the SVG mark immediately; swap to /logo.png ONLY once it truly loads.
  // Avoids a broken-image flash and always shows a logo even if the file is
  // missing / onError doesn't fire on some hosts.
  const [imgOk, setImgOk] = useState(false)
  return (
    <span className={`inline-flex items-center rounded-xl bg-white px-2.5 py-1.5 shadow-sm sm:px-3 ${className}`}>
      {!imgOk && <LogoMark />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Detail Facility Management"
        className={`w-auto ${SIZE}`}
        style={{ display: imgOk ? "block" : "none" }}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth > 0) setImgOk(true)
        }}
        onError={() => setImgOk(false)}
      />
    </span>
  )
}

const NAVY = "#173a5e"
const ORANGE = "#f2682c"

function LogoMark() {
  return (
    <svg viewBox="0 0 232 48" role="img" aria-label="Detail Facility Management" className={`w-auto ${SIZE}`}>
      <g>
        <path d="M2 13 L33 4 L33 9 L2 19 Z" fill={NAVY} />
        <path d="M2 22 L40 12 L40 17 L2 28 Z" fill={NAVY} />
        <path d="M2 31 L44 22 L44 27 L2 37 Z" fill={NAVY} />
        <path d="M2 40 L44 33 L44 38 L2 46 Z" fill={NAVY} />
        <path d="M31 1 L34 10.5 L43 13.5 L34 16.5 L31 26 L28 16.5 L19 13.5 L28 10.5 Z" fill={ORANGE} />
      </g>
      <text x="56" y="25" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="23" fill={NAVY}>
        Detail
      </text>
      <text x="57" y="41" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600" fontSize="10.5" letterSpacing="0.4" fill={NAVY}>
        Facility Management
      </text>
    </svg>
  )
}
