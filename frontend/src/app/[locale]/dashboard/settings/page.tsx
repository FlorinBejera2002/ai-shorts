'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import { Download, Globe, Loader2, Shield, Trash2, User } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'

export default function SettingsPage() {
  const t = useTranslations('settings')
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)

  async function exportData() {
    setBusy('export')
    try {
      const res = await fetch('/api/user/data')
      if (!res.ok) {
        toast.add('error', t('exportFailed'))
        return
      }
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clipforge-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.add('success', t('exportSuccess'))
    } catch {
      toast.add('error', t('exportFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(t('deleteConfirm1'))
    if (!confirmed) return

    const doubleConfirm = window.confirm(t('deleteConfirm2'))
    if (!doubleConfirm) return

    setBusy('delete')
    try {
      const res = await fetch('/api/user/data', { method: 'DELETE' })
      if (!res.ok) {
        toast.add('error', t('deleteFailed'))
        return
      }
      toast.add('success', t('deleteSuccess'))
      router.push('/login')
    } catch {
      toast.add('error', t('deleteFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('desc')}
      </p>

      <div className="mt-6 space-y-4 max-w-xl">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">{t('account')}</h2>
          </div>
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <p>{t('accountDesc')}</p>
            <div className="flex gap-2">
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                {t('manageSubscription')}
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">{t('preferences')}</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px]">{t('language')}</span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px]">{t('theme')}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">{t('dataPrivacy')}</h2>
          </div>
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <p>
              {t('dataPrivacyDesc')}
              {t('readPrivacy')}{' '}
              <Link href="/privacy" className="text-primary hover:underline">{t('privacyPolicy')}</Link>
              {' '}{t('and')}{' '}
              <Link href="/terms" className="text-primary hover:underline">{t('termsOfService')}</Link>.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void exportData()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                {busy === 'export' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {t('exportData')}
              </button>

              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                {busy === 'delete' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {t('deleteAccount')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
