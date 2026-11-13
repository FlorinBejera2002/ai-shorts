import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { command, readConfig, sanitizer, traceSummary, videoFixture } from './hetzner-s3-helpers.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const target = process.argv[2]
assert.ok(target && /^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/.test(target), 'Pass an explicitly authorized SSH host or alias')
assert.ok(process.argv.slice(3).every(argument => argument === '--skip-bulk'), 'Unknown server smoke argument')
const skipBulk = process.argv.includes('--skip-bulk')
const contractSelection = skipBulk
  ? '^TestHetznerS3Compatibility$/(local_migration|private_signed|conditional_create)'
  : '^TestHetznerS3Compatibility$'
const config = await readConfig(), sanitize = sanitizer(config)
const ssh = ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ConnectTimeout=8', target]
const report = path.resolve(process.env.SNEEPCUT_HETZNER_REPORT_DIR || path.join(root, 'artifacts/hetzner-retest', `server-${Date.now()}`))
await mkdir(path.join(root, '.cache/tmp'), { recursive: true })
const scratch = await mkdtemp(path.join(root, '.cache/tmp/hetzner-server-'))
await chmod(scratch, 0o700)
try {
  await mkdir(report, { recursive: true, mode: 0o700 })
  const inspect = command('ssh', [...ssh, 'uname -m'], { cwd: root, timeout: 15000 })
  inspect.child.stdin.end()
  const architecture = await inspect.completed
  assert.equal(architecture.code, 0, 'SSH architecture check failed')
  const arch = { x86_64: 'amd64', aarch64: 'arm64' }[architecture.stdout.trim()]
  assert.ok(arch, 'Unsupported server architecture')
  console.log(`Preparing isolated linux/${arch} media test binary for ${target}`)
  const build = command('go', ['test', '-c', './internal/media', '-o', path.join(scratch, 'media.test')], {
    cwd: path.join(root, 'backend'), env: { ...process.env, GOOS: 'linux', GOARCH: arch, CGO_ENABLED: '0', GOCACHE: path.join(root, '.cache/go-build'), TMPDIR: scratch }, timeout: 180000,
  })
  build.child.stdin.end()
  const compiled = await build.completed
  if (compiled.code !== 0) console.error(sanitize(compiled.output))
  assert.equal(compiled.code, 0, 'Cross-compiling media tests failed')
  const video = await videoFixture(scratch, root)
  console.log(`Server test fixture: ${video.size} bytes; no app or database processes are started`)
  await writeFile(path.join(scratch, 'config.json'), JSON.stringify(config), { mode: 0o600 })
  await writeFile(path.join(scratch, 'run.py'), `import datetime, ipaddress, json, os, pathlib, subprocess, time
base=pathlib.Path(__file__).resolve().parent
cfg=json.loads((base/'config.json').read_text())
env=os.environ.copy()
env.update({'SNEEPCUT_HETZNER_SMOKE':'1','SNEEPCUT_HETZNER_REGION':cfg['region'],
 'SNEEPCUT_HETZNER_ENDPOINT':cfg['endpoint'],'SNEEPCUT_HETZNER_BUCKET':cfg['bucket'],
 'SNEEPCUT_HETZNER_CONFIRM_BUCKET':cfg['confirm_bucket'],
 'AWS_ACCESS_KEY_ID':cfg['access_key'],'AWS_SECRET_ACCESS_KEY':cfg['secret_key'],'AWS_SESSION_TOKEN':'',
 'SNEEPCUT_HETZNER_MANIFEST':'','SNEEPCUT_HETZNER_VIDEO_FIXTURE':str(base/'reference.mp4'),
 'SNEEPCUT_HETZNER_TRACE':str(base/'requests.jsonl'),'TMPDIR':str(base)})
metadata={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'client':'deployment-server','mode':'${skipBulk ? 'ordinary-only' : 'full'}'}
try:
 result=subprocess.run(['curl','-4','--fail','--silent','--max-time','5','https://ip.hetzner.com'],capture_output=True,text=True,timeout=8,check=True)
 metadata['reported_source_ip']=str(ipaddress.ip_address(result.stdout.strip()))
except Exception: metadata['reported_source_ip']='unavailable'
print('SERVER_METADATA '+json.dumps(metadata),flush=True)
${skipBulk ? "print('SKIP bulk pagination case (explicit troubleshooting option); this is not a full provider pass',flush=True)" : ''}
print('SETTLE waiting 60 seconds without test-bucket requests before video transfers',flush=True)
time.sleep(60)
exit_code=0
# Measure videos before the 1003-object burst so throttling from that burst
# cannot be mistaken for baseline video performance.
for selected in ${JSON.stringify(['^TestHetznerS3VideoTransfers$', contractSelection])}:
 result=subprocess.run([str(base/'media.test'),'-test.run='+selected,'-test.v','-test.timeout=8m'],env=env)
 if result.returncode: exit_code=1
trace=base/'requests.jsonl'
if trace.exists():
 for line in trace.read_text().splitlines(): print('TRACE '+line,flush=True)
raise SystemExit(exit_code)
`, { mode: 0o600 })
  // The archive contains a temporary executable, synthetic video and private
  // credentials. It is streamed over SSH and deleted by traps on both hosts.
  const remoteScript = `set -eu
umask 077
mkdir -p .cache/tmp
verification_root="$(mktemp -d .cache/tmp/sneepcut-s3-XXXXXX)"
trap 'rm -rf -- "$verification_root"' EXIT HUP INT TERM
tar -xf - -C "$verification_root"
python3 "$verification_root/run.py"`
  const remote = command('ssh', [...ssh, remoteScript], { cwd: root, timeout: 780000,
    onLine: line => { if (/=== RUN|--- PASS|--- FAIL|VIDEO_TRANSFER|synthetic object prefix|SERVER_METADATA|SETTLE|^SKIP/.test(line)) console.log(sanitize(line)) },
  })
  // Keep this stream binary; it must never pass through a text decoder/logger.
  const archive = spawn('tar', ['-cf', '-', '-C', scratch, 'media.test', 'reference.mp4', 'config.json', 'run.py'],
    { cwd: root, env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 })
  archive.stdout.pipe(remote.child.stdin)
  const archived = new Promise((resolve, reject) => { archive.once('error', reject); archive.once('close', resolve) })
  archived.catch(() => {})
  remote.child.stdin.on('error', () => archive.kill('SIGTERM'))
  const [packed, result] = await Promise.all([archived, remote.completed])
  assert.equal(packed, 0, 'Streaming the isolated test bundle failed')
  const lines = result.stdout.split('\n')
  const trace = lines.filter(line => line.startsWith('TRACE ')).map(line => line.slice(6)).join('\n')
  await writeFile(path.join(report, 'requests.jsonl'), trace ? trace + '\n' : '')
  await writeFile(path.join(report, 'run.log'), sanitize(result.output.split('\n').filter(line => !line.startsWith('TRACE ')).join('\n')))
  const summary = await traceSummary(path.join(report, 'requests.jsonl'))
  await writeFile(path.join(report, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log('Server wire diagnostics:', JSON.stringify({ attempts: summary.attempts, retriedAttempts: summary.retriedAttempts, statuses: summary.statuses, errors: summary.errors?.length, slowAttempts: summary.slowAttempts?.length }))
  console.log('Saved sanitized server report:', report)
  if (result.code !== 0) console.error(sanitize(result.output.split('\n').filter(line => !line.startsWith('TRACE ')).join('\n')))
  assert.equal(result.code, 0, 'Server media/storage verification failed')
} catch (error) {
  console.error(sanitize(error.message))
  process.exitCode = 1
} finally {
  await rm(scratch, { recursive: true, force: true })
}
