import assert from 'node:assert/strict'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately. A stateful fake of /api/brand-kits backs every read and mutation, so
// creating, copying, renaming, switching the default and deleting kits all round-trip.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/brand-kits/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  unexpected = [],
  reports = []
const identity = { id: '00000000-0000-4000-8000-000000004001', email: 'brand-kits@example.invalid', name: 'Ana Pop', profile_pic: null, credits: 360, plan: 'pro', access_role: 'member' }
const KIT = { ana: '00000000-0000-4000-8000-000000004101', podcast: '00000000-0000-4000-8000-000000004102', recipes: '00000000-0000-4000-8000-000000004103' }
const imageUrl = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#3f4645"/><circle cx="32" cy="26" r="12" fill="#e8b796"/></svg>').toString('base64')}`
const poster = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#5b6a68"/><circle cx="180" cy="230" r="80" fill="#c9b18f"/></svg>').toString('base64')}`

function kit(id, name, extra = {}) {
  return {
    id, name, isDefault: false, imagePath: null, imageUrl: null, logoUrl: null, logoPath: null,
    primaryColor: '#000000', secondaryColor: '#FFFFFF', fontFamily: 'Inter', applyBrandColors: false, applyBrandFont: false,
    subtitleFont: 'Inter Bold', subtitleColor: '#FFFFFF', subtitleBgColor: '#000000', subtitleBgOpacity: 0, subtitlePosition: 'bottom',
    watermarkEnabled: true, watermarkSize: 0.18, watermarkMargin: 0.025, watermarkX: null, watermarkY: null,
    watermarkPosition: 'bottom-right', watermarkOpacity: 0.8, hidePlatformBadge: false, captionStyle: null,
    updatedAt: '2026-11-10T09:00:00Z',
    ...extra
  }
}
function initialKits() {
  return [
    kit(KIT.ana, 'Ana Creator', { isDefault: true, imageUrl, imagePath: `brand/${identity.id}/ana.png`, logoUrl: imageUrl }),
    kit(KIT.podcast, 'Podcast'),
    kit(KIT.recipes, 'Recipes')
  ]
}

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
    timezoneId: 'Europe/Bucharest'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) runtimeErrors.push(message.text())
  })
  let kits = options.empty ? [] : initialKits()
  const calls = []
  let failList = Boolean(options.failList),
    nextId = 4900
  const json = (route, body, status = 200) => route.fulfill({ status, json: body })
  const access = { plan: 'pro', canWhiteLabel: false }
  await context.route('**/v1/**', (route) =>
    new URL(route.request().url()).pathname === '/v1/auth/refresh'
      ? json(route, { access_token: 'synthetic-brand-kits', user: identity })
      : (unexpected.push(route.request().url()), json(route, {}, 405))
  )
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      method = request.method(),
      path = new URL(request.url()).pathname,
      multipart = (request.headers()['content-type'] || '').includes('multipart'),
      body = !multipart && request.postData() ? JSON.parse(request.postData()) : null
    if (method !== 'GET') calls.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`)
    const taken = (name, except) => kits.some((item) => item.id !== except && item.name.toLowerCase() === name.trim().toLowerCase())
    let match
    if (path === '/api/brand-kits' && method === 'GET') {
      if (failList) return json(route, { error: 'Synthetic failure' }, 503)
      return json(route, { kits, ...access })
    }
    if (path === '/api/brand-kits' && method === 'POST') {
      if (taken(body.name)) return json(route, { error: 'A brand kit with this name already exists' }, 409)
      const from = kits.find((item) => item.id === body.fromKitId)
      const created = { ...(from ? structuredClone(from) : kit('', '')), id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`, name: body.name, isDefault: kits.length === 0, imagePath: body.imagePath, imageUrl: body.imagePath ? imageUrl : null }
      kits.push(created)
      return json(route, { brandKit: created, ...access }, 201)
    }
    if ((match = path.match(/^\/api\/brand-kits\/([0-9a-f-]{36})$/))) {
      const target = kits.find((item) => item.id === match[1])
      if (!target) return json(route, { error: 'Brand kit not found' }, 404)
      if (method === 'GET') return json(route, { brandKit: target, ...access })
      if (method === 'PUT') {
        Object.assign(target, body)
        return json(route, { brandKit: target, ...access })
      }
      if (method === 'PATCH') {
        if (body.name !== undefined) {
          if (taken(body.name, target.id)) return json(route, { error: 'A brand kit with this name already exists' }, 409)
          target.name = body.name
        }
        if (body.imagePath !== undefined) Object.assign(target, { imagePath: body.imagePath, imageUrl: body.imagePath ? imageUrl : null })
        if (body.isDefault) for (const item of kits) item.isDefault = item === target
        return json(route, { brandKit: target, ...access })
      }
      if (method === 'DELETE') {
        kits = kits.filter((item) => item !== target)
        if (target.isDefault && kits.length) kits[0].isDefault = true
        return route.fulfill({ status: 204, body: '' })
      }
    }
    if (path === '/api/brand/logo' && method === 'POST') return json(route, { logo_path: `brand/${identity.id}/logo-new-kit.png` }, 201)
    if (path === '/api/user/brand/logo' && method === 'POST') {
      const target = kits.find((item) => item.id === new URL(request.url()).searchParams.get('kit'))
      if (!target) return json(route, { error: 'Brand kit not found' }, 404)
      target.logoUrl = imageUrl
      return json(route, { brandKit: target })
    }
    if (path === '/api/jobs' && method === 'POST') return json(route, { id: '00000000-0000-4000-8000-000000004999', status: 'pending' }, 201)
    if (method !== 'GET') {
      unexpected.push(`${method} ${path}`)
      return json(route, {}, 405)
    }
    const responses = {
      '/api/clips/library': { clips: [{ id: 'c1', title: 'Sample', thumbnailUrl: poster, fileUrl: `${origin}/__brand-kits__/clip.mp4`, previewUrl: null }], total: 1 },
      '/api/user/brand/fonts': { fonts: [] },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/user/settings': { preferences: { locale: 'en', theme: 'system', timezone: 'UTC' }, sessions: [], mfa: { enabled: false }, securityEvents: [], exports: [] },
      '/api/stripe/billing': { account: { credits: 360, plan: 'pro', hasBillingProfile: true }, subscription: null, invoices: [], providerAvailable: true },
      '/api/user/profile': { profile: { ...identity, image: null, provider: 'credentials', createdAt: '2026-10-01T09:00:00Z' } }
    }
    return json(route, responses[path] || {})
  })
  return {
    page,
    calls,
    get kits() {
      return kits
    },
    fail: (value) => (failList = value),
    async open(path = '/dashboard/brand') {
      await page.goto(`${origin}${options.ro ? '/ro' : ''}${path}`, { waitUntil: 'networkidle' })
    },
    close: () => context.close()
  }
}

