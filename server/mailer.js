import nodemailer from 'nodemailer'

export const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
const transporter = smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
}) : null

async function send({ to, subject, text, html }) {
  if (!transporter) {
    console.log(`Email preview prepared: ${subject}`)
    return { preview: true }
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM || 'ORION <orders@example.com>', to, subject, text, html })
  return { sent: true }
}

export async function verifySmtpConnection() {
  if (!transporter) return { configured: false, connected: false }
  await transporter.verify()
  return { configured: true, connected: true }
}
export const sendSmtpTest = (to, language = 'en') => send({ to, subject: language === 'th' ? 'ทดสอบอีเมล ORION สำเร็จ' : 'ORION email test successful', text: language === 'th' ? 'การเชื่อมต่อ SMTP ของ ORION พร้อมใช้งานแล้ว' : 'Your ORION SMTP connection is ready.', html: `<div style="font-family:Arial,'IBM Plex Sans Thai',sans-serif;padding:36px"><h1>ORION</h1><p>${language === 'th' ? 'การเชื่อมต่อ SMTP พร้อมใช้งานแล้ว' : 'Your SMTP connection is ready.'}</p></div>` })

export async function sendOrderConfirmation(order) {
  const thai = order.language === 'th'
  return send({
    to: order.customerEmail,
    subject: thai ? `ORION ยืนยันคำสั่งซื้อ ${order.orderNumber}` : `ORION order ${order.orderNumber}`,
    text: thai ? `ขอบคุณสำหรับคำสั่งซื้อ ORION หมายเลขอ้างอิง ${order.orderNumber} เราจะติดต่อเพื่อยืนยันการชำระเงินและการจัดส่ง` : `Thank you for your ORION order. Your reference is ${order.orderNumber}. We will contact you to confirm payment and delivery.`,
    html: `<div style="font-family:Arial,'IBM Plex Sans Thai',sans-serif;max-width:620px;margin:auto;padding:36px;color:#171714"><h1 style="font-family:Georgia,serif;letter-spacing:.12em">ORION</h1><p>${thai ? 'เราได้รับคำสั่งซื้อของคุณแล้ว' : 'We have received your order.'}</p><h2>${order.orderNumber}</h2><p>${thai ? 'เราจะติดต่อเพื่อยืนยันการชำระเงินและการจัดส่ง' : 'We will contact you to confirm payment and delivery.'}</p></div>`,
  })
}

export const sendVerificationEmail = (customer, url) => {
  const thai = customer.preferredLanguage === 'th'
  return send({ to: customer.email, subject: thai ? 'ยืนยันอีเมลบัญชี ORION' : 'Verify your ORION account', text: thai ? `ยินดีต้อนรับสู่ ORION ยืนยันอีเมลที่ ${url}` : `Welcome to ORION. Verify your email address: ${url}`, html: `<div style="font-family:Arial,'IBM Plex Sans Thai',sans-serif;max-width:620px;margin:auto;padding:36px;color:#171714"><h1 style="font-family:Georgia,serif;letter-spacing:.12em">ORION</h1><p>${thai ? 'ยินดีต้อนรับ กรุณายืนยันอีเมลของคุณ' : 'Welcome. Please verify your email address.'}</p><p><a style="display:inline-block;padding:14px 22px;background:#171714;color:#fff;text-decoration:none" href="${url}">${thai ? 'ยืนยันอีเมล' : 'Verify email'}</a></p><small>${thai ? 'ลิงก์นี้หมดอายุใน 24 ชั่วโมง' : 'This link expires in 24 hours.'}</small></div>` })
}

export const sendPasswordResetEmail = (customer, url) => {
  const thai = customer.preferredLanguage === 'th'
  return send({ to: customer.email, subject: thai ? 'ตั้งรหัสผ่าน ORION ใหม่' : 'Reset your ORION password', text: thai ? `ตั้งรหัสผ่านใหม่ที่ ${url}` : `Reset your ORION password: ${url}`, html: `<div style="font-family:Arial,'IBM Plex Sans Thai',sans-serif;max-width:620px;margin:auto;padding:36px;color:#171714"><h1 style="font-family:Georgia,serif;letter-spacing:.12em">ORION</h1><p>${thai ? 'เราได้รับคำขอตั้งรหัสผ่านใหม่' : 'We received a request to reset your password.'}</p><p><a style="display:inline-block;padding:14px 22px;background:#171714;color:#fff;text-decoration:none" href="${url}">${thai ? 'ตั้งรหัสผ่านใหม่' : 'Choose a new password'}</a></p><small>${thai ? 'ลิงก์หมดอายุใน 60 นาที หากคุณไม่ได้ส่งคำขอนี้ โปรดไม่ต้องดำเนินการใด ๆ' : 'This link expires in 60 minutes. Ignore this email if you did not request it.'}</small></div>` })
}
