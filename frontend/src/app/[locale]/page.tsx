import { Link } from '@/i18n/navigation'
import {
  Film,
  Sparkles,
  Scissors,
  Type,
  Share2,
  ArrowRight,
  Upload,
  Wand2,
  Download,
  Zap,
  Shield,
  Clock,
  BarChart3,
  Palette,
} from 'lucide-react'

const features = [
  {
    icon: Sparkles,
    title: 'AI highlight detection',
    desc: 'Gemini 2.5 Flash analyzes your transcript and finds the most viral-worthy moments with hook scoring',
  },
  {
    icon: Scissors,
    title: 'Smart vertical crop',
    desc: 'Face and speaker tracking ensures the subject stays centered in 9:16 format',
  },
  {
    icon: Type,
    title: 'Auto subtitles',
    desc: 'Whisper transcription with multiple caption styles burned directly into your clips',
  },
  {
    icon: Share2,
    title: 'AI social captions',
    desc: 'Auto-generated descriptions and hashtags optimized for TikTok, Instagram, and YouTube',
  },
  {
    icon: Palette,
    title: 'Brand kit',
    desc: 'Custom colors, fonts, subtitle styles and watermarks applied consistently across all clips',
  },
  {
    icon: Zap,
    title: 'Batch processing',
    desc: 'Process up to 20 YouTube URLs at once — perfect for repurposing entire playlists',
  },
]

const steps = [
  {
    icon: Upload,
    step: '1',
    title: 'Upload or paste URL',
    desc: 'Drop a video file or paste any YouTube link',
  },
  {
    icon: Wand2,
    step: '2',
    title: 'AI processes everything',
    desc: 'Transcription, highlight detection, cropping, subtitles — all automated',
  },
  {
    icon: Download,
    step: '3',
    title: 'Review & export',
    desc: 'Trim, preview, and download your viral-ready short-form clips',
  },
]

const stats = [
  { value: '< 5 min', label: 'Processing time' },
  { value: '9:16', label: 'Auto crop ratio' },
  { value: '20+', label: 'Clips per batch' },
  { value: 'GDPR', label: 'Compliant' },
]

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight">ClipForge</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="hidden sm:inline text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
        <div className="max-w-2xl animate-slide-up">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="w-3 h-3" />
            AI-powered video clipping
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight leading-[1.1] md:text-5xl">
            Turn long videos into
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              ready-to-post shorts
            </span>
          </h1>
          <p className="mt-5 text-[15px] text-muted-foreground leading-relaxed max-w-lg">
            Upload a video or paste a YouTube URL. ClipForge transcribes,
            detects viral hooks, crops for vertical, adds captions, and
            generates platform-ready clips — in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start free — 100 credits
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-border px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-bold tracking-tight">{s.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Three steps. Zero editing skills required.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={s.title}
                className="relative rounded-xl bg-card border border-border p-6 text-center animate-slide-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mx-auto w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="mt-3 text-[11px] font-bold text-primary uppercase tracking-wider">
                  Step {s.step}
                </div>
                <h3 className="mt-1 text-[14px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Features grid */}
      <section className="bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Everything you need to go viral
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A complete pipeline from raw footage to platform-ready shorts
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="rounded-xl bg-card border border-border p-5 animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">GDPR compliant</h3>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Full data export, account deletion, and privacy controls built in
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">Fast processing</h3>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Most videos processed in under 5 minutes with priority queue for paid plans
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">Viral score analytics</h3>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                AI-scored clips ranked by viral potential so you post the best content first
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to create viral shorts?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
            Join creators who save hours every week repurposing long-form content into
            short-form clips that drive engagement.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started for free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            100 free credits. No credit card required.
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; 2026 ClipForge. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
