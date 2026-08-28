import {
  AnimatedStat,
  BentoCard,
  CtaSection,
  NavLogo,
  SectionReveal,
  StaggerGrid,
  StaggerItem,
  StepCard
} from '@/components/landing/animated-hero'
import {
  CropViz,
  HighlightViz,
  ScriptViz
} from '@/components/landing/bento-visuals'
import { HeroContent } from '@/components/landing/hero-content'
import { ProductMockup } from '@/components/landing/product-mockup'
import { PublicNavbar } from '@/components/landing/public-navbar'
import { StudioHero } from '@/components/landing/studio-hero'
import { Link } from '@/i18n/navigation'
import {
  ArrowRight,
  BarChart3,
  Clock,
  Download,
  Palette,
  PenLine,
  Scissors,
  Share2,
  Shield,
  Sparkles,
  Type,
  Upload,
  Wand2,
  Zap
} from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function HomePage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('landing')

  const smallFeatures = [
    { icon: Type, title: t('feat3Title'), desc: t('feat3Desc') },
    { icon: Share2, title: t('feat4Title'), desc: t('feat4Desc') },
    { icon: Palette, title: t('feat5Title'), desc: t('feat5Desc') }
  ]

  const steps = [
    { icon: Upload, step: '1', title: t('step1Title'), desc: t('step1Desc') },
    { icon: Wand2, step: '2', title: t('step2Title'), desc: t('step2Desc') },
    { icon: Download, step: '3', title: t('step3Title'), desc: t('step3Desc') }
  ]

  const stats = [
    { value: '< 5 min', label: t('statProcessing') },
    { value: '9:16', label: t('statCrop') },
    { value: '20+', label: t('statBatch') },
    { value: 'GDPR', label: t('statGdpr') }
  ]

  const productDetails = [
    { icon: Sparkles, number: '01', title: t('productDetail1Title'), desc: t('productDetail1Desc') },
    { icon: Scissors, number: '02', title: t('productDetail2Title'), desc: t('productDetail2Desc') },
    { icon: Type, number: '03', title: t('productDetail3Title'), desc: t('productDetail3Desc') },
    { icon: BarChart3, number: '04', title: t('productDetail4Title'), desc: t('productDetail4Desc') }
  ]

  return (
    <main className="dark min-h-dvh bg-[#060608] text-white">
      <PublicNavbar labels={{ pricing: t('pricing'), signIn: t('signIn'), getStarted: t('getStarted') }} />

      {/* Studio Hero */}
      <StudioHero>
        <HeroContent
          labels={{
            badge: t('badge'),
            heroTitle1: t('heroTitle1'),
            heroTitle2: t('heroTitle2'),
            heroDesc: t('heroDesc'),
            ctaFree: t('ctaFree'),
            ctaPricing: t('ctaPricing'),
            ctaNote: t('ctaNote')
          }}
        />
      </StudioHero>

      {/* Phone mockup showcase */}
      <section className="relative z-20 overflow-hidden bg-[#060608] pt-14 pb-20 sm:py-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-20">
          <div>
            <SectionReveal className="max-w-3xl">
              <div className="font-[family-name:var(--font-studio)] text-[9px] font-semibold uppercase tracking-[0.3em] text-violet-200/55">
                {t('productEyebrow')}
              </div>
              <h2 className="mt-5 max-w-2xl font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-[0.95] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
                {t('productTitle')}
              </h2>
              <p className="mt-5 max-w-xl font-[family-name:var(--font-studio)] text-sm leading-7 text-white/40">
                {t('productDesc')}
              </p>
            </SectionReveal>

            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {productDetails.map(({ icon: Icon, number, title, desc }) => (
                <SectionReveal key={number}>
                  <div className="group border-t border-white/[0.08] pt-4">
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-violet-200/65 transition-colors group-hover:border-violet-300/25 group-hover:text-violet-100">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-[family-name:var(--font-studio)] text-[9px] font-bold tracking-[0.2em] text-white/20">{number}</span>
                    </div>
                    <h3 className="mt-4 font-[family-name:var(--font-studio)] text-[12px] font-semibold uppercase tracking-[0.08em] text-white/80">{title}</h3>
                    <p className="mt-2 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">{desc}</p>
                  </div>
                </SectionReveal>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <ProductMockup
              labels={{
                transcription: t('mockTranscription'),
                clipsReady: t('mockClipsReady'),
                viralScore: t('mockViralScore'),
                autoCaptions: t('mockAutoCaptions'),
                captions: [t('mockCaption1'), t('mockCaption2'), t('mockCaption3')]
              }}
            />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-[#060608] px-6 py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0a090d] sm:grid-cols-4">
          {stats.map((s, index) => (
            <div key={s.label} className={`${index % 2 !== 0 ? 'border-l' : ''} ${index > 1 ? 'border-t sm:border-t-0' : ''} sm:border-l first:sm:border-l-0 border-white/[0.07]`}>
              <AnimatedStat value={s.value} label={s.label} />
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-6 py-28 sm:py-32">
        <SectionReveal className="grid gap-5 border-b border-white/[0.08] pb-10 md:grid-cols-[1fr_0.7fr] md:items-end">
          <h2 className="max-w-2xl font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-[0.92] tracking-[-0.045em] text-white sm:text-6xl">
            {t('howItWorks')}
          </h2>
          <p className="max-w-md font-[family-name:var(--font-studio)] text-sm leading-7 text-white/40 md:justify-self-end">
            {t('howItWorksDesc')}
          </p>
        </SectionReveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <StepCard
                key={s.title}
                step={s.step}
                isLast={i === steps.length - 1}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035]">
                  <Icon className="h-4 w-4 text-violet-200/75" />
                </div>
                <div className="mt-8 font-[family-name:var(--font-studio)] text-[9px] font-bold uppercase tracking-[0.2em] text-violet-200/45">
                  {t('stepLabel', { n: s.step })}
                </div>
                <h3 className="mt-2 font-[family-name:var(--font-studio)] text-[15px] font-semibold text-white/90">{s.title}</h3>
                <p className="mt-3 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                  {s.desc}
                </p>
              </StepCard>
            )
          })}
        </div>
      </section>

      {/* Features grid */}
      <section className="relative overflow-hidden border-y border-white/[0.06] bg-[#09080c]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-violet-500/[0.035] to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 py-28 sm:py-32">
          <SectionReveal className="max-w-3xl">
            <h2 className="font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-[0.92] tracking-[-0.045em] text-white sm:text-6xl">
              {t('featuresTitle')}
            </h2>
            <p className="mt-5 max-w-xl font-[family-name:var(--font-studio)] text-sm leading-7 text-white/40">
              {t('featuresDesc')}
            </p>
          </SectionReveal>
          <StaggerGrid className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StaggerItem className="sm:col-span-2">
              <BentoCard className="h-full p-7 !border-white/[0.08] !bg-[#0d0b12]">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-white">
                  {t('feat1Title')}
                </h3>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">
                  {t('feat1Desc')}
                </p>
                <HighlightViz />
              </BentoCard>
            </StaggerItem>

            <StaggerItem>
              <BentoCard className="h-full p-7 !border-white/[0.08] !bg-[#0d0b12]">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-white">
                  {t('feat2Title')}
                </h3>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">
                  {t('feat2Desc')}
                </p>
                <CropViz />
              </BentoCard>
            </StaggerItem>

            {smallFeatures.map((f) => {
              const Icon = f.icon
              return (
                <StaggerItem key={f.title}>
                  <BentoCard className="h-full p-7 !border-white/[0.08] !bg-[#0d0b12]">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-purple-400" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-semibold text-white">
                      {f.title}
                    </h3>
                    <p className="mt-1 text-xs text-white/50 leading-relaxed">
                      {f.desc}
                    </p>
                  </BentoCard>
                </StaggerItem>
              )
            })}

            <StaggerItem>
              <BentoCard className="h-full p-7 !border-white/[0.08] !bg-[#0d0b12]">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-white">
                  {t('feat6Title')}
                </h3>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">
                  {t('feat6Desc')}
                </p>
              </BentoCard>
            </StaggerItem>

            <StaggerItem className="sm:col-span-2">
              <BentoCard className="h-full p-7 !border-white/[0.08] !bg-[#0d0b12]">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <PenLine className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-white">
                  {t('feat7Title')}
                </h3>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">
                  {t('feat7Desc')}
                </p>
                <ScriptViz />
              </BentoCard>
            </StaggerItem>
          </StaggerGrid>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <StaggerGrid className="grid overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0a090d] sm:grid-cols-3">
          <StaggerItem>
            <div className="flex min-h-40 items-start gap-4 p-7">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/15 bg-emerald-500/[0.06]">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-studio)] text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{t('trustGdpr')}</h3>
                <p className="mt-2 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                  {t('trustGdprDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex min-h-40 items-start gap-4 border-t border-white/[0.07] p-7 sm:border-t-0 sm:border-l">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-300/15 bg-violet-500/[0.06]">
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-studio)] text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{t('trustFast')}</h3>
                <p className="mt-2 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                  {t('trustFastDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex min-h-40 items-start gap-4 border-t border-white/[0.07] p-7 sm:border-t-0 sm:border-l">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-300/15 bg-cyan-500/[0.06]">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-studio)] text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{t('trustViral')}</h3>
                <p className="mt-2 font-[family-name:var(--font-studio)] text-xs leading-6 text-white/35">
                  {t('trustViralDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
        </StaggerGrid>
      </section>

      {/* Final CTA */}
      <CtaSection>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
          <SectionReveal className="relative overflow-hidden rounded-[32px] border border-white/[0.1] bg-[#0c0912] px-6 py-20 text-center shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:px-12">
            <div className="pointer-events-none absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-violet-200/40 to-transparent" />
            <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-cinematic)] text-5xl font-medium leading-[0.92] tracking-[-0.05em] text-white sm:text-7xl">
              {t('finalCtaTitle')}
            </h2>
            <p className="mx-auto mt-6 max-w-md font-[family-name:var(--font-studio)] text-sm leading-7 text-white/40">
              {t('finalCtaDesc')}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="group inline-flex min-h-13 items-center gap-3 rounded-[14px] border border-violet-200/25 bg-white px-6 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.1em] text-black shadow-[0_14px_45px_rgba(139,92,246,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_60px_rgba(139,92,246,0.34)]"
              >
                {t('finalCtaButton')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-5 font-[family-name:var(--font-studio)] text-[10px] tracking-[0.04em] text-white/25">
              {t('finalCtaNote')}
            </p>
          </SectionReveal>
        </div>
      </CtaSection>

      <footer className="border-t border-white/[0.06] bg-[#050507]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-10 font-[family-name:var(--font-studio)] text-[10px] uppercase tracking-[0.1em] text-white/30">
          <div className="flex items-center gap-5">
            <NavLogo />
            <span className="hidden h-7 w-px bg-white/10 sm:block" />
            <span className="hidden sm:inline">{t('footer', { year: new Date().getFullYear() })}</span>
          </div>
          <div className="flex gap-6">
            <Link
              href="/pricing"
              className="hover:text-white transition-colors"
            >
              {t('pricing')}
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              {t('privacy')}
            </Link>
            <Link
              href="/terms"
              className="hover:text-white transition-colors"
            >
              {t('terms')}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
