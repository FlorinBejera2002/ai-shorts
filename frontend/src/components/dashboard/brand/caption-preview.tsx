import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadCaptionFont, retainCaptionFont } from './caption-fonts'
import { previewCaptionLines } from './caption-preview-layout'
import { captionEffects, type CaptionStyle } from './caption-style'
import { clampPreviewCenter } from './preview-gesture'
import { usePreviewGesture } from './use-preview-gesture'

type Props = {
  style: CaptionStyle
  onPositionChange?: (position: CaptionStyle['position']) => void
  onTransformChange?: (position: CaptionStyle['position'], size: number) => void
  ratio?: '9:16' | '1:1' | '16:9'
  children?: React.ReactNode
}
export function CaptionPreview({
  style,
  onPositionChange,
  onTransformChange,
  ratio = '9:16',
  children
}: Props) {
  const t = useTranslations('brand')
  const frame = useRef<HTMLDivElement>(null),
    caption = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 }),
    [size, setSize] = useState({ w: 240, h: 427 })
  const fontKey = `${style.font_id}:${style.weight}`
  const [fontState, setFontState] = useState({
    key: '',
    family: '',
    error: false
  })
  const font = fontState.key === fontKey ? fontState.family : ''
  const fontError = fontState.key === fontKey && fontState.error
  const [tick, setTick] = useState(0)
  const gestures = usePreviewGesture({
    value: { ...style.position, size: style.size },
    frame: { width: size.w, height: size.h },
    min: 0.025,
    max: 0.12,
    onChange: onTransformChange
      ? (next) => {
          const factor = next.size / style.size
          onTransformChange(
            {
              x: clampPreviewCenter(next.x, (box.w * factor) / size.w, 0.01),
              y: clampPreviewCenter(next.y, (box.h * factor) / size.h, 0.01),
              anchor: 'center'
            },
            next.size
          )
        }
      : onPositionChange
        ? (next) => move(next.x, next.y)
        : undefined
  })
  useEffect(() => {
    let active = true
    const release = retainCaptionFont(style.font_id, style.weight)
    void loadCaptionFont(style.font_id, style.weight)
      .then((family) => {
        if (active) setFontState({ key: fontKey, family, error: false })
      })
      .catch(() => {
        if (active) setFontState({ key: fontKey, family: '', error: true })
      })
    return () => {
      active = false
      release()
    }
  }, [style.font_id, style.weight, fontKey])
  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setSize({ w: node.clientWidth, h: node.clientHeight })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => (t + 1) % 1000), 50)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const node = caption.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setBox({ w: node.offsetWidth, h: node.offsetHeight })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [font])
  const safeX = Math.max(
    box.w / size.w / 2 + 0.01,
    Math.min(1 - box.w / size.w / 2 - 0.01, style.position.x)
  )
  const safeY = Math.max(
    box.h / size.h / 2 + 0.01,
    Math.min(1 - box.h / size.h / 2 - 0.01, style.position.y)
  )
  const shortEdge = Math.min(size.w, size.h)
  const fontSize =
    shortEdge *
    style.size *
    (style.preset === 'headline' ? 1.45 : style.preset === 'stacked' ? 1.08 : 1)
  const words = t('captionSample').split(' ')
  // Demonstration word cues are fixed preview content, not generated speech timing.
  // Exports receive only the source's aligned word cues from the worker.
  const time = (tick * 0.05) % (words.length * 0.5 + 0.3),
    index = Math.min(words.length - 1, Math.floor(time / 0.5))
  const canvas = document.createElement('canvas'),
    measure = canvas.getContext('2d')
  const letterSpacing = (style.letter_spacing ?? 0) * fontSize
  const wordSpacing = (style.word_spacing ?? 0) * fontSize
  if (measure) {
    measure.font = `${style.weight} ${fontSize}px "${font}"`
    measure.fontKerning = 'none'
  }
  const measureText = (text: string) =>
    (measure?.measureText(text).width ?? text.length * fontSize * 0.6) +
    Array.from(text).length * letterSpacing +
    (text.match(/ /g)?.length ?? 0) * wordSpacing
  const chunks = previewCaptionLines(
    words,
    measureText,
    size.w * style.max_width,
    style.max_lines
  )
  let lines =
    chunks.find((chunk) =>
      chunk.some((line) => line.some((word) => word.index === index))
    ) ??
    chunks[0] ??
    []
  if (
    style.preset === 'stacked' &&
    style.max_lines > 1 &&
    lines.length === 1 &&
    lines[0]!.length > 1
  ) {
    const split = Math.ceil(lines[0]!.length / 2)
    lines = [lines[0]!.slice(0, split), lines[0]!.slice(split)]
  }
  const firstIndex = lines[0]?.[0]?.index ?? 0,
    phraseTime = Math.max(0, time - firstIndex * 0.5),
    phraseEnd = ((lines.at(-1)?.at(-1)?.index ?? index) + 1) * 0.5
  if (style.preset === 'word-by-word')
    lines = [
      [
        {
          text: words[index]!,
          index,
          width: measureText(words[index]!)
        }
      ]
    ]
  const gap = measureText(' ')
  const blockWidth = Math.max(
    1,
    ...lines.map(
      (line) =>
        line.reduce((width, word) => width + word.width, 0) +
        Math.max(0, line.length - 1) * gap
    )
  )
  const pad = Math.max(2, fontSize * 0.14)
  const layoutScale = Math.min(
    1,
    Math.min(size.w * style.max_width, size.w - 2 * pad) / blockWidth,
    (size.h - 2 * pad) / (fontSize * style.line_spacing * lines.length)
  )
  const effects = captionEffects(style, shortEdge, fontSize)
  const outline = effects.outline
  const shadow =
    style.preset === 'minimal' ? 0 : (style.shadow * shortEdge) / 720
  function move(x: number, y: number, snap = true) {
    const node = caption.current,
      halfW = (node?.offsetWidth ?? 0) / size.w / 2,
      halfH = (node?.offsetHeight ?? 0) / size.h / 2
    const clamp = (v: number, half: number) =>
      Math.max(half + 0.01, Math.min(1 - half - 0.01, v))
    onPositionChange?.({
      x: clamp(snap && Math.abs(x - 0.5) < 0.015 ? 0.5 : x, halfW),
      y: clamp(snap && Math.abs(y - 0.5) < 0.015 ? 0.5 : y, halfH),
      anchor: 'center'
    })
  }
  const opacity = effects.backgroundOpacity
  const background = `${style.background_color}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0')}`
  return (
    <div
      ref={frame}
      className="relative mx-auto w-full overflow-hidden rounded-md bg-neutral-900"
      style={{
        aspectRatio: ratio.replace(':', '/'),
        maxWidth: ratio === '9:16' ? 300 : 540
      }}
    >
      <div
        className="pointer-events-none absolute inset-[6%] border border-dashed border-white/20"
        aria-hidden="true"
      />
      {onPositionChange && (
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/10"
          aria-hidden="true"
        />
      )}
      {fontError ? (
        <p
          className="absolute inset-x-3 top-1/3 text-center text-xs text-white"
          role="alert"
        >
          {t('fontLoadError')}
        </p>
      ) : !font ? (
        <p
          className="absolute inset-x-3 top-1/3 text-center text-xs text-white"
          role="status"
        >
          {t('fontLoading')}
        </p>
      ) : (
        <div
          ref={caption}
          role={onPositionChange ? 'button' : undefined}
          tabIndex={onPositionChange ? 0 : undefined}
          aria-label={onPositionChange ? t('dragCaption') : undefined}
          {...gestures}
          onKeyDown={(e) => {
            if (onTransformChange && ['+', '=', '-'].includes(e.key)) {
              e.preventDefault()
              onTransformChange(
                style.position,
                Math.max(
                  0.025,
                  Math.min(0.12, style.size + (e.key === '-' ? -0.005 : 0.005))
                )
              )
              return
            }
            const d = e.shiftKey ? 0.05 : 0.01
            if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                e.key
              )
            ) {
              e.preventDefault()
              move(
                style.position.x +
                  (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0),
                style.position.y +
                  (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0),
                false
              )
            }
          }}
          className={`absolute rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white ${onPositionChange ? 'touch-none cursor-move outline-dashed outline-1 outline-white/60' : ''}`}
          style={{
            left: `${safeX * 100}%`,
            top: `${safeY * 100}%`,
            transform: 'translate(-50%,-50%)',
            fontFamily: font,
            fontKerning: 'none',
            fontWeight: style.weight,
            fontSize: fontSize * layoutScale,
            lineHeight: style.line_spacing,
            letterSpacing: letterSpacing * layoutScale,
            wordSpacing: wordSpacing * layoutScale,
            textAlign: style.align,
            color: style.text_color,
            textShadow: shadow
              ? `${shadow}px ${shadow}px ${shadow}px ${style.outline_color}`
              : undefined,
            WebkitTextStroke: `${outline}px ${style.outline_color}`,
            paintOrder: 'stroke fill',
            opacity:
              effects.animation === 'subtle-fade'
                ? Math.max(
                    0,
                    Math.min(1, phraseTime / 0.14, (phraseEnd - time) / 0.14)
                  )
                : 1,
            scale:
              effects.animation === 'phrase-pop'
                ? String(0.88 + 0.12 * Math.min(1, phraseTime / 0.12))
                : undefined
          }}
        >
          {lines.map((line, lineIndex) => (
            <div key={lineIndex} style={{ whiteSpace: 'nowrap' }}>
              <span
                style={{
                  backgroundColor: background,
                  paddingInline: pad
                }}
              >
                {line.map((word, i) => {
                  const progress =
                    Math.max(0, Math.min(1, (time - word.index * 0.5) / 0.5)) *
                    100
                  const karaoke =
                    effects.activeWord && style.preset === 'karaoke'
                  const activeBackground =
                    effects.activeWord &&
                    style.preset === 'active-background' &&
                    word.index === index
                  const wordAnimation =
                    effects.animation === 'word-pop' ||
                    effects.animation === 'word-fade'
                  const reveal = Math.max(
                    0,
                    Math.min(1, (time - word.index * 0.5) / 0.14)
                  )
                  return (
                    <span key={word.index}>
                      <span
                        style={{
                          display: wordAnimation ? 'inline-block' : undefined,
                          opacity: wordAnimation ? reveal : undefined,
                          transform:
                            effects.animation === 'word-pop'
                              ? `scale(${0.8 + 0.2 * reveal})`
                              : effects.animation === 'word-fade'
                                ? `translateY(${(1 - reveal) * 15}%)`
                                : undefined,
                          backgroundColor: activeBackground
                            ? style.highlight_color
                            : undefined,
                          borderRadius: activeBackground ? '.12em' : undefined,
                          paddingInline: activeBackground ? '.14em' : undefined,
                          marginInline: activeBackground ? '-.14em' : undefined,
                          boxDecorationBreak: activeBackground
                            ? 'clone'
                            : undefined,
                          WebkitBoxDecorationBreak: activeBackground
                            ? 'clone'
                            : undefined,
                          color:
                            effects.activeWord &&
                            style.preset !== 'active-background' &&
                            !karaoke &&
                            word.index === index
                              ? style.highlight_color
                              : karaoke
                                ? 'transparent'
                                : undefined,
                          backgroundImage: karaoke
                            ? `linear-gradient(to right,${style.highlight_color} ${progress}%,${style.text_color} ${progress}%)`
                            : undefined,
                          textShadow: karaoke ? 'none' : undefined,
                          WebkitTextStroke: karaoke
                            ? '0 transparent'
                            : undefined,
                          backgroundClip: karaoke ? 'text' : undefined,
                          WebkitBackgroundClip: karaoke ? 'text' : undefined
                        }}
                      >
                        {word.text}
                      </span>
                      {i < line.length - 1 ? ' ' : ''}
                    </span>
                  )
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
