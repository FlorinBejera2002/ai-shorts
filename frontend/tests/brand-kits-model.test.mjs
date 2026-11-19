import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/dashboard/brand/kits/kit-model.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const model = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('kits without an image show neutral initials', () => {
  assert.equal(model.kitInitials('Ana Creator'), 'AC')
  assert.equal(model.kitInitials('podcast'), 'PO')
  assert.equal(model.kitInitials('  Rețete  de  vară '), 'RD')
  assert.equal(model.kitInitials(''), '?')
})

test('caption font ids read as font names on kit cards', () => {
  assert.equal(model.captionFontName('builtin:montserrat'), 'Montserrat')
  assert.equal(model.captionFontName('builtin:dm-sans'), 'DM Sans')
  assert.equal(model.captionFontName('00000000-0000-4000-8000-000000000812'), null, 'Custom fonts have no built-in name')
  assert.equal(model.captionFontName(undefined), null)
})

test('a duplicate gets the first free "(n)" name, ignoring case', () => {
  assert.equal(model.copyName('Podcast', ['Podcast']), 'Podcast (2)')
  assert.equal(model.copyName('Podcast', ['Podcast', 'podcast (2)']), 'Podcast (3)')
  assert.equal(model.copyName('Podcast (2)', ['Podcast', 'Podcast (2)']), 'Podcast (3)', 'Copies of copies keep one suffix')
})

test('the default kit comes first and links open its editor', () => {
  const kits = [{ id: 'b', isDefault: false }, { id: 'a', isDefault: true }, { id: 'c', isDefault: false }]
  assert.deepEqual(model.orderKits(kits).map((kit) => kit.id), ['a', 'b', 'c'])
  assert.equal(model.kitHref('00000000-0000-4000-8000-000000004101'), '/dashboard/brand/00000000-0000-4000-8000-000000004101')
})
