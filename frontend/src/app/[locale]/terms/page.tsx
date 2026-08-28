import { PublicNavbar } from '@/components/landing/public-navbar'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export const metadata = {
  title: 'Terms of Service — ClipForge',
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('landing')

  return (
    <main className="dark min-h-dvh bg-[#060608] text-white">
      <PublicNavbar labels={{ pricing: t('pricing'), signIn: t('signIn'), getStarted: t('getStarted') }} />

      <article className="mx-auto max-w-3xl px-6 pb-20 pt-36 animate-fade-in">
        <h1 className="font-[family-name:var(--font-cinematic)] text-5xl font-medium tracking-[-0.045em]">Terms of Service</h1>
        <p className="mt-3 font-[family-name:var(--font-studio)] text-xs text-white/30">Last updated: June 30, 2026</p>

        <div className="mt-10 space-y-6 font-[family-name:var(--font-studio)] text-[13px] leading-7 text-white/45 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-white/85 [&_strong]:text-white/75">
          <p>
            By using ClipForge, you agree to these terms. If you do not agree, do not use the service.
          </p>

          <h2>1. Service Description</h2>
          <p>ClipForge is an AI-powered video clipping platform that generates short-form clips from longer videos. The service includes video processing, AI-powered highlight detection, subtitle generation, and social media caption creation.</p>

          <h2>2. Account &amp; Eligibility</h2>
          <p>You must be at least 16 years old and provide accurate registration information. You are responsible for maintaining the security of your account credentials. Notify us immediately of any unauthorized access.</p>

          <h2>3. Content Ownership &amp; Rights</h2>
          <p><strong>Your content:</strong> You retain all rights to videos you upload and clips generated from them. You grant ClipForge a limited license to process, store, and deliver your content solely to provide the service.</p>
          <p><strong>Your responsibility:</strong> You must have the right to use any video you upload. You are solely responsible for ensuring your content does not infringe copyright, trademarks, or other rights of third parties.</p>
          <p><strong>DMCA:</strong> We respond promptly to valid DMCA takedown notices. Repeat infringers will have their accounts terminated.</p>

          <h2>4. Credits &amp; Billing</h2>
          <p>Processing consumes credits based on the number of clips requested and video duration. Credits are non-refundable except where required by law. Failed or cancelled jobs are automatically refunded. Subscription plans renew automatically unless cancelled before the billing period.</p>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Upload content you do not have rights to process</li>
            <li>Use the service to create harmful, illegal, or infringing content</li>
            <li>Attempt to circumvent rate limits, security measures, or access controls</li>
            <li>Reverse-engineer, scrape, or abuse the API</li>
            <li>Share account credentials with others</li>
            <li>Upload malicious files or attempt to exploit the processing pipeline</li>
          </ul>

          <h2>6. Service Availability</h2>
          <p>We aim for high availability but do not guarantee uninterrupted service. Processing times depend on video length, queue depth, and system load. We reserve the right to modify, suspend, or discontinue the service with reasonable notice.</p>

          <h2>7. Limitation of Liability</h2>
          <p>ClipForge is provided &quot;as is&quot; without warranties. We are not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 12 months preceding the claim.</p>

          <h2>8. Termination</h2>
          <p>Either party may terminate the agreement at any time. Upon termination, your data will be deleted within 30 days. We may terminate accounts that violate these terms without notice.</p>

          <h2>9. Governing Law</h2>
          <p>These terms are governed by the laws of Romania and the European Union. Disputes will be resolved in the courts of Bucharest, Romania.</p>

          <h2>10. Changes</h2>
          <p>We may update these terms. Material changes will be communicated at least 30 days in advance. Continued use constitutes acceptance.</p>

          <h2>11. Contact</h2>
          <p>Questions about these terms: <strong>legal@clipforge.app</strong></p>
        </div>
      </article>
    </main>
  )
}
