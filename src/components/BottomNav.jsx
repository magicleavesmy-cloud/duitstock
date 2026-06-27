export default function BottomNav({ activePage, items, onChange }) {
  return (
    <nav
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 px-3"
      style={{
        background: 'transparent',
        paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: '#FCF8F3',
          border: '1px solid rgba(210,175,120,0.35)',
          borderRadius: 20,
          boxShadow:
            '6px 6px 16px rgba(190,160,120,0.18), -6px -6px 16px rgba(255,255,255,0.90)',
          display: 'flex',
          height: 52,
          justifyContent: 'space-around',
          margin: '0 auto',
          maxWidth: 430,
          padding: '0 6px',
          width: '100%',
        }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.id

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              style={{
                alignItems: 'center',
                background: isActive ? 'rgba(200,137,58,0.16)' : 'transparent',
                border: isActive
                  ? '1px solid rgba(200,137,58,0.35)'
                  : '1px solid transparent',
                borderRadius: 14,
                boxShadow: isActive
                  ? 'inset 3px 3px 7px rgba(190,160,120,0.18), inset -3px -3px 7px rgba(255,255,255,0.90)'
                  : 'none',
                color: isActive ? '#C8893A' : '#B09A85',
                display: 'flex',
                flexDirection: 'row',
                gap: isActive ? 5 : 0,
                height: 38,
                justifyContent: 'center',
                overflow: 'hidden',
                padding: isActive ? '0 12px' : '0 10px',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                flex: isActive ? '0 0 auto' : '1 1 0',
                minWidth: isActive ? 'auto' : 0,
              }}
              type="button"
            >
              <Icon
                style={{
                  color: isActive ? '#C8893A' : '#B09A85',
                  filter: 'none',
                  flexShrink: 0,
                  height: 17,
                  width: 17,
                }}
              />
              {isActive && (
                <span
                  style={{
                    color: '#3B2A1A',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0,
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
