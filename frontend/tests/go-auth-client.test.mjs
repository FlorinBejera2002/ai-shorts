import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const source = readFileSync(
  new URL('../src/lib/auth-client.ts', import.meta.url),
  'utf8'
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const { createAuthClient } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const user = {
  id: 'fixture-user',
  email: 'fixture@example.test',
  name: 'Fixture'
}
const success = (token) => Response.json({ access_token: token, user })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('startup refresh coalesces concurrent requests and sends cookies plus memory bearer', async () => {
  const pending = deferred()
  let refreshes = 0
  const headers = []
  const client = createAuthClient(async (path, options) => {
    assert.equal(options.credentials, 'include')
    if (path.endsWith('/refresh')) {
      refreshes++
      await pending.promise
      return success('first')
    }
    headers.push(options.headers.get('Authorization'))
    return Response.json({ ok: true })
  })
  const requests = [
    client.apiFetch('/api/jobs'),
    client.apiFetch('/api/clips'),
    client.refresh()
  ]
  pending.resolve()
  await Promise.all(requests)
  assert.equal(refreshes, 1)
  assert.deepEqual(headers, ['Bearer first', 'Bearer first'])
  assert.equal(client.getSnapshot().status, 'authenticated')
})

test('concurrent expired access responses share one refresh and preserve mutation body', async () => {
  let refreshes = 0
  let calls = 0
  const client = createAuthClient(async (path, options) => {
    if (path.endsWith('/login')) return success('old')
    if (path.endsWith('/refresh')) {
      refreshes++
      return success('new')
    }
    calls++
    assert.equal(options.method, 'PATCH')
    assert.equal(options.body, '{"title":"updated"}')
    return options.headers.get('Authorization') === 'Bearer old'
      ? new Response(null, { status: 401 })
      : Response.json({ ok: true })
  })
  await client.login(user.email, 'fixture')
  const requests = await Promise.all(
    Array.from({ length: 8 }, () =>
      client.apiFetch('/api/clips/id', {
        method: 'PATCH',
        body: '{"title":"updated"}'
      })
    )
  )
  assert.ok(requests.every((response) => response.ok))
  assert.equal(refreshes, 1)
  assert.equal(calls, 16)
})

test('password login forwards a requested second factor without persisting it', async () => {
  let loginBody
  const client = createAuthClient(async (path, options) => {
    if (!path.endsWith('/login')) throw new Error('unexpected request')
    loginBody = JSON.parse(options.body)
    return success('mfa-token')
  })
  await client.login(user.email, 'fixture', 'ABCD-EFGH-IJKL-MNOP')
  assert.deepEqual(loginBody, {
    email: user.email,
    password: 'fixture',
    secondFactor: 'ABCD-EFGH-IJKL-MNOP'
  })
  assert.doesNotMatch(JSON.stringify(client.getSnapshot()), /ABCD-EFGH/)
})

test('a second unauthorized response stops after one retry and clears auth', async () => {
  let calls = 0
  const client = createAuthClient(async (path) => {
    if (path.endsWith('/login') || path.endsWith('/refresh'))
      return success('token')
    calls++
    return new Response(null, { status: 401 })
  })
  await client.login(user.email, 'fixture')
  assert.equal((await client.apiFetch('/api/jobs')).status, 401)
  assert.equal(calls, 2)
  assert.equal(client.getAccessToken(), null)
  assert.equal(client.getSnapshot().status, 'anonymous')
})

test('logout fences a pending refresh and revokes its cookie after completion', async () => {
  const pending = deferred()
  const events = []
  const client = createAuthClient(async (path) => {
    if (path.endsWith('/refresh')) {
      await pending.promise
      events.push('refresh-cookie')
      return success('stale')
    }
    events.push('logout-cookie')
    return new Response(null, { status: 204 })
  })
  const refresh = client.refresh()
  const logout = client.logout()
  assert.equal(client.getSnapshot().status, 'signing-out')
  await assert.rejects(client.apiFetch('/api/jobs'), /Signed out/)
  pending.resolve()
  assert.equal(await refresh, null)
  await logout
  assert.deepEqual(events, ['refresh-cookie', 'logout-cookie'])
  assert.equal(client.getAccessToken(), null)
  assert.equal(client.getSnapshot().status, 'anonymous')
})

test('logout failure remains retryable and cannot silently refresh a session', async () => {
  let requests = 0
  const client = createAuthClient(async () => {
    requests++
    return new Response(null, { status: requests === 1 ? 503 : 204 })
  })
  await assert.rejects(client.logout())
  assert.equal(client.getSnapshot().status, 'logout-error')
  assert.equal(await client.refresh(), null)
  await client.logout()
  assert.equal(requests, 2)
  assert.equal(client.getSnapshot().status, 'anonymous')
})

test('service failures do not masquerade as an expired session', async () => {
  const client = createAuthClient(
    async () => new Response(null, { status: 503 })
  )
  await assert.rejects(client.refresh())
  assert.equal(client.getSnapshot().status, 'error')
})

test('bearer credentials cannot be sent to an arbitrary URL', async () => {
  let calls = 0
  const client = createAuthClient(async (path) => {
    calls++
    return path.endsWith('/login') ? success('secret') : Response.json({})
  })
  await client.login(user.email, 'fixture')
  await assert.rejects(
    client.apiFetch('https://attacker.example/api/jobs'),
    /local/
  )
  assert.equal(calls, 1)
})

test('Next contains no database clients, auth authority, or business API handlers', () => {
  const root = new URL('../src/', import.meta.url)
  assert.equal(existsSync(new URL('app/api', root)), false)
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(directory, entry.name))
        : [join(directory, entry.name)]
    )
  for (const path of walk(fileURLToPath(root)).filter((path) =>
    /\.[jt]sx?$/.test(path)
  )) {
    const text = readFileSync(path, 'utf8')
    assert.doesNotMatch(
      text,
      /from ['"](?:next-auth|@prisma|@auth\/prisma|pg['"]|stripe['"]|bcrypt)/,
      path
    )
    assert.doesNotMatch(
      text,
      /process\.env\.(?:DATABASE_URL|JWT_SECRET|AUTH_SECRET|GOOGLE_CLIENT_SECRET|INTERNAL_API_KEY|STRIPE_SECRET_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY)/,
      path
    )
  }
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/)
})
