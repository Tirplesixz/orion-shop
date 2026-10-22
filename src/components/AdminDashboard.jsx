import { useEffect, useMemo, useState } from 'react'
import '../admin.css'
import { LanguageSwitch, useLanguage } from '../i18n'

const TOKEN_KEY = 'orion_admin_token'
const adminOriginalText = new WeakMap()
const ADMIN_THAI = {
  'Overview':'ภาพรวม','Products':'สินค้า','Orders':'คำสั่งซื้อ','Inventory':'คลังสินค้า','Customers':'ลูกค้า','Coupons':'คูปอง','Returns':'การคืนสินค้า','Analytics':'รายงาน','Settings':'ตั้งค่า','Revenue':'รายได้','Stock alerts':'แจ้งเตือนสต็อก','Recorded order value':'มูลค่าคำสั่งซื้อ','Private clients':'ลูกค้าสมาชิก','Latest activity':'กิจกรรมล่าสุด','Recent orders':'คำสั่งซื้อล่าสุด','View all':'ดูทั้งหมด','Store health':'สถานะร้านค้า','pieces currently live':'สินค้าที่เผยแพร่','Review inventory':'ตรวจสอบคลังสินค้า','Catalogue':'แค็ตตาล็อก','Published':'เผยแพร่แล้ว','In progress':'กำลังจัดทำ','Archive':'คลังเก็บ','Total pieces':'สินค้าทั้งหมด','Draft pieces':'ฉบับร่าง','Hidden from storefront':'ซ่อนจากหน้าร้าน','Collection catalogue':'แค็ตตาล็อกคอลเลกชัน','All pieces':'สินค้าทั้งหมด','Piece':'สินค้า','Price':'ราคา','Status':'สถานะ','Actions':'การจัดการ','Edit':'แก้ไข','Publish':'เผยแพร่','Nothing found':'ไม่พบข้อมูล','Clear filters':'ล้างตัวกรอง','Shipping & tracking':'การจัดส่งและติดตาม','Carrier':'บริษัทขนส่ง','Tracking number':'หมายเลขติดตาม','Tracking URL':'ลิงก์ติดตาม','Shipment status':'สถานะจัดส่ง','Save tracking':'บันทึกการจัดส่ง','Payment':'การชำระเงิน','Available':'พร้อมขาย','Low at':'แจ้งเตือนเมื่อเหลือ','Save':'บันทึก','New incentive':'สร้างสิทธิพิเศษ','Create coupon':'สร้างคูปอง','Code':'รหัส','Type':'ประเภท','Value':'มูลค่า','Minimum subtotal':'ยอดขั้นต่ำ','Available codes':'คูปองทั้งหมด','No return requests.':'ยังไม่มีคำขอคืนสินค้า','Top products':'สินค้ายอดนิยม','Audit trail':'ประวัติการจัดการ','Edit piece':'แก้ไขสินค้า','New piece':'สินค้าใหม่','Create product':'สร้างสินค้า','Product name':'ชื่อสินค้า','Collection':'คอลเลกชัน','Editorial label':'ข้อความกำกับ','Description':'รายละเอียด','Price (THB)':'ราคา (บาท)','Price label':'ข้อความราคา','Status':'สถานะ','Campaign image':'ภาพแคมเปญ','Product views':'ภาพสินค้า','Display theme':'ธีมการแสดงผล','Cancel':'ยกเลิก','Save product':'บันทึกสินค้า','Sign out':'ออกจากระบบ','System online':'ระบบออนไลน์'
}

function useAdminTranslation(language) {
  useEffect(() => {
    const translate = (root = document.body) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const raw = adminOriginalText.get(node) || node.nodeValue
        const key = raw.trim()
        if (!adminOriginalText.has(node) && ADMIN_THAI[key]) adminOriginalText.set(node, raw)
        if (language === 'th' && ADMIN_THAI[key]) node.nodeValue = raw.replace(key, ADMIN_THAI[key])
        else if (language === 'en' && adminOriginalText.has(node)) node.nodeValue = adminOriginalText.get(node)
      }
    }
    translate()
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node.nodeType === 1 && translate(node))))
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [language])
}
const VIEW_SLOTS = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'right', label: 'Right' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
]

const slugify = (value) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

async function apiRequest(path, { token, ...options } = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(document.documentElement.lang === 'th' ? ({'Owner permission required.':'ต้องใช้สิทธิ์เจ้าของระบบ','Manager permission required.':'ต้องใช้สิทธิ์ผู้จัดการ','SMTP credentials are not configured.':'ยังไม่ได้ตั้งค่าข้อมูล SMTP','Request failed.':'ไม่สามารถดำเนินการได้'})[payload?.error || 'Request failed.'] || payload?.error || 'ไม่สามารถดำเนินการได้' : payload?.error || 'Request failed.')
  return payload
}

function Icon({ name, size = 16 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    bag: <><path d="M6 8h12l1 13H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" /></>,
    archive: <><path d="M4 7h16v14H4V7Z" /><path d="M2 3h20v4H2V3ZM9 11h6" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h7v18h-7" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
  }
  return <svg className="admin-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Login({ onAuthenticated }) {
  const { language } = useLanguage()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const login = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await apiRequest('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      sessionStorage.setItem(TOKEN_KEY, result.token)
      onAuthenticated(result.token)
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="admin-login-shell">
      <section className="admin-login-panel">
        <a href="/" className="admin-wordmark">ORION</a>
        <div className="admin-login-copy">
          <p>{language === 'th' ? 'ระบบจัดการร้านค้า' : 'Private administration'}</p>
          <h1>{language === 'th' ? 'จัดการ' : 'Collection'}<br />{language === 'th' ? 'คอลเลกชัน' : 'control.'}</h1>
          <span>{language === 'th' ? 'จัดการสินค้า รูปภาพ สต็อก และการแสดงผลหน้าร้าน' : 'Manage pieces, imagery and storefront visibility.'}</span>
        </div>
        <form onSubmit={login} className="admin-login-form">
          <label>
            {language === 'th' ? 'ชื่อผู้ใช้' : 'Username'}
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            {language === 'th' ? 'รหัสผ่าน' : 'Password'}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit" disabled={submitting}>{submitting ? (language === 'th' ? 'กำลังเข้าสู่ระบบ...' : 'Entering...') : (language === 'th' ? 'เข้าสู่หลังบ้าน' : 'Enter dashboard')}</button>
          <p className="admin-form-message" aria-live="polite">{error}</p>
        </form>
      </section>
    </main>
  )
}

