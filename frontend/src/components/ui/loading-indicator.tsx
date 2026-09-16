import { cn } from '@/lib/utils'
import Image from 'next/image'

type LoadingIndicatorProps = {
  className?: string
}

export function LoadingIndicator({
  className = 'size-4'
}: LoadingIndicatorProps) {
  return (
    <Image
      src="/brand/black-loading.gif"
      alt=""
      width={96}
      height={96}
      unoptimized={true}
      aria-hidden="true"
      className={cn('shrink-0 object-contain dark:invert', className)}
    />
  )
}
