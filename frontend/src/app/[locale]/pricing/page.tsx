import { PublicFooter } from '@/components/landing/public-footer'
import { PublicNavbar } from '@/components/landing/public-navbar'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
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
    <main className="min-h-dvh bg-background text-foreground">
      <PublicNavbar
        labels={{
          pricing: tLanding('pricing'),
          signIn: tLanding('signIn'),
          getStarted: tLanding('getStarted')
        }}
      />
      <section className="mx-auto max-w-7xl px-6 pb-12 pt-36 text-center">
        <Badge variant="outline" className="mb-5 text-primary">
          sneepcut studio
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          {t('desc')}
        </p>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-6 pb-20 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const Icon = plan.icon
          return (
            <Card
              as="article"
              key={plan.key}
              className={`relative min-w-0 gap-6 shadow-none ${plan.highlighted ? 'border-primary ring-1 ring-primary/20' : ''}`}
            >
              <CardHeader>
                <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
                  <Icon className="size-5 text-primary" />
                  {plan.highlighted && (
                    <Badge className="text-[10px]">
                      {tBilling('mostPopular')}
                    </Badge>
                  )}
                </div>
                <CardTitle>
                  <h2 className="text-xl">{plan.name}</h2>
                </CardTitle>
                <CardDescription className="min-h-12 leading-6">
                  {plan.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="border-y py-5">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {plan.period}
                    </span>
                  </p>
                  <p className="mt-3 text-xs font-medium text-primary">
                    {plan.credits}
                  </p>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature: string) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
                    >
                      <Check className="mt-1 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  asChild={true}
                  variant={plan.highlighted ? 'default' : 'outline'}
                  className="h-11 w-full"
                >
                  <Link href="/register">{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </section>
      <section className="border-y bg-card px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <h2 className="text-3xl font-semibold">{t('faq')}</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {locale === 'ro'
                ? 'Tot ce trebuie să știi înainte să începi.'
                : 'Everything you need to know before you start.'}
            </p>
          </div>
          <Accordion type="single" collapsible={true}>
            {faqs.map((faq: { q: string; a: string }, index: number) => (
              <AccordionItem key={faq.q} value={String(index)}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <PublicFooter />
    </main>
  )
}
