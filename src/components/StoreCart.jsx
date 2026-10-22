import { useEffect, useMemo, useState } from 'react'
import { confirmSandboxPayment, createOrder, getCustomerAccount, getStoreConfig, reserveCart, trackEvent, validateCoupon } from '../services/commerce'
import { useLanguage } from '../i18n'

const money = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value)

export default function StoreCart({ items, open, onOpen, onClose, onChange, onCompleted }) {
  const { language, t } = useLanguage()
  const th = language === 'th'
  const tx = (en, thai) => th ? thai : en
  const [step, setStep] = useState('cart')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState(null)
  const [config, setConfig] = useState({ taxRate: .07, shippingFee: 120, shippingMethods: [] })
  const [savedAddresses, setSavedAddresses] = useState([])
  const [shippingMethod, setShippingMethod] = useState('standard')
  const [reservation, setReservation] = useState(null)
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [paymentState, setPaymentState] = useState('idle')
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', province: '', postalCode: '', country: 'Thailand', note: '', invoiceRequested: false, taxId: '', companyName: '', billingAddress: '' })
  const total = useMemo(() => items.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0), [items])
  const hasPriceOnRequest = items.some((item) => item.price === null)
  const discount = coupon ? Math.min(total, coupon.type === 'percent' ? total * (coupon.value / 100) : coupon.value) : 0
  const availableShippingMethods = config.shippingMethods?.filter((item) => item.provinceGroup !== 'bangkok' || /bangkok|กรุงเทพ/i.test(form.province)) || []
  const selectedShipping = availableShippingMethods.find((item) => item.code === shippingMethod) || config.shippingMethods?.find((item) => item.code === shippingMethod)
  const shippingFee = hasPriceOnRequest || !items.length ? 0 : selectedShipping ? (selectedShipping.freeAbove !== null && total >= selectedShipping.freeAbove ? 0 : selectedShipping.fee) : config.shippingFee
  const tax = hasPriceOnRequest ? 0 : Math.round((total - discount + shippingFee) * config.taxRate * 100) / 100
  const finalTotal = total - discount + shippingFee + tax

  useEffect(() => { getStoreConfig().then((next) => { setConfig(next); if (next.shippingMethods?.length) setShippingMethod(next.shippingMethods[0].code) }).catch(() => {}) }, [])
  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const updateQuantity = (id, quantity) => quantity < 1 ? onChange(items.filter((item) => item.id !== id)) : onChange(items.map((item) => item.id === id ? { ...item, quantity: Math.min(quantity, item.stock || 10) } : item))

  const beginCheckout = async () => {
    setError('')
    try {
      const account = await getCustomerAccount().catch(() => null)
      if (account) {
        setSavedAddresses(account.customer.addresses || [])
        const address = account.customer.addresses?.find((item) => item.isDefault) || account.customer.addresses?.[0]
        setForm((current) => ({ ...current, name: account.customer.name || '', email: account.customer.email || '', phone: account.customer.phone || '', ...(address ? { address: address.address, city: address.city, province: address.province || '', postalCode: address.postalCode, country: address.country } : {}) }))
      }
      const sessionKey = localStorage.getItem('orion_cart_session') || crypto.randomUUID()
      localStorage.setItem('orion_cart_session', sessionKey)
      const result = await reserveCart({ sessionKey, items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) })
      setReservation({ sessionKey, expiresAt: result.expiresAt }); setStep('checkout')
    } catch (failure) { setError(failure.message) }
  }
  const chooseAddress = (id) => {
    const item = savedAddresses.find((address) => address.id === id)
    if (item) setForm((current) => ({ ...current, name: item.recipient, phone: item.phone, address: item.address, city: item.city, province: item.province || '', postalCode: item.postalCode, country: item.country }))
  }
  const applyCoupon = async () => {
    setCouponError('')
    try { const result = await validateCoupon(couponInput); if (total < result.coupon.minSubtotal) throw new Error(tx(`Minimum spend is ${money(result.coupon.minSubtotal)}.`, `ยอดสั่งซื้อขั้นต่ำ ${money(result.coupon.minSubtotal)}`)); setCoupon(result.coupon) } catch (failure) { setCoupon(null); setCouponError(failure.message) }
  }
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setError('')
    if (!/^(?:\+66|0)\d{8,9}$/.test(form.phone.replace(/[\s-]/g, ''))) { setSubmitting(false); return setError(tx('Enter a valid Thai phone number.', 'กรุณากรอกเบอร์โทรศัพท์ไทยให้ถูกต้อง')) }
    if (!/^\d{5}$/.test(form.postalCode)) { setSubmitting(false); return setError(tx('Postal code must contain 5 digits.', 'รหัสไปรษณีย์ต้องมี 5 หลัก')) }
    try {
      const result = await createOrder({ customer: { name: form.name, email: form.email, phone: form.phone }, shippingAddress: { address: form.address, city: form.city, province: form.province, postalCode: form.postalCode, country: form.country }, note: form.note, language, sessionKey: reservation?.sessionKey, shippingMethod, invoiceRequested: form.invoiceRequested, taxId: form.taxId, companyName: form.companyName, billingAddress: form.billingAddress, couponCode: coupon?.code || '', items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) })
      setOrder(result.order); setStep('success'); localStorage.removeItem('orion_cart_session'); setReservation(null); onCompleted(); trackEvent('order_completed', { orderNumber: result.order.orderNumber, total: result.order.total })
    } catch (failure) { setError(failure.message) } finally { setSubmitting(false) }
  }
  const confirmPayment = async () => { setPaymentState('submitting'); try { await confirmSandboxPayment(order.orderNumber, form.email); setPaymentState('paid') } catch (failure) { setError(failure.message); setPaymentState('error') } }
  const close = () => { onClose(); window.setTimeout(() => { if (step === 'success') { setStep('cart'); setOrder(null) } setError('') }, 250) }
  const printReceipt = () => window.print()

  return <>
    <button className={`store-cart-trigger ${items.length ? 'has-items' : ''}`} type="button" onClick={() => { setStep('cart'); onOpen() }}><span>{t('bag')}</span><strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong></button>
    <div className={`store-cart-backdrop ${open ? 'is-open' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }} aria-hidden={!open}>
      <aside className="store-cart-drawer" role="dialog" aria-modal="true"><header><div><p>ORION / {tx('Private order','คำสั่งซื้อส่วนตัว')}</p><h2>{step === 'success' ? tx('Order received.','รับคำสั่งซื้อแล้ว') : step === 'checkout' ? tx('Delivery details.','ข้อมูลการจัดส่ง') : tx('Shopping bag.','ถุงสินค้า')}</h2></div><button type="button" onClick={close}>{t('close')}</button></header>
        {step === 'cart' && <div className="store-cart-content">{!items.length ? <div className="store-cart-empty"><span>{tx('Your bag is empty.','ถุงสินค้ายังว่าง')}</span><p>{tx('Select a piece and size to begin.','เลือกสินค้าและไซซ์เพื่อเริ่มต้น')}</p><button onClick={close} type="button">{tx('Continue exploring','เลือกชมสินค้าต่อ')}</button></div> : <><div className="store-cart-lines">{items.map((item) => <article key={item.id}><img src={item.image} alt="" /><div><span>{item.collection}</span><h3>{item.productName}</h3><p>{tx('Size','ไซซ์')} {item.variantLabel}</p><strong>{item.price === null ? tx('Price on request','สอบถามราคา') : money(item.price)}</strong></div><div className="store-cart-quantity"><button type="button" onClick={() => updateQuantity(item.id,item.quantity-1)}>−</button><output>{item.quantity}</output><button type="button" onClick={() => updateQuantity(item.id,item.quantity+1)}>+</button></div></article>)}</div><footer className="store-cart-total"><div className="store-coupon"><input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder={tx('Coupon code','รหัสคูปอง')} /><button type="button" onClick={applyCoupon}>{tx('Apply','ใช้คูปอง')}</button></div><small className="store-coupon-message">{coupon ? tx(`${coupon.code} applied`,`ใช้คูปอง ${coupon.code} แล้ว`) : couponError}</small><div><span>{tx('Estimated total','ยอดรวมโดยประมาณ')}</span><strong>{money(finalTotal)}</strong></div><button type="button" onClick={beginCheckout}>{tx('Continue to checkout','ดำเนินการสั่งซื้อ')} <span>→</span></button><p className="store-checkout-error">{error}</p></footer></>}</div>}
        {step === 'checkout' && <form className="store-checkout" onSubmit={submit}><button className="store-checkout-back" type="button" onClick={() => setStep('cart')}>← {tx('Back to bag','กลับไปถุงสินค้า')}</button>{reservation && <p className="checkout-reservation">{tx('Stock held for 15 minutes.','จองสินค้าไว้ให้คุณ 15 นาที')}</p>}{savedAddresses.length > 0 && <fieldset><legend>{tx('Saved addresses','ที่อยู่ที่บันทึกไว้')}</legend><select className="checkout-address-select" defaultValue="" onChange={(e) => chooseAddress(e.target.value)}><option value="" disabled>{tx('Choose an address','เลือกที่อยู่')}</option>{savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.address}</option>)}</select></fieldset>}
          <fieldset><legend>{tx('Contact','ข้อมูลติดต่อ')}</legend><label>{t('fullName')}<input required value={form.name} onChange={(e) => updateForm('name',e.target.value)} /></label><div><label>{t('email')}<input required type="email" value={form.email} onChange={(e) => updateForm('email',e.target.value)} /></label><label>{t('phone')}<input required inputMode="tel" value={form.phone} onChange={(e) => updateForm('phone',e.target.value)} /></label></div></fieldset>
          <fieldset><legend>{t('shipping')}</legend><label>{t('address')}<input required value={form.address} onChange={(e) => updateForm('address',e.target.value)} /></label><div><label>{t('city')}<input required value={form.city} onChange={(e) => updateForm('city',e.target.value)} /></label><label>{t('province')}<input value={form.province} onChange={(e) => updateForm('province',e.target.value)} /></label></div><div><label>{t('postalCode')}<input required inputMode="numeric" pattern="[0-9]{5}" maxLength="5" value={form.postalCode} onChange={(e) => updateForm('postalCode',e.target.value.replace(/\D/g,''))} /></label><label>{t('country')}<input value={form.country} onChange={(e) => updateForm('country',e.target.value)} /></label></div></fieldset>
          <fieldset><legend>{tx('Delivery method','วิธีจัดส่ง')}</legend><div className="checkout-shipping-methods">{availableShippingMethods.map((method) => <label key={method.id}><input type="radio" name="shippingMethod" checked={shippingMethod === method.code} onChange={() => setShippingMethod(method.code)} /><span><strong>{th ? method.nameTh : method.name}</strong><small>{th ? method.descriptionTh : method.description} · {method.estimatedDays}</small></span><b>{method.freeAbove !== null && total >= method.freeAbove ? tx('Free','ฟรี') : money(method.fee)}</b></label>)}</div></fieldset>
          <fieldset><legend>{tx('Tax invoice','ใบกำกับภาษี')}</legend><label className="checkout-invoice-toggle"><input type="checkbox" checked={form.invoiceRequested} onChange={(e) => updateForm('invoiceRequested',e.target.checked)} />{tx('Request a full tax invoice','ขอใบกำกับภาษีเต็มรูปแบบ')}</label>{form.invoiceRequested && <><div><label>{tx('Company / taxpayer name','ชื่อบริษัท / ผู้เสียภาษี')}<input required value={form.companyName} onChange={(e) => updateForm('companyName',e.target.value)} /></label><label>{tx('Tax ID','เลขประจำตัวผู้เสียภาษี')}<input required pattern="[0-9]{13}" value={form.taxId} onChange={(e) => updateForm('taxId',e.target.value.replace(/\D/g,''))} /></label></div><label>{tx('Billing address','ที่อยู่ออกใบกำกับภาษี')}<textarea required value={form.billingAddress} onChange={(e) => updateForm('billingAddress',e.target.value)} /></label></>}</fieldset>
          <label>{tx('Order note (optional)','หมายเหตุ (ถ้ามี)')}<textarea rows="3" value={form.note} onChange={(e) => updateForm('note',e.target.value)} /></label><p className="store-checkout-error">{error}</p><footer><div className="store-total-breakdown"><span>{tx('Subtotal','ยอดสินค้า')}</span><strong>{money(total)}</strong><span>{tx('Discount','ส่วนลด')}</span><strong>− {money(discount)}</strong><span>{t('shipping')}</span><strong>{money(shippingFee)}</strong><span>{tx('VAT','ภาษี')}</span><strong>{money(tax)}</strong></div><div><span>{tx('Total','ยอดรวม')}</span><strong>{money(finalTotal)}</strong></div><button type="submit" disabled={submitting}>{submitting ? tx('Placing order…','กำลังบันทึกคำสั่งซื้อ…') : tx('Place private order','ยืนยันคำสั่งซื้อ')}</button><small>{tx('Sandbox payment only. No real charge will be made.','ระบบชำระเงินจำลอง ไม่มีการเรียกเก็บเงินจริง')}</small></footer></form>}
        {step === 'success' && <div className="store-order-success"><span>✓</span><p>{tx('Thank you. Your order has been recorded.','ขอบคุณ เราได้รับคำสั่งซื้อของคุณแล้ว')}</p><strong>{order?.orderNumber}</strong>{order && <div className="order-receipt"><div><span>{tx('Customer','ลูกค้า')}</span><b>{form.name}</b></div>{order.invoiceRequested && <div><span>{tx('Tax ID','เลขผู้เสียภาษี')}</span><b>{order.taxId}</b></div>}{order.items?.map((item,index)=><div key={index}><span>{item.productName} · {item.variantLabel} × {item.quantity}</span><b>{item.lineTotal===null?tx('On request','สอบถามราคา'):money(item.lineTotal)}</b></div>)}<div><span>{t('shipping')} · {order.shippingMethodName}</span><b>{money(order.shippingFee)}</b></div><div><span>{tx('VAT','ภาษี')}</span><b>{money(order.tax)}</b></div><div className="is-total"><span>{tx('Total','ยอดรวม')}</span><b>{money(order.total)}</b></div></div>}<small>{paymentState === 'paid' ? tx('Sandbox payment confirmed.','ยืนยันการชำระเงินจำลองแล้ว') : tx('The order is awaiting payment confirmation.','คำสั่งซื้อกำลังรอยืนยันการชำระเงิน')}</small>{order?.invoiceNumber && <small>{tx('Tax invoice','ใบกำกับภาษี')}: {order.invoiceNumber}</small>}<button type="button" onClick={printReceipt}>{tx('Print receipt / invoice','พิมพ์ใบเสร็จ / ใบกำกับภาษี')}</button>{!order?.hasPriceOnRequest && paymentState !== 'paid' && <button type="button" onClick={confirmPayment} disabled={paymentState === 'submitting'}>{paymentState === 'submitting' ? tx('Confirming…','กำลังยืนยัน…') : tx('Confirm sandbox payment','ยืนยันการชำระเงินจำลอง')}</button>}<button className="is-secondary" type="button" onClick={close}>{tx('Return to ORION','กลับไป ORION')}</button></div>}
      </aside>
    </div>
  </>
}
