'use client'

import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

const MAX_INSTRUCTIONS = 4000

interface AIEditingDirectionProps {
  value: string
  onChange: (value: string) => void
  action?: ReactNode
}

export function AIEditingDirection({ value, onChange, action }: AIEditingDirectionProps) {
  const t = useTranslations('create')

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="ai-editing-direction">
          {t('aiDirectionLabel')}
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-6"
                aria-label={t('aiDirectionInfo')}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72" side="left" sideOffset={6}>
              {t('aiDirectionInfo')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="ml-auto">{action}</div>
      </div>
      <Textarea
        id="ai-editing-direction"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_INSTRUCTIONS}
        rows={2}
        className="mt-2 min-h-18 resize-y rounded-md text-sm leading-5"
        placeholder={t('aiDirectionPlaceholder')}
      />
      {value && (
        <div className="mt-1.5 flex justify-end text-xs tabular-nums text-muted-foreground">
          {value.length}/{MAX_INSTRUCTIONS}
        </div>
      )}
    </div>
  )
}