const cards = (f) => f.page.locator('[data-kit-card]')
async function names(f) {
  return cards(f).evaluateAll((items) => items.map((item) => item.querySelector('b')?.textContent))
}
async function until(check, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(message)
}
async function capture(f, name) {
  assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) })
  reports.push(name)
}
async function menu(f, name, mobile = false) {
  await f.page.getByRole('button', { name: `${name} kit options` }).first().click()
  const list = mobile ? f.page.getByRole('dialog').getByRole('menu') : f.page.getByRole('menu')
  await list.waitFor()
  return list
}

// ---------------------------------------------------------------- Kiturile mele
async function list() {
  const f = await fixture()
  try {
    await f.open()
    await cards(f).first().waitFor()
    assert.match(await f.page.locator('[data-brand-kits]').innerText(), /My kits\s+3 kits/)
    assert.deepEqual(await names(f), ['Ana Creator', 'Podcast', 'Recipes'], 'Default kit first')
    const first = cards(f).first()
    assert.equal(await first.getAttribute('aria-label'), 'Ana Creator kit, active')
    assert.match(await first.innerText(), /Active[\s\S]*Ana Creator\s*Default[\s\S]*Inter · Logo/)
    assert.match(await cards(f).nth(1).innerText(), /Podcast[\s\S]*Inter · No logo/)
    assert.equal(await first.getByRole('link', { name: 'Open the Ana Creator kit' }).getAttribute('href'), `/dashboard/brand/${KIT.ana}`)
    assert.equal(await f.page.locator('[data-kit-caption]').count(), 3, 'Each card previews its subtitles')
    await capture(f, 'desktop-light-kits')

    // Menu: the default kit has no "Set as default".
    let items = await menu(f, 'Ana Creator')
    assert.deepEqual(await items.getByRole('menuitem').allInnerTexts(), ['Rename', 'Change image', 'Duplicate', 'Delete kit'])
    await capture(f, 'desktop-light-kit-menu')
    await f.page.keyboard.press('Escape')
    items = await menu(f, 'Podcast')
    assert.deepEqual(await items.getByRole('menuitem').allInnerTexts(), ['Rename', 'Change image', 'Duplicate', 'Set as default', 'Delete kit'])

    // Set as default moves the badges and the order.
    await items.getByRole('menuitem', { name: 'Set as default' }).click()
    await until(async () => (await names(f))[0] === 'Podcast', 'Podcast becomes the first, default kit')
    assert.equal(await cards(f).first().getAttribute('aria-label'), 'Podcast kit, active')
    assert.ok(f.calls.includes(`PATCH /api/brand-kits/${KIT.podcast} {"isDefault":true}`))

    // Rename, with a duplicate name refused.
    await (await menu(f, 'Recipes')).getByRole('menuitem', { name: 'Rename' }).click()
    let dialog = f.page.getByRole('dialog')
    assert.equal(await dialog.getByLabel('Kit name').inputValue(), 'Recipes')
    assert.equal(await dialog.getByRole('button', { name: 'Save' }).isDisabled(), true)
    await dialog.getByLabel('Kit name').fill('podcast')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.getByRole('alert').filter({ hasText: 'A kit with this name already exists.' }).waitFor()
    await dialog.getByLabel('Kit name').fill('Kitchen')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.waitFor({ state: 'detached' })
    await until(async () => (await names(f)).includes('Kitchen'), 'Renamed kit shows its new name')

    // Change image uploads into the brand folder, then attaches it.
    const chooser = f.page.waitForEvent('filechooser')
    await (await menu(f, 'Kitchen')).getByRole('menuitem', { name: 'Change image' }).click()
    await (await chooser).setFiles({ name: 'kit.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
    await until(() => f.calls.some((call) => call.startsWith(`PATCH /api/brand-kits/${KIT.recipes} {"imagePath"`)), 'Kit image saved')
    assert.ok(f.calls.includes('POST /api/brand/logo'))

    // Delete with the Ana/Radu illustration.
    await (await menu(f, 'Kitchen')).getByRole('menuitem', { name: 'Delete kit' }).click()
    const alert = f.page.getByRole('alertdialog')
    assert.equal(await alert.locator('img').getAttribute('src'), '/illustrations/delete.webp')
    assert.match(await alert.innerText(), /Delete the Kitchen kit\?[\s\S]*deleted permanently/)
    await capture(f, 'desktop-light-kit-delete')
    await alert.getByRole('button', { name: 'Delete kit' }).click()
    await alert.waitFor({ state: 'detached' })
    await until(async () => (await names(f)).length === 2, 'Deleted kit disappears')

    // Duplicate opens the copy's editor.
    await (await menu(f, 'Podcast')).getByRole('menuitem', { name: 'Duplicate' }).click()
    await f.page.waitForURL(/\/dashboard\/brand\/00000000-0000-4000-8000-0000000049/)
    assert.ok(f.calls.some((call) => call.startsWith(`POST /api/brand-kits {"name":"Podcast (2)","fromKitId":"${KIT.podcast}"`)))
    await f.page.locator('[data-kit-header]').filter({ hasText: 'Podcast (2)' }).waitFor()
    await f.page.getByRole('link', { name: 'My kits' }).click()
    await f.page.waitForURL((url) => url.pathname === '/dashboard/brand')

    // Kit nou: start from the default kit or from scratch.
    await f.page.locator('[data-kit-new]').click()
    dialog = f.page.getByRole('dialog')
    assert.equal(await dialog.getByRole('button', { name: 'Create kit' }).isDisabled(), true)
    assert.equal(await dialog.getByRole('radio', { name: /Podcast/ }).isChecked(), true, 'Starts from the default kit')
    await dialog.getByLabel('Kit name').fill('Interviews')
    await capture(f, 'desktop-light-kit-new')
    await dialog.getByText('From scratch').click()
    await dialog.getByRole('button', { name: 'Create kit' }).click()
    await f.page.waitForURL(/\/dashboard\/brand\/00000000-0000-4000-8000-0000000049/)
    assert.ok(f.calls.includes('POST /api/brand-kits {"name":"Interviews","fromKitId":null,"imagePath":null}'))
  } finally {
    await f.close()
  }
  console.log('Kits list: order, badges, captions, menu, set default, rename + 409, change image, delete, duplicate, Kit nou passed')
}

// ---------------------------------------------------------------- editor
async function editor() {
  const f = await fixture()
  try {
    await f.open(`/dashboard/brand/${KIT.podcast}`)
    const header = f.page.locator('[data-kit-header]')
    await header.filter({ hasText: 'Podcast' }).waitFor()
    assert.equal(await header.getByText('Default').count(), 0, 'Only the default kit is marked')
    await capture(f, 'desktop-light-editor')
    // Saving writes into this kit only.
    await f.page.locator('[data-brand-section-trigger="styles"]').first().click()
    await f.page.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
    const bar = f.page.locator('[data-brand-save-bar]')
    await bar.getByRole('button', { name: 'Save changes' }).click()
    await until(() => f.calls.some((call) => call.startsWith(`PUT /api/brand-kits/${KIT.podcast} `)), 'Save goes to this kit')
    assert.equal(f.calls.some((call) => call.startsWith('PUT /api/user/brand')), false)

    // Save as a new kit: copy, write the edits, make it default, then open it.
    await f.page.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
    await bar.getByRole('button', { name: 'More save options' }).click()
    const options = f.page.getByRole('menu')
    assert.deepEqual(await options.getByRole('menuitem').allInnerTexts(), ['Save to Podcast', 'Save as a new kit'])
    await options.getByRole('menuitem', { name: 'Save as a new kit' }).click()
    const dialog = f.page.getByRole('dialog')
    await dialog.getByLabel('Kit name').fill('Interviews')
    await dialog.getByRole('switch').click()
    await capture(f, 'desktop-light-save-as')
    await dialog.getByRole('button', { name: 'Save kit' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('created') === '1')
    const notice = f.page.locator('[data-kit-created]')
    await notice.filter({ hasText: 'The Interviews kit was created' }).waitFor()
    assert.match(await notice.innerText(), /4 kits/)
    assert.ok(f.calls.some((call) => call === `POST /api/brand-kits {"name":"Interviews","fromKitId":"${KIT.podcast}","imagePath":null}`))
    assert.ok(f.calls.some((call) => /^PATCH \/api\/brand-kits\/.+ \{"isDefault":true\}$/.test(call)))
    assert.equal(f.kits.find((item) => item.name === 'Interviews').isDefault, true)
    await capture(f, 'desktop-light-kit-created')
    await notice.getByRole('link', { name: 'See kits' }).click()
    await f.page.waitForURL((url) => url.pathname === '/dashboard/brand')
    await cards(f).first().waitFor()
    assert.equal((await names(f))[0], 'Interviews')

    // Logo uploads target the kit being edited.
    await f.open(`/dashboard/brand/${KIT.recipes}`)
    await f.page.locator('[data-brand-logo-file]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
    await until(() => f.calls.includes('POST /api/user/brand/logo'), 'Logo upload sent')
    assert.equal(f.kits.find((item) => item.id === KIT.recipes).logoUrl, imageUrl, 'Logo stored on the edited kit')

    // Deleting from the editor header returns to the list.
    await (await menu(f, 'Recipes')).getByRole('menuitem', { name: 'Delete kit' }).click()
    await f.page.getByRole('alertdialog').getByRole('button', { name: 'Delete kit' }).click()
    await f.page.waitForURL((url) => url.pathname === '/dashboard/brand')
  } finally {
    await f.close()
  }
  console.log('Editor: kit header, save into the kit, save as new kit (+default, notice, See kits), per-kit logo, delete from header passed')
}

// ---------------------------------------------------------------- states, phone, dark, Romanian
async function states() {
  for (const dark of [false, true]) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const mobile = viewport.width < 1024
      const prefix = `${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}`
      const f = await fixture({ dark, viewport })
      try {
        await f.open()
        await cards(f).first().waitFor()
        assert.equal(
          await f.page.locator('[data-kits-grid]').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
          mobile ? 2 : 4
        )
        await capture(f, `${prefix}-kits`)
        if (mobile) {
          const sheet = await menu(f, 'Podcast', true)
          assert.deepEqual(await sheet.getByRole('menuitem').allInnerTexts(), ['Rename', 'Change image', 'Duplicate', 'Set as default', 'Delete kit'])
          await capture(f, `${prefix}-kit-menu`)
          await sheet.getByRole('menuitem', { name: 'Rename' }).click()
          await f.page.getByRole('dialog').getByLabel('Kit name').waitFor()
          await capture(f, `${prefix}-kit-rename`)
        }
      } finally {
        await f.close()
      }
      for (const [state, options] of [['empty', { empty: true }], ['error', { failList: true }]]) {
        const g = await fixture({ dark, viewport, ...options })
        try {
          await g.open()
          await g.page.locator(`[data-kits-state="${state}"]`).waitFor()
          if (state === 'empty') {
            await g.page.getByRole('button', { name: 'New kit' }).first().click()
            const dialog = g.page.getByRole('dialog')
            assert.equal(await dialog.getByRole('radiogroup').count(), 0, 'Nothing to copy from yet')
            await g.page.keyboard.press('Escape')
          }
          if (state === 'error') {
            g.fail(false)
            await g.page.getByRole('button', { name: 'Try again' }).click()
            await cards(g).first().waitFor()
            await g.page.goto(`${origin}/dashboard/brand`, { waitUntil: 'networkidle' })
            g.fail(true)
            await g.page.reload({ waitUntil: 'networkidle' })
            await g.page.locator('[data-kits-state="error"]').waitFor()
          }
          await capture(g, `${prefix}-${state}`)
        } finally {
          await g.close()
        }
      }
    }
  }
  const r = await fixture({ ro: true })
  try {
    await r.open()
    await cards(r).first().waitFor()
    assert.match(await r.page.locator('[data-brand-kits]').innerText(), /Kiturile mele\s+3 kituri[\s\S]*Activ[\s\S]*Implicit/)
    await capture(r, 'desktop-romanian')
  } finally {
    await r.close()
  }
  console.log('States: 4/2 columns, phone menu sheet + rename sheet, empty (no copy source), error + retry, dark, Romanian passed')
}

// ---------------------------------------------------------------- Create flow
async function create() {
  const f = await fixture()
  try {
    await f.open('/dashboard/create?mode=youtube&url=https%3A%2F%2Fyoutu.be%2Fabcdefghijk')
    const trigger = f.page.getByRole('combobox', { name: 'Brand kit' })
    await trigger.click()
    const options = f.page.getByRole('option')

    assert.equal(await options.count(), 4, 'No branding plus every kit')
    await f.page.getByRole('option', { name: /Podcast/ }).click()
    const job = f.page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/jobs')
    await f.page.locator('.creation-generate-action').click()
    const body = JSON.parse((await job).postData())
    assert.equal(body.include_brand, true)
    assert.equal(body.brand_kit_id, KIT.podcast, 'The chosen kit is sent with the job')
  } finally {
    await f.close()
  }
  console.log('Create flow: every kit is offered and the chosen kit is sent as brand_kit_id passed')
}

try {
  await mkdir(output, { recursive: true })
  const group = process.env.BRAND_KITS_GROUP || 'all',
    runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('list')) await list()
  if (runs('editor')) await editor()
  if (runs('states')) await states()
  if (runs('create')) await create()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(unexpected, [])
  await writeFile(new URL('summary.json', output), JSON.stringify({ groups: group, screenshots: reports, available: (await readdir(output)).filter((name) => name.endsWith('.png')).sort(), fixtureOnly: true }, null, 2))
  console.log(`All synthetic Brand kit checks passed; ${reports.length} captures`)
} finally {
  await browser.close()
}
