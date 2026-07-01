import type { NextConfig } from 'next'

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: imageRemoteHosts.map((hostname) => ({
      protocol: 'https',
      hostname,
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
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: 'http://nginx:80/media/:path*',
      },
    ]
  },
}

export default nextConfig