function ProductEditor({ product, token, onClose, onSaved }) {
  const existingViews = new Map(product?.images?.map((image) => [image.id, image]) || [])
  const [form, setForm] = useState(() => ({
    name: product?.name || '',
    nameTh: product?.nameTh || '',
    slug: product?.slug || '',
    collection: product?.collection || 'Collection 01',
    eyebrow: product?.eyebrow || 'ORION / Signature piece',
    description: product?.description || '',
    descriptionTh: product?.descriptionTh || '',
    material: product?.material || '',
    materialTh: product?.materialTh || '',
    care: product?.care || '',
    careTh: product?.careTh || '',
    fit: product?.fit || '',
    fitTh: product?.fitTh || '',
    category: product?.category || 'Outerwear',
    categoryTh: product?.categoryTh || 'เสื้อคลุม',
    sortOrder: product?.sortOrder ?? 0,
    weightGrams: product?.weightGrams ?? 0,
    fulfillmentType: product?.fulfillmentType || 'ready',
    sizeGuide: product?.sizeGuide?.map((row) => `${row.size}:${row.chest}:${row.length}`).join('\n') || 'S:92–96:105\nM:97–102:107\nL:103–108:109\nXL:109–116:111',
    price: product?.price ?? '',
    priceLabel: product?.priceLabel || 'Price on request',
    currency: product?.currency || 'THB',
    status: product?.status || 'active',
    sizes: product?.variants?.map((variant) => [variant.label,variant.color,variant.colorTh,variant.colorHex,variant.barcode,(variant.images || []).map((image)=>image.src).join(';')].map((value)=>value ?? '').join('|')).join('\n') || 'S|Blue|น้ำเงิน|#234a78||\nM|Blue|น้ำเงิน|#234a78||',
    canvas: product?.theme?.canvas || '#07101d',
    glow: product?.theme?.glow || 'rgba(67, 111, 173, 0.5)',
    accent: product?.theme?.accent || '#c7a566',
    campaignImage: product?.campaignImage || { src: '', alt: '' },
    images: VIEW_SLOTS.map((slot) => existingViews.get(slot.id) || {
      id: slot.id,
      label: slot.label,
      src: '',
      alt: '',
    }),
  }))
  const [campaignFile, setCampaignFile] = useState(null)
  const [viewFiles, setViewFiles] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const updateName = (name) => {
    setForm((current) => ({
      ...current,
      name,
      slug: !product && (!current.slug || current.slug === slugify(current.name)) ? slugify(name) : current.slug,
    }))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const variants = form.sizes.split(/\n|,/)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row, index) => { const [label,color='',colorTh='',colorHex='#111111',barcode='',imageUrls=''] = row.split('|').map((value) => value.trim()); return { id: slugify(`${label}-${color}`) || `variant-${index + 1}`, label, color, colorTh, colorHex, barcode: barcode || null, images: imageUrls ? imageUrls.split(';').filter(Boolean).map((src,imageIndex)=>({id:`variant-${index}-${imageIndex}`,label:`${color} ${imageIndex+1}`,src,alt:`${form.name} ${color}`})) : null, available: true } })
      const productPayload = {
        ...product,
        name: form.name,
        nameTh: form.nameTh,
        slug: form.slug,
        collection: form.collection,
        eyebrow: form.eyebrow,
        description: form.description,
        descriptionTh: form.descriptionTh,
        material: form.material,
        materialTh: form.materialTh,
        care: form.care,
        careTh: form.careTh,
        fit: form.fit,
        fitTh: form.fitTh,
        category: form.category,
        categoryTh: form.categoryTh,
        sortOrder: Number(form.sortOrder),
        weightGrams: Number(form.weightGrams),
        fulfillmentType: form.fulfillmentType,
        sizeGuide: form.sizeGuide.split('\n').map((row) => row.split(':')).filter((row) => row.length >= 3).map(([size, chest, length]) => ({ size: size.trim(), chest: chest.trim(), length: length.trim() })),
        price: form.price,
        priceLabel: form.priceLabel,
        currency: form.currency,
        status: form.status,
        theme: { canvas: form.canvas, glow: form.glow, accent: form.accent },
        campaignImage: form.campaignImage,
        images: form.images,
        variants,
      }
      const body = new FormData()
      body.append('product', JSON.stringify(productPayload))
      if (campaignFile) body.append('campaign', campaignFile)
      Object.entries(viewFiles).forEach(([index, file]) => body.append(`image-${index}`, file))
      const result = await apiRequest(
        product ? `/api/admin/products/${product.id}` : '/api/admin/products',
        { token, method: product ? 'PATCH' : 'POST', body },
      )
      onSaved(result.product)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <header>
          <div><p>{product ? 'Edit piece' : 'New piece'}</p><h2 id="product-editor-title">{product?.name || 'Create product'}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close editor">Close</button>
        </header>
        <form onSubmit={save}>
          <div className="admin-form-grid">
            <label className="admin-field-wide">Product name<input required value={form.name} onChange={(event) => updateName(event.target.value)} /></label>
            <label className="admin-field-wide">ชื่อสินค้าภาษาไทย<input required value={form.nameTh} onChange={(event) => update('nameTh', event.target.value)} /></label>
            <label>Slug<input required value={form.slug} onChange={(event) => update('slug', slugify(event.target.value))} /></label>
            <label>Collection<input value={form.collection} onChange={(event) => update('collection', event.target.value)} /></label>
            <label className="admin-field-wide">Editorial label<input value={form.eyebrow} onChange={(event) => update('eyebrow', event.target.value)} /></label>
            <label className="admin-field-wide">Description<textarea rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
            <label className="admin-field-wide">รายละเอียดภาษาไทย<textarea rows="3" value={form.descriptionTh} onChange={(event) => update('descriptionTh', event.target.value)} /></label>
            <label className="admin-field-wide">Material<textarea rows="2" value={form.material} onChange={(event) => update('material', event.target.value)} placeholder="Materials and lining" /></label>
            <label className="admin-field-wide">วัสดุภาษาไทย<textarea rows="2" value={form.materialTh} onChange={(event) => update('materialTh', event.target.value)} /></label>
            <label className="admin-field-wide">Fit notes<textarea rows="2" value={form.fit} onChange={(event) => update('fit', event.target.value)} placeholder="Fit, silhouette and sizing advice" /></label>
            <label className="admin-field-wide">คำแนะนำทรงภาษาไทย<textarea rows="2" value={form.fitTh} onChange={(event) => update('fitTh', event.target.value)} /></label>
            <label className="admin-field-wide">Care instructions<textarea rows="2" value={form.care} onChange={(event) => update('care', event.target.value)} placeholder="Cleaning and storage" /></label>
            <label className="admin-field-wide">วิธีดูแลภาษาไทย<textarea rows="2" value={form.careTh} onChange={(event) => update('careTh', event.target.value)} /></label>
            <label>Category<input value={form.category} onChange={(event) => update('category', event.target.value)} /></label><label>หมวดหมู่ภาษาไทย<input value={form.categoryTh} onChange={(event) => update('categoryTh', event.target.value)} /></label>
            <label>Display order<input type="number" value={form.sortOrder} onChange={(event) => update('sortOrder', event.target.value)} /></label><label>Weight (grams)<input type="number" min="0" value={form.weightGrams} onChange={(event) => update('weightGrams', event.target.value)} /></label>
            <label>Fulfilment<select value={form.fulfillmentType} onChange={(event) => update('fulfillmentType', event.target.value)}><option value="ready">Ready to ship</option><option value="preorder">Pre-order</option></select></label>
            <label className="admin-field-wide">Size guide <small>One row per size: SIZE:CHEST CM:LENGTH CM</small><textarea rows="4" value={form.sizeGuide} onChange={(event) => update('sizeGuide', event.target.value)} /></label>
            <label>Price (THB)<input type="number" min="0" value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="Leave empty" /></label>
            <label>Price label<input value={form.priceLabel} onChange={(event) => update('priceLabel', event.target.value)} /></label>
            <label className="admin-field-wide">Variants <small>One row: size | colour EN | สีไทย | #HEX | barcode | image URL 1; image URL 2</small><textarea rows="5" value={form.sizes} onChange={(event) => update('sizes', event.target.value)} /></label>
            <label>Status<select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          </div>

          <fieldset className="admin-media-fields">
            <legend>Campaign image</legend>
            <div className="admin-upload-row">
              {form.campaignImage.src && <img src={form.campaignImage.src} alt="Current campaign" />}
              <label><span>{campaignFile?.name || (form.campaignImage.src ? 'Replace image' : 'Choose image')}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => setCampaignFile(event.target.files[0] || null)} /></label>
            </div>
          </fieldset>

          <fieldset className="admin-media-fields">
            <legend>Product views</legend>
            <div className="admin-view-uploads">
              {form.images.map((image, index) => (
                <label key={image.id}>
                  {image.src ? <img src={image.src} alt="" /> : <span className="admin-view-placeholder">{image.label}</span>}
                  <strong>{image.label}</strong>
                  <small>{viewFiles[index]?.name || (image.src ? 'Replace' : 'Upload')}</small>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => setViewFiles((current) => ({ ...current, [index]: event.target.files[0] }))} />
                </label>
              ))}
            </div>
          </fieldset>

          <details className="admin-theme-fields">
            <summary>Display theme</summary>
            <div>
              <label>Canvas<input type="color" value={form.canvas} onChange={(event) => update('canvas', event.target.value)} /></label>
              <label>Accent<input type="color" value={form.accent} onChange={(event) => update('accent', event.target.value)} /></label>
              <label>Glow<input value={form.glow} onChange={(event) => update('glow', event.target.value)} /></label>
            </div>
          </details>

          <footer>
            <p className="admin-form-message" aria-live="polite">{error}</p>
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save product'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

