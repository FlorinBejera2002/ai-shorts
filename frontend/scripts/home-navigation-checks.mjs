import assert from 'node:assert/strict'

export async function checkHomeNavigation(browser) {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    try {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
      const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true })
      const menu = nav.locator('details')
      await menu.locator('summary').focus()
      await page.keyboard.press('Enter')
      assert.equal(await menu.getAttribute('open'), '')
      await page.screenshot({ path: `test-results/all-pages/home-mobile-${javaScriptEnabled ? 'js' : 'no-js'}.png`, fullPage: true })
      if (javaScriptEnabled) {
        await menu.getByRole('button', { name: 'English language', exact: true }).click()
        await menu.getByRole('menuitemradio', { name: 'RO', exact: true }).click()
        await page.waitForURL(url => url.pathname === '/ro')
        await page.waitForFunction(() => document.documentElement.lang === 'ro-RO')
        assert.ok((await page.locator('h1').innerText()).length > 0)
      } else {
        await menu.getByRole('link', { name: 'Pricing', exact: true }).click()
        await page.waitForURL(url => url.pathname === '/pricing')
        assert.ok((await page.locator('h1').innerText()).length > 0)
      }
      console.log(`Original Home: mobile keyboard menu ${javaScriptEnabled ? 'and Romanian locale switch' : 'and pricing navigation without JavaScript'} passed`)
    } finally { await context.close() }
  }
}
