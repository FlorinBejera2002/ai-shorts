import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/calendar/post-composer-time.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const { combineZonedDateTime } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)

test('schedule converts selected time zone instead of the machine time zone', () => {
  assert.equal(combineZonedDateTime('2026-10-23', '18:00', 'Europe/Bucharest').toISOString(), '2026-10-23T15:00:00.000Z')
  assert.equal(combineZonedDateTime('2026-10-23', '18:00', 'UTC').toISOString(), '2026-10-23T18:00:00.000Z')
  assert.equal(combineZonedDateTime('2026-10-23', '18:00', 'America/New_York').toISOString(), '2026-10-23T22:00:00.000Z')
})

test('schedule respects winter offsets and fractional-hour zones', () => {
  assert.equal(combineZonedDateTime('2026-12-23', '18:00', 'Europe/Bucharest').toISOString(), '2026-12-23T16:00:00.000Z')
  assert.equal(combineZonedDateTime('2026-10-23', '00:00', 'Asia/Kolkata').toISOString(), '2026-10-22T18:30:00.000Z')
})

test('nonexistent DST time is rejected rather than silently rescheduled', () => {
  assert.equal(combineZonedDateTime('2026-03-29', '03:30', 'Europe/Bucharest'), null)
  assert.equal(combineZonedDateTime('2026-03-29', '04:30', 'Europe/Bucharest').toISOString(), '2026-03-29T01:30:00.000Z')
})

test('invalid calendar dates, times and zones are rejected', () => {
  for (const [date, time, zone] of [
    ['2026-02-31', '18:00', 'UTC'],
    ['2026-13-01', '18:00', 'UTC'],
    ['2026-10-23', '25:00', 'UTC'],
    ['2026-10-23', '18:61', 'UTC'],
    ['2026-10-23', '18:00', 'Invalid/Zone'],
    ['', '18:00', 'UTC']
  ]) assert.equal(combineZonedDateTime(date, time, zone), null)
})
