import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const url = new URL(process.env.DATABASE_URL)
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
assert.equal(url.pathname, '/sneepcut_integration_test')
assert.equal(process.env.SNEEPCUT_BROWSER_MUTATIONS, 'allow-synthetic-account')
const email = process.env.SNEEPCUT_BROWSER_EMAIL
const password = process.env.SNEEPCUT_BROWSER_PASSWORD
assert.ok(email?.endsWith('@example.invalid'))
assert.ok(password && password.length >= 12 && Buffer.byteLength(password) <= 72)
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
try {
  const user = await db.user.create({ data: {
    email, name: 'Integration Browser',
    passwordHash: await bcrypt.hash(password, 10),
    provider: 'credentials', credits: 1000, plan: 'free'
  } })
  console.log(`Synthetic account created: ${user.id}`)
} finally {
  await db.$disconnect()
}
