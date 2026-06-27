import { BoxIcon, LayersIcon, WalletIcon } from '../icons'

export default function StockOverview({ summary, formatRM }) {
  const metrics = [
    {
      icon: BoxIcon,
      iconColor: '#16A34A',
      label: 'Products',
      sublabel: 'Total products',
      value: summary.totalProducts,
      valueClassName: 'text-emerald-700',
      valueFontSize: 18,
    },
    {
      icon: LayersIcon,
      iconColor: '#C88B4A',
      label: 'Total Stock Qty',
      sublabel: 'Total quantity',
      value: summary.totalStockQty,
      valueClassName: 'text-amber-600',
      valueFontSize: 18,
    },
    {
      icon: WalletIcon,
      iconColor: '#C88B4A',
      label: 'Total Stock Value',
      sublabel: 'Total inventory value',
      value: formatRM(summary.totalStockValue),
      valueClassName: 'text-purple-700',
      valueFontSize: 16,
    },
  ]

  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #ECE7DF',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(24,24,27,0.04)',
        padding: 14,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            alignItems: 'center',
            background: '#F6F3EE',
            border: '1px solid #ECE7DF',
            borderRadius: 9,
            display: 'grid',
            flexShrink: 0,
            height: 28,
            placeItems: 'center',
            width: 28,
          }}
        >
          <BoxIcon
            style={{
              color: '#16A34A',
              height: 15,
              width: 15,
            }}
          />
        </span>
        <h3
          style={{
            color: '#18181B',
            fontSize: 14,
            fontWeight: 800,
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
          gap: 8,
          width: '100%',
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
  width,
}) {
  return (
    <div
      style={{
        background: '#FAFAF8',
        border: '1px solid #ECE7DF',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minWidth: 0,
        height: 76,
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '10px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 6,
          marginBottom: 5,
          minWidth: 0,
        }}
      >
        <span
          style={{
            alignItems: 'center',
            background: '#FFFFFF',
            border: '1px solid #ECE7DF',
            borderRadius: 8,
            display: 'grid',
            flexShrink: 0,
            height: 24,
            padding: 3,
            placeItems: 'center',
            width: 24,
          }}
        >
          <Icon
            style={{
              color: iconColor,
              height: 13,
              width: 13,
            }}
          />
        </span>
        <p
          style={{
            color: '#71717A',
            fontSize: 9,
            fontWeight: 700,
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
          color: '#18181B',
          fontSize: 12,
          fontWeight: 900,
          lineHeight: 1.15,
          margin: '0 0 2px',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </p>
      <p
        style={{
          color: '#71717A',
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
