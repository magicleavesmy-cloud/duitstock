import { ArrowDownIcon, ArrowUpIcon, StarIcon } from '../icons'
import { DashboardBox } from './DashboardCard'

export default function ProductValueTable({
  formatNumber,
  formatRM,
  products,
  recentEntries = [],
  totalStockQty,
}) {
  const recentChangeByProduct = getRecentStockInChanges(recentEntries)

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
              <col style={{ width: '8%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '32%' }} />
            </colgroup>
            <thead>
              <tr style={{ height: 34 }}>
                <HeaderCell>#</HeaderCell>
                <HeaderCell>Product</HeaderCell>
                <HeaderCell align="right" style={{ color: '#B09A85', fontSize: 9 }}>
                  Chg
                </HeaderCell>
                <HeaderCell align="right">Qty</HeaderCell>
                <HeaderCell align="right">Value</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => {
                const change =
                  recentChangeByProduct.get(product.id) ?? recentChangeByProduct.get(product.name) ?? 0

                return (
                  <tr key={product.id} style={{ height: 46, verticalAlign: 'middle' }}>
                    <td style={rankCellStyle}>
                      <span className="most-value-rank">
                        {index + 1}
                      </span>
                    </td>
                    <td style={productCellStyle}>
                      {product.name}
                    </td>
                    <td style={changeCellStyle}>
                      <ProductChange value={change} />
                    </td>
                    <td style={qtyCellStyle}>
                      {formatNumber(product.stockQty)}
                    </td>
                    <td style={valueCellStyle}>
                      {formatRM(product.stockValue)}
                    </td>
                  </tr>
                )
              })}
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

const changeCellStyle = {
  ...baseCellStyle,
  fontSize: 12,
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

function ProductChange({ value }) {
  const change = Number(value) || 0

  if (change === 0) {
    return <span style={{ color: '#B09A85', fontWeight: 800 }}>-</span>
  }

  return (
    <span style={{ color: change > 0 ? '#5D8A52' : '#B85C4A', fontWeight: 800 }}>
      {change > 0 ? `+${change}` : change}
    </span>
  )
}

function getRecentStockInChanges(entries) {
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
  const changes = new Map()

  entries.forEach((entry) => {
    if (entry.action !== 'Stock In') return

    const timestamp =
      entry.timestamp instanceof Date ? entry.timestamp.getTime() : new Date(entry.timestamp).getTime()
    if (!Number.isFinite(timestamp) || timestamp < tenDaysAgo) return

    const quantityChange = Number(entry.quantityChange) || 0
    if (!quantityChange) return

    if (entry.productId) {
      changes.set(entry.productId, (changes.get(entry.productId) || 0) + quantityChange)
    }

    if (entry.productName) {
      changes.set(entry.productName, (changes.get(entry.productName) || 0) + quantityChange)
    }
  })

  return changes
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
