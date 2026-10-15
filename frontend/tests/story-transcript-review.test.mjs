import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        '../src/components/story/story-transcript-model.ts',
        import.meta.url
      ),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText,
  { exports }
)
const { transcriptApprovals } = exports
const asset = {
  id: 'source-1',
  transcript_proposals: [
    {
      id: 'proposal-1',
      timing_verified: true,
      words: [
        { text: 'helo', start: 1, end: 1.2 },
        { text: 'world', start: 1.3, end: 1.8 }
      ]
    },
    {
      id: 'proposal-2',
      timing_verified: false,
      words: [{ text: 'uncertain', start: 2, end: 2.4 }]
    }
  ]
}

test('review submits explicit selected text only, never client timing or other proposals', () => {
  const reviews = transcriptApprovals(asset, ['proposal-1'], {
    'proposal-1': [' Hello ', 'world!']
  })
  assert.deepEqual(structuredClone(reviews), [
    {
      asset_id: 'source-1',
      proposal_id: 'proposal-1',
      words: ['Hello', 'world!']
    }
  ])
  assert.equal(JSON.stringify(reviews).includes('start'), false)
  assert.equal(asset.transcript_proposals[0].words[0].text, 'helo')
  assert.equal(transcriptApprovals(asset, [], {}).length, 0)
})

test('unverified timing, absent proposals, removed words and empty text cannot be approved', () => {
  assert.throws(
    () => transcriptApprovals(asset, ['proposal-2'], {}),
    /verified word timing/
  )
  assert.throws(
    () => transcriptApprovals(asset, ['absent'], {}),
    /verified word timing/
  )
  assert.throws(
    () =>
      transcriptApprovals(asset, ['proposal-1'], { 'proposal-1': ['Hello'] }),
    /every word/
  )
  assert.throws(
    () =>
      transcriptApprovals(asset, ['proposal-1'], {
        'proposal-1': ['Hello', ' ']
      }),
    /every word/
  )
})
