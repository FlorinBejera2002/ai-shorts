import { Info } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useStoryLanguage } from './use-story-language'

interface Props {
  label: string
  children: ReactNode
}

export function StoryHelp({ label, children }: Props) {
  const text = useStoryLanguage()
  const descriptionId = useId()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pinned = useRef(false)
  const hovered = useRef(false)
  const focused = useRef(false)

  const cancelClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = undefined
  }
  const show = () => {
    cancelClose()
    setOpen(true)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !hovered.current && !focused.current) setOpen(false)
    }, 150)
  }

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        cancelClose()
        if (!next) pinned.current = false
        setOpen(next)
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          aria-label={`${text('Help for', 'Ajutor pentru')} ${label}`}
          aria-describedby={open ? descriptionId : undefined}
          aria-controls={open ? descriptionId : undefined}
          aria-haspopup={undefined}
          onPointerEnter={(event) => {
            if (event.pointerType === 'touch') return
            hovered.current = true
            show()
          }}
          onPointerLeave={() => {
            hovered.current = false
            scheduleClose()
          }}
          onFocus={() => {
            focused.current = true
            show()
          }}
          onBlur={() => {
            focused.current = false
            scheduleClose()
          }}
          onClick={(event) => {
            // Keep click/touch open after hover or focus has already revealed it.
            event.preventDefault()
            cancelClose()
            pinned.current = !pinned.current
            setOpen(pinned.current)
          }}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          id={descriptionId}
          role="tooltip"
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[min(19rem,calc(100vw-1.5rem))] rounded-md border bg-popover px-3 py-2.5 text-sm font-normal leading-relaxed text-popover-foreground shadow-md"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={() => {
            hovered.current = true
            cancelClose()
          }}
          onPointerLeave={() => {
            hovered.current = false
            scheduleClose()
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
