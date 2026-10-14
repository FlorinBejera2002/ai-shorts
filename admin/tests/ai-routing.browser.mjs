import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRoutingFixture } from './ai-routing-fixture.mjs'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const adminDirectory = fileURLToPath(new URL('..', import.meta.url))
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://127.0.0.1:3212'
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Browser verification requires a loopback mock origin')
const fixture = createRoutingFixture()
const children = []
let browser

async function assertPortUnused(port) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve) => server.close(resolve))
}

function startServer(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: adminDirectory, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { output += data })
  children.push(child)
  return { child, output: () => output }
}

async function waitForServer(server, address) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.child.exitCode !== null) throw new Error(`Server exited: ${server.output()}`)
    try {
      await fetch(address, { signal: AbortSignal.timeout(2000) })
      return
    } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 250)) }
  }
  throw new Error(`Server did not start: ${server.output()}`, { cause: lastError })
}

async function openRouting(page) {
  await page.getByRole('button', { name: 'Modele AI', exact: true }).click()
  await page.getByRole('heading', { name: 'Un model potrivit pentru fiecare etapă', exact: true }).waitFor()
  await page.locator('.page-content[aria-busy="false"]').waitFor()
}

async function changeModel(page, stage, name) {
  await page.getByRole('combobox', { name: `Model: ${stage}`, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function assertShell(page) {
  assert.equal(await page.evaluate(() => document.querySelector('aside.sidebar') === window.routingShell.sidebar
    && document.querySelector('header.topbar') === window.routingShell.header
    && document.querySelector('.app-shell') === window.routingShell.root), true, 'Navigation preserves shared DOM identity')
}

try {
  if (!process.env.ADMIN_TEST_ORIGIN) {
    // These isolated fixtures use synthetic users and in-memory routing only.
    await assertPortUnused(8089)
    await assertPortUnused(3212)
    const api = startServer(['tests/mock-api.mjs'])
    await waitForServer(api, 'http://127.0.0.1:8089')
    const vite = startServer(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3212', '--strictPort'], { VITE_DEV_API_TARGET: 'http://127.0.0.1:8089' })
    await waitForServer(vite, origin)
  }
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(15000)
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.getByLabel('Email administrativ').fill('routing-browser@example.invalid')
  await page.getByLabel('Parolă', { exact: true }).fill('synthetic-fixture-password')
  await page.getByRole('button', { name: 'Intră în consolă' }).click()
  await page.getByRole('heading', { name: 'Platform overview', exact: true }).waitFor()
  await page.evaluate(() => { window.routingShell = { root: document.querySelector('.app-shell'), sidebar: document.querySelector('aside.sidebar'), header: document.querySelector('header.topbar') } })
  await openRouting(page)
  assert.equal(await page.getByRole('combobox').count(), fixture.routes.length * 2)
  await assertShell(page)
  assert.equal(await page.getByRole('button', { name: 'Modele AI', exact: true }).getAttribute('aria-current'), 'page')
  console.log(`AI routing loaded ${fixture.routes.length} independent stage controls`)

  for (const stage of ['Verificarea vorbirii', 'Verificarea video finală']) {
    await page.getByRole('combobox', { name: `Model: ${stage}`, exact: true }).click()
    assert.deepEqual((await page.getByRole('option').allTextContents()).sort(), ['Google Gemini Flash', 'Qwen Omni Flash'])
    await page.keyboard.press('Escape')
  }
  await page.getByRole('combobox', { name: 'Furnizor: Planificarea montajului', exact: true }).click()
  assert.equal(await page.getByRole('option', { name: 'Google Gemini · neconfigurat', exact: true }).getAttribute('aria-disabled'), 'true')
  await page.keyboard.press('Escape')
  console.log('Audio/video capability filtering and disabled unconfigured provider passed')

  for (const [stage, provider, models] of [
    ['Transcriere: clipuri', 'Whisper local', ['ggml-base.bin', 'ggml-large-v3-turbo.bin']],
    ['Transcriere: Story și narațiune', 'Whisper local', ['ggml-base.bin', 'ggml-large-v3-turbo.bin']],
    ['Detectarea vorbirii', 'Silero VAD', ['ggml-silero-vad.bin']],
    ['Urmărirea fețelor', 'Pigo', ['facefinder']],
    ['Studio: eliminarea fundalului', 'U2Net local', ['U2Net Human Seg (instalat)']]
  ]) {
    await page.getByRole('combobox', { name: `Furnizor: ${stage}`, exact: true }).click()
    assert.deepEqual(await page.getByRole('option').allTextContents(), [provider], 'Native stage only offers its compatible provider')
    await page.keyboard.press('Escape')
    await page.getByRole('combobox', { name: `Model: ${stage}`, exact: true }).click()
    assert.deepEqual((await page.getByRole('option').allTextContents()).sort(), models.sort())
    await page.keyboard.press('Escape')
  }
  console.log('Installed Whisper, voice detection, face tracking and background removal models stay in their native stages')

  const reason = page.getByLabel('Motivul modificării', { exact: true })
  const save = page.getByRole('button', { name: 'Salvează modelele', exact: true })
  await changeModel(page, 'Planificarea montajului', 'Anthropic Claude Sonnet')
  await changeModel(page, 'Transcriere: clipuri', 'ggml-large-v3-turbo.bin')
  assert.equal(await save.isEnabled(), false, 'Audit reason is required')
  await reason.fill('  Compare editorial planning on synthetic footage  ')
  let reads = 0
  page.on('request', (request) => { if (request.url().endsWith('/api/admin/ai-routing') && request.method() === 'GET') reads++ })
  const put = page.waitForRequest((request) => request.url().endsWith('/api/admin/ai-routing') && request.method() === 'PUT')
  await save.click()
  const input = (await put).postDataJSON()
  assert.equal(input.version, 0)
  assert.equal(input.reason, 'Compare editorial planning on synthetic footage')
  assert.equal(input.routes.story_planning.model, 'anthropic/claude-sonnet-5.5')
  assert.equal(input.routes.transcription.model, 'whisper_cpp:ggml-large-v3-turbo.bin:fixture-large')
  assert.equal(Object.keys(input.routes).length, fixture.routes.length)
  await page.getByText('Configurația a fost salvată și verificată.', { exact: true }).waitFor()
  assert.ok(reads >= 1, 'Save re-fetches server configuration')
  await page.getByText('Versiunea 1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Audit', exact: true }).click()
  await page.getByText('Compare editorial planning on synthetic footage', { exact: true }).waitFor()
  await assertShell(page)
  await openRouting(page)
  assert.match(await page.getByRole('combobox', { name: 'Model: Planificarea montajului', exact: true }).textContent(), /Anthropic Claude Sonnet/)
  assert.match(await page.getByRole('combobox', { name: 'Model: Transcriere: clipuri', exact: true }).textContent(), /ggml-large-v3-turbo.bin/)
  await page.getByText('Versiunea 1', { exact: true }).waitFor()
  await assertShell(page)
  console.log('Save, audit reason, refetch, persistence and shared navigation DOM passed')

  await page.route('**/api/admin/ai-routing', async (route) => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 409, json: { error: 'Synthetic concurrent change' } })
    else await route.continue()
  })
  await changeModel(page, 'Planificarea montajului', 'OpenAI GPT Luna')
  await reason.fill('Keep this draft after conflict')
  await save.click()
  await page.getByText('Configurația a fost modificată de alt administrator.', { exact: false }).waitFor()
  assert.equal(await reason.inputValue(), 'Keep this draft after conflict')
  assert.match(await page.getByRole('combobox', { name: 'Model: Planificarea montajului', exact: true }).textContent(), /OpenAI GPT Luna/)
  assert.equal(await save.isEnabled(), false)
  await page.unroute('**/api/admin/ai-routing')
  await page.getByRole('button', { name: 'Reîncarcă și înlocuiește selecțiile', exact: true }).click()
  await page.locator('.page-content[aria-busy="false"]').waitFor()
  assert.match(await page.getByRole('combobox', { name: 'Model: Planificarea montajului', exact: true }).textContent(), /Anthropic Claude Sonnet/)
  assert.equal(await reason.inputValue(), '')
  console.log('409 conflict preserves draft and explicit reload restores server version')

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.route('**/api/admin/ai-routing', (route) => route.fulfill({ json: { ...createRoutingFixture(), catalogUnavailable: true, models: [] } }))
  await openRouting(page)
  await page.getByText('Catalogul modelelor nu este disponibil.', { exact: false }).waitFor()
  assert.equal(await save.isEnabled(), false)
  for (const control of await page.getByRole('combobox').all()) assert.equal(await control.isEnabled(), false)
  await page.unroute('**/api/admin/ai-routing')
  await page.getByRole('button', { name: 'Reîncearcă încărcarea catalogului', exact: true }).click()
  await page.locator('.page-content[aria-busy="false"]').waitFor()
  await page.getByText('Versiunea 1', { exact: true }).waitFor()
  console.log('Unavailable catalogue blocks unsafe edits and retry recovers')

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.route('**/api/admin/ai-routing', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic configuration unavailable' } }))
  await openRouting(page)
  await page.getByText('Synthetic configuration unavailable', { exact: true }).waitFor()
  assert.equal(await page.getByRole('combobox').count(), 0)
  await assertShell(page)
  await page.unroute('**/api/admin/ai-routing')
  await page.getByRole('button', { name: 'Reîncearcă încărcarea', exact: true }).click()
  await page.locator('.page-content[aria-busy="false"]').waitFor()
  await page.getByText('Versiunea 1', { exact: true }).waitFor()
  console.log('Configuration read failure stays inside route content and retry recovers')

  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Mobile UI has no horizontal page overflow')
  await page.getByRole('combobox', { name: 'Model: Verificarea video finală', exact: true }).click()
  await page.getByRole('option', { name: 'Qwen Omni Flash', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  console.log('390px mobile layout and model selection passed')
  await page.setViewportSize({ width: 1440, height: 1000 })

  if (process.env.VERIFY_ADMIN_FAST_REFRESH === '1') {
    await changeModel(page, 'Planificarea montajului', 'OpenAI GPT Luna')
    await reason.fill('Preserve draft during component refresh')
    const componentPath = new URL('../src/ai-routing/stage-model-card.tsx', import.meta.url)
    const original = await readFile(componentPath, 'utf8')
    const anchor = '<Card className='
    const probe = '<Card data-ai-routing-refresh-probe="updated" className='
    assert.ok(original.includes(anchor), 'Component refresh insertion point exists')
    try {
      await writeFile(componentPath, original.replace(anchor, probe))
      await page.locator('[data-ai-routing-refresh-probe="updated"]').first().waitFor()
      await assertShell(page)
      assert.equal(await reason.inputValue(), 'Preserve draft during component refresh')
      assert.match(await page.getByRole('combobox', { name: 'Model: Planificarea montajului', exact: true }).textContent(), /OpenAI GPT Luna/)
      console.log('Component Fast Refresh preserves selected models, reason and shared shell DOM')
    } finally {
      const current = await readFile(componentPath, 'utf8')
      if (current.includes(probe)) await writeFile(componentPath, current.replace(probe, anchor))
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Admin AI routing browser verification passed')
} finally {
  await browser?.close()
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
  }
}
