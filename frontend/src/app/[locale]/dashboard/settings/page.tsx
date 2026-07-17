'use client'

import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import {
  AlertTriangle,
  Download,
  Globe,
  Loader2,
  Shield,
  Trash2,
  User
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

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
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })
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
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="mt-8 space-y-6 max-w-2xl">
        <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">
                {t('account')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('accountDesc')}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[13px] font-medium hover:bg-muted transition-colors"
          >
            {t('manageSubscription')}
          </Link>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-6 animate-slide-up"
          style={{ animationDelay: '40ms' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Globe className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-[13px] font-semibold text-foreground">
              {t('preferences')}
            </h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <span className="text-[13px] text-foreground">
                {t('language')}
              </span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground">{t('theme')}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-6 animate-slide-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">
                {t('dataPrivacy')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('dataPrivacyDesc')}
              </p>
            </div>
          </div>

          <div className="space-y-3 text-[13px] text-muted-foreground mb-4 pb-4 border-b border-border">
            <p>
              {t('readPrivacy')}{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                {t('privacyPolicy')}
              </Link>{' '}
              {t('and')}{' '}
              <Link href="/terms" className="text-primary hover:underline">
                {t('termsOfService')}
              </Link>
              .
            </p>
          </div>

          <button
            type="button"
            onClick={() => void exportData()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[13px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {busy === 'export' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {t('exportData')}
          </button>
        </div>

        <div
          className="rounded-xl border-2 border-destructive/20 bg-destructive/5 p-6 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-destructive">
                {t('dangerZone')}
              </h2>
              <p className="text-xs text-destructive/80 mt-0.5">
                {t('dangerZoneDesc')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void deleteAccount()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-[13px] font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {busy === 'delete' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t('deleteAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}
