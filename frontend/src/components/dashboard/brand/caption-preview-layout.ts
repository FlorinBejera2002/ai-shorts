export type PreviewWord = { text: string; index: number; width: number }
export function previewCaptionLines(
  words: string[],
  measure: (text: string) => number,
  maxWidth: number,
  maxLines: number
) {
  const chunks: PreviewWord[][][] = []
  let lines: PreviewWord[][] = [],
    line: PreviewWord[] = [],
    width = 0
  const space = measure(' ')
  for (const [index, text] of words.entries()) {
    const wordWidth = measure(text)
    if (line.length && width + space + wordWidth > maxWidth) {
      lines.push(line)
      line = []
      width = 0
      if (lines.length >= maxLines) {
        chunks.push(lines)
        lines = []
      }
    }
    line.push({ text, index, width: wordWidth })
    width += (line.length > 1 ? space : 0) + wordWidth
  }
  if (line.length) lines.push(line)
  if (lines.length) chunks.push(lines)
  return chunks
}

/**
 * Scale that keeps the caption block inside the frame (never above 1). A frame measured at 0×0
 * (not laid out yet) would divide 0 by 0, so the natural size is kept until it has one.
 */
export function previewLayoutScale({ frame, maxWidth, pad, blockWidth, lineHeight, lineCount }: {
  frame: { w: number; h: number }
  maxWidth: number
  pad: number
  blockWidth: number
  lineHeight: number
  lineCount: number
}) {
  const fit = Math.min(
    1,
    Math.min(frame.w * maxWidth, frame.w - 2 * pad) / blockWidth,
    (frame.h - 2 * pad) / (lineHeight * lineCount)
  )
  return Number.isFinite(fit) && fit > 0 ? fit : 1
}

/**
 * The lines shown while word `index` is active: the chunk that contains it, halved for "stacked"
 * and a single word for "word-by-word"; first/last word indices time the phrase animations.
 */
export function previewCaptionBlock({ words, index, measure, maxWidth, maxLines, preset }: {
  words: string[]
  index: number
  measure: (text: string) => number
  maxWidth: number
  maxLines: number
  preset: string
}) {
  const chunks = previewCaptionLines(words, measure, maxWidth, maxLines)
  let lines = chunks.find((chunk) => chunk.some((line) => line.some((word) => word.index === index))) ?? chunks[0] ?? []
  if (preset === 'stacked' && maxLines > 1 && lines.length === 1 && lines[0]!.length > 1) {
    const split = Math.ceil(lines[0]!.length / 2)
    lines = [lines[0]!.slice(0, split), lines[0]!.slice(split)]
  }
  const firstIndex = lines[0]?.[0]?.index ?? 0
  const lastIndex = lines.at(-1)?.at(-1)?.index ?? index
  if (preset === 'word-by-word') lines = [[{ text: words[index]!, index, width: measure(words[index]!) }]]
  const gap = measure(' ')
  const blockWidth = Math.max(
    1,
    ...lines.map((line) => line.reduce((width, word) => width + word.width, 0) + Math.max(0, line.length - 1) * gap)
  )
  return { lines, firstIndex, lastIndex, blockWidth }
}

/** Keyboard on the caption: +/- resize, arrows move (Shift moves further). */
export function captionKeyAction(key: string, shift: boolean): { resize: number } | { dx: number; dy: number } | null {
  if (key === '+' || key === '=') return { resize: 0.005 }
  if (key === '-') return { resize: -0.005 }
  const step = shift ? 0.05 : 0.01
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = moves[key]
  return move ? { dx: move[0], dy: move[1] } : null
}

/** Caption size limits (fraction of the frame's short edge). */
export const CAPTION_SIZE_RANGE = { min: 0.02, max: 0.16 }

/** Keeps a caption centre at least 1% inside the frame given half its extent. */
export function clampCaptionCenter(value: number, half: number) {
  return Math.max(half + 0.01, Math.min(1 - half - 0.01, value))
}

/** Width of `text` in the caption font, including letter and word spacing. */
export function createTextMeasure({ font, weight, fontSize, letterSpacing, wordSpacing }: {
  font: string
  weight: number
  fontSize: number
  letterSpacing: number
  wordSpacing: number
}) {
  const context = document.createElement('canvas').getContext('2d')
  if (context) {
    context.font = `${weight} ${fontSize}px "${font}"`
    context.fontKerning = 'none'
  }
  return (text: string) =>
    (context?.measureText(text).width ?? text.length * fontSize * 0.6) +
    Array.from(text).length * letterSpacing +
    (text.match(/ /g)?.length ?? 0) * wordSpacing
}
