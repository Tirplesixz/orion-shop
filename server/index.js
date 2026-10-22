import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { createServer as createViteServer } from 'vite'
import { FALLBACK_PRODUCTS } from '../src/data/products.js'

const currentFile = fileURLToPath(import.meta.url)
const serverDirectory = path.dirname(currentFile)
const projectRoot = path.resolve(serverDirectory, '..')
const dataDirectory = path.join(serverDirectory, 'data')
const dataFile = path.join(dataDirectory, 'products.json')
const ordersFile = path.join(dataDirectory, 'orders.json')
const inventoryFile = path.join(dataDirectory, 'inventory.json')
const uploadDirectory = path.join(projectRoot, 'public', 'media', 'uploads')
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 5173)
const adminPassword = process.env.ORION_ADMIN_PASSWORD || 'orion-admin'
const sessionLifetime = 8 * 60 * 60 * 1000
const sessions = new Map()

await mkdir(dataDirectory, { recursive: true })
await mkdir(uploadDirectory, { recursive: true })

const cloneFallbackProducts = () => JSON.parse(JSON.stringify(FALLBACK_PRODUCTS))
  .map((product) => ({ ...product, status: product.status || 'active' }))

async function readProducts() {
  try {
    const content = await readFile(dataFile, 'utf8')
    const products = JSON.parse(content)
    return Array.isArray(products) ? products : cloneFallbackProducts()
  } catch (error) {
    if (error.code === 'ENOENT') return cloneFallbackProducts()
    throw error
  }
}

async function writeProducts(products) {
  await writeFile(dataFile, `${JSON.stringify(products, null, 2)}\n`, 'utf8')
}

async function readJson(file, fallback = []) {
  try {
    const content = await readFile(file, 'utf8')
    const value = JSON.parse(content)
    return Array.isArray(value) ? value : fallback
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const readOrders = () => readJson(ordersFile, [])

function inventoryId(productId, variantId) {
  return `${productId}::${variantId}`
}

async function readInventory(products = null) {
  const catalogue = products || await readProducts()
  const saved = await readJson(inventoryFile, [])
  const savedMap = new Map(saved.map((item) => [item.id, item]))
  return catalogue.flatMap((product) => (product.variants || []).map((variant) => {
    const id = inventoryId(product.id, variant.id)
    return {
      id,
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      sku: savedMap.get(id)?.sku || `${product.slug}-${variant.id}`.toUpperCase(),
      stock: Math.max(0, Number(savedMap.get(id)?.stock ?? 5)),
      lowStockThreshold: Math.max(0, Number(savedMap.get(id)?.lowStockThreshold ?? 2)),
      updatedAt: savedMap.get(id)?.updatedAt || null,
    }
  }))
}

async function productsWithInventory({ includeInactive = false } = {}) {
  const products = await readProducts()
  const inventory = await readInventory(products)
  const inventoryMap = new Map(inventory.map((item) => [item.id, item]))
  return products
    .filter((product) => includeInactive || !product.status || product.status === 'active')
    .map((product) => ({
      ...product,
      variants: (product.variants || []).map((variant) => {
        const item = inventoryMap.get(inventoryId(product.id, variant.id))
        return { ...variant, stock: item?.stock ?? 0, available: variant.available !== false && (item?.stock ?? 0) > 0 }
      }),
    }))
}

function orderNumber() {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `ORI-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function createSession() {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + sessionLifetime)
  return token
}

function requireAdmin(request, response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const expiresAt = token ? sessions.get(token) : null
  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token)
    response.status(401).json({ error: 'Admin authentication required.' })
    return
  }
  sessions.set(token, Date.now() + sessionLifetime)
  request.adminToken = token
  next()
}

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg'
    const stem = path.basename(file.originalname, extension)
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'product'
    callback(null, `${Date.now()}-${randomBytes(4).toString('hex')}-${stem}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_request, file, callback) => {
    if (allowedImageTypes.has(file.mimetype)) callback(null, true)
    else callback(new Error('Only JPG, PNG, WebP and AVIF images are supported.'))
  },
})

const uploadedPath = (file) => `/media/uploads/${file.filename}`
const cleanText = (value, fallback = '') => String(value ?? fallback).trim()

