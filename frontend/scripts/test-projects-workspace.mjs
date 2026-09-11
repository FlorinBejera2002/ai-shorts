import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const playwrightPath = process.env.PLAYWRIGHT_MODULE
assert.ok(
  playwrightPath,
  'PLAYWRIGHT_MODULE must point to Playwright index.mjs'
)
const { chromium } = await import(pathToFileURL(playwrightPath).href)

const origin = process.env.SNEEPCUT_BROWSER_URL ?? 'http://localhost:3001'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))

const projectId = '11111111-1111-4111-8111-111111111111'
const clipId = '22222222-2222-4222-8222-222222222222'
const folderId = '33333333-3333-4333-8333-333333333333'
const user = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'projects@example.test',
  name: 'Projects Test',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}
const project = {
  id: projectId,
  name: 'Launch campaign',
  status: 'completed',
  source: 'launch.mp4',
  updatedAt: '2026-09-11T10:00:00Z',
  brandKit: {},
  folders: [],
  clips: [
    {
      id: clipId,
      folderId: null,
      title: 'Founder story',
      duration: 38,
      viralScore: 9,
      aspectRatio: '9:16',
      thumbnailUrl: null
    }
  ]
}

await mkdir('test-results/projects-workspace', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/\/(?:api|v1)\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body, status = 200) => route.fulfill({ status, json: body })
    if (path === '/v1/auth/refresh')
      return json({ access_token: 'synthetic-access', user })
    if (path === '/api/user/credits')
      return json({ credits: 100, plan: 'free' })
    if (path === '/api/assistant/history') return json({ messages: [] })
    if (path === '/api/stripe/plans') return json({})
    assert.equal(request.headers().authorization, 'Bearer synthetic-access')
    if (path === '/api/projects' && request.method() === 'GET')
      return json({ projects: [project] })
    if (
      path === `/api/projects/${projectId}/folders` &&
      request.method() === 'POST'
    ) {
      const input = request.postDataJSON()
      project.folders.push({
        id: folderId,
        parentId: input.parentId,
        name: input.name
      })
      return json(project.folders[0], 201)
    }
    if (
      path === `/api/projects/${projectId}/clips/${clipId}` &&
      request.method() === 'PATCH'
    ) {
      project.clips[0].folderId = request.postDataJSON().folderId
      return json({ updated: true })
    }
    if (path === `/api/projects/${projectId}` && request.method() === 'PATCH') {
      project.brandKit = request.postDataJSON().brandKit
      return json({ updated: true })
    }
    throw new Error(`Unexpected request: ${request.method()} ${path}`)
  })

  await page.goto(`${origin}/dashboard/history`, { waitUntil: 'networkidle' })
  await page
    .getByRole('heading', { name: 'Launch campaign', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  await page.getByLabel('Folder name', { exact: true }).fill('Social cuts')
  await page.getByRole('button', { name: 'Create folder', exact: true }).click()
  await page.getByRole('button', { name: /Move to: Founder story/ }).click()
  await page.getByRole('menuitem', { name: 'Social cuts', exact: true }).click()
  assert.equal(project.clips[0].folderId, folderId)

  await page.getByRole('button', { name: /Brand kit/ }).click()
  await page.getByLabel('Brand name', { exact: true }).fill('Sneep Launch')
  await page.getByLabel('Primary color', { exact: true }).fill('#1264a3')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  assert.equal(project.brandKit.name, 'Sneep Launch')

  await page.getByRole('button', { name: 'Social cuts', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Founder story', exact: true })
    .waitFor()
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  assert.deepEqual(errors, [])
  await page.screenshot({
    path: 'test-results/projects-workspace/desktop.png',
    fullPage: true
  })

  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  await page.screenshot({
    path: 'test-results/projects-workspace/mobile.png',
    fullPage: true
  })
  console.info(
    'Projects workspace: folders, clip move, project brand, desktop and mobile passed'
  )
} finally {
  await browser.close()
}
