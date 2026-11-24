import { KitAvatar } from '@/components/dashboard/brand/kits/kit-visuals'
import { orderKits } from '@/components/dashboard/brand/kits/kit-model'
import { useBrandKits } from '@/components/dashboard/brand/kits/use-brand-kits'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Link } from '@/i18n/navigation'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

const NONE = 'none'

/**
 * Brand kit for the clip. Stories always use the default kit, so the choice is that kit or none.
 */
export function StoryBrandKitField({
  enabled,
  onChange
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const text = useStoryLanguage()
  const { kits, isPending, isError } = useBrandKits()
  const kit = kits ? orderKits(kits)[0] : undefined
  const noneLabel = text('No brand kit', 'Fără kit de brand')

  return (
    <div className={styles.kitRow}>
      <Select
        value={enabled && kit ? kit.id : NONE}
        onValueChange={(value) => onChange(value !== NONE)}
        disabled={isPending || isError || !kit}
      >
        <SelectTrigger
          aria-label={text('Brand kit', 'Kit de brand')}
          className="h-12 w-full min-w-0 rounded-md px-3.5"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {kit && (
            <SelectItem value={kit.id}>
              <span className="flex min-w-0 items-center gap-2">
                <KitAvatar kit={kit} size={22} />
                <span className="truncate">{kit.name}</span>
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <Link href="/dashboard/brand" className={styles.manageLink}>
        {text('Manage', 'Gestionează')}
      </Link>
    </div>
  )
}
