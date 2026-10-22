import { useEffect, useRef, useState } from 'react'
import ProductCollection from './components/ProductCollection'
import LegalPages from './components/LegalPages'
import { useLanguage } from './i18n'

// Replace this file in public/media/audio or update this path to swap the soundtrack.
const BACKGROUND_AUDIO_SRC = '/media/audio/orion-instrumental-loop.mp3'
const BACKGROUND_AUDIO_VOLUME = 0.16

const CHAPTERS = [
  { start: 0.13, end: 0.28, label: 'Enter the world of ORION', side: 'left' },
  { start: 0.31, end: 0.46, label: 'Heritage, reimagined', side: 'right' },
  { start: 0.49, end: 0.64, label: 'Everyday, elevated', side: 'left' },
  { start: 0.67, end: 0.82, label: 'Made to be remembered', side: 'right' },
]

const COLLECTION_CARDS = [
  {
    image: '/media/collection/garden-formal.jpg',
    alt: 'Classical figure in a pale pink suit standing in a flower garden',
    title: 'Garden Formal',
    note: 'The new romantic',
  },
  {
    image: '/media/collection/salon-orange.jpg',
    alt: 'Classical figure in an orange suit seated in a turquoise salon',
    title: 'Salon Study',
    note: 'Leisure, recast',
  },
  {
    image: '/media/collection/rose-street.jpg',
    alt: 'Classical figure in streetwear against a vivid rose backdrop',
    title: 'Rose Street',
    note: 'Sculpted to move',
  },
  {
    image: '/media/collection/velvet-evening.jpg',
    alt: 'Classical figure wearing dark green velvet in an ornate room',
    title: 'Velvet Evening',
    note: 'After hours',
  },
  {
    image: '/media/collection/imperial-pink.jpg',
    alt: 'Classical figure in a pink fur coat holding an ornate casket',
    title: 'Imperial Pink',
    note: 'Soft power',
  },
]

function AudioControl() {
  const { language } = useLanguage()
  const audioRef = useRef(null)
  const [audioState, setAudioState] = useState('off')
  const isPlaying = audioState === 'playing'

  const toggleAudio = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setAudioState('off')
      return
    }

    audio.volume = BACKGROUND_AUDIO_VOLUME
    audio.muted = false

    try {
      await audio.play()
      setAudioState('playing')
    } catch {
      setAudioState('error')
    }
  }

  return (
    <div className="audio-control-wrap">
      <audio
        ref={audioRef}
        src={BACKGROUND_AUDIO_SRC}
        loop
        preload="none"
        onError={() => setAudioState('error')}
      />
      <button
        type="button"
        className={`audio-control ${isPlaying ? 'is-playing' : ''}`}
        onClick={toggleAudio}
        aria-label={isPlaying ? 'Turn background music off' : 'Turn background music on'}
        aria-pressed={isPlaying}
      >
        <span className="audio-equalizer" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className="audio-label">{language === 'th' ? 'เสียง' : 'Sound'}</span>
        <span className="audio-state">{isPlaying ? (language === 'th' ? 'เปิด' : 'On') : (language === 'th' ? 'ปิด' : 'Off')}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {audioState === 'error'
          ? 'The background music could not be played.'
          : `Background music ${isPlaying ? 'on' : 'off'}.`}
      </span>
    </div>
  )
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