const formatMoney = (value) => new Intl.NumberFormat('th-TH', {
  style: 'currency', currency: 'THB', maximumFractionDigits: 0,
}).format(Number(value || 0))

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value)) : '—'

function OverviewView({ overview, onNavigate }) {
  const metrics = overview.metrics || {}
  return <>
    <div className="admin-summary admin-overview-summary">
      <article><div><span>Revenue</span><i>01</i></div><strong>{formatMoney(metrics.revenue)}</strong><small>Recorded order value</small></article>
      <article><div><span>Orders</span><i>02</i></div><strong>{metrics.orders || 0}</strong><small>{metrics.newOrders || 0} awaiting review</small></article>
      <article><div><span>Customers</span><i>03</i></div><strong>{metrics.customers || 0}</strong><small>Private clients</small></article>
      <article><div><span>Stock alerts</span><i>04</i></div><strong>{metrics.lowStock || 0}</strong><small>{metrics.unitsInStock || 0} units available</small></article>
    </div>
    <div className="admin-overview-grid">
      <section><div className="admin-panel-heading"><div><p>Latest activity</p><h2>Recent orders</h2></div><button type="button" onClick={() => onNavigate('orders')}>View all <Icon name="arrow" /></button></div>
        <div className="admin-recent-orders">{(overview.recentOrders || []).map((order) => <article key={order.id}><span>{order.orderNumber}</span><div><strong>{order.customer?.name}</strong><small>{order.items?.length || 0} pieces · {formatDate(order.createdAt)}</small></div><b>{formatMoney(order.total)}</b><em className={`admin-order-status is-${order.status}`}>{order.status}</em></article>)}{!overview.recentOrders?.length && <p className="admin-panel-empty">New orders will appear here.</p>}</div>
      </section>
      <aside className="admin-health-card"><p>Store health</p><h3>{metrics.activeProducts || 0}<span> / {metrics.products || 0}</span></h3><strong>pieces currently live</strong><div><i style={{ '--health': `${metrics.products ? (metrics.activeProducts / metrics.products) * 100 : 0}%` }} /></div><button type="button" onClick={() => onNavigate('inventory')}>Review inventory <Icon name="arrow" /></button></aside>
    </div>
  </>
}

function ShipmentEditor({ order, onSave }) {
  const [form, setForm] = useState({ carrier: order.shipment?.carrier || 'Manual', trackingNumber: order.shipment?.trackingNumber || '', trackingUrl: order.shipment?.trackingUrl || '', status: order.shipment?.status || 'pending' })
  return <details className="admin-shipment-editor"><summary>Shipping & tracking</summary><div><label>Carrier<input value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} /></label><label>Tracking number<input value={form.trackingNumber} onChange={(event) => setForm({ ...form, trackingNumber: event.target.value })} /></label><label>Tracking URL<input value={form.trackingUrl} onChange={(event) => setForm({ ...form, trackingUrl: event.target.value })} /></label><label>Shipment status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{['pending','ready','shipped','delivered','returned'].map((status) => <option key={status}>{status}</option>)}</select></label><button type="button" onClick={() => onSave(order.id, form)}>Save tracking</button></div></details>
}

function OrdersView({ orders, onUpdate, onShipment }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const visible = orders.filter((order) => (filter === 'all' || order.status === filter) && `${order.orderNumber} ${order.customer?.name} ${order.customer?.email}`.toLowerCase().includes(query.toLowerCase()))
  return <>
    <div className="admin-toolbar admin-orders-toolbar"><label className="admin-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or customer" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{['new','confirmed','processing','shipped','completed','cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div>
    <div className="admin-orders-list">{visible.map((order) => <article key={order.id}>
      <div className="admin-order-identity"><span>{order.orderNumber}</span><strong>{order.customer?.name}</strong><small>{order.customer?.email} · {formatDate(order.createdAt)}</small></div>
      <div className="admin-order-items">{order.items?.slice(0, 3).map((item) => <img key={`${item.productId}-${item.variantId}`} src={item.image} alt="" />)}<span>{order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} units</span></div>
      <div className="admin-order-total"><strong>{formatMoney(order.total)}</strong><span className={`admin-payment is-${order.paymentStatus}`}>{order.paymentStatus}</span></div>
      <label>Status<select value={order.status} disabled={order.status === 'cancelled'} onChange={(event) => onUpdate(order.id, { status: event.target.value })}>{['new','confirmed','processing','shipped','completed','cancelled'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Payment<select value={order.paymentStatus} onChange={(event) => onUpdate(order.id, { paymentStatus: event.target.value })}>{['unpaid','review','paid','refunded'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <ShipmentEditor order={order} onSave={onShipment} />
    </article>)}{!visible.length && <p className="admin-panel-empty">No orders match this view.</p>}</div>
  </>
}

function InventoryView({ inventory, onSave }) {
  const [drafts, setDrafts] = useState({})
  const valueFor = (item, key) => drafts[item.id]?.[key] ?? item[key]
  const change = (item, key, value) => setDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [key]: value } }))
  return <div className="admin-inventory-list">
    <div className="admin-inventory-labels"><span>Piece / Variant</span><span>SKU</span><span>Stock / Held</span><span>Unit cost</span><span>Low at</span><span /></div>
    {inventory.map((item) => <article className={item.stock <= item.lowStockThreshold ? 'is-low' : ''} key={item.id}>
      <div><strong>{item.productName}</strong><span>{item.variantLabel}</span></div>
      <input value={valueFor(item, 'sku')} onChange={(event) => change(item, 'sku', event.target.value)} aria-label={`SKU for ${item.productName} ${item.variantLabel}`} />
      <label className="admin-stock-cell"><input type="number" min="0" value={valueFor(item, 'stock')} onChange={(event) => change(item, 'stock', event.target.value)} aria-label={`Stock for ${item.productName} ${item.variantLabel}`} /><small>{item.reserved} held · {item.available} available</small></label>
      <input type="number" min="0" value={valueFor(item, 'unitCost') ?? ''} onChange={(event) => change(item, 'unitCost', event.target.value)} aria-label={`Unit cost for ${item.productName} ${item.variantLabel}`} placeholder="Cost" />
      <input type="number" min="0" value={valueFor(item, 'lowStockThreshold')} onChange={(event) => change(item, 'lowStockThreshold', event.target.value)} aria-label={`Low stock threshold for ${item.productName} ${item.variantLabel}`} />
      <button type="button" disabled={!drafts[item.id]} onClick={async () => { await onSave(item.id, drafts[item.id]); setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next }) }}>Save</button>
    </article>)}
  </div>
}

