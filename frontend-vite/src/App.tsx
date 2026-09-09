import ActivatePage from '@/app/[locale]/activate/page'
import ClipEditorPage from '@/app/[locale]/dashboard/clips/[id]/edit/page'
import ClipDetailPage from '@/app/[locale]/dashboard/clips/[id]/page'
import CreatePage from '@/app/[locale]/dashboard/create/page'
import JobProgressPage from '@/app/[locale]/dashboard/jobs/[id]/page'
import DashboardPage from '@/app/[locale]/dashboard/page'
import ScriptGeneratorPage from '@/app/[locale]/dashboard/script-generator/page'
import ForgotPasswordPage from '@/app/[locale]/forgot-password/page'
import LoginPage from '@/app/[locale]/login/page'
import RegisterPage from '@/app/[locale]/register/page'
import ResetPasswordPage from '@/app/[locale]/reset-password/page'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { NextIntlClientProvider } from 'next-intl'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import enMessages from '../../frontend/messages/en.json'
import roMessages from '../../frontend/messages/ro.json'
import {
  CalendarRoute,
  ClipsRoute,
  DashboardLayout,
  HistoryRoute,
  LegacyDashboardRedirect,
  PublishRoute,
  SettingsRoute
} from './pages/dashboard-pages'
import {
  DataDeletionRoute,
  HomeRoute,
  PricingRoute,
  PrivacyRoute,
  TermsRoute
} from './pages/public-pages'
import { QueryProvider } from './query/query-provider'
import { RouteEffects } from './routing/route-effects'

type AppLocale = 'en' | 'ro'

function localeFromPathname(pathname: string): AppLocale {
  return pathname === '/ro' || pathname.startsWith('/ro/') ? 'ro' : 'en'
}

function ApplicationRoutes({ locale }: { locale: AppLocale }) {
  const prefix = locale === 'ro' ? '/ro' : ''
  const route = (pathname: string) => `${prefix}${pathname}` || '/'

  return (
    <Routes>
      <Route path={route('/')} element={<HomeRoute />} />
      <Route path={route('/pricing')} element={<PricingRoute />} />
      <Route path={route('/privacy')} element={<PrivacyRoute />} />
      <Route path={route('/terms')} element={<TermsRoute />} />
      <Route path={route('/data-deletion')} element={<DataDeletionRoute />} />
      <Route path={route('/login')} element={<LoginPage />} />
      <Route path={route('/register')} element={<RegisterPage />} />
      <Route path={route('/forgot-password')} element={<ForgotPasswordPage />} />
      <Route path={route('/reset-password')} element={<ResetPasswordPage />} />
      <Route path={route('/activate')} element={<ActivatePage />} />

      <Route path={route('/dashboard')} element={<DashboardLayout />}>
        <Route index={true} element={<DashboardPage />} />
        <Route path="clips" element={<ClipsRoute />} />
        <Route path="clips/:id" element={<ClipDetailPage />} />
        <Route path="clips/:id/edit" element={<ClipEditorPage />} />
        <Route path="history" element={<HistoryRoute />} />
        <Route path="calendar" element={<CalendarRoute />} />
        <Route path="publish" element={<PublishRoute />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="script-generator" element={<ScriptGeneratorPage />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route
          path="review"
          element={<LegacyDashboardRedirect page="review" />}
        />
        <Route
          path="analytics"
          element={<LegacyDashboardRedirect page="analytics" />}
        />
        <Route
          path="brand"
          element={
            <Navigate replace={true} to={route('/dashboard/settings?tab=brand')} />
          }
        />
        <Route
          path="billing"
          element={
            <Navigate
              replace={true}
              to={route('/dashboard/settings?tab=billing')}
            />
          }
        />
        <Route path="jobs/:id" element={<JobProgressPage />} />
      </Route>

      <Route path="*" element={<Navigate replace={true} to={route('/')} />} />
    </Routes>
  )
}

function App() {
  const location = useLocation()
  const locale = localeFromPathname(location.pathname)
  const messages = locale === 'ro' ? roMessages : enMessages

  return (
    <ThemeProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryProvider>
          <RouteEffects locale={locale} />
          <ApplicationRoutes locale={locale} />
          <Toaster />
        </QueryProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  )
}

export default App
