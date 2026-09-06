// Explicitly opt-in: creates isolated synthetic fixtures in the local Docker DB.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import bcrypt from 'bcryptjs'
import { checkDesktopSidebar, checkMobileSidebar } from './sidebar-browser-checks.mjs'
import { checkAllPages } from './all-pages-browser-checks.mjs'

assert.equal(process.env.SNEEPCUT_BROWSER_MUTATIONS, 'allow-synthetic-account')
const playwright = await import(pathToFileURL(process.env.SNEEPCUT_PLAYWRIGHT_MODULE).href)
const origin = 'http://localhost:3000'
const userId = randomUUID()
const otherId = randomUUID()
const email = `dashboard-design-${userId}@example.invalid`
const password = `${randomBytes(24).toString('base64url')}Aa7!`
const passwordHash = await bcrypt.hash(password, 12)
const sql = statement => execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'sneepcut', '-d', 'sneepcut', '-v', 'ON_ERROR_STOP=1', '-At'], {
  input: statement, cwd: new URL('../../', import.meta.url), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
})
const browsers = []
const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const clipTotal = days => Array.from({ length: Math.min(days, 40) }, (_, offset) => {
  const day = new Date(today)
  day.setUTCDate(day.getUTCDate() - offset)
  return 1 + day.getUTCDate() % 5
}).reduce((sum, count) => sum + count, 0)
await mkdir('test-results/dashboard-design', { recursive: true })
try {
  sql(`INSERT INTO users (id,email,name,provider,password_hash,credits,plan) VALUES
    ('${userId}','${email}','Studio Test','credentials','${passwordHash}',100,'free'),
    ('${otherId}','dashboard-design-${otherId}@example.invalid','Other Studio Test','credentials',NULL,100,'free');`)
  const browser = await playwright.chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] })
  browsers.push(browser)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/login`)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('**/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('studio-dashboard').waitFor()
  assert.equal(await page.getByTestId('range-clips').innerText(), '0')
  await page.getByText('Your next great clip starts here.', { exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/dashboard-design/empty.png', fullPage: true })
  if (process.env.SNEEPCUT_ALL_PAGES === '1' && process.env.SNEEPCUT_INTERACTIONS_ONLY !== '1') {
    for (const route of ['review','clips','history','analytics']) {
      await page.goto(`${origin}/dashboard/${route}`, {waitUntil:'networkidle'})
      await page.locator('h1').waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
      assert.deepEqual(errors, [])
      await page.screenshot({path:`test-results/dashboard-design/empty-${route}.png`,fullPage:true})
    }
    await page.goto(`${origin}/dashboard`, {waitUntil:'networkidle'})
    console.log('Empty review, library, history and analytics pages passed before fixtures were seeded')
  }
  // All fixtures are terminal: never enqueue work, render or publish real media.
  sql(`INSERT INTO jobs (id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged,created_at)
    SELECT gen_random_uuid(), '${userId}', 'upload', CASE WHEN n%9=0 THEN 'failed' ELSE 'completed' END,100,5,'9:16','default',false,0,
      (date_trunc('day',NOW() AT TIME ZONE 'UTC') - n * interval '1 day' + interval '1 hour') AT TIME ZONE 'UTC'
    FROM generate_series(0,39) n;
    INSERT INTO jobs (id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged)
    VALUES (gen_random_uuid(),'${otherId}','upload','completed',100,5,'9:16','default',false,0);
    INSERT INTO clips (id,job_id,user_id,title,viral_score,start_time,end_time,duration,file_path,file_size,resolution,aspect_ratio,has_subtitles,created_at)
    SELECT gen_random_uuid(),j.id,j.user_id,'Synthetic studio clip ' || n,8,0,30,30,'synthetic-design-test.mp4',0,'1080x1920','9:16',true,j.created_at
    FROM jobs j CROSS JOIN generate_series(1,5) n WHERE j.user_id IN ('${userId}','${otherId}')
      AND n <= 1 + EXTRACT(DAY FROM j.created_at AT TIME ZONE 'UTC')::int % 5;`)
  await page.reload()
  await page.waitForLoadState('networkidle')
  for (const days of [30,7,90]) {
    await page.getByRole('button', { name: `${days} days`, exact: true }).click()
    assert.equal(await page.getByTestId('range-clips').innerText(), String(clipTotal(days)))
    assert.equal(await page.getByTestId('range-projects').innerText(), String(Math.min(days,40)))
  }
  // Keyboard activation, no second fetch needed for the selected range.
  await page.getByRole('button', { name: '30 days', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByTestId('range-clips').innerText(), String(clipTotal(30)))
  await page.locator('summary').filter({ hasText: 'View chart data' }).click()
  assert.equal(await page.locator('[data-testid="activity-card"] tbody tr').count(), 30)
  await page.locator('summary').filter({ hasText: 'View chart data' }).click()
  assert.equal(await page.getByTestId('status-card').locator('.recharts-pie-sector').count(), 2)
  for (const theme of ['Light','Dark']) {
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await page.getByRole('menuitemradio', { name: theme, exact: true }).click()
    await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === 'Dark')
    await page.screenshot({ path: `test-results/dashboard-design/desktop-${theme.toLowerCase()}.png`, fullPage: true })
  }
  const bounds = await page.getByTestId('activity-card').locator('.recharts-surface').boundingBox()
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.45)
  await page.locator('.recharts-tooltip-wrapper').first().waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByTestId('studio-dashboard').getByRole('link', { name: 'New project', exact: true }).click()
  await page.waitForURL('**/dashboard/create')
  assert.deepEqual(errors, [])
  console.log('Chromium: empty/seeded charts, 7/30/90 filters, keyboard, data table, tooltip, both themes, account isolation and create link passed')
  if (process.env.SNEEPCUT_INTERACTIONS_ONLY !== '1') await checkDesktopSidebar(page)

  if (process.env.SNEEPCUT_INTERACTIONS_ONLY === '1') {
    await checkAllPages({ chromium: browser, firefox: null, storageState: await context.storageState(), sql, userId })
  } else {
  const mobileEngine = process.env.SNEEPCUT_MOBILE_ENGINE ?? 'firefox'
  assert.ok(['chromium', 'firefox'].includes(mobileEngine))
  const firefox = await playwright[mobileEngine].launch({ headless: true, firefoxUserPrefs: { 'network.dns.disableIPv6': true } })
  browsers.push(firefox)
  const mobile = await firefox.newContext({ storageState: await context.storageState(), viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const mobilePage = await mobile.newPage()
  mobilePage.on('pageerror', error => errors.push(error.message))
  await mobilePage.goto(`${origin}/ro/dashboard`)
  await mobilePage.waitForLoadState('networkidle')
  console.log('Mobile route diagnostic', JSON.stringify({ engine:mobileEngine, url:mobilePage.url(), headings:await mobilePage.locator('h1').allTextContents(), ranges:await mobilePage.locator('[data-testid="studio-dashboard"] button').allTextContents() }))
  await mobilePage.screenshot({path:'test-results/dashboard-design/mobile-before-filter.png',fullPage:true})
  await mobilePage.getByRole('button', { name: '7 zile', exact: true }).click()
  assert.equal(await mobilePage.getByTestId('range-clips').innerText(), String(clipTotal(7)))
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await mobilePage.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  await mobilePage.screenshot({ path: 'test-results/dashboard-design/mobile-ro.png', fullPage: true })
  await mobilePage.setViewportSize({ width: 768, height: 1024 })
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log(`${mobileEngine}: Romanian, mobile/tablet, reduced motion, chart filter and no horizontal overflow passed`)
  if (process.env.SNEEPCUT_INTERACTIONS_ONLY !== '1') await checkMobileSidebar(mobilePage)
  assert.deepEqual(errors, [])
  if (process.env.SNEEPCUT_ALL_PAGES === '1') {
    await checkAllPages({ chromium: browser, firefox, storageState: await context.storageState(), sql, userId })
  }
  }
} finally {
  for (const browser of browsers) await browser.close()
  for (const id of [userId, otherId]) assert.match(id, /^[a-f0-9-]{36}$/)
  sql(`DELETE FROM clips WHERE user_id IN ('${userId}','${otherId}');
    DELETE FROM jobs WHERE user_id IN ('${userId}','${otherId}');
    DELETE FROM users WHERE id IN ('${userId}','${otherId}') AND email LIKE 'dashboard-design-%@example.invalid';`)
  console.log('Synthetic dashboard users, jobs and clips removed.')
}