function CustomersView({ customers }) {
  return <div className="admin-customers-grid">{customers.map((customer, index) => <article key={customer.email}><span>{String(index + 1).padStart(2, '0')}</span><div className="admin-customer-avatar">{customer.name?.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><strong>{customer.name}</strong><small>{customer.email}<br />{customer.phone}</small></div><div><strong>{customer.orders}</strong><small>Orders</small></div><div><strong>{formatMoney(customer.totalSpent)}</strong><small>Total value</small></div><time>{formatDate(customer.lastOrderAt)}</time></article>)}{!customers.length && <p className="admin-panel-empty">Customer profiles are created from completed checkouts.</p>}</div>
}

function CouponsView({ coupons, onCreate, onToggle }) {
  const [form, setForm] = useState({ code: '', type: 'percent', value: 10, minSubtotal: 0 })
  return <div className="admin-operations-grid"><form className="admin-coupon-form" onSubmit={(event) => { event.preventDefault(); onCreate(form); setForm({ code: '', type: 'percent', value: 10, minSubtotal: 0 }) }}><p>New incentive</p><h2>Create coupon</h2><label>Code<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><div><label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed THB</option></select></label><label>Value<input type="number" min="0" required value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></label></div><label>Minimum subtotal<input type="number" min="0" value={form.minSubtotal} onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })} /></label><button type="submit">Create coupon</button></form><section className="admin-coupon-list"><p>Available codes</p>{coupons.map((coupon) => <article key={coupon.id}><div><strong>{coupon.code}</strong><span>{coupon.type === 'percent' ? `${coupon.value}% off` : `${formatMoney(coupon.value)} off`} · minimum {formatMoney(coupon.minSubtotal)}</span></div><div><small>{coupon.usedCount} uses</small><button className={coupon.active ? 'is-active' : ''} type="button" onClick={() => onToggle(coupon)}>{coupon.active ? 'Active' : 'Paused'}</button></div></article>)}</section></div>
}

function ReturnsView({ returns, onUpdate }) {
  const transitions = { requested: ['requested', 'approved', 'rejected'], approved: ['approved', 'received', 'rejected'], rejected: ['rejected'], received: ['received', 'refunded'], refunded: ['refunded'] }
  return <div className="admin-return-list">{returns.map((item) => <article key={item.id}><div><span>{item.order?.orderNumber}</span><strong>{item.customer?.name}</strong><small>{formatDate(item.createdAt)}</small></div><p>{item.reason}</p><span>{item.items?.reduce((sum, entry) => sum + entry.quantity, 0)} units</span><select value={item.status} onChange={(event) => onUpdate(item.id, event.target.value)}>{transitions[item.status].map((status) => <option key={status}>{status}</option>)}</select></article>)}{!returns.length && <p className="admin-panel-empty">No return requests.</p>}</div>
}

function AnalyticsView({ analytics, auditLogs }) {
  return <><div className="admin-summary"><article><div><span>30-day revenue</span><i>01</i></div><strong>{formatMoney(analytics.revenue)}</strong><small>Completed order value</small></article><article><div><span>Orders</span><i>02</i></div><strong>{analytics.orders || 0}</strong><small>Last 30 days</small></article><article><div><span>Tracked events</span><i>03</i></div><strong>{analytics.events?.reduce((sum, event) => sum + event.count, 0) || 0}</strong><small>Store interactions</small></article><article><div><span>Audit entries</span><i>04</i></div><strong>{auditLogs.length}</strong><small>Latest administrative actions</small></article></div><div className="admin-analytics-grid"><section><p>Top products</p>{(analytics.topProducts || []).map((product, index) => <article key={product.productId}><span>0{index + 1}</span><strong>{product.name}</strong><b>{product.units} units</b></article>)}</section><section><p>Audit trail</p>{auditLogs.slice(0, 8).map((log) => <article key={log.id}><span>{formatDate(log.createdAt)}</span><strong>{log.action} / {log.entity}</strong><b>{log.admin?.name || 'System'}</b></article>)}</section></div></>
}

