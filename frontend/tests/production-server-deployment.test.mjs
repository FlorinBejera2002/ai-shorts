import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
    /api\.sneepcut\.com \{[\s\S]*reverse_proxy nginx:80/
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

test('the production proxy trust chain uses matching fixed addresses', () => {
  const nginx = readFileSync('../deploy/nginx.production.conf', 'utf8')

  assert.match(compose, /TRUSTED_PROXY_CIDRS: 172\.30\.94\.253\/32/)
  assert.match(compose, /ipv4_address: 172\.30\.94\.253/)
  assert.match(compose, /ipv4_address: 172\.30\.94\.254/)
  assert.match(nginx, /set_real_ip_from 172\.30\.94\.254;/)
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
