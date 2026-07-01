import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
        if (!email || !password) {
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
      return Boolean(session?.user)
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
      }

      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            credits: true,
            plan: true
          }
        })
        token.credits = dbUser?.credits ?? 0
        token.plan = dbUser?.plan ?? 'free'
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.credits = Number(token.credits ?? 0)
        session.user.plan = String(token.plan ?? 'free')
      }
      return session
    }
  }
})
