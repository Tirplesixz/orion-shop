import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { createServer as createViteServer } from 'vite'
import { prisma } from './db.js'
import { sendOrderConfirmation, sendPasswordResetEmail, sendSmtpTest, sendVerificationEmail, smtpConfigured, verifySmtpConnection } from './mailer.js'

const currentFile = fileURLToPath(import.meta.url)
const serverDirectory = path.dirname(currentFile)
const projectRoot = path.resolve(serverDirectory, '..')
const uploadDirectory = path.join(projectRoot, 'public', 'media', 'uploads')
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 5173)
const sessionLifetime = 8 * 60 * 60 * 1000
const customerSessionLifetime = 30 * 24 * 60 * 60 * 1000
const taxRate = Math.max(0, Number(process.env.STORE_TAX_RATE || 0.07))
const flatShippingFee = Math.max(0, Number(process.env.STORE_SHIPPING_FEE || 120))
const sessionSecret = process.env.SESSION_SECRET || 'orion-local-development-session-secret'
const appBaseUrl = (process.env.APP_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '')
if (isProduction && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production.')

await mkdir(uploadDirectory, { recursive: true })

const cleanText = (value, fallback = '') => String(value ?? fallback).trim()
const numeric = (value) => value === null || value === undefined ? 0 : Number(value)
const statusLower = (value) => String(value || '').toLowerCase()
const statusUpper = (value) => String(value || '').toUpperCase()
const hashToken = (token) => createHash('sha256').update(`${token}:${sessionSecret}`).digest('hex')
const parseCookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2))
const requestToken = (request) => request.headers.authorization?.replace(/^Bearer\s+/i, '') || parseCookies(request).orion_session || ''
const sessionCookie = (token, maxAge) => `orion_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${isProduction ? '; Secure' : ''}`

async function createSession({ adminId = null, customerId = null, lifetime = sessionLifetime, request = null }) {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({ data: { tokenHash: hashToken(token), adminId, customerId, expiresAt: new Date(Date.now() + lifetime), userAgent: cleanText(request?.headers?.['user-agent']).slice(0, 300) || null, ipAddress: cleanText(request?.ip || request?.socket?.remoteAddress).slice(0, 80) || null } })
  return token
}

async function createAccountToken(customerId, type, lifetime) {
  const token = randomBytes(32).toString('hex')
  await prisma.$transaction([
    prisma.accountToken.deleteMany({ where: { customerId, type } }),
    prisma.accountToken.create({ data: { tokenHash: hashToken(token), type, customerId, expiresAt: new Date(Date.now() + lifetime) } }),
  ])
  return token
}

const publicCustomer = (customer) => ({ id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, emailVerified: Boolean(customer.emailVerifiedAt), preferredLanguage: customer.preferredLanguage })

async function resolveSession(request) {
  const token = requestToken(request)
  if (!token) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true, customer: true } })
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  return { ...session, rawToken: token }
}

async function requireAdmin(request, response, next) {
  try {
    const session = await resolveSession(request)
    if (!session?.admin) return response.status(401).json({ error: 'Admin authentication required.' })
    request.auth = session
    next()
  } catch (error) { next(error) }
}

async function requireCustomer(request, response, next) {
  try {
    const session = await resolveSession(request)
    if (!session?.customer) return response.status(401).json({ error: 'Customer authentication required.' })
    request.auth = session
    next()
  } catch (error) { next(error) }
}

const requireOwner = async (request, response, next) => {
  await requireAdmin(request, response, () => request.auth.admin.role === 'owner' ? next() : response.status(403).json({ error: 'Owner permission required.' }))
}
const requireManager = async (request, response, next) => {
  await requireAdmin(request, response, () => ['owner','manager'].includes(request.auth.admin.role) ? next() : response.status(403).json({ error: 'Manager permission required.' }))
}

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, uploadDirectory),
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg'
      const stem = path.basename(file.originalname, extension).normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'product'
      callback(null, `${Date.now()}-${randomBytes(4).toString('hex')}-${stem}${extension}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_request, file, callback) => allowedImageTypes.has(file.mimetype) ? callback(null, true) : callback(new Error('Only JPG, PNG, WebP and AVIF images are supported.')),
})

const uploadedPath = (file) => `/media/uploads/${file.filename}`
const productInclude = { variants: { include: { inventory: true }, orderBy: { label: 'asc' } } }

function serializeProduct(product) {
  return {
    id: product.id,
    slug: product.slug,
    collection: product.collection,
    name: product.name,
    nameTh: product.nameTh,
    eyebrow: product.eyebrow,
    description: product.description,
    descriptionTh: product.descriptionTh,
    theme: product.theme,
    campaignImage: product.campaignImage,
    images: product.images,
    price: product.price === null ? null : numeric(product.price),
    currency: product.currency,
    priceLabel: product.priceLabel,
    material: product.material,
    materialTh: product.materialTh,
    care: product.care,
    careTh: product.careTh,
    fit: product.fit,
    fitTh: product.fitTh,
    category: product.category,
    categoryTh: product.categoryTh,
    sortOrder: product.sortOrder,
    weightGrams: product.weightGrams,
    fulfillmentType: product.fulfillmentType,
    sizeGuide: product.sizeGuide,
    status: statusLower(product.status),
    variants: (product.variants || []).map((variant) => ({
      id: variant.code,
      label: variant.label,
      color: variant.color,
      colorTh: variant.colorTh,
      colorHex: variant.colorHex,
      images: variant.images,
      barcode: variant.barcode,
      stock: variant.inventory?.stock ?? 0,
      reserved: variant.inventory?.reserved ?? 0,
      unitCost: variant.inventory?.unitCost === null || variant.inventory?.unitCost === undefined ? null : numeric(variant.inventory.unitCost),
      available: variant.available && ((variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0)) > 0,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

function serializeOrder(order) {
  return {
    ...order,
    status: statusLower(order.status),
    paymentStatus: statusLower(order.paymentStatus),
    subtotal: numeric(order.subtotal),
    discount: numeric(order.discount),
    shippingFee: numeric(order.shippingFee),
    tax: numeric(order.tax),
    total: numeric(order.total),
    items: (order.items || []).map((item) => ({ ...item, unitPrice: item.unitPrice === null ? null : numeric(item.unitPrice), lineTotal: item.lineTotal === null ? null : numeric(item.lineTotal) })),
    shipment: order.shipment ? { ...order.shipment, status: statusLower(order.shipment.status) } : null,
    timeline: (order.timeline || []).map((entry) => ({ ...entry, status: statusLower(entry.status) })),
  }
}

async function audit(adminId, action, entity, entityId = null, metadata = null) {
  await prisma.auditLog.create({ data: { adminId, action, entity, entityId, metadata: metadata || undefined } })
}

function orderNumber() {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `ORI-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use((request, response, next) => {
  response.set('X-Content-Type-Options', 'nosniff')
  response.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use('/api', (request, response, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return next()
  const origin = request.get('origin')
  if (!origin) return next()
  try {
    if (new URL(origin).origin !== new URL(appBaseUrl).origin) return response.status(403).json({ error: 'Cross-origin request rejected.' })
  } catch { return response.status(403).json({ error: 'Invalid request origin.' }) }
  next()
})

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

app.get('/api/health', async (_request, response, next) => {
  try { await prisma.$queryRaw`SELECT 1`; response.json({ ok: true, storage: 'postgresql' }) } catch (error) { next(error) }
})

app.get('/api/store/config', async (_request, response, next) => {
  try {
    const shippingMethods = await prisma.shippingMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    response.json({ currency: 'THB', taxRate, shippingFee: flatShippingFee, paymentMode: 'sandbox', shippingMode: 'configured', shippingMethods: shippingMethods.map((method) => ({ ...method, fee: numeric(method.fee), freeAbove: method.freeAbove === null ? null : numeric(method.freeAbove) })) })
  } catch (error) { next(error) }
})

app.get('/api/store/legal', async (_request, response, next) => {
  try {
    const setting = await prisma.storeSetting.findUnique({ where: { key: 'legal' } })
    response.json(setting?.value || {})
  } catch (error) { next(error) }
})

app.get('/api/products', async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({ where: { status: 'ACTIVE' }, include: productInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    response.json({ products: products.map(serializeProduct) })
  } catch (error) { next(error) }
})

app.get('/api/products/:slug', async (request, response, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { slug: request.params.slug, status: 'ACTIVE' }, include: productInclude })
    if (!product) return response.status(404).json({ error: 'Product not found.' })
    response.json({ product: serializeProduct(product) })
  } catch (error) { next(error) }
})

