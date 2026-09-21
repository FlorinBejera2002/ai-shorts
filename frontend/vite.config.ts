import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { siteAssets } from './vite-site-assets'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const source = fileURLToPath(new URL('./src', import.meta.url))
  const publicDir = fileURLToPath(new URL('./public', import.meta.url))
  const apiTarget = environment.VITE_DEV_API_TARGET || 'http://localhost:8080'
  const mediaTarget =
    environment.VITE_DEV_MEDIA_TARGET || 'http://localhost:8081'

  return {
    publicDir,
    css: { postcss: { plugins: [] } },
    define: {
      'process.env.NEXT_PUBLIC_STUDIO_URL': JSON.stringify(
        environment.VITE_STUDIO_URL || 'http://localhost:5191'
      ),
      'process.env.NEXT_PUBLIC_APP_URL': JSON.stringify(
        environment.VITE_APP_URL || 'http://localhost:5173'
      ),
      'process.env.APP_URL': JSON.stringify(
        environment.VITE_APP_URL || 'http://localhost:5173'
      ),
      'process.env.NEXT_PUBLIC_CONTACT_EMAIL': JSON.stringify(
        environment.VITE_CONTACT_EMAIL || ''
      )
    },
    plugins: [
      siteAssets(new URL(environment.VITE_APP_URL || 'http://localhost:5173')),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss()
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'next-intl', 'zustand'],
      alias: [
        {
          find: 'next/navigation',
          replacement: `${source}/compat/next-navigation.ts`
        },
        {
          find: 'next/image',
          replacement: `${source}/compat/next-image.tsx`
        },
        {
          find: 'next-intl/server',
          replacement: `${source}/compat/next-intl-server.ts`
        },
        { find: '@', replacement: source }
      ]
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: { usePolling: environment.VITE_USE_POLLING === 'true' },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/v1': { target: apiTarget, changeOrigin: false },
        '/media': { target: mediaTarget, changeOrigin: false }
      }
    },
    preview: { port: 4173, strictPort: true }
  }
})
