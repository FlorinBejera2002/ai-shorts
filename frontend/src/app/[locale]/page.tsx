import {
  AnimatedStat,
  BentoCard,
  CtaSection,
  FloatingElements,
  HeroSection,
  NavLogo,
  SectionReveal,
  StaggerGrid,
  StaggerItem,
  StepCard,
  TextReveal
} from '@/components/landing/animated-hero'
import {
  CropViz,
  HighlightViz,
  ScriptViz
} from '@/components/landing/bento-visuals'
import { ProductMockup } from '@/components/landing/product-mockup'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
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

  return (
    <main className="min-h-dvh bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
          <NavLogo />
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Link
              href="/pricing"
              className="hidden sm:inline text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('pricing')}
            </Link>
            <Link
              href="/login"
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('signIn')}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('getStarted')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <HeroSection>
        <FloatingElements />
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <TextReveal>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <Sparkles className="w-3 h-3" />
                  {t('badge')}
                </div>
              </TextReveal>
              <TextReveal delay={0.1}>
                <h1 className="mt-5 text-4xl font-semibold tracking-tight leading-[1.1] md:text-5xl lg:text-6xl">
                  {t('heroTitle1')}
                  <br />
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {t('heroTitle2')}
                  </span>
                </h1>
              </TextReveal>
              <TextReveal delay={0.2}>
                <p className="mt-5 text-[15px] text-muted-foreground leading-relaxed max-w-lg">
                  {t('heroDesc')}
                </p>
              </TextReveal>
              <TextReveal delay={0.3}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {t('ctaFree')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href="/pricing"
                    className="rounded-lg border border-border px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
                  >
                    {t('ctaPricing')}
                  </Link>
                </div>
              </TextReveal>
              <TextReveal delay={0.4}>
                <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground/70">
                    {t('platformsLabel')}
                  </span>
                  {[
                    'TikTok',
                    'Instagram Reels',
                    'YouTube Shorts',
                    'LinkedIn'
                  ].map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 font-medium"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </TextReveal>
            </div>
            <div className="hidden lg:flex items-center justify-center">
              <ProductMockup
                labels={{
                  transcription: t('mockTranscription'),
                  clipsReady: t('mockClipsReady'),
                  viralScore: t('mockViralScore'),
                  autoCaptions: t('mockAutoCaptions'),
                  captions: [
                    t('mockCaption1'),
                    t('mockCaption2'),
                    t('mockCaption3')
                  ]
                }}
              />
            </div>
          </div>
        </div>
      </HeroSection>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {stats.map((s) => (
            <AnimatedStat key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionReveal className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('howItWorks')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('howItWorksDesc')}
          </p>
        </SectionReveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <StepCard
                key={s.title}
                step={s.step}
                isLast={i === steps.length - 1}
              >
                <div className="mx-auto w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="mt-3 text-[11px] font-bold text-primary uppercase tracking-wider">
                  {t('stepLabel', { n: s.step })}
                </div>
                <h3 className="mt-1 text-[14px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </StepCard>
            )
          })}
        </div>
      </section>

      {/* Features grid */}
      <section className="bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionReveal className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('featuresTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('featuresDesc')}
            </p>
          </SectionReveal>
          <StaggerGrid className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Large: AI highlight detection with live viz */}
            <StaggerItem className="sm:col-span-2">
              <BentoCard className="p-5 h-full">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">
                  {t('feat1Title')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t('feat1Desc')}
                </p>
                <HighlightViz />
              </BentoCard>
            </StaggerItem>

            {/* Smart crop with tracking viz */}
            <StaggerItem>
              <BentoCard className="p-5 h-full">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-primary" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">
                  {t('feat2Title')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t('feat2Desc')}
                </p>
                <CropViz />
              </BentoCard>
            </StaggerItem>

            {smallFeatures.map((f) => {
              const Icon = f.icon
              return (
                <StaggerItem key={f.title}>
                  <BentoCard className="p-5 h-full">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-semibold">
                      {f.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </BentoCard>
                </StaggerItem>
              )
            })}

            {/* Batch processing */}
            <StaggerItem>
              <BentoCard className="p-5 h-full">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">
                  {t('feat6Title')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t('feat6Desc')}
                </p>
              </BentoCard>
            </StaggerItem>

            {/* Large: AI script generator with viz */}
            <StaggerItem className="sm:col-span-2">
              <BentoCard className="p-5 h-full">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <PenLine className="w-4 h-4 text-primary" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">
                  {t('feat7Title')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t('feat7Desc')}
                </p>
                <ScriptViz />
              </BentoCard>
            </StaggerItem>
          </StaggerGrid>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <StaggerGrid className="grid gap-6 sm:grid-cols-3">
          <StaggerItem>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-success" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">{t('trustGdpr')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {t('trustGdprDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">{t('trustFast')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {t('trustFastDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">{t('trustViral')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {t('trustViralDesc')}
                </p>
              </div>
            </div>
          </StaggerItem>
        </StaggerGrid>
      </section>

      {/* Final CTA */}
      <CtaSection>
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <SectionReveal>
            <h2 className="text-3xl font-semibold tracking-tight">
              {t('finalCtaTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
              {t('finalCtaDesc')}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('finalCtaButton')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {t('finalCtaNote')}
            </p>
          </SectionReveal>
        </div>
      </CtaSection>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{t('footer', { year: new Date().getFullYear() })}</span>
          <div className="flex gap-4">
            <Link
              href="/pricing"
              className="hover:text-foreground transition-colors"
            >
              {t('pricing')}
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              {t('privacy')}
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              {t('terms')}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