function useCursorParallax() {
  useEffect(() => {
    const root = document.documentElement
    const pointerQuery = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let animationFrame = 0
    let enabled = pointerQuery.matches

    const render = () => {
      current.x += (target.x - current.x) * 0.085
      current.y += (target.y - current.y) * 0.085

      root.style.setProperty('--parallax-hero-x', `${(-current.x * 14).toFixed(2)}px`)
      root.style.setProperty('--parallax-hero-y', `${(-current.y * 10).toFixed(2)}px`)
      root.style.setProperty('--parallax-card-x', `${(-current.x * 8).toFixed(2)}px`)
      root.style.setProperty('--parallax-card-y', `${(-current.y * 6).toFixed(2)}px`)
      root.style.setProperty('--parallax-feature-x', `${(-current.x * 8).toFixed(2)}px`)
      root.style.setProperty('--parallax-feature-y', `${(-current.y * 6).toFixed(2)}px`)
      root.style.setProperty('--parallax-tilt-x', `${(-current.y * 1.3).toFixed(3)}deg`)
      root.style.setProperty('--parallax-tilt-y', `${(current.x * 1.7).toFixed(3)}deg`)

      const isSettled = Math.abs(target.x - current.x) < 0.001
        && Math.abs(target.y - current.y) < 0.001

      if (isSettled) {
        current.x = target.x
        current.y = target.y
        animationFrame = 0
        return
      }

      animationFrame = window.requestAnimationFrame(render)
    }

    const requestRender = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(render)
    }

    const centerParallax = () => {
      target.x = 0
      target.y = 0
      requestRender()
    }

    const updatePointer = (event) => {
      if (!enabled) return
      target.x = clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1)
      target.y = clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1)
      requestRender()
    }

    const handleWindowExit = (event) => {
      if (!event.relatedTarget) centerParallax()
    }

    const updateCapability = (event) => {
      enabled = event.matches
      centerParallax()
    }

    window.addEventListener('pointermove', updatePointer, { passive: true })
    window.addEventListener('mouseout', handleWindowExit)
    window.addEventListener('blur', centerParallax)
    pointerQuery.addEventListener('change', updateCapability)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', updatePointer)
      window.removeEventListener('mouseout', handleWindowExit)
      window.removeEventListener('blur', centerParallax)
      pointerQuery.removeEventListener('change', updateCapability)
        ;[
          '--parallax-hero-x', '--parallax-hero-y', '--parallax-card-x',
          '--parallax-card-y', '--parallax-feature-x', '--parallax-feature-y',
          '--parallax-tilt-x', '--parallax-tilt-y',
        ].forEach((property) => root.style.removeProperty(property))
    }
  }, [])
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0))
  return x * x * (3 - 2 * x)
}

function sceneOpacity(progress, start, end) {
  const fade = Math.min(0.035, (end - start) / 3)
  return Math.min(
    smoothstep(start, start + fade, progress),
    1 - smoothstep(end - fade, end, progress),
  )
}

