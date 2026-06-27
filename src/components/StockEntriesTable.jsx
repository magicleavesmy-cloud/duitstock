import { BoxIcon } from '../icons'

export default function StockEntriesTable({ entries }) {
  return (
    <section
      className="dashboard-stock-entries"
      style={{
        background: '#FFFFFF',
        border: '1px solid #ECE7DF',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(24,24,27,0.04)',
        padding: 12,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            className="font-bold tracking-tight"
            style={{ color: '#18181B', fontSize: 14 }}
          >
            Last 20 Stock Entries
          </h3>
          <p
            className="mt-0.5 font-semibold"
            style={{ color: '#71717A', fontSize: 11 }}
          >
            Latest stock transaction logs.
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 font-bold"
          style={{
            background: '#F6F3EE',
            border: '1px solid #ECE7DF',
            color: '#71717A',
            fontSize: 11,
          }}
        >
          {entries.length}
        </span>
      </div>

      {entries.length ? (
        <div
          className="dashboard-stock-table mt-2"
          style={{
            background: '#FFFFFF',
            border: '1px solid #ECE7DF',
            borderRadius: 12,
          }}
        >
          <div className="min-w-[330px] table-fixed" style={{ background: 'transparent' }}>
            <div
              className="sticky top-0 z-10 grid grid-cols-[112px_62px_44px_50px_64px] font-bold uppercase leading-[1.1]"
              style={{
                background: '#F6F3EE',
                color: '#71717A',
                fontSize: 10,
                padding: '8px 7px',
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
                  className="grid grid-cols-[112px_62px_44px_50px_64px] items-center leading-[1.1]"
                  key={entry.id}
                  style={{
                    background: 'transparent',
                    borderBottom: '1px solid #ECE7DF',
                    fontSize: 11,
                    height: 46,
                    padding: '0 7px',
                  }}
                >
                  <p
                    className="max-w-[110px] truncate font-bold"
                    style={{ color: '#18181B' }}
                  >
                    {entry.productName}
                  </p>
                  <span
                    className="w-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-[1.1]"
                    style={{
                      background:
                        entry.action === 'Stock In'
                          ? 'rgba(22,163,74,0.08)'
                          : 'rgba(220,38,38,0.08)',
                      border:
                        entry.action === 'Stock In'
                          ? '1px solid rgba(22,163,74,0.16)'
                          : '1px solid rgba(220,38,38,0.16)',
                      color: entry.action === 'Stock In' ? '#16A34A' : '#DC2626',
                    }}
                  >
                    {entry.action}
                  </span>
                  <p
                    className="text-right font-bold"
                    style={{
                      color: entry.quantityChange > 0 ? '#16A34A' : '#DC2626',
                      fontSize: 12,
                    }}
                  >
                    {entry.quantityChange > 0 ? '+' : ''}
                    {entry.quantityChange}
                  </p>
                  <p
                    className="text-right font-bold"
                    style={{ color: '#71717A', fontSize: 11 }}
                  >
                    {entry.currentStock}
                  </p>
                  <p
                    className={`entry-updated text-right ${entry.updatedState}`}
                    style={{ color: '#16A34A', fontSize: 11 }}
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
        background: '#F6F3EE',
        borderColor: '#ECE7DF',
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
