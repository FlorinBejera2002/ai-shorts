'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import type { InstagramPostSettings } from '@/lib/instagram-post-settings'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

function SettingRow({
  checked,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="cursor-pointer text-xs text-foreground">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

export function InstagramPostSettings({
  accountName,
  disabled,
  idPrefix,
  isVideoPost = true,
  onChange,
  settings
}: {
  accountName?: string
  disabled: boolean
  idPrefix: string
  isVideoPost?: boolean
  onChange: <Key extends keyof InstagramPostSettings>(
    key: Key,
    value: InstagramPostSettings[Key]
  ) => void
  settings: InstagramPostSettings
}) {
  const t = useTranslations('publishing')
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-labelledby={`${idPrefix}-title`}
      className="overflow-hidden rounded-lg border"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <PlatformBrandIcon provider="instagram" className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <h3 id={`${idPrefix}-title`} className="text-xs font-semibold">
            {t('instagramOptions')}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Instagram
          </p>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="space-y-1 border-t px-4 py-3">
              <SettingRow
                id={`${idPrefix}-comments`}
                label={t('instagramComments')}
                checked={settings.commentEnabled}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange('commentEnabled', checked)
                }
              />
              {isVideoPost && (
                <SettingRow
                  id={`${idPrefix}-share-to-feed`}
                  label={t('instagramShareToFeed')}
                  checked={settings.shareToFeed}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange('shareToFeed', checked)
                  }
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