function ScrollFilm() {
  const { language } = useLanguage()
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const chapterRefs = useRef([])
  const targetRef = useRef(0)
  const currentRef = useRef(0)
  const lastScrollRef = useRef({ progress: 0, time: performance.now() })
  const durationRef = useRef(32)
  const reducedMotionRef = useRef(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const video = videoRef.current
    if (!section || !stage || !video) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches

    let animationFrame
    let lastPaint = 0

    const getRawProgress = () => {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY
      const distance = Math.max(1, section.offsetHeight - window.innerHeight)
      return clamp((window.scrollY - sectionTop) / distance)
    }

    const updateTarget = () => {
      if (reducedMotionRef.current) return

      const now = performance.now()
      const raw = getRawProgress()
      const previous = lastScrollRef.current
      const elapsed = Math.max(16, now - previous.time)
      const velocity = (raw - previous.progress) / elapsed
      const momentum = clamp(velocity * 220, -0.028, 0.028)

      targetRef.current = clamp(raw + momentum)
      lastScrollRef.current = { progress: raw, time: now }
    }

    const updateMotionPreference = (event) => {
      reducedMotionRef.current = event.matches
      section.classList.toggle('is-reduced', event.matches)
      if (event.matches) {
        targetRef.current = 0
        currentRef.current = 0
        video.pause()
        if (video.readyState >= 1) video.currentTime = 0
        stage.style.setProperty('--film-progress', '0')
        stage.style.setProperty('--intro-opacity', '1')
        stage.style.setProperty('--intro-shift', '0px')
        stage.style.setProperty('--video-opacity', '0')
        stage.style.setProperty('--poster-opacity', '1')
        stage.style.setProperty('--poster-scale', '1')
        stage.style.setProperty('--final-opacity', '0')
        stage.style.setProperty('--final-shift', '22px')
      } else {
        updateTarget()
      }
    }

    const render = (time) => {
      if (!reducedMotionRef.current) {
        const target = targetRef.current
        const current = currentRef.current
        const next = Math.abs(target - current) < 0.00008
          ? target
          : current + (target - current) * 0.085

        currentRef.current = next
        stage.style.setProperty('--film-progress', next.toFixed(5))
        const introOpacity = 1 - smoothstep(0.018, 0.115, next)
        stage.style.setProperty('--intro-opacity', introOpacity.toFixed(4))
        stage.style.setProperty('--intro-shift', `${((1 - introOpacity) * -24).toFixed(1)}px`)
        stage.style.setProperty('--video-opacity', smoothstep(0.012, 0.1, next).toFixed(4))
        stage.style.setProperty('--poster-opacity', (1 - smoothstep(0.02, 0.105, next)).toFixed(4))
        stage.style.setProperty('--poster-scale', (1 + next * 0.025).toFixed(4))
        const finalOpacity = smoothstep(0.86, 0.94, next)
        stage.style.setProperty('--final-opacity', finalOpacity.toFixed(4))
        stage.style.setProperty('--final-shift', `${((1 - finalOpacity) * 22).toFixed(1)}px`)

        chapterRefs.current.forEach((element, index) => {
          if (!element) return
          const chapter = CHAPTERS[index]
          const opacity = sceneOpacity(next, chapter.start, chapter.end)
          element.style.setProperty('--caption-opacity', opacity.toFixed(3))
          element.style.setProperty('--caption-shift', `${((1 - opacity) * 18).toFixed(1)}px`)
        })

        if (video.readyState >= 1 && time - lastPaint > 28) {
          const desiredTime = next * durationRef.current
          if (Math.abs(video.currentTime - desiredTime) > 0.018) {
            video.currentTime = desiredTime
          }
          lastPaint = time
        }
      }

      animationFrame = window.requestAnimationFrame(render)
    }

    const onLoadedMetadata = () => {
      if (Number.isFinite(video.duration)) durationRef.current = video.duration
      video.currentTime = 0
      setIsReady(true)
    }

    section.classList.toggle('is-reduced', motionQuery.matches)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    window.addEventListener('scroll', updateTarget, { passive: true })
    window.addEventListener('resize', updateTarget)
    motionQuery.addEventListener('change', updateMotionPreference)
    updateTarget()
    animationFrame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      window.removeEventListener('scroll', updateTarget)
      window.removeEventListener('resize', updateTarget)
      motionQuery.removeEventListener('change', updateMotionPreference)
    }
  }, [])

  const scrollToCollection = () => {
    document.querySelector('#collection')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section ref={sectionRef} className="film-scroll" aria-label="ORION story film">
      <div ref={stageRef} className={`film-stage ${isReady ? 'is-ready' : ''}`}>
        <div className="film-media-parallax">
          <video
            ref={videoRef}
            className="film-video"
            src="/media/orion-film.mp4"
            poster="/media/orion-garden-poster.png"
            preload="auto"
            muted
            playsInline
            aria-hidden="true"
          />
          <div className="film-poster" aria-hidden="true" />
        </div>
        <div className="film-grade" aria-hidden="true" />

        <header className="hero-nav intro-layer">
          <a className="nav-wordmark" href="#top" aria-label="ORION home">ORION</a>
          <nav aria-label="Main navigation">
            <a href="#story">{language === 'th' ? 'เรื่องราว' : 'Our world'}</a>
            <a href="#collection">{language === 'th' ? 'คอลเลกชัน' : 'Collection'}</a>
          </nav>
          <button className="nav-menu" type="button" onClick={scrollToCollection} aria-label="Explore collection">
            <span />
            <span />
          </button>
        </header>

        <div className="hero-intro intro-layer" id="top">
          <p className="hero-kicker"><span>Est.</span> {language === 'th' ? 'ระหว่างสองยุคสมัย' : 'Between eras'}</p>
          <h1>ORION</h1>
          <div className="hero-bottomline">
            <p>{language === 'th' ? 'รากเหง้าคลาสสิก' : 'Classic roots.'}<br />{language === 'th' ? 'ทัศนคติร่วมสมัย' : 'Modern attitude.'}</p>
            <button type="button" className="outline-button" onClick={scrollToCollection}>
              <span>{language === 'th' ? 'สำรวจคอลเลกชัน' : 'Explore Collection'}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>

        <div className="scroll-cue intro-layer" aria-hidden="true">
          <span>{language === 'th' ? 'เลื่อนเพื่อเข้าสู่เรื่องราว' : 'Scroll to enter'}</span>
          <i><b /></i>
        </div>

        <div className="chapter-index" aria-hidden="true">
          <span>01</span>
          <i><b /></i>
          <span>05</span>
        </div>

        <div className="scene-captions" aria-live="polite">
          {CHAPTERS.map((chapter, index) => (
            <p
              key={chapter.label}
              ref={(element) => { chapterRefs.current[index] = element }}
              className={`scene-caption is-${chapter.side}`}
            >
              <span className="scene-number">0{index + 1}</span>
              <span>{language === 'th' ? ['เข้าสู่โลกของ ORION', 'มรดกที่ตีความใหม่', 'ยกระดับทุกวัน', 'สร้างมาเพื่อให้จดจำ'][index] : chapter.label}</span>
            </p>
          ))}
        </div>

        <div className="final-cta">
          <p>{language === 'th' ? 'เรื่องราวยังดำเนินต่อ' : 'The story continues'}</p>
          <button type="button" className="solid-button" onClick={scrollToCollection}>
            Explore the Collection <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="reduced-note">
          <span>{language === 'th' ? 'ลดการเคลื่อนไหวแล้ว' : 'Motion reduced'}</span>
          <span>{language === 'th' ? 'สำรวจโลกของ ORION ในจังหวะของคุณ' : 'Explore the ORION world at your pace.'}</span>
        </div>
      </div>
    </section>
  )
}

