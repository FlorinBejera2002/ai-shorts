import { useLayoutEffect, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Renders a legacy public page only when the document itself was loaded at
 * that URL (local Vite without the gateway). In-app navigations to a public
 * page are handed to the static site with a document load.
 */
export function PublicSiteRoute({ children }: { children: ReactNode }) {
  const navigationType = useNavigationType()
  const { pathname, search, hash } = useLocation()
  const leaving = navigationType !== 'POP'

  useLayoutEffect(() => {
    if (leaving) window.location.replace(`${pathname}${search}${hash}`)
  }, [leaving, pathname, search, hash])

  return leaving ? null : children
}
