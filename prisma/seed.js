import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { prisma } from '../server/db.js'
import { FALLBACK_PRODUCTS } from '../src/data/products.js'

const legacyFile = path.resolve('server/data/products.json')
const products = existsSync(legacyFile)
  ? JSON.parse(await readFile(legacyFile, 'utf8'))
  : FALLBACK_PRODUCTS
const thaiProductNames = { 'azure-coat': 'เสื้อคลุมอาซัวร์', 'rose-coat': 'เสื้อคลุมโรส', 'crimson-jacket': 'แจ็กเก็ตคริมสัน', 'kamma-velvet-suit': 'สูทกำมะหยี่กัมมา' }

const password = process.env.ORION_ADMIN_PASSWORD || 'orion-admin'
const passwordHash = await bcrypt.hash(password, 12)

await prisma.adminUser.upsert({
  where: { username: 'admin' },
  update: { email: 'admin@orion.local', name: 'ORION Owner', passwordHash },
  create: {
    username: 'admin',
    email: 'admin@orion.local',
    name: 'ORION Owner',
    passwordHash,
  },
})

for (const product of products) {
  const saved = await prisma.product.upsert({
    where: { id: product.id },
    update: {
      slug: product.slug,
      collection: product.collection || 'Collection 01',
      name: product.name,
      nameTh: product.nameTh || thaiProductNames[product.slug] || product.name,
      eyebrow: product.eyebrow || 'ORION / Signature piece',
      description: product.description || '',
      descriptionTh: product.descriptionTh || 'เสื้อคลุมทรงประติมากรรมที่ผสานรากเหง้าคลาสสิกเข้ากับสไตล์ร่วมสมัยของ ORION',
      category: product.category || 'Outerwear', categoryTh: product.categoryTh || 'เสื้อคลุม',
      sortOrder: product.sortOrder || 0, weightGrams: product.weightGrams || 1800, fulfillmentType: product.fulfillmentType || 'ready',
      theme: product.theme || {},
      campaignImage: product.campaignImage || {},
      images: product.images || [],
      material: product.material || 'Premium sculptural faux fur with a satin-touch lining.',
      materialTh: product.materialTh || 'ขนสังเคราะห์พรีเมียมพร้อมซับในสัมผัสซาติน',
      care: product.care || 'Specialist dry clean only. Store in a cool, dry place and avoid prolonged moisture.',
      careTh: product.careTh || 'ซักแห้งโดยผู้เชี่ยวชาญเท่านั้น เก็บในที่แห้งและหลีกเลี่ยงความชื้นเป็นเวลานาน',
      fit: product.fit || 'Relaxed statement silhouette. Choose your usual size or size down for a closer fit.',
      fitTh: product.fitTh || 'ทรงโอเวอร์ไซซ์แบบมีโครง เลือกไซซ์ปกติ หรือเล็กลงหนึ่งไซซ์หากต้องการทรงกระชับ',
      sizeGuide: product.sizeGuide || [{ size: 'S', chest: '92–96', length: '105' }, { size: 'M', chest: '97–102', length: '107' }, { size: 'L', chest: '103–108', length: '109' }, { size: 'XL', chest: '109–116', length: '111' }],
      price: product.price,
      currency: product.currency || 'THB',
      priceLabel: product.priceLabel || 'Price on request',
      status: String(product.status || 'active').toUpperCase(),
    },
    create: {
      id: product.id,
      slug: product.slug,
      collection: product.collection || 'Collection 01',
      name: product.name,
      nameTh: product.nameTh || thaiProductNames[product.slug] || product.name,
      eyebrow: product.eyebrow || 'ORION / Signature piece',
      description: product.description || '',
      descriptionTh: product.descriptionTh || 'เสื้อคลุมทรงประติมากรรมที่ผสานรากเหง้าคลาสสิกเข้ากับสไตล์ร่วมสมัยของ ORION',
      category: product.category || 'Outerwear', categoryTh: product.categoryTh || 'เสื้อคลุม',
      sortOrder: product.sortOrder || 0, weightGrams: product.weightGrams || 1800, fulfillmentType: product.fulfillmentType || 'ready',
      theme: product.theme || {},
      campaignImage: product.campaignImage || {},
      images: product.images || [],
      material: product.material || 'Premium sculptural faux fur with a satin-touch lining.',
      materialTh: product.materialTh || 'ขนสังเคราะห์พรีเมียมพร้อมซับในสัมผัสซาติน',
      care: product.care || 'Specialist dry clean only. Store in a cool, dry place and avoid prolonged moisture.',
      careTh: product.careTh || 'ซักแห้งโดยผู้เชี่ยวชาญเท่านั้น เก็บในที่แห้งและหลีกเลี่ยงความชื้นเป็นเวลานาน',
      fit: product.fit || 'Relaxed statement silhouette. Choose your usual size or size down for a closer fit.',
      fitTh: product.fitTh || 'ทรงโอเวอร์ไซซ์แบบมีโครง เลือกไซซ์ปกติ หรือเล็กลงหนึ่งไซซ์หากต้องการทรงกระชับ',
      sizeGuide: product.sizeGuide || [{ size: 'S', chest: '92–96', length: '105' }, { size: 'M', chest: '97–102', length: '107' }, { size: 'L', chest: '103–108', length: '109' }, { size: 'XL', chest: '109–116', length: '111' }],
      price: product.price,
      currency: product.currency || 'THB',
      priceLabel: product.priceLabel || 'Price on request',
      status: String(product.status || 'active').toUpperCase(),
    },
  })

  for (const [index, variant] of (product.variants || []).entries()) {
    const savedVariant = await prisma.variant.upsert({
      where: { productId_code: { productId: saved.id, code: variant.id } },
      update: { label: variant.label, color: variant.color || '', colorTh: variant.colorTh || '', colorHex: variant.colorHex || '#111111', ...(variant.images ? { images: variant.images } : {}), barcode: variant.barcode || null, available: variant.available !== false },
      create: {
        id: `${saved.id}:${variant.id}`,
        productId: saved.id,
        code: variant.id,
        label: variant.label,
        color: variant.color || '', colorTh: variant.colorTh || '', colorHex: variant.colorHex || '#111111', ...(variant.images ? { images: variant.images } : {}), barcode: variant.barcode || null,
        available: variant.available !== false,
      },
    })
    await prisma.inventory.upsert({
      where: { variantId: savedVariant.id },
      update: {},
      create: {
        variantId: savedVariant.id,
        sku: `${product.slug}-${variant.id || index + 1}`.toUpperCase(),
        stock: 5,
        lowStockThreshold: 2,
        movements: { create: { type: 'INITIAL', quantity: 5, balance: 5, note: 'Initial PostgreSQL migration' } },
      },
    })
  }
}

