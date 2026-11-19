'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type CSSProperties } from 'react'
import { loadCaptionFont, retainCaptionFont } from '../caption-fonts'
import { captionEffects, legacyCaptionStyle, type CaptionStyle } from '../caption-style'
import { kitInitials, type BrandKitSummary } from './kit-model'
import styles from './kits.module.css'

/** Round kit mark: its image, or neutral initials (no per-kit colours). */
export function KitAvatar({ kit, size }: { kit: Pick<BrandKitSummary, 'name' | 'imageUrl'>; size: number }) {
  return (
    <span aria-hidden="true" className={styles.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {kit.imageUrl ? <img src={kit.imageUrl} alt="" /> : kitInitials(kit.name)}
    </span>
  )
}

function rgba(hex: string, alpha: number) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!value) return `rgba(0,0,0,${alpha})`
  const n = Number.parseInt(value, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Two sample words drawn with the kit's caption style; the second shows the active-word look. */
function KitCaption({ style, width }: { style: CaptionStyle; width: number }) {
  const t = useTranslations('brandKits')
  const [family, setFamily] = useState('')
  useEffect(() => {
    let cancelled = false
    const release = retainCaptionFont(style.font_id, style.weight)
    void loadCaptionFont(style.font_id, style.weight)
      .then((loaded) => !cancelled && setFamily(loaded))
      .catch(() => undefined)
    return () => {
      cancelled = true
      release()
    }
  }, [style.font_id, style.weight])
  const fontSize = Math.max(11, width * style.size * 0.9)
  const effects = captionEffects(style, width, fontSize)
  // The last word shows the active-word look.
  const sample = t('sampleCaption')
  const cut = sample.lastIndexOf(' ')
  const first = sample.slice(0, cut)
  const second = sample.slice(cut + 1)
  const text: CSSProperties = {
    color: style.text_color,
    WebkitTextStroke: effects.outline ? `${effects.outline}px ${style.outline_color}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: style.shadow ? `0 ${Math.round(fontSize * 0.08)}px ${Math.round(fontSize * 0.2)}px rgba(0,0,0,.55)` : undefined
  }
  return (
    <span
      className={styles.thumbCaption}
      style={{
        top: `${Math.min(0.86, style.position.y) * 100}%`,
        fontFamily: family ? `"${family}", Inter, sans-serif` : 'Inter, sans-serif',
        fontWeight: style.weight,
        fontSize
      }}
      data-kit-caption=""
    >
      <span
        style={{
          ...text,
          padding: effects.backgroundOpacity ? '2px 8px' : undefined,
          borderRadius: 6,
          background: effects.backgroundOpacity ? rgba(style.background_color, effects.backgroundOpacity) : undefined
        }}
      >
        {first}{' '}
        <span style={effects.activeWord ? { color: style.highlight_color } : undefined}>{second}</span>
      </span>
    </span>
  )
}

/** Card thumbnail: a sample frame with the kit's own subtitles, "Activ" on the default kit. */
export function KitThumb({ kit, poster, height, width }: { kit: BrandKitSummary; poster: string | null; height: number; width: number }) {
  const t = useTranslations('brandKits')
  return (
    <div className={styles.thumb} style={{ height }} data-kit-thumb="">
      {poster && <img src={poster} alt="" loading="lazy" />}
      <KitCaption style={legacyCaptionStyle(kit)} width={width} />
      {kit.isDefault && (
        <span className={styles.active}>
          <Check aria-hidden="true" strokeWidth={3} />
          {t('active')}
        </span>
      )}
    </div>
  )
}
