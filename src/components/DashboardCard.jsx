export function DashboardBox({
  accent,
  children,
  className = '',
  headerAction,
  icon: Icon,
  iconClassName,
  title,
}) {
  return (
    <section className={`dashboard-card dashboard-card-${accent} ${className}`.trim()}>
      <div className="dashboard-card-header flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 ${iconClassName}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="truncate text-[12px] font-bold leading-tight tracking-tight text-zinc-950">
            {title}
          </h3>
        </div>
        {headerAction}
      </div>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  )
}

export function DashboardStatRow({
  icon: Icon,
  iconClassName,
  label,
  sublabel,
  value,
  valueClassName,
}) {
  return (
    <div className="dashboard-card-item rounded-[12px] bg-white shadow-sm ring-1 ring-zinc-100">
      <div className="flex min-w-0 items-start gap-1.5">
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-lg ${iconClassName}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="dashboard-label">
            {label}
          </p>
          {sublabel && (
            <p className="summary-label mt-0.5 text-zinc-500">
              {sublabel}
            </p>
          )}
        </div>
      </div>
      <p className={`dashboard-value ${valueClassName}`}>
        {value}
      </p>
    </div>
  )
}
