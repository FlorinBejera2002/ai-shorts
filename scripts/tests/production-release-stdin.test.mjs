import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Run with: node --test scripts/tests/production-release-stdin.test.mjs
// Docker is required. All mutations stay in network-isolated container tmpfs.
const runner = fileURLToPath(new URL('../production-release.sh', import.meta.url))
const image = process.env.RELEASE_TEST_IMAGE || 'node:22-bookworm-slim'
const releaseID = '2222222222222222'

function fixture(removeStdinProtection) {
  const setup = String.raw`
set -euo pipefail
command -v bash >/dev/null
command -v flock >/dev/null
export ACTION_LOG=/tmp/compose-actions
deploy_root=/srv/sneepcut
incoming_root=/srv/sneepcut.incoming
archive=/tmp/sneepcut-release-2222222222222222.tar.gz
mkdir -p "$deploy_root/scripts" "$incoming_root/scripts"
printf '1111111111111111\n' > "$deploy_root/.release-id"
printf '2222222222222222\n' > "$incoming_root/.release-id"
printf 'SYNTHETIC_ENV=deployment-test\n' > "$deploy_root/.env.production.local"
touch "$incoming_root/.built-all" "$archive"
cat > "$incoming_root/scripts/production-compose.sh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$DEPLOYMENT_VERSION" == 2222222222222222 ]]
[[ -f "$PRODUCTION_ENV_FILE" ]]
[[ "$(stat -c %a "$PRODUCTION_ENV_FILE")" == 600 ]]
printf '%s %s\n' "$1" "$2" >> "$ACTION_LOG"
case "$1" in
  # Compose config does not consume stdin. The migration run during deploy
  # does; draining it here reproduces the real SSH bash -s failure.
  deploy|verify) cat >/dev/null ;;
esac
MOCK
chmod +x "$incoming_root/scripts/production-compose.sh"
cp "$incoming_root/scripts/production-compose.sh" "$deploy_root/scripts/production-compose.sh"
cp /fixture/production-release.sh /tmp/runner.sh
`
  const removeProtection = removeStdinProtection
    ? String.raw`
# Remove only the run_at child redirection, retaining every other runner byte.
sed -i 's/"$current_component" <\/dev\/null$/"$current_component"/' /tmp/runner.sh
! grep -q '"$current_component" </dev/null' /tmp/runner.sh
`
    : String.raw`
grep -q '"$current_component" </dev/null' /tmp/runner.sh
`
  const run = String.raw`
# Feed the actual runner on stdin, matching ssh ... bash -s -- < runner.sh.
bash -s -- deploy all 2222222222222222 "$deploy_root" "$archive" < /tmp/runner.sh > /tmp/runner-output 2>&1
[[ "$(cat "$deploy_root/.release-id")" == 2222222222222222 ]]
[[ "$(cat "$deploy_root.previous/.release-id")" == 1111111111111111 ]]
[[ ! -e "$archive" && ! -e "$incoming_root" ]]
printf '%s\n' '---ACTIONS---'
cat "$ACTION_LOG"
printf '%s\n' '---OUTPUT---'
cat /tmp/runner-output
`
  const result = spawnSync('docker', [
    'run', '--rm', '--network', 'none', '--read-only',
    '--tmpfs', '/srv:rw,exec,nosuid,nodev,size=16m',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m',
    '--mount', `type=bind,source=${runner},target=/fixture/production-release.sh,readonly`,
    image, 'bash', '-euc', setup + removeProtection + run,
  ], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true })
  assert.ifError(result.error)
  assert.equal(result.status, 0, `Disposable release fixture failed:\n${result.stderr}\n${result.stdout}`)
  const [, actions, output] = result.stdout.split(/---ACTIONS---\r?\n|---OUTPUT---\r?\n/)
  assert.ok(actions !== undefined && output !== undefined, `Missing fixture evidence: ${result.stdout}`)
  return { actions: actions.trim().split(/\r?\n/), output }
}

test('SSH stdin deploy reaches verification and completion despite a child draining stdin', () => {
  const result = fixture(false)
  assert.deepEqual(result.actions, ['config all', 'deploy all', 'verify all'])
  assert.match(result.output, new RegExp(`Release ${releaseID} is active\\.`))
})

test('removing run_at stdin isolation reproduces the silent successful early exit', () => {
  const result = fixture(true)
  assert.deepEqual(result.actions, ['config all', 'deploy all'])
  assert.doesNotMatch(result.output, /is active\./)
})
