import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ClipWorkspace } from '@/components/clip/clip-workspace'

export const runtime = 'nodejs'

export default async function ClipDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('clips')

  const session = await auth()
  if (!session?.user?.id) notFound()

  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!clip) notFound()

  return (
    <div className="animate-fade-in grid gap-6 xl:grid-cols-[1fr_0.8fr]">
      <section>
        <div className="aspect-[9/16] max-h-[680px] rounded-xl bg-black overflow-hidden">
          {clip.fileUrl ? (
            // biome-ignore lint/a11y/useMediaCaption: Generated clips can have burned-in captions; VTT export is tracked for launch.
            <video
              controls={true}
              src={clip.fileUrl}
              className="h-full w-full rounded-xl object-contain"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              {t('common.noVideoAvailable')}
            </div>
          )}
        </div>
      </section>

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
          fileUrl: clip.fileUrl,
          createdAt: clip.createdAt.toISOString(),
          captionTiktok: clip.captionTiktok,
          captionInstagram: clip.captionInstagram,
          captionYoutube: clip.captionYoutube,
          suggestedHashtags: clip.suggestedHashtags,
        }}
      />
    </div>
  )
}
