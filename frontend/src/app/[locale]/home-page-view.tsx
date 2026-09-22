import {
  SectionReveal,
  StaggerGrid,
  StaggerItem
} from '@/components/landing/animated-hero'
import {
  CropViz,
  HighlightViz,
  ScriptViz
} from '@/components/landing/bento-visuals'
import {
  AnalyzeWorkflowVisual,
  ExportWorkflowVisual,
  UploadWorkflowVisual
} from '@/components/landing/blue-section-visuals'
import { HeroContent } from '@/components/landing/hero-content'
import { HomeNavbar } from '@/components/landing/home-navbar'
import { StudioHero } from '@/components/landing/studio-hero'
import { TransformationStage } from '@/components/landing/transformation-stage'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { BrandLogo } from '@/components/shared/brand-logo'
import { StructuredData } from '@/components/shared/structured-data'
import { Link } from '@/i18n/navigation'
import {
  type SiteLocale,
  buildSoftwareApplicationJsonLd
} from '@/lib/site-config'
import {
  ArrowRight,
  ArrowUpRight,
  Captions,
  Check,
  Clock3,
  PenLine,
  ScanFace,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles
} from 'lucide-react'
import type { getTranslations } from 'next-intl/server'

export function HomePageView({
  locale,
  t
}: {
  locale: string
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const meta =
    locale === 'ro'
      ? {
          sourceLine: 'O sursă. Mai multe clipuri.',
          signal: 'Semnal',
          frame: 'Cadru',
          script: 'Scenariu'
        }
      : {
          sourceLine: 'One source. Multiple cuts.',
          signal: 'Signal',
          frame: 'Frame',
          script: 'Script'
        }

  const steps = [
    {
      icon: Upload,
      title: t('step1Title'),
      desc: t('step1Desc'),
      visual: UploadWorkflowVisual
    },
    {
      icon: WandSparkles,
      title: t('step2Title'),
      desc: t('step2Desc'),
      visual: AnalyzeWorkflowVisual
    },
    {
      icon: Check,
      title: t('step3Title'),
      desc: t('step3Desc'),
      visual: ExportWorkflowVisual
    }
  ]

  const publishingPlatforms = [
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'platformInstagramDesc',
      available: true
    },
    {
      id: 'facebook',
      name: 'Facebook',
      description: 'platformFacebookDesc',
      available: true
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      description: 'platformTikTokDesc',
      available: true
    },
    {
      id: 'youtube',
      name: 'YouTube Shorts',
      description: 'platformYouTubeDesc',
      available: true
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      description: 'platformLinkedInDesc',
      available: false
    },
    {
      id: 'twitter',
      name: 'X',
      description: 'platformXDesc',
      available: false
    }
  ] as const

  const features = [
    { icon: Sparkles, title: t('feat1Title'), desc: t('feat1Desc') },
    { icon: ScanFace, title: t('feat2Title'), desc: t('feat2Desc') },
    { icon: Captions, title: t('feat3Title'), desc: t('feat3Desc') },
    { icon: PenLine, title: t('feat7Title'), desc: t('feat7Desc') }
  ]

  const trust = [
    { icon: ShieldCheck, title: t('trustGdpr'), desc: t('trustGdprDesc') },
    { icon: Clock3, title: t('trustFast'), desc: t('trustFastDesc') },
    { icon: Scissors, title: t('trustViral'), desc: t('trustViralDesc') }
  ]

  return (
    <main className="dark min-h-dvh overflow-hidden bg-[#080808] text-white">
      <StructuredData
        value={buildSoftwareApplicationJsonLd(locale as SiteLocale)}
      />
      <HomeNavbar
        labels={{
          pricing: t('pricing'),
          signIn: t('signIn'),
          getStarted: t('getStarted')
        }}
      />

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

      <section
        id="product-demo"
        className="relative scroll-mt-20 border-b border-white/[0.08] bg-[#090909] py-24 sm:py-32"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:76px_76px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
        <div className="pointer-events-none absolute left-1/2 top-28 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[#5139ef]/10 blur-[150px]" />

        <div className="page-shell relative">
          <SectionReveal className="mb-14 grid gap-8 border-b border-white/[0.08] pb-12 lg:grid-cols-[1.18fr_.82fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#5139ef]/30 bg-[#5139ef]/[0.07] px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5139ef]" />
                00 / {t('productEyebrow')}
              </div>
              <h2 className="mt-6 max-w-4xl text-[clamp(2.8rem,5.5vw,5.7rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-white">
                {t('productTitle')}
              </h2>
            </div>
            <div className="lg:justify-self-end">
              <p className="max-w-lg text-[15px] leading-7 text-white/45 sm:text-base">
                {t('productDesc')}
              </p>
              <div className="mt-6 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                <span className="h-px w-12 bg-[#5139ef]" />
                {meta.sourceLine}
              </div>
            </div>
          </SectionReveal>

          <TransformationStage locale={locale} />

          <SectionReveal className="relative z-10 mx-auto -mt-px grid max-w-[1060px] overflow-hidden rounded-b-2xl border border-white/[0.08] bg-[#0f0f0f]/95 shadow-[0_25px_70px_rgba(0,0,0,.28)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['< 5 min', t('statProcessing')],
              ['9:16', t('statCrop')],
              ['20+', t('statBatch')],
              ['GDPR', t('statGdpr')]
            ].map(([value, label], index) => (
              <div
                key={label}
                className={`group relative px-6 py-7 ${index > 0 ? 'border-t border-white/[0.07] lg:border-l lg:border-t-0' : ''} ${index === 1 ? 'sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 sm:border-t' : ''} ${index === 3 ? 'sm:border-l sm:border-t' : ''}`}
              >
                <span className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[#5139ef] transition-transform duration-500 group-hover:scale-x-100" />
                <div className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                  {value}
                </div>
                <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.15em] text-white/55">
                  {label}
                </div>
              </div>
            ))}
          </SectionReveal>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#5139ef] text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(110deg,transparent_0_45%,white_45%_45.1%,transparent_45.1%_100%)] [background-size:34px_100%]" />
        <div className="page-shell relative flex flex-col gap-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em]">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-white/10">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
            {t('proofLabel')}
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-3 text-[11px] font-bold uppercase tracking-[0.11em] sm:flex sm:flex-wrap sm:items-center">
            {[
              'Instagram',
              'Facebook',
              'TikTok',
              'YouTube Shorts',
              'LinkedIn',
              'X'
            ].map((platform) => (
                <span key={platform} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-white" />
                  {platform}
                </span>
              ))}
          </div>
        </div>
      </section>

      <section className="relative border-b border-white/[0.08] bg-[#0c0c0c] py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.2)_1px,transparent_1px)] [background-size:68px_68px]" />
        <div className="page-shell relative">
          <SectionReveal className="grid gap-8 border-b border-white/[0.08] pb-12 lg:grid-cols-[.78fr_1.22fr] lg:items-end">
            <div>
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.19em] text-[#5139ef]">
                01 / {t('platformsEyebrow')}
              </div>
              <h2 className="mt-5 max-w-xl text-[clamp(2.8rem,5vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
                {t('platformsTitle')}
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-7 text-white/62 lg:justify-self-end">
              {t('platformsDesc')}
            </p>
          </SectionReveal>

          <StaggerGrid className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publishingPlatforms.map((platform, index) => (
              <StaggerItem key={platform.id}>
                <article className="group relative min-h-52 overflow-hidden rounded-md border border-white/[0.09] bg-[#111111] p-6 transition-colors hover:border-[#5139ef]/45">
                  <span className="absolute right-5 top-5 font-mono text-[9px] font-bold tracking-[0.16em] text-white/25">
                    0{index + 1}
                  </span>
                  <PlatformBrandIcon
                    provider={platform.id}
                    className="size-10 bg-white p-1.5"
                  />
                  <div className="mt-7 flex items-center gap-3">
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">
                      {platform.name}
                    </h3>
                    <span
                      className={`rounded-sm px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] ${platform.available ? 'bg-[#5139ef]/16 text-[#9c8fff]' : 'bg-white/[0.06] text-white/42'}`}
                    >
                      {t(platform.available ? 'platformAvailable' : 'platformComingSoon')}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/52">
                    {t(platform.description)}
                  </p>
                </article>
              </StaggerItem>
            ))}
          </StaggerGrid>

          <SectionReveal className="mt-8 grid gap-6 rounded-md border border-[#5139ef]/25 bg-[#5139ef]/[0.07] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.025em] text-white">
                {t('youtubeConnectionTitle')}
              </h3>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/62">
                {t('youtubeConnectionDesc')}
              </p>
            </div>
            <nav
              aria-label={t('youtubeConnectionLinks')}
              className="flex flex-wrap gap-x-5 gap-y-3 text-[9px] font-bold uppercase tracking-[0.12em]"
            >
              <Link
                href="/privacy"
                className="text-white/65 transition-colors hover:text-white"
              >
                {t('privacy')}
              </Link>
              <Link
                href="/terms"
                className="text-white/65 transition-colors hover:text-white"
              >
                {t('terms')}
              </Link>
              <Link
                href="/data-deletion"
                className="text-white/65 transition-colors hover:text-white"
              >
                {t('dataDeletion')}
              </Link>
            </nav>
          </SectionReveal>
        </div>
      </section>

      <section
        id="workflow"
        className="relative scroll-mt-20 border-b border-white/[0.08] bg-[#080808] py-24 sm:py-32"
      >
        <div className="page-shell">
          <SectionReveal className="relative grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div className="flex items-end gap-5">
              <span className="font-mono text-[clamp(4rem,9vw,8rem)] font-bold leading-[0.7] tracking-[-0.08em] text-[#5139ef]">
                01
              </span>
              <span className="mb-1 h-px flex-1 bg-gradient-to-r from-[#5139ef] to-transparent" />
            </div>
            <div>
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.19em] text-[#5139ef]">
                {t('howItWorks')}
              </div>
              <h2 className="mt-5 max-w-3xl text-[clamp(2.7rem,5vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
                {t('howItWorksDesc')}
              </h2>
            </div>
          </SectionReveal>

          <StaggerGrid className="mt-16 grid gap-4 lg:grid-cols-3">
            {steps.map(({ icon: Icon, title, desc, visual: Visual }, index) => (
              <StaggerItem key={title}>
                <article className="group relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101010] p-4 transition-all duration-500 hover:-translate-y-1 hover:border-[#5139ef]/55 hover:shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:p-5">
                  <div className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[#5139ef] transition-transform duration-500 group-hover:scale-x-100" />
                  <Visual />
                  <div className="flex flex-1 flex-col px-2 pb-2 pt-8">
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#5139ef]/25 bg-[#5139ef]/10 text-[#5139ef]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-white/55">
                        0{index + 1} / 03
                      </span>
                    </div>
                    <h3 className="mt-auto pt-12 text-2xl font-semibold tracking-[-0.035em] text-white">
                      {title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/62">
                      {desc}
                    </p>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      <section
        id="features"
        className="relative scroll-mt-20 border-b border-white/[0.08] bg-[#0c0c0c] py-24 sm:py-32"
      >
        <div className="pointer-events-none absolute right-[-10rem] top-20 h-[520px] w-[520px] rounded-full border border-[#5139ef]/10 bg-[#5139ef]/[0.045] blur-3xl" />
        <div className="page-shell relative">
          <SectionReveal className="grid gap-14 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.19em] text-[#5139ef]">
                02 / {t('featuresTitle')}
              </div>
              <h2 className="mt-6 max-w-xl text-[clamp(2.8rem,5vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
                {t('featuresTitle')}
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-7 text-white/62">
                {t('featuresDesc')}
              </p>
            </div>

            <div className="border-t border-white/[0.09]">
              {features.map(({ icon: Icon, title, desc }, index) => (
                <article
                  key={title}
                  className="group grid gap-5 border-b border-white/[0.09] py-7 transition-colors sm:grid-cols-[46px_1fr_36px] sm:items-start sm:py-9"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/45 transition-all duration-300 group-hover:border-[#5139ef]/40 group-hover:bg-[#5139ef] group-hover:text-white">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                      {title}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                      {desc}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-[#5139ef] sm:text-right">
                    0{index + 1}
                  </span>
                </article>
              ))}
            </div>
          </SectionReveal>

          <StaggerGrid className="mt-20 grid gap-4 lg:grid-cols-12">
            <StaggerItem className="lg:col-span-7">
              <div className="group min-h-[260px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131313] p-7 transition-colors hover:border-[#5139ef]/40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#5139ef]">
                      {meta.signal} 01
                    </span>
                    <h3 className="mt-3 text-xl font-semibold">
                      {t('feat1Title')}
                    </h3>
                  </div>
                  <Sparkles className="h-5 w-5 text-[#5139ef]" />
                </div>
                <div className="mt-10 rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-5">
                  <HighlightViz />
                </div>
              </div>
            </StaggerItem>
            <StaggerItem className="lg:col-span-5">
              <div className="group min-h-[260px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131313] p-7 transition-colors hover:border-[#5139ef]/40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#5139ef]">
                      {meta.frame} 02
                    </span>
                    <h3 className="mt-3 text-xl font-semibold">
                      {t('feat2Title')}
                    </h3>
                  </div>
                  <ScanFace className="h-5 w-5 text-[#5139ef]" />
                </div>
                <div className="mt-10 rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-5">
                  <CropViz />
                </div>
              </div>
            </StaggerItem>
            <StaggerItem className="lg:col-span-12">
              <div className="group grid min-h-[240px] gap-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131313] p-7 transition-colors hover:border-[#5139ef]/40 lg:grid-cols-[.65fr_1.35fr] lg:items-center lg:p-9">
                <div>
                  <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#5139ef]">
                    {meta.script} 03
                  </span>
                  <h3 className="mt-3 text-2xl font-semibold">
                    {t('feat7Title')}
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/38">
                    {t('feat7Desc')}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-5">
                  <ScriptViz />
                </div>
              </div>
            </StaggerItem>
          </StaggerGrid>
        </div>
      </section>

      <section className="relative bg-[#080808] py-24 sm:py-32">
        <div className="page-shell">
          <SectionReveal className="grid overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#101010] shadow-[0_40px_120px_rgba(0,0,0,.4)] lg:grid-cols-[1.12fr_.88fr]">
            <div className="relative overflow-hidden bg-[#5139ef] p-8 sm:p-12 lg:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[60px] border-white/[0.06]" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
              <div className="relative">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white/65">
                  03 / Sneepcut
                </span>
                <h2 className="mt-6 max-w-2xl text-[clamp(2.9rem,5vw,5.4rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-white">
                  {t('finalCtaTitle')}
                </h2>
                <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/70">
                  {t('finalCtaDesc')}
                </p>
                <Link
                  href="/register"
                  className="group mt-9 inline-flex min-h-14 items-center gap-5 rounded-xl bg-white px-5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#5139ef] shadow-[0_18px_50px_rgba(0,0,0,.18)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,0,0,.26)]"
                >
                  {t('finalCtaButton')}
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#5139ef] text-white transition-transform group-hover:translate-x-1">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <p className="mt-4 text-xs text-white/55">
                  {t('finalCtaNote')}
                </p>
              </div>
            </div>

            <div className="grid">
              {trust.map(({ icon: Icon, title, desc }, index) => (
                <article
                  key={title}
                  className={`group relative flex gap-5 p-7 transition-colors hover:bg-white/[0.025] sm:p-9 ${index > 0 ? 'border-t border-white/[0.08]' : ''}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#5139ef]/25 bg-[#5139ef]/10 text-[#5139ef] transition-colors group-hover:bg-[#5139ef] group-hover:text-white">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold tracking-[-0.02em] text-white">
                      {title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-white/62">
                      {desc}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </SectionReveal>
        </div>
      </section>

      <footer className="border-t border-white/[0.08] bg-[#080808] text-white/62">
        <div className="h-px bg-gradient-to-r from-transparent via-[#5139ef] to-transparent opacity-65" />
        <div className="page-shell flex flex-col gap-9 py-11 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo onDark={true} />
            <p className="mt-3 text-xs">
              {t('footer', { year: new Date().getFullYear() })}
            </p>
          </div>
          <nav
            aria-label={
              locale === 'ro' ? 'Navigare subsol' : 'Footer navigation'
            }
            className="flex flex-wrap gap-6 text-[10px] font-bold uppercase tracking-[0.12em]"
          >
            {[
              { href: '/pricing', label: 'pricing' },
              { href: '/legal-notice', label: 'legalNotice' },
              { href: '/privacy', label: 'privacy' },
              { href: '/terms', label: 'terms' },
              { href: '/cookie-policy', label: 'cookiePolicy' },
              { href: '/data-deletion', label: 'dataDeletion' }
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="transition-colors hover:text-white"
              >
                {t(label)}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  )
}
