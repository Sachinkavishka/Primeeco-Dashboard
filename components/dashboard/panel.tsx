/** Consistent titled white card used by every dashboard section (light theme). */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)] ${className}`}
    >
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
