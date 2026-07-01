'use client'

import { useState } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import { Download, Loader2, Shield, Trash2, User } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

export default function SettingsPage() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)

  async function exportData() {
    setBusy('export')
    try {
      const res = await fetch('/api/user/data')
      if (!res.ok) {
        toast.add('error', 'Could not export data')
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
      toast.add('success', 'Data exported')
    } catch {
      toast.add('error', 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete your account and all data? This action cannot be undone.'
    )
    if (!confirmed) return

    const doubleConfirm = window.confirm(
      'This will permanently delete all your clips, jobs, brand kit, and account. Type OK to confirm.'
    )
    if (!doubleConfirm) return

    setBusy('delete')
    try {
      const res = await fetch('/api/user/data', { method: 'DELETE' })
      if (!res.ok) {
        toast.add('error', 'Could not delete account')
        return
      }
      toast.add('success', 'Account deleted. Redirecting...')
      router.push('/login')
    } catch {
      toast.add('error', 'Deletion failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Account, security, and data management
      </p>

      <div className="mt-6 space-y-4 max-w-xl">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Account</h2>
          </div>
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <p>Manage your profile, change password, and update notification preferences.</p>
            <div className="flex gap-2">
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                Manage subscription
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Data &amp; Privacy</h2>
          </div>
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <p>
              Under GDPR, you have the right to export or delete all your personal data.
              Read our{' '}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              {' '}and{' '}
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>.
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
                Export all data
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
                Delete account &amp; data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
