import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

initOpenNextCloudflareForDev()

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: [
    '@prisma/client',
    '.prisma/client',
    'pg',
    // OpenNext 1.20.x compares native traced paths with these package names.
    // Keep canonical names for Next and native aliases for its Windows copy
    // step, otherwise Prisma's workerd exports are never selected.
    ...(process.platform === 'win32'
      ? ['@prisma\\client', '.prisma\\client']
      : [])
  ],
  // Keep the production compiler away from the development cache. Running
  // `next build` while `next dev` is open can otherwise leave mixed vendor
  // chunks in `.next` and break routes such as the pricing page.
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === 'production' ? '.next-prod' : '.next'),
  output: 'standalone',
  images: {
    remotePatterns: imageRemoteHosts.map((hostname) => ({
      protocol: 'https',
      hostname
    }))
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
          }
        ]
      }
    ]
  },
  async rewrites() {
    const mediaHost = process.env.MEDIA_PROXY_HOST ?? 'http://nginx:80'
    return [
      {
        source: '/media/:path*',
        destination: `${mediaHost}/media/:path*`
      }
    ]
  }
}

export default withNextIntl(nextConfig)