app.post('/api/analytics/events', async (request, response, next) => {
  try {
    const name = cleanText(request.body.name).slice(0, 80)
    if (!name) return response.status(400).json({ error: 'Event name is required.' })
    await prisma.analyticsEvent.create({ data: { name, sessionKey: cleanText(request.body.sessionKey) || null, customerId: cleanText(request.body.customerId) || null, path: cleanText(request.body.path) || null, metadata: request.body.metadata || undefined } })
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/auth/register', authLimiter, async (request, response, next) => {
  try {
    const email = cleanText(request.body.email).toLowerCase()
    const password = String(request.body.password || '')
    const name = cleanText(request.body.name)
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !name) return response.status(400).json({ error: 'Name, valid email and password of at least 8 characters are required.' })
    const existing = await prisma.customer.findUnique({ where: { email } })
    if (existing?.passwordHash) return response.status(409).json({ error: 'An account already exists for this email.' })
    const passwordHash = await bcrypt.hash(password, 12)
    const preferredLanguage = request.body.preferredLanguage === 'th' ? 'th' : 'en'
    const customer = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { name, phone: cleanText(request.body.phone) || existing.phone, passwordHash, preferredLanguage, deletedAt: null } })
      : await prisma.customer.create({ data: { email, name, phone: cleanText(request.body.phone) || null, passwordHash, preferredLanguage } })
    const verificationToken = await createAccountToken(customer.id, 'EMAIL_VERIFICATION', 24 * 60 * 60 * 1000)
    const verificationUrl = `${appBaseUrl}/?verify=${verificationToken}`
    await sendVerificationEmail(customer, verificationUrl)
    const token = await createSession({ customerId: customer.id, lifetime: customerSessionLifetime, request })
    response.set('Set-Cookie', sessionCookie(token, customerSessionLifetime))
    response.status(201).json({ customer: publicCustomer(customer), verificationRequired: true, ...(!isProduction && !smtpConfigured ? { previewUrl: verificationUrl } : {}) })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { email: cleanText(request.body.email).toLowerCase() } })
    if (!customer?.passwordHash || customer.deletedAt || !await bcrypt.compare(String(request.body.password || ''), customer.passwordHash)) return response.status(401).json({ error: 'Email or password is incorrect.' })
    const token = await createSession({ customerId: customer.id, lifetime: customerSessionLifetime, request })
    response.set('Set-Cookie', sessionCookie(token, customerSessionLifetime))
    response.json({ customer: publicCustomer(customer) })
  } catch (error) { next(error) }
})

app.post('/api/auth/forgot-password', authLimiter, async (request, response, next) => {
  try {
    const email = cleanText(request.body.email).toLowerCase()
    const customer = await prisma.customer.findUnique({ where: { email } })
    let previewUrl
    if (customer?.passwordHash && !customer.deletedAt) {
      const token = await createAccountToken(customer.id, 'PASSWORD_RESET', 60 * 60 * 1000)
      const resetUrl = `${appBaseUrl}/?reset=${token}`
      await sendPasswordResetEmail(customer, resetUrl)
      if (!isProduction && !smtpConfigured) previewUrl = resetUrl
    }
    response.json({ ok: true, message: 'If this email has an account, a reset link has been sent.', ...(previewUrl ? { previewUrl } : {}) })
  } catch (error) { next(error) }
})

app.post('/api/auth/reset-password', authLimiter, async (request, response, next) => {
  try {
    const password = String(request.body.password || '')
    if (password.length < 8) return response.status(400).json({ error: 'Password must contain at least 8 characters.' })
    const accountToken = await prisma.accountToken.findUnique({ where: { tokenHash: hashToken(cleanText(request.body.token)) } })
    if (!accountToken || accountToken.type !== 'PASSWORD_RESET' || accountToken.usedAt || accountToken.expiresAt < new Date()) return response.status(400).json({ error: 'This reset link is invalid or expired.' })
    await prisma.$transaction([
      prisma.customer.update({ where: { id: accountToken.customerId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
      prisma.accountToken.update({ where: { id: accountToken.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { customerId: accountToken.customerId } }),
    ])
    response.set('Set-Cookie', sessionCookie('', 0))
    response.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/auth/verify-email', authLimiter, async (request, response, next) => {
  try {
    const accountToken = await prisma.accountToken.findUnique({ where: { tokenHash: hashToken(cleanText(request.body.token)) } })
    if (!accountToken || accountToken.type !== 'EMAIL_VERIFICATION' || accountToken.usedAt || accountToken.expiresAt < new Date()) return response.status(400).json({ error: 'This verification link is invalid or expired.' })
    await prisma.$transaction([
      prisma.customer.update({ where: { id: accountToken.customerId }, data: { emailVerifiedAt: new Date() } }),
      prisma.accountToken.update({ where: { id: accountToken.id }, data: { usedAt: new Date() } }),
    ])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    const token = requestToken(request)
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
    response.set('Set-Cookie', sessionCookie('', 0))
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/account', requireCustomer, async (request, response, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: request.auth.customer.id },
      include: {
        addresses: true,
        sessions: { orderBy: { lastSeenAt: 'desc' } },
        orders: { include: { items: true, shipment: true, timeline: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
        returns: { include: { items: true, order: { select: { orderNumber: true } } }, orderBy: { createdAt: 'desc' } },
      },
    })
    response.json({
      customer: { ...publicCustomer(customer), addresses: customer.addresses },
      orders: customer.orders.map(serializeOrder),
      returns: customer.returns.map((item) => ({ ...item, status: statusLower(item.status) })),
      sessions: customer.sessions.map((session) => ({ id: session.id, userAgent: session.userAgent, ipAddress: session.ipAddress, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, current: session.id === request.auth.id })),
    })
  } catch (error) { next(error) }
})

app.post('/api/account/resend-verification', requireCustomer, authLimiter, async (request, response, next) => {
  try {
    if (request.auth.customer.emailVerifiedAt) return response.json({ ok: true, alreadyVerified: true })
    const token = await createAccountToken(request.auth.customer.id, 'EMAIL_VERIFICATION', 24 * 60 * 60 * 1000)
    const verificationUrl = `${appBaseUrl}/?verify=${token}`
    await sendVerificationEmail(request.auth.customer, verificationUrl)
    response.json({ ok: true, ...(!isProduction && !smtpConfigured ? { previewUrl: verificationUrl } : {}) })
  } catch (error) { next(error) }
})

app.patch('/api/account/profile', requireCustomer, async (request, response, next) => {
  try {
    const name = cleanText(request.body.name)
    if (!name) return response.status(400).json({ error: 'Name is required.' })
    const customer = await prisma.customer.update({ where: { id: request.auth.customer.id }, data: { name, phone: cleanText(request.body.phone) || null, preferredLanguage: request.body.preferredLanguage === 'th' ? 'th' : 'en' } })
    response.json({ customer: publicCustomer(customer) })
  } catch (error) { next(error) }
})

app.patch('/api/account/password', requireCustomer, authLimiter, async (request, response, next) => {
  try {
    const currentPassword = String(request.body.currentPassword || '')
    const newPassword = String(request.body.newPassword || '')
    if (newPassword.length < 8) return response.status(400).json({ error: 'New password must contain at least 8 characters.' })
    const customer = await prisma.customer.findUnique({ where: { id: request.auth.customer.id } })
    if (!customer?.passwordHash || !await bcrypt.compare(currentPassword, customer.passwordHash)) return response.status(401).json({ error: 'Current password is incorrect.' })
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } }),
      prisma.session.deleteMany({ where: { customerId: customer.id, id: { not: request.auth.id } } }),
    ])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

function addressData(body) {
  return {
    label: cleanText(body.label, 'Shipping'), recipient: cleanText(body.recipient), phone: cleanText(body.phone),
    address: cleanText(body.address), city: cleanText(body.city), province: cleanText(body.province) || null,
    postalCode: cleanText(body.postalCode), country: cleanText(body.country, 'Thailand'), isDefault: Boolean(body.isDefault),
  }
}

app.post('/api/account/addresses', requireCustomer, async (request, response, next) => {
  try {
    const data = addressData(request.body)
    if (!data.recipient || !data.phone || !data.address || !data.city || !data.postalCode) return response.status(400).json({ error: 'Recipient, phone and a complete address are required.' })
    const count = await prisma.address.count({ where: { customerId: request.auth.customer.id } })
    if (data.isDefault || count === 0) await prisma.address.updateMany({ where: { customerId: request.auth.customer.id }, data: { isDefault: false } })
    const address = await prisma.address.create({ data: { ...data, isDefault: data.isDefault || count === 0, customerId: request.auth.customer.id } })
    response.status(201).json({ address })
  } catch (error) { next(error) }
})

app.patch('/api/account/addresses/:id', requireCustomer, async (request, response, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: request.params.id, customerId: request.auth.customer.id } })
    if (!existing) return response.status(404).json({ error: 'Address not found.' })
    const data = addressData({ ...existing, ...request.body })
    if (data.isDefault) await prisma.address.updateMany({ where: { customerId: request.auth.customer.id }, data: { isDefault: false } })
    const address = await prisma.address.update({ where: { id: existing.id }, data })
    response.json({ address })
  } catch (error) { next(error) }
})

