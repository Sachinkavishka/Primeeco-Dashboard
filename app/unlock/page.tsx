"use client"

import { useState } from "react"
import { Lock } from "lucide-react"

export default function UnlockPage() {
  const [passcode, setPasscode] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(false)
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      })
      if (!res.ok) {
        setError(true)
        setBusy(false)
        return
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/finance"
      window.location.href = next
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">Management access</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the passcode to view financial data.</p>
        </div>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-widest focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="mt-2 text-center text-sm text-rose-600">Incorrect passcode</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <a href="/dashboard" className="mt-4 block text-center text-sm text-slate-400 hover:text-slate-600">
          ← Back to Operations
        </a>
      </form>
    </div>
  )
}
