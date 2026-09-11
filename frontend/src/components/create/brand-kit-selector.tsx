'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import { Plus, Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type BrandKit = { primaryColor: string }

export function BrandKitSelector({
  enabled,
  onChange
}: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const t = useTranslations('create')
  const [kit, setKit] = useState<BrandKit | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/user/brand')
      .then(async (response) => {
        if (!response.ok) throw new Error('Brand kit unavailable')
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setKit(data.brandKit ?? null)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const color =
    kit?.primaryColor && /^#[0-9a-f]{6}$/i.test(kit.primaryColor)
      ? kit.primaryColor
      : '#7856ff'
  return (
    <section className="creation-settings-brand">
      <div className="creation-brand-heading">
        <div>
          <h3>{t('brandKit')}</h3>
          <p>{t('brandSelectHint')}</p>
        </div>
        <span className="creation-brand-count">
          {status === 'ready'
            ? t('brandKitCount', { count: kit ? 1 : 0 })
            : '—'}
        </span>
      </div>
      <div className="creation-brand-controls">
        <Select
          value={enabled && kit ? 'saved' : 'none'}
          onValueChange={(value) => onChange(value === 'saved')}
          disabled={status !== 'ready' || !kit}
        >
          <SelectTrigger aria-label={t('brandKit')} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="none">{t('brandNone')}</SelectItem>
            {kit && (
              <SelectItem value="saved">
                <span
                  className="creation-brand-swatch"
                  style={{ backgroundColor: color }}
                />
                {t('brandSaved')}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Link href="/dashboard/brand" className="creation-brand-action">
          {kit ? <Settings2 aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {t(kit ? 'brandManage' : 'brandAdd')}
        </Link>
      </div>
      {status === 'error' && (
        <p className="text-xs text-destructive" role="status">
          {t('brandLoadError')}
        </p>
      )}
    </section>
  )
}
