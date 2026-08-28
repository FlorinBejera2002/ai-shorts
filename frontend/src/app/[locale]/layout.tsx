import { ThemeProvider } from '@/components/shared/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { routing } from '@/i18n/navigation'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { Bodoni_Moda, Inter, Manrope, Sora } from 'next/font/google'
import { notFound } from 'next/navigation'
import '../globals.css'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800']
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap'
})

const bodoni = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-cinematic',
  display: 'swap'
})

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-studio',
  display: 'swap'
})

export const metadata: Metadata = {
  title: {
    default: 'ClipForge — AI Video Clipping',
    template: '%s · ClipForge'
  },
  description:
    'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.',
  openGraph: {
    title: 'ClipForge — AI Video Clipping',
    description:
      'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.',
    siteName: 'ClipForge',
    type: 'website'
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound()
  }
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      suppressHydrationWarning={true}
      className={`${sora.variable} ${inter.variable} ${bodoni.variable} ${manrope.variable}`}
    >
      <body className="font-body antialiased">
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
