/**
 * Minimal QR Code encoder (ISO/IEC 18004, byte mode) for the two-factor setup URI.
 * Returns the module matrix; rendering is left to the caller.
 */

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

const FORMAT_BITS: Record<QrErrorLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

// Index 0 is unused so the arrays can be read by version number (1-40).
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorLevel, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
}

const ERROR_CORRECTION_BLOCKS: Record<QrErrorLevel, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
}

function bit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0
}

function rawDataModules(version: number) {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2
    result -= (25 * alignments - 10) * alignments - 55
    if (version >= 7) result -= 36
  }
  return result
}

function dataCodewords(version: number, level: QrErrorLevel) {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[level][version]! * ERROR_CORRECTION_BLOCKS[level][version]!
  )
}

function multiply(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function reedSolomonDivisor(degree: number) {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = multiply(result[j]!, root)
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!
    }
    root = multiply(root, 0x02)
  }
  return result
}

function reedSolomonRemainder(data: number[], divisor: number[]) {
  const result = divisor.map(() => 0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    divisor.forEach((coefficient, index) => {
      result[index]! ^= multiply(coefficient, factor)
    })
  }
  return result
}

function encodeData(bytes: Uint8Array, version: number, level: QrErrorLevel) {
  const capacity = dataCodewords(version, level) * 8
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  bytes.forEach((byte) => push(byte, 8))
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8)
    codewords.push(bits.slice(i, i + 8).reduce((value, current) => (value << 1) | current, 0))
  return codewords
}

function addErrorCorrection(data: number[], version: number, level: QrErrorLevel) {
  const blockCount = ERROR_CORRECTION_BLOCKS[level][version]!
  const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version]!
  const rawCodewords = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blockCount - (rawCodewords % blockCount)
  const shortLength = Math.floor(rawCodewords / blockCount)
  const divisor = reedSolomonDivisor(eccLength)
  const blocks: number[][] = []
  for (let i = 0, offset = 0; i < blockCount; i++) {
    const block = data.slice(offset, offset + shortLength - eccLength + (i < shortBlocks ? 0 : 1))
    offset += block.length
    const ecc = reedSolomonRemainder(block, divisor)
    if (i < shortBlocks) block.push(0)
    blocks.push(block.concat(ecc))
  }
  const result: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((block, index) => {
      if (i !== shortLength - eccLength || index >= shortBlocks) result.push(block[i]!)
    })
  return result
}

class QrMatrix {
  readonly size: number
  readonly modules: boolean[][]
  private readonly reserved: boolean[][]

  constructor(readonly version: number, private readonly level: QrErrorLevel) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.drawFunctionPatterns()
  }

  private set(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark
    this.reserved[y]![x] = true
  }

  private alignmentPositions() {
    if (this.version === 1) return []
    const count = Math.floor(this.version / 7) + 2
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (count * 2 - 2)) * 2
    const result = [6]
    for (let position = this.size - 7; result.length < count; position -= step) result.splice(1, 0, position)
    return result
  }

  private drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0)
      this.set(i, 6, i % 2 === 0)
    }
    for (const [x, y] of [[3, 3], [this.size - 4, 3], [3, this.size - 4]] as const) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy))
          const column = x + dx
          const row = y + dy
          if (column >= 0 && column < this.size && row >= 0 && row < this.size)
            this.set(column, row, distance !== 2 && distance !== 4)
        }
    }
    const positions = this.alignmentPositions()
    const last = positions.length - 1
    positions.forEach((x, i) =>
      positions.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      })
    )
    this.drawFormat(0)
    this.drawVersion()
  }

  drawFormat(mask: number) {
    const data = (FORMAT_BITS[this.level] << 3) | mask
    let remainder = data
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = ((data << 10) | remainder) ^ 0x5412
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i))
    this.set(8, 7, bit(bits, 6))
    this.set(8, 8, bit(bits, 7))
    this.set(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i))
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(bits, i))
    this.set(8, this.size - 8, true)
  }

  private drawVersion() {
    if (this.version < 7) return
    let remainder = this.version
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = (this.version << 12) | remainder
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.set(a, b, bit(bits, i))
      this.set(b, a, bit(bits, i))
    }
  }

  drawCodewords(codewords: number[]) {
    let index = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vertical = 0; vertical < this.size; vertical++)
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vertical : vertical
          if (!this.reserved[y]![x] && index < codewords.length * 8) {
            this.modules[y]![x] = bit(codewords[index >>> 3]!, 7 - (index & 7))
            index++
          }
        }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        if (this.reserved[y]![x]) continue
        const invert = [
          (x + y) % 2 === 0,
          y % 2 === 0,
          x % 3 === 0,
          (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
          ((x * y) % 2) + ((x * y) % 3) === 0,
          (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
          (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        ][mask]
        if (invert) this.modules[y]![x] = !this.modules[y]![x]
      }
  }

  /** Spec penalty (N1-N4); only used to pick the most readable mask. */
  penalty() {
    const size = this.size
    const at = (x: number, y: number, transposed: boolean) => (transposed ? this.modules[x]![y]! : this.modules[y]![x]!)
    let score = 0
    for (const transposed of [false, true])
      for (let y = 0; y < size; y++) {
        let run = 1
        let line = ''
        for (let x = 0; x < size; x++) {
          line += at(x, y, transposed) ? '1' : '0'
          if (x > 0 && at(x, y, transposed) === at(x - 1, y, transposed)) run++
          else {
            if (run >= 5) score += run - 2
            run = 1
          }
        }
        if (run >= 5) score += run - 2
        const padded = `0000${line}0000`
        for (const pattern of ['10111010000', '00001011101'])
          for (let start = padded.indexOf(pattern); start !== -1; start = padded.indexOf(pattern, start + 1)) score += 40
      }
    let dark = 0
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (this.modules[y]![x]) dark++
        if (x < size - 1 && y < size - 1) {
          const color = this.modules[y]![x]
          if (color === this.modules[y]![x + 1] && color === this.modules[y + 1]![x] && color === this.modules[y + 1]![x + 1]) score += 3
        }
      }
    const total = size * size
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
    return score
  }
}

export type QrCode = { size: number; version: number; modules: boolean[][] }

/** Encodes `text` as UTF-8 in byte mode at the smallest version that fits. */
export function encodeQr(text: string, level: QrErrorLevel = 'M', forcedMask?: number): QrCode {
  const bytes = new TextEncoder().encode(text)
  let version = 1
  for (; version <= 40; version++) {
    const header = 4 + (version < 10 ? 8 : 16)
    if (header + bytes.length * 8 <= dataCodewords(version, level) * 8) break
  }
  if (version > 40) throw new RangeError('Text too long for a QR code')
  const codewords = addErrorCorrection(encodeData(bytes, version, level), version, level)
  const build = (mask: number) => {
    const matrix = new QrMatrix(version, level)
    matrix.drawCodewords(codewords)
    matrix.applyMask(mask)
    matrix.drawFormat(mask)
    return matrix
  }
  let best = build(forcedMask ?? 0)
  if (forcedMask === undefined) {
    let bestScore = best.penalty()
    for (let mask = 1; mask < 8; mask++) {
      const candidate = build(mask)
      const score = candidate.penalty()
      if (score < bestScore) {
        best = candidate
        bestScore = score
      }
    }
  }
  return { size: best.size, version, modules: best.modules }
}
