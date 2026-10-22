import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const translations = {
  en: {
    account: 'Account', bag: 'Bag', close: 'Close', save: 'Save changes', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
    signIn: 'Sign in', signOut: 'Sign out', register: 'Create account', email: 'Email', password: 'Password', phone: 'Phone', fullName: 'Full name',
    forgot: 'Forgot password?', resetTitle: 'Set a new password.', forgotTitle: 'Recover your account.', welcome: 'Welcome back.', join: 'Join ORION.', yourAccount: 'Your account.',
    sendReset: 'Send reset link', resetPassword: 'Reset password', backLogin: 'Back to sign in', noAccount: 'Create a private account', existing: 'Already a client? Sign in',
    overview: 'Overview', profile: 'Profile', addresses: 'Addresses', security: 'Security', orders: 'Orders', orderHistory: 'Order history', returns: 'Returns',
    verified: 'Email verified', unverified: 'Please verify your email to protect your account.', resend: 'Resend verification email',
    currentPassword: 'Current password', newPassword: 'New password', changePassword: 'Change password', activeSessions: 'Active sessions', revoke: 'Revoke', revokeOthers: 'Sign out other devices', currentDevice: 'Current device',
    addAddress: 'Add address', address: 'Address', recipient: 'Recipient', city: 'City / District', province: 'Province', postal: 'Postal code', postalCode: 'Postal code', country: 'Country', defaultAddress: 'Default address', label: 'Label',
    deleteAccount: 'Delete account', deleteWarning: 'This permanently closes your account and signs out every device. Order records are anonymised and retained for accounting.', confirmPassword: 'Confirm with your password',
    shopCollection: 'Shop the collection', selectSize: 'Select size', sizeGuide: 'Size guide', addBag: 'Add to bag', productDetails: 'Product details', material: 'Material', care: 'Care', fit: 'Fit', browse: 'Browse pieces',
    viewStudio: '360° Studio', viewGallery: 'Collection Gallery', viewBoth: 'Unified View', campaignLook: 'Campaign View', garmentAngles: '360° Angles', activeInStudio: 'Active in Studio', inspectStudio: 'View in 360° Studio', specs: 'Specifications',
    privacy: 'Privacy', terms: 'Terms', shipping: 'Shipping', returnPolicy: 'Returns policy', language: 'Language',
  },
  th: {
    account: 'บัญชี', bag: 'ถุงสินค้า', close: 'ปิด', save: 'บันทึกการเปลี่ยนแปลง', cancel: 'ยกเลิก', delete: 'ลบ', edit: 'แก้ไข',
    signIn: 'เข้าสู่ระบบ', signOut: 'ออกจากระบบ', register: 'สร้างบัญชี', email: 'อีเมล', password: 'รหัสผ่าน', phone: 'เบอร์โทร', fullName: 'ชื่อ–นามสกุล',
    forgot: 'ลืมรหัสผ่าน?', resetTitle: 'ตั้งรหัสผ่านใหม่', forgotTitle: 'กู้คืนบัญชีของคุณ', welcome: 'ยินดีต้อนรับกลับ', join: 'สมัครสมาชิก ORION', yourAccount: 'บัญชีของคุณ',
    sendReset: 'ส่งลิงก์รีเซ็ต', resetPassword: 'ตั้งรหัสผ่านใหม่', backLogin: 'กลับไปเข้าสู่ระบบ', noAccount: 'สร้างบัญชีสมาชิก', existing: 'มีบัญชีแล้ว? เข้าสู่ระบบ',
    overview: 'ภาพรวม', profile: 'ข้อมูลส่วนตัว', addresses: 'ที่อยู่', security: 'ความปลอดภัย', orders: 'คำสั่งซื้อ', orderHistory: 'ประวัติคำสั่งซื้อ', returns: 'การคืนสินค้า',
    verified: 'ยืนยันอีเมลแล้ว', unverified: 'กรุณายืนยันอีเมลเพื่อปกป้องบัญชีของคุณ', resend: 'ส่งอีเมลยืนยันอีกครั้ง',
    currentPassword: 'รหัสผ่านปัจจุบัน', newPassword: 'รหัสผ่านใหม่', changePassword: 'เปลี่ยนรหัสผ่าน', activeSessions: 'อุปกรณ์ที่เข้าสู่ระบบ', revoke: 'ออกจากระบบ', revokeOthers: 'ออกจากระบบอุปกรณ์อื่น', currentDevice: 'อุปกรณ์นี้',
    addAddress: 'เพิ่มที่อยู่', address: 'ที่อยู่', recipient: 'ชื่อผู้รับ', city: 'เขต / อำเภอ', province: 'จังหวัด', postal: 'รหัสไปรษณีย์', postalCode: 'รหัสไปรษณีย์', country: 'ประเทศ', defaultAddress: 'ที่อยู่หลัก', label: 'ชื่อที่อยู่',
    deleteAccount: 'ลบบัญชี', deleteWarning: 'การดำเนินการนี้จะปิดบัญชีและออกจากระบบทุกอุปกรณ์ ข้อมูลคำสั่งซื้อจะถูกทำให้ไม่ระบุตัวตนและเก็บไว้ตามข้อกำหนดทางบัญชี', confirmPassword: 'ยืนยันด้วยรหัสผ่าน',
    shopCollection: 'เลือกซื้อคอลเลกชัน', selectSize: 'เลือกไซซ์', sizeGuide: 'ตารางไซซ์', addBag: 'เพิ่มลงถุง', productDetails: 'รายละเอียดสินค้า', material: 'วัสดุ', care: 'การดูแล', fit: 'ทรงและขนาด', browse: 'เลือกดูสินค้า',
    viewStudio: 'สตูดิโอ 360°', viewGallery: 'แกลเลอรีคอลเลกชัน', viewBoth: 'รวมมุมมองทั้งหมด', campaignLook: 'ภาพแคมเปญ', garmentAngles: 'มุมมอง 360°', activeInStudio: 'กำลังรับชมในสตูดิโอ', inspectStudio: 'สัมผัสในสตูดิโอ 360°', specs: 'ข้อมูลจำเพาะ',
    privacy: 'ความเป็นส่วนตัว', terms: 'ข้อกำหนด', shipping: 'การจัดส่ง', returnPolicy: 'นโยบายคืนสินค้า', language: 'ภาษา',
  },
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('orion_language') || 'en')
  useEffect(() => {
    localStorage.setItem('orion_language', language)
    document.documentElement.lang = language
  }, [language])
  const value = useMemo(() => ({ language, setLanguage, t: (key) => translations[language]?.[key] || translations.en[key] || key }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => useContext(LanguageContext)

export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage()
  return <div className="language-switch" aria-label={t('language')}><button className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')} type="button">EN</button><span>/</span><button className={language === 'th' ? 'is-active' : ''} onClick={() => setLanguage('th')} type="button">TH</button></div>
}
