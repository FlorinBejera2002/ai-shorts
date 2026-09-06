import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const hero = readFileSync(
  new URL('../src/components/landing/hero-content.tsx', import.meta.url),
  'utf8'
)
const reveals = readFileSync(
  new URL('../src/components/landing/animated-hero.tsx', import.meta.url),
  'utf8'
)

test('server-rendered landing copy is never hidden behind hydration', () => {
  assert.doesNotMatch(hero, /initial:[^\n]*opacity:\s*0/)
  assert.doesNotMatch(reveals, /initial=\{[^\n]*opacity:\s*0/)
  assert.doesNotMatch(reveals, /hidden:[^\n]*opacity:\s*0/)
  assert.match(hero, /initial:[^\n]*opacity:\s*1/)
  assert.match(reveals, /hidden:[^\n]*opacity:\s*1/)
})

test('mobile navigation uses a controlled accessible Sheet with a no-JS fallback', () => {
  const navbar = readFileSync(
    new URL('../src/components/landing/public-navbar.tsx', import.meta.url),
    'utf8'
  )
  assert.match(navbar, /<Sheet open=\{open\} onOpenChange=\{setOpen\}/)
  assert.match(navbar, /<SheetTrigger/)
  assert.match(navbar, /<SheetTitle/)
  assert.match(navbar, /<noscript>/)
  assert.match(navbar, /Close menu/)
  assert.doesNotMatch(navbar, /aria-haspopup="menu"/)
})
