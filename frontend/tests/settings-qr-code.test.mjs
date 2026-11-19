import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/settings/qr-code.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const { encodeQr } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const digest = (qr) => createHash('sha256').update(qr.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')).join('\n')).digest('hex')
const setupUri =
  'otpauth://totp/Sneepcut%3Aana%40example.invalid?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Sneepcut&algorithm=SHA1&digits=6&period=30'

test('picks the smallest version that fits the text', () => {
  assert.equal(encodeQr('hi', 'M').version, 1)
  assert.equal(encodeQr('hi', 'M').size, 21)
  assert.equal(encodeQr(setupUri, 'Q').version, 10)
  assert.throws(() => encodeQr('x'.repeat(3000), 'H'), RangeError)
})

test('draws finder patterns and the dark module', () => {
  const { modules, size } = encodeQr(setupUri, 'Q')
  for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let i = 0; i < 7; i++) {
      assert.equal(modules[y][x + i], true, 'top edge')
      assert.equal(modules[y + 6][x + i], true, 'bottom edge')
      assert.equal(modules[y + i][x], true, 'left edge')
      assert.equal(modules[y + i][x + 6], true, 'right edge')
    }
    assert.equal(modules[y + 1][x + 1], false, 'light ring')
    assert.equal(modules[y + 3][x + 3], true, 'centre')
  }
  assert.equal(modules[size - 8][8], true, 'dark module')
})

// Matrices cross-checked module by module against an independent QR implementation
// (every level and mask for versions 1–13) when the encoder was written.
test('matches verified reference matrices', () => {
  assert.equal(digest(encodeQr(setupUri, 'Q')), 'd290cf4cdc33ac8723ab63e60e5a371bba32941261d2237ed2861cc92408e6bf')
  assert.equal(digest(encodeQr('x'.repeat(300), 'M')), 'a6c4c99a50e77d18b6ddfdcbd85fffbd3b4da81e4eabc96b030a3f559d2b7fbb')
})
