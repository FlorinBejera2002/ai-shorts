import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { cache } from 'react'

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required before accessing the database')
  }

  const adapter = new PrismaPg({ connectionString, maxUses: 1 })
  return new PrismaClient({ adapter })
}

/**
 * React's request cache gives every request its own Prisma client while still
 * reusing that client inside a single Server Component render. `maxUses: 1`
 * prevents a TCP connection from leaking across Cloudflare request contexts.
 */
export const getPrisma = cache(createPrismaClient)
