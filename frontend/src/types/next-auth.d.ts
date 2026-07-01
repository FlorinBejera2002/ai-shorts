import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      credits: number
      plan: string
    } & DefaultSession['user']
  }

  interface User {
    id: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    credits?: number
    plan?: string
  }
}
