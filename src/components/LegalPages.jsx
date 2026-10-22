import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n'
import { getLegalSettings } from '../services/commerce'

export default function LegalPages() {
  const { language, t } = useLanguage()
  const [page, setPage] = useState(null)
  const [legal, setLegal] = useState({})
  useEffect(() => { getLegalSettings().then(setLegal).catch(() => {}) }, [])
  const th = language === 'th'
  const data = {
    privacy: [th ? 'ประกาศความเป็นส่วนตัว' : 'Privacy notice', th ? legal.privacyTh : legal.privacyEn],
    terms: [th ? 'ข้อกำหนดการขาย' : 'Terms of sale', th ? legal.termsTh : legal.termsEn],
    shipping: [th ? 'การจัดส่ง' : 'Shipping', th ? legal.shippingTh : legal.shippingEn],
    returnPolicy: [th ? 'นโยบายคืนสินค้า' : 'Returns policy', th ? legal.returnsTh : legal.returnsEn],
  }
  return <><nav className="legal-links" aria-label="Legal information">{Object.keys(data).map((key) => <button key={key} type="button" onClick={() => setPage(key)}>{t(key)}</button>)}</nav>{page && <div className="legal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPage(null) }}><article className="legal-modal" role="dialog" aria-modal="true"><button type="button" onClick={() => setPage(null)}>{t('close')}</button><p>ORION / Client information</p><h2>{data[page][0]}</h2><div><p>{data[page][1] || (th ? 'กำลังปรับปรุงข้อมูล' : 'Information is being updated.')}</p><dl><div><dt>{th ? 'ผู้ให้บริการ' : 'Operator'}</dt><dd>{th ? legal.companyNameTh : legal.companyName}</dd></div><div><dt>{t('address')}</dt><dd>{th ? legal.addressTh : legal.address}</dd></div><div><dt>{t('email')}</dt><dd>{legal.email}</dd></div><div><dt>{t('phone')}</dt><dd>{legal.phone}</dd></div></dl><small>{th ? `ระยะเวลายื่นคำขอคืนสินค้า: ${legal.returnDays || 14} วัน` : `Return request period: ${legal.returnDays || 14} days`}</small></div></article></div>}</>
}
