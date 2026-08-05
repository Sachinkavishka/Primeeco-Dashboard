// Login is disabled for the open office wall display (see api/dashboard/route.ts).
// Full-bleed layout so the dashboard fills the screen edge-to-edge.
// To re-enable Supabase auth later: restore the getUser() guard + proxy.ts.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen overflow-y-auto bg-slate-950">
      {children}
    </div>
  )
}