function normaliseProduct(input, existing = null, files = []) {
  const fileMap = new Map(files.map((file) => [file.fieldname, file]))
  const name = cleanText(input.name, existing?.name)
  const slug = cleanText(input.slug, existing?.slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!name || !slug) throw new Error('Product name and slug are required.')

  const campaignUpload = fileMap.get('campaign')
  const campaignImage = {
    src: campaignUpload ? uploadedPath(campaignUpload) : cleanText(input.campaignImage?.src, existing?.campaignImage?.src),
    alt: cleanText(input.campaignImage?.alt, existing?.campaignImage?.alt || `${name} campaign image`),
  }
  const images = (Array.isArray(input.images) ? input.images : existing?.images || [])
    .map((image, index) => {
      const imageUpload = fileMap.get(`image-${index}`)
      return {
        id: cleanText(image.id, `view-${index + 1}`),
        label: cleanText(image.label, `View ${index + 1}`),
        src: imageUpload ? uploadedPath(imageUpload) : cleanText(image.src),
        alt: cleanText(image.alt, `${image.label || `View ${index + 1}`} of ${name}`),
      }
    })
    .filter((image) => image.src)
  if (!campaignImage.src) throw new Error('A campaign image is required.')
  if (!images.length) throw new Error('At least one product image is required.')

  const variants = (Array.isArray(input.variants) ? input.variants : existing?.variants || [])
    .map((variant, index) => ({
      id: cleanText(variant.id, `variant-${index + 1}`),
      label: cleanText(variant.label, `Option ${index + 1}`),
      available: variant.available !== false,
    }))

  return {
    id: existing?.id || cleanText(input.id, `orion-${slug}-${randomBytes(4).toString('hex')}`),
    slug,
    collection: cleanText(input.collection, existing?.collection || 'Collection 01'),
    name,
    eyebrow: cleanText(input.eyebrow, existing?.eyebrow || 'ORION / Signature piece'),
    description: cleanText(input.description, existing?.description),
    theme: {
      canvas: cleanText(input.theme?.canvas, existing?.theme?.canvas || '#07101d'),
      glow: cleanText(input.theme?.glow, existing?.theme?.glow || 'rgba(67, 111, 173, 0.5)'),
      accent: cleanText(input.theme?.accent, existing?.theme?.accent || '#c7a566'),
    },
    campaignImage,
    images,
    price: input.price === '' || input.price === null || input.price === undefined ? null : Number(input.price),
    currency: cleanText(input.currency, existing?.currency || 'THB'),
    priceLabel: cleanText(input.priceLabel, existing?.priceLabel || 'Price on request'),
    variants: variants.length ? variants : [{ id: 'one-size', label: 'One size', available: true }],
    status: ['draft', 'active', 'archived'].includes(input.status) ? input.status : existing?.status || 'draft',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function parseProductPayload(request) {
  if (typeof request.body.product === 'string') return JSON.parse(request.body.product)
  return request.body.product || request.body
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_request, response) => response.json({ ok: true, storage: 'json' }))

app.get('/api/products', async (_request, response, next) => {
  try {
    response.json({ products: await productsWithInventory() })
  } catch (error) { next(error) }
})

app.get('/api/products/:slug', async (request, response, next) => {
  try {
    const products = await productsWithInventory()
    const product = products.find((item) => item.slug === request.params.slug)
    if (!product) return response.status(404).json({ error: 'Product not found.' })
    response.json({ product })
  } catch (error) { next(error) }
})

app.post('/api/orders', async (request, response, next) => {
  try {
    const customer = request.body.customer || {}
    const shippingAddress = request.body.shippingAddress || {}
    const requestedItems = Array.isArray(request.body.items) ? request.body.items : []
    if (!cleanText(customer.name) || !/^\S+@\S+\.\S+$/.test(cleanText(customer.email)) || !cleanText(customer.phone)) {
      return response.status(400).json({ error: 'Name, a valid email and phone number are required.' })
    }
    if (!cleanText(shippingAddress.address) || !cleanText(shippingAddress.city) || !cleanText(shippingAddress.postalCode)) {
      return response.status(400).json({ error: 'A complete shipping address is required.' })
    }
    if (!requestedItems.length || requestedItems.length > 20) {
      return response.status(400).json({ error: 'Your order must contain between 1 and 20 items.' })
    }

    const products = await readProducts()
    const inventory = await readInventory(products)
    const inventoryMap = new Map(inventory.map((item) => [item.id, item]))
    const items = requestedItems.map((requested) => {
      const product = products.find((item) => item.id === requested.productId && (!item.status || item.status === 'active'))
      if (!product) throw new Error('One of the selected products is no longer available.')
      const variant = (product.variants || []).find((item) => item.id === requested.variantId)
      if (!variant) throw new Error(`Please select a valid size for ${product.name}.`)
      const quantity = Math.max(1, Math.min(10, Number(requested.quantity) || 1))
      const stockItem = inventoryMap.get(inventoryId(product.id, variant.id))
      if (!stockItem || stockItem.stock < quantity || variant.available === false) {
        throw new Error(`${product.name} / ${variant.label} has insufficient stock.`)
      }
      const unitPrice = Number.isFinite(Number(product.price)) && product.price !== null ? Number(product.price) : null
      return {
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        image: product.campaignImage?.src || product.images?.[0]?.src || '',
        variantId: variant.id,
        variantLabel: variant.label,
        quantity,
        unitPrice,
        lineTotal: unitPrice === null ? null : unitPrice * quantity,
      }
    })

    items.forEach((item) => {
      const stockItem = inventoryMap.get(inventoryId(item.productId, item.variantId))
      stockItem.stock -= item.quantity
      stockItem.updatedAt = new Date().toISOString()
    })

    const orders = await readOrders()
    const pricedItems = items.filter((item) => item.lineTotal !== null)
    const subtotal = pricedItems.reduce((total, item) => total + item.lineTotal, 0)
    const hasPriceOnRequest = pricedItems.length !== items.length
    const now = new Date().toISOString()
    const order = {
      id: `order-${randomBytes(8).toString('hex')}`,
      orderNumber: orderNumber(),
      status: 'new',
      paymentStatus: hasPriceOnRequest ? 'review' : 'unpaid',
      customer: {
        name: cleanText(customer.name),
        email: cleanText(customer.email).toLowerCase(),
        phone: cleanText(customer.phone),
      },
      shippingAddress: {
        address: cleanText(shippingAddress.address),
        city: cleanText(shippingAddress.city),
        province: cleanText(shippingAddress.province),
        postalCode: cleanText(shippingAddress.postalCode),
        country: cleanText(shippingAddress.country, 'Thailand'),
      },
      note: cleanText(request.body.note),
      items,
      currency: 'THB',
      subtotal,
      total: subtotal,
      hasPriceOnRequest,
      createdAt: now,
      updatedAt: now,
    }
    orders.unshift(order)
    await Promise.all([writeJson(ordersFile, orders), writeJson(inventoryFile, inventory)])
    response.status(201).json({ order: { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total, hasPriceOnRequest } })
  } catch (error) {
    if (/available|stock|size/i.test(error.message)) return response.status(409).json({ error: error.message })
    next(error)
  }
})

app.post('/api/admin/login', (request, response) => {
  response.set('Cache-Control', 'no-store')
  if (!safeEqual(request.body.username || '', 'admin') || !safeEqual(request.body.password || '', adminPassword)) {
    return response.status(401).json({ error: 'Username or password is incorrect.' })
  }
  response.json({ token: createSession(), expiresIn: sessionLifetime })
})

app.post('/api/admin/logout', requireAdmin, (request, response) => {
  sessions.delete(request.adminToken)
  response.status(204).end()
})
app.get('/api/admin/session', requireAdmin, (_request, response) => response.json({ authenticated: true }))

app.get('/api/admin/products', requireAdmin, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json({ products: await readProducts() })
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireAdmin, upload.any(), async (request, response, next) => {
  try {
    const products = await readProducts()
    const product = normaliseProduct(parseProductPayload(request), null, request.files)
    if (products.some((item) => item.slug === product.slug)) {
      return response.status(409).json({ error: 'This product slug already exists.' })
    }
    products.push(product)
    await writeProducts(products)
    response.status(201).json({ product })
  } catch (error) { next(error) }
})

app.patch('/api/admin/products/:id', requireAdmin, upload.any(), async (request, response, next) => {
  try {
    const products = await readProducts()
    const index = products.findIndex((item) => item.id === request.params.id)
    if (index === -1) return response.status(404).json({ error: 'Product not found.' })
    const product = normaliseProduct(parseProductPayload(request), products[index], request.files)
    if (products.some((item, itemIndex) => item.slug === product.slug && itemIndex !== index)) {
      return response.status(409).json({ error: 'This product slug already exists.' })
    }
    products[index] = product
    await writeProducts(products)
    response.json({ product })
  } catch (error) { next(error) }
})

app.delete('/api/admin/products/:id', requireAdmin, async (request, response, next) => {
  try {
    const products = await readProducts()
    const index = products.findIndex((item) => item.id === request.params.id)
    if (index === -1) return response.status(404).json({ error: 'Product not found.' })
    products[index] = { ...products[index], status: 'archived', updatedAt: new Date().toISOString() }
    await writeProducts(products)
    response.json({ product: products[index] })
  } catch (error) { next(error) }
})

app.get('/api/admin/overview', requireAdmin, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    const [products, orders] = await Promise.all([readProducts(), readOrders()])
    const inventory = await readInventory(products)
    const revenue = orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((total, order) => total + Number(order.total || 0), 0)
    response.json({
      metrics: {
        products: products.length,
        activeProducts: products.filter((product) => !product.status || product.status === 'active').length,
        orders: orders.length,
        newOrders: orders.filter((order) => order.status === 'new').length,
        revenue,
        customers: new Set(orders.map((order) => order.customer?.email).filter(Boolean)).size,
        lowStock: inventory.filter((item) => item.stock <= item.lowStockThreshold).length,
        unitsInStock: inventory.reduce((total, item) => total + item.stock, 0),
      },
      recentOrders: orders.slice(0, 5),
    })
  } catch (error) { next(error) }
})

