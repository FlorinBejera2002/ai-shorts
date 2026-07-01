import { signIn } from '@/lib/auth'
import { Film } from 'lucide-react'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error, callbackUrl } = await searchParams
  const redirectTo = callbackUrl ?? '/dashboard'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">ClipForge</span>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Sign in to your workspace
        </p>

        {error && (
          <div className="mt-4 animate-slide-down flex items-center gap-2 rounded-lg border-l-2 border-red-500 bg-red-500/5 px-3 py-2 text-[13px] text-red-400">
            {error === 'CredentialsSignin'
              ? 'Invalid email or password.'
              : error === 'CallbackRouteError'
                ? 'Database connection is unavailable. Start the local database and try again.'
              : 'An error occurred. Please try again.'}
          </div>
        )}

        <form
          action={async () => {
            'use server'
            try {
              await signIn('google', { redirectTo })
            } catch (error) {
              if (error instanceof AuthError) {
                redirect(`/login?error=${error.type}`)
              }
              throw error
            }
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-[11px] text-muted-foreground uppercase tracking-wider">
              or
            </span>
          </div>
        </div>

        <form
          action={async (formData) => {
            'use server'
            try {
              await signIn('credentials', {
                email: formData.get('email'),
                password: formData.get('password'),
                redirectTo,
              })
            } catch (error) {
              if (error instanceof AuthError) {
                redirect(`/login?error=${error.type}`)
              }
              throw error
            }
          }}
          className="space-y-3"
        >
          <input
            name="email"
            type="email"
            required={true}
            placeholder="Email"
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <input
            name="password"
            type="password"
            required={true}
            placeholder="Password"
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
          <div className="flex justify-end">
            <a
              href="/forgot-password"
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </a>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a
            href="/register"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Sign up
          </a>
        </p>
      </div>
    </main>
  )
}