function SettingsView({ token, language, notify }) {
  const th = language === 'th'
  const tx = (en, thai) => th ? thai : en
  const [methods, setMethods] = useState([])
  const [users, setUsers] = useState([])
  const [legal, setLegal] = useState({})
  const [email, setEmail] = useState({ configured: false, connected: false })
  const [testEmail, setTestEmail] = useState('')
  const [method, setMethod] = useState({ code: '', name: '', nameTh: '', description: '', descriptionTh: '', fee: 0, freeAbove: '', estimatedDays: '2–4 business days', active: true })
  const [user, setUser] = useState({ username: '', email: '', name: '', role: 'fulfillment', password: '' })
  const load = async () => {
    const [shipping, legalData, emailData] = await Promise.all([apiRequest('/api/admin/shipping-methods',{ token }),apiRequest('/api/admin/settings/legal',{ token }),apiRequest('/api/admin/system/email',{ token })])
    setMethods(shipping.methods); setLegal(legalData.legal); setEmail(emailData)
    apiRequest('/api/admin/users',{ token }).then((data) => setUsers(data.users)).catch(() => setUsers([]))
  }
  useEffect(() => { load() }, [])
  return <div className="admin-settings-grid">
    <section><p>{tx('Email delivery','การส่งอีเมล')}</p><h2>SMTP</h2><div className={`admin-email-state ${email.connected ? 'is-online' : ''}`}><i />{email.connected ? tx('Connected and ready','เชื่อมต่อและพร้อมใช้งาน') : email.configured ? tx('Configured, connection failed','ตั้งค่าแล้วแต่เชื่อมต่อไม่ได้') : tx('Add SMTP credentials in .env, then restart the server','เพิ่มข้อมูล SMTP ใน .env แล้วเริ่มเซิร์ฟเวอร์ใหม่')}</div><form className="admin-settings-form" onSubmit={async(event)=>{event.preventDefault();await apiRequest('/api/admin/system/email/test',{token,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:testEmail,language})});notify(tx('Test email sent.','ส่งอีเมลทดสอบแล้ว'))}}><input required type="email" placeholder={tx('Test recipient email','อีเมลสำหรับทดสอบ')} value={testEmail} onChange={(e)=>setTestEmail(e.target.value)}/><button type="submit" disabled={!email.connected}>{tx('Send test email','ส่งอีเมลทดสอบ')}</button></form></section>
    <section><p>{tx('Delivery configuration','ตั้งค่าการจัดส่ง')}</p><h2>{tx('Shipping methods','วิธีจัดส่ง')}</h2>{methods.map((item) => <article className="admin-setting-row" key={item.id}><div><strong>{th ? item.nameTh : item.name}</strong><small>{moneyOrDash(item.fee)} · {item.estimatedDays}</small></div><button type="button" onClick={async () => { await apiRequest(`/api/admin/shipping-methods/${item.id}`,{ token,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...item,active:!item.active})}); await load() }}>{item.active ? tx('Active','เปิด') : tx('Paused','ปิด')}</button></article>)}<form className="admin-settings-form" onSubmit={async (event) => { event.preventDefault(); await apiRequest('/api/admin/shipping-methods',{token,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(method)}); setMethod({...method,code:'',name:'',nameTh:''}); await load(); notify(tx('Shipping method created.','เพิ่มวิธีจัดส่งแล้ว')) }}><h3>{tx('Add method','เพิ่มวิธีจัดส่ง')}</h3><input required placeholder="Code" value={method.code} onChange={(e)=>setMethod({...method,code:e.target.value})}/><input required placeholder="English name" value={method.name} onChange={(e)=>setMethod({...method,name:e.target.value})}/><input required placeholder="ชื่อภาษาไทย" value={method.nameTh} onChange={(e)=>setMethod({...method,nameTh:e.target.value})}/><input type="number" min="0" placeholder={tx('Fee','ค่าจัดส่ง')} value={method.fee} onChange={(e)=>setMethod({...method,fee:e.target.value})}/><button type="submit">{tx('Add shipping method','เพิ่มวิธีจัดส่ง')}</button></form></section>
    <section className="admin-legal-settings"><p>{tx('Store information and policies','ข้อมูลร้านและนโยบาย')}</p><h2>{tx('Legal content','ข้อมูลกฎหมาย')}</h2><form className="admin-settings-form" onSubmit={async (event) => { event.preventDefault(); await apiRequest('/api/admin/settings/legal',{token,method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(legal)}); notify(tx('Legal content saved.','บันทึกข้อมูลกฎหมายแล้ว')) }}>{[['companyName','Company name'],['companyNameTh','ชื่อบริษัท'],['address','Address'],['addressTh','ที่อยู่'],['email','Contact email'],['phone','Phone'],['returnDays','Return days']].map(([key,label])=><label key={key}>{label}<input value={legal[key] || ''} onChange={(e)=>setLegal({...legal,[key]:key==='returnDays'?Number(e.target.value):e.target.value})}/></label>)}{[['privacyEn','Privacy EN'],['privacyTh','ความเป็นส่วนตัว TH'],['termsEn','Terms EN'],['termsTh','ข้อกำหนด TH'],['shippingEn','Shipping EN'],['shippingTh','การจัดส่ง TH'],['returnsEn','Returns EN'],['returnsTh','การคืนสินค้า TH']].map(([key,label])=><label key={key}>{label}<textarea rows="4" value={legal[key] || ''} onChange={(e)=>setLegal({...legal,[key]:e.target.value})}/></label>)}<button type="submit">{tx('Save policies','บันทึกนโยบาย')}</button></form></section>
    <section><p>{tx('Access control','สิทธิ์การเข้าถึง')}</p><h2>{tx('Administrators','ผู้ดูแลระบบ')}</h2>{users.map((item)=><article className="admin-setting-row" key={item.id}><div><strong>{item.name}</strong><small>{item.username} · {item.role}</small></div><button type="button" onClick={async()=>{await apiRequest(`/api/admin/users/${item.id}`,{token,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!item.active})});await load()}}>{item.active?tx('Active','เปิด'):tx('Disabled','ปิด')}</button></article>)}<form className="admin-settings-form" onSubmit={async(event)=>{event.preventDefault();await apiRequest('/api/admin/users',{token,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(user)});setUser({...user,username:'',email:'',name:'',password:''});await load();notify(tx('Administrator created.','เพิ่มผู้ดูแลแล้ว'))}}><h3>{tx('Add administrator','เพิ่มผู้ดูแล')}</h3><input required placeholder={tx('Full name','ชื่อ')} value={user.name} onChange={(e)=>setUser({...user,name:e.target.value})}/><input required placeholder="Username" value={user.username} onChange={(e)=>setUser({...user,username:e.target.value})}/><input required type="email" placeholder="Email" value={user.email} onChange={(e)=>setUser({...user,email:e.target.value})}/><input required minLength="10" type="password" placeholder={tx('Temporary password','รหัสผ่านชั่วคราว')} value={user.password} onChange={(e)=>setUser({...user,password:e.target.value})}/><select value={user.role} onChange={(e)=>setUser({...user,role:e.target.value})}><option value="owner">Owner</option><option value="manager">Manager</option><option value="fulfillment">Fulfillment</option></select><button type="submit">{tx('Create administrator','สร้างผู้ดูแล')}</button></form></section>
  </div>
}

const moneyOrDash = (value) => value === null || value === undefined ? '—' : new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:0}).format(value)

function LegacyAdminDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [notice, setNotice] = useState('')

  const counts = useMemo(() => products.reduce((result, product) => {
    const status = product.status || 'active'
    result[status] = (result[status] || 0) + 1
    return result
  }, { active: 0, draft: 0, archived: 0 }), [products])

  const filteredProducts = useMemo(() => products.filter((product) => {
    const status = product.status || 'active'
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    const searchText = `${product.name} ${product.collection} ${product.slug}`.toLowerCase()
    return matchesStatus && searchText.includes(query.trim().toLowerCase())
  }), [products, query, statusFilter])

  const publishRate = products.length ? Math.round((counts.active / products.length) * 100) : 0

  const loadProducts = async (activeToken = token) => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest('/api/admin/products', { token: activeToken })
      setProducts(result.products)
    } catch (loadError) {
      if (/authentication/i.test(loadError.message)) {
        sessionStorage.removeItem(TOKEN_KEY)
        setToken('')
      } else setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadProducts(token)
  }, [token])

  const logout = async () => {
    try { await apiRequest('/api/admin/logout', { token, method: 'POST' }) } catch { /* session may already be gone */ }
    sessionStorage.removeItem(TOKEN_KEY)
    setToken('')
  }

  const changeStatus = async (product, status) => {
    setError('')
    try {
      if (status === 'archived') {
        await apiRequest(`/api/admin/products/${product.id}`, { token, method: 'DELETE' })
      } else {
        const body = new FormData()
        body.append('product', JSON.stringify({ ...product, status }))
        await apiRequest(`/api/admin/products/${product.id}`, { token, method: 'PATCH', body })
      }
      await loadProducts()
      setNotice(status === 'archived' ? `${product.name} moved to archive.` : `${product.name} is now live.`)
      window.setTimeout(() => setNotice(''), 3200)
    } catch (statusError) { setError(statusError.message) }
  }

  if (!token) return <Login onAuthenticated={setToken} />

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand-block">
          <a href="/" className="admin-wordmark">ORION</a>
          <span>Atelier system</span>
        </div>
        <nav aria-label="Administration">
          <button className="is-active" type="button"><Icon name="grid" /><span>Products</span><strong>{products.length}</strong></button>
          <button type="button" disabled><Icon name="bag" /><span>Orders</span><em>Soon</em></button>
          <button type="button" disabled><Icon name="layers" /><span>Inventory</span><em>Soon</em></button>
        </nav>
        <div className="admin-sidebar-footer">
          <div className="admin-system-status"><i /><span>System online</span></div>
          <button type="button" onClick={logout}><Icon name="logout" /><span>Sign out</span></button>
        </div>
      </aside>

      <section className="admin-content">
        <div className="admin-topline">
          <span>Catalogue / Overview</span>
          <span>ORION Private Office</span>
        </div>
        <header className="admin-page-header">
          <div><p>Store administration</p><h1>Products<span>.</span></h1><small>Curate every piece presented in the ORION collection.</small></div>
          <div><a href="/#shop"><Icon name="eye" />View storefront</a><button className="admin-primary-button" type="button" onClick={() => setCreating(true)}><Icon name="plus" />Add product</button></div>
        </header>

        <div className="admin-summary">
          <article><div><span>Catalogue</span><i>01</i></div><strong>{products.length}</strong><small>Total pieces</small></article>
          <article><div><span>Published</span><i>02</i></div><strong>{counts.active}</strong><small>{publishRate}% of catalogue is live</small></article>
          <article><div><span>In progress</span><i>03</i></div><strong>{counts.draft}</strong><small>Draft pieces</small></article>
          <article><div><span>Archive</span><i>04</i></div><strong>{counts.archived}</strong><small>Hidden from storefront</small></article>
        </div>

        <div className="admin-catalogue-header">
          <div><p>Collection catalogue</p><h2>All pieces</h2></div>
          <span>{loading ? 'Refreshing...' : `${filteredProducts.length} of ${products.length} records`}</span>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search"><Icon name="search" /><span className="sr-only">Search products</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by product or collection" /></label>
          <div className="admin-filters" aria-label="Filter by status">
            {['all', 'active', 'draft', 'archived'].map((status) => <button className={statusFilter === status ? 'is-active' : ''} key={status} type="button" onClick={() => setStatusFilter(status)}>{status}</button>)}
          </div>
        </div>

        <div className="admin-list-labels"><span>Piece</span><span>Price</span><span>Status</span><span>Actions</span></div>
        <div className="admin-product-list">
          {filteredProducts.map((product, index) => (
            <article className="admin-product-row" key={product.id}>
              <span className="admin-row-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="admin-product-image">{product.campaignImage?.src ? <img src={product.campaignImage.src} alt="" /> : <span>O</span>}</div>
              <div className="admin-product-name"><strong>{product.name}</strong><span>{product.collection} · {product.images?.length || 0} views</span></div>
              <div className="admin-product-price"><strong>{product.price ? new Intl.NumberFormat('en-US').format(product.price) : '—'}</strong><span>{product.price ? product.currency : product.priceLabel}</span></div>
              <span className={`admin-status is-${product.status || 'active'}`}>{product.status || 'active'}</span>
              <div className="admin-row-actions">
                <button type="button" onClick={() => setEditing(product)}><Icon name="edit" /><span>Edit</span></button>
                {(product.status || 'active') === 'active'
                  ? <button type="button" onClick={() => changeStatus(product, 'archived')}><Icon name="archive" /><span>Archive</span></button>
                  : <button type="button" onClick={() => changeStatus(product, 'active')}><Icon name="check" /><span>Publish</span></button>}
              </div>
            </article>
          ))}
          {!loading && !filteredProducts.length && <div className="admin-empty-state"><span>Nothing found</span><p>Try another search or clear the selected status.</p><button type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear filters</button></div>}
        </div>
        <p className="admin-page-error" aria-live="polite">{error}</p>
      </section>

      {notice && <div className="admin-toast" role="status"><Icon name="check" />{notice}</div>}

      {(creating || editing) && (
        <ProductEditor
          key={editing?.id || 'new-product'}
          product={editing}
          token={token}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={async () => {
            setCreating(false)
            setEditing(null)
            await loadProducts()
            setNotice('Product saved successfully.')
            window.setTimeout(() => setNotice(''), 3200)
          }}
        />
      )}
    </main>
  )
}

