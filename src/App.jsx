import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const PRODUCTS_KEY = 'duitstock-products'
const STOCK_CHECKS_KEY = 'duitstock-stock-checks'
const STOCK_IN_RECORDS_KEY = 'duitstock-stock-in-records'
const USER_ROLE_KEY = 'currentUserRole'

const emptyProduct = {
  name: '',
  category: '',
  costPrice: '',
  sellingPrice: '',
  stockQty: '',
  minimumStock: '',
  supplier: '',
  sku: '',
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { id: 'products', label: 'Products', icon: BoxIcon },
  { id: 'movements', label: 'Stock Check', icon: ArrowsIcon },
  { id: 'stockInHistory', label: 'Stock In', icon: PlusBoxIcon },
  { id: 'reports', label: 'Reports', icon: ChartIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]
const staffNavItems = navItems.filter((item) =>
  ['products', 'movements', 'stockInHistory'].includes(item.id),
)
const roleHomePages = {
  admin: 'dashboard',
  staff: 'products',
}

const sampleProducts = [
  {
    id: 'sample-1',
    name: 'Arabica Beans 1kg',
    category: 'Coffee',
    costPrice: 38,
    sellingPrice: 58,
    stockQty: 24,
    minimumStock: 8,
    supplier: 'North Roast Supply',
    sku: 'COF-ARA-1KG',
  },
  {
    id: 'sample-2',
    name: 'Matte Black Tumbler',
    category: 'Merch',
    costPrice: 22,
    sellingPrice: 39,
    stockQty: 6,
    minimumStock: 10,
    supplier: 'Urban Goods',
    sku: 'MER-TBL-BLK',
  },
]

function App() {
  const [currentUserRole, setCurrentUserRole] = useState(() => readStorage(USER_ROLE_KEY, ''))
  const isAdmin = currentUserRole === 'admin'
  const isStaff = currentUserRole === 'staff'
  const visibleNavItems = isStaff ? staffNavItems : navItems
  const [activePage, setActivePage] = useState(() => roleHomePages[currentUserRole] || 'dashboard')
  const {
    error,
    isCloudEnabled,
    isLoading,
    products,
    setProducts,
    setStockChecks,
    setStockInRecords,
    stockChecks,
    stockInRecords,
    syncStatus,
    syncStatusText,
  } = useDuitStockSync()
  const [editingProduct, setEditingProduct] = useState(null)
  const [stockInProduct, setStockInProduct] = useState(null)
  const [actionError, setActionError] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!currentUserRole) return
    writeStorage(USER_ROLE_KEY, currentUserRole)
  }, [currentUserRole])

  const metrics = useMemo(
    () => buildMetrics(products, stockChecks),
    [products, stockChecks],
  )
  const productCategories = useMemo(() => getCategories(products), [products])
  const visibleActivePage = visibleNavItems.some((item) => item.id === activePage)
    ? activePage
    : roleHomePages[currentUserRole]

  function login(password) {
    const role = password === '4321' ? 'admin' : password === '1234' ? 'staff' : ''

    if (!role) {
      showToast('error', 'Wrong password')
      return
    }

    setCurrentUserRole(role)
    setActivePage(roleHomePages[role])
    showToast('success', `${role === 'admin' ? 'Admin' : 'Staff'} logged in.`)
  }

  function logout() {
    window.localStorage.removeItem(USER_ROLE_KEY)
    setCurrentUserRole('')
    setActivePage('dashboard')
    setEditingProduct(null)
    setStockInProduct(null)
  }

  function showToast(type, message) {
    setToast({ id: createId(), message, type })
  }

  function showError(message) {
    setActionError(message)
    showToast('error', message)
  }

  async function saveProduct(product) {
    if (!isAdmin && product.id) {
      showError('Only admin can edit products.')
      return
    }

    if (!isAdmin && !isStaff) {
      showError('Only logged-in users can add products.')
      return
    }

    const normalized = normalizeProduct(product)
    setActionError('')

    if (isCloudEnabled) {
      try {
        const productId = normalized.id || createId()
        await setDoc(
          doc(db, 'products', productId),
          {
            ...normalized,
            id: productId,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        setEditingProduct(null)
        showToast('success', 'Product saved.')
      } catch {
        showError('Product could not be saved to Firestore. Check your connection and Firebase rules.')
      }
      return
    }

    setProducts((current) => {
      if (normalized.id) {
        return current.map((item) => (item.id === normalized.id ? normalized : item))
      }

      return [{ ...normalized, id: createId() }, ...current]
    })

    setEditingProduct(null)
    showToast('success', 'Product saved.')
  }

  async function deleteProduct(productId) {
    if (!isAdmin) {
      showError('Only admin can delete products.')
      return
    }

    const product = products.find((item) => item.id === productId)
    const confirmed = window.confirm(
      `Delete ${product?.name || 'this product'}? Its movement history will stay for reference.`,
    )

    if (!confirmed) return
    setActionError('')

    if (isCloudEnabled) {
      try {
        await deleteDoc(doc(db, 'products', productId))
        showToast('success', 'Product deleted.')
      } catch {
        showError('Product could not be deleted from Firestore.')
      }
      return
    }

    setProducts((current) => current.filter((item) => item.id !== productId))
    showToast('success', 'Product deleted.')
  }

  async function saveStockCheck(checkRows) {
    if (!isAdmin && !isStaff) {
      showError('Only logged-in users can save stock checks.')
      return false
    }

    const invalidRow = checkRows.find((row) => Number(row.countedStock) < 0)

    if (invalidRow) {
      showError('Current counted stock cannot be negative.')
      return false
    }

    if (!checkRows.length) {
      showError('Add products before saving a stock check.')
      return false
    }

    setActionError('')

    const checkedAt = new Date().toISOString().slice(0, 10)
    const records = checkRows.map((row) => {
      const previousStock = Number(row.previousStock) || 0
      const countedStock = Number(row.countedStock) || 0
      const soldQty = Math.max(0, previousStock - countedStock)
      const addedQty = Math.max(0, countedStock - previousStock)
      const salesValue = soldQty * (Number(row.sellingPrice) || 0)
      const costValue = soldQty * (Number(row.costPrice) || 0)
      const profit = soldQty > 0 ? salesValue - costValue : 0

      return {
        id: createId(),
        addedQty,
        costValue,
        countedStock,
        checkedBy: currentUserRole,
        date: checkedAt,
        note: 'Stock check',
        previousStock,
        productId: row.productId,
        productName: row.productName,
        profit,
        salesValue,
        soldQty,
        type: 'stock-check',
      }
    })

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)

        records.forEach((record) => {
          batch.set(doc(db, 'stockChecks', record.id), {
            ...record,
            createdAt: serverTimestamp(),
          })
          batch.set(
            doc(db, 'products', record.productId),
            {
              stockQty: record.countedStock,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )
        })

        await batch.commit()
        setProducts((current) =>
          current.map((product) => {
            const record = records.find((item) => item.productId === product.id)
            return record ? { ...product, stockQty: record.countedStock } : product
          }),
        )
        setStockChecks((current) => [...records, ...current])
        showToast('success', 'Stock check saved.')
        return true
      } catch {
        showError('Stock check could not be saved to Firestore.')
        return false
      }
    }

    setProducts((current) =>
      current.map((product) => {
        const record = records.find((item) => item.productId === product.id)
        return record ? { ...product, stockQty: record.countedStock } : product
      }),
    )
    setStockChecks((current) => [...records, ...current])
    showToast('success', 'Stock check saved locally.')
    return true
  }

  async function saveStockIn(stockIn) {
    const stockInItems = stockIn.items || [stockIn]
    const invalidItem = stockInItems.find((item) => Number(item.quantityAdded) <= 0)

    if (invalidItem) {
      showError('Quantity to add must be more than zero.')
      return false
    }

    const missingProduct = stockInItems.find(
      (item) => !products.find((product) => product.id === item.productId),
    )
    if (missingProduct) {
      showError('Product was not found. Please refresh and try again.')
      return false
    }

    setActionError('')

    const recordDate = stockIn.date || new Date().toISOString().slice(0, 10)
    const records = stockInItems.map((item) => {
      const product = products.find((productItem) => productItem.id === item.productId)
      const quantityAdded = Number(item.quantityAdded) || 0
      const purchaseCost = Number(item.purchaseCost ?? item.price) || Number(product.costPrice) || 0
      const supplierNotes = (item.supplierNotes ?? item.notes ?? '').trim()

      return {
        id: createId(),
        amount: quantityAdded * purchaseCost,
        date: recordDate,
        notes: supplierNotes,
        price: purchaseCost,
        productId: product.id,
        productName: product.name,
        purchaseCost,
        quantityAdded,
        supplierNotes,
        type: 'stock-in',
      }
    })

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)

        records.forEach((record) => {
          batch.set(doc(db, 'stockInRecords', record.id), {
            ...record,
            createdAt: serverTimestamp(),
          })
          batch.set(
            doc(db, 'products', record.productId),
            {
              stockQty: increment(record.quantityAdded),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )
        })
        await batch.commit()
        setStockInProduct(null)
        showToast('success', records.length > 1 ? 'Stock items added.' : 'Stock added.')
        return true
      } catch {
        showError('Stock in could not be saved to Firestore.')
        return false
      }
    }

    setProducts((current) =>
      current.map((product) => {
        const addedQty = records
          .filter((record) => record.productId === product.id)
          .reduce((total, record) => total + record.quantityAdded, 0)

        return addedQty
          ? { ...product, stockQty: Number(product.stockQty || 0) + addedQty }
          : product
      }),
    )
    setStockInRecords((current) => [
      ...records.map((record) => ({ ...record, createdAt: new Date().toISOString() })),
      ...current,
    ])
    setStockInProduct(null)
    showToast('success', records.length > 1 ? 'Stock items added locally.' : 'Stock added locally.')
    return true
  }

  async function clearAllData() {
    if (!isAdmin) {
      showError('Only admin can clear data.')
      return
    }

    const confirmed = window.confirm('Clear all DuitStock products, stock checks, and stock-in history?')
    if (!confirmed) return
    setActionError('')

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)
        products.forEach((product) => batch.delete(doc(db, 'products', product.id)))
        stockChecks.forEach((stockCheck) =>
          batch.delete(doc(db, 'stockChecks', stockCheck.id)),
        )
        stockInRecords.forEach((record) =>
          batch.delete(doc(db, 'stockInRecords', record.id)),
        )
        await batch.commit()
        setActivePage('dashboard')
        showToast('success', 'Cloud data cleared.')
      } catch {
        showError('Cloud data could not be cleared from Firestore.')
      }
      return
    }

    setProducts([])
    setStockChecks([])
    setStockInRecords([])
    setActivePage('dashboard')
    showToast('success', 'Local data cleared.')
  }

  async function loadSampleProducts() {
    if (!isAdmin) {
      showError('Only admin can load sample products.')
      return
    }

    setActionError('')

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)
        sampleProducts.forEach((product) => {
          batch.set(doc(db, 'products', product.id), {
            ...product,
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
        showToast('success', 'Sample products uploaded.')
      } catch {
        showError('Sample products could not be uploaded to Firestore.')
      }
      return
    }

    setProducts(sampleProducts)
    showToast('success', 'Sample products loaded.')
  }

  if (!currentUserRole) {
    return (
      <div className="app-background min-h-screen text-zinc-950">
        <LoginPage onLogin={login} />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    )
  }

  return (
    <div className="app-background min-h-screen text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-2 pb-20 pt-2.5 sm:px-3 sm:pt-4 lg:px-5">
        <Header
          activePage={visibleActivePage}
          currentUserRole={currentUserRole}
          onLogout={logout}
          syncStatus={syncStatus}
          syncStatusText={syncStatusText}
          visibleNavItems={visibleNavItems}
        />

        <main className="flex-1">
          {isLoading ? (
            <LoadingState />
          ) : (
            <>
              {(error || actionError) && (
                <SyncErrorBanner message={actionError || error} />
              )}
              {isAdmin && visibleActivePage === 'dashboard' && (
                <DashboardPage metrics={metrics} products={products} />
              )}
              {visibleActivePage === 'products' && (
                <ProductsPage
                  canAddProducts={isAdmin || isStaff}
                  canManageProducts={isAdmin}
                  canViewCosts={isAdmin}
                  products={products}
                  onDelete={deleteProduct}
                  onEdit={setEditingProduct}
                  onNew={() => {
                    if (!isAdmin && !isStaff) {
                      showError('Only logged-in users can add products.')
                      return
                    }
                    setEditingProduct(emptyProduct)
                  }}
                  onStockIn={setStockInProduct}
                />
              )}
              {visibleActivePage === 'movements' && (
                <MovementsPage
                  canViewProfit={isAdmin}
                  products={products}
                  stockChecks={stockChecks}
                  onSave={saveStockCheck}
                />
              )}
              {visibleActivePage === 'stockInHistory' && (
                <StockInHistoryPage
                  canDeleteRows={isAdmin}
                  canViewCosts={isAdmin}
                  products={products}
                  stockInRecords={stockInRecords}
                  onSave={saveStockIn}
                />
              )}
              {isAdmin && visibleActivePage === 'reports' && (
                <ReportsPage products={products} stockChecks={stockChecks} />
              )}
              {isAdmin && visibleActivePage === 'settings' && (
                <SettingsPage
                  isCloudEnabled={isCloudEnabled}
                  products={products}
                  stockChecks={stockChecks}
                  stockInRecords={stockInRecords}
                  onClearAll={clearAllData}
                  onLoadSample={loadSampleProducts}
                />
              )}
            </>
          )}
        </main>
      </div>

      {editingProduct && (
        <ProductModal
          categories={productCategories}
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={saveProduct}
        />
      )}

      {stockInProduct && (
        <StockInModal
          product={stockInProduct}
          onClose={() => setStockInProduct(null)}
          onSave={saveStockIn}
        />
      )}

      <BottomNav
        activePage={visibleActivePage}
        items={visibleNavItems}
        onChange={setActivePage}
      />
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function Header({
  activePage,
  currentUserRole,
  onLogout,
  syncStatus,
  syncStatusText,
  visibleNavItems,
}) {
  const title = visibleNavItems.find((item) => item.id === activePage)?.label
  const greeting = getGreeting()

  return (
    <header className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="app-logo shrink-0">
          <BoxIcon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-zinc-500">{greeting}, DuitStock</p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
            {title}
          </h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600 shadow-sm ring-1 ring-zinc-200">
          {currentUserRole}
        </span>
        <SyncStatusPill status={syncStatus} text={syncStatusText} />
        <button
          className="secondary-button h-8 rounded-full px-2 text-[10px]"
          onClick={onLogout}
          type="button"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onLogin(password)
    setPassword('')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <form
        className="w-full rounded-[24px] bg-white p-4 shadow-xl shadow-zinc-200/70 ring-1 ring-zinc-200"
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="app-logo">
            <BoxIcon className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Login</h1>
          </div>
        </div>

        <Field label="Password">
          <input
            className="field-input mt-3 h-11"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
            type="password"
            value={password}
          />
        </Field>

        <button className="primary-button mt-4 h-11 w-full" type="submit">
          Login
        </button>
      </form>
    </main>
  )
}

function DashboardPage({ metrics, products }) {
  const lowStock = products.filter(
    (item) => Number(item.stockQty) <= Number(item.minimumStock),
  )
  const topValueStocks = products
    .map((product) => {
      const stockQty = Number(product.stockQty) || 0
      const costPrice = Number(product.costPrice) || 0

      return {
        ...product,
        costPrice,
        stockQty,
        stockValue: stockQty * costPrice,
      }
    })
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 10)
  const dashboardCards = [
    {
      label: 'Total Products',
      value: metrics.totalProducts,
      icon: PackageCheckIcon,
      tone: 'zinc',
    },
    {
      label: 'Stock Quantity',
      value: metrics.totalQuantity,
      icon: LayersIcon,
      tone: 'sky',
    },
    {
      label: 'Cost Value',
      value: formatRM(metrics.totalCostValue),
      icon: WalletIcon,
      tone: 'amber',
    },
    {
      label: 'Selling Value',
      value: formatRM(metrics.totalSellingValue),
      icon: TagIcon,
      tone: 'indigo',
    },
    {
      label: 'Estimated Profit',
      value: formatRM(metrics.estimatedProfit),
      icon: ProfitIcon,
      tone: 'emerald',
    },
    {
      label: 'Low Stock Alert',
      value: metrics.lowStockCount,
      icon: AlertIcon,
      tone: metrics.lowStockCount ? 'rose' : 'zinc',
    },
    {
      label: 'Today Sold Qty',
      value: metrics.todaySoldQty,
      icon: ArrowsIcon,
      tone: 'sky',
    },
    {
      label: 'Today Sales',
      value: formatRM(metrics.todaySalesValue),
      icon: TagIcon,
      tone: 'indigo',
    },
    {
      label: 'Today Profit',
      value: formatRM(metrics.todayProfit),
      icon: ProfitIcon,
      tone: 'emerald',
    },
  ]

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {dashboardCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="premium-panel overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <WalletIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Top 10 Highest Value Stocks
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Ranked by current stock quantity and cost price.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200">
            {topValueStocks.length}
          </span>
        </div>

        {topValueStocks.length ? (
          <div className="mt-3 space-y-1.5">
            {topValueStocks.map((item) => (
              <div
                className="flex items-center justify-between gap-2.5 rounded-[18px] bg-white/72 p-2 shadow-sm ring-1 ring-white/80 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md"
                key={item.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProductThumbnail name={item.name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {item.category || 'Uncategorised'} · Stock {item.stockQty} · Cost{' '}
                      {formatRM(item.costPrice)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Value</p>
                  <p className="text-sm font-bold text-zinc-950">
                    {formatRM(item.stockValue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No stock value data yet" text="Products will appear here after they are added." />
        )}
      </div>

      <div className="premium-panel overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <AlertIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">Low stock</h2>
                {lowStock.length > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    Action needed
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                Products at or below minimum stock.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200">
            {lowStock.length}
          </span>
        </div>

        {lowStock.length ? (
          <div className="mt-3 space-y-1.5">
            {lowStock.map((item) => (
              <div
                className="flex items-center justify-between gap-2.5 rounded-[18px] bg-white/72 p-2 shadow-sm ring-1 ring-white/80 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md"
                key={item.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProductThumbnail name={item.name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {item.category || 'Uncategorised'} / Min {item.minimumStock}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-rose-600 px-2 py-1 text-[11px] font-bold text-white shadow-sm shadow-rose-200">
                  {item.stockQty} left
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Stock levels look calm"
            text="Products that reach minimum stock will appear here."
          />
        )}
      </div>
    </section>
  )
}

function ProductsPage({
  canAddProducts,
  canManageProducts,
  canViewCosts,
  products,
  onDelete,
  onEdit,
  onNew,
  onStockIn,
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const categories = useMemo(() => getCategories(products), [products])
  const filteredProducts = useMemo(() => {
    const lowered = query.toLowerCase().trim()

    return products
      .filter((item) => {
        const stock = Number(item.stockQty) || 0
        const minimumStock = Number(item.minimumStock) || 0
        const matchesQuery = [item.name, item.category, item.supplier, item.sku]
          .join(' ')
          .toLowerCase()
          .includes(lowered)
        const matchesCategory = category === 'all' || item.category === category
        const matchesLowStock = !showLowStockOnly || stock <= minimumStock
        return matchesQuery && matchesCategory && matchesLowStock
      })
      .sort((a, b) => {
        if (!showLowStockOnly) return a.name.localeCompare(b.name)
        return (Number(a.stockQty) || 0) - (Number(b.stockQty) || 0)
      })
  }, [category, products, query, showLowStockOnly])
  const productSummary = useMemo(() => buildProductSummary(filteredProducts), [filteredProducts])

  return (
    <section className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search products</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-9 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products"
            value={query}
          />
        </label>
        <select
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200"
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <button
        className={`secondary-button h-9 w-full sm:w-fit ${
          showLowStockOnly ? 'bg-rose-50 text-rose-700 ring-rose-100' : ''
        }`}
        onClick={() => setShowLowStockOnly((current) => !current)}
        type="button"
      >
        Low Stock
      </button>

      {canViewCosts && <ProductsAdminHero summary={productSummary} />}

      {canAddProducts && (
        <button className="primary-button w-full sm:w-fit" onClick={onNew} type="button">
          Add product
        </button>
      )}

      {filteredProducts.length ? (
        <div className="space-y-1.5">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              canManageProducts={canManageProducts}
              canViewCosts={canViewCosts}
              product={product}
              onDelete={onDelete}
              onEdit={onEdit}
              onStockIn={onStockIn}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          action={canAddProducts ? onNew : undefined}
          actionText={canAddProducts ? 'Add product' : undefined}
          title="No products found"
          text="Create a product or adjust your search and category filter."
        />
      )}
    </section>
  )
}

function ProductsAdminHero({ summary }) {
  return (
    <div className="rounded-[18px] bg-white p-2.5 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Info label="Cost Value" value={formatRM(summary.totalCostValue)} />
        <Info label="Sale Value" value={formatRM(summary.totalSaleValue)} />
        <Info label="Profit" value={formatRM(summary.totalProfit)} />
        <Info label="Margin" value={formatPercent(summary.marginPercent)} />
      </div>
    </div>
  )
}

function ProductCard({
  canManageProducts,
  canViewCosts,
  product,
  onDelete,
  onEdit,
  onStockIn,
}) {
  const isLow = Number(product.stockQty) <= Number(product.minimumStock)
  const costPrice = Number(product.costPrice) || 0
  const sellingPrice = Number(product.sellingPrice) || 0
  const stock = Number(product.stockQty) || 0
  const profitPerUnit = sellingPrice - costPrice
  const profitMargin = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0
  const totalProfitIfSoldOut = profitPerUnit * stock

  return (
    <article className="flex items-start gap-2 rounded-[16px] bg-white px-2.5 py-2 shadow-sm shadow-zinc-200/60 ring-1 ring-zinc-200">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-[13px] font-semibold leading-tight">
            {product.name}
          </h2>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isLow ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            Stock {Number(product.stockQty) || 0}
          </span>
        </div>
        {canViewCosts ? (
          <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] font-medium text-zinc-600 sm:grid-cols-5">
            <span>Cost {formatRM(costPrice)}</span>
            <span>Sell {formatRM(sellingPrice)}</span>
            <span>Profit / unit {formatRM(profitPerUnit)}</span>
            <span>Margin {formatPercent(profitMargin)}</span>
            <span className="col-span-2 sm:col-span-1">
              Sold out {formatRM(totalProfitIfSoldOut)}
            </span>
          </div>
        ) : (
          <p className="mt-1 truncate text-[11px] font-medium text-zinc-500">
            {[product.category, `Sell ${formatRM(sellingPrice)}`].filter(Boolean).join(' / ')}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <button
          className="primary-button h-8 rounded-xl px-2"
          onClick={() => onStockIn(product)}
          type="button"
        >
          Stock In
        </button>
        {canManageProducts && (
          <>
            <button
              className="secondary-button h-8 rounded-xl px-2"
              onClick={() => onEdit(product)}
              type="button"
            >
              Edit
            </button>
            <button
              className="danger-button h-8 rounded-xl px-2"
              onClick={() => onDelete(product.id)}
              type="button"
            >
              Del
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function MovementsPage({ canViewProfit, products, stockChecks, onSave }) {
  const categories = useMemo(() => getCategories(products), [products])
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [checkFilter, setCheckFilter] = useState('all')
  const [counts, setCounts] = useState({})
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [isSaving, setIsSaving] = useState(false)
  const [pendingRows, setPendingRows] = useState(null)
  const visibleProducts = useMemo(() => {
    const lowered = query.toLowerCase().trim()

    return products.filter((product) => {
      const isChecked = counts[product.id] !== undefined
      const matchesCategory = category === 'all' || product.category === category
      const matchesQuery = [product.name, product.category, product.sku]
        .join(' ')
        .toLowerCase()
        .includes(lowered)
      const matchesStatus =
        checkFilter === 'all' ||
        (checkFilter === 'checked' && isChecked) ||
        (checkFilter === 'unchecked' && !isChecked)

      return matchesCategory && matchesQuery && matchesStatus
    })
  }, [category, checkFilter, counts, products, query])
  const progressProducts = useMemo(() => {
    const lowered = query.toLowerCase().trim()

    return products.filter((product) => {
      const matchesCategory = category === 'all' || product.category === category
      const matchesQuery = [product.name, product.category, product.sku]
        .join(' ')
        .toLowerCase()
        .includes(lowered)

      return matchesCategory && matchesQuery
    })
  }, [category, products, query])
  const progressCheckedCount = progressProducts.filter(
    (product) => counts[product.id] !== undefined,
  ).length
  const progressPercent = progressProducts.length
    ? Math.round((progressCheckedCount / progressProducts.length) * 100)
    : 0
  const filteredStockChecks = stockChecks.filter((item) => item.date === filterDate)
  const historyGroups = groupStockChecksByDate(filteredStockChecks)
  const dailyTotals = filteredStockChecks.reduce(
    (totals, item) => {
      totals.profit += Number(item.profit) || 0
      totals.sales += Number(item.salesValue) || 0
      totals.soldQty += Number(item.soldQty) || 0
      return totals
    },
    { profit: 0, sales: 0, soldQty: 0 },
  )
  const dailyUsers = getStockCheckUsers(filteredStockChecks)

  function updateCount(productId, value) {
    if (Number(value) < 0) return
    setCounts((current) => ({ ...current, [productId]: value }))
  }

  function focusNextInput(productId) {
    const currentIndex = products.findIndex((product) => product.id === productId)
    const nextProduct = products[currentIndex + 1]
    if (!nextProduct) return

    window.requestAnimationFrame(() => {
      document.querySelector(`[data-stock-input="${nextProduct.id}"]`)?.focus()
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const rows = progressProducts
      .filter((product) => counts[product.id] !== undefined)
      .map((product) => ({
      costPrice: product.costPrice,
      countedStock: Number(counts[product.id] ?? product.stockQty ?? 0),
      previousStock: Number(product.stockQty) || 0,
      productId: product.id,
      productName: product.name,
      sellingPrice: product.sellingPrice,
    }))
    setPendingRows(rows)
  }

  async function confirmSave() {
    setIsSaving(true)
    const didSave = await onSave(pendingRows || [])
    setIsSaving(false)
    if (didSave) {
      setCounts({})
      setPendingRows(null)
    }
  }

  return (
    <section className="space-y-5">
      <form className="premium-panel pb-[72px] sm:pb-3" onSubmit={handleSubmit}>
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Stock check</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Enter current quantity only. DuitStock calculates stock movement in the background.
            </p>
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            {products.length}
          </span>
        </div>

        <div className="mb-2.5 rounded-[16px] bg-white/76 p-2 shadow-sm ring-1 ring-white/80">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-zinc-600">Checked products</p>
            <p className="text-xs font-bold text-zinc-950">
              {progressCheckedCount} / {progressProducts.length} checked
            </p>
          </div>
          <p className="mt-1 text-[11px] font-bold text-zinc-600">
            {progressPercent}% complete
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-zinc-950 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mb-2.5 grid gap-1.5">
          <label className="relative">
            <span className="sr-only">Search stock check products</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              className="field-input pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              value={query}
            />
          </label>
          <select
            className="field-input"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <p className="px-1 text-[11px] font-semibold text-zinc-500">
            {category === 'all' ? 'All categories' : category} · {visibleProducts.length}{' '}
            products
          </p>
          <div className="grid grid-cols-3 gap-1">
            {[
              ['all', 'Show All'],
              ['checked', 'Checked Only'],
              ['unchecked', 'Unchecked Only'],
            ].map(([value, label]) => (
              <button
                className={`h-9 rounded-xl px-2 text-[11px] font-bold transition ${
                  checkFilter === value
                    ? 'bg-zinc-950 text-white shadow-sm'
                    : 'bg-white text-zinc-600 ring-1 ring-zinc-200'
                }`}
                key={value}
                onClick={() => setCheckFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visibleProducts.length ? (
          <div className="max-h-[72vh] divide-y divide-zinc-100 overflow-y-auto rounded-[16px] bg-white/70 pb-20 pr-0 sm:max-h-none sm:overflow-visible sm:pb-16">
            {visibleProducts.map((product) => (
              <StockCheckRow
                count={counts[product.id] ?? String(Number(product.stockQty) || 0)}
                key={product.id}
                onChange={updateCount}
                onEnter={focusNextInput}
                product={product}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No products to check"
            text="Add products with opening stock before running a stock check."
          />
        )}

        {visibleProducts.length > 0 && (
          <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-3 pointer-events-none">
            <div className="w-full max-w-sm rounded-full border border-white/70 bg-white/78 p-1 shadow-[0_12px_32px_rgba(24,24,27,0.18)] backdrop-blur-2xl pointer-events-auto">
              <button
                className="primary-button h-11 w-full rounded-full text-xs shadow-none"
                disabled={isSaving}
                type="submit"
              >
                <SaveIcon className="mr-2 h-5 w-5" />
                {isSaving ? 'Saving...' : 'Save Stock Check'}
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Stock check history</h2>
            {canViewProfit && (
              <p className="mt-0.5 text-xs text-zinc-500">
                Daily profit: {formatRM(dailyTotals.profit)}
              </p>
            )}
          </div>
          <input
            className="field-input sm:w-48"
            onChange={(event) => setFilterDate(event.target.value)}
            type="date"
            value={filterDate}
          />
        </div>
        <div className={`mt-2 grid gap-1.5 ${canViewProfit ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {canViewProfit ? (
            <>
              <Info label="Sold" value={dailyTotals.soldQty} />
              <Info label="Sales" value={formatRM(dailyTotals.sales)} />
              <Info label="Profit" value={formatRM(dailyTotals.profit)} />
            </>
          ) : (
            <>
              <Info label="Products checked" value={filteredStockChecks.length} />
              <Info label="User" value={dailyUsers} />
            </>
          )}
        </div>
        {historyGroups.length ? (
          <div className="mt-3 space-y-3">
            {historyGroups.map((group) => (
              <StockCheckHistoryDay
                canViewProfit={canViewProfit}
                group={group}
                key={group.date}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No stock checks yet"
            text="Saved stock check records for the selected date will appear here."
          />
        )}
      </div>
      {pendingRows && (
        <ConfirmStockCheckModal
          canViewProfit={canViewProfit}
          isSaving={isSaving}
          onCancel={() => setPendingRows(null)}
          onConfirm={confirmSave}
          rows={pendingRows}
        />
      )}
    </section>
  )
}

function StockCheckRow({ count, onChange, onEnter, product }) {
  return (
    <article className="flex items-center justify-between gap-2 bg-white/0 px-2.5 py-1.5 transition hover:bg-white/70">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight">{product.name}</p>
        <p className="text-[11px] font-semibold text-zinc-700">
          Current Stock: {Number(product.stockQty) || 0}
        </p>
      </div>
      <label className="shrink-0">
        <span className="sr-only">Current quantity for {product.name}</span>
        <input
          className="h-11 w-24 rounded-[15px] border border-zinc-300 bg-white px-2 text-center text-xl font-bold text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-300"
          data-stock-input={product.id}
          inputMode="numeric"
          min="0"
          onChange={(event) => onChange(product.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onEnter(product.id)
          }}
          pattern="[0-9]*"
          placeholder="Qty"
          type="number"
          value={count}
        />
      </label>
    </article>
  )
}

function StockCheckHistoryDay({ canViewProfit, group }) {
  const users = getStockCheckUsers(group.items)

  return (
    <section className="rounded-[16px] bg-zinc-50 p-2.5 ring-1 ring-zinc-100">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-950">{formatDate(group.date)}</h3>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
            {canViewProfit
              ? `Sold ${group.totals.soldQty} / Sales ${formatRM(group.totals.sales)} / Profit ${formatRM(group.totals.profit)}`
              : `${group.items.length} products checked / ${users}`}
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-600 ring-1 ring-zinc-200">
          {group.items.length} checked
        </span>
      </div>

      <div className="mt-2 divide-y divide-zinc-200/70">
        {group.items.map((item) => (
          <div
            className={`grid ${
              canViewProfit ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'
            } items-center gap-2 py-1.5 text-[12px]`}
            key={item.id}
          >
            <p className="truncate font-semibold text-zinc-900">{item.productName}</p>
            <p className="shrink-0 font-medium text-zinc-500">
              {item.previousStock} {'->'} {item.countedStock}
            </p>
            {canViewProfit && (
              <p className="shrink-0 text-right font-bold text-zinc-800">
                {item.soldQty || 0} sold
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function ReportsPage({ products, stockChecks }) {
  const today = new Date().toISOString().slice(0, 10)
  const [deadStockDays, setDeadStockDays] = useState(30)
  const [dateRange, setDateRange] = useState({
    end: today,
    start: getDateOffset(today, -6),
  })
  const report = useMemo(
    () => buildReport(stockChecks, dateRange.start, dateRange.end),
    [dateRange.end, dateRange.start, stockChecks],
  )
  const deadStockItems = useMemo(
    () => buildDeadStockReport(products, stockChecks, deadStockDays),
    [deadStockDays, products, stockChecks],
  )

  return (
    <section className="space-y-4">
      <div className="premium-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Reports</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Sales and profit from saved stock checks.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-[22rem]">
            <Field label="From">
              <input
                className="field-input"
                onChange={(event) =>
                  setDateRange((current) => ({
                    ...current,
                    start: event.target.value,
                  }))
                }
                type="date"
                value={dateRange.start}
              />
            </Field>
            <Field label="To">
              <input
                className="field-input"
                onChange={(event) =>
                  setDateRange((current) => ({
                    ...current,
                    end: event.target.value,
                  }))
                }
                type="date"
                value={dateRange.end}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        <MetricCard
          icon={TagIcon}
          label="Today Sales"
          tone="indigo"
          value={formatRM(report.today.sales)}
        />
        <MetricCard
          icon={ProfitIcon}
          label="Today Profit"
          tone="emerald"
          value={formatRM(report.today.profit)}
        />
        <MetricCard
          icon={ArrowsIcon}
          label="Today Sold Qty"
          tone="sky"
          value={report.today.soldQty}
        />
        <MetricCard
          icon={TagIcon}
          label="This Week Sales"
          tone="indigo"
          value={formatRM(report.week.sales)}
        />
        <MetricCard
          icon={ProfitIcon}
          label="This Week Profit"
          tone="emerald"
          value={formatRM(report.week.profit)}
        />
        <MetricCard
          icon={TagIcon}
          label="This Month Sales"
          tone="indigo"
          value={formatRM(report.month.sales)}
        />
        <MetricCard
          icon={ProfitIcon}
          label="This Month Profit"
          tone="emerald"
          value={formatRM(report.month.profit)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <RankingPanel
          emptyText="Sold products in the selected date range will appear here."
          items={report.topSelling}
          metricLabel="sold"
          title="Top selling products"
        />
        <RankingPanel
          emptyText="Profitable products in the selected date range will appear here."
          items={report.topProfitable}
          metricLabel="profit"
          title="Most profitable products"
        />
      </div>

      <DeadStockPanel
        days={deadStockDays}
        items={deadStockItems}
        onDaysChange={setDeadStockDays}
      />
    </section>
  )
}

function DeadStockPanel({ days, items, onDaysChange }) {
  return (
    <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Dead Stock Alert</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Products with stock but no sale movement for the selected period.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1">
          {[30, 60, 90].map((option) => (
            <button
              className={`h-8 rounded-lg px-2 text-xs font-bold ${
                days === option ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600'
              }`}
              key={option}
              onClick={() => onDaysChange(option)}
              type="button"
            >
              {option} days
            </button>
          ))}
        </div>
      </div>

      {items.length ? (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <article
              className="rounded-[16px] bg-zinc-50 p-2.5 ring-1 ring-zinc-100"
              key={item.productId}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-950">{item.productName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                    {item.category || 'Uncategorised'} / Stock: {item.currentStock}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-bold text-zinc-950">
                  {formatRM(item.potentialValueLocked)}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Info label="Sale value" value={formatRM(item.saleValue)} />
                <Info label="Last sold" value={item.lastSoldLabel} />
                <Info label="No sale" value={item.daysWithoutSaleLabel} />
                <Info label="Value locked" value={formatRM(item.potentialValueLocked)} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No dead stock found"
          text="Products with recent sale movement will stay out of this alert."
        />
      )}
    </div>
  )
}

function RankingPanel({ emptyText, items, metricLabel, title }) {
  return (
    <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
      <h2 className="text-base font-semibold">{title}</h2>
      {items.length ? (
        <div className="mt-2.5 space-y-1.5">
          {items.map((item, index) => (
            <div
              className="flex items-center justify-between gap-2.5 rounded-[18px] bg-zinc-50 p-2"
              key={item.productId}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-xs font-bold text-white">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.productName}</p>
                  <p className="text-xs text-zinc-500">
                    {item.soldQty} sold / {formatRM(item.salesValue)} sales
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-right text-sm font-bold text-zinc-900">
                {metricLabel === 'profit' ? formatRM(item.profit) : item.soldQty}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No report data" text={emptyText} />
      )}
    </div>
  )
}

function ConfirmStockCheckModal({
  canViewProfit,
  isSaving,
  onCancel,
  onConfirm,
  rows,
}) {
  const totals = rows.reduce(
    (current, row) => {
      const previousStock = Number(row.previousStock) || 0
      const countedStock = Number(row.countedStock) || 0
      const soldQty = Math.max(0, previousStock - countedStock)
      const salesValue = soldQty * (Number(row.sellingPrice) || 0)
      const costValue = soldQty * (Number(row.costPrice) || 0)

      current.adjusted += Math.max(0, countedStock - previousStock)
      current.profit += soldQty > 0 ? salesValue - costValue : 0
      current.sales += salesValue
      current.soldQty += soldQty
      return current
    },
    { adjusted: 0, profit: 0, sales: 0, soldQty: 0 },
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-[24px] bg-white p-4 shadow-xl shadow-zinc-950/15 sm:max-w-md">
        <h2 className="text-xl font-semibold tracking-tight">Save stock check?</h2>
        <p className="mt-1 text-xs text-zinc-500">
          This will update product stock and save today&apos;s stock-check history.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Info label="Products" value={rows.length} />
          <Info label="Sold qty" value={totals.soldQty} />
          <Info label="Sales" value={formatRM(totals.sales)} />
          {canViewProfit && <Info label="Profit" value={formatRM(totals.profit)} />}
        </div>
        {totals.adjusted > 0 && (
          <p className="mt-3 rounded-2xl bg-sky-50 p-2.5 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
            {totals.adjusted} units will be treated as stock adjustment/restock.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            className="secondary-button flex-1"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="primary-button flex-1"
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            <SaveIcon className="mr-2 h-5 w-5" />
            {isSaving ? 'Saving...' : 'Confirm Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StockInHistoryPage({
  canDeleteRows,
  canViewCosts,
  products,
  stockInRecords,
  onSave,
}) {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const filteredRecords = stockInRecords.filter(
    (record) => getRecordDateValue(record) === filterDate,
  )
  const totalAdded = filteredRecords.reduce(
    (total, record) => total + (Number(record.quantityAdded) || 0),
    0,
  )

  return (
    <section className="space-y-2.5">
      <StockInEntryBox
        canDeleteRows={canDeleteRows}
        date={filterDate}
        products={products}
        onSave={onSave}
      />

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Stock in history</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {totalAdded} units added on {formatDate(filterDate)}
            </p>
          </div>
          <input
            className="field-input sm:w-48"
            onChange={(event) => setFilterDate(event.target.value)}
            type="date"
            value={filterDate}
          />
        </div>
      </div>

      {filteredRecords.length ? (
        <div className="overflow-hidden rounded-[18px] bg-white shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
          <div className="grid grid-cols-[74px_1fr_58px] gap-2 bg-zinc-50 px-2.5 py-2 text-[10px] font-bold uppercase text-zinc-500">
            <span>Date</span>
            <span>Product</span>
            <span className="text-right">Qty</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {filteredRecords.map((record) => (
              <article className="px-2.5 py-2" key={record.id}>
                <div className="grid grid-cols-[74px_1fr_58px] items-center gap-2 text-xs">
                  <p className="font-semibold text-zinc-500">
                    {formatShortDate(record)}
                  </p>
                  <p className="min-w-0 truncate font-semibold text-zinc-950">
                    {record.productName}
                  </p>
                  <p className="text-right text-sm font-bold text-emerald-700">
                    +{Number(record.quantityAdded) || 0}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-500">
                  {canViewCosts && (
                    <span>
                      {formatRM(record.purchaseCost ?? record.price)} / {formatRM(record.amount)}
                    </span>
                  )}
                  {(record.supplierNotes || record.notes) && (
                    <span className="min-w-0 truncate text-right">
                      {record.supplierNotes || record.notes}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No stock in yet"
          text="Saved stock additions for the selected date will appear here."
        />
      )}
    </section>
  )
}

function StockInEntryBox({ canDeleteRows, date, products, onSave }) {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [showAdditionalCosts, setShowAdditionalCosts] = useState(false)
  const [additionalCosts, setAdditionalCosts] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const searchTerm = search.trim().toLowerCase()
  const suggestions = searchTerm
    ? products
        .filter((product) =>
          [product.name, product.category, product.sku]
            .join(' ')
            .toLowerCase()
            .includes(searchTerm),
        )
        .slice(0, 6)
    : []
  const rowTotal = rows.reduce(
    (total, row) => total + (Number(row.quantityAdded) || 0) * (Number(row.purchaseCost) || 0),
    0,
  )
  const totalAmount = rowTotal + (Number(additionalCosts) || 0)
  const tableGridClass = canDeleteRows
    ? 'grid-cols-[minmax(92px,2.3fr)_46px_48px_54px_58px_26px] sm:grid-cols-[minmax(180px,2.4fr)_76px_76px_92px_96px_38px]'
    : 'grid-cols-[minmax(104px,2.3fr)_48px_52px_58px_62px] sm:grid-cols-[minmax(190px,2.4fr)_82px_82px_100px_104px]'

  function getAutofillCost(product) {
    return String(Number(product.costPrice) || Number(product.sellingPrice) || 0)
  }

  function addRow(product) {
    setRows((current) => [
      ...current,
      {
        category: product.category,
        productId: product.id,
        productName: product.name,
        purchaseCost: getAutofillCost(product),
        quantityAdded: '',
        rowId: createId(),
        sku: product.sku,
        stockQty: Number(product.stockQty) || 0,
      },
    ])
    setSearch('')
  }

  function updateRow(rowId, field, value) {
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)),
    )
  }

  function removeRow(rowId) {
    if (!canDeleteRows) return
    setRows((current) => current.filter((row) => row.rowId !== rowId))
  }

  function handleAutofillCost() {
    setRows((current) =>
      current.map((row) => {
        const product = products.find((item) => item.id === row.productId)
        return product ? { ...row, purchaseCost: getAutofillCost(product) } : row
      }),
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!rows.length) return

    setIsSaving(true)
    const didSave = await onSave({
      date,
      items: rows.map((row) => {
        const quantityAdded = Number(row.quantityAdded) || 0
        const purchaseCost = Number(row.purchaseCost) || 0

        return {
          amount: quantityAdded * purchaseCost,
          productId: row.productId,
          purchaseCost,
          quantityAdded,
          supplierNotes,
        }
      }),
    })
    setIsSaving(false)

    if (didSave) {
      setRows([])
      setSearch('')
      setSupplierNotes('')
      setAdditionalCosts('')
      setShowAdditionalCosts(false)
    }
  }

  return (
    <form
      className="rounded-[18px] bg-white p-1.5 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200 sm:p-2.5"
      onSubmit={handleSubmit}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Items</h2>
        <button
          className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold uppercase text-zinc-700 shadow-sm outline-none transition hover:bg-zinc-50 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200"
          onClick={handleAutofillCost}
          type="button"
        >
          Autofill cost
        </button>
      </div>

      <div className="overflow-visible rounded-[14px] ring-1 ring-zinc-200">
        <div>
          <div className={`grid ${tableGridClass} gap-0.5 bg-zinc-50 px-1 py-1 text-[8px] font-bold uppercase leading-tight text-zinc-500 sm:gap-1 sm:px-2 sm:py-1.5 sm:text-[10px]`}>
            <span>Item</span>
            <span>In Stock</span>
            <span>Qty</span>
            <span>Cost</span>
            <span>Amount</span>
            {canDeleteRows && <span></span>}
          </div>

          <div className="divide-y divide-zinc-100 bg-white">
            {rows.map((row) => {
              const amount = (Number(row.quantityAdded) || 0) * (Number(row.purchaseCost) || 0)

              return (
                <div
                  className={`grid ${tableGridClass} items-center gap-0.5 px-1 py-1.5 text-[10px] sm:gap-1 sm:px-2 sm:py-1.5 sm:text-xs`}
                  key={row.rowId}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-950">{row.productName}</p>
                    <p className="truncate text-[7px] font-medium text-zinc-500 sm:text-[10px]">
                      {[row.sku, row.category].filter(Boolean).join(' / ') || '-'}
                    </p>
                  </div>
                  <p className="font-semibold text-zinc-600">{row.stockQty}</p>
                  <input
                    className="h-8 rounded-lg border border-zinc-200 bg-white px-1.5 text-[11px] font-bold outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 sm:px-2 sm:text-xs"
                    min="1"
                    onChange={(event) =>
                      updateRow(row.rowId, 'quantityAdded', event.target.value)
                    }
                    required
                    type="number"
                    value={row.quantityAdded}
                  />
                  <input
                    className="h-8 rounded-lg border border-zinc-200 bg-white px-1.5 text-[11px] font-semibold outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 sm:px-2 sm:text-xs"
                    min="0"
                    onChange={(event) =>
                      updateRow(row.rowId, 'purchaseCost', event.target.value)
                    }
                    step="0.01"
                    type="number"
                    value={row.purchaseCost}
                  />
                  <p className="truncate text-right text-[10px] font-bold text-zinc-900 sm:text-xs">
                    {formatCompactRM(amount)}
                  </p>
                  {canDeleteRows && (
                    <button
                      aria-label={`Delete ${row.productName}`}
                      className="grid h-8 w-6 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100 sm:w-8"
                      onClick={() => removeRow(row.rowId)}
                      type="button"
                    >
                      <TrashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  )}
                </div>
              )
            })}

            <div className={`relative grid ${tableGridClass} items-center gap-0.5 px-1 py-1.5 text-[10px] sm:gap-1 sm:px-2 sm:py-1.5 sm:text-xs`}>
              <div className="relative">
                <input
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-1.5 text-[11px] outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 sm:px-2 sm:text-xs"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item"
                  value={search}
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[min(280px,calc(100vw-28px))] overflow-hidden rounded-xl bg-white shadow-xl shadow-zinc-950/10 ring-1 ring-zinc-200">
                    {suggestions.map((product) => (
                      <button
                        className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        key={product.id}
                        onClick={() => addRow(product)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{product.name}</span>
                          <span className="block truncate text-[10px] font-medium text-zinc-500">
                            {[product.sku, product.category].filter(Boolean).join(' / ') || '-'}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500">
                          {Number(product.stockQty) || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold text-zinc-400">-</span>
              <span className="text-[11px] font-semibold text-zinc-400">-</span>
              <span className="text-[11px] font-semibold text-zinc-400">-</span>
              <span className="text-right text-[10px] font-semibold text-zinc-400 sm:text-[11px]">
                {formatCompactRM(0)}
              </span>
              {canDeleteRows && <span></span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Field label="Supplier / Notes">
            <input
              className="field-input h-9"
              onChange={(event) => setSupplierNotes(event.target.value)}
              placeholder="Supplier / notes"
              value={supplierNotes}
            />
          </Field>
          {showAdditionalCosts && (
            <Field label="Additional costs">
              <input
                className="field-input h-9"
                min="0"
                onChange={(event) => setAdditionalCosts(event.target.value)}
                placeholder="0"
                step="0.01"
                type="number"
                value={additionalCosts}
              />
            </Field>
          )}
          <button
            className="text-left text-xs font-bold text-zinc-700 underline underline-offset-4"
            onClick={() => setShowAdditionalCosts((current) => !current)}
            type="button"
          >
            Add additional costs
          </button>
        </div>
        <div className="rounded-[14px] bg-zinc-50 p-2 text-right ring-1 ring-zinc-100">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Total amount</p>
          <p className="text-lg font-bold text-zinc-950">{formatRM(totalAmount)}</p>
        </div>
      </div>

      <button
        className="primary-button mt-2 h-11 w-full"
        disabled={isSaving || !rows.length}
        type="submit"
      >
        <SaveIcon className="mr-2 h-5 w-5" />
        {isSaving ? 'Saving...' : 'Save Stock In'}
      </button>
    </form>
  )
}

function SettingsPage({
  isCloudEnabled,
  onClearAll,
  onLoadSample,
  products,
  stockChecks,
  stockInRecords,
}) {
  return (
    <section className="space-y-2.5">
      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <h2 className="text-base font-semibold">Storage</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {isCloudEnabled
            ? 'DuitStock is syncing products, stock checks, and stock-in history with Firestore.'
            : 'DuitStock is saving data to this browser with localStorage.'}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Info label="Products" value={products.length} />
          <Info label="Stock checks" value={stockChecks.length} />
          <Info label="Stock in" value={stockInRecords.length} />
        </dl>
      </div>

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <h2 className="text-base font-semibold">Data actions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button className="secondary-button" onClick={onLoadSample} type="button">
            Load sample products
          </button>
          <button className="danger-button" onClick={onClearAll} type="button">
            Clear all data
          </button>
        </div>
      </div>
    </section>
  )
}

function StockInModal({ product, onClose, onSave }) {
  const [quantityAdded, setQuantityAdded] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    const didSave = await onSave({
      productId: product.id,
      quantityAdded,
      notes,
    })
    setIsSaving(false)
    if (didSave) {
      setQuantityAdded('')
      setNotes('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <form
        className="w-full rounded-[26px] bg-white p-4 shadow-2xl shadow-zinc-950/20 sm:max-w-md"
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-500">Stock In</p>
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {product.name}
            </h2>
          </div>
          <button
            aria-label="Close stock in form"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3">
          <Field label="Product Name">
            <input className="field-input bg-zinc-50 font-semibold" readOnly value={product.name} />
          </Field>
          <Field label="Quantity to Add">
            <input
              className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-lg font-bold text-zinc-950 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200"
              inputMode="numeric"
              min="1"
              onChange={(event) => setQuantityAdded(event.target.value)}
              pattern="[0-9]*"
              placeholder="0"
              required
              type="number"
              value={quantityAdded}
            />
          </Field>
          <Field label="Notes optional">
            <textarea
              className="min-h-20 w-full resize-none rounded-xl border border-white/70 bg-white/78 px-3 py-2 text-xs text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-4 focus:ring-zinc-200"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Supplier invoice, batch, or remarks"
              value={notes}
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="secondary-button h-11 flex-1"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button className="primary-button h-11 flex-1" disabled={isSaving} type="submit">
            <SaveIcon className="mr-2 h-5 w-5" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ProductModal({ categories, product, onClose, onSave }) {
  const [form, setForm] = useState(product)
  const [isAddingCategory, setIsAddingCategory] = useState(false)

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleCategoryChange(value) {
    if (value === '__new__') {
      setIsAddingCategory(true)
      updateField('category', '')
      return
    }

    setIsAddingCategory(false)
    updateField('category', value)
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <form
        className="max-h-[92vh] w-full overflow-y-auto rounded-[26px] bg-white p-4 shadow-2xl shadow-zinc-950/20 sm:max-w-md"
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500">Product</p>
            <h2 className="text-xl font-semibold tracking-tight">
              {product.id ? 'Edit product' : 'Add product'}
            </h2>
          </div>
          <button
            aria-label="Close product form"
            className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-600"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3">
          <Field label="Product Name">
            <input
              className="field-input"
              onChange={(event) => updateField('name', event.target.value)}
              required
              value={form.name}
            />
          </Field>
          <Field label="Category">
            <select
              className="field-input"
              onChange={(event) => handleCategoryChange(event.target.value)}
              required
              value={isAddingCategory ? '__new__' : form.category}
            >
              <option value="" disabled>
                Select category
              </option>
              <option value="__new__">+ Add New Category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          {isAddingCategory && (
            <Field label="New Category Name">
              <input
                className="field-input"
                onChange={(event) => updateField('category', event.target.value)}
                placeholder="New Category Name"
                required
                value={form.category}
              />
            </Field>
          )}
          <Field label="Cost Price">
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('costPrice', event.target.value)}
              step="0.01"
              type="number"
              value={form.costPrice}
            />
          </Field>
          <Field label="Selling Price">
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('sellingPrice', event.target.value)}
              step="0.01"
              type="number"
              value={form.sellingPrice}
            />
          </Field>
          <Field label="Stock Qty">
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('stockQty', event.target.value)}
              type="number"
              value={form.stockQty}
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="secondary-button h-11 flex-1" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button h-11 flex-1" type="submit">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
function BottomNav({ activePage, items, onChange }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[calc(env(safe-area-inset-bottom)+0.4rem)]">
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-0.5 rounded-[20px] border border-white/70 bg-white/78 p-1 shadow-[0_12px_34px_rgba(24,24,27,0.16)] backdrop-blur-2xl">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.id

          return (
            <button
              className={`relative flex h-10 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[9px] font-bold transition-all duration-300 ${
                isActive
                  ? 'scale-[1.02] bg-zinc-950 text-white shadow-lg shadow-zinc-950/20'
                  : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-900'
              }`}
              key={item.id}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <Icon className="h-3.5 w-3.5 transition-transform duration-300" />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MetricCard({ icon: Icon, label, tone = 'zinc', value }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  }

  return (
    <article className="glass-card group min-h-[74px] p-2 sm:p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold leading-tight text-zinc-500">{label}</p>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 ${tones[tone]}`}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <p className="mt-1.5 break-words text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
        {value}
      </p>
    </article>
  )
}

function ProductThumbnail({ name }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-zinc-950 text-xs font-bold text-white shadow-sm">
      {initials || 'DS'}
    </div>
  )
}

function Field({ children, label }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{value}</dd>
    </div>
  )
}

function EmptyState({ action, actionText, text, title }) {
  return (
    <div className="mt-3 rounded-[22px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-7 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200">
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

function LoadingState() {
  return (
    <div className="premium-panel flex min-h-72 flex-col items-center justify-center text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-950" />
      <h2 className="mt-5 text-xl font-semibold">Loading DuitStock</h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        Connecting to your inventory source and preparing the latest data.
      </p>
    </div>
  )
}

function SyncErrorBanner({ message }) {
  return (
    <div className="mb-4 rounded-[24px] border border-rose-100 bg-rose-50/80 p-4 text-sm font-medium text-rose-700 shadow-sm">
      {message}
    </div>
  )
}

function SyncStatusPill({ status, text }) {
  const styles = {
    error: 'bg-rose-50 text-rose-700 ring-rose-100',
    local: 'bg-amber-50 text-amber-700 ring-amber-100',
    synced: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    syncing: 'bg-sky-50 text-sky-700 ring-sky-100',
  }

  return (
    <div
      className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold shadow-sm ring-1 backdrop-blur-xl sm:px-4 sm:text-sm ${styles[status]}`}
    >
      {text}
    </div>
  )
}

function Toast({ onClose, toast }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 2800)
    return () => window.clearTimeout(timeoutId)
  }, [onClose, toast.id])

  const isError = toast.type === 'error'

  return (
    <div className="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-md">
      <div
        className={`flex items-center gap-3 rounded-[24px] px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ring-1 ${
          isError
            ? 'bg-rose-50/95 text-rose-700 shadow-rose-950/10 ring-rose-100'
            : 'bg-zinc-950/92 text-white shadow-zinc-950/20 ring-white/10'
        }`}
      >
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            isError ? 'bg-rose-100 text-rose-700' : 'animate-bounce bg-white text-zinc-950'
          }`}
        >
          {isError ? <AlertIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
        </span>
        <span>{toast.message}</span>
      </div>
    </div>
  )
}

function useDuitStockSync() {
  const hasCloudConfig = isFirebaseConfigured && db
  const [products, setProducts] = useState(() =>
    hasCloudConfig ? [] : readStorage(PRODUCTS_KEY, []),
  )
  const [stockChecks, setStockChecks] = useState(() =>
    hasCloudConfig ? [] : readStorage(STOCK_CHECKS_KEY, []),
  )
  const [stockInRecords, setStockInRecords] = useState(() =>
    hasCloudConfig ? [] : readStorage(STOCK_IN_RECORDS_KEY, []),
  )
  const [syncErrors, setSyncErrors] = useState({
    products: '',
    stockChecks: '',
    stockInRecords: '',
  })
  const [loaded, setLoaded] = useState({
    products: !hasCloudConfig,
    stockChecks: !hasCloudConfig,
    stockInRecords: !hasCloudConfig,
  })
  const error = syncErrors.products || syncErrors.stockChecks || syncErrors.stockInRecords
  const isCloudEnabled = Boolean(hasCloudConfig)
  const isLoading = !loaded.products || !loaded.stockChecks
  const syncStatus = !hasCloudConfig
    ? 'local'
    : error
      ? 'error'
      : isLoading
        ? 'syncing'
        : 'synced'

  useEffect(() => {
    if (isCloudEnabled) return
    writeStorage(PRODUCTS_KEY, products)
  }, [isCloudEnabled, products])

  useEffect(() => {
    if (isCloudEnabled) return
    writeStorage(STOCK_CHECKS_KEY, stockChecks)
  }, [isCloudEnabled, stockChecks])

  useEffect(() => {
    if (isCloudEnabled) return
    writeStorage(STOCK_IN_RECORDS_KEY, stockInRecords)
  }, [isCloudEnabled, stockInRecords])

  useEffect(() => {
    if (!hasCloudConfig) return undefined

    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const nextProducts = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))

        setProducts(nextProducts)
        writeStorage(PRODUCTS_KEY, nextProducts)
        setLoaded((current) => ({ ...current, products: true }))
        setSyncErrors((current) => ({ ...current, products: '' }))
      },
      () => {
        setProducts(readStorage(PRODUCTS_KEY, []))
        setLoaded((current) => ({ ...current, products: true }))
        setSyncErrors((current) => ({
          ...current,
          products: 'Firestore products sync failed. Showing local fallback data.',
        }))
      },
    )

    const unsubscribeStockChecks = onSnapshot(
      collection(db, 'stockChecks'),
      (snapshot) => {
        const nextStockChecks = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }))
          .sort((a, b) => sortMovementDate(b) - sortMovementDate(a))

        setStockChecks(nextStockChecks)
        writeStorage(STOCK_CHECKS_KEY, nextStockChecks)
        setLoaded((current) => ({ ...current, stockChecks: true }))
        setSyncErrors((current) => ({ ...current, stockChecks: '' }))
      },
      () => {
        setStockChecks(readStorage(STOCK_CHECKS_KEY, []))
        setLoaded((current) => ({ ...current, stockChecks: true }))
        setSyncErrors((current) => ({
          ...current,
          stockChecks: 'Firestore stock checks sync failed. Showing local fallback data.',
        }))
      },
    )

    const unsubscribeStockInRecords = onSnapshot(
      collection(db, 'stockInRecords'),
      (snapshot) => {
        const nextStockInRecords = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }))
          .sort((a, b) => sortMovementDate(b) - sortMovementDate(a))

        setStockInRecords(nextStockInRecords)
        writeStorage(STOCK_IN_RECORDS_KEY, nextStockInRecords)
        setLoaded((current) => ({ ...current, stockInRecords: true }))
        setSyncErrors((current) => ({ ...current, stockInRecords: '' }))
      },
      () => {
        setStockInRecords(readStorage(STOCK_IN_RECORDS_KEY, []))
        setLoaded((current) => ({ ...current, stockInRecords: true }))
        setSyncErrors((current) => ({
          ...current,
          stockInRecords: 'Firestore stock in sync failed. Showing local fallback data.',
        }))
      },
    )

    return () => {
      unsubscribeProducts()
      unsubscribeStockChecks()
      unsubscribeStockInRecords()
    }
  }, [hasCloudConfig])

  return {
    error,
    isCloudEnabled,
    isLoading,
    products,
    setProducts,
    setStockChecks,
    setStockInRecords,
    stockChecks,
    stockInRecords,
    syncStatus,
    syncStatusText: getSyncStatusText(syncStatus),
  }
}

function readStorage(key, fallbackValue) {
  try {
    const saved = window.localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallbackValue
  } catch {
    return fallbackValue
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage can be unavailable in private browsing or locked-down contexts.
  }
}

function getSyncStatusText(status) {
  if (status === 'syncing') return 'Syncing...'
  if (status === 'synced') return 'Synced'
  if (status === 'error') return 'Error'
  return 'Offline Local'
}

function sortMovementDate(movement) {
  if (movement.createdAt?.toMillis) return movement.createdAt.toMillis()
  return new Date(movement.date || 0).getTime()
}

function getRecordDateValue(record) {
  if (record.date) return record.date
  if (record.createdAt?.toDate) return record.createdAt.toDate().toISOString().slice(0, 10)
  if (record.createdAt) return new Date(record.createdAt).toISOString().slice(0, 10)
  return ''
}

function formatShortDate(record) {
  const date = getRecordDateValue(record)
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(date))
}

function groupStockChecksByDate(stockChecks) {
  const groups = new Map()

  stockChecks.forEach((item) => {
    const group = groups.get(item.date) || {
      date: item.date,
      items: [],
      totals: {
        profit: 0,
        sales: 0,
        soldQty: 0,
      },
    }

    group.items.push(item)
    group.totals.profit += Number(item.profit) || 0
    group.totals.sales += Number(item.salesValue) || 0
    group.totals.soldQty += Number(item.soldQty) || 0
    groups.set(item.date, group)
  })

  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function getStockCheckUsers(stockChecks) {
  const users = [
    ...new Set(stockChecks.map((item) => item.checkedBy || item.userRole).filter(Boolean)),
  ]

  if (!users.length) return 'Unknown'
  return users.map((user) => user.charAt(0).toUpperCase() + user.slice(1)).join(', ')
}

function buildReport(stockChecks, startDate, endDate) {
  const today = new Date().toISOString().slice(0, 10)
  const weekStart = getDateOffset(today, -6)
  const monthStart = today.slice(0, 8) + '01'
  const inRangeChecks = stockChecks.filter((item) =>
    isDateBetween(item.date, startDate, endDate),
  )

  return {
    month: sumChecks(
      stockChecks.filter((item) => isDateBetween(item.date, monthStart, today)),
    ),
    range: sumChecks(inRangeChecks),
    today: sumChecks(stockChecks.filter((item) => item.date === today)),
    topProfitable: rankProducts(inRangeChecks, 'profit'),
    topSelling: rankProducts(inRangeChecks, 'soldQty'),
    week: sumChecks(
      stockChecks.filter((item) => isDateBetween(item.date, weekStart, today)),
    ),
  }
}

function buildDeadStockReport(products, stockChecks, deadStockDays) {
  const today = new Date()
  const lastSoldByProduct = new Map()

  stockChecks.forEach((item) => {
    const soldQty =
      Number(item.soldQty) ||
      Math.max(0, (Number(item.previousStock) || 0) - (Number(item.countedStock) || 0))
    if (soldQty <= 0 || !item.productId) return

    const soldAt = getRecordDateValue(item)
    if (!soldAt) return

    const current = lastSoldByProduct.get(item.productId)
    if (!current || soldAt > current) {
      lastSoldByProduct.set(item.productId, soldAt)
    }
  })

  return products
    .map((product) => {
      const currentStock = Number(product.stockQty) || 0
      const sellingPrice = Number(product.sellingPrice) || 0
      const lastSoldDate = lastSoldByProduct.get(product.id)
      const daysWithoutSale = lastSoldDate
        ? Math.max(0, Math.floor((today - new Date(`${lastSoldDate}T00:00:00`)) / 86400000))
        : deadStockDays
      const potentialValueLocked = currentStock * sellingPrice

      return {
        category: product.category,
        currentStock,
        daysWithoutSale,
        daysWithoutSaleLabel: lastSoldDate ? `${daysWithoutSale} days` : `${deadStockDays}+ days`,
        lastSoldDate,
        lastSoldLabel: lastSoldDate ? formatDate(lastSoldDate) : 'Never',
        potentialValueLocked,
        productId: product.id,
        productName: product.name,
        saleValue: sellingPrice,
      }
    })
    .filter((item) => item.currentStock > 0)
    .filter((item) => !item.lastSoldDate || item.daysWithoutSale >= deadStockDays)
    .sort((a, b) => b.potentialValueLocked - a.potentialValueLocked)
}

function sumChecks(stockChecks) {
  return stockChecks.reduce(
    (totals, item) => {
      totals.profit += Number(item.profit) || 0
      totals.sales += Number(item.salesValue) || 0
      totals.soldQty += Number(item.soldQty) || 0
      return totals
    },
    { profit: 0, sales: 0, soldQty: 0 },
  )
}

function rankProducts(stockChecks, metric) {
  const byProduct = new Map()

  stockChecks.forEach((item) => {
    const current = byProduct.get(item.productId) || {
      productId: item.productId,
      productName: item.productName,
      profit: 0,
      salesValue: 0,
      soldQty: 0,
    }

    current.profit += Number(item.profit) || 0
    current.salesValue += Number(item.salesValue) || 0
    current.soldQty += Number(item.soldQty) || 0
    byProduct.set(item.productId, current)
  })

  return [...byProduct.values()]
    .filter((item) => Number(item[metric]) > 0)
    .sort((a, b) => Number(b[metric]) - Number(a[metric]))
    .slice(0, 5)
}

function isDateBetween(date, startDate, endDate) {
  if (!date) return false
  return date >= startDate && date <= endDate
}

function buildProductSummary(products) {
  const summary = products.reduce(
    (summary, product) => {
      const cost = Number(product.costPrice) || 0
      const selling = Number(product.sellingPrice) || 0
      const stock = Number(product.stockQty) || 0

      summary.totalCostValue += cost * stock
      summary.totalSaleValue += selling * stock
      return summary
    },
    {
      totalCostValue: 0,
      totalSaleValue: 0,
    },
  )
  summary.totalProfit = summary.totalSaleValue - summary.totalCostValue
  summary.marginPercent =
    summary.totalSaleValue > 0 ? (summary.totalProfit / summary.totalSaleValue) * 100 : 0
  return summary
}

function getDateOffset(date, offsetDays) {
  const nextDate = new Date(`${date}T00:00:00`)
  nextDate.setDate(nextDate.getDate() + offsetDays)
  return nextDate.toISOString().slice(0, 10)
}

function buildMetrics(products, movements = []) {
  const stockMetrics = products.reduce(
    (totals, product) => {
      const stock = Number(product.stockQty) || 0
      const cost = Number(product.costPrice) || 0
      const selling = Number(product.sellingPrice) || 0

      totals.totalProducts += 1
      totals.totalQuantity += stock
      totals.totalCostValue += cost * stock
      totals.totalSellingValue += selling * stock
      totals.estimatedProfit += (selling - cost) * stock
      if (stock <= Number(product.minimumStock)) totals.lowStockCount += 1

      return totals
    },
    {
      totalProducts: 0,
      totalQuantity: 0,
      totalCostValue: 0,
      totalSellingValue: 0,
      estimatedProfit: 0,
      lowStockCount: 0,
    },
  )
  const today = new Date().toISOString().slice(0, 10)
  const todayMetrics = movements.reduce(
    (totals, movement) => {
      if (movement.type !== 'stock-check' || movement.date !== today) return totals

      totals.todaySoldQty += Number(movement.soldQty) || 0
      totals.todaySalesValue += Number(movement.salesValue) || 0
      totals.todayProfit += Number(movement.profit) || 0
      return totals
    },
    {
      todayProfit: 0,
      todaySalesValue: 0,
      todaySoldQty: 0,
    },
  )

  return {
    ...stockMetrics,
    ...todayMetrics,
  }
}

function normalizeProduct(product) {
  return {
    ...product,
    name: (product.name || '').trim(),
    category: (product.category || '').trim(),
    costPrice: Number(product.costPrice) || 0,
    sellingPrice: Number(product.sellingPrice) || 0,
    stockQty: Number(product.stockQty) || 0,
    minimumStock: Number(product.minimumStock) || 0,
    supplier: (product.supplier || '').trim(),
    sku: (product.sku || '').trim(),
  }
}

function getCategories(products) {
  return [...new Set(products.map((item) => item.category).filter(Boolean))].sort()
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatRM(value) {
  return new Intl.NumberFormat('en-MY', {
    currency: 'MYR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(Number(value) || 0)
}

function formatCompactRM(value) {
  const number = Number(value) || 0
  if (Math.abs(number) >= 1000) {
    return `RM${new Intl.NumberFormat('en-MY', {
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(number)}`
  }

  return `RM${new Intl.NumberFormat('en-MY', {
    maximumFractionDigits: 0,
  }).format(number)}`
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('en-MY', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(value) || 0)}%`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function PackageCheckIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
      <path d="m16.5 14.5 1.5 1.5 3-3" />
    </svg>
  )
}

function LayersIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  )
}

function WalletIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M4 8h16" />
      <path d="M16 13h2" />
    </svg>
  )
}

function TagIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M20 13 11 4H4v7l9 9 7-7Z" />
      <path d="M8 8h.01" />
    </svg>
  )
}

function ProfitIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M4 18 10 12l4 4 6-8" />
      <path d="M15 8h5v5" />
    </svg>
  )
}

function AlertIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M12 3 2.7 19h18.6L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function ChartIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
    </svg>
  )
}

function DashboardIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" />
    </svg>
  )
}

function BoxIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  )
}

function ArrowsIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M7 7h13l-4-4M17 17H4l4 4" />
    </svg>
  )
}

function PlusBoxIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  )
}

function SettingsIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.08V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.52 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}

function SearchIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  )
}

function SaveIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M5 5a2 2 0 0 1 2-2h10l2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 17h8" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" {...props}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

export default App
