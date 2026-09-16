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
      src="/brand/sneepcut-cyber-hud-loader.svg"
      alt=""
      width={380}
      height={380}
      unoptimized={true}
      aria-hidden="true"
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
