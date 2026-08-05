/** Consistent titled container used by every dashboard section. */
export function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 ${className}`}>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </header>
      {children}
    </section>
  )
}
