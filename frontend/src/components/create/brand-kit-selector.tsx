'use client'

import { KitAvatar } from '@/components/dashboard/brand/kits/kit-visuals'
import { orderKits } from '@/components/dashboard/brand/kits/kit-model'
import { useBrandKits } from '@/components/dashboard/brand/kits/use-brand-kits'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link } from '@/i18n/navigation'
import { Plus, Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

const NONE = 'none'
const DEFAULT = 'default'

/**
 * Brand kit for a new video. With `onKitChange` every kit can be picked; without it (stories,
 * which always use the default kit) the choice is the default kit or none.
 */
/**
 * The select's value: no kit, the default kit (when only the default can be used) or the chosen
 * kit. A kit that no longer exists (deleted in another tab) shows the default kit; the server
 * also falls back to the default kit for an unknown id.
 */
function selectedValue({ enabled, kits, kitId, pickAny }: { enabled: boolean; kits: { id: string }[]; kitId: string | null; pickAny: boolean }) {
  const fallback = kits[0]
  if (!enabled || !fallback) return NONE
  if (!pickAny) return DEFAULT
  return kits.find((kit) => kit.id === kitId)?.id ?? fallback.id
}

export function BrandKitSelector({
  enabled,
  onChange,
  kitId = null,
  onKitChange
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
  kitId?: string | null
  onKitChange?: (kitId: string | null) => void
}) {
  const t = useTranslations('create')
  const { kits, isPending, isError } = useBrandKits()
  const ordered = kits ? orderKits(kits) : []
  const fallback = ordered[0] ?? null
  const choices = onKitChange ? ordered : fallback ? [fallback] : []
  const selected = selectedValue({ enabled, kits: ordered, kitId, pickAny: Boolean(onKitChange) })

  function choose(value: string) {
    onChange(value !== NONE)
    if (onKitChange) onKitChange(value === NONE ? null : value)
  }

  return (
    <section className="creation-settings-brand">
      <div className="creation-brand-heading">
        <h2>{t('brandKit')}</h2>
      </div>
      <div className="creation-brand-controls">
        <Select value={selected} onValueChange={choose} disabled={isPending || isError || !fallback}>
          <SelectTrigger aria-label={t('brandKit')} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE}>{t('brandNone')}</SelectItem>
            {choices.map((kit) => (
              <SelectItem key={kit.id} value={onKitChange ? kit.id : DEFAULT} data-brand-kit-option={kit.id}>
                <span className="creation-brand-kit">
                  <KitAvatar kit={kit} size={20} />
                  {kit.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link href="/dashboard/brand" className="creation-brand-action">
          {fallback ? <Settings2 aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {t(fallback ? 'brandManage' : 'brandAdd')}
        </Link>
      </div>
      {isError && (
        <p className="text-xs text-destructive" role="status">
          {t('brandLoadError')}
        </p>
      )}
    </section>
  )
}
