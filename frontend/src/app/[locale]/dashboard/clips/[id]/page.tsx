import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { ClipWorkspace } from '@/components/clip/clip-workspace'
import { auth } from '@/lib/auth'
import { getPrisma } from '@/lib/db'
import { resolveMediaUrl } from '@/lib/signed-url'

export const runtime = 'nodejs'

export default async function ClipDetailPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  setRequestLocale(locale)
  const common = await getTranslations('common')

  const session = await auth()
  if (!session?.user?.id) notFound()
  const prisma = getPrisma()

  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id }
  })
  if (!clip) notFound()
  const fileUrl = resolveMediaUrl(
    clip.fileStorageKey ?? clip.filePath,
    clip.fileUrl
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={clip.title}
        description={`${Math.round(clip.duration)}s · ${clip.aspectRatio} · ${clip.resolution}`}
        actions={
          <Button asChild={true} variant="outline">
            <Link href="/dashboard/clips">
              <ArrowLeft className="size-4" />
              {locale === 'ro' ? 'Bibliotecă' : 'Library'}
            </Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <Card
          as="section"
          className="block gap-0 overflow-hidden py-0 shadow-none xl:sticky xl:top-20"
        >
          <div className="mx-auto aspect-[9/16] max-h-[68dvh] w-full max-w-md overflow-hidden rounded-lg bg-black">
            {fileUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: Generated clips can have burned-in captions; VTT export is tracked for launch.
              <video
                controls={true}
                src={fileUrl}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                {common('noVideoAvailable')}
              </div>
            )}
          </div>
        </Card>

        <ClipWorkspace
          clip={{
            id: clip.id,
            title: clip.title,
            hookText: clip.hookText,
            viralScore: clip.viralScore,
            scoreReason: clip.scoreReason,
            duration: clip.duration,
            resolution: clip.resolution,
            aspectRatio: clip.aspectRatio,
            hasSubtitles: clip.hasSubtitles,
            transcriptText: clip.transcriptText,
            fileUrl,
            createdAt: clip.createdAt.toISOString(),
            captionTiktok: clip.captionTiktok,
            captionInstagram: clip.captionInstagram,
            captionYoutube: clip.captionYoutube,
            suggestedHashtags: clip.suggestedHashtags
          }}
        />
      </div>
    </div>
  )
}
