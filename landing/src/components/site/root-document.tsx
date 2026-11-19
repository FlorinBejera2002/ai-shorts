import type { ReactNode } from 'react'
import { getCopy } from '@/content/copy'
import type { Locale } from '@/lib/i18n'
import { themeBootScript } from '@/lib/theme'

type RootDocumentProps = { locale: Locale; children: ReactNode }

export function RootDocument({ locale, children }: RootDocumentProps) {
  return (
    // The boot script sets the theme class before hydration.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {getCopy(locale).nav.skipToContent}
        </a>
        {children}
      </body>
    </html>
  )
}
