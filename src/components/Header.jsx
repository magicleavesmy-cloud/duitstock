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
    <header className="app-header mb-2 flex items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="app-logo shrink-0">
          <BoxIcon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="header-greeting text-[10px] font-semibold text-zinc-500">Magic Leaves by Adam</p>
          <h1 className="header-title truncate text-[19px] font-extrabold tracking-tight text-zinc-950 sm:text-xl">
            {title}
          </h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="role-chip rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
          {currentUserRole}
        </span>
        <SyncStatusPill status={syncStatus} text={syncStatusText} />
        <button
          className="secondary-button h-7 rounded-full px-2 text-[10px]"
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
      className={`sync-status-pill sync-status-${status} shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-xs`}
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
