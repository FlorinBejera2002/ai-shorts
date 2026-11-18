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
const { transcriptApprovals, transcriptTimingProblem } = exports
const asset = {
  id: 'source-1',
  duration: 4,
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
      in: 2,
      out: 3,
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

test('explicit owner timing supports corrected word counts without normal text payload', () => {
  const timed = [
    { text: ' Corrected ', start: 2.05, end: 2.3 },
    { text: 'words', start: 2.4, end: 2.9 }
  ]
  const approved = transcriptApprovals(asset, ['proposal-2'], {}, { 'proposal-2': timed })
  assert.deepEqual(structuredClone(approved), [{
    asset_id: 'source-1', proposal_id: 'proposal-2', timing_confirmed: true,
    timed_words: [{ text: 'Corrected', start: 2.05, end: 2.3 }, { text: 'words', start: 2.4, end: 2.9 }]
  }])
  assert.equal('words' in approved[0], false)
  assert.equal(timed[0].text, ' Corrected ')
  assert.equal(transcriptApprovals(asset, [], {}, { 'proposal-2': timed }).length, 0,
    'Valid timing is not selected automatically')
})

test('manual timing rejects missing words, bad text, overlap and out-of-passage clocks', () => {
  const proposal = asset.transcript_proposals[1]
  const valid = [{ text: 'One', start: 2, end: 2.4 }, { text: 'two', start: 2.4, end: 3 }]
  assert.equal(transcriptTimingProblem(proposal, 4, valid), null)
  for (const words of [
    [], Array.from({ length: 501 }, () => valid[0]),
    [{ ...valid[0], text: ' ' }], [{ ...valid[0], text: 'bad\ntext' }],
    [{ ...valid[0], start: NaN }], [{ ...valid[0], end: Infinity }],
    [{ ...valid[0], start: 1.9 }], [{ ...valid[0], end: 3.1 }],
    [{ ...valid[0], end: 2 }], [valid[0], { ...valid[1], start: 2.3 }]
  ]) {
    assert.ok(transcriptTimingProblem(proposal, 4, words))
    assert.throws(() => transcriptApprovals(asset, ['proposal-2'], {}, { 'proposal-2': words }), /timing/)
  }
  assert.equal(transcriptTimingProblem(proposal, 2.8, valid), 'bounds')
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
