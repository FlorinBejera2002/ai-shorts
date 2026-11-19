'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { CloseButton, referenceSurface, SheetMenu } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Copy, EllipsisVertical, ImageIcon, Pencil, Star, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import type { BrandKitSummary } from './kit-model'
import { KitAvatar } from './kit-visuals'

export type KitCommand = 'rename' | 'image' | 'duplicate' | 'default' | 'delete'

function useItems(kit: BrandKitSummary) {
  const t = useTranslations('brandKits')
  const items: { command: KitCommand; label: string; icon: ReactNode; danger?: boolean }[] = [
    { command: 'rename', label: t('rename'), icon: <Pencil aria-hidden="true" /> },
    { command: 'image', label: t('changeImage'), icon: <ImageIcon aria-hidden="true" /> },
    { command: 'duplicate', label: t('duplicate'), icon: <Copy aria-hidden="true" /> }
  ]
  if (!kit.isDefault) items.push({ command: 'default', label: t('setDefault'), icon: <Star aria-hidden="true" /> })
  return { items, remove: { command: 'delete' as const, label: t('delete'), icon: <Trash2 aria-hidden="true" />, danger: true } }
}

/** "⋯" for a kit: a dropdown on desktop, a bottom sheet on phones. */
export function KitMenu({
  kit,
  mobile,
  size = 32,
  bordered = false,
  onCommand
}: {
  kit: BrandKitSummary
  mobile: boolean
  size?: number
  bordered?: boolean
  onCommand: (command: KitCommand, kit: BrandKitSummary) => void
}) {
  const t = useTranslations('brandKits')
  const { items, remove } = useItems(kit)
  const [open, setOpen] = useState(false)
  const trigger = (
    <button
      type="button"
      className={`${ui.iconButton} ${ui.focus}`}
      style={{ width: size, height: size, boxShadow: bordered ? 'inset 0 0 0 1px var(--ref-strong)' : undefined }}
      aria-label={t('options', { name: kit.name })}
      aria-haspopup="menu"
      onClick={mobile ? () => setOpen(true) : undefined}
      data-kit-menu={kit.id}
    >
      <EllipsisVertical aria-hidden="true" />
    </button>
  )
  if (mobile) {
    const run = (command: KitCommand) => {
      setOpen(false)
      onCommand(command, kit)
    }
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className={`${referenceSurface} ${ui.sheet}`}
            overlayClassName={theme.overlay}
            data-reference-surface=""
          >
            <span className={ui.grab} aria-hidden="true" />
            <div className={ui.sheetHead}>
              <KitAvatar kit={kit} size={36} />
              <SheetTitle>{kit.name}</SheetTitle>
              <CloseButton onClick={() => setOpen(false)} />
            </div>
            <SheetMenu className={ui.sheetList} label={t('options', { name: kit.name })}>
              {items.map((item) => (
                <button key={item.command} type="button" role="menuitem" className={ui.item} onClick={() => run(item.command)}>
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
              <span className={ui.separator} />
              <button type="button" role="menuitem" className={ui.item} data-danger="" onClick={() => run(remove.command)}>
                {remove.icon}
                <span>{remove.label}</span>
              </button>
            </SheetMenu>
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className={`${referenceSurface} ${ui.menu}`} data-reference-surface="">
          {items.map((item) => (
            <Menu.Item key={item.command} className={ui.item} onSelect={() => onCommand(item.command, kit)}>
              {item.icon}
              <span>{item.label}</span>
            </Menu.Item>
          ))}
          <Menu.Separator className={ui.separator} />
          <Menu.Item className={ui.item} data-danger="" onSelect={() => onCommand(remove.command, kit)}>
            {remove.icon}
            <span>{remove.label}</span>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
