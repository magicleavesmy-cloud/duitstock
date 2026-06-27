import { BoxIcon, LayersIcon, WalletIcon } from '../icons'

export default function StockOverview({ summary, formatRM }) {
  const metrics = [
    {
      icon: BoxIcon,
      iconColor: '#22C55E',
      label: 'Products',
      sublabel: 'Total products',
      value: summary.totalProducts,
      valueClassName: 'text-emerald-700',
      valueFontSize: 15,
      width: 95,
    },
    {
      icon: LayersIcon,
      iconColor: '#00B6FF',
      label: 'Total Stock Qty',
      sublabel: 'Total quantity',
      value: summary.totalStockQty,
      valueClassName: 'text-blue-600',
      valueFontSize: 15,
      width: 115,
    },
    {
      icon: WalletIcon,
      iconColor: '#B347FF',
      label: 'Total Stock Value',
      sublabel: 'Total inventory value',
      value: formatRM(summary.totalStockValue),
      valueClassName: 'text-purple-700',
      valueFontSize: 13,
      width: 145,
    },
  ]

  return (
    <section
      style={{
        background: 'rgba(15,23,42,0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(56,189,248,0.42)',
        borderRadius: 18,
        boxShadow:
          '0 0 13px rgba(56,189,248,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
        padding: 15,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            alignItems: 'center',
            backdropFilter: 'blur(10px)',
            boxShadow:
              '0 0 10px rgba(34,197,94,0.35), 0 0 22px rgba(34,197,94,0.16)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            display: 'grid',
            flexShrink: 0,
            height: 18,
            placeItems: 'center',
            width: 18,
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <BoxIcon
            style={{
              color: '#22C55E',
              filter: 'drop-shadow(0 0 6px currentColor)',
              height: 18,
              width: 18,
            }}
          />
        </span>
        <h3
          style={{
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Stock Overview
        </h3>
      </div>

      <div
        style={{
          alignItems: 'stretch',
          display: 'flex',
          gap: 10,
        }}
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  )
}

function MetricCard({
  icon: Icon,
  iconColor,
  label,
  sublabel,
  value,
  valueClassName,
  valueFontSize,
  width,
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        flex: '0 0 auto',
        height: 68,
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '8px 10px',
        width,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 6,
          marginBottom: 2,
          minWidth: 0,
        }}
      >
        <span
          style={{
            alignItems: 'center',
            backdropFilter: 'blur(10px)',
            boxShadow:
              iconColor === '#22C55E'
                ? '0 0 10px rgba(34,197,94,0.35), 0 0 22px rgba(34,197,94,0.16)'
                : iconColor === '#00B6FF'
                  ? '0 0 10px rgba(59,130,246,0.35), 0 0 22px rgba(59,130,246,0.16)'
                  : '0 0 10px rgba(192,132,252,0.35), 0 0 22px rgba(192,132,252,0.16)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            display: 'grid',
            flexShrink: 0,
            height: 18,
            padding: 3,
            placeItems: 'center',
            width: 18,
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <Icon
            style={{
              color: iconColor,
              filter: 'drop-shadow(0 0 6px currentColor)',
              height: 12,
              width: 12,
            }}
          />
        </span>
        <p
          style={{
            color: 'rgba(255,255,255,0.72)',
            fontSize: 9,
            fontWeight: 600,
            lineHeight: 1.1,
            margin: 0,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </p>
      </div>
      <p
        className={valueClassName}
        style={{
          fontSize: valueFontSize,
          fontWeight: 800,
          lineHeight: 1.15,
          margin: '0 0 2px',
          maxWidth: '100%',
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </p>
      <p
        style={{
          color: 'rgba(255,255,255,0.48)',
          fontSize: 8,
          lineHeight: 1.1,
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sublabel}
      </p>
    </div>
  )
}