app.delete('/api/account/addresses/:id', requireCustomer, async (request, response, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: request.params.id, customerId: request.auth.customer.id } })
    if (!existing) return response.status(404).json({ error: 'Address not found.' })
    await prisma.address.delete({ where: { id: existing.id } })
    if (existing.isDefault) {
      const first = await prisma.address.findFirst({ where: { customerId: request.auth.customer.id }, orderBy: { createdAt: 'asc' } })
      if (first) await prisma.address.update({ where: { id: first.id }, data: { isDefault: true } })
    }
    response.status(204).end()
  } catch (error) { next(error) }
})

app.delete('/api/account/sessions/:id', requireCustomer, async (request, response, next) => {
  try {
    const session = await prisma.session.findFirst({ where: { id: request.params.id, customerId: request.auth.customer.id } })
    if (!session) return response.status(404).json({ error: 'Session not found.' })
    await prisma.session.delete({ where: { id: session.id } })
    if (session.id === request.auth.id) response.set('Set-Cookie', sessionCookie('', 0))
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/account/sessions/revoke-others', requireCustomer, async (request, response, next) => {
  try { await prisma.session.deleteMany({ where: { customerId: request.auth.customer.id, id: { not: request.auth.id } } }); response.status(204).end() } catch (error) { next(error) }
})

app.delete('/api/account', requireCustomer, authLimiter, async (request, response, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: request.auth.customer.id } })
    if (!customer?.passwordHash || !await bcrypt.compare(String(request.body.password || ''), customer.passwordHash)) return response.status(401).json({ error: 'Password is incorrect.' })
    const anonymousEmail = `deleted-${customer.id}@orion.invalid`
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { customerId: customer.id } }), prisma.accountToken.deleteMany({ where: { customerId: customer.id } }), prisma.address.deleteMany({ where: { customerId: customer.id } }),
      prisma.order.updateMany({ where: { customerId: customer.id }, data: { customerName: 'Deleted customer', customerEmail: anonymousEmail, customerPhone: '-', shippingAddress: 'Deleted', shippingCity: 'Deleted', shippingProvince: null, shippingPostalCode: '-', note: null } }),
      prisma.customer.update({ where: { id: customer.id }, data: { email: anonymousEmail, name: 'Deleted customer', phone: null, passwordHash: null, deletedAt: new Date() } }),
    ])
    response.set('Set-Cookie', sessionCookie('', 0))
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/coupons/validate', async (request, response, next) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { code: cleanText(request.body.code).toUpperCase() } })
    const now = new Date()
    if (!coupon || !coupon.active || (coupon.startsAt && coupon.startsAt > now) || (coupon.expiresAt && coupon.expiresAt < now) || (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)) return response.status(404).json({ error: 'Coupon is invalid or expired.' })
    response.json({ coupon: { code: coupon.code, type: statusLower(coupon.type), value: numeric(coupon.value), minSubtotal: numeric(coupon.minSubtotal) } })
  } catch (error) { next(error) }
})

app.post('/api/cart/reserve', async (request, response, next) => {
  try {
    const sessionKey = cleanText(request.body.sessionKey).slice(0, 100)
    const items = Array.isArray(request.body.items) ? request.body.items : []
    if (!sessionKey || !items.length) return response.status(400).json({ error: 'Cart session and items are required.' })
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await prisma.$transaction(async (tx) => {
      const expired = await tx.stockReservation.findMany({ where: { status: 'active', expiresAt: { lt: new Date() } } })
      for (const reservation of expired) await tx.inventory.updateMany({ where: { variantId: reservation.variantId }, data: { reserved: { decrement: reservation.quantity } } })
      if (expired.length) await tx.stockReservation.updateMany({ where: { id: { in: expired.map((item) => item.id) } }, data: { status: 'released' } })
      const old = await tx.stockReservation.findMany({ where: { sessionKey, status: 'active' } })
      for (const reservation of old) await tx.inventory.updateMany({ where: { variantId: reservation.variantId }, data: { reserved: { decrement: reservation.quantity } } })
      await tx.stockReservation.updateMany({ where: { sessionKey, status: 'active' }, data: { status: 'released' } })
      for (const item of items) {
        const variant = await tx.variant.findFirst({ where: { productId: cleanText(item.productId), code: cleanText(item.variantId), available: true }, include: { inventory: true } })
        const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1))
        if (!variant?.inventory || variant.inventory.stock - variant.inventory.reserved < quantity) throw Object.assign(new Error('A selected item no longer has enough available stock.'), { status: 409 })
        await tx.inventory.update({ where: { id: variant.inventory.id }, data: { reserved: { increment: quantity } } })
        await tx.stockReservation.create({ data: { variantId: variant.id, sessionKey, quantity, expiresAt } })
      }
    })
    response.json({ ok: true, expiresAt })
  } catch (error) { error.status ? response.status(error.status).json({ error: error.message }) : next(error) }
})

