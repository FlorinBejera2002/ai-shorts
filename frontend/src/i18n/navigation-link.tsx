import { useLocale } from 'next-intl'
import {
  forwardRef,
  type ComponentProps,
  type MouseEvent,
  type ReactNode
} from 'react'
import { Link as ReactRouterLink } from 'react-router-dom'
import { localizeHref } from './navigation'

type LinkProps = Omit<
  ComponentProps<typeof ReactRouterLink>,
  'to' | 'prefetch'
> & {
  href: string
  children?: ReactNode
  prefetch?: boolean
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, prefetch: _prefetch, ...props },
  ref
) {
  const locale = useLocale()
  const to = localizeHref(href, locale)

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
  }

  return (
    <ReactRouterLink ref={ref} to={to} onClick={handleClick} {...props} />
  )
})
