import { execFileSync } from 'node:child_process'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

initOpenNextCloudflareForDev()

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const localImagePatterns =
  process.env.NODE_ENV === 'development'
    ? [
        {
          protocol: 'http' as const,
          hostname: 'localhost',
          port: '3000',
          pathname: '/media/**'
        }
      ]
    : []

function resolveDeploymentId(): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined

  const configured = [
    process.env.NEXT_DEPLOYMENT_ID,
    process.env.DEPLOYMENT_VERSION,
    process.env.GIT_COMMIT_SHA,
    process.env.CF_PAGES_COMMIT_SHA
  ]
    .map((value) => value?.trim())
    .find((value) => value && /^[a-zA-Z0-9_-]+$/.test(value))
  if (configured) return configured

  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return undefined
  }
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Keep the production compiler away from the development cache. Running
  // `next build` while `next dev` is open can otherwise leave mixed vendor
  // chunks in `.next` and break routes such as the pricing page.
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === 'production' ? '.next-prod' : '.next'),
  // Keep client assets and server responses on the same release during
  // rolling deployments. The explicit env var wins; local builds fall back
  // to the checked-out commit so they exercise the same skew protection.
  deploymentId: resolveDeploymentId(),
  output: 'standalone',
  images: {
    remotePatterns: [
      ...localImagePatterns,
      ...imageRemoteHosts.map((hostname) => ({
        protocol: 'https' as const,
        hostname
      }))
    ]
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
    const mediaHost = (process.env.MEDIA_PROXY_HOST ?? 'http://localhost:8081')
      .trim()
      .replace(/\/+$/, '')
    const apiHost = (process.env.GO_API_URL ?? 'http://localhost:8080')
      .trim()
      .replace(/\/+$/, '')
    return [
      { source: '/api/:path*', destination: `${apiHost}/api/:path*` },
      { source: '/v1/:path*', destination: `${apiHost}/v1/:path*` },
      {
        source: '/media/:path*',
        destination: `${mediaHost}/media/:path*`
      }
    ]
  }
}

export default withNextIntl(nextConfig)
