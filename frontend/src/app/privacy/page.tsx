import { Film } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — ClipForge',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight">ClipForge</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-xs text-muted-foreground">Last updated: June 30, 2026</p>

        <div className="mt-8 space-y-6 text-[13px] leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">
          <p>
            ClipForge (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal data in compliance with the General Data Protection Regulation (GDPR) and other applicable privacy laws.
          </p>

          <h2>1. Data We Collect</h2>
          <p><strong>Account data:</strong> Email address, name, and hashed password when you register. If you sign in with Google, we receive your Google profile name and email.</p>
          <p><strong>Usage data:</strong> Videos you upload or link, clips generated, job metadata (timestamps, settings, progress), and credit/billing history.</p>
          <p><strong>Payment data:</strong> Processed by Stripe. We store your Stripe customer ID and subscription status but never your card number or bank details.</p>
          <p><strong>Technical data:</strong> IP address, browser user-agent, and request timestamps for rate limiting and security. We do not use tracking cookies or third-party analytics.</p>

          <h2>2. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide the ClipForge service (video processing, clip generation, AI analysis)</li>
            <li>To manage your account, credits, and subscription</li>
            <li>To enforce rate limits and prevent abuse</li>
            <li>To send transactional emails (account verification, password reset, billing receipts)</li>
            <li>To improve our service based on aggregated, anonymized usage patterns</li>
          </ul>
          <p>We do <strong>not</strong> sell your data, use it for advertising, or share it with third parties for marketing purposes.</p>

          <h2>3. Legal Basis (GDPR Art. 6)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Contract performance:</strong> Processing your videos and managing your account</li>
            <li><strong>Legitimate interest:</strong> Security, abuse prevention, service improvement</li>
            <li><strong>Consent:</strong> Optional marketing communications (you can opt out at any time)</li>
            <li><strong>Legal obligation:</strong> Tax and billing records as required by law</li>
          </ul>

          <h2>4. Data Storage &amp; Retention</h2>
          <p>Your data is stored on servers in the European Union. Uploaded videos and generated clips are stored for as long as your account is active. When you delete a clip or your account, associated files are permanently removed within 30 days.</p>
          <p>Billing records are retained for 7 years as required by tax law. Anonymized usage statistics may be kept indefinitely.</p>

          <h2>5. Your Rights</h2>
          <p>Under GDPR, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> Request a copy of all personal data we hold about you</li>
            <li><strong>Rectification:</strong> Correct inaccurate personal data</li>
            <li><strong>Erasure:</strong> Request deletion of your account and all associated data</li>
            <li><strong>Portability:</strong> Export your data in a machine-readable format</li>
            <li><strong>Restriction:</strong> Limit how we process your data</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interest</li>
          </ul>
          <p>To exercise these rights, visit <Link href="/dashboard/settings" className="text-primary hover:underline">Settings → Data &amp; Privacy</Link> or email us at privacy@clipforge.app.</p>

          <h2>6. Third-Party Services</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Google Gemini API:</strong> Transcript analysis for clip selection. Transcripts are sent to Google&apos;s API but not stored by Google for training.</li>
            <li><strong>Stripe:</strong> Payment processing. Subject to <a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Google OAuth:</strong> If you choose to sign in with Google. Subject to Google&apos;s privacy terms.</li>
          </ul>

          <h2>7. Security</h2>
          <p>We implement industry-standard security measures including encrypted connections (TLS), hashed passwords (bcrypt), signed media URLs, rate limiting, and regular security audits. Access to production systems is restricted and logged.</p>

          <h2>8. Cookies</h2>
          <p>We use only <strong>essential cookies</strong> required for authentication (session tokens). We do not use analytics, advertising, or tracking cookies. No cookie consent banner is needed for strictly necessary cookies under GDPR, but we inform you here for transparency.</p>

          <h2>9. Changes</h2>
          <p>We may update this policy. Significant changes will be communicated via email or in-app notification. Continued use after changes constitutes acceptance.</p>

          <h2>10. Contact</h2>
          <p>For privacy inquiries: <strong>privacy@clipforge.app</strong></p>
        </div>
      </article>
    </main>
  )
}
