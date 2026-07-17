import { Check, Zap } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function BillingPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('billing')

  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true, plan: true }
      })
    : null

  const plans = [
    {
      name: t('free'),
      price: '$0',
      period: t('plans.free.period') ?? 'forever',
      credits: '30 credits/mo',
      features: ['5 clips per job', 'Standard quality', '720p export'],
      current: true
    },
    {
      name: t('creator'),
      price: '$19',
      period: '/month',
      credits: '300 credits/mo',
      features: ['15 clips per job', 'HD quality', '1080p export', 'Brand kit'],
      highlighted: true
    },
    {
      name: t('pro'),
      price: '$49',
      period: '/month',
      credits: '1,000 credits/mo',
      features: [
        'Unlimited clips per job',
        '4K quality',
        'Priority processing',
        'Brand kit',
        'API access'
      ]
    },
    {
      name: t('agency'),
      price: '$149',
      period: '/month',
      credits: 'Unlimited',
      features: [
        'Everything in Pro',
        'Team accounts',
        'White-label exports',
        'Dedicated support'
      ]
    }
  ]

  const currentPlan = (user?.plan ?? 'free').toLowerCase()

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('remaining', { credits: user?.credits ?? 0 })}
      />

      <div className="mt-8 mb-10 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-background border border-primary/20 p-6 animate-slide-up">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {t('remaining', { credits: 0 }).split(' ')[0]}{' '}
              {t('common.credits', { count: user?.credits ?? 0 }).slice(-7)}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-foreground">
                {user?.credits ?? 0}
              </span>
              <span className="text-lg text-muted-foreground">credits</span>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Plan:{' '}
              <span className="font-semibold text-foreground capitalize">
                {t(currentPlan)}
              </span>
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-7 w-7 text-primary" strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold mb-5">{t('plans') ?? 'Plans'}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border p-5 transition-all animate-slide-up ${
                plan.highlighted
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-card shadow-lg shadow-primary/5'
                  : plan.current && currentPlan === plan.name.toLowerCase()
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-card'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-primary-foreground uppercase tracking-wider">
                  {t('popular')}
                </div>
              )}
              {plan.current &&
                currentPlan === plan.name.toLowerCase() &&
                !plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground/10 px-3 py-0.5 text-[10px] font-bold text-foreground uppercase tracking-wider">
                    {t('currentPlan')}
                  </div>
                )}

              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">
                  {plan.period}
                </span>
              </div>
              <p className="text-[13px] font-medium text-foreground mb-1">
                {plan.name}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {plan.credits}
              </p>

              <ul className="mb-5 space-y-2 border-b border-border pb-5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[12px] text-muted-foreground"
                  >
                    <Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all ${
                  currentPlan === plan.name.toLowerCase()
                    ? 'bg-muted text-foreground/60 cursor-default'
                    : plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {currentPlan === plan.name.toLowerCase()
                  ? t('currentPlan')
                  : t('common.upgrade')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
