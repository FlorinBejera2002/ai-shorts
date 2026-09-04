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
    <div className="grid gap-6 animate-fade-in xl:grid-cols-[minmax(0,0.85fr)_minmax(360px,1.15fr)] xl:items-start">
      <section className="panel p-2 sm:p-3">
        <div className="mx-auto aspect-[9/16] max-h-[72dvh] w-full max-w-md overflow-hidden rounded-lg bg-black">
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
          fileUrl,
          createdAt: clip.createdAt.toISOString(),
          captionTiktok: clip.captionTiktok,
          captionInstagram: clip.captionInstagram,
          captionYoutube: clip.captionYoutube,
          suggestedHashtags: clip.suggestedHashtags
        }}
      />
    </div>
  )
}