app.delete('/api/cart/reserve/:sessionKey', async (request, response, next) => {
  try {
    const reservations = await prisma.stockReservation.findMany({ where: { sessionKey: request.params.sessionKey, status: 'active' } })
    await prisma.$transaction(async (tx) => {
      for (const item of reservations) await tx.inventory.updateMany({ where: { variantId: item.variantId }, data: { reserved: { decrement: item.quantity } } })
      await tx.stockReservation.updateMany({ where: { sessionKey: request.params.sessionKey, status: 'active' }, data: { status: 'released' } })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/orders', async (request, response, next) => {
  try {
    const customerInput = request.body.customer || {}
    const address = request.body.shippingAddress || {}
    const requestedItems = Array.isArray(request.body.items) ? request.body.items : []
    const email = cleanText(customerInput.email).toLowerCase()
    const phone = cleanText(customerInput.phone).replace(/[\s-]/g, '')
    const postalCode = cleanText(address.postalCode)
    if (!cleanText(customerInput.name) || !/^\S+@\S+\.\S+$/.test(email) || !/^(?:\+66|0)\d{8,9}$/.test(phone)) return response.status(400).json({ error: 'Name, a valid email and Thai phone number are required.' })
    if (!cleanText(address.address) || !cleanText(address.city) || !/^\d{5}$/.test(postalCode)) return response.status(400).json({ error: 'A complete address and 5-digit postal code are required.' })
    if (!requestedItems.length || requestedItems.length > 20) return response.status(400).json({ error: 'Your order must contain between 1 and 20 items.' })

    const result = await prisma.$transaction(async (tx) => {
      const sessionKey = cleanText(request.body.sessionKey)
      const customer = await tx.customer.upsert({
        where: { email },
        update: { name: cleanText(customerInput.name), phone: cleanText(customerInput.phone) },
        create: { email, name: cleanText(customerInput.name), phone: cleanText(customerInput.phone) },
      })
      const number = orderNumber()
      const resolved = []
      for (const requested of requestedItems) {
        const product = await tx.product.findFirst({ where: { id: cleanText(requested.productId), status: 'ACTIVE' }, include: productInclude })
        if (!product) throw Object.assign(new Error('One of the selected products is no longer available.'), { status: 409 })
        const variant = product.variants.find((item) => item.code === cleanText(requested.variantId))
        const quantity = Math.max(1, Math.min(10, Math.floor(Number(requested.quantity) || 1)))
        if (!variant?.available || !variant.inventory) throw Object.assign(new Error(`Please select an available size for ${product.name}.`), { status: 409 })
        const held = sessionKey ? await tx.stockReservation.findFirst({ where: { sessionKey, variantId: variant.id, status: 'active', expiresAt: { gt: new Date() } } }) : null
        if (variant.inventory.stock - variant.inventory.reserved + (held?.quantity || 0) < quantity) throw Object.assign(new Error(`${product.name} / ${variant.label} has insufficient available stock.`), { status: 409 })
        const changed = await tx.inventory.updateMany({ where: { id: variant.inventory.id, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
        if (!changed.count) throw Object.assign(new Error(`${product.name} / ${variant.label} has insufficient stock.`), { status: 409 })
        const balance = variant.inventory.stock - quantity
        await tx.stockMovement.create({ data: { inventoryId: variant.inventory.id, type: 'SALE', quantity: -quantity, balance, reference: number } })
        const unitPrice = product.price === null ? null : numeric(product.price)
        resolved.push({
          productId: product.id, variantId: variant.id, productName: product.name, productSlug: product.slug,
          image: product.campaignImage?.src || product.images?.[0]?.src || '', variantLabel: variant.label,
          quantity, unitPrice, lineTotal: unitPrice === null ? null : unitPrice * quantity,
        })
      }

      const subtotal = resolved.reduce((sum, item) => sum + (item.lineTotal || 0), 0)
      const hasPriceOnRequest = resolved.some((item) => item.lineTotal === null)
      let coupon = null
      let discount = 0
      const couponCode = cleanText(request.body.couponCode).toUpperCase()
      if (couponCode) {
        coupon = await tx.coupon.findUnique({ where: { code: couponCode } })
        const now = new Date()
        const valid = coupon?.active && numeric(coupon.minSubtotal) <= subtotal && (!coupon.startsAt || coupon.startsAt <= now) && (!coupon.expiresAt || coupon.expiresAt >= now) && (coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit)
        if (!valid) throw Object.assign(new Error('Coupon is invalid, expired or does not meet the minimum spend.'), { status: 400 })
        discount = coupon.type === 'PERCENT' ? subtotal * (numeric(coupon.value) / 100) : numeric(coupon.value)
        discount = Math.min(subtotal, Math.round(discount * 100) / 100)
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } })
      }
      const shippingMethod = await tx.shippingMethod.findFirst({ where: { code: cleanText(request.body.shippingMethod, 'standard'), active: true } }) || await tx.shippingMethod.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
      if (!shippingMethod) throw Object.assign(new Error('No shipping method is currently available.'), { status: 409 })
      if (shippingMethod.provinceGroup === 'bangkok' && !/bangkok|กรุงเทพ/i.test(cleanText(address.province))) throw Object.assign(new Error('The selected delivery method is available in Bangkok only.'), { status: 400 })
      const methodFee = shippingMethod.freeAbove !== null && subtotal >= numeric(shippingMethod.freeAbove) ? 0 : numeric(shippingMethod.fee)
      const shippingFee = hasPriceOnRequest ? 0 : methodFee
      const taxable = Math.max(0, subtotal - discount + shippingFee)
      const tax = hasPriceOnRequest ? 0 : Math.round(taxable * taxRate * 100) / 100
      const total = taxable + tax
      const order = await tx.order.create({
        data: {
          orderNumber: number,
          customerId: customer.id,
          customerName: cleanText(customerInput.name), customerEmail: email, customerPhone: cleanText(customerInput.phone),
          shippingAddress: cleanText(address.address), shippingCity: cleanText(address.city), shippingProvince: cleanText(address.province) || null,
          shippingPostalCode: postalCode, shippingCountry: cleanText(address.country, 'Thailand'), note: cleanText(request.body.note) || null,
          shippingMethodCode: shippingMethod.code, shippingMethodName: request.body.language === 'th' ? shippingMethod.nameTh : shippingMethod.name,
          invoiceRequested: Boolean(request.body.invoiceRequested), invoiceNumber: request.body.invoiceRequested ? `TAX-${number}` : null,
          taxId: cleanText(request.body.taxId) || null, companyName: cleanText(request.body.companyName) || null, billingAddress: cleanText(request.body.billingAddress) || null,
          subtotal, discount, shippingFee, tax, total, hasPriceOnRequest, couponCode: coupon?.code || null,
          items: { create: resolved }, timeline: { create: { status: 'NEW', note: 'Order placed' } },
          paymentStatus: hasPriceOnRequest ? 'REVIEW' : 'UNPAID',
          payments: { create: { provider: 'sandbox', providerRef: `sandbox-${randomBytes(8).toString('hex')}`, status: hasPriceOnRequest ? 'REVIEW' : 'UNPAID', amount: total, metadata: { mode: 'manual-confirmation' } } },
          shipment: { create: { carrier: 'Manual', status: 'PENDING' } },
        },
        include: { items: true, shipment: true, timeline: true, payments: true },
      })
      if (sessionKey) {
        const reservations = await tx.stockReservation.findMany({ where: { sessionKey, status: 'active' } })
        for (const reservation of reservations) await tx.inventory.updateMany({ where: { variantId: reservation.variantId }, data: { reserved: { decrement: reservation.quantity } } })
        await tx.stockReservation.updateMany({ where: { sessionKey, status: 'active' }, data: { status: 'converted' } })
      }
      return order
    }, { isolationLevel: 'Serializable' })

    sendOrderConfirmation({ ...result, language: request.body.language === 'th' ? 'th' : 'en' }).catch((error) => console.error('Email delivery failed:', error.message))
    response.status(201).json({ order: { id: result.id, orderNumber: result.orderNumber, status: statusLower(result.status), paymentStatus: statusLower(result.paymentStatus), subtotal: numeric(result.subtotal), discount: numeric(result.discount), shippingFee: numeric(result.shippingFee), tax: numeric(result.tax), total: numeric(result.total), hasPriceOnRequest: result.hasPriceOnRequest, shippingMethodName: result.shippingMethodName, invoiceRequested: result.invoiceRequested, invoiceNumber: result.invoiceNumber, companyName: result.companyName, taxId: result.taxId, billingAddress: result.billingAddress, items: result.items.map((item) => ({ productName: item.productName, variantLabel: item.variantLabel, quantity: item.quantity, lineTotal: item.lineTotal === null ? null : numeric(item.lineTotal) })) } })
  } catch (error) { error.status ? response.status(error.status).json({ error: error.message }) : next(error) }
})

app.post('/api/payments/sandbox/:orderNumber/confirm', async (request, response, next) => {
  try {
    const email = cleanText(request.body.email).toLowerCase()
    const order = await prisma.order.findFirst({ where: { orderNumber: request.params.orderNumber, customerEmail: email }, include: orderRelations })
    if (!order) return response.status(404).json({ error: 'Order not found.' })
    if (order.hasPriceOnRequest) return response.status(409).json({ error: 'This order requires a private price confirmation.' })
    if (order.status === 'CANCELLED') return response.status(409).json({ error: 'Cancelled orders cannot be paid.' })
    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: 'PAID', metadata: { mode: 'sandbox', confirmedAt: new Date().toISOString() } } })
      return tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: order.status === 'NEW' ? 'CONFIRMED' : order.status, timeline: order.status === 'NEW' ? { create: { status: 'CONFIRMED', note: 'Sandbox payment confirmed' } } : undefined }, include: orderRelations })
    })
    response.json({ order: serializeOrder(updated) })
  } catch (error) { next(error) }
})