function CollectionCards() {
  const { language } = useLanguage()
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const cardRefs = useRef([])
  const counterRef = useRef(null)
  const targetRef = useRef(0)
  const currentRef = useRef(0)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    if (!section || !stage) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches
    let animationFrame
    let activeCard = -1

    const getProgress = () => {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY
      const distance = Math.max(1, section.offsetHeight - window.innerHeight)
      return clamp((window.scrollY - sectionTop) / distance)
    }

    const updateTarget = () => {
      if (!reducedMotion) targetRef.current = getProgress()
    }

    const renderCards = (progress) => {
      stage.style.setProperty('--cards-progress', progress.toFixed(5))
      const nextActive = Math.min(
        COLLECTION_CARDS.length - 1,
        Math.max(0, Math.floor(progress * COLLECTION_CARDS.length)),
      )

      if (nextActive !== activeCard && counterRef.current) {
        activeCard = nextActive
        counterRef.current.textContent = String(nextActive + 1).padStart(2, '0')
      }

      cardRefs.current.forEach((card, index) => {
        if (!card) return
        const start = -0.12 + index * 0.185
        const local = clamp((progress - start) / 0.38)
        const eased = smoothstep(0, 1, local)
        const fadeIn = smoothstep(0, 0.12, local)
        const fadeOut = 1 - smoothstep(0.82, 1, local)
        const opacity = Math.min(fadeIn, fadeOut)
        const x = 62 + (-130 * eased)
        const y = 56 + (-120 * eased)
        const rotation = 7.5 + (-15 * eased) + ((index % 2) * 1.2)
        const scale = 0.97 + (Math.sin(local * Math.PI) * 0.03)

        card.style.setProperty('--card-x', `${x.toFixed(2)}vw`)
        card.style.setProperty('--card-y', `${y.toFixed(2)}vh`)
        card.style.setProperty('--card-rotation', `${rotation.toFixed(2)}deg`)
        card.style.setProperty('--card-opacity', opacity.toFixed(4))
        card.style.setProperty('--card-scale', scale.toFixed(4))
      })
    }

    const render = () => {
      if (!reducedMotion) {
        const current = currentRef.current
        const target = targetRef.current
        const next = Math.abs(target - current) < 0.0001
          ? target
          : current + (target - current) * 0.1
        currentRef.current = next
        renderCards(next)
      }
      animationFrame = window.requestAnimationFrame(render)
    }

    const updateMotionPreference = (event) => {
      reducedMotion = event.matches
      section.classList.toggle('is-reduced', reducedMotion)
      if (!reducedMotion) {
        targetRef.current = getProgress()
        currentRef.current = targetRef.current
        renderCards(currentRef.current)
      }
    }

    section.classList.toggle('is-reduced', reducedMotion)
    if (window.location.hash === '#lookbook') {
      window.requestAnimationFrame(() => {
        const root = document.documentElement
        const previousBehavior = root.style.scrollBehavior
        root.style.scrollBehavior = 'auto'
        section.scrollIntoView({ behavior: 'auto' })
        window.requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior })
      })
    }
    window.addEventListener('scroll', updateTarget, { passive: true })
    window.addEventListener('resize', updateTarget)
    motionQuery.addEventListener('change', updateMotionPreference)
    updateTarget()
    renderCards(targetRef.current)
    animationFrame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('scroll', updateTarget)
      window.removeEventListener('resize', updateTarget)
      motionQuery.removeEventListener('change', updateMotionPreference)
    }
  }, [])

  return (
    <section ref={sectionRef} className="cards-scroll" id="lookbook" aria-label="ORION collection studies">
      <div ref={stageRef} className="cards-stage">
        <header className="cards-heading">
          <p>ORION / Collection 01</p>
          <h2>{language === 'th' ? 'ห้าบทศึกษา' : 'Five studies'}<br />{language === 'th' ? 'แห่งความต่าง' : 'in contrast.'}</h2>
        </header>

        <p className="cards-direction" aria-hidden="true">{language === 'th' ? 'เลื่อนเพื่อรับชม' : 'Scroll to view'}</p>

        <div className="cards-track">
          {COLLECTION_CARDS.map((card, index) => (
            <article
              className="collection-card"
              key={card.title}
              ref={(element) => { cardRefs.current[index] = element }}
              style={{ zIndex: index + 2 }}
            >
              <div className="card-parallax-plane">
                <figure>
                  <img
                    src={card.image}
                    alt={card.alt}
                    loading={index < 2 ? 'eager' : 'lazy'}
                  />
                </figure>
                <footer>
                  <span>0{index + 1}</span>
                  <p><strong>{card.title}</strong><em>{card.note}</em></p>
                </footer>
              </div>
            </article>
          ))}
        </div>

        <div className="cards-progress" aria-hidden="true">
          <span ref={counterRef}>01</span>
          <i><b /></i>
          <span>05</span>
        </div>
      </div>
    </section>
  )
}

