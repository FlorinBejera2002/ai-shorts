import {
  useLocation,
  useParams as useReactRouterParams,
  useSearchParams as useReactRouterSearchParams
} from 'react-router-dom'

export { useRouter } from '../i18n/navigation'

export function usePathname() {
  return useLocation().pathname
}

export function useSearchParams() {
  return useReactRouterSearchParams()[0]
}

export function useParams<
  T extends Record<string, string | string[] | undefined>
>() {
  return useReactRouterParams() as T
}

export function notFound(): never {
  throw new Error('Route not found')
}
