import assert from 'node:assert/strict'
import test from 'node:test'
import { isReportableError } from '../src/lib/error-report-filter.ts'

const origin = 'https://app.sneepcut.example'

test('WebKit media controls errors without a frame from this app are not reported', () => {
  const stack = 'buffered@\nendTimeForBufferedRangeContainingCurrentTime@\nsyncControl@\nhandleEvent@'
  assert.equal(isReportableError("ReferenceError: Can't find variable: EmptyRange", stack, origin), false)
})

test('ResizeObserver loop notices are benign and not reported', () => {
  assert.equal(isReportableError('ResizeObserver loop completed with undelivered notifications.', '', origin), false)
  assert.equal(isReportableError('ResizeObserver loop limit exceeded', '', origin), false)
})

test('app errors with a frame from this origin are reported', () => {
  const stack = `e@${origin}/assets/index-abc.js:58:211792\nrender@${origin}/assets/index-abc.js:1:2`
  assert.equal(isReportableError('TypeError: undefined is not an object', stack, origin), true)
})

test('stackless cross-origin script errors are not reported', () => {
  assert.equal(isReportableError('Script error.', '', origin), false)
})

test('stackless rejections with a string or plain object reason are still reported', () => {
  assert.equal(isReportableError('{"error":"stories unavailable"}', '', origin), true)
  assert.equal(isReportableError('Failed to load the story list', '', origin), true)
})

test('errors from another origin with a stack are not reported', () => {
  const stack = 'handleEvent@https://cdn.example.net/analytics.js:1:2'
  assert.equal(isReportableError('TypeError: nope', stack, origin), false)
})
