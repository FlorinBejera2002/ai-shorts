import type { CSSProperties } from 'react'
import type { captionEffects, CaptionStyle } from './caption-style'

type Effects = ReturnType<typeof captionEffects>

/** Inline style of the caption block: position, type, outline/shadow and the phrase animations. */
export function captionBlockStyle({
  style,
  effects,
  x,
  y,
  font,
  fontSize,
  scale,
  letterSpacing,
  wordSpacing,
  shadow,
  phraseTime,
  phraseRemaining
}: {
  style: CaptionStyle
  effects: Effects
  x: number
  y: number
  font: string
  fontSize: number
  scale: number
  letterSpacing: number
  wordSpacing: number
  shadow: number
  phraseTime: number
  phraseRemaining: number
}): CSSProperties {
  const fade = Math.max(0, Math.min(1, phraseTime / 0.14, phraseRemaining / 0.14))
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: 'translate(-50%,-50%)',
    fontFamily: font,
    fontKerning: 'none',
    fontWeight: style.weight,
    fontSize: fontSize * scale,
    lineHeight: style.line_spacing,
    letterSpacing: letterSpacing * scale,
    wordSpacing: wordSpacing * scale,
    textAlign: style.align,
    color: style.text_color,
    textShadow: shadow ? `${shadow}px ${shadow}px ${shadow}px ${style.outline_color}` : undefined,
    WebkitTextStroke: `${effects.outline}px ${style.outline_color}`,
    paintOrder: 'stroke fill',
    opacity: effects.animation === 'subtle-fade' ? fade : 1,
    scale: effects.animation === 'phrase-pop' ? String(0.88 + 0.12 * Math.min(1, phraseTime / 0.12)) : undefined
  }
}

/** Per-word reveal (word pop / fade). */
function wordAnimationStyle(animation: Effects['animation'], reveal: number): CSSProperties {
  if (animation === 'word-pop') return { display: 'inline-block', opacity: reveal, transform: `scale(${0.8 + 0.2 * reveal})` }
  if (animation === 'word-fade') return { display: 'inline-block', opacity: reveal, transform: `translateY(${(1 - reveal) * 15}%)` }
  return {}
}

/** Active-word highlight: karaoke fill, highlighted background or highlight colour. */
function activeWordStyle(style: CaptionStyle, progress: number, active: boolean): CSSProperties {
  if (style.preset === 'karaoke')
    return {
      color: 'transparent',
      backgroundImage: `linear-gradient(to right,${style.highlight_color} ${progress}%,${style.text_color} ${progress}%)`,
      textShadow: 'none',
      WebkitTextStroke: '0 transparent',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text'
    }
  if (!active) return {}
  if (style.preset === 'active-background')
    return {
      backgroundColor: style.highlight_color,
      borderRadius: '.12em',
      paddingInline: '.14em',
      marginInline: '-.14em',
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone'
    }
  return { color: style.highlight_color }
}

/** Inline style of one sample word at `time` (seconds; each word lasts 0.5 s). */
export function captionWordStyle({
  style,
  effects,
  wordIndex,
  activeIndex,
  time
}: {
  style: CaptionStyle
  effects: Effects
  wordIndex: number
  activeIndex: number
  time: number
}): CSSProperties {
  const elapsed = time - wordIndex * 0.5
  const reveal = Math.max(0, Math.min(1, elapsed / 0.14))
  const progress = Math.max(0, Math.min(1, elapsed / 0.5)) * 100
  return {
    ...wordAnimationStyle(effects.animation, reveal),
    ...(effects.activeWord ? activeWordStyle(style, progress, wordIndex === activeIndex) : {})
  }
}