app.get('/api/admin/orders', requireAdmin, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json({ orders: await readOrders() })
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (request, response, next) => {
  try {
    const allowedStatuses = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled']
    const allowedPaymentStatuses = ['unpaid', 'review', 'paid', 'refunded']
    const orders = await readOrders()
    const index = orders.findIndex((order) => order.id === request.params.id)
    if (index === -1) return response.status(404).json({ error: 'Order not found.' })
    const current = orders[index]
    const status = allowedStatuses.includes(request.body.status) ? request.body.status : current.status
    const paymentStatus = allowedPaymentStatuses.includes(request.body.paymentStatus) ? request.body.paymentStatus : current.paymentStatus
    if (current.status === 'cancelled' && status !== 'cancelled') {
      return response.status(409).json({ error: 'Cancelled orders cannot be reopened. Create a new order instead.' })
    }
    const updated = { ...current, status, paymentStatus, updatedAt: new Date().toISOString() }

    if (status === 'cancelled' && current.status !== 'cancelled' && !current.inventoryRestoredAt) {
      const products = await readProducts()
      const inventory = await readInventory(products)
      const inventoryMap = new Map(inventory.map((item) => [item.id, item]))
      current.items.forEach((item) => {
        const stockItem = inventoryMap.get(inventoryId(item.productId, item.variantId))
        if (stockItem) {
          stockItem.stock += item.quantity
          stockItem.updatedAt = new Date().toISOString()
        }
      })
      updated.inventoryRestoredAt = new Date().toISOString()
      orders[index] = updated
      await Promise.all([writeJson(ordersFile, orders), writeJson(inventoryFile, inventory)])
    } else {
      orders[index] = updated
      await writeJson(ordersFile, orders)
    }
    response.json({ order: updated })
  } catch (error) { next(error) }
})

