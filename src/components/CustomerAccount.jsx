import { useEffect, useState } from 'react'
import {
  addCustomerAddress, changeCustomerPassword, createReturnRequest, deleteCustomerAccount,
  deleteCustomerAddress, forgotPassword, getCustomerAccount, loginCustomer, logoutCustomer,
  registerCustomer, resendVerification, resetPassword, revokeCustomerSession,
  revokeOtherCustomerSessions, updateCustomerAddress, updateCustomerProfile, verifyEmail,
} from '../services/commerce'
import { useLanguage } from '../i18n'

const emptyAddress = { label: 'Home', recipient: '', phone: '', address: '', city: '', province: '', postalCode: '', country: 'Thailand', isDefault: false }

function AccountFeedback({ error, message }) {
  return <>
    <p className="customer-account-error">{error}</p>
    {message && <p className="customer-account-message">{message}</p>}
  </>
}

export default function CustomerAccount() {
  const { language, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [tab, setTab] = useState('overview')
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [addressDraft, setAddressDraft] = useState(null)
  const [returnDraft, setReturnDraft] = useState(null)

  const refresh = async () => { const next = await getCustomerAccount(); setAccount(next); setForm((value) => ({ ...value, ...next.customer })); return next }
  const run = async (action, success = '') => {
    setLoading(true); setError(''); setMessage('')
    try { await action(); if (success) setMessage(success) } catch (failure) { setError(failure.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verificationToken = params.get('verify')
    const resetToken = params.get('reset')
    if (verificationToken) {
      setOpen(true); setLoading(true)
      verifyEmail(verificationToken).then(() => { setMode('login'); setMessage(language === 'th' ? 'ยืนยันอีเมลเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ' : 'Email verified. You can now sign in.') }).catch((failure) => setError(failure.message)).finally(() => setLoading(false))
    } else if (resetToken) { setOpen(true); setMode('reset'); setForm((value) => ({ ...value, token: resetToken })) }
  }, [])

  const show = async () => {
    setOpen(true); setLoading(true); setError(''); setMessage('')
    try { await refresh(); setMode('account') } catch { setMode('login') } finally { setLoading(false) }
  }
  const submitAuth = (event) => {
    event.preventDefault()
    run(async () => {
      if (mode === 'register') await registerCustomer({ ...form, preferredLanguage: language })
      else await loginCustomer({ email: form.email, password: form.password })
      await refresh(); setMode('account')
    })
  }
  const submitRecovery = (event) => {
    event.preventDefault()
    run(async () => {
      const result = mode === 'forgot' ? await forgotPassword(form.email) : await resetPassword(form.token, form.password)
      if (result.previewUrl) setMessage(`${language === 'th' ? 'โหมดทดสอบ:' : 'Development preview:'} ${result.previewUrl}`)
      else setMessage(mode === 'forgot' ? (language === 'th' ? 'หากมีบัญชีนี้ เราได้ส่งลิงก์ให้แล้ว' : 'If the account exists, a reset link has been sent.') : (language === 'th' ? 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบ' : 'Password changed. Please sign in.'))
      if (mode === 'reset') setMode('login')
    })
  }
  const logout = () => run(async () => { await logoutCustomer(); setAccount(null); setMode('login') })
  const saveProfile = (event) => { event.preventDefault(); run(async () => { await updateCustomerProfile({ name: form.name, phone: form.phone, preferredLanguage: language }); await refresh() }, language === 'th' ? 'บันทึกข้อมูลแล้ว' : 'Profile saved.') }
  const saveAddress = (event) => { event.preventDefault(); run(async () => { addressDraft.id ? await updateCustomerAddress(addressDraft.id, addressDraft) : await addCustomerAddress(addressDraft); await refresh(); setAddressDraft(null) }, language === 'th' ? 'บันทึกที่อยู่แล้ว' : 'Address saved.') }
  const removeAddress = (id) => run(async () => { await deleteCustomerAddress(id); await refresh() })
  const changePassword = (event) => { event.preventDefault(); run(async () => { await changeCustomerPassword(passwords); setPasswords({ currentPassword: '', newPassword: '' }); await refresh() }, language === 'th' ? 'เปลี่ยนรหัสผ่านแล้ว' : 'Password changed.') }
  const removeAccount = (event) => { event.preventDefault(); if (!window.confirm(t('deleteWarning'))) return; run(async () => { await deleteCustomerAccount(form.deletePassword); setAccount(null); setMode('login'); setOpen(false) }) }
  const submitReturn = (event) => { event.preventDefault(); run(async () => { await createReturnRequest({ orderId: returnDraft.order.id, reason: returnDraft.reason, note: returnDraft.note, items: returnDraft.order.items.filter((item) => returnDraft.itemIds.includes(item.id)).map((item) => ({ orderItemId: item.id, quantity: item.quantity })) }); await refresh(); setReturnDraft(null) }) }

  return <>
    <button className="customer-account-trigger" type="button" onClick={show}><span aria-hidden="true">♙</span>{t('account')}</button>
    <div className={`customer-account-backdrop ${open ? 'is-open' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section className="customer-account-panel" role="dialog" aria-modal="true" aria-label="ORION account">
        <header><div><p>ORION / Client book</p><h2>{mode === 'account' ? t('yourAccount') : mode === 'register' ? t('join') : mode === 'forgot' ? t('forgotTitle') : mode === 'reset' ? t('resetTitle') : t('welcome')}</h2></div><button type="button" onClick={() => setOpen(false)}>{t('close')}</button></header>
        {loading && !account && mode === 'account' ? <p className="customer-account-loading">Loading...</p> : mode !== 'account' ? (
          mode === 'forgot' || mode === 'reset' ? (
            <form onSubmit={submitRecovery}>
              {mode === 'forgot' && <label htmlFor="customer-recovery-email">{t('email')}<input id="customer-recovery-email" key="customer-recovery-email" name="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, email: val })) }} /></label>}
              {mode === 'reset' && <label htmlFor="customer-reset-password">{t('newPassword')}<input id="customer-reset-password" key="customer-reset-password" name="password" required minLength="8" type="password" autoComplete="new-password" value={form.password} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, password: val })) }} /></label>}
              <AccountFeedback error={error} message={message} />
              <button type="submit" disabled={loading}>{mode === 'forgot' ? t('sendReset') : t('resetPassword')}</button>
              <button className="customer-account-switch" type="button" onClick={() => setMode('login')}>{t('backLogin')}</button>
            </form>
          ) : (
            <form onSubmit={submitAuth}>
              {mode === 'register' && <>
                <label htmlFor="customer-auth-name">{t('fullName')}<input id="customer-auth-name" key="customer-auth-name" name="name" required autoComplete="name" value={form.name} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, name: val })) }} /></label>
                <label htmlFor="customer-auth-phone">{t('phone')}<input id="customer-auth-phone" key="customer-auth-phone" name="phone" autoComplete="tel" value={form.phone} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, phone: val })) }} /></label>
              </>}
              <label htmlFor="customer-auth-email">{t('email')}<input id="customer-auth-email" key="customer-auth-email" name="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, email: val })) }} /></label>
              <label htmlFor="customer-auth-password">{t('password')}<input id="customer-auth-password" key="customer-auth-password" name="password" required type="password" minLength="8" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => { const val = e.target.value; setForm((prev) => ({ ...prev, password: val })) }} /></label>
              <AccountFeedback error={error} message={message} />
              <button type="submit" disabled={loading}>{mode === 'register' ? t('register') : t('signIn')}</button>
              {mode === 'login' && <button className="customer-account-switch" type="button" onClick={() => setMode('forgot')}>{t('forgot')}</button>}
              <button className="customer-account-switch" type="button" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? t('existing') : t('noAccount')}</button>
            </form>
          )
        ) : <div className="customer-account-content">
          <div className="customer-profile"><span>{account.customer.name?.[0]}</span><div><strong>{account.customer.name}</strong><small>{account.customer.email}<br />{account.customer.phone}</small></div><button type="button" onClick={logout}>{t('signOut')}</button></div>
          {!account.customer.emailVerified && <div className="account-verification"><p>{t('unverified')}</p><button type="button" onClick={() => run(async () => { const result = await resendVerification(); if (result.previewUrl) setMessage(result.previewUrl) }, language === 'th' ? 'ส่งอีเมลแล้ว' : 'Verification sent.')}>{t('resend')}</button></div>}
          <nav className="account-tabs">{['overview', 'profile', 'addresses', 'security', 'orders'].map((item) => <button type="button" className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)} key={item}>{t(item)}</button>)}</nav><AccountFeedback error={error} message={message} />
          {tab === 'overview' && <div className="account-overview"><article><strong>{account.orders.length}</strong><span>{t('orders')}</span></article><article><strong>{account.customer.addresses.length}</strong><span>{t('addresses')}</span></article><article><strong>{account.sessions.length}</strong><span>{t('activeSessions')}</span></article></div>}
          {tab === 'profile' && <form className="account-section-form" onSubmit={saveProfile}><label>{t('fullName')}<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>{t('email')}<input value={account.customer.email} disabled /></label><label>{t('phone')}<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><button type="submit">{t('save')}</button></form>}
          {tab === 'addresses' && <div className="account-addresses"><button className="account-add-button" type="button" onClick={() => setAddressDraft({ ...emptyAddress, recipient: account.customer.name, phone: account.customer.phone || '' })}>+ {t('addAddress')}</button>{account.customer.addresses.map((item) => <article key={item.id}><div><strong>{item.label}{item.isDefault ? ' · Default' : ''}</strong><span>{item.recipient} · {item.phone}</span><small>{item.address}, {item.city}, {item.province} {item.postalCode}, {item.country}</small></div><div><button onClick={() => setAddressDraft(item)} type="button">{t('edit')}</button><button onClick={() => removeAddress(item.id)} type="button">{t('delete')}</button></div></article>)}{addressDraft && <form className="account-address-form" onSubmit={saveAddress}>{['label', 'recipient', 'phone', 'address', 'city', 'province', 'postalCode', 'country'].map((field) => <label key={field}>{field === 'recipient' ? t('fullName') : t(field) || field}<input required={!['province'].includes(field)} value={addressDraft[field] || ''} onChange={(e) => setAddressDraft({ ...addressDraft, [field]: e.target.value })} /></label>)}<label className="account-check"><input type="checkbox" checked={addressDraft.isDefault} onChange={(e) => setAddressDraft({ ...addressDraft, isDefault: e.target.checked })} />{t('defaultAddress')}</label><div><button type="submit">{t('save')}</button><button type="button" onClick={() => setAddressDraft(null)}>{t('cancel')}</button></div></form>}</div>}
          {tab === 'security' && <div className="account-security"><form className="account-section-form" onSubmit={changePassword}><h3>{t('changePassword')}</h3><label>{t('currentPassword')}<input type="password" required value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label><label>{t('newPassword')}<input type="password" minLength="8" required value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} /></label><button type="submit">{t('changePassword')}</button></form><div className="account-sessions"><h3>{t('activeSessions')}</h3>{account.sessions.map((session) => <article key={session.id}><div><strong>{session.current ? t('currentDevice') : (session.userAgent || 'Device').split(' ').slice(0, 4).join(' ')}</strong><small>{new Date(session.lastSeenAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB')} · {session.ipAddress || ''}</small></div>{!session.current && <button type="button" onClick={() => run(async () => { await revokeCustomerSession(session.id); await refresh() })}>{t('revoke')}</button>}</article>)}<button type="button" onClick={() => run(async () => { await revokeOtherCustomerSessions(); await refresh() })}>{t('revokeOthers')}</button></div><form className="account-delete" onSubmit={removeAccount}><h3>{t('deleteAccount')}</h3><p>{t('deleteWarning')}</p><label>{t('confirmPassword')}<input required type="password" value={form.deletePassword || ''} onChange={(e) => setForm({ ...form, deletePassword: e.target.value })} /></label><button type="submit">{t('deleteAccount')}</button></form></div>}
          {tab === 'orders' && <div className="customer-orders"><p>{t('orderHistory')}</p>{account.orders.map((order) => <article key={order.id}><div><span>{order.orderNumber}</span><strong>{new Date(order.createdAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB')}</strong></div><div><span>{order.status}</span><strong>{new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(order.total)}</strong></div>{['shipped', 'completed'].includes(order.status) && <button className="customer-return-start" type="button" onClick={() => setReturnDraft({ order, itemIds: order.items.map((item) => item.id), reason: '', note: '' })}>Request a return</button>}</article>)}{!account.orders.length && <small>No orders yet.</small>}{returnDraft && <form className="customer-return-form" onSubmit={submitReturn}><label>Reason<textarea required value={returnDraft.reason} onChange={(e) => setReturnDraft({ ...returnDraft, reason: e.target.value })} /></label><label>Note<textarea value={returnDraft.note} onChange={(e) => setReturnDraft({ ...returnDraft, note: e.target.value })} /></label><button type="submit">Send request</button></form>}</div>}
        </div>}
      </section>
    </div>
  </>
}
