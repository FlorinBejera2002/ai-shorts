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
