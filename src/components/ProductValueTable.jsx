import { ArrowDownIcon, ArrowUpIcon, StarIcon } from '../icons'
import { DashboardBox } from './DashboardCard'

export default function ProductValueTable({
  formatNumber,
  formatRM,
  products,
  totalStockQty,
}) {
  return (
    <DashboardBox
      accent="gold"
      className="most-value-card"
      headerAction={
        <span className="stock-qty-pill">
          Total Stock Qty <strong>{formatNumber(totalStockQty)}</strong>
        </span>
      }
      icon={StarIcon}
      iconClassName="bg-amber-50 text-amber-600 ring-amber-100"
      title="Most Value Products"
    >
      {products.length ? (
        <div
          className="product-value-scroll"
          style={{
            background: 'rgba(2, 11, 18, 0.28)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            borderRadius: 14,
            maxHeight: 476,
            overflowX: 'hidden',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            width: '100%',
          }}
        >
          <style>
            {`
              .product-value-scroll::-webkit-scrollbar {
                width: 3px;
              }

              .product-value-scroll::-webkit-scrollbar-track {
                background: transparent;
              }

              .product-value-scroll::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.28);
                border-radius: 999px;
              }
            `}
          </style>
          <table
            style={{
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              width: '100%',
            }}
          >
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '42%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr style={{ height: 36 }}>
                <HeaderCell>#</HeaderCell>
                <HeaderCell>Product</HeaderCell>
                <HeaderCell align="right">Qty</HeaderCell>
                <HeaderCell align="right">Value</HeaderCell>
                <HeaderCell align="right" style={{ minWidth: 60 }}>Trend</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={product.id} style={{ height: 44, verticalAlign: 'middle' }}>
                  <td style={rankCellStyle}>
                    <span className="most-value-rank">
                      {index + 1}
                    </span>
                  </td>
                  <td style={productCellStyle}>
                    {product.name}
                  </td>
                  <td style={qtyCellStyle}>
                    {formatNumber(product.stockQty)}
                  </td>
                  <td style={valueCellStyle}>
                    {formatRM(product.stockValue)}
                  </td>
                  <td style={trendCellStyle}>
                    <ProductTrend trend={product.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-zinc-500">No products yet</p>
      )}
    </DashboardBox>
  )
}

const baseCellStyle = {
  borderTop: '1px solid rgba(255, 255, 255, 0.10)',
  opacity: 1,
  verticalAlign: 'middle',
}

const rankCellStyle = {
  ...baseCellStyle,
  padding: '8px 3px 8px 5px',
}

const productCellStyle = {
  ...baseCellStyle,
  color: 'rgba(255,255,255,0.92)',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '-0.1px',
  maxWidth: 130,
  overflow: 'hidden',
  padding: '8px 6px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const qtyCellStyle = {
  ...baseCellStyle,
  color: '#38bdf8',
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 6px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const valueCellStyle = {
  ...baseCellStyle,
  color: '#c084fc',
  fontSize: 12,
  fontWeight: 800,
  opacity: 1,
  padding: '8px 6px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const trendCellStyle = {
  ...baseCellStyle,
  fontSize: 10,
  fontWeight: 700,
  minWidth: 60,
  padding: '8px 6px 8px 2px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

function HeaderCell({ align = 'left', children, style = {} }) {
  return (
    <th
      style={{
        background: 'rgba(15, 30, 42, 0.88)',
        color: '#CBD5E1',
        fontSize: 8,
        fontWeight: 800,
        opacity: 1,
        padding: align === 'right' ? '8px 6px' : '8px 5px',
        position: 'sticky',
        textAlign: align,
        textTransform: 'uppercase',
        top: 0,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        zIndex: 1,
        ...style,
      }}
    >
      {children}
    </th>
  )
}

function ProductTrend({ trend }) {
  if (!trend || trend.direction === 'flat') {
    return <span style={getTrendStyle('flat')}>-</span>
  }

  const Icon = trend.direction === 'up' ? ArrowUpIcon : ArrowDownIcon

  return (
    <span style={getTrendStyle(trend.direction)}>
      <Icon style={{ height: 11, width: 11, flexShrink: 0 }} />
      {trend.label}
    </span>
  )
}

function getTrendStyle(direction) {
  const colors = {
    down: '#EF4444',
    flat: '#64748B',
    up: '#22C55E',
  }

  return {
    alignItems: 'center',
    color: colors[direction] || colors.flat,
    display: 'inline-flex',
    fontSize: 10,
    fontWeight: 700,
    gap: 2,
    justifyContent: 'flex-end',
    minWidth: 60,
    opacity: 1,
    whiteSpace: 'nowrap',
  }
}
