import type { NextConfig } from 'next'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  // Fully static HTML export: every public page is prerendered for crawlers.
  output: 'export',
  trailingSlash: false,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  experimental: { globalNotFound: true }
}

export default nextConfig
