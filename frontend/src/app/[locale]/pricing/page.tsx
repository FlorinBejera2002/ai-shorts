import { Film, Check, Zap, Crown, Building2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('pricing')
  const tLanding = await getTranslations('landing')

  const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    credits: '100 credits',
    description: 'Try the full pipeline',
    icon: Zap,
    features: [
      'AI highlight detection',
      'Auto subtitles',
      'Smart crop (9:16)',
      'Basic export (720p)',
      '5 clips per project',
      'Community support',
    ],
    cta: 'Start free',
    highlighted: false,
  },
  {
    name: 'Creator',
    price: '$19',
    period: '/month',
    credits: '300 credits/mo',
    description: 'For solo content creators',
    icon: Film,
    features: [
      'Everything in Free',
      'Full HD export (1080p)',
      '20 clips per project',
      'Batch processing (5 URLs)',
      'Brand kit (colors & fonts)',
      'AI social captions',
      'Trim & re-export',
      'Priority processing',
    ],
    cta: 'Start creating',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    credits: '1,000 credits/mo',
    description: 'For teams & power users',
    icon: Crown,
    features: [
      'Everything in Creator',
      'Batch processing (20 URLs)',
      'Custom watermark',
      'Subtitle styling',
      'API access',
      'Priority support',
      'Analytics dashboard',
      'Export to all platforms',
    ],
    cta: 'Go Pro',
    highlighted: true,
  },
  {
    name: 'Agency',
    price: '$149',
    period: '/month',
    credits: 'High-volume credits',
    description: 'White-label for agencies',
    icon: Building2,
    features: [
      'Everything in Pro',
      'Unlimited batch URLs',
      'White-label exports',
      'Team seats (up to 10)',
      'Custom branding removal',
      'Dedicated support',
      'SLA guarantee',
      'Custom integrations',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
]

const faqs = [
  {
    q: 'What counts as a credit?',
    a: 'Each minute of source video processed uses 1 credit. A 10-minute YouTube video uses 10 credits, regardless of how many clips are generated.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your dashboard — no penalties, no hidden fees. Your credits remain active until the end of your billing period.',
  },
  {
    q: 'Do unused credits roll over?',
    a: 'Monthly credits reset each billing cycle. Need more? Purchase one-time credit packs that never expire.',
  },
  {
    q: 'What video sources are supported?',
    a: 'YouTube URLs and direct file uploads (MP4, MOV, WEBM). We support videos up to 4 hours long.',
  },
  {
    q: 'How long does processing take?',
    a: 'Most videos are processed in 2-5 minutes. Pro and Agency plans get priority queue access for faster turnaround.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted in transit (TLS 1.3) and at rest. We are GDPR compliant and you can export or delete your data at any time.',
  },
]

  return (
    <main className="min-h-dvh bg-background">
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight">ClipForge</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
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
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.name}
                className={`relative rounded-xl p-5 transition-shadow ${
                  plan.highlighted
                    ? 'border-2 border-primary bg-card shadow-lg shadow-primary/5'
                    : 'border border-border bg-card'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    {tLanding('mostPopular')}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    plan.highlighted ? 'bg-primary/10' : 'bg-muted'
                  }`}>
                    <Icon className={`w-4 h-4 ${plan.highlighted ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <h2 className="text-base font-semibold">{plan.name}</h2>
                </div>
                <div className="mt-4 flex items-baseline gap-0.5">
                  <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{plan.credits}</p>
                <p className="mt-3 text-[13px] text-muted-foreground">{plan.description}</p>

                <a
                  href="/register"
                  className={`mt-5 flex w-full justify-center rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 ${
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {plan.cta}
                </a>

                <ul className="mt-5 space-y-2 border-t border-border pt-5">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-[13px]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
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
            {faqs.map((faq) => (
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
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {tLanding('privacy')}
            </Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {tLanding('terms')}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
