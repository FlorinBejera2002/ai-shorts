import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import {
  fitsBcryptPasswordLimit,
  hasCurrentSessionVersion
} from '@/lib/account-settings'
import { createPrismaClient } from '@/lib/db'
import { isProductionEnvironment } from '@/lib/environment'

/**
 * Auth.js otherwise treats any non-empty AUTH_TRUST_HOST value, including
 * "false", as truthy. Production only trusts forwarded host headers after an
 * exact, explicit opt-in; local development remains convenient by default.
 */
export function shouldTrustAuthHost() {
  const configured = process.env.AUTH_TRUST_HOST
  if (configured !== undefined) return configured === 'true'
  return !isProductionEnvironment()
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const prisma = createPrismaClient()

  return {
    adapter: PrismaAdapter(prisma),
    trustHost: shouldTrustAuthHost(),
    session: {
      strategy: 'jwt'
    },
    pages: {
      signIn: '/login',
      error: '/login?error=true'
    },
    providers: [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ''
      }),
      Credentials({
        credentials: {
          email: {},
          password: {}
        },
        async authorize(credentials) {
          const email = String(credentials?.email ?? '').toLowerCase()
          const password = String(credentials?.password ?? '')
          if (!email || !password || !fitsBcryptPasswordLimit(password)) {
            return null
          }

          const user = await prisma.user.findUnique({ where: { email } })
          if (!user?.passwordHash) {
            return null
          }

          const valid = await bcrypt.compare(password, user.passwordHash)
          if (!valid) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image
          }
        }
      })
    ],
    callbacks: {
      authorized({ auth: session }) {
        return Boolean(session?.user?.id)
      },
      async jwt({ token, user }) {
        if (user?.id) {
          token.sub = user.id
          token.invalidated = false
          // Set only during an actual provider/credentials sign-in. Ordinary
          // session reads do not receive `user`, so they cannot extend this.
          token.authenticatedAt = Date.now()
        }

        if (token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: {
              name: true,
              email: true,
              image: true,
              credits: true,
              plan: true,
              accessRole: true,
              sessionVersion: true
            }
          })
          if (!dbUser) {
            token.sub = undefined
            token.invalidated = true
            return token
          }

          if (user?.id) {
            token.sessionVersion = dbUser.sessionVersion
          } else if (
            !hasCurrentSessionVersion(
              token.sessionVersion,
              dbUser.sessionVersion
            )
          ) {
            token.sub = undefined
            token.invalidated = true
            return token
          }

          token.name = dbUser.name
          token.email = dbUser.email
          token.picture = dbUser.image
          token.credits = dbUser.credits
          token.plan = dbUser.plan
          token.accessRole = dbUser.accessRole
        }

        return token
      },
      async session({ session, token }) {
        if (session.user && token.sub && !token.invalidated) {
          session.user.id = token.sub
          session.user.credits = Number(token.credits ?? 0)
          session.user.plan = String(token.plan ?? 'free')
          session.user.accessRole = String(token.accessRole ?? '')
          session.user.authenticatedAt =
            typeof token.authenticatedAt === 'number'
              ? token.authenticatedAt
              : undefined
          session.user.name = token.name
          session.user.email = token.email ?? ''
          session.user.image = token.picture
        } else if (session.user) {
          session.user.id = ''
        }
        return session
      }
    }
  }
})