function OrionReveal() {
  const { language } = useLanguage()
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const frameRef = useRef(null)
  const targetRef = useRef(0)
  const currentRef = useRef(0)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const frame = frameRef.current
    if (!section || !stage || !frame) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches
    let animationFrame

    const getProgress = () => {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY
      const distance = Math.max(1, section.offsetHeight - window.innerHeight)
      return clamp((window.scrollY - sectionTop) / distance)
    }

    const updateTarget = () => {
      if (!reducedMotion) targetRef.current = getProgress()
    }

    const renderState = (progress) => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      let startWidth = clamp(viewportWidth * (viewportWidth < 700 ? 0.56 : 0.245), 220, 340)
      let startHeight = startWidth * (16 / 9)
      const startHeightLimit = viewportHeight * 0.72

      if (startHeight > startHeightLimit) {
        startHeight = startHeightLimit
        startWidth = startHeight * (9 / 16)
      }

      const viewportRatio = viewportWidth / viewportHeight
      const finalWidth = viewportRatio > (16 / 9)
        ? viewportWidth
        : viewportHeight * (16 / 9)
      const finalHeight = viewportRatio > (16 / 9)
        ? viewportWidth * (9 / 16)
        : viewportHeight
      const expansion = smoothstep(0.1, 0.88, progress)
      const width = startWidth + ((finalWidth - startWidth) * expansion)
      const height = startHeight + ((finalHeight - startHeight) * expansion)
      const annotationsOpacity = 1 - smoothstep(0.14, 0.58, progress)
      const annotationBlur = smoothstep(0.18, 0.62, progress) * 5
      const finalOpacity = smoothstep(0.72, 0.94, progress)

      frame.style.setProperty('--reveal-width', `${width.toFixed(2)}px`)
      frame.style.setProperty('--reveal-height', `${height.toFixed(2)}px`)
      frame.style.setProperty('--reveal-radius', `${(28 * (1 - expansion)).toFixed(2)}px`)
      frame.style.setProperty('--reveal-shadow-opacity', (0.26 * (1 - expansion)).toFixed(4))
      stage.style.setProperty('--reveal-progress', progress.toFixed(5))
      stage.style.setProperty('--annotation-opacity', annotationsOpacity.toFixed(4))
      stage.style.setProperty('--annotation-blur', `${annotationBlur.toFixed(2)}px`)
      stage.style.setProperty('--reveal-final-opacity', finalOpacity.toFixed(4))
      stage.style.setProperty('--reveal-copy-shift', `${((1 - finalOpacity) * 18).toFixed(2)}px`)
    }

    const render = () => {
      if (!reducedMotion) {
        const current = currentRef.current
        const target = targetRef.current
        const next = Math.abs(target - current) < 0.00008
          ? target
          : current + ((target - current) * 0.085)
        currentRef.current = next
        renderState(next)
      }
      animationFrame = window.requestAnimationFrame(render)
    }

    const updateMotionPreference = (event) => {
      reducedMotion = event.matches
      section.classList.toggle('is-reduced', reducedMotion)
      if (!reducedMotion) {
        targetRef.current = getProgress()
        currentRef.current = targetRef.current
        renderState(currentRef.current)
      }
    }

    section.classList.toggle('is-reduced', reducedMotion)
    window.addEventListener('scroll', updateTarget, { passive: true })
    window.addEventListener('resize', updateTarget)
    motionQuery.addEventListener('change', updateMotionPreference)
    updateTarget()
    renderState(targetRef.current)
    animationFrame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('scroll', updateTarget)
      window.removeEventListener('resize', updateTarget)
      motionQuery.removeEventListener('change', updateMotionPreference)
    }
  }, [])

  return (
    <section ref={sectionRef} className="orion-reveal-scroll" id="orion" aria-label="ORION portrait reveal">
      <div ref={stageRef} className="orion-reveal-stage">
        <div className="reveal-editorial" aria-hidden="true">
          <h2>ORION</h2>
          <p className="reveal-note note-top-left"><span>Portrait / 01</span>Presence in motion</p>
          <p className="reveal-note note-top-right"><span>Classic form</span>Modern attitude</p>
          <p className="reveal-note note-bottom-left"><span>Past</span>Meets present</p>
          <p className="reveal-note note-bottom-right"><span>2026</span>Between eras</p>
        </div>

        <figure ref={frameRef} className="orion-reveal-frame">
          <img
            src="/media/orion-seen.png"
            alt="A classical figure in modern clothing standing in an ornate marble arcade"
          />
          <span className="reveal-shade" aria-hidden="true" />
        </figure>

        <div className="reveal-final-copy">
          <p>ORION / The new classic</p>
          <h2>{language === 'th' ? 'ศิลปะแห่ง' : 'The art of'}<br />{language === 'th' ? 'การเป็นที่มองเห็น' : 'being seen.'}</h2>
          <div>
            <p>
              Classical roots, recut for the present. ORION turns enduring form into a
              modern language of confidence, contrast and self-expression.
            </p>
            <a href="#lookbook">Explore the Collection <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className="reveal-scroll-mark" aria-hidden="true"><span>Expand</span><i /></div>
      </div>
    </section>
  )
}