export default function AdminDashboard() {
  const { language } = useLanguage()
  useAdminTranslation(language)
  const adminLabel = (en, th) => language === 'th' ? th : en
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [activeView, setActiveView] = useState('overview')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [customers, setCustomers] = useState([])
  const [coupons, setCoupons] = useState([])
  const [returns, setReturns] = useState([])
  const [analytics, setAnalytics] = useState({ events: [], topProducts: [], revenue: 0, orders: 0 })
  const [auditLogs, setAuditLogs] = useState([])
  const [emailStatus, setEmailStatus] = useState({ configured: false, connected: false })
  const [selectedProducts, setSelectedProducts] = useState([])
  const [overview, setOverview] = useState({ metrics: {}, recentOrders: [] })
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [notice, setNotice] = useState('')

  const counts = useMemo(() => products.reduce((result, product) => {
    const status = product.status || 'active'
    result[status] = (result[status] || 0) + 1
    return result
  }, { active: 0, draft: 0, archived: 0 }), [products])
  const filteredProducts = useMemo(() => products.filter((product) => {
    const status = product.status || 'active'
    return (statusFilter === 'all' || status === statusFilter) && `${product.name} ${product.collection} ${product.slug}`.toLowerCase().includes(query.trim().toLowerCase())
  }), [products, query, statusFilter])
  const publishRate = products.length ? Math.round((counts.active / products.length) * 100) : 0

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }
  const loadWorkspace = async (activeToken = token) => {
    setLoading(true); setError('')
    try {
      const [productData, orderData, inventoryData, customerData, overviewData, couponData, returnData, analyticsData, auditData, emailData] = await Promise.all([
        apiRequest('/api/admin/products', { token: activeToken }), apiRequest('/api/admin/orders', { token: activeToken }),
        apiRequest('/api/admin/inventory', { token: activeToken }), apiRequest('/api/admin/customers', { token: activeToken }),
        apiRequest('/api/admin/overview', { token: activeToken }),
        apiRequest('/api/admin/coupons', { token: activeToken }), apiRequest('/api/admin/returns', { token: activeToken }),
        apiRequest('/api/admin/analytics', { token: activeToken }), apiRequest('/api/admin/audit', { token: activeToken }),
        apiRequest('/api/admin/system/email', { token: activeToken }),
      ])
      setProducts(productData.products); setOrders(orderData.orders); setInventory(inventoryData.inventory)
      setCustomers(customerData.customers); setOverview(overviewData); setCoupons(couponData.coupons)
      setReturns(returnData.returns); setAnalytics(analyticsData); setAuditLogs(auditData.logs)
      setEmailStatus(emailData)
    } catch (loadError) {
      if (/authentication/i.test(loadError.message)) { sessionStorage.removeItem(TOKEN_KEY); setToken('') }
      else setError(loadError.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { if (token) loadWorkspace(token) }, [token])

  const logout = async () => {
    try { await apiRequest('/api/admin/logout', { token, method: 'POST' }) } catch { /* expired */ }
    sessionStorage.removeItem(TOKEN_KEY); setToken('')
  }
  const changeStatus = async (product, status) => {
    setError('')
    try {
      if (status === 'archived') await apiRequest(`/api/admin/products/${product.id}`, { token, method: 'DELETE' })
      else { const body = new FormData(); body.append('product', JSON.stringify({ ...product, status })); await apiRequest(`/api/admin/products/${product.id}`, { token, method: 'PATCH', body }) }
      await loadWorkspace(); showNotice(status === 'archived' ? `${product.name} moved to archive.` : `${product.name} is now live.`)
    } catch (statusError) { setError(statusError.message) }
  }
  const bulkUpdate = async (status) => {
    try { await apiRequest('/api/admin/products/bulk',{token,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({products:selectedProducts.map((id)=>({id,status}))})}); setSelectedProducts([]); await loadWorkspace(); showNotice(adminLabel('Products updated.','อัปเดตสินค้าแล้ว')) } catch (failure) { setError(failure.message) }
  }
  const importCsv = async (file) => {
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean)
    const headers = (lines.shift() || '').split(',').map((item)=>item.replace(/^"|"$/g,''))
    const productRows = lines.map((line)=>{ const values=line.split(',').map((item)=>item.replace(/^"|"$/g,'').replace(/""/g,'"')); return Object.fromEntries(headers.map((key,index)=>[key,values[index]])) }).filter((item)=>item.id)
    try { await apiRequest('/api/admin/products/bulk',{token,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({products:productRows})}); await loadWorkspace(); showNotice(adminLabel(`Imported ${productRows.length} product updates.`,`นำเข้าการแก้ไขสินค้า ${productRows.length} รายการแล้ว`)) } catch (failure) { setError(failure.message) }
  }
  const updateOrder = async (id, payload) => {
    try {
      await apiRequest(`/api/admin/orders/${id}`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await loadWorkspace(); showNotice('Order updated.')
    } catch (updateError) { setError(updateError.message) }
  }
  const saveInventory = async (id, payload) => {
    try {
      await apiRequest(`/api/admin/inventory/${encodeURIComponent(id)}`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await loadWorkspace(); showNotice('Inventory saved.')
    } catch (updateError) { setError(updateError.message) }
  }
  const updateShipment = async (id, payload) => {
    try { await apiRequest(`/api/admin/orders/${id}/shipment`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); await loadWorkspace(); showNotice('Shipment updated.') }
    catch (updateError) { setError(updateError.message) }
  }
  const createCoupon = async (payload) => {
    try { await apiRequest('/api/admin/coupons', { token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); await loadWorkspace(); showNotice('Coupon created.') }
    catch (updateError) { setError(updateError.message) }
  }
  const toggleCoupon = async (coupon) => {
    try { await apiRequest(`/api/admin/coupons/${coupon.id}`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !coupon.active }) }); await loadWorkspace(); showNotice('Coupon updated.') }
    catch (updateError) { setError(updateError.message) }
  }
  const updateReturn = async (id, status) => {
    try { await apiRequest(`/api/admin/returns/${id}`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await loadWorkspace(); showNotice('Return updated.') }
    catch (updateError) { setError(updateError.message) }
  }

  if (!token) return <Login onAuthenticated={setToken} />
  const meta = {
    overview: ['Command centre', 'Overview', 'Orders, clients and collection health at a glance.'],
    products: ['Store administration', 'Products', 'Curate every piece presented in the ORION collection.'],
    orders: ['Private client services', 'Orders', 'Review requests and guide every order through fulfilment.'],
    inventory: ['Collection control', 'Inventory', 'Manage variant stock, identifiers and low-stock thresholds.'],
    customers: ['Client book', 'Customers', 'A private view of clients created through ORION orders.'],
    coupons: ['Commercial tools', 'Coupons', 'Create and control private incentives for the collection.'],
    returns: ['Aftercare', 'Returns', 'Review return requests and manage stock restoration.'],
    analytics: ['Store intelligence', 'Analytics', 'Thirty-day commerce performance and administrative activity.'],
    settings: [adminLabel('Store configuration','การตั้งค่าร้าน'), adminLabel('Settings','ตั้งค่า'), adminLabel('Email, delivery, legal content and administrator access.','อีเมล การจัดส่ง ข้อมูลกฎหมาย และสิทธิ์ผู้ดูแลระบบ')],
  }[activeView]

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand-block"><a href="/" className="admin-wordmark">ORION</a><span>Atelier system</span></div>
      <nav aria-label="Administration">
        <button className={activeView === 'overview' ? 'is-active' : ''} type="button" onClick={() => setActiveView('overview')}><Icon name="grid" /><span>{adminLabel('Overview','ภาพรวม')}</span></button>
        <button className={activeView === 'products' ? 'is-active' : ''} type="button" onClick={() => setActiveView('products')}><Icon name="layers" /><span>{adminLabel('Products','สินค้า')}</span><strong>{products.length}</strong></button>
        <button className={activeView === 'orders' ? 'is-active' : ''} type="button" onClick={() => setActiveView('orders')}><Icon name="bag" /><span>{adminLabel('Orders','คำสั่งซื้อ')}</span><strong>{overview.metrics?.newOrders || 0}</strong></button>
        <button className={activeView === 'inventory' ? 'is-active' : ''} type="button" onClick={() => setActiveView('inventory')}><Icon name="archive" /><span>{adminLabel('Inventory','คลังสินค้า')}</span><strong>{overview.metrics?.lowStock || 0}</strong></button>
        <button className={activeView === 'customers' ? 'is-active' : ''} type="button" onClick={() => setActiveView('customers')}><Icon name="eye" /><span>{adminLabel('Customers','ลูกค้า')}</span><strong>{customers.length}</strong></button>
        <button className={activeView === 'coupons' ? 'is-active' : ''} type="button" onClick={() => setActiveView('coupons')}><Icon name="plus" /><span>{adminLabel('Coupons','คูปอง')}</span><strong>{coupons.length}</strong></button>
        <button className={activeView === 'returns' ? 'is-active' : ''} type="button" onClick={() => setActiveView('returns')}><Icon name="arrow" /><span>{adminLabel('Returns','คืนสินค้า')}</span><strong>{returns.length}</strong></button>
        <button className={activeView === 'analytics' ? 'is-active' : ''} type="button" onClick={() => setActiveView('analytics')}><Icon name="grid" /><span>{adminLabel('Analytics','รายงาน')}</span></button>
        <button className={activeView === 'settings' ? 'is-active' : ''} type="button" onClick={() => setActiveView('settings')}><Icon name="edit" /><span>{adminLabel('Settings','ตั้งค่า')}</span></button>
      </nav>
      <div className="admin-sidebar-footer"><div className={`admin-system-status ${emailStatus.connected ? '' : 'is-warning'}`}><i /><span>{emailStatus.connected ? adminLabel('Email connected','อีเมลเชื่อมต่อแล้ว') : emailStatus.configured ? adminLabel('Email connection error','อีเมลเชื่อมต่อไม่ได้') : adminLabel('SMTP setup needed','ยังไม่ได้ตั้ง SMTP')}</span></div><button type="button" onClick={logout}><Icon name="logout" /><span>{adminLabel('Sign out','ออกจากระบบ')}</span></button></div>
    </aside>

    <section className="admin-content">
      <LanguageSwitch />
      <div className="admin-topline"><span>{activeView} / Overview</span><span>ORION Private Office</span></div>
      <div className="admin-mobile-nav">{['overview','products','orders','inventory','customers','coupons','returns','analytics','settings'].map((view) => <button className={activeView === view ? 'is-active' : ''} key={view} type="button" onClick={() => setActiveView(view)}>{view}</button>)}</div>
      <header className="admin-page-header"><div><p>{meta[0]}</p><h1>{meta[1]}<span>.</span></h1><small>{meta[2]}</small></div><div><a href="/#shop"><Icon name="eye" />{adminLabel('View storefront','ดูหน้าร้าน')}</a>{activeView === 'products' && <><a href="/api/admin/products-export.csv" download><Icon name="arrow" />CSV</a><label className="admin-import-button"><input type="file" accept=".csv,text/csv" onChange={(event)=>event.target.files[0]&&importCsv(event.target.files[0])}/>{adminLabel('Import CSV','นำเข้า CSV')}</label><button className="admin-primary-button" type="button" onClick={() => setCreating(true)}><Icon name="plus" />{adminLabel('Add product','เพิ่มสินค้า')}</button></>}</div></header>

      {loading && !products.length ? <div className="admin-loading">Preparing the private office...</div> : <>
        {activeView === 'overview' && <OverviewView overview={overview} onNavigate={setActiveView} />}
        {activeView === 'orders' && <div className="admin-section-body"><OrdersView orders={orders} onUpdate={updateOrder} onShipment={updateShipment} /></div>}
        {activeView === 'inventory' && <div className="admin-section-body"><InventoryView inventory={inventory} onSave={saveInventory} /></div>}
        {activeView === 'customers' && <div className="admin-section-body"><CustomersView customers={customers} /></div>}
        {activeView === 'coupons' && <div className="admin-section-body"><CouponsView coupons={coupons} onCreate={createCoupon} onToggle={toggleCoupon} /></div>}
        {activeView === 'returns' && <div className="admin-section-body"><ReturnsView returns={returns} onUpdate={updateReturn} /></div>}
        {activeView === 'analytics' && <AnalyticsView analytics={analytics} auditLogs={auditLogs} />}
        {activeView === 'settings' && <div className="admin-section-body"><SettingsView token={token} language={language} notify={showNotice} /></div>}
        {activeView === 'products' && <>
          <div className="admin-summary"><article><div><span>Catalogue</span><i>01</i></div><strong>{products.length}</strong><small>Total pieces</small></article><article><div><span>Published</span><i>02</i></div><strong>{counts.active}</strong><small>{publishRate}% of catalogue is live</small></article><article><div><span>In progress</span><i>03</i></div><strong>{counts.draft}</strong><small>Draft pieces</small></article><article><div><span>Archive</span><i>04</i></div><strong>{counts.archived}</strong><small>Hidden from storefront</small></article></div>
          <div className="admin-catalogue-header"><div><p>Collection catalogue</p><h2>All pieces</h2></div><span>{loading ? 'Refreshing...' : `${filteredProducts.length} of ${products.length} records`}</span></div>
          <div className="admin-toolbar"><label className="admin-search"><Icon name="search" /><span className="sr-only">Search products</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={adminLabel('Search by product or collection','ค้นหาสินค้าหรือคอลเลกชัน')} /></label><button className="admin-select-all" type="button" onClick={()=>setSelectedProducts(selectedProducts.length===filteredProducts.length?[]:filteredProducts.map((item)=>item.id))}>{selectedProducts.length===filteredProducts.length?adminLabel('Clear selection','ล้างรายการ'):adminLabel('Select results','เลือกทั้งหมด')}</button>{selectedProducts.length > 0 && <div className="admin-bulk-actions"><span>{selectedProducts.length} {adminLabel('selected','รายการ')}</span><button type="button" onClick={()=>bulkUpdate('active')}>{adminLabel('Publish','เผยแพร่')}</button><button type="button" onClick={()=>bulkUpdate('archived')}>{adminLabel('Archive','เก็บ')}</button></div>}<div className="admin-filters">{['all','active','draft','archived'].map((status) => <button className={statusFilter === status ? 'is-active' : ''} key={status} type="button" onClick={() => setStatusFilter(status)}>{status}</button>)}</div></div>
          <div className="admin-list-labels"><span>Piece</span><span>Price</span><span>Status</span><span>Actions</span></div>
          <div className="admin-product-list">{filteredProducts.map((product, index) => <article className="admin-product-row" key={product.id}><span className="admin-row-number">{String(index + 1).padStart(2, '0')}</span><div className="admin-product-image">{product.campaignImage?.src ? <img src={product.campaignImage.src} alt="" /> : <span>O</span>}</div><div className="admin-product-name"><strong>{product.name}</strong><span>{product.collection} · {product.images?.length || 0} views</span></div><div className="admin-product-price"><strong>{product.price ? new Intl.NumberFormat('en-US').format(product.price) : '—'}</strong><span>{product.price ? product.currency : product.priceLabel}</span></div><span className={`admin-status is-${product.status || 'active'}`}>{product.status || 'active'}</span><div className="admin-row-actions"><button type="button" onClick={() => setEditing(product)}><Icon name="edit" /><span>Edit</span></button>{(product.status || 'active') === 'active' ? <button type="button" onClick={() => changeStatus(product, 'archived')}><Icon name="archive" /><span>Archive</span></button> : <button type="button" onClick={() => changeStatus(product, 'active')}><Icon name="check" /><span>Publish</span></button>}</div></article>)}{!loading && !filteredProducts.length && <div className="admin-empty-state"><span>Nothing found</span><p>Try another search or clear the selected status.</p><button type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear filters</button></div>}</div>
        </>}
      </>}
      <p className="admin-page-error" aria-live="polite">{error}</p>
    </section>
    {notice && <div className="admin-toast" role="status"><Icon name="check" />{notice}</div>}
    {(creating || editing) && <ProductEditor key={editing?.id || 'new-product'} product={editing} token={token} onClose={() => { setCreating(false); setEditing(null) }} onSaved={async () => { setCreating(false); setEditing(null); await loadWorkspace(); showNotice('Product saved successfully.') }} />}
  </main>
}
