import assert from 'node:assert/strict'

// Runs in the existing disposable local-account harness. Only these explicitly
// intercepted requests are simulated; the page sweep uses the real API/DB.
export async function checkFunctionalRecovery(page, { jobId, clipId, video, sql, userId }) {
  const go = path => page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' })
  let currentStatus = 'cancelled'
  let requests = 0
  const jobRoute = `**/api/jobs/${jobId}`
  await page.route(jobRoute, route => {
    requests++
    if (currentStatus === 'missing') return route.fulfill({ status: 404, json: { detail: 'Job not found' } })
    return route.fulfill({ json: { job: { id: jobId, status: currentStatus, progress: currentStatus === 'completed' ? 100 : 35 } } })
  })
  try {
    for (const status of ['cancelled', 'failed', 'completed', 'rendering']) {
      currentStatus = status
      await go(`/dashboard/jobs/${jobId}`)
      const eta = page.getByText(/Estimated time remaining/)
      assert.equal(await eta.count(), status === 'rendering' ? 1 : 0)
      if (status === 'cancelled') await page.getByRole('status').getByText('Processing cancelled', { exact: true }).waitFor()
      if (status === 'failed') assert.ok(await page.getByText('Processing failed', { exact: true }).count() > 0)
      if (status === 'completed') await page.getByRole('link', { name: 'View clips', exact: true }).waitFor()
    }
    currentStatus = 'missing'
    requests = 0
    await go(`/dashboard/jobs/${jobId}`)
    await page.getByText('Job not found', { exact: true }).waitFor()
    assert.equal(requests, 1, '404 must not wait through five retries')
    currentStatus = 'completed'
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('link', { name: 'View clips', exact: true }).waitFor()
    assert.equal(await page.getByText('Job not found', { exact: true }).count(), 0)
    console.log('Job recovery: cancelled/failed/completed/active states, immediate 404 and retry passed')
  } finally { await page.unroute(jobRoute) }

  await go(`/dashboard/clips/${clipId}`)
  await page.getByLabel('Title', { exact: true }).fill('Verified functional clip')
  const [save] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/clips/${clipId}`) && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: 'Save', exact: true }).first().click()
  ])
  assert.equal(save.status(), 200)
  assert.equal(sql(`SELECT title FROM clips WHERE id='${clipId}' AND user_id='${userId}';`).trim(), 'Verified functional clip')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const trim = page.getByRole('button', { name: 'Trim & re-export', exact: true })
  for (const [start, end, disabled] of [[-1, 6, true], [0, 7, true], [3, 4, true], [0, 6, false]]) {
    await page.locator('#trim-start').fill(String(start))
    await page.locator('#trim-end').fill(String(end))
    assert.equal(await trim.isDisabled(), disabled, `trim ${start}–${end}`)
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Permission denied')) } })
  })
  await page.getByRole('button', { name: 'Copy transcript', exact: true }).click()
  await page.getByText('Could not copy. Select the text and copy it manually.', { exact: true }).waitFor()
  console.log('Clip detail: real metadata persistence, trim bounds/minimum duration, and clipboard rejection recovery passed')

  await go('/dashboard/create')
  await page.getByRole('tab').nth(1).click()
  let authorizationCount = 0
  let releaseAuthorization
  let delayAuthorization = false
  const uploadRoute = '**/api/upload/authorize'
  await page.route(uploadRoute, async route => {
    authorizationCount++
    if (delayAuthorization) await new Promise(resolve => { releaseAuthorization = resolve })
    await route.fulfill({ json: { uploadUrl: '/api/upload', token: null } }).catch(() => {})
  })
  await page.route('**/api/upload', route => route.fulfill({ json: { file_path: 'synthetic-recovery.mp4' } }))
  try {
    const picker = page.getByRole('button').filter({ has: page.locator('input[type="file"]') })
    await picker.focus()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: 'first.mp4', mimeType: 'video/mp4', buffer: video })
    await page.getByText('first.mp4', { exact: true }).waitFor()
    await page.getByTitle('Replace file').waitFor()
    delayAuthorization = true
    const replacement = page.waitForEvent('filechooser')
    await page.getByTitle('Replace file').click()
    await (await replacement).setFiles({ name: 'replacement.mp4', mimeType: 'video/mp4', buffer: video })
    await page.getByTitle('Cancel upload').waitFor()
    await page.getByText('replacement.mp4', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Generate \d+ clips/ }).isDisabled(), true)
    await page.getByTitle('Cancel upload').click()
    await page.getByText('first.mp4', { exact: true }).waitFor()
    releaseAuthorization?.()
    await page.getByTitle('Remove file').click()
    delayAuthorization = false
    await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
    assert.equal(await page.getByTitle('Cancel upload').count(), 0)
    assert.ok(authorizationCount <= 2, 'invalid files must not request authorization')
    console.log('Upload recovery: keyboard file chooser, completed upload, replacement progress, preparation cancellation and invalid file guard passed')
  } finally {
    releaseAuthorization?.()
    await page.unroute(uploadRoute)
    await page.unroute('**/api/upload')
  }
}
