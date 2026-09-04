import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  })
  const compileErrors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  assert.deepEqual(
    compileErrors,
    [],
    `${relativePath} should transpile cleanly`
  )
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )
}

const { CONTENT_PLATFORMS, parseCalendarRange, validateScheduledPostPayload } =
  await loadTypeScriptModule('../src/lib/content-calendar.ts')
const { getDefaultPlanningTime } = await loadTypeScriptModule(
  '../src/components/calendar/calendar-utils.ts'
)

const validCreatePayload = {
  title: 'Product launch teaser',
  caption: 'A first look at what we are shipping.',
  notes: 'Review the final thumbnail before publishing.',
  platforms: ['tiktok', 'instagram'],
  status: 'scheduled',
  scheduledAt: '2026-09-04T10:30:00+03:00',
  clipId: '123e4567-e89b-42d3-a456-426614174000'
}

test('accepts and normalizes a complete create payload', () => {
  const result = validateScheduledPostPayload(validCreatePayload, 'create')

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.title, validCreatePayload.title)
  assert.equal(result.data.status, 'scheduled')
  assert.deepEqual(result.data.platforms, ['tiktok', 'instagram'])
  assert.equal(
    result.data.scheduledAt?.toISOString(),
    '2026-09-04T07:30:00.000Z'
  )
})

test('defaults a new post to draft and normalizes optional empty text', () => {
  const result = validateScheduledPostPayload(
    {
      title: '  Draft idea  ',
      caption: '   ',
      notes: '',
      platforms: ['youtube'],
      scheduledAt: '2026-09-04T07:30:00Z'
    },
    'create'
  )

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.title, 'Draft idea')
  assert.equal(result.data.caption, null)
  assert.equal(result.data.notes, null)
  assert.equal(result.data.status, 'draft')
})

test('supports exactly the product platforms', () => {
  assert.deepEqual(CONTENT_PLATFORMS, [
    'tiktok',
    'instagram',
    'youtube',
    'linkedin'
  ])

  for (const platforms of [
    [],
    ['facebook'],
    ['tiktok', 'tiktok'],
    ['youtube', 42]
  ]) {
    const result = validateScheduledPostPayload(
      { ...validCreatePayload, platforms },
      'create'
    )
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(result.issues.some((issue) => issue.field === 'platforms'))
    }
  }
})

test('rejects ambiguous timestamps, invalid clips, and unknown fields', () => {
  const result = validateScheduledPostPayload(
    {
      ...validCreatePayload,
      scheduledAt: '2026-09-04T10:30',
      clipId: 'not-a-uuid',
      userId: 'another-user'
    },
    'create'
  )

  assert.equal(result.success, false)
  if (result.success) return
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.field)),
    new Set(['body', 'scheduledAt', 'clipId'])
  )
})

test('rejects normalized-over calendar dates and invalid offsets', () => {
  for (const scheduledAt of [
    '2026-02-30T12:00:00Z',
    '2025-02-29T12:00:00Z',
    '2026-09-03Z',
    '2026-09-03T24:00:00Z',
    '2026-09-03T12:00:00+14:30'
  ]) {
    const result = validateScheduledPostPayload(
      { ...validCreatePayload, scheduledAt },
      'create'
    )
    assert.equal(result.success, false, scheduledAt)
    if (!result.success) {
      assert.ok(result.issues.some((issue) => issue.field === 'scheduledAt'))
    }
  }

  const leapDay = validateScheduledPostPayload(
    { ...validCreatePayload, scheduledAt: '2028-02-29T12:00:00Z' },
    'create'
  )
  assert.equal(leapDay.success, true)
})

test('enforces text limits and required create fields', () => {
  const result = validateScheduledPostPayload(
    {
      title: ' ',
      caption: 'c'.repeat(5_001),
      notes: 'n'.repeat(2_001),
      platforms: ['linkedin']
    },
    'create'
  )

  assert.equal(result.success, false)
  if (result.success) return
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.field)),
    new Set(['title', 'caption', 'notes', 'scheduledAt'])
  )
})

test('accepts meaningful partial updates and rejects empty updates', () => {
  const update = validateScheduledPostPayload(
    { clipId: null, status: 'published' },
    'update'
  )
  assert.equal(update.success, true)

  const empty = validateScheduledPostPayload({}, 'update')
  assert.equal(empty.success, false)
  if (!empty.success) {
    assert.equal(empty.issues[0]?.field, 'body')
  }
})

test('validates bounded half-open calendar ranges', () => {
  const valid = parseCalendarRange(
    '2026-08-31T21:00:00.000Z',
    '2026-10-05T21:00:00.000Z'
  )
  assert.equal(valid.success, true)

  for (const [start, end] of [
    [null, '2026-09-02T00:00:00Z'],
    ['not-a-date', '2026-09-02T00:00:00Z'],
    ['2026-02-30T00:00:00Z', '2026-03-02T00:00:00Z'],
    ['2026-09-02T00:00:00Z', '2026-09-01T00:00:00Z'],
    ['2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z']
  ]) {
    assert.equal(parseCalendarRange(start, end).success, false)
  }
})

test('keeps late-night planning defaults on the selected day', () => {
  const selectedDate = new Date(2026, 8, 3, 12, 0, 0)
  const lateNight = new Date(2026, 8, 3, 23, 47, 30)
  const result = getDefaultPlanningTime(selectedDate, lateNight)

  assert.deepEqual(
    [
      result.getFullYear(),
      result.getMonth(),
      result.getDate(),
      result.getHours(),
      result.getMinutes()
    ],
    [2026, 8, 3, 23, 59]
  )
})