await prisma.coupon.upsert({
  where: { code: 'WELCOME10' },
  update: {},
  create: { code: 'WELCOME10', type: 'PERCENT', value: 10, minSubtotal: 1000, active: true },
})

await prisma.shippingMethod.upsert({ where: { code: 'standard' }, update: {}, create: { code: 'standard', name: 'Standard delivery', nameTh: 'จัดส่งมาตรฐาน', description: 'Tracked delivery across Thailand', descriptionTh: 'จัดส่งพร้อมหมายเลขติดตามทั่วประเทศไทย', fee: 120, freeAbove: 12000, estimatedDays: '2–4 business days', sortOrder: 1 } })
await prisma.shippingMethod.upsert({ where: { code: 'express' }, update: {}, create: { code: 'express', name: 'Express delivery', nameTh: 'จัดส่งด่วน', description: 'Priority tracked delivery', descriptionTh: 'จัดส่งด่วนพร้อมหมายเลขติดตาม', fee: 250, estimatedDays: '1–2 business days', sortOrder: 2 } })
await prisma.shippingMethod.upsert({ where: { code: 'bangkok-sameday' }, update: {}, create: { code: 'bangkok-sameday', name: 'Bangkok same-day', nameTh: 'ส่งภายในวัน (กรุงเทพฯ)', description: 'Same-day messenger within Bangkok', descriptionTh: 'แมสเซนเจอร์ภายในกรุงเทพมหานคร', fee: 350, provinceGroup: 'bangkok', estimatedDays: 'Same day', sortOrder: 3 } })

await prisma.storeSetting.upsert({ where: { key: 'legal' }, update: {}, create: { key: 'legal', value: { companyName: 'ORION Studio', companyNameTh: 'โอไรออน สตูดิโอ', address: 'Bangkok, Thailand', addressTh: 'กรุงเทพมหานคร ประเทศไทย', email: 'support@orion.local', phone: '02-000-0000', returnDays: 14, privacyEn: 'ORION collects account, order, delivery and security information only to operate the store, fulfil orders and protect customer accounts. Passwords and one-time tokens are stored as secure hashes. Customers may manage their information, sessions and account from the Account area.', privacyTh: 'ORION เก็บข้อมูลบัญชี คำสั่งซื้อ การจัดส่ง และข้อมูลด้านความปลอดภัยเท่าที่จำเป็นต่อการให้บริการ จัดส่งสินค้า และปกป้องบัญชีลูกค้า รหัสผ่านและโทเคนถูกจัดเก็บในรูปแบบแฮช ลูกค้าสามารถจัดการข้อมูล เซสชัน และบัญชีได้จากหน้าบัญชี', termsEn: 'Orders are accepted after availability and payment confirmation. Product colour and texture can vary slightly by display and production finish. Thai law governs purchases made through this store.', termsTh: 'คำสั่งซื้อจะสมบูรณ์หลังตรวจสอบสินค้าและยืนยันการชำระเงิน สีและพื้นผิวสินค้าอาจแตกต่างเล็กน้อยตามหน้าจอและกระบวนการผลิต การซื้อขายอยู่ภายใต้กฎหมายไทย', shippingEn: 'Available delivery methods, fees and estimates are displayed at checkout. Tracking is added to the customer account after dispatch.', shippingTh: 'วิธีจัดส่ง ค่าบริการ และระยะเวลาโดยประมาณจะแสดงในขั้นตอนสั่งซื้อ หมายเลขติดตามจะแสดงในบัญชีหลังจัดส่ง', returnsEn: 'Return requests must be submitted within 14 days of delivery. Items must be unused, unworn and returned with their original presentation. Custom and final-sale items are not eligible unless defective.', returnsTh: 'ต้องยื่นคำขอคืนสินค้าภายใน 14 วันหลังได้รับสินค้า สินค้าต้องไม่ผ่านการใช้งานหรือสวมใส่และอยู่ในบรรจุภัณฑ์เดิม สินค้าสั่งทำและสินค้าลดราคาสุดท้ายไม่สามารถคืนได้ ยกเว้นกรณีมีตำหนิ' } } })

console.log(`Seeded ${products.length} products, inventory, admin account and WELCOME10 coupon.`)
await prisma.$disconnect()