app.post('/api/account/returns', requireCustomer, async (request, response, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: cleanText(request.body.orderId), customerId: request.auth.customer.id }, include: { items: true } })
    if (!order || !['COMPLETED', 'SHIPPED'].includes(order.status)) return response.status(409).json({ error: 'This order is not eligible for a return.' })
    const reason = cleanText(request.body.reason)
    if (!reason) return response.status(400).json({ error: 'Please provide a reason for the return.' })
    const existing = await prisma.returnRequest.findFirst({ where: { orderId: order.id, customerId: request.auth.customer.id, status: { in: ['REQUESTED', 'APPROVED'] } } })
    if (existing) return response.status(409).json({ error: 'A return request is already open for this order.' })
    const requested = Array.isArray(request.body.items) ? request.body.items : []
    const items = requested.map((item) => {
      const orderItem = order.items.find((entry) => entry.id === item.orderItemId)
      if (!orderItem) throw Object.assign(new Error('Invalid return item.'), { status: 400 })
      return { orderItemId: orderItem.id, quantity: Math.max(1, Math.min(orderItem.quantity, Number(item.quantity) || 1)) }
    })
    if (!items.length) return response.status(400).json({ error: 'Select at least one item to return.' })
    const created = await prisma.returnRequest.create({ data: { orderId: order.id, customerId: request.auth.customer.id, reason, note: cleanText(request.body.note) || null, items: { create: items } }, include: { items: true } })
    response.status(201).json({ return: { ...created, status: statusLower(created.status) } })
  } catch (error) { error.status ? response.status(error.status).json({ error: error.message }) : next(error) }
})

app.post('/api/admin/login', authLimiter, async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    const admin = await prisma.adminUser.findUnique({ where: { username: cleanText(request.body.username) } })
    if (!admin?.active || !await bcrypt.compare(String(request.body.password || ''), admin.passwordHash)) return response.status(401).json({ error: 'Username or password is incorrect.' })
    const token = await createSession({ adminId: admin.id, request })
    response.set('Set-Cookie', sessionCookie(token, sessionLifetime))
    await audit(admin.id, 'LOGIN', 'AdminUser', admin.id)
    response.json({ token, expiresIn: sessionLifetime, admin: { id: admin.id, name: admin.name, role: admin.role } })
  } catch (error) { next(error) }
})

