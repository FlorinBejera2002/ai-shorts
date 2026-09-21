import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
test('new shared interaction controls use Radix primitives', () => {
  for (const component of ['tabs','switch','slider','dialog','accordion','choice-group','progress']) {
    assert.match(read(`src/components/ui/${component}.tsx`), /from ['"]radix-ui['"]/, component)
  }
})

test('editor shortcuts leave dialogs and focused controls in charge of the keyboard', () => {
  const shortcuts = read('src/components/editor/use-editor-shortcuts.ts')
  assert.match(shortcuts,/e\.defaultPrevented/)
  assert.match(shortcuts,/\[role="dialog"\]/)
  assert.match(shortcuts,/closest\('button, a/)
})

test('Home preserves its original cinematic design without shadcn controls', () => {
  const landing = read('src/app/[locale]/home-page-view.tsx')
  assert.doesNotMatch(landing,/['"]use client['"]|opacity-0|initial=\{/)
  assert.match(landing,/<StudioHero/)
  assert.match(landing,/<HeroContent/)
  assert.match(landing,/<HomeNavbar/)
  assert.match(landing,/<footer/)
  assert.match(landing,/bg-\[#080808\]/)
  assert.doesNotMatch(landing,/components\/ui\/|PublicFooter|PublicNavbar/)
  const navbar = read('src/components/landing/home-navbar.tsx')
  assert.match(navbar,/<details/)
  assert.match(navbar,/fixed inset-x-0 top-0/)
  assert.doesNotMatch(navbar,/components\/ui\/|ThemeToggle/)
  assert.doesNotMatch(read('src/components/landing/home-language-switcher.tsx'),/components\/ui\//)
})

test('password rules follow both themes', () => {
  for (const page of ['register','reset-password']) {
    const source=read(`src/app/[locale]/${page}/page.tsx`)
    assert.doesNotMatch(source,/text-white\/30/)
    assert.match(source,/text-muted-foreground/)
  }
})
