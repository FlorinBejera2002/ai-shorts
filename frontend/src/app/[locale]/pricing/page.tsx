import { NavLogo } from '@/components/landing/animated-hero'
import { PublicNavbar } from '@/components/landing/public-navbar'
import { Link } from '@/i18n/navigation'
import {
  INITIAL_FREE_CREDITS,
  PLAN_CREDITS,
  type PaidBillingPlanId
} from '@/lib/billing'
import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import { type BillingPlanPrice, loadBillingPlanCatalog } from '@/lib/stripe'
import { Building2, Check, Crown, Film, Zap } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export const dynamic = 'force-dynamic'

function formatPlanPrice(
  price: BillingPlanPrice | undefined,
  locale: string,
  fallback: string
) {
  if (!price) return fallback
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(price.amount / 100)
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  return buildLocaleMetadata(locale, {
    path: '/pricing',
    title: locale === 'ro' ? 'Prețuri Sneepcut' : 'Sneepcut pricing',
    description:
      locale === 'ro'
        ? 'Compară planurile Sneepcut și alege volumul de procesare potrivit pentru fluxul tău video.'
        : 'Compare Sneepcut plans and choose the processing capacity that fits your video workflow.'
  })
}

export default async function PricingPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('pricing')
  const tLanding = await getTranslations('landing')
  const tBilling = await getTranslations('billing')
  const planData = t.raw('plans')
  const faqs = t.raw('faqs')
  let planCatalog: Awaited<ReturnType<typeof loadBillingPlanCatalog>> | null =
    null
  try {
    planCatalog = await loadBillingPlanCatalog()
  } catch {
    // Never show a marketing price unless it matches the exact active monthly
    // Stripe Price that checkout will charge.
  }

  const plans = [
    { key: 'free', icon: Zap, cta: t('startFree') },
    { key: 'creator', icon: Film, cta: t('startCreating') },
    { key: 'pro', icon: Crown, cta: t('goPro'), highlighted: true },
    { key: 'agency', icon: Building2, cta: t('contactSales') }
  ].map((plan) => {
    const localized = planData[plan.key]
    const paidPlan =
      plan.key === 'free' ? null : (plan.key as PaidBillingPlanId)
    return {
      ...plan,
      ...localized,
      price: paidPlan
        ? formatPlanPrice(
            planCatalog?.[paidPlan],
            locale,
            tBilling('unavailable')
          )
        : localized.price,
      credits: paidPlan
        ? tBilling('creditsMonthly', { credits: PLAN_CREDITS[paidPlan] })
        : tBilling('creditsOnSignup', { credits: INITIAL_FREE_CREDITS })
    }
  })

  return (
    <main className="dark min-h-dvh overflow-hidden bg-[#060608] text-white">
      <PublicNavbar
        labels={{
          pricing: tLanding('pricing'),
          signIn: tLanding('signIn'),
          getStarted: tLanding('getStarted')
        }}
      />

      <section className="px-6 pb-10 pt-32 sm:pt-36">
        <div className="mx-auto grid max-w-7xl gap-5 border-b border-white/[0.08] pb-10 md:grid-cols-[1fr_0.75fr] md:items-end">
          <h1 className="font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-[0.9] tracking-[-0.05em] text-white sm:text-6xl">
            {t('title')}
          </h1>
          <p className="max-w-lg font-[family-name:var(--font-studio)] text-sm leading-7 text-white/40 md:justify-self-end">
            {t('desc')}
          </p>
        </div>
      </section>

      <section className="px-6 pb-28 pt-2">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))] xl:items-stretch">
          {plans.map((plan, index) => {
            const Icon = plan.icon
            return (
              <article
                key={plan.name}
                className={`animate-slide-up relative flex min-h-[580px] w-full min-w-0 flex-col overflow-hidden rounded-[24px] border p-6 transition-all duration-300 ${plan.highlighted ? 'border-violet-300/45 bg-[#15101f] shadow-[0_30px_90px_rgba(109,40,217,0.24),inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-white/[0.14] bg-[#100e14] shadow-[0_22px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)] hover:-translate-y-1 hover:border-violet-200/25 hover:bg-[#131018] hover:shadow-[0_28px_70px_rgba(0,0,0,0.38)]'}`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div
                  className={`absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent to-transparent ${plan.highlighted ? 'via-violet-200/80' : 'via-white/25'}`}
                />
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full border ${plan.highlighted ? 'border-violet-300/20 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/[0.035] text-white/45'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-[family-name:var(--font-studio)] text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
                    0{index + 1}
                  </span>
                </div>

                <div className="mt-8">
                  <div className="flex items-center gap-2">
                    <h2 className="font-[family-name:var(--font-studio)] text-sm font-semibold uppercase tracking-[0.1em] text-white/85">
                      {plan.name}
                    </h2>
                    {plan.highlighted && (
                      <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-violet-200">
                        {tBilling('mostPopular')}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 min-h-12 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                    {plan.description}
                  </p>
                </div>

                <div className="mt-6 border-y border-white/[0.07] py-6">
                  <div className="flex items-end gap-1.5">
                    <span className="font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-none tracking-[-0.05em] text-white">
                      {plan.price}
                    </span>
                    <span className="pb-1 font-[family-name:var(--font-studio)] text-[10px] text-white/30">
                      {plan.period}
                    </span>
                  </div>
                  <p className="mt-3 font-[family-name:var(--font-studio)] text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-200/45">
                    {plan.credits}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature: string) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 font-[family-name:var(--font-studio)] text-[11px] leading-5 text-white/42"
                    >
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.highlighted ? 'text-violet-300' : 'text-white/30'}`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`mt-7 flex min-h-12 items-center justify-center rounded-[13px] border font-[family-name:var(--font-studio)] text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${plan.highlighted ? 'border-white bg-white text-black hover:-translate-y-0.5 hover:shadow-[0_12px_35px_rgba(139,92,246,0.25)]' : 'border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'}`}
                >
                  {plan.cta}
                </Link>
              </article>
            )
          })}
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-[#09080c] px-6 py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <div className="font-[family-name:var(--font-studio)] text-[9px] font-semibold uppercase tracking-[0.28em] text-violet-200/45">
              {locale === 'ro'
                ? 'Tot ce trebuie să știi înainte'
                : 'Everything before you roll'}
            </div>
            <h2 className="mt-5 max-w-md font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-[0.92] tracking-[-0.045em] text-white sm:text-6xl">
              {t('faq')}
            </h2>
          </div>
          <dl className="border-t border-white/[0.08]">
            {faqs.map((faq: { q: string; a: string }, index: number) => (
              <div
                key={faq.q}
                className="grid gap-3 border-b border-white/[0.08] py-6 sm:grid-cols-[32px_0.7fr_1fr] sm:gap-6"
              >
                <span className="font-[family-name:var(--font-studio)] text-[9px] font-bold tracking-[0.18em] text-white/20">
                  0{index + 1}
                </span>
                <dt className="font-[family-name:var(--font-studio)] text-[12px] font-semibold leading-5 text-white/78">
                  {faq.q}
                </dt>
                <dd className="font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] bg-[#050507]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-10 font-[family-name:var(--font-studio)] text-[10px] uppercase tracking-[0.1em] text-white/30">
          <div className="flex items-center gap-5">
            <NavLogo priority={false} />
            <span className="hidden h-7 w-px bg-white/10 sm:block" />
            <span className="hidden sm:inline">
              {tLanding('footer', { year: new Date().getFullYear() })}
            </span>
          </div>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="transition-colors hover:text-white"
            >
              {tLanding('privacy')}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              {tLanding('terms')}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
