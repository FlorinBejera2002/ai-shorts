import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import test from 'node:test'

const compose = readFileSync('../docker-compose.production.yml', 'utf8')
const caddy = readFileSync('../deploy/Caddyfile', 'utf8')
const makefile = readFileSync('../Makefile', 'utf8')
const releaseScript = readFileSync('../scripts/production-release.sh', 'utf8')

test('production frontend is built for the server without backend secrets', () => {
  const frontend = compose.slice(
    compose.indexOf('\n  frontend:'),
    compose.indexOf('\n  nginx:')
  )


  assert.match(frontend, /VITE_APP_URL: https:\/\/sneepcut\.com/)
  assert.match(frontend, /VITE_STUDIO_URL: https:\/\/studio\.sneepcut\.com/)
  assert.doesNotMatch(frontend, /env_file:/)
  assert.doesNotMatch(frontend, /DATABASE_URL|JWT_SECRET|INTERNAL_API_KEY/)
})

test('Caddy routes the public frontend and API hostnames separately', () => {
  assert.match(
    caddy,
    /sneepcut\.com, www\.sneepcut\.com \{[\s\S]*reverse_proxy frontend:8080/
  )
  assert.match(
    caddy,
    /api\.sneepcut\.com \{[\s\S]*reverse_proxy nginx-gateway:80/
  )
})

test('production frontend runs nginx without root or Linux capabilities', () => {
  const frontend = compose.slice(
    compose.indexOf('\n  frontend:'),
    compose.indexOf('\n  nginx:')
  )

  assert.match(frontend, /user: "101:101"/)
  assert.match(frontend, /read_only: true/)
  assert.match(frontend, /\/var\/cache\/nginx:uid=101,gid=101,mode=0750/)
  assert.match(frontend, /\/var\/run:uid=101,gid=101,mode=0750/)
  assert.match(frontend, /http:\/\/127\.0\.0\.1:8080\//)
  assert.match(frontend, /cap_drop: \["ALL"\]/)
})

test('admin deployment isolates the UI and reuses the main authentication origin', () => {
  const admin = compose.slice(compose.indexOf('\n  admin:'), compose.indexOf('\n  nginx:'))
  assert.ok(admin.includes('VITE_API_URL: https://sneepcut.com'))
  assert.ok(admin.includes('read_only: true'))
  assert.ok(admin.includes('cap_drop: ["ALL"]'))
  for (const forbidden of ['env_file:', 'ports:', 'JWT_SECRET', 'DATABASE_URL']) {
    assert.ok(!admin.includes(forbidden), forbidden)
  }
  assert.ok(compose.split(String.fromCharCode(10)).some(line => line.includes('CORS_ORIGINS:') && line.includes('https://admin.sneepcut.com')))
  const adminHost = caddy.slice(caddy.indexOf('admin.sneepcut.com {'))
  assert.ok(adminHost.includes('X-Robots-Tag "noindex, nofollow"'))
  assert.ok(adminHost.includes('reverse_proxy admin:8080'))
  assert.ok(adminHost.includes('header_up Host api.sneepcut.com'))
  const workflow = readFileSync('../scripts/production-compose.sh', 'utf8')
  assert.ok(workflow.includes('https://admin.sneepcut.com/api/admin/users'))
})

test('the production proxy trust chain uses matching fixed addresses', () => {
  const nginx = readFileSync('../deploy/nginx.production.conf', 'utf8')

  assert.match(compose, /TRUSTED_PROXY_CIDRS: 172\.30\.94\.253\/32/)
  assert.match(compose, /ipv4_address: 172\.30\.94\.253/)
  assert.match(compose, /ipv4_address: 172\.30\.94\.254/)
  assert.match(nginx, /set_real_ip_from 172\.30\.94\.254;/)
  assert.match(nginx, /server backend-gateway:8080;/)
  assert.match(compose, /default:\s+aliases: \[backend-gateway\]/)
  assert.match(compose, /ipv4_address: 172\.30\.94\.253\s+aliases: \[nginx-gateway\]/)
})

test('Makefile exposes full and component deployment commands', () => {
  for (const target of [
    'prod-build',
    'prod-build-backend',
    'prod-build-frontend',
    'prod-build-api',
    'prod-build-workers',
    'prod-build-gateway',
    'deploy',
    'deploy-backend',
    'deploy-frontend',
    'deploy-api',
    'deploy-workers',
    'deploy-gateway',
    'rollback'
  ]) {
    assert.match(makefile, new RegExp(`^${target}:`, 'm'))
  }
})

test('release rotation retains exactly one previous application checkout', () => {
  assert.match(releaseScript, /previous_root="\$\{deploy_root\}\.previous"/)
  assert.match(releaseScript, /rm -rf -- "\$previous_root"/)
  assert.doesNotMatch(releaseScript, /previous_root=.*timestamp|releases\//)
  assert.doesNotMatch(releaseScript, /docker image prune/)
})

test('deployment commands reject path traversal before connecting to a host', { skip: process.platform === 'win32' && !process.env.BASH_BINARY ? 'Requires native Bash; WSL launcher is not a test shell' : false }, () => {
  const bash = process.env.BASH_BINARY || 'bash'
  const localResult = spawnSync(bash, ['../scripts/deploy.sh', 'status', 'all'], {
    env: {
      ...process.env,
      DEPLOY_ROOT: '/opt/sneepcut/..',
      DEPLOY_HOST: 'must-not-connect'
    },
    encoding: 'utf8', timeout: 10000
  })
  const remoteResult = spawnSync(
    bash,
    ['../scripts/production-release.sh', 'status', 'all', 'manual', '/srv/sneepcut/..', ''],
    { encoding: 'utf8', timeout: 10000 }
  )

  assert.equal(localResult.status, 2)
  assert.match(localResult.stderr, /DEPLOY_ROOT must be a specific path/)
  assert.equal(remoteResult.status, 2)
  assert.match(remoteResult.stderr, /Unsafe deployment root/)
})

const requiresBash = process.platform === 'win32' && !process.env.BASH_BINARY
  ? 'Requires native Bash; WSL launcher is not a test shell'
  : false

function validateProxyFixture({ caddyId = '', configSource = '', privateImport = false, inspectFails = false } = {}) {
  const scratchRoot = resolve('../.cache/tmp')
  mkdirSync(scratchRoot, { recursive: true })
  const fixture = mkdtempSync(join(scratchRoot, 'deploy-validation-'))
  try {
    mkdirSync(join(fixture, 'scripts'))
    mkdirSync(join(fixture, 'deploy'))
    writeFileSync(join(fixture, 'scripts/production-compose.sh'), readFileSync('../scripts/production-compose.sh'))
    writeFileSync(join(fixture, '.env.production.local'), '# Synthetic fixture; no production credentials.\n')
    writeFileSync(join(fixture, 'docker-compose.production.yml'), 'name: synthetic\nservices: {}\n')
    writeFileSync(join(fixture, 'deploy/Caddyfile'), privateImport
      ? ':8080 {\n import /config/private-bridge.caddy\n}\n'
      : ':8080 {\n respond "fixture"\n}\n')
    const dockerLog = join(fixture, 'docker.log')
    const result = spawnSync(process.env.BASH_BINARY || 'bash', ['--noprofile', '--norc', '-c', `
docker() {
  printf '%s\\0' "$@" >> "$MOCK_DOCKER_LOG"
  printf '\\n' >> "$MOCK_DOCKER_LOG"
  case "$1" in
    compose)
      if [[ " $* " == *" ps --all --quiet caddy "* ]]; then
        printf '%s\\n' "$MOCK_CADDY_ID"
      fi
      ;;
    inspect)
      if [[ "$MOCK_INSPECT_FAILS" == 1 ]]; then return 1; fi
      printf '%s\\n' "$MOCK_CONFIG_SOURCE"
      ;;
    run)
      if [[ "$MOCK_PRIVATE_IMPORT" == 1 ]]; then
        local mounted=false
        for argument in "$@"; do
          if [[ -n "$MOCK_CONFIG_SOURCE" && "$argument" == "$MOCK_CONFIG_SOURCE:/config:ro" ]]; then mounted=true; fi
        done
        if [[ "$mounted" != true ]]; then
          echo 'File to import not found: /config/private-bridge.caddy' >&2
          return 1
        fi
      fi
      ;;
    *) echo 'Unexpected Docker action' >&2; return 99 ;;
  esac
}
export -f docker
exec "$BASH" "$MOCK_COMPOSE_SCRIPT" config all
`], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        MOCK_COMPOSE_SCRIPT: join(fixture, 'scripts/production-compose.sh').replaceAll('\\', '/'),
        MOCK_DOCKER_LOG: dockerLog.replaceAll('\\', '/'),
        MOCK_CADDY_ID: caddyId,
        MOCK_CONFIG_SOURCE: configSource,
        MOCK_PRIVATE_IMPORT: privateImport ? '1' : '0',
        MOCK_INSPECT_FAILS: inspectFails ? '1' : '0'
      }
    })
    const calls = readFileSync(dockerLog, 'utf8').trimEnd().split('\n').map(line => line.split('\0').filter(Boolean))
    return { ...result, calls, fixture }
  } finally {
    // fixture is an explicitly created child of the workspace scratch root.
    assert.ok(fixture.startsWith(scratchRoot + (process.platform === 'win32' ? '\\' : '/')))
    rmSync(fixture, { recursive: true, force: true })
  }
}

test('proxy validation uses private runtime config read-only with the incoming Caddyfile', { skip: requiresBash }, () => {
  for (const configSource of ['synthetic_caddy_config', '/srv/private/caddy']) {
    const result = validateProxyFixture({ caddyId: 'synthetic-caddy', configSource, privateImport: true })
    assert.equal(result.status, 0, result.stderr)
    const inspect = result.calls.find(call => call[0] === 'inspect')
    assert.ok(inspect.includes('synthetic-caddy'))
    assert.ok(inspect.some(argument => argument.includes('.Mounts') && argument.includes('"/config"')))
    assert.ok(!inspect.some(argument => argument.includes('.Config.Env')))
    const run = result.calls.find(call => call[0] === 'run')
    assert.ok(run.includes(`${configSource}:/config:ro`))
    assert.equal(run[run.indexOf('--network') + 1], 'none')
    assert.ok(run.some(argument => argument.endsWith('/deploy/Caddyfile:/etc/caddy/Caddyfile:ro')))
    assert.ok(run.includes('validate'))
    assert.ok(!run.includes('--volumes-from'))
    assert.ok(!run.some(argument => argument.includes(':/data')))
  }
})

test('first proxy deployment validates without a runtime config container', { skip: requiresBash }, () => {
  const result = validateProxyFixture()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.calls.some(call => call[0] === 'inspect'))
  const run = result.calls.find(call => call[0] === 'run')
  assert.equal(run[run.indexOf('--network') + 1], 'none')
  assert.ok(!run.some(argument => argument.endsWith(':/config:ro')))
})

test('missing private proxy config fails validation before deployment', { skip: requiresBash }, () => {
  const result = validateProxyFixture({ privateImport: true })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /File to import not found/)
  assert.match(result.stderr, /Provision private \/config imports/)
  assert.ok(!result.calls.some(call => call.includes('up') || call.includes('build')))
})

test('an unreadable existing proxy mount fails closed before validation', { skip: requiresBash }, () => {
  const result = validateProxyFixture({ caddyId: 'synthetic-caddy', inspectFails: true })
  assert.equal(result.status, 1)
  assert.ok(!result.calls.some(call => call[0] === 'run'))
})
