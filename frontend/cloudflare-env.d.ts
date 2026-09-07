/** Frontend transport and asset bindings only. Go owns credentials and databases. */
interface CloudflareEnv {
  IMAGES: ImagesBinding
  ASSETS: Fetcher
  WORKER_SELF_REFERENCE: Service
  GO_API_URL: string
  MEDIA_PROXY_HOST: string
  NEXT_PUBLIC_APP_URL: string
  NEXT_PUBLIC_API_URL?: string
  NEXT_PUBLIC_CONTACT_EMAIL?: string
}
