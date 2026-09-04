import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/lib/request-body.ts', import.meta.url),
  'utf8'
)
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const module = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
)

test('reads a bounded JSON request', async () => {
  const request = new Request('https://app.example/api', {
    method: 'POST',
    body: JSON.stringify({ fileName: 'clip.mp4' })
  })
  assert.deepEqual(await module.readBoundedJson(request, 128), {
    fileName: 'clip.mp4'
  })
})

test('rejects declared and streamed bodies above the limit', async () => {
  const declared = new Request('https://app.example/api', {
    method: 'POST',
    headers: { 'Content-Length': '100' },
    body: '{}'
  })
  await assert.rejects(
    module.readBoundedJson(declared, 10),
    module.RequestBodyTooLargeError
  )

  const streamed = new Request('https://app.example/api', {
    method: 'POST',
    body: JSON.stringify({ payload: 'x'.repeat(100) })
  })
  await assert.rejects(
    module.readBoundedJson(streamed, 10),
    module.RequestBodyTooLargeError
  )
})
