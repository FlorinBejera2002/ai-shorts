'use client'

import { useSwipeBackProgress } from '@/hooks/use-swipe-back'
import { ChevronLeft } from 'lucide-react'

/**
 * The arrow that follows an edge swipe back, as on iOS. It slides in with the finger and
 * fills in once releasing would go back; it eases away when the swipe ends.
 */
export function SwipeBackIndicator() {
  const progress = useSwipeBackProgress((state) => state.progress)
  const active = useSwipeBackProgress((state) => state.active)
  const ready = progress >= 1

  return (
    <div
      aria-hidden="true"
      data-swipe-back={active ? (ready ? 'ready' : 'tracking') : undefined}
      className={`pointer-events-none fixed top-1/2 left-0 z-[99] flex size-10 items-center justify-center rounded-full border border-border shadow-lg ${
        ready ? 'bg-foreground text-background' : 'bg-card text-foreground'
      } ${active ? '' : 'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'}`}
      style={{
        opacity: active ? Math.min(progress * 1.5, 1) : 0,
        transform: `translate3d(${-44 + progress * 60}px, -50%, 0) scale(${ready ? 1.06 : 1})`
      }}
    >
      <ChevronLeft className="size-5" strokeWidth={2.5} />
    </div>
  )
}