app.post('/api/admin/logout', requireAdmin, async (request, response, next) => {
  try {
    await prisma.session.delete({ where: { id: request.auth.id } })
    response.set('Set-Cookie', sessionCookie('', 0))
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/admin/session', requireAdmin, (request, response) => response.json({ authenticated: true, admin: { id: request.auth.admin.id, name: request.auth.admin.name, role: request.auth.admin.role } }))

app.get('/api/admin/system/email', requireAdmin, async (_request, response) => {
  if (!smtpConfigured) return response.json({ configured: false, connected: false })
  try { response.json(await verifySmtpConnection()) } catch (error) { response.json({ configured: true, connected: false, error: error.message }) }
})
app.post('/api/admin/system/email/test', requireOwner, async (request, response, next) => {
  try { if (!smtpConfigured) return response.status(409).json({ error: 'SMTP credentials are not configured.' }); await sendSmtpTest(cleanText(request.body.email), request.body.language === 'th' ? 'th' : 'en'); response.json({ ok: true }) } catch (error) { next(error) }
})

app.get('/api/admin/users', requireOwner, async (_request, response, next) => {
  try { response.json({ users: await prisma.adminUser.findMany({ select: { id: true, username: true, email: true, name: true, role: true, active: true, createdAt: true }, orderBy: { createdAt: 'asc' } }) }) } catch (error) { next(error) }
})

app.post('/api/admin/users', requireOwner, authLimiter, async (request, response, next) => {
  try {
    const password = String(request.body.password || '')
    if (password.length < 10) return response.status(400).json({ error: 'Admin password must contain at least 10 characters.' })
    const role = ['owner','manager','fulfillment'].includes(request.body.role) ? request.body.role : 'fulfillment'
    const user = await prisma.adminUser.create({ data: { username: cleanText(request.body.username), email: cleanText(request.body.email).toLowerCase(), name: cleanText(request.body.name), role, passwordHash: await bcrypt.hash(password, 12) }, select: { id: true, username: true, email: true, name: true, role: true, active: true } })
    await audit(request.auth.admin.id, 'CREATE', 'AdminUser', user.id, { role })
    response.status(201).json({ user })
  } catch (error) { next(error) }
})

app.patch('/api/admin/users/:id', requireOwner, async (request, response, next) => {
  try {
    if (request.params.id === request.auth.admin.id && request.body.active === false) return response.status(409).json({ error: 'You cannot disable your current account.' })
    const role = ['owner','manager','fulfillment'].includes(request.body.role) ? request.body.role : null
    const user = await prisma.adminUser.update({ where: { id: request.params.id }, data: { ...(role ? { role } : {}), ...(typeof request.body.active === 'boolean' ? { active: request.body.active } : {}) }, select: { id: true, username: true, email: true, name: true, role: true, active: true } })
    await audit(request.auth.admin.id, 'UPDATE', 'AdminUser', user.id, { role: user.role, active: user.active })
    response.json({ user })
  } catch (error) { next(error) }
})

app.get('/api/admin/shipping-methods', requireAdmin, async (_request, response, next) => {
  try { const methods = await prisma.shippingMethod.findMany({ orderBy: { sortOrder: 'asc' } }); response.json({ methods: methods.map((item) => ({ ...item, fee: numeric(item.fee), freeAbove: item.freeAbove === null ? null : numeric(item.freeAbove) })) }) } catch (error) { next(error) }
})

app.post('/api/admin/shipping-methods', requireManager, async (request, response, next) => {
  try { const method = await prisma.shippingMethod.create({ data: { code: cleanText(request.body.code), name: cleanText(request.body.name), nameTh: cleanText(request.body.nameTh), description: cleanText(request.body.description), descriptionTh: cleanText(request.body.descriptionTh), fee: Number(request.body.fee || 0), freeAbove: request.body.freeAbove === '' || request.body.freeAbove == null ? null : Number(request.body.freeAbove), provinceGroup: cleanText(request.body.provinceGroup, 'all'), estimatedDays: cleanText(request.body.estimatedDays, '2–4 business days'), active: request.body.active !== false, sortOrder: Number(request.body.sortOrder || 0) } }); response.status(201).json({ method }) } catch (error) { next(error) }
})

app.patch('/api/admin/shipping-methods/:id', requireManager, async (request, response, next) => {
  try { const method = await prisma.shippingMethod.update({ where: { id: request.params.id }, data: { name: cleanText(request.body.name), nameTh: cleanText(request.body.nameTh), description: cleanText(request.body.description), descriptionTh: cleanText(request.body.descriptionTh), fee: Number(request.body.fee || 0), freeAbove: request.body.freeAbove === '' || request.body.freeAbove == null ? null : Number(request.body.freeAbove), provinceGroup: cleanText(request.body.provinceGroup, 'all'), estimatedDays: cleanText(request.body.estimatedDays), active: request.body.active !== false, sortOrder: Number(request.body.sortOrder || 0) } }); response.json({ method }) } catch (error) { next(error) }
})

app.get('/api/admin/settings/legal', requireAdmin, async (_request, response, next) => { try { const setting = await prisma.storeSetting.findUnique({ where: { key: 'legal' } }); response.json({ legal: setting?.value || {} }) } catch (error) { next(error) } })
app.put('/api/admin/settings/legal', requireOwner, async (request, response, next) => { try { const setting = await prisma.storeSetting.upsert({ where: { key: 'legal' }, update: { value: request.body }, create: { key: 'legal', value: request.body } }); await audit(request.auth.admin.id, 'UPDATE', 'StoreSetting', 'legal'); response.json({ legal: setting.value }) } catch (error) { next(error) } })

function parseProductPayload(request) {
  if (typeof request.body.product === 'string') return JSON.parse(request.body.product)
  return request.body.product || request.body
}

async function saveProduct(payload, existing, files = []) {
  const fileMap = new Map(files.map((file) => [file.fieldname, file]))
  const name = cleanText(payload.name, existing?.name)
  const slug = cleanText(payload.slug, existing?.slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!name || !slug) throw Object.assign(new Error('Product name and slug are required.'), { status: 400 })
  const campaignUpload = fileMap.get('campaign')
  const campaignImage = {
    src: campaignUpload ? uploadedPath(campaignUpload) : cleanText(payload.campaignImage?.src, existing?.campaignImage?.src),
    alt: cleanText(payload.campaignImage?.alt, existing?.campaignImage?.alt || `${name} campaign image`),
  }
  const images = (Array.isArray(payload.images) ? payload.images : existing?.images || []).map((image, index) => {
    const imageUpload = fileMap.get(`image-${index}`)
    return { id: cleanText(image.id, `view-${index + 1}`), label: cleanText(image.label, `View ${index + 1}`), src: imageUpload ? uploadedPath(imageUpload) : cleanText(image.src), alt: cleanText(image.alt, `${image.label || `View ${index + 1}`} of ${name}`) }
  }).filter((image) => image.src)
  if (!campaignImage.src || !images.length) throw Object.assign(new Error('Campaign and at least one product image are required.'), { status: 400 })
  const variants = (Array.isArray(payload.variants) ? payload.variants : []).map((variant, index) => ({ code: cleanText(variant.id, `variant-${index + 1}`), label: cleanText(variant.label, `Option ${index + 1}`), color: cleanText(variant.color), colorTh: cleanText(variant.colorTh), colorHex: cleanText(variant.colorHex, '#111111'), images: variant.images || null, barcode: cleanText(variant.barcode) || null, available: variant.available !== false }))
  if (!variants.length) variants.push({ code: 'one-size', label: 'One size', color: '', colorTh: '', colorHex: '#111111', images: null, barcode: null, available: true })
  const id = existing?.id || cleanText(payload.id, `orion-${slug}-${randomBytes(4).toString('hex')}`)

  return prisma.$transaction(async (tx) => {
    const productData = {
      slug, collection: cleanText(payload.collection, existing?.collection || 'Collection 01'), name, nameTh: cleanText(payload.nameTh, existing?.nameTh || name),
      eyebrow: cleanText(payload.eyebrow, existing?.eyebrow || 'ORION / Signature piece'), description: cleanText(payload.description, existing?.description),
      descriptionTh: cleanText(payload.descriptionTh, existing?.descriptionTh || ''),
      theme: payload.theme || existing?.theme || {}, campaignImage, images,
      material: cleanText(payload.material, existing?.material || ''),
      materialTh: cleanText(payload.materialTh, existing?.materialTh || ''),
      care: cleanText(payload.care, existing?.care || ''),
      careTh: cleanText(payload.careTh, existing?.careTh || ''),
      fit: cleanText(payload.fit, existing?.fit || ''),
      fitTh: cleanText(payload.fitTh, existing?.fitTh || ''),
      category: cleanText(payload.category, existing?.category || 'Outerwear'), categoryTh: cleanText(payload.categoryTh, existing?.categoryTh || 'เสื้อคลุม'),
      sortOrder: Number(payload.sortOrder ?? existing?.sortOrder ?? 0), weightGrams: Math.max(0, Number(payload.weightGrams ?? existing?.weightGrams ?? 0)),
      fulfillmentType: ['ready', 'preorder'].includes(payload.fulfillmentType) ? payload.fulfillmentType : existing?.fulfillmentType || 'ready',
      sizeGuide: Array.isArray(payload.sizeGuide) ? payload.sizeGuide : (existing?.sizeGuide || []),
      price: payload.price === '' || payload.price === null || payload.price === undefined ? null : Number(payload.price),
      currency: cleanText(payload.currency, existing?.currency || 'THB'), priceLabel: cleanText(payload.priceLabel, existing?.priceLabel || 'Price on request'),
      status: ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(statusUpper(payload.status)) ? statusUpper(payload.status) : existing?.status || 'DRAFT',
    }
    const product = existing
      ? await tx.product.update({ where: { id }, data: productData })
      : await tx.product.create({ data: { id, ...productData } })
    const retainedCodes = []
    for (const variant of variants) {
      retainedCodes.push(variant.code)
      const savedVariant = await tx.variant.upsert({
        where: { productId_code: { productId: id, code: variant.code } },
        update: { label: variant.label, color: variant.color, colorTh: variant.colorTh, colorHex: variant.colorHex, images: variant.images, barcode: variant.barcode, available: variant.available },
        create: { productId: id, code: variant.code, label: variant.label, color: variant.color, colorTh: variant.colorTh, colorHex: variant.colorHex, images: variant.images, barcode: variant.barcode, available: variant.available },
      })
      await tx.inventory.upsert({
        where: { variantId: savedVariant.id }, update: {},
        create: { variantId: savedVariant.id, sku: `${slug}-${variant.code}`.toUpperCase(), stock: 0, lowStockThreshold: 2, movements: { create: { type: 'INITIAL', quantity: 0, balance: 0, note: 'Product created' } } },
      })
    }
    await tx.variant.updateMany({ where: { productId: id, code: { notIn: retainedCodes } }, data: { available: false } })
    return tx.product.findUnique({ where: { id }, include: productInclude })
  })
}

app.get('/api/admin/products', requireAdmin, async (_request, response, next) => {
  try { response.set('Cache-Control', 'no-store'); const products = await prisma.product.findMany({ include: productInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }); response.json({ products: products.map(serializeProduct) }) } catch (error) { next(error) }
})

app.patch('/api/admin/products/bulk', requireManager, async (request, response, next) => {
  try {
    const updates = Array.isArray(request.body.products) ? request.body.products.slice(0, 200) : []
    await prisma.$transaction(updates.map((item) => prisma.product.update({ where: { id: cleanText(item.id) }, data: { ...(item.status ? { status: statusUpper(item.status) } : {}), ...(item.category ? { category: cleanText(item.category) } : {}), ...(Number.isFinite(Number(item.sortOrder)) ? { sortOrder: Number(item.sortOrder) } : {}) } })))
    await audit(request.auth.admin.id, 'BULK_UPDATE', 'Product', null, { count: updates.length })
    response.json({ updated: updates.length })
  } catch (error) { next(error) }
})

app.get('/api/admin/products-export.csv', requireAdmin, async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({ include: productInclude, orderBy: { sortOrder: 'asc' } })
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [['id','slug','name','nameTh','category','categoryTh','price','status','sortOrder','weightGrams','fulfillmentType'], ...products.map((item) => [item.id,item.slug,item.name,item.nameTh,item.category,item.categoryTh,item.price ?? '',item.status,item.sortOrder,item.weightGrams,item.fulfillmentType])]
    response.type('text/csv').set('Content-Disposition', 'attachment; filename="orion-products.csv"').send(rows.map((row) => row.map(quote).join(',')).join('\n'))
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireManager, upload.any(), async (request, response, next) => {
  try {
    const product = await saveProduct(parseProductPayload(request), null, request.files)
    await audit(request.auth.admin.id, 'CREATE', 'Product', product.id, { slug: product.slug })
    response.status(201).json({ product: serializeProduct(product) })
  } catch (error) { error.status ? response.status(error.status).json({ error: error.message }) : next(error) }
})

app.patch('/api/admin/products/:id', requireManager, upload.any(), async (request, response, next) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: request.params.id }, include: productInclude })
    if (!existing) return response.status(404).json({ error: 'Product not found.' })
    const product = await saveProduct(parseProductPayload(request), existing, request.files)
    await audit(request.auth.admin.id, 'UPDATE', 'Product', product.id, { slug: product.slug })
    response.json({ product: serializeProduct(product) })
  } catch (error) { error.status ? response.status(error.status).json({ error: error.message }) : next(error) }
})

