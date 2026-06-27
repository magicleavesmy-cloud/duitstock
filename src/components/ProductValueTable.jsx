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
            background: '#FFFFFF',
            border: '1px solid #ECE7DF',
            borderRadius: 12,
            boxShadow: 'none',
            width: '100%',
          }}
        >
          <style>
            {`
              .product-value-scroll::-webkit-scrollbar {
                width: 3px;
              }

              .product-value-scroll::-webkit-scrollbar-track {
                background: #F6F3EE;
              }

              .product-value-scroll::-webkit-scrollbar-thumb {
                background: #C88B4A;
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
              <col style={{ width: '10%' }} />
              <col style={{ width: '45%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '27%' }} />
            </colgroup>
            <thead>
              <tr style={{ height: 34 }}>
                <HeaderCell>#</HeaderCell>
                <HeaderCell>Product</HeaderCell>
                <HeaderCell align="right">Qty</HeaderCell>
                <HeaderCell align="right">Value</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={product.id} style={{ height: 46, verticalAlign: 'middle' }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] font-semibold">No products yet</p>
      )}
    </DashboardBox>
  )
}

const baseCellStyle = {
  borderTop: '1px solid #ECE7DF',
  opacity: 1,
  verticalAlign: 'middle',
}

const rankCellStyle = {
  ...baseCellStyle,
  padding: '9px 4px 9px 6px',
}

const productCellStyle = {
  ...baseCellStyle,
  color: '#18181B',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0,
  maxWidth: 130,
  overflow: 'hidden',
  padding: '9px 7px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const qtyCellStyle = {
  ...baseCellStyle,
  color: '#18181B',
  fontSize: 12,
  fontWeight: 700,
  padding: '9px 7px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const valueCellStyle = {
  ...baseCellStyle,
  color: '#18181B',
  fontSize: 12,
  fontWeight: 800,
  opacity: 1,
  padding: '9px 7px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const trendCellStyle = {
  ...baseCellStyle,
  fontSize: 10,
  fontWeight: 700,
  minWidth: 60,
  padding: '9px 7px 9px 2px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

function HeaderCell({ align = 'left', children, style = {} }) {
  return (
    <th
      style={{
        background: '#F6F3EE',
        color: '#71717A',
        fontSize: 9,
        fontWeight: 800,
        opacity: 1,
        padding: align === 'right' ? '8px 7px' : '8px 6px',
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
    down: '#DC2626',
    flat: '#71717A',
    up: '#16A34A',
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
