import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
test('original redesign pages have separate tickets and browser routes', () => {
  const root = fileURLToPath(new URL('../src/app/[locale]', import.meta.url))
  const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(join(dir,entry.name)) : entry.name==='page.tsx' ? [join(dir,entry.name)] : [])
  // These pages were added after the original redesign and have their own coverage.
  const laterPages = new Set(['activate/page.tsx', 'data-deletion/page.tsx'])
  const redesignPages = walk(root).filter(path => !laterPages.has(relative(root, path).replaceAll('\\', '/')))
  assert.equal(redesignPages.length,23)
  const tickets = JSON.parse(read('redesign-tickets.json'))
  assert.equal(Object.keys(tickets).length,25)
  assert.equal(new Set(Object.values(tickets).map(ticket=>ticket.id)).size,25)
  const suite = read('scripts/all-pages-browser-checks.mjs')
  for (const key of Object.keys(tickets).filter(key=>!['foundation','navigation'].includes(key))) {
    assert.ok(suite.includes(`['${key}',`), `Missing browser route for ${key}`)
  }
})

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