app.delete('/api/admin/products/:id', requireManager, async (request, response, next) => {
  try {
    const product = await prisma.product.update({ where: { id: request.params.id }, data: { status: 'ARCHIVED' }, include: productInclude })
    await audit(request.auth.admin.id, 'ARCHIVE', 'Product', product.id)
    response.json({ product: serializeProduct(product) })
  } catch (error) { next(error) }
})

const orderRelations = { items: true, shipment: true, timeline: { orderBy: { createdAt: 'asc' } }, payments: true }

app.get('/api/admin/overview', requireAdmin, async (_request, response, next) => {
  try {
    const [products, orders, customers, inventory, revenue, recentOrders] = await Promise.all([
      prisma.product.count(), prisma.order.count(), prisma.customer.count(), prisma.inventory.findMany(),
      prisma.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      prisma.order.findMany({ include: orderRelations, orderBy: { createdAt: 'desc' }, take: 5 }),
    ])
    response.json({ metrics: {
      products,
      activeProducts: await prisma.product.count({ where: { status: 'ACTIVE' } }),
      orders,
      newOrders: await prisma.order.count({ where: { status: 'NEW' } }),
      revenue: numeric(revenue._sum.total), customers,
      lowStock: inventory.filter((item) => item.stock <= item.lowStockThreshold).length,
      unitsInStock: inventory.reduce((sum, item) => sum + item.stock, 0),
    }, recentOrders: recentOrders.map(serializeOrder) })
  } catch (error) { next(error) }
})

