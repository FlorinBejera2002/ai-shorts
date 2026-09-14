import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { checkRedesignInteractions } from './redesign-interaction-checks.mjs'
import { checkFunctionalRecovery } from './functional-recovery-checks.mjs'
import { checkHomeNavigation } from './home-navigation-checks.mjs'

// Called inside the synthetic-account harness; all fixtures are removed by it.
export async function checkAllPages({ chromium, firefox, storageState, sql, userId }) {
  const output = 'test-results/all-pages'
  await mkdir(output, { recursive: true })
  const [clipId, jobId] = sql(`SELECT id,job_id FROM clips WHERE user_id='${userId}' LIMIT 1;`).trim().split('|')
  assert.match(clipId, /^[a-f0-9-]{36}$/)
  assert.match(jobId, /^[a-f0-9-]{36}$/)
  sql(`UPDATE jobs SET source_storage_key='synthetic-redesign.mp4' WHERE id='${jobId}' AND user_id='${userId}';
    UPDATE clips SET start_time=0,end_time=6,duration=6,transcript_text='Synthetic transcript for interface testing.',caption_tiktok='Synthetic caption' WHERE id='${clipId}' AND user_id='${userId}';`)
  const video = execFileSync('docker', ['compose','exec','-T','worker','ffmpeg','-v','error','-f','lavfi','-i','color=c=0x223b70:s=320x180:r=24','-t','8','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'], { cwd: new URL('../../', import.meta.url), maxBuffer: 8*1024*1024 })
  const routes = [
    ['home','/'],['pricing','/pricing'],['login','/login'],['register','/register'],
    ['forgot-password','/forgot-password'],['reset-password','/reset-password'],['privacy','/privacy'],['terms','/terms'],
    ['dashboard','/dashboard'],['create','/dashboard/create'],['review','/dashboard/review'],['clips','/dashboard/clips'],
    ['clip-detail',`/dashboard/clips/${clipId}`],['clip-editor',`/dashboard/clips/${clipId}/edit`],
    ['history','/dashboard/history'],['job-detail',`/dashboard/jobs/${jobId}`],['analytics','/dashboard/analytics'],
    ['script-generator','/dashboard/script-generator'],['publish','/dashboard/publish'],
    ['brand','/dashboard/brand'],['billing','/dashboard/billing'],['settings','/dashboard/settings']
  ]
  const report = []
  const interactionsOnly = process.env.SNEEPCUT_INTERACTIONS_ONLY === '1'
  for (const variant of [
    { name:'chromium-desktop-light', browser:chromium, viewport:{width:1440,height:1000}, theme:'light', locale:'' },
    { name:'chromium-desktop-dark', browser:chromium, viewport:{width:1440,height:1000}, theme:'dark', locale:'' },
    { name:`${process.env.SNEEPCUT_MOBILE_ENGINE ?? 'firefox'}-mobile-ro`, browser:firefox, viewport:{width:390,height:844}, theme:'light', locale:'/ro' }
  ]) {
    if (interactionsOnly && variant.name !== 'chromium-desktop-light') continue
    const context = await variant.browser.newContext({ storageState, viewport:variant.viewport, reducedMotion:'reduce' })
    // Navigation tests deliberately change the locale cookie. Each matrix row
    // must select its own locale rather than inheriting that previous choice.
    await context.addCookies([{ name: 'NEXT_LOCALE', value: variant.locale ? 'ro' : 'en', url: 'http://localhost:3000' }])
    await context.addInitScript(theme => localStorage.setItem('theme', theme), variant.theme)
    await context.route('**/synthetic-redesign.mp4*', route => route.fulfill({ status:200, contentType:'video/mp4', body:video }))
    await context.route('**/synthetic-design-test.mp4*', route => route.fulfill({ status:200, contentType:'video/mp4', body:video }))
    const page = await context.newPage()
    let errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', msg => { if (msg.type()==='error' && /MISSING_MESSAGE|Hydration|hydrating/i.test(msg.text())) errors.push(msg.text()) })
    try {
      for (const [key, path] of interactionsOnly ? [] : routes) {
        errors = []
        const response = await page.goto(`http://localhost:3000${variant.locale}${path}`, {waitUntil:'networkidle'})
        assert.equal(response.status(), 200, `${variant.name} ${key}: HTTP status`)
        await page.locator('h1').first().waitFor({timeout:15000})
        const expectedPath = `${variant.locale}${path}`.replace(/\/$/, '') || '/'
        assert.equal(new URL(page.url()).pathname.replace(/\/$/, '') || '/', expectedPath, `${key}: unexpected redirect`)
        const overflow = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth,
          elements:[...document.querySelectorAll('body *')].filter(el => { const b=el.getBoundingClientRect(); return b.width>0 && b.right>innerWidth+2 && getComputedStyle(el).position!=='fixed' }).slice(0,5).map(el=>({tag:el.tagName,cls:el.className})) }))
        await page.screenshot({path:`${output}/${variant.name}-${key}.png`,fullPage:true})
        assert.ok(overflow.scroll <= overflow.width+1, `${variant.name} ${key}: horizontal overflow ${JSON.stringify(overflow)}`)
        assert.deepEqual(errors, [], `${variant.name} ${key}: runtime errors`)
        report.push({ variant:variant.name, page:key, status:response.status(), overflow:false, runtimeErrors:0 })
        console.log(`PASS ${variant.name}: ${key}`)
      }
      if (variant.name === 'chromium-desktop-light') {
        await checkRedesignInteractions(page, {clipId, sql, userId})
        await page.setViewportSize(variant.viewport)
        await checkFunctionalRecovery(page, {jobId, clipId, video, sql, userId})
        assert.deepEqual(errors, [], 'Interaction checks must not produce uncaught browser errors')
      }
    } catch (error) {
      console.error(`Browser failure at ${page.url()}`)
      await page.screenshot({path:`${output}/${variant.name}-failure.png`,fullPage:true}).catch(()=>{})
      throw error
    } finally {
      await context.close()
      if (!interactionsOnly) await writeFile(`${output}/report.json`, JSON.stringify(report,null,2))
    }
  }
  if (!interactionsOnly) {
    assert.equal(report.length, 69)
    await checkHomeNavigation(chromium)
    console.log(`All 23 pages passed Chromium light/dark and ${process.env.SNEEPCUT_MOBILE_ENGINE ?? 'firefox'} Romanian mobile checks. Media bytes are synthetic; no paid actions were triggered.`)
  }
}
