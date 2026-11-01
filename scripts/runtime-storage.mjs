import { execFileSync } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const repository = fileURLToPath(new URL('../', import.meta.url))
const helperImage = 'alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f'
const markerName = '.sneepcut-runtime.json'
const directories = [
  ['media', 10001], ['studio', 1000], ['seaweedfs', 1000],
  ['tmp/backend', 10001], ['tmp/worker', 10001], ['tmp/studio', 1000],
  ['tmp/nginx', 10001], ['tmp/admin', 10001], ['tmp/frontend', 1000], ['tmp/seaweedfs', 1000],
  ['cache/go-build', 10001], ['cache/frontend', 1000], ['cache/admin', 1000]
]
const legacyStores = [
  { directory: 'media', suffix: 'media_data' },
  { directory: 'studio', suffix: 'studio_data' },
  { directory: 'seaweedfs', suffix: 'seaweedfs_data' }
]
const consumers = ['backend', 'worker', 'studio', 'nginx', 'frontend', 'admin', 'seaweedfs']
const composeFiles = ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']

function within(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function runtimeDirectory(root, configured) {
  const directory = path.resolve(root, configured || '../ai-shorts-runtime')
  if (within(root, directory) || within(directory, root) || directory.includes(','))
    throw new Error('Runtime storage must be outside the checkout, must not contain it, and cannot include commas')
  return directory
}

async function readMarker(directory) {
  try {
    const marker = JSON.parse(await readFile(path.join(directory, markerName), 'utf8'))
    if (marker.version !== 1 || marker.state !== 'ready') throw new Error('Runtime migration is incomplete')
    return marker
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function validateRuntimePath(directory) {
  // Check the nearest existing parent too, so a symlink cannot redirect a new root.
  let existing = directory
  for (;;) {
    try {
      if ((await lstat(existing)).isSymbolicLink() || (await realpath(existing)) !== existing)
        throw new Error('Runtime root must use its canonical path without symbolic links')
      if (!(await lstat(existing)).isDirectory()) throw new Error('Runtime root must be a directory')
      return
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      existing = path.dirname(existing)
    }
  }
}

async function checkDestination(directory) {
  try {
    if ((await readdir(directory)).length) throw new Error('Unmarked runtime destination is not empty; refusing to merge or overwrite files')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function docker(args, root, options = {}) {
  return execFileSync('docker', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function volumeExists(name, root) {
  try {
    docker(['volume', 'inspect', name], root)
    return true
  } catch (error) {
    // Distinguish an absent legacy volume from an inaccessible Docker daemon.
    docker(['info', '--format', '{{.ServerVersion}}'], root)
    if (!String(error.stderr).toLowerCase().includes('no such volume')) throw error
    return false
  }
}

export async function copyAndVerifyVolume(volume, destination, root = repository) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(volume)) throw new Error('Invalid source volume')
  if (destination.includes(',')) throw new Error('Copy destination cannot include commas')
  await validateRuntimePath(destination)
  if (!volumeExists(volume, root)) throw new Error(`Source volume is missing: ${volume}`)
  await mkdir(destination, { recursive: true, mode: 0o750 })
  if ((await lstat(destination)).isSymbolicLink() || (await readdir(destination)).length)
    throw new Error('Copy destination must be an empty regular directory')
  const result = docker([
    'run', '--rm', '--read-only', '--network', 'none',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=32m',
    '--mount', `type=volume,source=${volume},target=/source,readonly`,
    '--mount', `type=bind,source=${destination},target=/destination`,
    helperImage, 'sh', '-ec', `
      set -o pipefail
      test -z "$(find /destination -mindepth 1 -print -quit)"
      cp -a /source/. /destination/
      for root in source destination; do
        (cd /$root && find . -print0 | sort -z) > /tmp/$root.paths
        (cd /$root && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > /tmp/$root.hashes
        (cd /$root && find . -type l -print0 | sort -z | xargs -0 -r sh -c 'for item do printf "%s\\0" "$item"; readlink -n "$item"; printf "\\0"; done' sh) > /tmp/$root.links
      done
      cmp /tmp/source.paths /tmp/destination.paths
      cmp /tmp/source.hashes /tmp/destination.hashes
      cmp /tmp/source.links /tmp/destination.links
      printf 'Verified files: '
      find /source -type f -print0 | tr -cd '\\000' | wc -c
    `
  ], root)
  return result.trim()
}

async function prepareDirectories(directory, root) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  for (const [name] of directories) {
    const child = path.join(directory, name)
    await validateRuntimePath(child)
    await mkdir(child, { recursive: true, mode: 0o750 })
  }
  // Docker Desktop maps these files to the host user; Linux retains service UIDs.
  // Fix only top-level mount points, never recursively rewrite project files.
  docker([
    'run', '--rm', '--read-only', '--network', 'none',
    '--mount', `type=bind,source=${directory},target=/runtime`,
    helperImage, 'sh', '-ec', directories.map(([name, uid]) =>
      `chown ${uid}:${uid} /runtime/${name} && chmod ${name.startsWith('tmp/') ? '1770' : '0750'} /runtime/${name}`
    ).join('\n')
  ], root)
}

export async function configureRuntime(command, root = repository) {
  if (!['init', 'migrate'].includes(command)) throw new Error('Use runtime-storage.mjs init or migrate')
  let settings = {}
  try { settings = parseEnv(await readFile(path.join(root, '.env'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const configured = { ...settings, ...process.env }
  const destination = runtimeDirectory(root, configured.SNEEPCUT_RUNTIME_ROOT)
  await validateRuntimePath(destination)
  const compose = JSON.parse(docker(['compose', ...composeFiles, 'config', '--format', 'json', '--no-env-resolution'], root))
  const project = compose.name
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error('Invalid Compose project name')
  const marker = await readMarker(destination)
  if (marker) {
    if (marker.project !== project) throw new Error('Runtime directory belongs to another Compose project')
    await prepareDirectories(destination, root)
    console.log(`Runtime storage is ready: ${destination}`)
    return
  }
  await checkDestination(destination)
  const sources = legacyStores.map(store => ({ ...store, volume: `${project}_${store.suffix}` }))
    .filter(store => volumeExists(store.volume, root))
  if (command === 'init' && sources.length)
    throw new Error('Legacy runtime volumes exist. Run make runtime-migrate before starting the relocated stack.')
  if (command === 'migrate') {
    console.log(`Relocating ${sources.length} stores into ${destination}`)
    console.log('Stopping file writers; PostgreSQL and Redis are not changed.')
    docker(['compose', ...composeFiles, 'stop', ...consumers], root, { stdio: 'inherit' })
  }
  await mkdir(destination, { recursive: true, mode: 0o700 })
  for (const source of sources) {
    const result = await copyAndVerifyVolume(source.volume, path.join(destination, source.directory), root)
    console.log(`${source.directory}: ${result}`)
  }
  await prepareDirectories(destination, root)
  await writeFile(path.join(destination, markerName), JSON.stringify({
    version: 1, state: 'ready', project, createdAt: new Date().toISOString(),
    sources: sources.map(source => ({ volume: source.volume, directory: source.directory }))
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(`Runtime storage is ready: ${destination}`)
  if (sources.length) console.log('Legacy volumes are retained and detached after startup; no source data was deleted.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2] || 'init'
  if (!['init', 'migrate'].includes(command)) throw new Error('Use runtime-storage.mjs init or migrate')
  configureRuntime(command).catch(error => { console.error(error.message); process.exitCode = 1 })
}
