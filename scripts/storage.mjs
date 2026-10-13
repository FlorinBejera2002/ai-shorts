import { execFileSync } from 'node:child_process'
import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const MiB = 1024 ** 2
export const limits = { generated: 512 * MiB, cache: 3072 * MiB, total: 8192 * MiB }

// These contain rebuildable outputs only. Media, databases, tools, installed
// dependencies, evaluation runs and all Git history are deliberately absent.
const generatedRoots = [
  '.cache/tmp', '.cache/go-build', '.cache/go-build-carousel',
  '.cache/publishing-go-build', '.cache/workspace-agent/go-build',
  'frontend/test-results', 'test-results', 'frontend/dist', 'admin/dist',
  '.pytest_cache', '.ruff_cache',
]
const releaseArchive = /^\.cache\/(?:sneepcut-release-[a-f\d]+|production(?:-overlay)?-[a-f\d]+)\.tar\.gz$/

function within(relative, root) {
  return relative === root || relative.startsWith(root + '/')
}

export function generatedRoot(relative) {
  return generatedRoots.find(root => within(relative, root)) ||
    (releaseArchive.test(relative) ? relative : undefined)
}

function category(relative) {
  if (relative.split('/').includes('node_modules')) return 'Installed dependencies'
  if (within(relative, '.git')) return 'Project Git history'
  if (within(relative, '.editor-upstream-history')) return 'Optional upstream history'
  if (generatedRoot(relative)) return 'Regenerable outputs'
  if (within(relative, '.cache/toolchains') || within(relative, '.cache/tools')) return 'Native tools and models'
  if (within(relative, '.cache/go-mod')) return 'Go dependencies'
  if (within(relative, '.cache')) return 'Retained local data / needs review'
  return 'Source, fixtures and other files'
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative)
}

// Bound filesystem concurrency. Never follow junctions or symbolic links.
export async function inventory(root = repository, only = '') {
  const canonicalRoot = await realpath(root)
  const files = []
  const errors = []
  let skippedLinks = 0
  const first = path.resolve(canonicalRoot, only)
  if (only && !contained(canonicalRoot, first)) throw new Error('Scan escaped repository')
  const queue = [first]
  while (queue.length) {
    const batch = queue.splice(0, 64)
    await Promise.all(batch.map(async absolute => {
      const relative = path.relative(canonicalRoot, absolute).split(path.sep).join('/')
      try {
        const info = await lstat(absolute)
        if (info.isSymbolicLink()) { skippedLinks++; return }
        if (info.isDirectory()) {
          const children = await readdir(absolute)
          queue.push(...children.map(name => path.join(absolute, name)))
        } else if (info.isFile()) {
          files.push({ path: relative, bytes: info.size, modified: info.mtimeMs })
        }
      } catch (error) {
        // A missing scan root is normal; a disappearing/unreadable child is not.
        if (absolute !== first || error.code !== 'ENOENT') errors.push({ path: relative, code: error.code })
      }
    }))
  }
  return { root: canonicalRoot, files, errors, skippedLinks }
}

export function summarize(scan) {
  const categories = new Map()
  const targets = new Map()
  let totalBytes = 0
  let cacheBytes = 0
  for (const file of scan.files) {
    totalBytes += file.bytes
    if (within(file.path, '.cache')) cacheBytes += file.bytes
    const label = category(file.path)
    categories.set(label, (categories.get(label) || 0) + file.bytes)
    const target = generatedRoot(file.path)
    if (target) {
      const item = targets.get(target) || { path: target, bytes: 0, newest: 0, files: 0 }
      item.bytes += file.bytes
      item.newest = Math.max(item.newest, file.modified)
      item.files++
      targets.set(target, item)
    }
  }
  return {
    totalBytes, cacheBytes,
    generatedBytes: [...targets.values()].reduce((sum, item) => sum + item.bytes, 0),
    categories: [...categories].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes),
    targets: [...targets.values()].sort((a, b) => b.bytes - a.bytes),
    errors: scan.errors, skippedLinks: scan.skippedLinks,
  }
}

