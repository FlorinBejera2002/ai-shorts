import { Check } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function BillingPage({
  params,
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
        select: { credits: true, plan: true },
      })
    : null

  const plans = [
    {
      name: t('free'),
      price: '$0',
      period: t('plans.free.period') ?? 'forever',
      credits: '30 credits/mo',
      features: ['5 clips per job', 'Standard quality', '720p export'],
      current: true,
    },
    {
      name: t('creator'),
      price: '$19',
      period: '/month',
      credits: '300 credits/mo',
      features: ['15 clips per job', 'HD quality', '1080p export', 'Brand kit'],
      highlighted: true,
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
        'API access',
      ],
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
        'Dedicated support',
      ],
    },
  ]

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('remaining', { credits: user?.credits ?? 0 })} &middot;{' '}
        <span className="capitalize">{t(user?.plan ?? 'free')}</span> {t('plan')}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan, i) => (
          <div
            key={plan.name}
            className={`rounded-xl p-4 animate-slide-up ${
              plan.highlighted
                ? 'bg-primary/5 border-2 border-primary/30'
                : 'bg-card border border-border'
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{plan.name}</span>
              {plan.highlighted && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {t('popular')}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-0.5">
              <span className="text-2xl font-semibold">{plan.price}</span>
              <span className="text-xs text-muted-foreground">
                {plan.period}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.credits}
            </p>
            <ul className="mt-4 space-y-1.5">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Check className="w-3 h-3 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-4 w-full rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                plan.highlighted
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              {(user?.plan ?? 'free') === plan.name.toLowerCase()
                ? t('currentPlan')
                : t('common.upgrade')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
