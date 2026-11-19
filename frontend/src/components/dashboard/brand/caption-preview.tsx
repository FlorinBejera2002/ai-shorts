import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { clampCaptionCenter, createTextMeasure, previewCaptionBlock, previewLayoutScale, type PreviewWord } from './caption-preview-layout'
import { captionBlockStyle, captionWordStyle } from './caption-preview-style'
import { captionEffects, type CaptionStyle } from './caption-style'
import { useCaptionGestures } from './use-caption-gestures'
import { useCaptionBox, useCaptionFont, useDemoTick, useFrameSize } from './use-caption-preview'

type Props = {
  style: CaptionStyle
  onPositionChange?: (position: CaptionStyle['position']) => void
  onTransformChange?: (position: CaptionStyle['position'], size: number) => void
  ratio?: '9:16' | '1:1' | '16:9'
  children?: React.ReactNode
  underlay?: React.ReactNode
  overlay?: React.ReactNode
  className?: string
  safeGuides?: boolean
  showSelection?: boolean
  playbackTime?: number
  playing?: boolean
  fitWidth?: boolean
}

/** Headline and stacked styles render larger than the base size. */
const PRESET_SCALE: Record<string, number> = { headline: 1.45, stacked: 1.08 }
const RATIO_MAX_WIDTH: Record<string, number> = { '9:16': 300, '1:1': 540, '16:9': 540 }

/** "Loading font…" or the font error, in place of the caption. */
function CaptionStatus({ error }: { error: boolean }) {
  const t = useTranslations('brand')
  return (
    <p className="absolute inset-x-3 top-1/3 text-center text-xs text-white" role={error ? 'alert' : 'status'}>
      {t(error ? 'fontLoadError' : 'fontLoading')}
    </p>
  )
}

/** Inset frame and (for movable captions) the centre line. */
function SafeGuides({ center }: { center: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-[6%] border border-dashed border-white/20" aria-hidden="true" data-brand-preview-guides="" />
      {center && <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/10" aria-hidden="true" />}
    </>
  )
}

/** The caption lines with each word styled for the moment `time`. */
function CaptionLines({ lines, background, pad, wordStyle }: {
  lines: PreviewWord[][]
  background: string
  pad: number
  wordStyle: (wordIndex: number) => React.CSSProperties
}) {
  return lines.map((line, lineIndex) => (
    <div key={lineIndex} style={{ whiteSpace: 'nowrap' }}>
      <span style={{ backgroundColor: background, paddingInline: pad }}>
        {line.map((word, position) => (
          <span key={word.index}>
            <span style={wordStyle(word.index)}>{word.text}</span>
            {position < line.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </div>
  ))
}

/** The sample caption over a preview frame: live style, drag/pinch/keyboard to move and resize. */
export function CaptionPreview({
  style,
  onPositionChange,
  onTransformChange,
  ratio = '9:16',
  children,
  underlay,
  overlay,
  className = '',
  safeGuides = true,
  showSelection = true,
  playbackTime,
  playing = true,
  fitWidth = false
}: Props) {
  const t = useTranslations('brand')
  const frame = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLDivElement>(null)
  const size = useFrameSize(frame)
  const { font, fontError } = useCaptionFont(style.font_id, style.weight)
  const box = useCaptionBox(caption, font)
  const tick = useDemoTick(playbackTime, playing)
  const handlers = useCaptionGestures({ style, frame: size, box, caption, onPositionChange, onTransformChange })
  const movable = Boolean(onPositionChange)

  const shortEdge = Math.min(size.w, size.h)
  const fontSize = shortEdge * style.size * (PRESET_SCALE[style.preset] ?? 1)
  const words = t('captionSample').split(' ')
  // Demonstration word cues are fixed preview content, not generated speech timing.
  // Exports receive only the source's aligned word cues from the worker.
  const time = (playbackTime ?? tick * 0.05) % (words.length * 0.5 + 0.3)
  const index = Math.min(words.length - 1, Math.floor(time / 0.5))
  const letterSpacing = (style.letter_spacing ?? 0) * fontSize
  const wordSpacing = (style.word_spacing ?? 0) * fontSize
  const measure = createTextMeasure({ font, weight: style.weight, fontSize, letterSpacing, wordSpacing })
  const block = previewCaptionBlock({ words, index, measure, maxWidth: size.w * style.max_width, maxLines: style.max_lines, preset: style.preset })
  const pad = Math.max(2, fontSize * 0.14)
  const effects = captionEffects(style, shortEdge, fontSize)
  const background = `${style.background_color}${Math.round(effects.backgroundOpacity * 255).toString(16).padStart(2, '0')}`
  const scale = previewLayoutScale({ frame: size, maxWidth: style.max_width, pad, blockWidth: block.blockWidth, lineHeight: fontSize * style.line_spacing, lineCount: block.lines.length })
  const blockStyle = captionBlockStyle({
    style,
    effects,
    x: clampCaptionCenter(style.position.x, box.w / size.w / 2),
    y: clampCaptionCenter(style.position.y, box.h / size.h / 2),
    font,
    fontSize,
    scale,
    letterSpacing,
    wordSpacing,
    shadow: style.preset === 'minimal' ? 0 : (style.shadow * shortEdge) / 720,
    phraseTime: Math.max(0, time - block.firstIndex * 0.5),
    phraseRemaining: (block.lastIndex + 1) * 0.5 - time
  })
  const interactive = movable ? { role: 'button', tabIndex: 0, 'aria-label': t('dragCaption') } : {}
  const outline = movable && showSelection ? 'outline-dashed outline-1 outline-white/60' : ''
  const cursor = movable ? 'touch-none cursor-move' : ''

  return (
    <div
      ref={frame}
      className={`relative mx-auto w-full overflow-hidden rounded-md bg-neutral-900 ${className}`}
      data-brand-preview-stage=""
      style={{ aspectRatio: ratio.replace(':', '/'), maxWidth: fitWidth ? undefined : RATIO_MAX_WIDTH[ratio] }}
    >
      {underlay}
      {safeGuides && <SafeGuides center={movable} />}
      {font ? (
        <div
          ref={caption}
          data-brand-caption=""
          {...interactive}
          {...handlers}
          className={`absolute rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white ${cursor} ${outline}`}
          style={blockStyle}
        >
          <CaptionLines
            lines={block.lines}
            background={background}
            pad={pad}
            wordStyle={(wordIndex) => captionWordStyle({ style, effects, wordIndex, activeIndex: index, time })}
          />
        </div>
      ) : (
        <CaptionStatus error={fontError} />
      )}
      {children}
      {overlay}
    </div>
  )
}
