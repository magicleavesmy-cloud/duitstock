export function DashboardBox({ accent, children, className = '', headerAction, icon: Icon, iconClassName, title }) {
  return (
    <section className={`dashboard-card dashboard-card-${accent} ${className}`.trim()}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
        <span className={iconClassName} style={{ display:'grid', width:20, height:20, placeItems:'center', borderRadius:8, flexShrink:0 }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 style={{ fontSize:12, fontWeight:700, color:'#3B2A1A', margin:0, flex:1 }}>{title}</h3>
        {headerAction}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>{children}</div>
    </section>
  )
}

export function DashboardStatRow({ label, value, valueClassName }) {
  return (
    <div className="dashboard-card-item" style={{ borderRadius:12, padding:'8px 12px' }}>
      <div style={{ display:'block', width:'100%' }}>
        <span style={{ display:'block', fontSize:9, fontWeight:600, color:'#7A6250', marginBottom:2 }}>{label}</span>
        <span className={valueClassName} style={{ display:'block', fontSize:13, fontWeight:800 }}>{value}</span>
      </div>
    </div>
  )
}
