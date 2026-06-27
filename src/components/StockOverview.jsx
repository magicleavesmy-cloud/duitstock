import { BoxIcon, LayersIcon, WalletIcon } from '../icons'

export default function StockOverview({ summary, formatRM }) {
  const metrics = [
    {
      icon: BoxIcon,
      iconColor: '#5D8A52',
      label: 'Products',
      sublabel: 'Total products',
      value: summary.totalProducts,
      valueClassName: 'text-emerald-700',
      valueFontSize: 15,
    },
    {
      icon: LayersIcon,
      iconColor: '#C8893A',
      label: 'Total Stock Qty',
      sublabel: 'Total quantity',
      value: summary.totalStockQty,
      valueClassName: 'text-amber-600',
      valueFontSize: 15,
    },
    {
      icon: WalletIcon,
      iconColor: '#C8893A',
      label: 'Total Stock Value',
      sublabel: 'Total inventory value',
      value: formatRM(summary.totalStockValue),
      valueClassName: 'text-purple-700',
      valueFontSize: 13,
    },
  ]

  return (
    <section
      style={{
        background: '#FCF8F3',
        border: '1px solid rgba(210,175,120,0.35)',
        borderRadius: 18,
        boxShadow:
          '6px 6px 16px rgba(190,160,120,0.18), -6px -6px 16px rgba(255,255,255,0.90)',
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
            boxShadow:
              'inset 3px 3px 7px rgba(190,160,120,0.18), inset -3px -3px 7px rgba(255,255,255,0.90)',
            background: '#F0E8DC',
            border: '1px solid rgba(210,175,120,0.35)',
            borderRadius: 10,
            display: 'grid',
            flexShrink: 0,
            height: 18,
            placeItems: 'center',
            width: 18,
          }}
        >
          <BoxIcon
            style={{
              color: '#5D8A52',
              filter: 'drop-shadow(0 0 6px currentColor)',
              height: 18,
              width: 18,
            }}
          />
        </span>
        <h3
          style={{
            color: '#3B2A1A',
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
  valueFontSize,
  width,
}) {
  return (
    <div
      style={{
        background: '#F0E8DC',
        border: '1px solid rgba(210,175,120,0.35)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minWidth: 0,
        height: 68,
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '8px 10px',
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
            boxShadow:
              'inset 3px 3px 7px rgba(190,160,120,0.18), inset -3px -3px 7px rgba(255,255,255,0.90)',
            background: '#FCF8F3',
            border: '1px solid rgba(210,175,120,0.35)',
            borderRadius: 10,
            display: 'grid',
            flexShrink: 0,
            height: 18,
            padding: 3,
            placeItems: 'center',
            width: 18,
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
            color: '#7A6250',
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
          color: '#B09A85',
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
