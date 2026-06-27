import { BoxIcon } from '../icons'

export default function Header({
  activePage,
  currentUserRole,
  onLogout,
  syncStatus,
  syncStatusText,
  visibleNavItems,
}) {
  const title = visibleNavItems.find((item) => item.id === activePage)?.label
  const greeting = getGreeting()

  return (
    <header className="app-header mb-2.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="app-logo shrink-0">
          <BoxIcon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="header-greeting text-xs font-medium text-zinc-500">{greeting}, DuitStock 👋</p>
          <h1 className="header-title truncate text-xl font-bold tracking-tight text-zinc-950 sm:text-xl">
            {title}
          </h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="role-chip rounded-full px-3 py-1.5 text-xs font-bold uppercase">
          {currentUserRole}
        </span>
        <SyncStatusPill status={syncStatus} text={syncStatusText} />
        <button
          className="secondary-button h-9 rounded-full px-3 text-xs"
          onClick={onLogout}
          type="button"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

function SyncStatusPill({ status, text }) {
  return (
    <div
      className={`sync-status-pill sync-status-${status} shrink-0 rounded-full px-3 py-2 text-xs font-bold sm:px-4 sm:text-sm`}
    >
      {text}
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
