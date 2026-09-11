import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const sharedSource = fileURLToPath(new URL('../frontend/src', import.meta.url))
  const publicSource = fileURLToPath(
    new URL('../frontend/public', import.meta.url)
  )
  const localSource = fileURLToPath(new URL('./src', import.meta.url))
  const apiTarget = environment.VITE_DEV_API_TARGET || 'http://localhost:8080'
  const mediaTarget =
    environment.VITE_DEV_MEDIA_TARGET || 'http://localhost:8081'

  return {
    publicDir: publicSource,
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
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss()
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'next-intl', 'zustand'],
      alias: [
        { find: '@/lib/auth', replacement: `${localSource}/lib/auth.ts` },
        {
          find: '@/hooks/use-api-resource',
          replacement: `${localSource}/hooks/use-api-resource.ts`
        },
        {
          find: '@/components/auth/auth-guard',
          replacement: `${localSource}/components/auth/auth-guard.tsx`
        },
        {
          find: '@/components/auth/use-auth',
          replacement: `${localSource}/components/auth/use-auth.ts`
        },
        {
          find: '@/components/billing/plan-price',
          replacement: `${localSource}/components/billing/plan-price.tsx`
        },
        {
          find: '@/components/billing/use-plan-catalog',
          replacement: `${localSource}/components/billing/use-plan-catalog.ts`
        },
        {
          find: '@/i18n/navigation',
          replacement: `${localSource}/i18n/navigation.ts`
        },
        {
          find: 'next/navigation',
          replacement: `${localSource}/compat/next-navigation.ts`
        },
        {
          find: 'next/image',
          replacement: `${localSource}/compat/next-image.tsx`
        },
        {
          find: 'next-intl/server',
          replacement: `${localSource}/compat/next-intl-server.ts`
        },
        { find: '@', replacement: sharedSource }
      ]
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: [sharedSource, publicSource, localSource] },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/v1': { target: apiTarget, changeOrigin: false },
        '/media': { target: mediaTarget, changeOrigin: false }
      }
    },
    preview: { port: 4173, strictPort: true }
  }
})
