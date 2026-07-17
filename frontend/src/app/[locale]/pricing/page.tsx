import { Link } from '@/i18n/navigation'
import { Building2, Check, Crown, Film, Zap } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function PricingPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('pricing')
  const tLanding = await getTranslations('landing')
  const tBilling = await getTranslations('billing')

  const planData = t.raw('plans')
  const faqData = t.raw('faqs')

  const plans = [
    {
      name: planData.free.name,
      price: planData.free.price,
      period: planData.free.period,
      credits: planData.free.credits,
      description: planData.free.description,
      icon: Zap,
      features: planData.free.features,
      cta: t('startFree'),
      highlighted: false
    },
    {
      name: planData.creator.name,
      price: planData.creator.price,
      period: planData.creator.period,
      credits: planData.creator.credits,
      description: planData.creator.description,
      icon: Film,
      features: planData.creator.features,
      cta: t('startCreating'),
      highlighted: false
    },
    {
      name: planData.pro.name,
      price: planData.pro.price,
      period: planData.pro.period,
      credits: planData.pro.credits,
      description: planData.pro.description,
      icon: Crown,
      features: planData.pro.features,
      cta: t('goPro'),
      highlighted: true
    },
    {
      name: planData.agency.name,
      price: planData.agency.price,
      period: planData.agency.period,
      credits: planData.agency.credits,
      description: planData.agency.description,
      icon: Building2,
      features: planData.agency.features,
      cta: t('contactSales'),
      highlighted: false
    }
  ]

  const faqs = faqData

  return (
    <main className="min-h-dvh bg-background">
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight">
              ClipForge
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {tLanding('signIn')}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tLanding('getStarted')}
            </Link>
          </div>
        </div>
      </nav>

      <section className="px-6 pt-16 pb-12">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground leading-relaxed">
            {t('desc')}
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, idx) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.name}
                className={`relative rounded-xl p-6 transition-all border ${
                  plan.highlighted
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary bg-card shadow-xl shadow-primary/10'
                    : 'border-border bg-card hover:border-border/50 hover:shadow-md'
                } animate-slide-up`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    {tBilling('mostPopular')}
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 mb-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                      plan.highlighted ? 'bg-primary/10' : 'bg-muted'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${plan.highlighted ? 'text-primary' : 'text-muted-foreground'}`}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {plan.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {plan.description}
                    </p>
                  </div>
                </div>

                <div className="mb-5 pb-5 border-b border-border">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {plan.credits}
                  </p>
                </div>

                <Link
                  href="/register"
                  className={`mb-5 flex w-full justify-center rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all ${
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  {plan.cta}
                </Link>

                <ul className="space-y-2">
                  {plan.features.map((feat: string) => (
                    <li
                      key={feat}
                      className="flex items-start gap-2 text-[12px] text-muted-foreground"
                    >
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            {t('faq')}
          </h2>
          <dl className="mt-10 space-y-0 divide-y divide-border">
            {faqs.map((faq: { q: string; a: string }) => (
              <div key={faq.q} className="py-5">
                <dt className="text-[14px] font-medium">{faq.q}</dt>
                <dd className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {tLanding('footer', { year: new Date().getFullYear() })}
          </p>
          <div className="flex gap-4">
            <Link
              href="/privacy"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tLanding('privacy')}
            </Link>
            <Link
              href="/terms"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tLanding('terms')}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
