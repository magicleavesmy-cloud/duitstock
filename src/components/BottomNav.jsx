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
          background: '#FFFFFF',
          border: '1px solid #ECE7DF',
          borderRadius: 16,
          boxShadow: '0 1px 2px rgba(24,24,27,0.06)',
          display: 'flex',
          height: 54,
          justifyContent: 'space-around',
          margin: '0 auto',
          maxWidth: 430,
          padding: '0 7px',
          width: '100%',
        }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.id
          const label = item.id === 'movements' ? 'Check' : item.label

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              style={{
                alignItems: 'center',
                background: isActive ? 'rgba(200,139,74,0.18)' : 'transparent',
                border: isActive
                  ? '1px solid rgba(200,139,74,0.30)'
                  : '1px solid transparent',
                borderRadius: 12,
                boxShadow: 'none',
                color: isActive ? '#C88B4A' : '#71717A',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                height: 44,
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '0 8px',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                flex: '1 1 0',
                minWidth: 0,
              }}
              type="button"
            >
              <Icon
                style={{
                  color: isActive ? '#C88B4A' : '#71717A',
                  filter: 'none',
                  flexShrink: 0,
                  height: isActive ? 19 : 17,
                  width: isActive ? 19 : 17,
                }}
              />
              <span
                style={{
                  color: 'inherit',
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginTop: 2,
                  textAlign: 'center',
                }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
