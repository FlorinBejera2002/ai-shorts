import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(30000)
const errors = []
const edits = []
page.on('pageerror', (error) => errors.push(error.message))
const userID = '00000000-0000-4000-8000-000000000008'
const projectID = '00000000-0000-4000-8000-000000000009'
const voiceWords = [
  { text: 'outside-before', start: 11, end: 12 },
  { text: 'here.', start: 13.1, end: 14 },
  { text: 'Narration', start: 12, end: 12.4 },
  { text: 'continues', start: 12.4, end: 13.1 },
  { text: 'outside-after', start: 14, end: 15 }
]
const candidate = (id, sourceID, words = []) => ({
  id,
  source_id: sourceID,
  in: 0,
  out: 30,
  text: sourceID === 'voice' ? 'Do not show the whole source transcript.' : '',
  words,
  role: sourceID === 'voice' ? 'a_roll' : 'b_roll',
  reason: 'An alternate view of the landscape.',
  confidence: sourceID === 'voice' ? 0.99 : 0.4
})
const asset = (id, name, kind, candidates) => ({
  id,
  name,
  kind,
  candidates,
  size: 32000,
  duration: 30,
  role: 'auto',
  include: 'auto',
  order: 0,
  source_url: `/original/${id}.${kind === 'narration' ? 'wav' : 'mp4'}?signed=fixture`
})
const project = {
  id: projectID,
  options: {
    brief: 'A narrated landscape story',
    target_seconds: 45,
    aspect_ratio: '9:16',
    language: 'en',
    mode: 'smart',
    preserve_order: false,
    captions: true,
    narration: true
  },
  status: 'ready',
  message: 'Your narrated story is ready.',
  limits: {
    max_files: 20,
    max_file_bytes: 2 * 1024 ** 3,
    max_total_bytes: 10 * 1024 ** 3,
    max_source_seconds: 900,
    max_total_seconds: 3600
  },
  assets: [
    asset('footage', 'landscape.mp4', 'video', [candidate('shot-main', 'footage')]),
    asset('other-footage', 'another-angle.mp4', 'video', [
      candidate('shot-alternate', 'other-footage')
    ]),
    asset('voice', 'my-narration.wav', 'narration', [
      candidate('voice-main', 'voice', voiceWords),
      candidate('voice-overlap', 'voice', [voiceWords[2]])
    ])
  ],
  current_version: 1,
  versions: [
    {
      number: 1,
      parent: 0,
      accepted: true,
      plan: {
        title: 'Narrated landscape',
        summary: 'The original voice over selected footage.',
        blocks: [1, 2, 3].map((number) => ({
          id: `block-${number}`,
          candidate_id: 'shot-main',
          role: 'story',
          reason: 'The footage follows the narration.',
          alternatives: ['shot-alternate'],
          locked: false,
          lock_text: true,
          lock_order: false,
          lock_crop: false
        }))
      },
      timeline: [
        {
          block_id: 'block-1',
          candidate_id: 'shot-main',
          output_in: 0,
          output_out: 2,
          video: { source_id: 'footage', in: 3.25, out: 5.25 },
          audio: { source_id: 'voice', in: 10, out: 12 },
          words: [
            { text: 'The', start: 0, end: 0.2 },
            { text: 'finished', start: 0.2, end: 0.7 },
            { text: 'narration.', start: 0.7, end: 1.8 }
          ]
        },
        {
          block_id: 'block-2',
          candidate_id: 'shot-main',
          output_in: 2,
          output_out: 4,
          video: { source_id: 'footage', in: 6, out: 8 },
          audio: { source_id: 'voice', in: 12, out: 14 }
        },
        {
          block_id: 'block-3',
          candidate_id: 'shot-main',
          output_in: 4,
          output_out: 6,
          video: { source_id: 'footage', in: 9, out: 11 },
          audio: { source_id: 'voice', in: 20, out: 22 },
          words: []
        }
      ],
      report: {
        status: 'ready',
        issues: [],
        coverage: {
          plan: true,
          file: true,
          audio: true,
          visual: true,
          captions: true,
          semantics: true,
          boundaries: true
        }
      }
    }
  ]
}

