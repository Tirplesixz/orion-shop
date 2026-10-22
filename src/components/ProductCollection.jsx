import { useEffect, useRef, useState } from 'react'
import { getProducts } from '../services/commerce'
import StoreCart from './StoreCart'
import CustomerAccount from './CustomerAccount'
import { LanguageSwitch, useLanguage } from '../i18n'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const money = (value, currency = 'THB') =>
  new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)

export default function ProductCollection({ initialSlug }) {
  const { language, t } = useLanguage()
  const sectionRef = useRef(null)
  const studioRef = useRef(null)

  const [products, setProducts] = useState([])
  const [productIndex, setProductIndex] = useState(0)
  const [activeView, setActiveView] = useState(0) // index in images, or 'campaign'
  const [viewMode, setViewMode] = useState('both') // 'both' | 'studio' | 'gallery'
  const [selectedVariant, setSelectedVariant] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [orderState, setOrderState] = useState('idle')
  const [cartOpen, setCartOpen] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('orion_cart') || '[]')
    } catch {
      return []
    }
  })

  // Fetch product catalog
  useEffect(() => {
    const controller = new AbortController()
    getProducts({ signal: controller.signal })
      .then((items) => {
        if (items && items.length > 0) {
          setProducts(items)
          if (initialSlug) {
            const foundIdx = items.findIndex((p) => p.slug === initialSlug)
            if (foundIdx >= 0) setProductIndex(foundIdx)
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setOrderState('load-error')
      })
    return () => controller.abort()
  }, [initialSlug])

  // Handle initialSlug updates or hash scrolling
  useEffect(() => {
    if (!products.length || !initialSlug) return
    const idx = products.findIndex((p) => p.slug === initialSlug)
    if (idx >= 0 && idx !== productIndex) {
      setProductIndex(idx)
    }
  }, [initialSlug, products])

  // Reset variant and active view on product switch
  useEffect(() => {
    setSelectedVariant('')
    setQuantity(1)
    setActiveView(0)
    setOrderState('idle')
  }, [productIndex])

  // Sync cart to localStorage
  useEffect(() => {
    localStorage.setItem('orion_cart', JSON.stringify(cart))
  }, [cart])

  const product = products[productIndex]

  const selectProduct = (index, scrollIntoStudio = false) => {
    setProductIndex(index)
    const p = products[index]
    if (p && window.history?.replaceState) {
      window.history.replaceState(null, '', `/products/${p.slug}`)
    }
    if (scrollIntoStudio && studioRef.current) {
      studioRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const changeQuantity = (direction) => {
    setQuantity((value) => clamp(value + direction, 1, 10))
  }

  const addToCart = (event) => {
    event.preventDefault()
    if (!product) return

    if (!selectedVariant) {
      setOrderState('variant-required')
      return
    }

    const variant = product.variants?.find((item) => item.id === selectedVariant)
    if (!variant) {
      setOrderState('variant-required')
      return
    }

    const id = `${product.id}:${selectedVariant}`
    const productName = language === 'th' && product.nameTh ? product.nameTh : product.name
    const variantLabel = `${variant.label}${variant.color ? ` / ${language === 'th' && variant.colorTh ? variant.colorTh : variant.color}` : ''}`
    const thumbImage = product.images?.[0]?.src || product.campaignImage?.src

    setCart((current) => {
      const existing = current.find((item) => item.id === id)
      if (existing) {
        return current.map((item) =>
          item.id === id
            ? { ...item, quantity: Math.min(item.quantity + quantity, variant.stock || 10) }
            : item,
        )
      }
      return [
        ...current,
        {
          id,
          productId: product.id,
          productName,
          collection: product.collection,
          image: thumbImage,
          variantId: variant.id,
          variantLabel,
          stock: variant.stock,
          quantity,
          price: product.price,
          currency: product.currency,
        },
      ]
    })

    setOrderState('added')
    setCartOpen(true)
  }

  if (!product) {
    return (
      <section className="product-loading" id="shop" aria-live="polite">
        {orderState === 'load-error'
          ? language === 'th'
            ? 'ไม่สามารถโหลดคอลเลกชันได้'
            : 'Unable to load the collection.'
          : language === 'th'
            ? 'กำลังเตรียมคอลเลกชัน…'
            : 'Preparing the collection...'}
      </section>
    )
  }

  const productName = language === 'th' && product.nameTh ? product.nameTh : product.name
  const productDescription = language === 'th' && product.descriptionTh ? product.descriptionTh : product.description
  const images = product.images || []
  const currentImageSrc = activeView === 'campaign'
    ? product.campaignImage?.src
    : images[activeView]?.src || product.campaignImage?.src
  const currentImageAlt = activeView === 'campaign'
    ? product.campaignImage?.alt
    : images[activeView]?.alt || product.campaignImage?.alt

  const statusMessage = {
    'variant-required': language === 'th' ? 'กรุณาเลือกไซซ์ก่อนดำเนินการต่อ' : 'Please select a size before continuing.',
    added: language === 'th' ? 'เพิ่มลงในถุงช้อปปิ้งเรียบร้อยแล้ว' : 'Added to your private shopping bag.',
    'submit-error': language === 'th' ? 'ไม่สามารถเตรียมคำสั่งซื้อได้ กรุณาลองใหม่อีกครั้ง' : 'We could not prepare this order. Please try again.',
  }[orderState]

  return (
    <section ref={sectionRef} className="unified-shop-section" id="shop" aria-label="Shop the ORION collection">
      {/* Floating Store Controls */}
      <StoreCart
        items={cart}
        open={cartOpen}
        onOpen={() => setCartOpen(true)}
        onClose={() => setCartOpen(false)}
        onChange={setCart}
        onCompleted={() => setCart([])}
      />
      <CustomerAccount />
      <LanguageSwitch />

      {/* Main Collection Header */}
      <header className="unified-shop-header">
        <div className="unified-shop-title-wrap">
          <p className="unified-shop-eyebrow">ORION / Collection 01</p>
          <h2 id="product-grid-title">{t('shopCollection')}</h2>
        </div>
        <div className="unified-shop-meta">
          <p className="unified-shop-subtitle">
            {language === 'th'
              ? 'สำรวจประติมากรรมคลาสสิกที่ถูกตีความใหม่ สัมผัสมุมมองแบบ 360° ในสตูดิโอ และเลือกสั่งจองไซซ์ที่เหมาะกับคุณ'
              : 'Sculptural heritage reimagined for modern posture. Inspect pieces in our interactive 360° studio and customize sizing.'}
          </p>
          <div className="unified-view-tabs" role="tablist" aria-label="View mode">
            <button
              type="button"
              className={viewMode === 'both' ? 'is-active' : ''}
              onClick={() => setViewMode('both')}
            >
              <span>{t('viewBoth')}</span>
            </button>
            <button
              type="button"
              className={viewMode === 'studio' ? 'is-active' : ''}
              onClick={() => setViewMode('studio')}
            >
              <span>{t('viewStudio')}</span>
            </button>
            <button
              type="button"
              className={viewMode === 'gallery' ? 'is-active' : ''}
              onClick={() => setViewMode('gallery')}
            >
              <span>{t('viewGallery')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Section 1: The Collection Showcase Cards (From Image 2) */}
      {(viewMode === 'both' || viewMode === 'gallery') && (
        <div className={`collection-cards-grid ${viewMode === 'gallery' ? 'is-full-gallery' : ''}`}>
          <div className="collection-cards-track">
            {products.map((item, index) => {
              const isActive = index === productIndex
              const itemTitle = language === 'th' && item.nameTh ? item.nameTh : item.name
              const itemPrice = item.price === null ? item.priceLabel : money(item.price, item.currency)
              return (
                <article
                  key={item.id}
                  className={`collection-card-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => selectProduct(index, true)}
                >
                  <div className="collection-card-media">
                    <img
                      src={item.campaignImage.src}
                      alt={item.campaignImage.alt}
                      loading="lazy"
                    />
                    <span className="collection-card-overlay" />
                    {isActive && (
                      <span className="collection-card-badge">
                        <i /> {t('activeInStudio')}
                      </span>
                    )}
                  </div>
                  <div className="collection-card-info">
                    <small>{item.collection || 'Collection 01'}</small>
                    <h3>{itemTitle}</h3>
                    <em>{itemPrice}</em>
                    <button
                      type="button"
                      className="collection-card-action"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectProduct(index, true)
                      }}
                    >
                      <span>{t('inspectStudio')}</span>
                      <span aria-hidden="true">↓</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 2: Interactive 360° Product Studio & Dossier (From Image 1) */}
      {(viewMode === 'both' || viewMode === 'studio') && (
        <div
          ref={studioRef}
          className="product-studio-stage"
          id="product-details"
          style={{
            '--product-canvas': product.theme?.canvas || '#07101d',
            '--product-glow': product.theme?.glow || 'rgba(67, 111, 173, 0.5)',
            '--product-accent': product.theme?.accent || '#c7a566',
          }}
        >
          {/* Left Column: 360° Multi-Angle Gallery & Campaign Switcher */}
          <div className="product-studio-gallery">
            <div className="studio-gallery-header">
              <p className="product-view-count" aria-live="polite">
                <span>0{typeof activeView === 'number' ? activeView + 1 : '★'}</span> / 0{images.length}
              </p>
              <div className="studio-view-toggle">
                <button
                  type="button"
                  className={activeView !== 'campaign' ? 'is-active' : ''}
                  onClick={() => setActiveView(0)}
                >
                  {t('garmentAngles')}
                </button>
                <button
                  type="button"
                  className={activeView === 'campaign' ? 'is-active' : ''}
                  onClick={() => setActiveView('campaign')}
                >
                  {t('campaignLook')}
                </button>
              </div>
            </div>

            <div className="studio-image-display">
              <img
                key={`${product.id}-${activeView}`}
                src={currentImageSrc}
                alt={currentImageAlt}
                className="studio-active-image"
                loading="eager"
              />
              <div className="studio-glow-orb" aria-hidden="true" />
            </div>

            {/* View angle buttons */}
            <div className="product-view-nav" aria-label="Product angles">
              {images.map((image, index) => (
                <button
                  key={image.id || index}
                  type="button"
                  className={activeView === index ? 'is-active' : ''}
                  onClick={() => setActiveView(index)}
                  aria-pressed={activeView === index}
                >
                  <span>0{index + 1}</span> {image.label}
                </button>
              ))}
              {product.campaignImage?.src && (
                <button
                  type="button"
                  className={activeView === 'campaign' ? 'is-active' : ''}
                  onClick={() => setActiveView('campaign')}
                  aria-pressed={activeView === 'campaign'}
                >
                  <span>★</span> {t('campaignLook')}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Luxury Order Console & Specs Dossier */}
          <form className="product-order-console" onSubmit={addToCart}>
            {/* Quick Piece Switcher (Image 1 thumbnails at top right) */}
            {products.length > 1 && (
              <div className="product-switcher">
                <div className="product-switcher-header">
                  <label>{t('browse')}</label>
                  <span>{productIndex + 1} / {products.length}</span>
                </div>
                <div className="product-switcher-rail">
                  {products.map((item, index) => {
                    const isSelected = index === productIndex
                    const nameLabel = language === 'th' && item.nameTh ? item.nameTh : item.name
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={isSelected ? 'is-active' : ''}
                        onClick={() => selectProduct(index, false)}
                        aria-pressed={isSelected}
                      >
                        <img src={item.campaignImage.src} alt="" />
                        <span>{nameLabel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="product-eyebrow">{product.eyebrow || 'ORION / Signature piece'}</p>
            <h2 className="product-title">{productName}</h2>
            <p className="product-description">{productDescription}</p>

            <p className="product-price">
              {product.price === null ? product.priceLabel : money(product.price, product.currency)}
            </p>

            {/* Luxury Garment Specifications */}
            <dl className="product-specs-list">
              <div>
                <dt>{t('material')}</dt>
                <dd>{language === 'th' && product.materialTh ? product.materialTh : product.material}</dd>
              </div>
              <div>
                <dt>{t('fit')}</dt>
                <dd>{language === 'th' && product.fitTh ? product.fitTh : product.fit}</dd>
              </div>
              <div>
                <dt>{t('care')}</dt>
                <dd>{language === 'th' && product.careTh ? product.careTh : product.care}</dd>
              </div>
            </dl>

            {/* Size Selection */}
            <fieldset className="product-sizes">
              <legend>
                <span>{t('selectSize')}</span>
                <button
                  className="size-guide-link"
                  type="button"
                  onClick={() => setSizeGuideOpen(true)}
                >
                  {t('sizeGuide')}
                </button>
              </legend>
              <div className="product-sizes-grid">
                {(product.variants || []).map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={selectedVariant === variant.id ? 'is-selected' : ''}
                    disabled={!variant.available}
                    onClick={() => {
                      setSelectedVariant(variant.id)
                      setOrderState('idle')
                    }}
                    aria-pressed={selectedVariant === variant.id}
                  >
                    <span>{variant.label}</span>
                    {variant.color && (
                      <small>
                        <i style={{ background: variant.colorHex || '#c7a566' }} />
                        {language === 'th' && variant.colorTh ? variant.colorTh : variant.color}
                      </small>
                    )}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Quantity Stepper & Add to Bag */}
            <div className="product-order-actions">
              <div className="quantity-control" aria-label="Quantity">
                <button
                  type="button"
                  onClick={() => changeQuantity(-1)}
                  aria-label="Decrease quantity"
                >
                  {'\u2212'}
                </button>
                <output aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  onClick={() => changeQuantity(1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button className="order-button" type="submit">
                <span>{t('addBag')}</span>
                <span aria-hidden="true">{'\u2197'}</span>
              </button>
            </div>

            {/* Error or Confirmation Status */}
            <p
              className={`order-status ${statusMessage ? 'is-visible' : ''}`}
              aria-live="polite"
            >
              {statusMessage || '\u00a0'}
            </p>
          </form>
        </div>
      )}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (
        <div
          className="size-guide-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSizeGuideOpen(false)
          }}
        >
          <section className="size-guide-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <p>ORION / Atelier Fit Service</p>
                <h2>{t('sizeGuide')}</h2>
              </div>
              <button type="button" onClick={() => setSizeGuideOpen(false)}>
                {t('close')}
              </button>
            </header>
            <div className="size-guide-details">
              <article>
                <span>{t('fit')}</span>
                <p>{(language === 'th' && product.fitTh) ? product.fitTh : (product.fit || 'Relaxed statement silhouette.')}</p>
              </article>
              <article>
                <span>{t('material')}</span>
                <p>{(language === 'th' && product.materialTh) ? product.materialTh : (product.material || 'Premium sculptural textiles.')}</p>
              </article>
              <article>
                <span>{t('care')}</span>
                <p>{(language === 'th' && product.careTh) ? product.careTh : (product.care || 'Specialist dry clean only.')}</p>
              </article>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Chest (cm)</th>
                  <th>Length (cm)</th>
                </tr>
              </thead>
              <tbody>
                {(product.sizeGuide?.length
                  ? product.sizeGuide
                  : [
                      { size: 'S', chest: '92–96', length: '105' },
                      { size: 'M', chest: '97–102', length: '107' },
                      { size: 'L', chest: '103–108', length: '109' },
                      { size: 'XL', chest: '109–116', length: '111' },
                    ]
                ).map((row) => (
                  <tr key={row.size}>
                    <td>{row.size}</td>
                    <td>{row.chest}</td>
                    <td>{row.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </section>
  )
}
