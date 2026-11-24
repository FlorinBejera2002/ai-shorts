import assert from 'node:assert/strict'
import { chooseCreationSource } from './creation-browser-helpers.mjs'
import { pathToFileURL } from 'node:url'
import { settleStoryNavigation } from './story-browser-helpers.mjs'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error(
    'Set PLAYWRIGHT_MODULE to the installed Playwright entry point'
  )
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({
  viewport: { width: 1280, height: 960 },
  hasTouch: true
})
page.setDefaultTimeout(30000)
const errors = []
const generations = []
const agentSends = []
const agentRuns = []
const uploads = []
page.on('pageerror', (error) => errors.push(error.message))
let project
let releaseValidation
const validationGate = new Promise((resolve) => {
  releaseValidation = resolve
})
const limits = {
  max_files: 20,
  max_file_bytes: 2 * 1024 ** 3,
  max_total_bytes: 10 * 1024 ** 3,
  max_source_seconds: 900,
  max_total_seconds: 3600
}

await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: '00000000-0000-4000-8000-000000000031',
        email: 'story-wizard@example.invalid',
        name: 'Wizard fixture',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/original/**', (route) => route.fulfill({ status: 204 }))
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const method = request.method()
  if (path === '/api/dashboard')
    return route.fulfill({
      json: {
        metrics: {
          credits: 100,
          plan: 'free',
          jobCount: 0,
          clipCount: 0,
          durationMinutes: 0,
          activity: [],
          statuses: {}
        },
        recentClips: []
      }
    })
  if (path === '/api/workspace-agent/runs') {
    if (method === 'GET')
      return route.fulfill({ json: { runs: agentRuns, has_more: false } })
    const body = request.postDataJSON()
    agentSends.push(body)
    const run = {
      id: body.request_id,
      message: body.message,
      context: body.context,
      reply: 'Synthetic step guidance.',
      status: 'completed',
      revision: 1,
      cost_credits: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    agentRuns.push(run)
    return route.fulfill({ json: run })
  }
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/upload/authorize')
    return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
  if (path === '/api/upload') {
    const filename = /filename="([^"]+)"/.exec(
      request.postDataBuffer()?.toString() ?? ''
    )?.[1]
    assert.ok(filename, 'Synthetic fixtures use the real multipart upload path')
    uploads.push(filename)
    return route.fulfill({ json: { file_path: `uploads/${filename}` } })
  }
  if (path === '/api/stories') {
    if (method === 'GET')
      return route.fulfill({
        json: { stories: project ? [project] : [], limits }
      })
    const body = request.postDataJSON()
    project = {
      id: body.id,
      options: body.options,
      status: 'draft',
      limits,
      assets: [],
      versions: [],
      current_version: 0
    }
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/assets') && method === 'POST') {
    const body = request.postDataJSON()
    if (body.name === 'second-scene.mp4') await validationGate
    project.assets.push({
      id: body.id,
      name: body.name,
      order: body.order,
      kind: 'video',
      size: 12000,
      duration: 12,
      role: 'auto',
      include: 'auto',
      candidates: [],
      source_url: `/original/${body.id}.mp4`
    })
    project.assets.sort((a, b) => a.order - b.order)
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/generate')) {
    const body = request.postDataJSON()
    assert.equal(project.assets.length, 2)
    assert.deepEqual(
      [...body.asset_ids].sort(),
      project.assets.map((asset) => asset.id).sort()
    )
    generations.push(body)
    project.status = 'pending'
    return route.fulfill({ status: 202, json: project })
  }
  if (project && path === `/api/stories/${project.id}`) {
    if (method === 'PATCH') {
      const body = request.postDataJSON()
      if (body.options) project.options = body.options
      if (body.assets)
        for (const update of body.assets)
          Object.assign(
            project.assets.find((asset) => asset.id === update.id),
            update
          )
    }
    return route.fulfill({ json: project })
  }
  return route.fulfill({ json: {} })
})

const wizard = page.getByTestId('story-wizard')
// The stepper sits in the page header beside the source switch, outside the wizard.
const stepNavigation = page.getByRole('navigation', {
  name: 'Clip creation steps',
  exact: true
})
const stepButtons = stepNavigation.getByRole('button')
const build = page.getByRole('button', { name: 'Create clips', exact: true })
const brief = page.getByRole('textbox', {
  name: 'Describe the video you want',
  exact: true
})
const next = async (step) => {
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
  assert.equal(
    generations.length,
    0,
    'Continue never generates or charges for a story'
  )
  assert.equal(await stepNavigation.locator('[aria-current="step"]').count(), 1)
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('data-testid') ===
      'story-step-heading'
  )
  assert.equal(
    await page
      .getByTestId('story-step-heading')
      .evaluate((node) => node === document.activeElement),
    true,
    'Step navigation moves keyboard focus to the new heading'
  )
}
const back = async (step) => {
  await wizard.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
  assert.equal(generations.length, 0)
}
const noOverflow = async () => {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true,
    'The wizard fits the viewport without horizontal scrolling'
  )
  assert.equal(
    await stepButtons.evaluateAll((buttons) =>
      buttons.every(
        (button) =>
          button.scrollWidth <= button.clientWidth + 1 &&
          button.getBoundingClientRect().right <= window.innerWidth
      )
    ),
    true,
    'Every step label fits its own pill, including long translated words'
  )
}
const screenshot = async (path) => {
  await settleStoryNavigation(page)
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    window.scrollTo(0, 0)
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
  })
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

try {
  const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'
  await page.goto(`${origin}/dashboard/create`, {
    waitUntil: 'networkidle',
    timeout: 180000
  })
  await page.getByTestId('story-step-0').waitFor({ state: 'visible' })
  assert.equal(await stepButtons.count(), 3)
  const positions = await stepButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect()
      return { x, y, width, height }
    })
  )
  assert.ok(
    positions.every(
      (box, index) =>
        Math.abs(box.y - positions[0].y) <= 1 &&
        (index === 0 || box.x >= positions[index - 1].x + positions[index - 1].width - 1)
    ),
    `Desktop steps form one horizontal pill row beside the source switch: ${JSON.stringify(positions)}`
  )
  assert.equal(await stepButtons.first().getAttribute('aria-current'), 'step')
  for (const index of [1, 2])
    assert.equal(
      await stepButtons.nth(index).isDisabled(),
      true,
      'Unvisited later steps cannot be selected directly'
    )
  assert.equal(await build.count(), 0)
  assert.equal(
    await page
      .getByRole('textbox', {
        name: 'Describe the video you want',
        exact: true
      })
      .isVisible(),
    false
  )
  // Canvas parity: the footage step has no visible title, help tooltip or agent button.
  assert.equal(
    await page.getByRole('button', { name: 'Ask agent', exact: true }).count(),
    0,
    'The footage step has no agent button'
  )
  assert.equal(
    await page
      .getByRole('button', { name: 'Help for Your recordings', exact: true })
      .count(),
    0,
    'The footage step has no help tooltip'
  )


  const askAgent = page.getByRole('button', { name: 'Ask agent', exact: true })
  const shellAgent = page.getByRole('button', {
    name: 'Open Workspace Agent',
    exact: true
  })
  const panel = page.locator('#workspace-agent-panel')
  const composer = panel.getByRole('textbox', {
    name: 'What would you like to create or change?',
    exact: true
  })
  const closeAgent = async () => {
    await panel
      .getByRole('button', { name: 'Collapse agent', exact: true })
      .click()
    await panel.waitFor({ state: 'hidden' })
  }
  // The Options and Review steps have no agent button; the agent opens from the dashboard shell.
  const sendShellMessage = async (message) => {
    await shellAgent.click()
    await composer.fill(message)
    await panel.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('#workspace-agent-panel textarea')?.value === ''
    )
    await closeAgent()
  }
  // The first clip registers at once; the second waits on the gate below, after the agent navigation.
  await page.getByLabel('Upload clips').setInputFiles([
    {
      name: 'first-scene.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('synthetic first scene')
    }
  ])
  await page.getByTestId('validated-source').first().waitFor()
  assert.equal(await build.isVisible(), false)
  await next(1)
  assert.equal(await askAgent.count(), 0, 'The options step has no agent button')
  await sendShellMessage('Options step check.')
  assert.equal(agentSends.length, 1)
  assert.equal(agentSends[0].context.help_topic, undefined, 'The shell agent carries no step help')
  assert.equal(agentSends[0].context.story_step, undefined)
  assert.deepEqual(agentSends[0].resource_ids, [])
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.getByTestId('studio-dashboard').waitFor()
  await sendShellMessage('Home check.')
  assert.equal(agentSends[1].context.route, '/dashboard')
  assert.equal(agentSends[1].context.story_step, undefined)
  await page.goBack()
  await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
  await back(0)
  await page.getByLabel('Upload clips').setInputFiles([
    {
      name: 'second-scene.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('synthetic second scene')
    }
  ])
  await page
    .getByRole('status')
    .filter({ hasText: 'Validating' })
    .first()
    .waitFor()
  const sourceGallery = await page.getByTestId('story-step-0').elementHandle()
  assert.equal(await build.isVisible(), false)
  await next(1)
  await stepButtons.first().focus()
  await page.keyboard.press('Tab')
  assert.equal(
    await stepButtons
      .nth(1)
      .evaluate((button) => button === document.activeElement),
    true,
    'The next enabled step can be reached by keyboard'
  )
  await page.keyboard.press('Enter')
  await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
  await sendShellMessage('Options check after keyboard navigation.')
  assert.equal(agentSends.length, 3)
  assert.equal(agentSends[2].context.story_step, undefined, 'Shell help carries no step')
  const message = 'Keep the landscape reveal after the introduction.'
  await brief.fill(message)
  // Canvas options: length and shape are segmented radio groups in the inspector.
  await page
    .getByRole('radiogroup', { name: 'Length', exact: true })
    .getByRole('radio', { name: '30 s', exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Shape', exact: true })
    .getByRole('radio', { name: '1:1', exact: true })
    .click()
  await page.getByRole('radio', { name: 'No captions', exact: true }).click()
  await next(2)
  await build.waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stepButtons.nth(1).focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
  await stepButtons.nth(2).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('story-step-2').waitFor({ state: 'visible' })
  assert.equal(await stepButtons.nth(2).getAttribute('aria-current'), 'step')
  assert.equal(
    await stepButtons.evaluateAll((buttons) =>
      buttons.every((button) =>
        getComputedStyle(button)
          .transitionDuration.split(',')
          .every((duration) => Number.parseFloat(duration) <= 0.001)
      )
    ),
    true,
    'Reduced-motion step navigation does not retain decorative CSS transitions'
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(
    await build.isDisabled(),
    true,
    'Server validation still gates generation at Review'
  )
  releaseValidation()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="validated-source"]').length === 2
  )
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Create clips' && !button.disabled
    )
  )
  assert.equal(
    await build.isEnabled(),
    true,
    'Generate is the explicit confirmation once uploads finish'
  )
  // Canvas review: the chosen settings are shown as rows; no cost line sits beside the action.
  await page
    .getByTestId('story-step-2')
    .getByText('Verify and create', { exact: true })
    .waitFor()
  await back(1)
  assert.equal(
    await page
      .getByRole('radiogroup', { name: 'Length', exact: true })
      .getByRole('radio', { name: '30 s', exact: true })
      .getAttribute('aria-checked'),
    'true'
  )
  assert.equal(
    await page
      .getByRole('radiogroup', { name: 'Shape', exact: true })
      .getByRole('radio', { name: '1:1', exact: true })
      .getAttribute('aria-checked'),
    'true'
  )
  assert.equal(
    await page
      .getByRole('radio', { name: 'No captions', exact: true })
      .isChecked(),
    true
  )
  assert.equal(
    await brief.innerText(),
    message,
    'Back preserves the story brief'
  )
  // Canvas: the project header (title, picker, "New project") appears only once a result exists,
  // so the wizard steps show no project row before generation.
  const newStory = page.getByRole('button', { name: 'New project', exact: true })
  assert.equal(
    await newStory.count(),
    0,
    'Wizard steps show no project header before the first result'
  )
  await brief.fill(`${message} Preserve the full reveal.`)
  await next(2)
  await back(1)
  await brief.fill(message)
  await next(2)
  await back(1)
  const wizardNode = await wizard.elementHandle()
  const sidebar = page.locator('[data-slot="sidebar"]')
  const sidebarNode = await sidebar.elementHandle()
  const headerNode = await page.locator('header').first().elementHandle()
  const sidebarState = await sidebar.getAttribute('data-state')
  await page.locator('[data-sidebar="trigger"]').click()
  await page.waitForFunction(
    (previous) =>
      document
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute('data-state') !== previous,
    sidebarState
  )
  const chosenSidebarState = await sidebar.getAttribute('data-state')
  await chooseCreationSource(page, 'youtube')
  await page.getByTestId('creation-youtube-workspace').waitFor({ state: 'visible' })
  assert.equal(await wizardNode.evaluate((node) => node.isConnected), true)
  assert.equal(await wizard.isVisible(), false)
  await chooseCreationSource(page, 'upload')
  await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
  assert.equal(
    await brief.innerText(),
    message,
    'Mode roundtrip preserves the active step and brief'
  )
  assert.equal(
    await wizardNode.evaluate(
      (node) => node === document.querySelector('[data-testid="story-wizard"]')
    ),
    true
  )
  assert.equal(
    await sidebarNode.evaluate(
      (node) => node === document.querySelector('[data-slot="sidebar"]')
    ),
    true,
    'Mode switching preserves the sidebar DOM boundary'
  )
  assert.equal(
    await headerNode.evaluate(
      (node) => node === document.querySelector('header')
    ),
    true,
    'Mode switching preserves the dashboard header'
  )
  assert.equal(
    await sidebar.getAttribute('data-state'),
    chosenSidebarState,
    'Mode switching preserves the chosen sidebar state'
  )
  assert.equal(generations.length, 0, 'Mode switching never generates a story')
  await page.locator('[data-sidebar="trigger"]').click()
  if (process.env.TEST_SCREENSHOT)
    await screenshot(
      process.env.TEST_SCREENSHOT.replace(/\.png$/, '-story-audio.png')
    )
  await back(0)
  assert.equal(await page.getByTestId('validated-source').count(), 2)
  assert.equal(
    await sourceGallery.evaluate((node) => node.isConnected),
    true,
    'Step content stays mounted'
  )
  assert.deepEqual(
    uploads.sort(),
    ['first-scene.mp4', 'second-scene.mp4'],
    'Back never reuploads successful files'
  )
  await next(1)
  await next(2)
  await noOverflow()
  if (process.env.TEST_SCREENSHOT) await screenshot(process.env.TEST_SCREENSHOT)
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow()
  // Mobile shows the current step name, "Pasul N din 3" and three segments instead of pills.
  assert.equal(await stepButtons.count(), 0)
  assert.equal(
    await stepNavigation.getByText(/^(Pasul|Step) 3 (din|of) 3$/).count(),
    1
  )
  assert.equal(await stepNavigation.locator('[data-filled="true"]').count(), 3)
  assert.equal(await askAgent.count(), 0, 'The review step has no agent button')
  for (const step of [1, 0]) {
    await back(step)
    await noOverflow()
  }
  await noOverflow()
  await page.setViewportSize({ width: 320, height: 740 })
  await noOverflow()
  await next(1)
  await noOverflow()
  await next(2)
  await noOverflow()
  assert.equal(
    generations.length,
    0,
    'Navigation never starts a paid generation'
  )
  assert.equal(await build.isEnabled(), true)
  await build.click()
  await page.getByText('Uploading your footage', { exact: true }).waitFor()
  assert.equal(
    generations.length,
    1,
    'Only the explicit Build action creates a job'
  )
  assert.equal(project.options.brief, message)
  assert.equal(project.options.target_seconds, 30)
  assert.equal(project.options.aspect_ratio, '1:1')
  assert.equal(project.options.captions, false)
  project.status = 'draft'
  await page.goto(`${origin}/ro/dashboard/create`, { waitUntil: 'networkidle' })
  await page
    .getByRole('radiogroup', { name: 'Sursa filmărilor', exact: true })
    .waitFor()
  await page.getByTestId('story-step-2').waitFor({ state: 'visible' })
  await noOverflow()
  if (process.env.TEST_SCREENSHOT)
    await screenshot(
      process.env.TEST_SCREENSHOT.replace(/\.png$/, '-ro-mobile.png')
    )
  assert.deepEqual(errors, [])
  console.log(
    'PASS: three-stage wizard, review gates, exact manifest, Back/mode/sidebar preservation, vertical/horizontal step navigation, keyboard and reduced motion, contextual agent help without autosend or draft loss, help scope isolation, desktop/mobile focus, canvas footage step without help controls, desktop/390px/320px/RO layout, and saved settings'
  )
} catch (error) {
  console.error(error)
  console.error({
    errors,
    generations: generations.length,
    body: (await page.locator('body').innerText()).slice(0, 10000)
  })
  throw error
} finally {
  releaseValidation()
  await browser.close()
}
