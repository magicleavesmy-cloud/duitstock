import { useEffect, useMemo, useRef, useState } from 'react'
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
import BottomNav from './components/BottomNav'
import Header from './components/Header'
import ProductValueTable from './components/ProductValueTable'
import StockEntriesTable from './components/StockEntriesTable'
import StockOverview from './components/StockOverview'
import SummarySection from './components/SummarySection'
import { db, isFirebaseConfigured } from './firebase'
import './App.css'
import {
  AlertIcon,
  ArrowsIcon,
  BoxIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  CloseIcon,
  DashboardIcon,
  PencilIcon,
  PlusBoxIcon,
  ProfitIcon,
  SaveIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  TrashIcon,
} from './icons'

const PRODUCTS_KEY = 'duitstock-products'
const STOCK_CHECKS_KEY = 'duitstock-stock-checks'
const STOCK_IN_RECORDS_KEY = 'duitstock-stock-in-records'
const USER_ROLE_KEY = 'currentUserRole'
const LAST_BACKUP_KEY = 'duitstock-last-backup-at'

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
  ['dashboard', 'products', 'movements', 'stockInHistory'].includes(item.id),
)
const roleHomePages = {
  admin: 'dashboard',
  staff: 'dashboard',
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
  const [lastBackupAt, setLastBackupAt] = useState(() => readStorage(LAST_BACKUP_KEY, ''))

  useEffect(() => {
    if (!currentUserRole) return
    writeStorage(USER_ROLE_KEY, currentUserRole)
  }, [currentUserRole])

  const productCategories = useMemo(() => getCategories(products), [products])
  const visibleActivePage = visibleNavItems.some((item) => item.id === activePage)
    ? activePage
    : roleHomePages[currentUserRole]

  function login(password) {
    const role = password === '4321' ? 'admin' : password === '7986' ? 'staff' : ''

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

    const invalidRow = checkRows.find(
      (row) =>
        Number(row.displayQty) < 0 ||
        Number(row.storeQty) < 0 ||
        Number(row.physicalQty ?? row.countedStock) < 0,
    )

    if (invalidRow) {
      showError('Stock check quantities cannot be negative.')
      return false
    }

    if (!checkRows.length) {
      showError('Add products before saving a stock check.')
      return false
    }

    setActionError('')

    const productUpdatedAt = new Date().toISOString()
    const checkedAt = productUpdatedAt.slice(0, 10)
    const records = checkRows.map((row) => {
      const displayQty = Number(row.displayQty) || 0
      const storeQty = Number(row.storeQty) || 0
      const systemQty = Number(row.systemQty ?? row.previousStock) || 0
      const physicalQty = Number(row.physicalQty ?? row.countedStock) || 0
      const difference = physicalQty - systemQty
      const soldQty = Math.max(0, -difference)
      const addedQty = Math.max(0, difference)
      const salesValue = soldQty * (Number(row.sellingPrice) || 0)
      const costValue = soldQty * (Number(row.costPrice) || 0)
      const profit = soldQty > 0 ? salesValue - costValue : 0

      return {
        id: createId(),
        addedQty,
        costValue,
        countedStock: physicalQty,
        checkedBy: currentUserRole,
        date: checkedAt,
        difference,
        displayQty,
        note: 'Stock check',
        physicalQty,
        previousStock: systemQty,
        productId: row.productId,
        productName: row.productName,
        profit,
        salesValue,
        soldQty,
        storeQty,
        systemQty,
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
              updatedAt: productUpdatedAt,
            },
            { merge: true },
          )
        })

        await batch.commit()
        setProducts((current) =>
          current.map((product) => {
            const record = records.find((item) => item.productId === product.id)
            return record
              ? { ...product, stockQty: record.countedStock, updatedAt: productUpdatedAt }
              : product
          }),
        )
        setStockChecks((current) => [...records, ...current])
        showToast('success', 'Stock check saved.')
        return records
      } catch {
        showError('Stock check could not be saved to Firestore.')
        return false
      }
    }

    setProducts((current) =>
      current.map((product) => {
        const record = records.find((item) => item.productId === product.id)
        return record
          ? { ...product, stockQty: record.countedStock, updatedAt: productUpdatedAt }
          : product
      }),
    )
    setStockChecks((current) => [...records, ...current])
    showToast('success', 'Stock check saved locally.')
    return records
  }

  async function saveStockCheckRecord(row) {
    if (!isAdmin && !isStaff) {
      showError('Only logged-in users can save stock checks.')
      return false
    }

    if (
      Number(row.displayQty) < 0 ||
      Number(row.storeQty) < 0 ||
      Number(row.physicalQty ?? row.countedStock) < 0
    ) {
      showError('Stock check quantities cannot be negative.')
      return false
    }

    setActionError('')

    const productUpdatedAt = new Date().toISOString()
    const recordId = row.recordId || createId()
    const record = buildStockCheckRecord({
      row,
      checkedAt: productUpdatedAt.slice(0, 10),
      currentUserRole,
      id: recordId,
    })

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)

        batch.set(
          doc(db, 'stockChecks', record.id),
          {
            ...record,
            checkedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        batch.set(
          doc(db, 'products', record.productId),
          {
            stockQty: record.countedStock,
            updatedAt: productUpdatedAt,
          },
          { merge: true },
        )
        await batch.commit()
      } catch {
        showError('Stock check could not be saved to Firestore.')
        return false
      }
    }

    setProducts((current) =>
      current.map((product) =>
        product.id === record.productId
          ? { ...product, stockQty: record.countedStock, updatedAt: productUpdatedAt }
          : product,
      ),
    )
    setStockChecks((current) => {
      const exists = current.some((item) => item.id === record.id)
      return exists
        ? current.map((item) => (item.id === record.id ? { ...item, ...record } : item))
        : [record, ...current]
    })
    showToast('success', 'Product stock check saved.')
    return record
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

    const productUpdatedAt = new Date().toISOString()
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
              updatedAt: productUpdatedAt,
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
          ? {
              ...product,
              stockQty: Number(product.stockQty || 0) + addedQty,
              updatedAt: productUpdatedAt,
            }
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

  async function deleteStockInRecord(record) {
    if (!record?.id) {
      showError('Stock in record was not found.')
      return false
    }

    const quantityAdded = Number(record.quantityAdded) || 0
    const product = products.find((item) => item.id === record.productId)

    if (!product) {
      showError('Product was not found. Please refresh and try again.')
      return false
    }

    setActionError('')

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)

        batch.delete(doc(db, 'stockInRecords', record.id))
        batch.set(
          doc(db, 'products', record.productId),
          {
            stockQty: increment(-quantityAdded),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        await batch.commit()
      } catch {
        showError('Stock in record could not be deleted from Firestore.')
        return false
      }
    }

    setStockInRecords((current) => current.filter((item) => item.id !== record.id))
    setProducts((current) =>
      current.map((item) =>
        item.id === record.productId
          ? { ...item, stockQty: (Number(item.stockQty) || 0) - quantityAdded }
          : item,
      ),
    )
    showToast('success', 'Stock in record deleted.')
    return true
  }

  async function updateStockInRecord(record, quantityValue, supplierValue) {
    if (!record?.id) {
      showError('Stock in record was not found.')
      return false
    }

    const nextQuantity = Number(quantityValue) || 0
    if (nextQuantity <= 0) {
      showError('Quantity must be more than zero.')
      return false
    }

    const product = products.find((item) => item.id === record.productId)

    if (!product) {
      showError('Product was not found. Please refresh and try again.')
      return false
    }

    const previousQuantity = Number(record.quantityAdded) || 0
    const quantityDelta = nextQuantity - previousQuantity
    const purchaseCost =
      Number(record.purchaseCost ?? record.price) || Number(product.costPrice) || 0
    const amount = nextQuantity * purchaseCost
    const supplierNotes = (supplierValue ?? record.supplierNotes ?? record.notes ?? '').trim()
    const updatedAt = new Date().toISOString()

    setActionError('')

    if (isCloudEnabled) {
      try {
        const batch = writeBatch(db)

        batch.set(
          doc(db, 'stockInRecords', record.id),
          {
            amount,
            notes: supplierNotes,
            price: purchaseCost,
            purchaseCost,
            quantityAdded: nextQuantity,
            supplierNotes,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        batch.set(
          doc(db, 'products', record.productId),
          {
            stockQty: increment(quantityDelta),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        await batch.commit()
      } catch {
        showError('Stock in record could not be updated in Firestore.')
        return false
      }
    }

    setStockInRecords((current) =>
      current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              amount,
              notes: supplierNotes,
              price: purchaseCost,
              purchaseCost,
              quantityAdded: nextQuantity,
              supplierNotes,
              updatedAt,
            }
          : item,
      ),
    )
    setProducts((current) =>
      current.map((item) =>
        item.id === record.productId
          ? { ...item, stockQty: (Number(item.stockQty) || 0) + quantityDelta }
          : item,
      ),
    )
    showToast('success', 'Stock in record updated.')
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

  function exportBackup() {
    const exportedAt = new Date().toISOString()
    const backup = {
      app: 'DuitStock',
      version: 1,
      exportedAt,
      products,
      categories: getCategories(products),
      suppliers: getSuppliers(products),
      stockChecks,
      stockInHistory: stockInRecords,
      settings: {
        currentUserRole,
        isCloudEnabled,
        lastBackupAt: exportedAt,
      },
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `duitstock-backup-${exportedAt.slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    setLastBackupAt(exportedAt)
    writeStorage(LAST_BACKUP_KEY, exportedAt)
    showToast('success', 'Backup exported.')
  }

  function importBackup(fileText) {
    let backup

    try {
      backup = JSON.parse(fileText)
    } catch {
      showError('Backup file is not valid JSON.')
      return false
    }

    const restored = normalizeBackupData(backup)

    if (!restored) {
      showError('Backup file is missing supported DuitStock data.')
      return false
    }

    writeStorage(PRODUCTS_KEY, restored.products)
    writeStorage(STOCK_CHECKS_KEY, restored.stockChecks)
    writeStorage(STOCK_IN_RECORDS_KEY, restored.stockInRecords)
    setProducts(restored.products)
    setStockChecks(restored.stockChecks)
    setStockInRecords(restored.stockInRecords)
    setActionError('')
    showToast('success', 'Backup imported.')
    return true
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
      <div className={`app-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col px-2 pb-28 pt-2.5 sm:px-3 sm:pt-4 lg:px-5 ${visibleActivePage === 'dashboard' ? 'dashboard-shell' : 'dashboard-shell'}`}>
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
              {visibleActivePage === 'dashboard' && (
                <DashboardPage
                  products={products}
                  stockChecks={stockChecks}
                  stockInRecords={stockInRecords}
                />
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
                  onSaveProduct={saveStockCheckRecord}
                  onSave={saveStockCheck}
                />
              )}
              {visibleActivePage === 'stockInHistory' && (
                <StockInHistoryPage
                  canViewCosts={isAdmin}
                  products={products}
                  stockInRecords={stockInRecords}
                  onDeleteRecord={deleteStockInRecord}
                  onSave={saveStockIn}
                  onUpdateRecord={updateStockInRecord}
                />
              )}
              {isAdmin && visibleActivePage === 'reports' && (
                <ReportsPage products={products} stockChecks={stockChecks} />
              )}
              {isAdmin && visibleActivePage === 'settings' && (
                <SettingsPage
                  isCloudEnabled={isCloudEnabled}
                  lastBackupAt={lastBackupAt}
                  products={products}
                  stockChecks={stockChecks}
                  stockInRecords={stockInRecords}
                  onClearAll={clearAllData}
                  onExportBackup={exportBackup}
                  onImportBackup={importBackup}
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

function DashboardPage({ products, stockChecks, stockInRecords }) {
  const summary = buildDashboardSummary({ products, stockChecks, stockInRecords })
  const topValueProducts = summary.topValueProducts.map((product) => ({
    ...product,
    trend: getProductDashboardTrend(product, summary.recentEntries),
  }))

  return (
    <section className="dashboard-page space-y-2.5">
      <StockOverview formatRM={formatRM} summary={summary} />
      <SummarySection formatRM={formatRM} summary={summary} />
      <ProductValueTable
        formatNumber={formatNumber}
        formatRM={formatRM}
        products={topValueProducts}
        recentEntries={summary.recentEntries}
        totalStockQty={summary.totalStockQty}
      />
      <StockEntriesTable entries={summary.recentEntries} />
    </section>
  )
}

const productGlassControlStyle = {
  background: '#FFFFFF',
  border: '1px solid #ECE7DF',
  borderRadius: '10px',
  color: '#18181B',
  boxShadow: 'none',
}

const productLowStockStyle = (active) => ({
  height: '44px',
  borderRadius: '10px',
  border: active
    ? '1px solid rgba(200,139,74,0.22)'
    : '1px solid #ECE7DF',
  background: active ? 'rgba(200,139,74,0.12)' : '#FFFFFF',
  color: active ? '#C88B4A' : '#71717A',
  fontSize: '13px',
  fontWeight: 700,
  boxShadow: 'none',
})

const productAddButtonStyle = {
  height: '50px',
  borderRadius: '12px',
  background: '#C88B4A',
  border: '1px solid #C88B4A',
  boxShadow: 'none',
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: 800,
}

const productListCardStyle = {
  minHeight: '72px',
  borderRadius: '16px',
  border: '1px solid #ECE7DF',
  background: '#FFFFFF',
  padding: '14px',
  marginBottom: '4px',
  width: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(24,24,27,0.04)',
}

const productStockBadgeStyle = {
  borderRadius: '999px',
  background: 'rgba(22,163,74,0.08)',
  border: '1px solid rgba(22,163,74,0.16)',
  color: '#16A34A',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: 'none',
}

const productActionStyle = (tone = 'neutral') => {
  const tones = {
    orange: ['#C88B4A', '#C88B4A', '#FFFFFF'],
    neutral: ['#FFFFFF', '#ECE7DF', '#71717A'],
    danger: ['rgba(220,38,38,0.08)', 'rgba(220,38,38,0.16)', '#DC2626'],
  }
  const [background, border, color] = tones[tone]

  const isOrange = tone === 'orange'
  if (isOrange) {
    return {
      height: '38px',
      minWidth: '80px',
      borderRadius: '10px',
      background: '#C88B4A',
      border: '1px solid #C88B4A',
      boxShadow: 'none',
      color: '#FFFFFF',
      fontSize: '12px',
      fontWeight: 700,
      lineHeight: 1,
      padding: '0 14px',
    }
  }
  return {
    height: '26px',
    borderRadius: '999px',
    background,
    border: `1px solid ${border}`,
    color,
    padding: '0 9px',
    fontSize: '10px',
    fontWeight: 700,
    lineHeight: 1,
  }
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
    <section className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search products</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-main)]/45" />
          <input
            className="w-full text-[13px] font-semibold outline-none transition placeholder:text-[var(--text-main)]/40 focus:ring-4 focus:ring-orange-400/15"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products"
            style={{ ...productGlassControlStyle, height: '46px', padding: '0 14px 0 36px' }}
            value={query}
          />
        </label>
        <select
          className="text-[13px] font-semibold outline-none transition focus:ring-4 focus:ring-orange-400/15"
          onChange={(event) => setCategory(event.target.value)}
          style={{ ...productGlassControlStyle, height: '44px', padding: '0 14px' }}
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
        className="w-full transition hover:-translate-y-0.5 sm:w-fit"
        onClick={() => setShowLowStockOnly((current) => !current)}
        style={productLowStockStyle(showLowStockOnly)}
        type="button"
      >
        Low Stock
      </button>

      {canViewCosts && <ProductsAdminHero summary={productSummary} />}

      {canAddProducts && (
        <button
          className="add-product-btn w-full transition hover:-translate-y-0.5 sm:w-fit"
          onClick={onNew}
          style={productAddButtonStyle}
          type="button"
        >
          Add product
        </button>
      )}

      {filteredProducts.length ? (
        <div className="grid gap-2">
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
  const items = [
    ['Frozen Capital', formatRM(summary.totalCostValue)],
    ['Sale Value', formatRM(summary.totalSaleValue)],
    ['Profit', formatRM(summary.totalProfit)],
    ['Margin', formatPercent(summary.marginPercent)],
  ]

  return (
    <div
      className="rounded-[18px] p-2.5"
      style={{
        background: '#FFFFFF',
        border: '1px solid #ECE7DF',
        boxShadow: '0 1px 2px rgba(24,24,27,0.04)',
      }}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {items.map(([label, value]) => (
          <div
            className="rounded-xl px-2 py-2"
            key={label}
            style={{
              background: '#F6F3EE',
              border: '1px solid #ECE7DF',
              boxShadow: 'none',
            }}
          >
            <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-main)]/45">{label}</p>
            <p className="mt-0.5 text-[11px] leading-tight font-extrabold text-[var(--text-main)]/90">{value}</p>
          </div>
        ))}
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
  const costPrice = Number(product.costPrice) || 0
  const sellingPrice = Number(product.sellingPrice) || 0
  const stock = Number(product.stockQty) || 0
  const profitPerUnit = sellingPrice - costPrice
  const profitMargin = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0
  const totalProfitIfSoldOut = profitPerUnit * stock
  const title = [product.name, product.category].filter(Boolean).join(' • ')

  return (
    <article
      className="flex items-center justify-between gap-3"
      style={productListCardStyle}
    >
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold leading-tight text-[var(--text-main)]/95">
            {title}
          </h2>
          {canViewCosts ? (
            <div className="mt-1 space-y-0.5 text-[11px] font-medium leading-tight text-[var(--text-main)]/48">
              <p className="truncate">
                Cost {formatCompactRM(costPrice)} | Sell {formatCompactRM(sellingPrice)} | Margin{' '}
                {formatCompactPercent(profitMargin)}
              </p>
              <p className="truncate">
                Profit {formatCompactRM(profitPerUnit)} | Sold{' '}
                {formatCompactRM(totalProfitIfSoldOut)}
              </p>
            </div>
          ) : (
            <p className="mt-1 truncate text-[11px] font-medium leading-tight text-[var(--text-main)]/48">
              Sell {formatCompactRM(sellingPrice)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          <span className="stock-badge shrink-0" style={productStockBadgeStyle}>
            Stock {Number(product.stockQty) || 0}
          </span>
          <div className="flex flex-wrap justify-end gap-1">
            <button
              className="transition hover:-translate-y-0.5"
              style={productActionStyle('orange')}
              onClick={() => onStockIn(product)}
              type="button"
            >
              Stock In
            </button>
            {canManageProducts && (
              <>
                <button
                  className="transition hover:-translate-y-0.5"
                  onClick={() => onEdit(product)}
                  style={productActionStyle('neutral')}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="transition hover:-translate-y-0.5"
                  onClick={() => onDelete(product.id)}
                  style={productActionStyle('danger')}
                  type="button"
                >
                  Del
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function MovementsPage({ canViewProfit, products, stockChecks, onSave, onSaveProduct }) {
  const categories = useMemo(() => getCategories(products), [products])
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [updatedAtFilter, setUpdatedAtFilter] = useState('all')
  const [counts, setCounts] = useState({})
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [isSaving, setIsSaving] = useState(false)
  const [savingProductId, setSavingProductId] = useState('')
  const [pendingRows, setPendingRows] = useState(null)
  const today = new Date().toISOString().slice(0, 10)
  const savedCounts = useMemo(() => {
    const byProduct = new Map()

    stockChecks
      .filter((item) => item.date === today && item.productId)
      .forEach((item) => {
        const current = byProduct.get(item.productId)
        if (current && sortMovementDate(current) >= sortMovementDate(item)) return
        byProduct.set(item.productId, item)
      })

    return byProduct
  }, [stockChecks, today])
  const latestStockCheckByProduct = useMemo(() => {
    const byProduct = new Map()

    stockChecks
      .filter((item) => item.productId)
      .forEach((item) => {
        const timestamp = getStockEntryTimestamp(item)
        const current = byProduct.get(item.productId)

        if (current && current >= timestamp) return
        byProduct.set(item.productId, timestamp)
      })

    return byProduct
  }, [stockChecks])

  useEffect(() => {
    setCounts((current) => {
      const next = { ...current }

      savedCounts.forEach((record, productId) => {
        const existing = current[productId]
        const hasDirtyEdit =
          existing && !existing.isSaved && (existing.displayQty !== '' || existing.storeQty !== '')

        if (hasDirtyEdit) return
        next[productId] = {
          displayQty: String(Number(record.displayQty) || 0),
          isSaved: true,
          recordId: record.id,
          storeQty: String(Number(record.storeQty) || 0),
          systemQty: Number(record.systemQty ?? record.previousStock) || 0,
          savedAt: record.updatedAt || record.createdAt || record.savedAt || record.date || '',
        }
      })

      return next
    })
  }, [savedCounts])

  const visibleProducts = useMemo(() => {
    const lowered = query.toLowerCase().trim()

    return products
      .map((product, index) => ({ index, product }))
      .filter((product) => {
        const matchesCategory = category === 'all' || product.product.category === category
        const matchesQuery = [product.product.name, product.product.category, product.product.sku]
          .join(' ')
          .toLowerCase()
          .includes(lowered)
        const matchesUpdatedAt = isProductInUpdatedAtFilter(product.product, updatedAtFilter)

        return matchesCategory && matchesQuery && matchesUpdatedAt
      })
      .sort((a, b) => {
        const checkedDiff =
          Number(isProductChecked(a.product.id)) - Number(isProductChecked(b.product.id))
        return checkedDiff || a.index - b.index
      })
      .map((item) => item.product)
  }, [category, counts, products, query, updatedAtFilter])
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
    (product) => isProductChecked(product.id),
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

  function isProductEntered(productId) {
    const count = counts[productId]
    return Boolean(count && (count.displayQty !== '' || count.storeQty !== ''))
  }

  function isProductChecked(productId) {
    return Boolean(counts[productId]?.isSaved)
  }

  function updateCount(productId, field, value) {
    if (Number(value) < 0) return
    setCounts((current) => {
      const nextCount = {
        displayQty: '',
        recordId: '',
        storeQty: '',
        systemQty: Number(products.find((product) => product.id === productId)?.stockQty) || 0,
        ...(current[productId] || {}),
        [field]: value,
        isSaved: false,
      }
      const next = { ...current }

      if (nextCount.displayQty === '' && nextCount.storeQty === '') {
        delete next[productId]
      } else {
        next[productId] = nextCount
      }

      return next
    })
  }

  function focusNextInput(productId) {
    const currentIndex = products.findIndex((product) => product.id === productId)
    const nextProduct = products[currentIndex + 1]
    if (!nextProduct) return

    window.requestAnimationFrame(() => {
      document.querySelector(`[data-stock-input="${nextProduct.id}-display"]`)?.focus()
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const rows = progressProducts
      .filter((product) => isProductEntered(product.id))
      .filter((product) => !counts[product.id]?.isSaved)
      .map((product) => buildStockCheckRow(product, counts[product.id] || {}))
    if (!rows.length) {
      setCounts({})
      return
    }
    setPendingRows(rows)
  }

  async function confirmSave() {
    setIsSaving(true)
    const savedRecords = await onSave(pendingRows || [])
    setIsSaving(false)
    if (savedRecords) {
      setCounts((current) => {
        const next = { ...current }
        const records = Array.isArray(savedRecords) ? savedRecords : []

        records.forEach((record) => {
          if (next[record.productId]) {
            next[record.productId] = {
              ...next[record.productId],
              isSaved: true,
              recordId: record.id,
              systemQty: record.systemQty,
            }
          }
        })
        return next
      })
      setPendingRows(null)
    }
  }

  async function saveProductCount(product) {
    if (!isProductEntered(product.id) || counts[product.id]?.isSaved) return

    setSavingProductId(product.id)
    const record = await onSaveProduct(buildStockCheckRow(product, counts[product.id] || {}))
    setSavingProductId('')

    if (!record) return

    setCounts((current) => ({
      ...current,
      [product.id]: {
        ...(current[product.id] || {}),
        isSaved: true,
        recordId: record.id,
        systemQty: record.systemQty,
        savedAt: record.updatedAt || record.createdAt || record.savedAt || new Date().toISOString(),
      },
    }))
  }

  return (
    <section className="space-y-5">
      <form className="premium-panel pb-[72px] sm:pb-3" onSubmit={handleSubmit}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Stock check</h2>
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            {products.length}
          </span>
        </div>

        <div className="mb-1 rounded-[14px] bg-white/76 p-1.5 shadow-sm ring-1 ring-white/80">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-zinc-600">Checked products</p>
            <p className="text-xs font-bold text-zinc-950">
              {progressCheckedCount} / {progressProducts.length} checked
            </p>
          </div>
          <p className="mt-1 text-[11px] font-bold text-zinc-600">
            {progressPercent}% complete
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-[#f5f1e8] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mb-1.5 grid grid-cols-[1.15fr_0.85fr] gap-1.5">
          <label className="relative">
            <span className="sr-only">Search stock check products</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              className="field-input h-10 pl-9 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              value={query}
            />
          </label>
          <select
            className="field-input h-10 px-2 text-xs"
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
          <div className="col-span-2 -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-1.5">
              {[
                ['all', 'All'],
                ['10days', 'Last 10 Days'],
                ['20days', 'Last 20 Days'],
                ['30days', 'Last 30 Days'],
              ].map(([value, label]) => (
                <button
                  className={`stock-age-filter-chip ${
                    updatedAtFilter === value ? `active filter-${value}` : ''
                  }`}
                  key={value}
                  onClick={() => setUpdatedAtFilter(value)}
                  type="button"
                >
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleProducts.length ? (
          <div className="max-h-[72vh] divide-y divide-zinc-100 overflow-y-auto rounded-[16px] bg-white/70 pb-20 pr-0 sm:max-h-none sm:overflow-visible sm:pb-16">
            {visibleProducts.map((product) => (
              <StockCheckRow
                count={counts[product.id] || { displayQty: '', storeQty: '' }}
                isSaving={savingProductId === product.id}
                key={product.id}
                onChange={updateCount}
                onEnter={focusNextInput}
                onSave={saveProductCount}
                product={product}
                stockCheckUpdatedAt={latestStockCheckByProduct.get(product.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No products to check"
            text="Add products with opening stock before running a stock check."
          />
        )}


      </form>

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <div
          className="flex items-center gap-3"
          style={{ display: 'flex', justifyContent: 'space-between' }}
        >
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
        <div className={`mt-2 grid gap-1.5 grid-cols-1 sm:grid-cols-3`}>
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

function StockCheckRow({
  count,
  isSaving,
  onChange,
  onEnter,
  onSave,
  product,
  stockCheckUpdatedAt,
}) {
  const displayQty = count.displayQty ?? ''
  const storeQty = count.storeQty ?? ''
  const hasEntry = displayQty !== '' || storeQty !== ''
  const isSaved = Boolean(count.isSaved)
  const isCheckedIndicatorActive = isSaved || isSaving
  const systemQty = Number(count.systemQty ?? product.stockQty) || 0
  const physicalQty = (Number(displayQty) || 0) + (Number(storeQty) || 0)
  const difference = physicalQty - systemQty
  const lastUpdatedLabel = formatProductUpdatedAt(stockCheckUpdatedAt)
  const updatedAtState = getProductUpdatedAtState(stockCheckUpdatedAt)

  return (
    <article className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-[14px] bg-white/75 px-2 py-1.5 shadow-sm ring-1 ring-white/80">
      <div className="flex min-w-0 items-start gap-1.5">
        <span
          aria-hidden="true"
          style={{
            background: isCheckedIndicatorActive ? '#5D8A52' : '#B85C4A',
            borderRadius: 999,
            boxShadow: isCheckedIndicatorActive
              ? '0 0 6px rgba(93,138,82,0.70)'
              : '0 0 6px rgba(184,92,74,0.70)',
            flexShrink: 0,
            height: 10,
            marginTop: 3,
            width: 10,
          }}
        />

        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold leading-tight">{product.name}</p>
          <p className="mt-0.5 text-[10px] font-bold leading-tight text-zinc-500">
            Current Stock:{' '}
            <span
              style={{
                color: '#16A34A',
                textShadow: 'none',
              }}
            >
              {systemQty}
            </span>
          </p>
          <p className={`product-updated ${updatedAtState}`}>
            {lastUpdatedLabel}
          </p>
        </div>
      </div>

      <input
        className="h-9 w-[52px] rounded-xl border border-zinc-300 bg-white text-center text-base font-bold text-zinc-950 shadow-sm outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-300"
        data-stock-input={`${product.id}-display`}
        inputMode="numeric"
        min="0"
        onChange={(event) => onChange(product.id, 'displayQty', event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          document.querySelector(`[data-stock-input="${product.id}-store"]`)?.focus()
        }}
        pattern="[0-9]*"
        placeholder="0"
        type="number"
        value={displayQty}
      />

      <input
        className="h-9 w-[52px] rounded-xl border border-zinc-300 bg-white text-center text-base font-bold text-zinc-950 shadow-sm outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-300"
        data-stock-input={`${product.id}-store`}
        inputMode="numeric"
        min="0"
        onChange={(event) => onChange(product.id, 'storeQty', event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onEnter(product.id)
        }}
        pattern="[0-9]*"
        placeholder="0"
        type="number"
        value={storeQty}
      />

      <div className="flex w-[68px] shrink-0 flex-col items-center">
        <button
          className={`h-8 w-[62px] rounded-xl text-[10px] font-bold transition ${
            isSaved
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
              : 'bg-[#f5f1e8] text-[var(--text-main)] shadow-sm'
          }`}
          disabled={!hasEntry || isSaved || isSaving}
          onClick={() => onSave(product)}
          type="button"
        >
          {isSaving ? 'Saving' : isSaved ? 'Saved' : count.recordId ? 'Again' : 'Save'}
        </button>

        <p className="mt-0.5 whitespace-nowrap text-[10px] font-bold leading-tight text-zinc-600">
          Total:{physicalQty}
          <span className="text-zinc-400"> | </span>
          <span className={difference < 0 ? 'text-rose-700' : difference > 0 ? 'text-sky-700' : 'text-zinc-500'}>
            {difference === 0 ? '0' : Math.abs(difference)}
          </span>
        </p>
      </div>
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
  const [deadStockDays, setDeadStockDays] = useState(7)
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
  const deadStockSummary = useMemo(
    () =>
      buildDeadStockSummary(
        deadStockItems,
        products.reduce(
          (total, product) =>
            total + (Number(product.stockQty) || 0) * (Number(product.costPrice) || 0),
          0,
        ),
      ),
    [deadStockItems, products],
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
          label="Last Check Revenue Est."
          tone="indigo"
          value={formatRM(report.today.sales)}
        />
        <MetricCard
          icon={ProfitIcon}
          label="Last Check Profit Est."
          tone="emerald"
          value={formatRM(report.today.profit)}
        />
        <MetricCard
          icon={ArrowsIcon}
          label="Last Check Movement"
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
        summary={deadStockSummary}
        onDaysChange={setDeadStockDays}
      />
    </section>
  )
}

function DeadStockPanel({ days, items, summary, onDaysChange }) {
  const status = getDeadStockStatus(summary.lockedPercentage)
  const statusClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-100',
  }

  return (
    <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sleeping Stock Alert</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Products with stock but no sale movement for the selected period.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1">
          {[7, 14, 21].map((option) => (
            <button
              className={`h-8 rounded-lg px-2 text-xs font-bold ${
                days === option ? 'bg-[#f5f1e8] text-[var(--text-main)] shadow-sm' : 'text-zinc-600'
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

      <div className="mt-3 rounded-[16px] bg-zinc-50 p-2.5 ring-1 ring-zinc-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-950">Sleeping Stock Alert</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              Products: {summary.products}
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusClasses[status.tone]}`}>
            {status.label}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <Info label="Products" value={summary.products} />
          <Info label="Frozen Value" value={formatRM(summary.lockedValue)} />
          <Info label="Frozen Percentage" value={formatCompactPercent(summary.lockedPercentage)} />
        </div>
      </div>

      {items.length ? (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <article
              className="rounded-[16px] bg-zinc-50 p-2 ring-1 ring-zinc-100 sm:p-2.5"
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
                  {formatRM(item.costValueFrozen)}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                <Info label="Sale value" value={formatRM(item.saleValue)} />
                <Info label="Last sold" value={item.lastSoldLabel} />
                <Info label="No sale" value={item.daysWithoutSaleLabel} />
                <Info label="Days since last sale" value={item.daysSinceLastSaleLabel} />
                <Info label="Value locked" value={formatRM(item.costValueFrozen)} />
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
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#f5f1e8] text-xs font-bold text-[var(--text-main)]">
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
    <div className="fixed inset-0 z-50 flex items-end bg-[#f5f1e8]/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div className="w-full rounded-[24px] bg-white p-4 shadow-xl shadow-zinc-950/15 sm:max-w-md">
        <h2 className="text-xl font-semibold tracking-tight">Complete stock check?</h2>
        <p className="mt-1 text-xs text-zinc-500">
          This will save any unsaved counted products and update stock-check history.
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
  canViewCosts,
  products,
  stockInRecords,
  onDeleteRecord,
  onSave,
  onUpdateRecord,
}) {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [editingRecordId, setEditingRecordId] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editSupplier, setEditSupplier] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const filteredRecords = stockInRecords.filter(
    (record) => getRecordDateValue(record) === filterDate,
  )
  const totalAdded = filteredRecords.reduce(
    (total, record) => total + (Number(record.quantityAdded) || 0),
    0,
  )

  function startEditingRecord(record) {
    setEditingRecordId(record.id)
    setEditQuantity(String(Number(record.quantityAdded) || 0))
    setEditSupplier(record.supplierNotes || record.notes || '')
  }

  function cancelEditingRecord() {
    setEditingRecordId('')
    setEditQuantity('')
    setEditSupplier('')
  }

  async function saveEditingRecord(record) {
    setIsUpdating(true)
    const didUpdate = await onUpdateRecord(record, editQuantity, editSupplier)
    setIsUpdating(false)
    if (didUpdate) cancelEditingRecord()
  }

  async function deleteEditingRecord(record) {
    setIsDeleting(true)
    const didDelete = await onDeleteRecord(record)
    setIsDeleting(false)
    if (didDelete) cancelEditingRecord()
  }

  return (
    <section className="space-y-2.5">
      <StockInEntryBox
        date={filterDate}
        products={products}
        onSave={onSave}
      />

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Stock in history</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {totalAdded} units added on {formatDate(filterDate)}
            </p>
          </div>
          <div
            style={{
              alignItems: 'center',
              background: '#F0E8DC',
              border: '1px solid rgba(210,175,120,0.35)',
              borderRadius: 999,
              display: 'inline-flex',
              fontSize: 12,
              gap: 8,
              height: 32,
              padding: '0 8px',
            }}
          >
            <button
              aria-label="Previous day"
              onClick={() => {
                const next = new Date(filterDate)
                next.setDate(next.getDate() - 1)
                setFilterDate(next.toISOString().slice(0, 10))
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#C8893A',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 900,
                padding: '0 8px',
              }}
              type="button"
            >
              {'<'}
            </button>
            <span className="min-w-[98px] text-center font-bold text-zinc-800">
              {formatDate(filterDate)}
            </span>
            <button
              aria-label="Next day"
              onClick={() => {
                const next = new Date(filterDate)
                next.setDate(next.getDate() + 1)
                setFilterDate(next.toISOString().slice(0, 10))
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#C8893A',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 900,
                padding: '0 8px',
              }}
              type="button"
            >
              {'>'}
            </button>
          </div>
        </div>
      </div>

      {filteredRecords.length ? (
        <div className="overflow-hidden rounded-[18px] bg-white shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr
                className="bg-zinc-50 uppercase"
                style={{ color: '#B09A85', fontSize: 9, fontWeight: 700 }}
              >
                {['Date', 'Product', 'Qty', 'Amount', ''].map((label) => (
                  <th
                    key={label || 'edit'}
                    style={{
                      overflow: 'hidden',
                      padding: '8px 6px',
                      textAlign: label === 'Qty' || label === 'Amount' ? 'right' : 'left',
                      textOverflow: 'ellipsis',
                      verticalAlign: 'middle',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {filteredRecords.map((record) => {
              const isEditing = editingRecordId === record.id
              const supplierName = record.supplierNotes || record.notes
              const product = products.find(
                (item) => item.id === record.productId || item.name === record.productName,
              )
              const quantityAdded = Number(record.quantityAdded) || 0
              const productCost =
                Number(product?.costPrice) || Number(record.purchaseCost ?? record.price) || 0
              const amount = quantityAdded * productCost

              return (
                <tbody key={record.id}>
                  <tr
                    style={{
                      background: isEditing ? '#FFFBF4' : undefined,
                      borderTop: '1px solid #F4F4F5',
                      boxShadow: isEditing ? 'inset 3px 0 0 #C88B4A' : undefined,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <td
                      className="text-zinc-500"
                      style={{
                        overflow: 'hidden',
                        padding: '8px 6px',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatShortDate(record)}
                    </td>
                    <td
                      style={{
                        overflow: 'hidden',
                        padding: '8px 6px',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div className="min-w-0" style={{ overflow: 'hidden' }}>
                        <p className="truncate font-semibold text-zinc-950">
                          {record.productName}
                        </p>
                        {supplierName && (
                          <p
                            className="truncate"
                            style={{
                              color: '#B09A85',
                              display: 'block',
                              fontSize: 10,
                              fontStyle: 'italic',
                              marginTop: 1,
                            }}
                          >
                            {supplierName}
                          </p>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        color: '#5D8A52',
                        fontWeight: 700,
                        overflow: 'hidden',
                        padding: '8px 6px',
                        textAlign: 'right',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      +{quantityAdded}
                    </td>
                    <td
                      style={{
                        color: '#5D8A52',
                        fontWeight: 700,
                        overflow: 'hidden',
                        padding: '8px 6px',
                        textAlign: 'right',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatRM(amount)}
                    </td>
                    <td
                      style={{
                        overflow: 'hidden',
                        padding: '8px 6px',
                        textAlign: 'right',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        aria-label={`Edit stock in record for ${record.productName}`}
                        className="grid h-6 w-6 place-items-center rounded-lg bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        onClick={() => startEditingRecord(record)}
                        type="button"
                      >
                        <PencilIcon className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr style={{ background: '#FFFBF4' }}>
                      <td colSpan={5} style={{ padding: '0 0 10px' }}>
                        <div className="mx-2 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                          <div className="grid min-w-[150px] flex-1 gap-1">
                            <input
                              aria-label={`Quantity for ${record.productName}`}
                              className="h-9 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-bold text-zinc-950 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                              min="1"
                              onChange={(event) => setEditQuantity(event.target.value)}
                              type="number"
                              value={editQuantity}
                            />
                            <label className="grid gap-1">
                              <span style={{ color: '#7A6250', fontSize: 10, fontWeight: 700 }}>
                                Supplier
                              </span>
                              <input
                                aria-label={`Supplier for ${record.productName}`}
                                onChange={(event) => setEditSupplier(event.target.value)}
                                style={{
                                  background: '#F0E8DC',
                                  border: '1px solid rgba(210,175,120,0.35)',
                                  borderRadius: 10,
                                  color: '#3B2A1A',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  height: 36,
                                  outline: 'none',
                                  padding: '0 12px',
                                }}
                                type="text"
                                value={editSupplier}
                              />
                            </label>
                          </div>
                          <button
                            aria-label={`Delete stock in record for ${record.productName}`}
                            className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-60"
                            disabled={isDeleting || isUpdating}
                            onClick={() => deleteEditingRecord(record)}
                            type="button"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                          <button
                            className="secondary-button h-9 px-3 text-xs"
                            disabled={isDeleting || isUpdating}
                            onClick={cancelEditingRecord}
                            type="button"
                          >
                            Cancel
                          </button>
                          <button
                            className="primary-button h-9 px-3 text-xs"
                            disabled={isDeleting || isUpdating}
                            onClick={() => saveEditingRecord(record)}
                            type="button"
                          >
                            {isUpdating ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}
          </table>
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

function StockInEntryBox({ date, products, onSave }) {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingQtyFocusId, setPendingQtyFocusId] = useState('')
  const qtyInputRefs = useRef({})
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
  const totalAmount = rowTotal
  const tableGridClass =
    'grid-cols-[minmax(130px,3fr)_52px_54px_60px_68px_30px] sm:grid-cols-[minmax(220px,3fr)_84px_84px_100px_108px_40px]'

  useEffect(() => {
    if (!pendingQtyFocusId) return

    qtyInputRefs.current[pendingQtyFocusId]?.focus()
    setPendingQtyFocusId('')
  }, [pendingQtyFocusId, rows])

  function getAutofillCost(product) {
    return String(Number(product.costPrice) || Number(product.sellingPrice) || 0)
  }

  function addRow(product) {
    const rowId = createId()

    setRows((current) => [
      ...current,
      {
        category: product.category,
        productId: product.id,
        productName: product.name,
        purchaseCost: getAutofillCost(product),
        quantityAdded: '',
        rowId,
        sku: product.sku,
        stockQty: Number(product.stockQty) || 0,
      },
    ])
    setSearch('')
    setPendingQtyFocusId(rowId)
  }

  function updateRow(rowId, field, value) {
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)),
    )
  }

  function removeRow(rowId) {
    setRows((current) => {
      if (current.length <= 1) return []
      return current.filter((row) => row.rowId !== rowId)
    })
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
    if (!supplierNotes.trim()) {
      window.alert('Please enter supplier name')
      return
    }

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
          className="h-9 rounded-xl border border-zinc-200 bg-white px-2.5 text-[11px] font-bold uppercase text-zinc-700 shadow-sm outline-none transition hover:bg-zinc-50 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200"
          onClick={handleAutofillCost}
          type="button"
        >
          Autofill cost
        </button>
      </div>

      <div className="overflow-visible rounded-[14px] ring-1 ring-zinc-200">
        <div>
          <div className={`grid ${tableGridClass} gap-1 bg-zinc-50 px-1.5 py-1.5 text-[11px] font-bold uppercase leading-tight text-zinc-500 sm:px-2 sm:py-2`}>
            <span>Item</span>
            <span>In Stock</span>
            <span>Qty</span>
            <span>Cost</span>
            <span>Amount</span>
            <span></span>
          </div>

          <div className="divide-y divide-zinc-100 bg-white">
            {rows.map((row) => {
              const amount = (Number(row.quantityAdded) || 0) * (Number(row.purchaseCost) || 0)

              return (
                <div
                  className={`grid ${tableGridClass} items-center gap-1 px-1.5 py-2 text-[13px] sm:px-2`}
                  key={row.rowId}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-950">{row.productName}</p>
                    <p className="truncate text-[11px] font-medium text-zinc-500">
                      {[row.sku, row.category].filter(Boolean).join(' / ') || '-'}
                    </p>
                  </div>
                  <p className="font-semibold text-zinc-600">{row.stockQty}</p>
                  <input
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-1.5 text-[13px] font-bold outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 sm:px-2"
                    min="1"
                    onChange={(event) =>
                      updateRow(row.rowId, 'quantityAdded', event.target.value)
                    }
                    ref={(element) => {
                      if (element) {
                        qtyInputRefs.current[row.rowId] = element
                      } else {
                        delete qtyInputRefs.current[row.rowId]
                      }
                    }}
                    required
                    type="number"
                    value={row.quantityAdded}
                  />
                  <input
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-1.5 text-[13px] font-semibold outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 sm:px-2"
                    min="0"
                    onChange={(event) =>
                      updateRow(row.rowId, 'purchaseCost', event.target.value)
                    }
                    step="0.01"
                    type="number"
                    value={row.purchaseCost}
                  />
                  <p
                    className="truncate text-[13px] font-bold text-zinc-900"
                    style={{ minWidth: 70, padding: '0 12px', paddingRight: 12, textAlign: 'right' }}
                  >
                    {formatCompactRM(amount)}
                  </p>
                  <button
                    aria-label={`Remove ${row.productName} from stock in`}
                    className="grid h-8 w-6 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 sm:w-8"
                    onClick={() => removeRow(row.rowId)}
                    style={{ flexShrink: 0, marginLeft: 6 }}
                    type="button"
                  >
                    <TrashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
                </div>
              )
            })}

            <div className={`relative grid ${tableGridClass} items-center gap-1 px-1.5 py-2 text-[13px] sm:px-2`}>
              <div className="relative">
                <input
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[13px] outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item"
                  value={search}
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[min(280px,calc(100vw-28px))] overflow-hidden rounded-xl bg-white shadow-xl shadow-zinc-950/10 ring-1 ring-zinc-200">
                    {suggestions.map((product) => (
                      <button
                        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-semibold text-zinc-800 hover:bg-zinc-50"
                        key={product.id}
                        onClick={() => addRow(product)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{product.name}</span>
                          <span className="block truncate text-[11px] font-medium text-zinc-500">
                            {[product.sku, product.category].filter(Boolean).join(' / ') || '-'}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] text-zinc-500">
                          {Number(product.stockQty) || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[13px] font-semibold text-zinc-400">-</span>
              <span className="text-[13px] font-semibold text-zinc-400">-</span>
              <span className="text-[13px] font-semibold text-zinc-400">-</span>
              <span
                className="text-[13px] font-semibold text-zinc-400"
                style={{ minWidth: 70, padding: '0 12px', paddingRight: 12, textAlign: 'right' }}
              >
                {formatCompactRM(0)}
              </span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Field label="Supplier / Notes">
            <input
              className="field-input"
              onChange={(event) => setSupplierNotes(event.target.value)}
              placeholder="Supplier / notes"
              style={{ fontSize: 14, fontWeight: 600, height: 44, padding: '0 14px' }}
              type="text"
              value={supplierNotes}
            />
          </Field>
        </div>
        <div className="rounded-[14px] bg-zinc-50 p-2 text-right ring-1 ring-zinc-100">
          <p className="text-[11px] font-bold uppercase text-zinc-500">Total amount</p>
          <p className="text-base font-bold text-zinc-950">{formatRM(totalAmount)}</p>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          className="primary-button h-12 text-sm"
          aria-disabled={!supplierNotes.trim()}
          disabled={isSaving || !rows.length}
          onClick={(event) => {
            if (supplierNotes.trim()) return
            event.preventDefault()
            window.alert('Please enter supplier name')
          }}
          style={{
            minWidth: 140,
            borderRadius: 12,
            opacity: supplierNotes.trim() ? 1 : 0.55,
          }}
          type="submit"
        >
          <SaveIcon className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Stock In'}
        </button>
      </div>
    </form>
  )
}

function SettingsPage({
  isCloudEnabled,
  lastBackupAt,
  onClearAll,
  onExportBackup,
  onImportBackup,
  onLoadSample,
  products,
  stockChecks,
  stockInRecords,
}) {
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  function handleImportFileChange(event) {
    const [file] = event.target.files

    event.target.value = ''
    setImportError('')
    if (file) setPendingImportFile(file)
  }

  async function confirmImport() {
    if (!pendingImportFile) return

    setIsImporting(true)
    setImportError('')

    try {
      const text = await pendingImportFile.text()
      const didImport = onImportBackup(text)

      if (didImport) {
        setPendingImportFile(null)
      } else {
        setImportError('Choose a valid DuitStock backup JSON file.')
      }
    } catch {
      setImportError('Backup file could not be read.')
    } finally {
      setIsImporting(false)
    }
  }

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
          <Info label="Last Backup" value={formatBackupTimestamp(lastBackupAt)} />
        </dl>
      </div>

      <div className="rounded-[20px] bg-white p-3 shadow-sm shadow-zinc-200/70 ring-1 ring-zinc-200">
        <h2 className="text-base font-semibold">Data actions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button className="secondary-button" onClick={onExportBackup} type="button">
            Export Backup
          </button>
          <label className="secondary-button flex cursor-pointer items-center justify-center">
            Import Backup
            <input
              accept="application/json,.json"
              className="sr-only"
              onChange={handleImportFileChange}
              type="file"
            />
          </label>
          <button className="secondary-button" onClick={onLoadSample} type="button">
            Load sample products
          </button>
          <button className="danger-button" onClick={onClearAll} type="button">
            Clear all data
          </button>
        </div>
      </div>

      {pendingImportFile && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#f5f1e8]/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
          <div className="w-full rounded-[26px] bg-white p-4 shadow-2xl shadow-zinc-950/20 sm:max-w-md">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">Import Backup</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Importing will replace current local data. Continue?
                </p>
                <p className="mt-2 truncate text-xs font-semibold text-zinc-500">
                  {pendingImportFile.name}
                </p>
              </div>
              <button
                aria-label="Cancel import"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600"
                onClick={() => setPendingImportFile(null)}
                type="button"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            {importError && (
              <p className="mb-3 rounded-2xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                {importError}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="secondary-button h-11"
                disabled={isImporting}
                onClick={() => setPendingImportFile(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button h-11"
                disabled={isImporting}
                onClick={confirmImport}
                type="button"
              >
                {isImporting ? 'Importing...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="fixed inset-0 z-50 flex items-end bg-[#f5f1e8]/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
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
  const productModalInputStyle = {
    fontSize: 14,
    height: 48,
    padding: '0 14px',
  }
  const productModalLabelStyle = {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 6,
  }
  const productModalButtonStyle = {
    fontSize: 14,
    fontWeight: 700,
    height: 50,
  }

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
    <div className="fixed inset-0 z-50 flex items-end bg-[#f5f1e8]/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <form
        className="max-h-[92vh] w-full overflow-y-auto rounded-[26px] bg-white p-4 shadow-2xl shadow-zinc-950/20 sm:max-w-md"
        onSubmit={handleSubmit}
        style={{ borderRadius: 24, maxWidth: 480, padding: 20 }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500">Product</p>
            <h2 className="tracking-tight" style={{ fontSize: 18, fontWeight: 800 }}>
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

        <div className="grid" style={{ gap: 16 }}>
          <Field label="Product Name" labelStyle={productModalLabelStyle}>
            <input
              className="field-input"
              onChange={(event) => updateField('name', event.target.value)}
              required
              style={productModalInputStyle}
              value={form.name}
            />
          </Field>
          <Field label="Category" labelStyle={productModalLabelStyle}>
            <select
              className="field-input"
              onChange={(event) => handleCategoryChange(event.target.value)}
              required
              style={productModalInputStyle}
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
            <Field label="New Category Name" labelStyle={productModalLabelStyle}>
              <input
                className="field-input"
                onChange={(event) => updateField('category', event.target.value)}
                placeholder="New Category Name"
                required
                style={productModalInputStyle}
                value={form.category}
              />
            </Field>
          )}
          <Field label="Cost Price" labelStyle={productModalLabelStyle}>
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('costPrice', event.target.value)}
              step="0.01"
              style={productModalInputStyle}
              type="number"
              value={form.costPrice}
            />
          </Field>
          <Field label="Selling Price" labelStyle={productModalLabelStyle}>
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('sellingPrice', event.target.value)}
              step="0.01"
              style={productModalInputStyle}
              type="number"
              value={form.sellingPrice}
            />
          </Field>
          <Field label="Stock Qty" labelStyle={productModalLabelStyle}>
            <input
              className="field-input"
              min="0"
              onChange={(event) => updateField('stockQty', event.target.value)}
              style={productModalInputStyle}
              type="number"
              value={form.stockQty}
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="secondary-button flex-1"
            onClick={onClose}
            style={productModalButtonStyle}
            type="button"
          >
            Cancel
          </button>
          <button className="primary-button flex-1" style={productModalButtonStyle} type="submit">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
function MetricCard({ icon: Icon, label, onClick, tone = 'zinc', value }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-100',
    zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  }
  const Component = onClick ? 'button' : 'article'

  return (
    <Component
      className={`glass-card group min-h-[74px] p-2 text-left sm:p-2.5 ${
        onClick ? 'w-full transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-zinc-200' : ''
      }`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold leading-tight text-zinc-500">{label}</p>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 ${tones[tone]}`}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-1.5 break-words text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
        {value}
      </div>
    </Component>
  )
}

function Field({ children, label, labelStyle }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600" style={labelStyle}>
        {label}
      </span>
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
            : 'bg-[#f5f1e8]/92 text-[var(--text-main)] shadow-zinc-950/20 ring-white/10'
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

function normalizeBackupData(backup) {
  if (!backup || typeof backup !== 'object') return null

  const products = Array.isArray(backup.products) ? backup.products : null
  const stockChecks = Array.isArray(backup.stockChecks) ? backup.stockChecks : null
  const stockInRecordsSource = backup.stockInHistory ?? backup.stockInRecords ?? backup.stockIn
  const stockInRecords = Array.isArray(stockInRecordsSource) ? stockInRecordsSource : null

  if (!products || !stockChecks || !stockInRecords) return null

  return {
    products: products.map((product) => normalizeProduct(product || {})),
    stockChecks,
    stockInRecords,
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

function buildStockCheckRow(product, count = {}) {
  const displayQty = Number(count.displayQty) || 0
  const storeQty = Number(count.storeQty) || 0
  const systemQty = Number(count.systemQty ?? product.stockQty) || 0
  const physicalQty = displayQty + storeQty

  return {
    costPrice: product.costPrice,
    countedStock: physicalQty,
    difference: physicalQty - systemQty,
    displayQty,
    physicalQty,
    previousStock: systemQty,
    productId: product.id,
    productName: product.name,
    recordId: count.recordId,
    sellingPrice: product.sellingPrice,
    storeQty,
    systemQty,
  }
}

function buildStockCheckRecord({ checkedAt, currentUserRole, id, row }) {
  const displayQty = Number(row.displayQty) || 0
  const storeQty = Number(row.storeQty) || 0
  const systemQty = Number(row.systemQty ?? row.previousStock) || 0
  const physicalQty = Number(row.physicalQty ?? row.countedStock) || 0
  const difference = physicalQty - systemQty
  const soldQty = Math.max(0, -difference)
  const addedQty = Math.max(0, difference)
  const salesValue = soldQty * (Number(row.sellingPrice) || 0)
  const costValue = soldQty * (Number(row.costPrice) || 0)
  const profit = soldQty > 0 ? salesValue - costValue : 0

  return {
    id,
    addedQty,
    checkedAt: new Date().toISOString(),
    checkedBy: currentUserRole,
    costValue,
    countedStock: physicalQty,
    date: checkedAt,
    difference,
    displayQty,
    note: 'Stock check',
    physicalQty,
    previousStock: systemQty,
    productId: row.productId,
    productName: row.productName,
    profit,
    salesValue,
    soldQty,
    storeQty,
    systemQty,
    type: 'stock-check',
  }
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
      const costPrice = Number(product.costPrice) || 0
      const sellingPrice = Number(product.sellingPrice) || 0
      const lastSoldDate = lastSoldByProduct.get(product.id)
      const daysWithoutSale = lastSoldDate
        ? Math.max(0, Math.floor((today - new Date(`${lastSoldDate}T00:00:00`)) / 86400000))
        : deadStockDays
      const costValueFrozen = currentStock * costPrice
      const potentialValueFrozen = currentStock * sellingPrice

      return {
        category: product.category,
        costValueFrozen,
        currentStock,
        daysWithoutSale,
        daysSinceLastSaleLabel: lastSoldDate ? `${daysWithoutSale} Days Ago` : `${deadStockDays}+ Days`,
        daysWithoutSaleLabel: lastSoldDate ? `${daysWithoutSale} Days Ago` : `${deadStockDays}+ Days`,
        lastSoldDate,
        lastSoldLabel: lastSoldDate ? formatDate(lastSoldDate) : 'Never',
        potentialValueFrozen,
        productId: product.id,
        productName: product.name,
        saleValue: sellingPrice,
      }
    })
    .filter((item) => item.currentStock > 0)
    .filter((item) => !item.lastSoldDate || item.daysWithoutSale >= deadStockDays)
    .sort((a, b) => b.costValueFrozen - a.costValueFrozen)
}

function buildDeadStockSummary(items, totalInventoryCostValue) {
  const lockedValue = items.reduce(
    (total, item) => total + (Number(item.costValueFrozen) || 0),
    0,
  )
  const lockedPercentage = totalInventoryCostValue
    ? (lockedValue / totalInventoryCostValue) * 100
    : 0

  return {
    lockedPercentage,
    lockedValue,
    products: items.length,
  }
}

function getDeadStockStatus(lockedPercentage) {
  if (lockedPercentage >= 30) return { label: 'Critical', tone: 'rose' }
  if (lockedPercentage >= 20) return { label: 'High', tone: 'orange' }
  if (lockedPercentage >= 10) return { label: 'Watch', tone: 'yellow' }
  return { label: 'Healthy', tone: 'emerald' }
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

function getSuppliers(products) {
  return [...new Set(products.map((item) => item.supplier).filter(Boolean))].sort()
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBackupTimestamp(value) {
  if (!value) return 'Never'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(',', '')
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase())
}

function formatProductUpdatedAt(value) {
  const daysOld = getProductUpdatedDaysOld(value)
  if (daysOld === null) return 'Not updated yet'
  if (daysOld === 0) return 'Updated today'
  if (daysOld === 1) return 'Last updated: 1 day ago'
  return `Last updated: ${daysOld} days ago`
}

function getProductUpdatedAtState(value) {
  const daysOld = getProductUpdatedDaysOld(value)
  if (daysOld === null) return 'default'
  if (daysOld < 10) return 'fresh'
  if (daysOld >= 10 && daysOld <= 20) return 'warning'
  return 'expired'
}

function isProductInUpdatedAtFilter(product, activeFilter) {
  const daysOld = getProductUpdatedDaysOld(product.updatedAt)

  if (activeFilter === 'all') return true
  if (activeFilter === '10days') return daysOld !== null && daysOld <= 10
  if (activeFilter === '20days') return daysOld !== null && daysOld > 10 && daysOld <= 20
  if (activeFilter === '30days') return daysOld !== null && daysOld > 20 && daysOld <= 30
  return true
}

function buildDashboardSummary({ products, stockChecks, stockInRecords }) {
  const productsById = new Map(products.map((product) => [product.id, product]))
  const productValues = products.map((product) => {
    const currentStock = getProductCurrentStock(product)
    const costPrice = Number(product.costPrice) || 0

    return {
      id: product.id,
      name: product.name,
      stockQty: currentStock,
      stockValue: currentStock * costPrice,
      updatedAt: product.updatedAt,
    }
  })
  const totals = productValues.reduce(
    (current, item) => {
      current.totalStockValue += item.stockValue
      return current
    },
    {
      totalProducts: products.length,
      totalStockQty: products.reduce((total, product) => total + getProductCurrentStock(product), 0),
      totalStockValue: 0,
    },
  )
  const windows = {
    last10Days: { inValue: 0, outValue: 0 },
    thisMonth: { inValue: 0, outValue: 0 },
  }

  getStockValueEntries({ productsById, stockChecks, stockInRecords }).forEach((entry) => {
    if (isWithinLastDays(entry.timestamp, 10)) {
      if (entry.quantityChange > 0) {
        windows.last10Days.inValue += entry.value
      } else {
        windows.last10Days.outValue += entry.value
      }
    }

    if (isCurrentMonth(entry.timestamp)) {
      if (entry.quantityChange > 0) {
        windows.thisMonth.inValue += entry.value
      } else {
        windows.thisMonth.outValue += entry.value
      }
    }
  })

  return {
    ...totals,
    ...windows,
    recentEntries: getStockValueEntries({ productsById, stockChecks, stockInRecords })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10),
    topValueProducts: productValues
      .filter((product) => product.stockValue > 0)
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 10)
  }
}

function getStockValueEntries({ productsById, stockChecks, stockInRecords }) {
  const stockInEntries = stockInRecords.map((record) => {
    const product = productsById.get(record.productId)
    const quantityChange = Number(record.quantityAdded) || 0
    const costPrice = Number(record.purchaseCost ?? record.price ?? product?.costPrice) || 0
    const timestamp = getStockEntryTimestamp(record)

    return {
      action: 'Stock In',
      currentStock: getProductCurrentStock(product || {}),
      id: `stock-in-${record.id}`,
      productId: record.productId,
      productName: record.productName || product?.name || 'Unknown product',
      quantityChange,
      timestamp,
      updatedLabel: formatDashboardEntryUpdatedAt(timestamp),
      updatedState: getDashboardEntryUpdatedState(timestamp),
      value: Math.abs(quantityChange) * costPrice,
    }
  })
  const stockCheckEntries = stockChecks.map((record) => {
    const product = productsById.get(record.productId)
    const previousStock = Number(record.systemQty ?? record.previousStock) || 0
    const countedStock = Number(record.countedStock ?? record.physicalQty) || 0
    const quantityChange = countedStock - previousStock
    const costPrice = Number(record.costPrice ?? product?.costPrice) || 0
    const timestamp = getStockEntryTimestamp(record)

    return {
      action: quantityChange > 0 ? 'Stock In' : 'Stock Out',
      currentStock: countedStock,
      id: `stock-check-${record.id}`,
      productId: record.productId,
      productName: record.productName || product?.name || 'Unknown product',
      quantityChange,
      timestamp,
      updatedLabel: formatDashboardEntryUpdatedAt(timestamp),
      updatedState: getDashboardEntryUpdatedState(timestamp),
      value: Math.abs(quantityChange) * costPrice,
    }
  })

  return [...stockInEntries, ...stockCheckEntries].filter(
    (entry) => entry.quantityChange !== 0 && entry.timestamp.getTime() > 0,
  )
}

function getProductCurrentStock(product) {
  return Number(product.currentStock ?? product.stockQty) || 0
}

function getProductDashboardTrend(product, entries) {
  const latestEntry = entries.find((entry) => entry.productName === product.name)
  if (!latestEntry) return { direction: 'flat', label: '-' }

  const quantityChange = Number(latestEntry.quantityChange) || 0
  if (quantityChange === 0) return { direction: 'flat', label: '-' }

  const baseline = Math.max(1, Math.abs(product.stockQty - quantityChange), Math.abs(product.stockQty))
  const percentage = Math.min(99.9, (Math.abs(quantityChange) / baseline) * 100)

  return {
    direction: quantityChange > 0 ? 'up' : 'down',
    label: `${quantityChange > 0 ? '+' : '-'}${percentage.toFixed(1)}%`,
  }
}

function isWithinLastDays(value, days) {
  const date = parseTimestamp(value)
  if (!date) return false
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000
}

function isCurrentMonth(value) {
  const date = parseTimestamp(value)
  const now = new Date()
  if (!date) return false
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function getStockEntryTimestamp(record) {
  return (
    parseTimestamp(record.updatedAt) ||
    parseTimestamp(record.createdAt) ||
    parseTimestamp(record.checkedAt) ||
    parseTimestamp(record.savedAt) ||
    parseTimestamp(record.date) ||
    new Date(0)
  )
}

function formatDashboardEntryUpdatedAt(value) {
  const daysOld = getProductUpdatedDaysOld(value)
  if (daysOld === null) return 'No date'
  if (daysOld === 0) return 'Updated today'
  if (daysOld === 1) return '1 day ago'
  return `${daysOld} days ago`
}

function getDashboardEntryUpdatedState(value) {
  const daysOld = getProductUpdatedDaysOld(value)
  if (daysOld === null) return 'default'
  if (daysOld < 10) return 'fresh'
  if (daysOld >= 10 && daysOld <= 20) return 'warning'
  return 'expired'
}

function getProductUpdatedDaysOld(value) {
  const date = parseTimestamp(value)
  if (!date) return null
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function parseTimestamp(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value.toDate) {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value.seconds === 'number') {
    const date = new Date(value.seconds * 1000)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatRM(value) {
  return new Intl.NumberFormat('en-MY', {
    currency: 'MYR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(Number(value) || 0)
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-MY').format(Number(value) || 0)
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

function formatCompactPercent(value) {
  return `${new Intl.NumberFormat('en-MY', {
    maximumFractionDigits: 1,
  }).format(Number(value) || 0)}%`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export default App
