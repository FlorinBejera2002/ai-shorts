import { createServer } from 'node:http'

const admin = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@sneepcut.com', name: 'Sneep Cut Admin', access_role: 'admin' }
const users = [
  { id: '22222222-2222-4222-8222-222222222222', email: 'ana@example.com', name: 'Ana Popescu', plan: 'pro', credits: 840, accessRole: 'member', accountStatus: 'active', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), jobsCount: 24, clipsCount: 76 },
  { id: '33333333-3333-4333-8333-333333333333', email: 'studio@example.com', name: 'Studio Nord', plan: 'business', credits: 2200, accessRole: 'admin', accountStatus: 'active', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), jobsCount: 91, clipsCount: 312 },
  { id: '44444444-4444-4444-8444-444444444444', email: 'review@example.com', name: 'Review Account', plan: 'free', credits: 0, accessRole: 'viewer', accountStatus: 'suspended', createdAt: new Date().toISOString(), lastSeenAt: null, jobsCount: 2, clipsCount: 1 }
]

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

createServer((request, response) => {
  if (request.url === '/v1/auth/refresh') return json(response, 401, { error: 'anonymous' })
  if (request.url === '/v1/auth/login') return json(response, 200, { access_token: 'mock-token', user: admin })
  if (request.url === '/v1/auth/logout') return json(response, 200, {})
  if (request.url === '/api/admin/overview') return json(response, 200, { usersTotal: 1284, usersActive: 1267, usersSuspended: 17, newUsersSevenDays: 83, jobsTotal: 18420, jobsActive: 34, jobsFailed: 21, clipsTotal: 56291, creditsOutstanding: 892430 })
  if (request.url?.startsWith('/api/admin/users')) return json(response, 200, { items: users, total: users.length, page: 1, pageSize: 20 })
  if (request.url?.startsWith('/api/admin/audit')) return json(response, 200, { items: [{ id: 1, actorEmail: admin.email, targetEmail: users[2].email, action: 'set_status', reason: 'Cont de test suspendat după verificarea operațională.', before: {}, after: {}, createdAt: new Date().toISOString() }] })
  return json(response, 404, { error: 'not found' })
}).listen(8089, '127.0.0.1', () => console.log('Admin mock API listening on 8089'))
