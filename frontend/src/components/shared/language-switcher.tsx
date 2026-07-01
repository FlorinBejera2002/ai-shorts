'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { locales } from '@/i18n/config'

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ro: 'Română',
}

const LOCALE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  ro: '🇷🇴',
}

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale as any })
  }

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs appearance-none cursor-pointer pr-7"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
        }}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
          </option>
        ))}
      </select>
    </div>
  )
}