export function violations(report, budgets = limits) {
  const result = []
  for (const [key, actual] of [['generated', report.generatedBytes], ['cache', report.cacheBytes], ['total', report.totalBytes]]) {
    if (actual > budgets[key]) result.push(`${key}: ${formatBytes(actual)} exceeds ${formatBytes(budgets[key])}`)
  }
  if (report.errors.length) result.push(`Incomplete scan: ${report.errors.length} unreadable paths`)
  return result
}

// Validate the entire deletion plan before mutating anything. Git's tracked file
// list is obtained afresh, and every ancestor is checked for links/containment.
export async function clean(root, targets, { apply = false, tracked } = {}) {
  const canonicalRoot = await realpath(root)
  const trackedPaths = tracked ?? execFileSync('git', ['ls-files', '-z'], {
    cwd: canonicalRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * MiB,
  }).split('\0').filter(Boolean)
  const plan = []
  for (const target of targets) {
    if (generatedRoot(target.path) !== target.path) throw new Error(`Protected cleanup target: ${target.path}`)
    const absolute = path.resolve(canonicalRoot, target.path)
    if (!contained(canonicalRoot, absolute)) throw new Error('Cleanup escaped repository')
    if (trackedPaths.some(file => within(file, target.path))) throw new Error(`Tracked files in ${target.path}`)
    const parts = path.relative(canonicalRoot, absolute).split(path.sep)
    let ancestor = canonicalRoot
    for (const part of parts) {
      ancestor = path.join(ancestor, part)
      if ((await lstat(ancestor)).isSymbolicLink()) throw new Error(`Linked cleanup path: ${target.path}`)
    }
    const scan = await inventory(canonicalRoot, target.path)
    if (scan.skippedLinks || scan.errors.length) throw new Error(`Unsafe or unreadable cleanup target: ${target.path}`)
    plan.push({ ...target, absolute })
  }
  if (apply) {
    for (const target of plan) await rm(target.absolute, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 })
  }
  return plan.map(({ absolute, ...target }) => target)
}

function formatBytes(bytes) { return `${(bytes / MiB).toFixed(1)} MiB` }

async function main(args) {
  const supported = new Set(['--check', '--clean', '--apply', '--json', '--help'])
  if (args.some(arg => !supported.has(arg))) throw new Error('Unknown option; use --help')
  if (args.includes('--apply') && !args.includes('--clean')) throw new Error('--apply requires --clean')
  if (args.includes('--help')) {
    console.log('node scripts/storage.mjs [--check] [--json] [--clean [--apply]]\nDefault: report only. --clean previews an allowlisted plan; --apply deletes it.\nLimits: generated 512 MiB, all .cache 3072 MiB, repository 8192 MiB.\nStop local tests/builds before applying cleanup. Git history, media, tools and dependencies are protected.')
    return
  }
  const report = summarize(await inventory())
  if (report.errors.length && args.includes('--clean')) throw new Error('Cannot clean after an incomplete scan')
  if (args.includes('--clean')) {
    const plan = await clean(repository, report.targets, { apply: args.includes('--apply') })
    console.log(JSON.stringify({ applied: args.includes('--apply'), targets: plan }, null, 2))
    return
  }
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Repository: ${formatBytes(report.totalBytes)}; .cache: ${formatBytes(report.cacheBytes)}; regenerable: ${formatBytes(report.generatedBytes)}`)
    for (const item of report.categories) console.log(`  ${formatBytes(item.bytes).padStart(12)}  ${item.name}`)
    console.log(`Skipped ${report.skippedLinks} links. Logical file sizes; external Docker volumes are excluded.`)
  }
  const failures = violations(report)
  for (const failure of failures) console.error(failure)
  if (args.includes('--check') && failures.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
}
