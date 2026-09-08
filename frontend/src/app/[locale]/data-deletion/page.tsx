import { LegalDocument } from '@/components/landing/legal-document'
import { PublicFooter } from '@/components/landing/public-footer'
import { PublicNavbar } from '@/components/landing/public-navbar'
import { buildLocaleMetadata, getContactEmail } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export async function generateMetadata({
  params
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildLocaleMetadata(locale === 'ro' ? 'ro' : 'en', {
    path: '/data-deletion',
    title:
      locale === 'ro'
        ? 'Ștergerea datelor — Sneep Cut'
        : 'Data deletion — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Deconectează conturile sociale și solicită ștergerea datelor Sneep Cut.'
        : 'Disconnect social accounts and request deletion of your Sneep Cut data.'
  })
}

export default async function DataDeletionPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  const ro = locale === 'ro'
  const copy = ro
    ? {
        title: 'Ștergerea datelor',
        updated: 'Ultima actualizare: 7 septembrie 2026',
        intro:
          'Poți opri accesul la conturile sociale sau solicita ștergerea contului Sneep Cut folosind pașii de mai jos.',
        sections: [
          {
            title: 'Deconectarea Instagram, Facebook sau TikTok',
            paragraphs: [
              'Autentifică-te în Sneep Cut, deschide Publicare și apasă Deconectează lângă contul dorit. Confirmă alegerea. Sneep Cut elimină autorizarea salvată local pentru acel cont și oprește lucrările care pot fi anulate. O operațiune deja trimisă platformei poate să se finalizeze.',
              'Poți retrage și autorizarea aplicației Sneep Cut din setările de aplicații și integrări ale platformei respective. Deconectarea nu șterge postările deja publicate; acestea se gestionează direct pe platformă.'
            ]
          },
          {
            title: 'Ștergerea contului și a datelor Sneep Cut',
            paragraphs: [
              'Deschide Setări → Date și confidențialitate și folosește opțiunea de ștergere a contului. Urmează verificarea identității și confirmarea afișate. Cererea oprește accesul la publicare și inițiază eliminarea datelor contului, inclusiv conexiunile sociale și istoricul de publicare.',
              'Consultă Politica de confidențialitate pentru informații despre copii de siguranță și evidențe care pot fi păstrate în scopuri legale sau de securitate.'
            ]
          },
          {
            title: 'Dacă nu te mai poți autentifica',
            paragraphs: [
              'Contactează-ne de la adresa asociată contului și menționează că soliciți ștergerea datelor. Nu trimite parole, tokenuri sau coduri de autentificare. Putem solicita verificarea identității înainte de procesarea cererii.'
            ]
          }
        ],
        contactTitle: 'Contact',
        contactPrompt: 'Trimite cererea la',
        contactFallback: 'Contactează administratorul serviciului.'
      }
    : {
        title: 'Data deletion',
        updated: 'Last updated: September 7, 2026',
        intro:
          'You can stop access to social accounts or request deletion of your Sneep Cut account using the steps below.',
        sections: [
          {
            title: 'Disconnect Instagram, Facebook or TikTok',
            paragraphs: [
              'Sign in to Sneep Cut, open Publish, and choose Disconnect next to the account. Confirm your choice. Sneep Cut removes the locally stored authorization for that account and cancels work where cancellation is still possible. An operation already sent to the platform may still complete.',
              'You can also remove the Sneep Cut authorization in the platform’s app and integration settings. Disconnecting does not delete posts already published; manage those directly on the platform.'
            ]
          },
          {
            title: 'Delete your Sneep Cut account and data',
            paragraphs: [
              'Open Settings → Data and privacy and choose account deletion. Follow the identity verification and confirmation shown there. The request stops publishing access and starts removal of account data, including social connections and publishing history.',
              'See the Privacy Policy for information about backups and records that may be retained for legal or security purposes.'
            ]
          },
          {
            title: 'If you cannot sign in',
            paragraphs: [
              'Contact us from the email associated with your account and state that you are requesting data deletion. Do not send passwords, access tokens, or login codes. We may ask you to verify your identity before processing the request.'
            ]
          }
        ],
        contactTitle: 'Contact',
        contactPrompt: 'Send your request to',
        contactFallback: 'Contact the service administrator.'
      }
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PublicNavbar
        labels={{
          pricing: t('pricing'),
          signIn: t('signIn'),
          getStarted: t('getStarted')
        }}
      />
      <LegalDocument
        {...copy}
        contactEmail={getContactEmail() || 'admin@sneepcut.com'}
      />
      <PublicFooter />
    </main>
  )
}
