import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Vite keeps dedicated brand, billing and Studio routes', () => {
  const routes = read('../src/App.tsx')
  assert.match(routes, /path="brand" element=\{<Brand \/>\}/)
  assert.match(routes, /path="billing" element=\{<Billing \/>\}/)
  assert.match(routes, /path="studio" element=\{<StudioRoute \/>\}/)
  assert.match(read('../src/pages/studio-route.tsx'), /search\.get\('clip'\)/)
  assert.doesNotMatch(routes, /settings\?tab=(brand|billing)/)
})

test('public legal routes remain available in the Vite router', () => {
  const routes = read('../src/routing/legal-documents.ts')
  for (const name of ['ACCEPTABLE_USE_COPY','COOKIE_POLICY_COPY','DPA_COPY','LEGAL_NOTICE_COPY','REFUND_POLICY_COPY','SUBPROCESSORS_COPY']) {
    assert.ok(routes.includes(name), name)
  }
  assert.match(read('../src/App.tsx'), /additionalLegalPaths\.map/)
})

test('production preserves API routing and does not cache SPA HTML forever', () => {
  const caddy = read('../../deploy/Caddyfile')
  assert.match(caddy, /path \/api\/\* \/v1\/\* \/media\/\*/)
  assert.match(caddy, /reverse_proxy frontend:80/)
  const dockerfile = read('../Dockerfile')
  assert.match(dockerfile, /location \/ \{\s*add_header Cache-Control "no-cache"/)
  assert.match(dockerfile, /location \/assets\/ \{\s*try_files \$uri =404/)
})

test('transport preserves native response bodies and clears account-scoped cache', () => {
  const auth = read('../src/lib/auth.ts')
  assert.match(auth, /fetch\(\.\.\.args\)/)
  assert.match(auth, /userId !== cachedUserId[\s\S]*queryClient\.clear\(\)/)
  assert.doesNotMatch(auth, /timeout:\s*15_000|JSON\.stringify\(response\.data\)/)
})

test('development proxy serves Vite modules with the public host', () => {
  const nginx = read('../../nginx/nginx.conf')
  const modules = nginx.match(/location \^~ \/node_modules\/ \{([^}]+)\}/)?.[1]
  assert.ok(modules, 'Vite dependency paths must bypass the dotfile rule')
  assert.match(modules, /proxy_pass http:\/\/frontend/)
  assert.match(modules, /proxy_set_header Host \$http_host/)
  assert.doesNotMatch(nginx, /location ~\*.*js\|css/)
  assert.match(read('../../docker-compose.dev.yml'), /command: pnpm dev --host --port 80/)
})