app.get('/api/admin/inventory', requireAdmin, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json({ inventory: await readInventory() })
  } catch (error) { next(error) }
})

app.patch('/api/admin/inventory/:id', requireAdmin, async (request, response, next) => {
  try {
    const products = await readProducts()
    const inventory = await readInventory(products)
    const index = inventory.findIndex((item) => item.id === request.params.id)
    if (index === -1) return response.status(404).json({ error: 'Inventory item not found.' })
    inventory[index] = {
      ...inventory[index],
      stock: Math.max(0, Math.floor(Number(request.body.stock ?? inventory[index].stock))),
      lowStockThreshold: Math.max(0, Math.floor(Number(request.body.lowStockThreshold ?? inventory[index].lowStockThreshold))),
      sku: cleanText(request.body.sku, inventory[index].sku),
      updatedAt: new Date().toISOString(),
    }
    await writeJson(inventoryFile, inventory)
    response.json({ item: inventory[index] })
  } catch (error) { next(error) }
})

app.get('/api/admin/customers', requireAdmin, async (_request, response, next) => {
  try {
    const orders = await readOrders()
    const customers = new Map()
    orders.forEach((order) => {
      const email = order.customer?.email
      if (!email) return
      const current = customers.get(email) || {
        ...order.customer,
        orders: 0,
        totalSpent: 0,
        lastOrderAt: order.createdAt,
      }
      current.orders += 1
      if (order.status !== 'cancelled') current.totalSpent += Number(order.total || 0)
      if (new Date(order.createdAt) > new Date(current.lastOrderAt)) current.lastOrderAt = order.createdAt
      customers.set(email, current)
    })
    response.json({ customers: [...customers.values()].sort((a, b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt)) })
  } catch (error) { next(error) }
})

app.use((error, _request, response, _next) => {
  const status = error instanceof multer.MulterError || error instanceof SyntaxError ? 400 : 500
  console.error(error)
  response.status(status).json({ error: error.message || 'Unexpected server error.' })
})

if (isProduction) {
  const distDirectory = path.join(projectRoot, 'dist')
  if (!existsSync(distDirectory)) throw new Error('Run npm run build before starting production mode.')
  app.use(express.static(distDirectory))
  app.use((_request, response) => response.sendFile(path.join(distDirectory, 'index.html')))
} else {
  const vite = await createViteServer({ root: projectRoot, appType: 'spa', server: { middlewareMode: true } })
  app.use(vite.middlewares)
}

app.listen(port, '127.0.0.1', () => {
  console.log(`ORION ${isProduction ? 'production' : 'development'} server: http://127.0.0.1:${port}`)
  if (!process.env.ORION_ADMIN_PASSWORD) console.log('Demo admin login: admin / orion-admin')
})