await page.addInitScript(() => {
  window.microphoneCalls = 0
  navigator.mediaDevices.getUserMedia = () => {
    window.microphoneCalls++
    return Promise.reject(
      new Error('This read-only editor test must not request a microphone')
    )
  }
})
await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: userID,
        email: 'narrated-editor@example.invalid',
        name: 'Test',
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
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/stories') return route.fulfill({ json: { stories: [project] } })
  if (path === `/api/stories/${projectID}/generate`) {
    const body = request.postDataJSON()
    assert.equal(body.action, 'alternate')
    assert.equal(body.block_id, 'block-1')
    assert.equal(body.candidate_id, 'shot-alternate')
    assert.equal(body.version, 1)
    assert.ok(body.request_id)
    edits.push(body)
    const next = structuredClone(project.versions[0])
    next.number = 2
    next.parent = 1
    next.plan.blocks[0].candidate_id = 'shot-alternate'
    next.timeline[0].candidate_id = 'shot-alternate'
    next.timeline[0].video = { source_id: 'other-footage', in: 17, out: 19 }
    project.versions.push(next)
    project.current_version = 2
    return route.fulfill({ status: 202, json: project })
  }
  if (path === `/api/stories/${projectID}`) return route.fulfill({ json: project })
  return route.fulfill({ json: {} })
})

try {
  const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  const title = page.getByRole('heading', { name: /^Narrated landscape\b/ })
  await title.waitFor()
  assert.equal(await title.innerText(), 'Narrated landscape')
  const blocks = page.getByTestId('story-block')
  assert.equal(await blocks.count(), 3)
  assert.equal(
    await page.getByRole('button', { name: 'Faster pace', exact: true }).count(),
    0
  )
  await page.getByText('Adjust the edit while keeping your narration unchanged.', { exact: true }).waitFor()
  for (let index = 0; index < 3; index++) {
    await blocks.nth(index).locator('summary').click()
  }
  await blocks.nth(0).getByText('The finished narration.', { exact: true }).last().waitFor()
  await blocks.nth(1).getByText('Narration continues here.', { exact: true }).last().waitFor()
  await blocks
    .nth(2)
    .getByText('Listen to the narration for this section.', { exact: true })
    .waitFor()
  assert.equal(
    await page
      .getByText('Do not show the whole source transcript.', { exact: true })
      .count(),
    0
  )
  assert.equal(
    await blocks.getByText(/outside-before|outside-after/).count(),
    0,
    'Fallback excludes words outside the audio interval'
  )
  assert.equal(await blocks.getByText('Supporting visual', { exact: true }).count(), 0)
  assert.equal(await blocks.getByText(/Original audio \/ selected take/).count(), 0)
  assert.equal(
    await blocks.getByText(/Uncertain transcript/).count(),
    0,
    'Visual confidence does not label the voice transcript uncertain'
  )
  assert.equal(
    await blocks
      .nth(0)
      .getByRole('link', { name: 'my-narration.wav' })
      .getAttribute('href'),
    '/original/voice.wav?signed=fixture#t=10,12'
  )
  assert.equal(
    await blocks
      .nth(0)
      .getByRole('link', { name: 'landscape.mp4' })
      .getAttribute('href'),
    '/original/footage.mp4?signed=fixture#t=3.25,5.25'
  )
  await blocks
    .nth(0)
    .getByText(/Your narration: my-narration.wav/)
    .waitFor()
  await blocks
    .nth(0)
    .getByText(/Visual source: landscape.mp4/)
    .waitFor()
  const alternate = blocks.nth(0).getByLabel('Use another shot 1', { exact: true })
  assert.equal(
    await alternate.isEnabled(),
    true,
    'Immutable voice lock does not block changing footage'
  )
  assert.equal(
    await blocks.getByRole('checkbox', { name: 'Words', exact: true }).count(),
    0
  )
  await alternate.selectOption('shot-alternate')
  await page.getByText('0:06 · Vertical · Version 2', { exact: true }).waitFor()
  assert.equal(edits.length, 1)
  assert.equal(
    await blocks
      .nth(0)
      .getByRole('link', { name: 'another-angle.mp4' })
      .getAttribute('href'),
    '/original/other-footage.mp4?signed=fixture#t=17,19'
  )
  assert.equal(
    await blocks
      .nth(0)
      .getByRole('link', { name: 'my-narration.wav' })
      .getAttribute('href'),
    '/original/voice.wav?signed=fixture#t=10,12'
  )
  await blocks.nth(0).getByText('The finished narration.', { exact: true }).last().waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('0:06 · Vertical · Version 2', { exact: true }).waitFor()
  await blocks.nth(1).getByText('Narration continues here.', { exact: true }).first().waitFor()
  assert.equal(await page.evaluate(() => window.microphoneCalls), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: ready narrated editor shows rendered words and interval-specific fallback, correct voice/visual provenance and trims, immutable voice, alternate shots despite text lock, hidden faster action, and reload restoration'
  )
} catch (error) {
  console.error(error)
  console.error({
    errors,
    body: (await page.locator('body').innerText()).slice(0, 10000)
  })
  throw error
} finally {
  await browser.close()
}
