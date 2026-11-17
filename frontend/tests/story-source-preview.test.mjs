import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

let state
const imports = {
  react: {
    useState: (initial) => {
      if (state === undefined) state = initial
      return [
        state,
        (next) => {
          state = typeof next === 'function' ? next(state) : next
        }
      ]
    }
  },
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': { FileVideo: 'svg' },
  '@/lib/youtube': { formatDuration: (seconds) => `${seconds}s` },
  './use-story-language': { useStoryLanguage: () => (english) => english }
}
const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL(
        '../src/components/story/story-source-preview.tsx',
        import.meta.url
      ),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText,
  {
    exports,
    require: (name) => {
      if (!(name in imports)) throw Error(`Unexpected import ${name}`)
      return imports[name]
    }
  }
)

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}

test('source preview falls back from a failed thumbnail and media to a neutral placeholder without retrying broken URLs', () => {
  state = undefined
  const tree = exports.StorySourcePreview({
    assets: [
      {
        id: 'source-a',
        name: 'source.mp4',
        duration: 12,
        thumbnail_url: '/synthetic-thumbnail',
        proxy_url: '/synthetic-proxy'
      }
    ]
  })
  const frame = nodes(tree).find((node) => typeof node.type === 'function')
  state = undefined
  const image = frame.type(frame.props)
  assert.equal(image.type, 'img')
  assert.equal(image.props.src, '/synthetic-thumbnail')
  image.props.onError()
  const video = frame.type(frame.props)
  assert.equal(video.type, 'video')
  assert.equal(video.props.src, '/synthetic-proxy')
  video.props.onError()
  const fallback = frame.type(frame.props)
  assert.equal(fallback.type, 'div')
  assert.ok(
    nodes(fallback).some((node) => node.props?.children === 'No preview')
  )
  assert.equal(frame.type(frame.props).type, 'div')
})

test('large projects keep preview media bounded and never autoplay or expose generation controls', () => {
  state = undefined
  const tree = exports.StorySourcePreview({
    assets: Array.from({ length: 250 }, (_, i) => ({
      id: `source-${i}`,
      name: `clip-${i}.mp4`,
      duration: 12,
      source_url: `/synthetic-${i}`
    }))
  })
  const buttons = nodes(tree).filter((node) => node.type === 'button')
  assert.equal(buttons.length, 6)
  assert.ok(buttons.every((node) => node.props.type === 'button'))
  assert.equal(
    nodes(tree).filter((node) => typeof node.type === 'function').length,
    7
  )
})
