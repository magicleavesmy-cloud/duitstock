import { BoxIcon } from '../icons'

export default function StockEntriesTable({ entries }) {
  return (
    <section
      className="dashboard-stock-entries"
      style={{
        background: '#FCF8F3',
        border: '1px solid rgba(210,175,120,0.35)',
        borderRadius: 18,
        boxShadow:
          '6px 6px 16px rgba(190,160,120,0.18), -6px -6px 16px rgba(255,255,255,0.90)',
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            className="font-bold tracking-tight"
            style={{ color: '#3B2A1A', fontSize: 14 }}
          >
            Last 20 Stock Entries
          </h3>
          <p
            className="mt-0.5 font-semibold"
            style={{ color: '#7A6250', fontSize: 11 }}
          >
            Latest stock transaction logs.
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 font-bold"
          style={{
            background: '#F0E8DC',
            border: '1px solid rgba(210,175,120,0.35)',
            color: '#7A6250',
            fontSize: 11,
          }}
        >
          {entries.length}
        </span>
      </div>

      {entries.length ? (
        <div
          className="dashboard-stock-table mt-2.5"
          style={{
            background: '#F0E8DC',
            border: '1px solid rgba(210,175,120,0.35)',
            borderRadius: 14,
            maxHeight: 420,
            overflowX: 'hidden',
            overflowY: 'auto',
          }}
        >
          <div className="min-w-[330px] table-fixed" style={{ background: 'transparent' }}>
            <div
              className="sticky top-0 z-10 grid grid-cols-[110px_60px_45px_50px_65px] font-bold uppercase leading-[1.1]"
              style={{
                background: '#F0E8DC',
                color: '#7A6250',
                fontSize: 10,
                padding: '8px 6px',
              }}
            >
              <span>Product</span>
              <span>Action</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Stock</span>
              <span className="text-right">Updated</span>
            </div>
            <div style={{ background: 'transparent' }}>
              {entries.map((entry) => (
                <article
                  className="grid grid-cols-[110px_60px_45px_50px_65px] items-center leading-[1.1]"
                  key={entry.id}
                  style={{
                    background: 'transparent',
                    borderBottom: '1px solid rgba(210,175,120,0.25)',
                    fontSize: 11,
                    height: 44,
                    padding: '0 6px',
                  }}
                >
                  <p
                    className="max-w-[110px] truncate font-bold"
                    style={{ color: '#3B2A1A' }}
                  >
                    {entry.productName}
                  </p>
                  <span
                    className="w-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-[1.1]"
                    style={{
                      background:
                        entry.action === 'Stock In'
                          ? 'rgba(93,138,82,0.14)'
                          : 'rgba(184,92,74,0.14)',
                      border:
                        entry.action === 'Stock In'
                          ? '1px solid rgba(93,138,82,0.25)'
                          : '1px solid rgba(184,92,74,0.25)',
                      color: entry.action === 'Stock In' ? '#5D8A52' : '#B85C4A',
                    }}
                  >
                    {entry.action}
                  </span>
                  <p
                    className="text-right font-bold"
                    style={{
                      color: entry.quantityChange > 0 ? '#5D8A52' : '#B85C4A',
                      fontSize: 12,
                    }}
                  >
                    {entry.quantityChange > 0 ? '+' : ''}
                    {entry.quantityChange}
                  </p>
                  <p
                    className="text-right font-bold"
                    style={{ color: '#7A6250', fontSize: 11 }}
                  >
                    {entry.currentStock}
                  </p>
                  <p
                    className={`entry-updated text-right ${entry.updatedState}`}
                    style={{ color: '#5D8A52', fontSize: 11 }}
                  >
                    {entry.updatedLabel}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="No stock entries yet" text="Saved stock transactions will appear here." />
      )}
    </section>
  )
}

function EmptyState({ action, actionText, text, title }) {
  return (
    <div
      className="mt-3 rounded-[22px] border border-dashed px-4 py-7 text-center"
      style={{
        background: '#F0E8DC',
        borderColor: 'rgba(210,175,120,0.35)',
      }}
    >
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl text-zinc-500">
        <BoxIcon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">{text}</p>
      {action && (
        <button className="primary-button mt-5" onClick={action} type="button">
          {actionText}
        </button>
      )}
    </div>
  )
}
