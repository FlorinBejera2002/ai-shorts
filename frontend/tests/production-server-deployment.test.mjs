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

  assert.match(frontend, /GO_API_URL: http:\/\/backend-go:8080/)
  assert.match(frontend, /NEXT_PUBLIC_APP_URL: https:\/\/sneepcut\.com/)
  assert.match(
    frontend,
    /NEXT_PUBLIC_UPLOAD_URL: https:\/\/api\.sneepcut\.com\/api\/upload\/direct/
  )
  assert.doesNotMatch(frontend, /env_file:/)
  assert.doesNotMatch(frontend, /DATABASE_URL|JWT_SECRET|INTERNAL_API_KEY/)
})

test('Caddy routes the public frontend and API hostnames separately', () => {
  assert.match(
    caddy,
    /sneepcut\.com, www\.sneepcut\.com \{[\s\S]*reverse_proxy frontend:3000/
  )
  assert.match(
    caddy,
    /api\.sneepcut\.com \{[\s\S]*reverse_proxy nginx:80/
  )
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

test('deployment commands reject path traversal before connecting to a host', () => {
  const bash = process.env.BASH_BINARY || 'bash'
  const localResult = spawnSync(bash, ['../scripts/deploy.sh', 'status', 'all'], {
    env: {
      ...process.env,
      DEPLOY_ROOT: '/opt/sneepcut/..',
      DEPLOY_HOST: 'must-not-connect'
    },
    encoding: 'utf8'
  })
  const remoteResult = spawnSync(
    bash,
    ['../scripts/production-release.sh', 'status', 'all', 'manual', '/srv/sneepcut/..', ''],
    { encoding: 'utf8' }
  )

  assert.equal(localResult.status, 2)
  assert.match(localResult.stderr, /DEPLOY_ROOT must be a specific path/)
  assert.equal(remoteResult.status, 2)
  assert.match(remoteResult.stderr, /Unsafe deployment root/)
})
