import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []

async function openThemePage(context) {
  console.log(`Opening theme controls at ${origin}/privacy`)
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(`${origin}/privacy`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByRole('button', { name: 'Theme: System', exact: true }).waitFor()
  console.log('Theme controls rendered')
  return page
}

async function expectTheme(page, selection, resolved) {
  await page.waitForFunction(({ selection, resolved }) => {
    const button = document.querySelector(`button[aria-label="Theme: ${selection}"]`)
    return button?.getAttribute('aria-pressed') === 'true'
      && document.documentElement.classList.contains(resolved)
      && document.documentElement.style.colorScheme === resolved
  }, { selection, resolved })
}

async function verifyStoredThemes() {
  const context = await browser.newContext({ colorScheme: 'dark' })
  // Public-page verification never needs the API or a real signed-in account.
  await context.route('**/api/**', route => route.fulfill({ json: {} }))
  await context.route('**/v1/**', route => route.fulfill({ status: 401, json: {} }))
  const page = await openThemePage(context)
  await expectTheme(page, 'System', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expectTheme(page, 'System', 'light')
  console.log('System theme changes passed')

  await page.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
  await expectTheme(page, 'Dark', 'dark')
  assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await expectTheme(page, 'Dark', 'dark')
  console.log('Stored theme reload passed')

  const secondPage = await openThemePage(context)
  await expectTheme(secondPage, 'Dark', 'dark')
  await secondPage.getByRole('button', { name: 'Theme: Light', exact: true }).click()
  await expectTheme(page, 'Light', 'light')
  await expectTheme(secondPage, 'Light', 'light')
  await secondPage.evaluate(() => localStorage.removeItem('theme'))
  await expectTheme(page, 'System', 'light')

  await secondPage.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
  await expectTheme(page, 'Dark', 'dark')
  await secondPage.evaluate(() => localStorage.clear())
  await expectTheme(page, 'System', 'light')
  assert.equal(await page.locator('#root script').count(), 0)
  console.log('Cross-tab changes and storage clearing passed')
}

try {
  if (process.env.VERIFY_THEME_FAST_REFRESH_ONLY !== '1') await verifyStoredThemes()
  const privateContext = await browser.newContext({ colorScheme: 'light' })
  await privateContext.route('**/api/**', route => route.fulfill({ json: {} }))
  await privateContext.route('**/v1/**', route => route.fulfill({ status: 401, json: {} }))
  await privateContext.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage disabled for this fixture', 'SecurityError') }
    })
  })
  const privatePage = await openThemePage(privateContext)
  await expectTheme(privatePage, 'System', 'light')
  await privatePage.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
  await expectTheme(privatePage, 'Dark', 'dark')
  console.log('Themes work with local storage denied')
  await privatePage.emulateMedia({ colorScheme: 'dark' })
  await privatePage.emulateMedia({ colorScheme: 'light' })
  await expectTheme(privatePage, 'Dark', 'dark')

  if (process.env.VERIFY_THEME_FAST_REFRESH === '1') {
    const providerPath = new URL('../src/components/shared/theme-provider.tsx', import.meta.url)
    const original = await readFile(providerPath, 'utf8')
    const anchor = '      {children}'
    assert.ok(original.includes(anchor), 'Fast Refresh probe has a known insertion point')
    const probe = `${anchor}\n      <span hidden data-theme-refresh-probe="updated" />`
    const changed = original.replace(anchor, probe)
    await privatePage.bringToFront()
    await privatePage.evaluate(() => {
      window.themeRefreshRoot = document.querySelector('#root').firstElementChild
    })
    try {
      await writeFile(providerPath, changed)
      console.log('Waiting for provider Fast Refresh')
      await privatePage.locator('[data-theme-refresh-probe="updated"]').waitFor({ state: 'attached' })
      await expectTheme(privatePage, 'Dark', 'dark')
      assert.equal(await privatePage.evaluate(() =>
        document.querySelector('#root').firstElementChild === window.themeRefreshRoot
      ), true, 'Fast Refresh preserves the page DOM and in-memory theme')
      console.log('Fast Refresh preserves theme state and DOM identity')
    } finally {
      const current = await readFile(providerPath, 'utf8')
      // Remove only our probe so concurrent edits are preserved.
      if (current.includes(probe)) await writeFile(providerPath, current.replace(probe, anchor))
    }
  }

  assert.deepEqual(errors, [], 'No React script warnings or browser errors')
  console.log('Theme browser checks passed with no script warnings or browser errors.')
} catch (error) {
  console.error('Theme browser check failed:', error)
  throw error
} finally {
  await browser.close()
}
