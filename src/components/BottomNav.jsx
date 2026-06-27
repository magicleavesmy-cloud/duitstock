export default function BottomNav({ activePage, items, onChange }) {
  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 px-3" style={{paddingBottom: 'max(env(safe-area-inset-bottom), 12px)'}}>
      <div
        style={{
          alignItems: 'center',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(10,16,30,0.82)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
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
                background: isActive ? 'rgba(251,146,60,0.16)' : 'transparent',
                border: isActive ? '1px solid rgba(251,146,60,0.32)' : '1px solid transparent',
                borderRadius: 14,
                boxShadow: isActive ? '0 0 14px rgba(251,146,60,0.30)' : 'none',
                color: isActive ? '#fb923c' : 'rgba(255,255,255,0.40)',
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
                  color: isActive ? '#fb923c' : 'rgba(255,255,255,0.45)',
                  filter: isActive ? 'drop-shadow(0 0 5px rgba(251,146,60,0.60))' : 'none',
                  flexShrink: 0,
                  height: 17,
                  width: 17,
                }}
              />
              {isActive && (
                <span
                  style={{
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
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
