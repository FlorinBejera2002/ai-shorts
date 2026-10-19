'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import type { PublishingImageUserTag } from '@/lib/content-calendar'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

export function PublishingImageTags({
  tags,
  disabled,
  onChange
}: {
  tags: PublishingImageUserTag[]
  disabled: boolean
  onChange: (tags: PublishingImageUserTag[]) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  const inputId = useId()
  const [username, setUsername] = useState('')
  const [error, setError] = useState(false)

  function addTag() {
    const normalized = username.trim().replace(/^@/, '')
    const duplicate = tags.some(tag =>
      tag.username.toLowerCase() === normalized.toLowerCase()
    )
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(normalized) || duplicate) {
      setError(true)
      return
    }
    onChange([...tags, { username: normalized, x: 0.5, y: 0.5 }])
    setUsername('')
    setError(false)
  }

  function updateTag(index: number, coordinate: 'x' | 'y', value: number) {
    onChange(tags.map((tag, tagIndex) =>
      tagIndex === index ? { ...tag, [coordinate]: value / 100 } : tag
    ))
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-xs font-semibold">
        {t('tags')}
      </label>
      <p id={`${inputId}-hint`} className="text-[11px] text-muted-foreground">
        {t('tagsHint')}
      </p>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={username}
          placeholder={t('usernamePlaceholder')}
          disabled={disabled || tags.length >= 20}
          aria-invalid={error}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
          onChange={event => {
            setUsername(event.target.value)
            setError(false)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!disabled && tags.length < 20) addTag()
            }
          }}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !username.trim() || tags.length >= 20}
          onClick={addTag}
        >
          <Plus className="size-3.5" />
          {t('addTag')}
        </Button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">
          {t('tagInvalid')}
        </p>
      )}
      {tags.map((tag, index) => (
        <div key={tag.username} className="flex items-start gap-1 rounded-md border px-3 py-1">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer py-2 text-xs font-medium">
              {index + 1}. @{tag.username}
            </summary>
            <div className="space-y-2 pb-2">
              {(['x', 'y'] as const).map(coordinate => (
                <div key={coordinate}>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{t(coordinate === 'x' ? 'horizontal' : 'vertical')}</span>
                    <span>{Math.round(tag[coordinate] * 100)}%</span>
                  </div>
                  <Slider
                    aria-label={t(
                      coordinate === 'x' ? 'tagHorizontal' : 'tagVertical',
                      { username: tag.username }
                    )}
                    value={[tag[coordinate] * 100]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={disabled}
                    onValueChange={values =>
                      updateTag(index, coordinate, values[0] ?? 50)
                    }
                  />
                </div>
              ))}
            </div>
          </details>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t('removeTag', { username: tag.username })}
            onClick={() => onChange(tags.filter((_, tagIndex) => index !== tagIndex))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
