import { FALLBACK_PRODUCTS } from '../data/products'

const configuredApiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API_BASE_URL = configuredApiUrl || '/api'
const thaiErrors = [
  [/authentication required/i, 'กรุณาเข้าสู่ระบบก่อน'], [/incorrect/i, 'ข้อมูลที่กรอกไม่ถูกต้อง'], [/valid email/i, 'กรุณากรอกอีเมลให้ถูกต้อง'], [/at least 8 characters/i, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'], [/address.*required/i, 'กรุณากรอกที่อยู่ให้ครบถ้วน'], [/postal code/i, 'กรุณากรอกรหัสไปรษณีย์ 5 หลัก'], [/phone number/i, 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง'], [/insufficient.*stock|enough available stock/i, 'สินค้าในสต็อกไม่เพียงพอ'], [/select an available size/i, 'กรุณาเลือกไซซ์ที่พร้อมจำหน่าย'], [/shipping method/i, 'วิธีจัดส่งที่เลือกไม่สามารถใช้งานได้'], [/coupon is invalid/i, 'คูปองไม่ถูกต้องหรือหมดอายุ'], [/already open/i, 'มีคำขอนี้อยู่แล้ว'], [/not eligible for a return/i, 'คำสั่งซื้อนี้ไม่เข้าเงื่อนไขการคืนสินค้า'], [/request failed/i, 'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง'],
]
const localizeError = (message) => document.documentElement.lang === 'th' ? (thaiErrors.find(([pattern]) => pattern.test(message))?.[1] || message) : message

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (path === '/orders' && response.status === 404) {
      throw new Error('The store server needs to be restarted. Your shopping bag has been kept.')
    }
    throw new Error(localizeError(payload?.error || `Commerce request failed with status ${response.status}`))
  }
  return payload
}

export async function getProducts({ signal } = {}) {
  try {
    const payload = await request('/products', { signal })
    return Array.isArray(payload) ? payload : payload.products
  } catch (error) {
    if (!configuredApiUrl && error.name !== 'AbortError') return FALLBACK_PRODUCTS
    throw error
  }
}
export const getProductBySlug = (slug) => request(`/products/${encodeURIComponent(slug)}`).then((payload) => payload.product)

export async function createOrder(order) {
  return request('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  })
}

export const getStoreConfig = () => request('/store/config')
export const getLegalSettings = () => request('/store/legal')
export const reserveCart = (details) => request('/cart/reserve', { method: 'POST', body: JSON.stringify(details) })
export const releaseCartReservation = (sessionKey) => request(`/cart/reserve/${encodeURIComponent(sessionKey)}`, { method: 'DELETE' })
export const validateCoupon = (code) => request('/coupons/validate', { method: 'POST', body: JSON.stringify({ code }) })
export const confirmSandboxPayment = (orderNumber, email) => request(`/payments/sandbox/${orderNumber}/confirm`, { method: 'POST', body: JSON.stringify({ email }) })
export const registerCustomer = (details) => request('/auth/register', { method: 'POST', body: JSON.stringify(details) })
export const loginCustomer = (details) => request('/auth/login', { method: 'POST', body: JSON.stringify(details) })
export const logoutCustomer = () => request('/auth/logout', { method: 'POST' })
export const getCustomerAccount = () => request('/account')
export const createReturnRequest = (details) => request('/account/returns', { method: 'POST', body: JSON.stringify(details) })
export const forgotPassword = (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
export const resetPassword = (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
export const verifyEmail = (token) => request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
export const resendVerification = () => request('/account/resend-verification', { method: 'POST' })
export const updateCustomerProfile = (details) => request('/account/profile', { method: 'PATCH', body: JSON.stringify(details) })
export const changeCustomerPassword = (details) => request('/account/password', { method: 'PATCH', body: JSON.stringify(details) })
export const addCustomerAddress = (details) => request('/account/addresses', { method: 'POST', body: JSON.stringify(details) })
export const updateCustomerAddress = (id, details) => request(`/account/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(details) })
export const deleteCustomerAddress = (id) => request(`/account/addresses/${id}`, { method: 'DELETE' })
export const revokeCustomerSession = (id) => request(`/account/sessions/${id}`, { method: 'DELETE' })
export const revokeOtherCustomerSessions = () => request('/account/sessions/revoke-others', { method: 'POST' })
export const deleteCustomerAccount = (password) => request('/account', { method: 'DELETE', body: JSON.stringify({ password }) })
export const trackEvent = (name, metadata = {}) => request('/analytics/events', { method: 'POST', body: JSON.stringify({ name, path: window.location.pathname, metadata }) }).catch(() => null)