function App({ initialSlug }) {
  const { language } = useLanguage()
  useCursorParallax()

  return (
    <main>
      <AudioControl />
      <ScrollFilm />

      <section className="collection-intro" id="collection">
        <div className="collection-heading">
          <p className="section-label">ORION — Collection 01</p>
          <h2>{language === 'th' ? 'อดีตพบ' : 'Past meets'}<br />{language === 'th' ? 'ปัจจุบัน' : 'present.'}</h2>
        </div>
        <div className="collection-copy" id="story">
          <p className="lead">{language === 'th' ? 'บทศึกษาของความต่าง—รูปทรงคลาสสิกกับสัญชาตญาณร่วมสมัย' : 'A study in contrast—classical form, modern instinct.'}</p>
          <p>
            {language === 'th' ? 'ORION นำความถาวรของประติมากรรมเข้าสู่การเคลื่อนไหวในชีวิตประจำวัน ซิลูเอตเรียบคมพบรายละเอียดที่คิดมาอย่างประณีตในเสื้อผ้าที่ออกแบบอยู่ระหว่างสองยุคสมัย' : 'ORION brings the permanence of sculpture into the movement of everyday life. Clean silhouettes meet considered detail in a wardrobe designed between eras.'}
          </p>
          <a href="#top">Return to the film <span aria-hidden="true">↑</span></a>
        </div>
      </section>

      <CollectionCards />

      <OrionReveal />

      <section className="philosophy-heading" id="philosophy">
        <p>03 / Our design code</p>
        <h2>{language === 'th' ? 'ปรัชญา' : 'The Philosophy'}</h2>
        <span>{language === 'th' ? 'รูปทรงที่จดจำ สไตล์ที่ก้าวไปข้างหน้า' : 'Form that remembers. Style that moves forward.'}</span>
      </section>

      <section className="design-code" aria-label="ORION design principles">
        <article><span>01</span><h3>{language === 'th' ? 'รูปทรง' : 'Form'}</h3><p>{language === 'th' ? 'สัดส่วนคลาสสิกที่แปลใหม่สำหรับปัจจุบัน' : 'Classical proportion, translated for now.'}</p></article>
        <article><span>02</span><h3>{language === 'th' ? 'วัสดุ' : 'Material'}</h3><p>{language === 'th' ? 'พื้นผิวและน้ำหนักที่มีตัวตนอย่างสุขุม' : 'Texture and weight with a quiet presence.'}</p></article>
        <article><span>03</span><h3>{language === 'th' ? 'ทัศนคติ' : 'Attitude'}</h3><p>{language === 'th' ? 'ประณีตพอจะยืนยาว อิสระพอจะเคลื่อนไหว' : 'Refined enough to endure. Free enough to move.'}</p></article>
      </section>

      <ProductCollection initialSlug={initialSlug} />

      <footer className="site-footer">
        <span>ORION</span>
        <span>Classic roots. Modern attitude.</span>
        <LegalPages />
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </main>
  )
}

export default App