app.get('/api/admin/orders', requireAdmin, async (_request, response, next) => {
  try { const orders = await prisma.order.findMany({ include: orderRelations, orderBy: { createdAt: 'desc' } }); response.json({ orders: orders.map(serializeOrder) }) } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (request, response, next) => {
  try {
    const existing = await prisma.order.findUnique({ where: { id: request.params.id }, include: orderRelations })
    if (!existing) return response.status(404).json({ error: 'Order not found.' })
    const nextStatus = ['NEW','CONFIRMED','PROCESSING','SHIPPED','COMPLETED','CANCELLED'].includes(statusUpper(request.body.status)) ? statusUpper(request.body.status) : existing.status
    const nextPayment = ['UNPAID','REVIEW','PAID','REFUNDED','FAILED'].includes(statusUpper(request.body.paymentStatus)) ? statusUpper(request.body.paymentStatus) : existing.paymentStatus
    if (existing.status === 'CANCELLED' && nextStatus !== 'CANCELLED') return response.status(409).json({ error: 'Cancelled orders cannot be reopened.' })
    const updated = await prisma.$transaction(async (tx) => {
      if (nextStatus === 'CANCELLED' && existing.status !== 'CANCELLED') {
        for (const item of existing.items) {
          const inventory = await tx.inventory.findUnique({ where: { variantId: item.variantId } })
          if (inventory) {
            const saved = await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { increment: item.quantity } } })
            await tx.stockMovement.create({ data: { inventoryId: inventory.id, type: 'CANCEL_RESTORE', quantity: item.quantity, balance: saved.stock, reference: existing.orderNumber } })
          }
        }
        if (existing.couponCode) await tx.coupon.updateMany({ where: { code: existing.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
      }
      if (nextPayment !== existing.paymentStatus) await tx.payment.updateMany({ where: { orderId: existing.id }, data: { status: nextPayment } })
      return tx.order.update({
        where: { id: existing.id },
        data: { status: nextStatus, paymentStatus: nextPayment, timeline: nextStatus !== existing.status ? { create: { status: nextStatus, note: cleanText(request.body.note) || `Status changed to ${statusLower(nextStatus)}` } } : undefined },
        include: orderRelations,
      })
    })
    await audit(request.auth.admin.id, 'UPDATE_STATUS', 'Order', updated.id, { status: nextStatus, paymentStatus: nextPayment })
    response.json({ order: serializeOrder(updated) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id/shipment', requireAdmin, async (request, response, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: request.params.id } })
    if (!order) return response.status(404).json({ error: 'Order not found.' })
    const shipmentStatus = ['PENDING','READY','SHIPPED','DELIVERED','RETURNED'].includes(statusUpper(request.body.status)) ? statusUpper(request.body.status) : 'PENDING'
    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      update: { carrier: cleanText(request.body.carrier, 'Manual'), trackingNumber: cleanText(request.body.trackingNumber) || null, trackingUrl: cleanText(request.body.trackingUrl) || null, status: shipmentStatus, shippedAt: shipmentStatus === 'SHIPPED' ? new Date() : undefined, deliveredAt: shipmentStatus === 'DELIVERED' ? new Date() : undefined },
      create: { orderId: order.id, carrier: cleanText(request.body.carrier, 'Manual'), trackingNumber: cleanText(request.body.trackingNumber) || null, trackingUrl: cleanText(request.body.trackingUrl) || null, status: shipmentStatus },
    })
    if (shipmentStatus === 'SHIPPED' && order.status !== 'SHIPPED') await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED', timeline: { create: { status: 'SHIPPED', note: `Tracking: ${shipment.trackingNumber || 'pending'}` } } } })
    await audit(request.auth.admin.id, 'UPDATE_SHIPMENT', 'Order', order.id, { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, status: shipment.status })
    response.json({ shipment: { ...shipment, status: statusLower(shipment.status) } })
  } catch (error) { next(error) }
})

app.get('/api/admin/inventory', requireAdmin, async (_request, response, next) => {
  try {
    const inventory = await prisma.inventory.findMany({ include: { variant: { include: { product: true } } }, orderBy: { sku: 'asc' } })
    response.json({ inventory: inventory.map((item) => ({ id: item.id, productId: item.variant.productId, productName: item.variant.product.name, variantId: item.variant.code, variantLabel: item.variant.label, color: item.variant.color, barcode: item.variant.barcode, sku: item.sku, stock: item.stock, reserved: item.reserved, available: Math.max(0, item.stock - item.reserved), unitCost: item.unitCost === null ? null : numeric(item.unitCost), lowStockThreshold: item.lowStockThreshold, fulfillmentType: item.variant.product.fulfillmentType, updatedAt: item.updatedAt })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/inventory/:id', requireAdmin, async (request, response, next) => {
  try {
    const existing = await prisma.inventory.findUnique({ where: { id: request.params.id }, include: { variant: { include: { product: true } } } })
    if (!existing) return response.status(404).json({ error: 'Inventory item not found.' })
    const stock = Math.max(0, Math.floor(Number(request.body.stock ?? existing.stock)))
    const item = await prisma.inventory.update({ where: { id: existing.id }, data: { sku: cleanText(request.body.sku, existing.sku), stock, unitCost: request.body.unitCost === '' || request.body.unitCost === null ? null : Number(request.body.unitCost ?? existing.unitCost), lowStockThreshold: Math.max(0, Math.floor(Number(request.body.lowStockThreshold ?? existing.lowStockThreshold))), movements: stock !== existing.stock ? { create: { type: 'MANUAL', quantity: stock - existing.stock, balance: stock, note: 'Admin adjustment' } } : undefined } })
    await audit(request.auth.admin.id, 'ADJUST_STOCK', 'Inventory', item.id, { from: existing.stock, to: stock })
    response.json({ item: { id: item.id, productId: existing.variant.productId, productName: existing.variant.product.name, variantId: existing.variant.code, variantLabel: existing.variant.label, sku: item.sku, stock: item.stock, reserved: item.reserved, available: Math.max(0, item.stock - item.reserved), unitCost: item.unitCost === null ? null : numeric(item.unitCost), lowStockThreshold: item.lowStockThreshold, updatedAt: item.updatedAt } })
  } catch (error) { next(error) }
})

app.get('/api/admin/customers', requireAdmin, async (_request, response, next) => {
  try {
    const customers = await prisma.customer.findMany({ include: { orders: { where: { status: { not: 'CANCELLED' } }, select: { total: true, createdAt: true } } }, orderBy: { updatedAt: 'desc' } })
    response.json({ customers: customers.map((customer) => ({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, hasAccount: Boolean(customer.passwordHash), orders: customer.orders.length, totalSpent: customer.orders.reduce((sum, order) => sum + numeric(order.total), 0), lastOrderAt: customer.orders.sort((a, b) => b.createdAt - a.createdAt)[0]?.createdAt || customer.createdAt })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/coupons', requireAdmin, async (_request, response, next) => {
  try { const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }); response.json({ coupons: coupons.map((coupon) => ({ ...coupon, type: statusLower(coupon.type), value: numeric(coupon.value), minSubtotal: numeric(coupon.minSubtotal) })) }) } catch (error) { next(error) }
})

app.post('/api/admin/coupons', requireManager, async (request, response, next) => {
  try {
    const code = cleanText(request.body.code).toUpperCase()
    if (!code) return response.status(400).json({ error: 'Coupon code is required.' })
    const coupon = await prisma.coupon.create({ data: { code, type: statusUpper(request.body.type) === 'FIXED' ? 'FIXED' : 'PERCENT', value: Math.max(0, Number(request.body.value)), minSubtotal: Math.max(0, Number(request.body.minSubtotal || 0)), usageLimit: request.body.usageLimit ? Math.max(1, Number(request.body.usageLimit)) : null, active: request.body.active !== false, startsAt: request.body.startsAt ? new Date(request.body.startsAt) : null, expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : null } })
    await audit(request.auth.admin.id, 'CREATE', 'Coupon', coupon.id, { code })
    response.status(201).json({ coupon: { ...coupon, type: statusLower(coupon.type), value: numeric(coupon.value), minSubtotal: numeric(coupon.minSubtotal) } })
  } catch (error) { next(error) }
})

app.patch('/api/admin/coupons/:id', requireManager, async (request, response, next) => {
  try {
    const coupon = await prisma.coupon.update({ where: { id: request.params.id }, data: { active: request.body.active, value: request.body.value === undefined ? undefined : Math.max(0, Number(request.body.value)), minSubtotal: request.body.minSubtotal === undefined ? undefined : Math.max(0, Number(request.body.minSubtotal)), usageLimit: request.body.usageLimit === undefined ? undefined : request.body.usageLimit ? Math.max(1, Number(request.body.usageLimit)) : null, expiresAt: request.body.expiresAt === undefined ? undefined : request.body.expiresAt ? new Date(request.body.expiresAt) : null } })
    await audit(request.auth.admin.id, 'UPDATE', 'Coupon', coupon.id, { code: coupon.code })
    response.json({ coupon: { ...coupon, type: statusLower(coupon.type), value: numeric(coupon.value), minSubtotal: numeric(coupon.minSubtotal) } })
  } catch (error) { next(error) }
})

app.get('/api/admin/returns', requireAdmin, async (_request, response, next) => {
  try {
    const returns = await prisma.returnRequest.findMany({ include: { customer: true, order: true, items: { include: { orderItem: true } } }, orderBy: { createdAt: 'desc' } })
    response.json({ returns: returns.map((item) => ({ ...item, status: statusLower(item.status) })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/returns/:id', requireAdmin, async (request, response, next) => {
  try {
    const existing = await prisma.returnRequest.findUnique({ where: { id: request.params.id }, include: { items: { include: { orderItem: true } }, order: true } })
    if (!existing) return response.status(404).json({ error: 'Return request not found.' })
    const nextStatus = ['REQUESTED','APPROVED','REJECTED','RECEIVED','REFUNDED'].includes(statusUpper(request.body.status)) ? statusUpper(request.body.status) : existing.status
    const allowedTransitions = {
      REQUESTED: ['APPROVED', 'REJECTED'],
      APPROVED: ['RECEIVED', 'REJECTED'],
      REJECTED: [],
      RECEIVED: ['REFUNDED'],
      REFUNDED: [],
    }
    if (nextStatus !== existing.status && !allowedTransitions[existing.status].includes(nextStatus)) return response.status(409).json({ error: `Return cannot move from ${statusLower(existing.status)} to ${statusLower(nextStatus)}.` })
    const updated = await prisma.$transaction(async (tx) => {
      if (['RECEIVED','REFUNDED'].includes(nextStatus) && !['RECEIVED','REFUNDED'].includes(existing.status)) {
        for (const item of existing.items) {
          const inventory = await tx.inventory.findUnique({ where: { variantId: item.orderItem.variantId } })
          if (inventory) {
            const saved = await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { increment: item.quantity } } })
            await tx.stockMovement.create({ data: { inventoryId: inventory.id, type: 'RETURN_RESTORE', quantity: item.quantity, balance: saved.stock, reference: existing.order.orderNumber } })
          }
        }
      }
      if (nextStatus === 'REFUNDED') {
        await tx.order.update({ where: { id: existing.orderId }, data: { paymentStatus: 'REFUNDED' } })
        await tx.payment.updateMany({ where: { orderId: existing.orderId }, data: { status: 'REFUNDED' } })
      }
      return tx.returnRequest.update({ where: { id: existing.id }, data: { status: nextStatus, note: cleanText(request.body.note, existing.note) || null }, include: { customer: true, order: true, items: { include: { orderItem: true } } } })
    })
    await audit(request.auth.admin.id, 'UPDATE_STATUS', 'ReturnRequest', updated.id, { status: nextStatus })
    response.json({ return: { ...updated, status: statusLower(updated.status) } })
  } catch (error) { next(error) }
})

app.get('/api/admin/analytics', requireAdmin, async (_request, response, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [events, orders, topItems] = await Promise.all([
      prisma.analyticsEvent.groupBy({ by: ['name'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.order.findMany({ where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } }, select: { total: true, createdAt: true } }),
      prisma.orderItem.groupBy({ by: ['productId', 'productName'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }),
    ])
    response.json({ period: '30d', events: events.map((event) => ({ name: event.name, count: event._count._all })), revenue: orders.reduce((sum, order) => sum + numeric(order.total), 0), orders: orders.length, topProducts: topItems.map((item) => ({ productId: item.productId, name: item.productName, units: item._sum.quantity || 0 })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/audit', requireAdmin, async (_request, response, next) => {
  try { const logs = await prisma.auditLog.findMany({ include: { admin: { select: { name: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); response.json({ logs }) } catch (error) { next(error) }
})

app.use((error, _request, response, _next) => {
  const status = error instanceof multer.MulterError || error instanceof SyntaxError ? 400 : error.code === 'P2002' ? 409 : 500
  console.error(error)
  response.status(status).json({ error: status === 500 ? 'Unexpected server error.' : error.message })
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

const host = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1')
const server = app.listen(port, host, () => console.log(`ORION PostgreSQL ${isProduction ? 'production' : 'development'} server: http://${host}:${port}`))

async function shutdown() {
  server.close(async () => { await prisma.$disconnect(); process.exit(0) })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
