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

const MAX_INSTRUCTIONS = 4000

interface AIEditingDirectionProps {
  value: string
  onChange: (value: string) => void
}

export function AIEditingDirection({ value, onChange }: AIEditingDirectionProps) {
  const t = useTranslations('create')

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-foreground" htmlFor="ai-editing-direction">
          {t('aiDirectionLabel')}
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      </div>
      <Textarea
        id="ai-editing-direction"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_INSTRUCTIONS}
        rows={4}
        className="mt-2 min-h-24 resize-y rounded-md text-xs leading-5"
        placeholder={t('aiDirectionPlaceholder')}
      />
      <div className="mt-1.5 flex justify-end text-[10px] tabular-nums text-muted-foreground">
        {value.length}/{MAX_INSTRUCTIONS}
      </div>
    </div>
  )
}
