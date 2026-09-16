import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))

function collectTsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(path)
    return extname(entry.name) === '.tsx' ? [path] : []
  })
}

test('uses the shared branded asset for every loading indicator', () => {
  const loadingIndicator = readFileSync(
    new URL('../src/components/ui/loading-indicator.tsx', import.meta.url),
    'utf8'
  )
  assert.match(
    loadingIndicator,
    /src="\/brand\/sneepcut-cyber-hud-loader\.svg"/
  )
  assert.doesNotMatch(loadingIndicator, /dark:invert/)

  for (const file of collectTsxFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /\bLoader(?:2|Circle)\b/, file)
    assert.doesNotMatch(source, /\banimate-spin\b/, file)
  }
})

test('routes full-page loading states through the shared indicator', () => {
  for (const relativePath of [
    '../src/components/shared/api-state.tsx',
    '../src/components/ui/page-loading.tsx'
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.match(source, /<LoadingIndicator\b/, relativePath)
    assert.match(source, /size-36/, relativePath)
  }

  const apiState = readFileSync(
    new URL('../src/components/shared/api-state.tsx', import.meta.url),
    'utf8'
  )
  assert.match(apiState, /min-h-svh place-items-center/)
  assert.match(apiState, /className="sr-only"/)
})
