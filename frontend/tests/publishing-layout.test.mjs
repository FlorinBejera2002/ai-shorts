import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/calendar/calendar-publishing-utils.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const { getPublishingPosts } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)
const month = new Date(2026, 9, 1)
const post = (id, status, day) => ({ id, status, scheduledAt: new Date(2026, 9, day, 12).toISOString() })

test('scheduled tab retains failed and in-flight posts in chronological order', () => {
  const posts = [post('scheduled', 'scheduled', 24), post('failed', 'failed', 22), post('publishing', 'publishing', 23), post('draft', 'draft', 23)]
  const original = [...posts]
  assert.deepEqual(getPublishingPosts(posts, 'scheduled', month).map(item => item.id), ['failed', 'publishing', 'scheduled'])
  assert.deepEqual(posts, original, 'selection must not reorder the API state')
})

test('status tabs isolate drafts and published posts and exclude neighboring month spillover', () => {
  const posts = [post('draft-early', 'draft', 2), post('draft-late', 'draft', 27), post('published', 'published', 23), post('next-month', 'draft', 32), post('previous-month', 'scheduled', 0)]
  assert.deepEqual(getPublishingPosts(posts, 'drafts', month).map(item => item.id), ['draft-late', 'draft-early'])
  assert.deepEqual(getPublishingPosts(posts, 'published', month).map(item => item.id), ['published'])
  assert.deepEqual(getPublishingPosts(posts, 'scheduled', month), [])
})

test('month selection distinguishes the same month in different years', () => {
  const posts = [post('current-year', 'scheduled', 10), { ...post('last-year', 'scheduled', 10), scheduledAt: new Date(2025, 9, 10).toISOString() }]
  assert.deepEqual(getPublishingPosts(posts, 'scheduled', month).map(item => item.id), ['current-year'])
})
