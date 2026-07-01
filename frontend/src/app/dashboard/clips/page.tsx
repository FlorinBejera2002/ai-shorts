import Link from 'next/link'
import { Play } from 'lucide-react'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function ClipsPage() {
  const session = await auth()
  const clips = session?.user?.id
    ? await prisma.clip.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : []

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">Clips</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {clips.length} clip{clips.length !== 1 ? 's' : ''} generated
      </p>

      {clips.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clips.map((clip, i) => (
            <Link
              key={clip.id}
              href={`/dashboard/clips/${clip.id}`}
              className="group relative rounded-xl bg-card border border-border overflow-hidden transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 animate-slide-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="aspect-video bg-muted relative overflow-hidden">
                {clip.fileUrl ? (
                  <video
                    src={clip.fileUrl}
                    muted={true}
                    preload="metadata"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100">
                    <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] font-medium truncate">
                      {clip.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {Math.round(clip.duration)}s &middot; {clip.resolution}
                    </p>
                  </div>
                  {clip.viralScore > 0 && (
                    <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                      {clip.viralScore}/10
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8 text-center animate-scale-in">
          <p className="text-[13px] text-muted-foreground">
            No clips yet
          </p>
          <Link
            href="/dashboard/create"
            className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline underline-offset-4"
          >
            Create your first project &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
