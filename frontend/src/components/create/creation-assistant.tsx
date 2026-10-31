'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AssistantChat, type AssistantAction } from '@/components/assistant/assistant-chat'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { CreateSettings } from './settings-panel'

interface CreationAssistantProps {
  settings: CreateSettings
  instructions: string
  onActions: (actions: AssistantAction[]) => void
}

export function CreationAssistant({ settings, instructions, onActions }: CreationAssistantProps) {
  const t = useTranslations('assistant')

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t('title')}>
          <Sparkles className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="creation-assistant-sheet w-full overflow-y-auto p-4 pt-12 sm:max-w-sm">
        <SheetHeader className="sr-only">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('suggestCreate1')}</SheetDescription>
        </SheetHeader>
        <AssistantChat
          context="create"
          getState={() => ({
            clips: settings.clips,
            aspect_ratio: settings.aspectRatio,
            subtitle_style: settings.subtitleStyle,
            include_brand: settings.includeBrand,
            language: settings.language || null,
            smart_crop: settings.smartCrop,
            audio_cleanup: { enabled: settings.reduceBackgroundNoise ?? false },
            instructions: instructions.trim() || null
          })}
          onActions={onActions}
          suggestions={[t('suggestCreate1'), t('suggestCreate2'), t('suggestCreate3')]}
        />
      </SheetContent>
    </Sheet>
  )
}
