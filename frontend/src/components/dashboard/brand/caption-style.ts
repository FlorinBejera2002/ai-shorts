export type CaptionStyle = {
  version: 1
  preset: string
  font_id: string
  weight: number
  size: number
  text_color: string
  outline_color: string
  outline: number
  outline_enabled?: boolean
  shadow: number
  background_color: string
  background_opacity: number
  background_enabled?: boolean
  highlight_color: string
  active_word_enabled?: boolean
  animation?: 'none' | 'phrase-pop' | 'subtle-fade' | 'word-pop' | 'word-fade'
  align: 'left' | 'center' | 'right'
  max_width: number
  max_lines: number
  line_spacing: number
  letter_spacing?: number
  word_spacing?: number
  position: { x: number; y: number; anchor: 'center' }
}
/** Missing switches preserve the appearance of previously saved presets. */
export function captionEffects(
  style: CaptionStyle,
  shortEdge: number,
  fontSize: number
) {
  return {
    outline:
      style.outline_enabled === false ||
      (style.preset === 'minimal' && style.outline_enabled !== true)
        ? 0
        : Math.max(
            ((style.outline_enabled === true && style.outline === 0
              ? 2
              : style.outline) *
              shortEdge) /
              720,
            style.preset === 'bold-outline' ? fontSize * 0.075 : 0
          ),
    backgroundOpacity:
      style.background_enabled === false
        ? 0
        : Math.max(
            style.background_opacity,
            style.preset === 'contrast-box' ||
              (style.background_enabled && !style.background_opacity)
              ? 0.82
              : 0
          ),
    activeWord:
      style.active_word_enabled ??
      ['active-color', 'active-background', 'karaoke'].includes(style.preset),
    animation:
      style.animation ??
      (style.preset === 'phrase-pop' || style.preset === 'subtle-fade'
        ? style.preset
        : 'none')
  }
}
export const CAPTION_PRESETS = [
  'classic',
  'minimal',
  'bold-outline',
  'contrast-box',
  'headline',
  'word-by-word',
  'karaoke',
  'active-color',
  'active-background',
  'phrase-pop',
  'subtle-fade',
  'stacked'
] as const
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  version: 1,
  preset: 'classic',
  font_id: 'builtin:inter',
  weight: 700,
  size: 0.05,
  text_color: '#FFFFFF',
  outline_color: '#000000',
  outline: 2,
  shadow: 0,
  background_color: '#000000',
  background_opacity: 0,
  highlight_color: '#FFE066',
  align: 'center',
  max_width: 0.88,
  max_lines: 2,
  line_spacing: 1.15,
  letter_spacing: 0,
  word_spacing: 0,
  position: { x: 0.5, y: 0.84, anchor: 'center' }
}
export function legacyCaptionStyle(kit: {
  subtitleFont: string
  subtitleColor: string
  subtitleBgColor: string
  subtitleBgOpacity: number
  subtitlePosition: string
  captionStyle?: CaptionStyle | null
}): CaptionStyle {
  if (kit.captionStyle) return kit.captionStyle
  const family = kit.subtitleFont
    .replace(/ Bold$/, '')
    .toLowerCase()
    .replaceAll(' ', '-')
  return {
    ...DEFAULT_CAPTION_STYLE,
    font_id: `builtin:${family}`,
    weight: /Bold$/.test(kit.subtitleFont) ? 700 : 400,
    text_color: kit.subtitleColor,
    background_color: kit.subtitleBgColor,
    background_opacity: kit.subtitleBgOpacity,
    position: {
      x: 0.5,
      y:
        kit.subtitlePosition === 'top'
          ? 0.16
          : kit.subtitlePosition === 'center'
            ? 0.5
            : 0.84,
      anchor: 'center'
    }
  }
}
export type CaptionFont = {
  id: string
  family: string
  style?: string
  category: string
  weights: number[]
  romanian: boolean
  archived?: boolean
}
