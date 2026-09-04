import type { PrismaClient } from '@prisma/client'
import {
  type DailyCount,
  type ProjectStatus,
  activityWindow,
  buildActivity,
  projectStatus
} from './dashboard-activity'

export async function getDashboardData(
  prisma: PrismaClient,
  userId: string,
  now = new Date()
) {
  const { start, end } = activityWindow(now)
  // Aggregate inside PostgreSQL: transfer at most 90 rows, not every user's clip.
  const [daily, groups, clips, user] = await Promise.all([
    prisma.$queryRaw<DailyCount[]>`
      SELECT day::text AS day,
        COUNT(*) FILTER (WHERE kind = 'clip')::int AS clips,
        COUNT(*) FILTER (WHERE kind = 'project')::int AS projects
      FROM (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, 'clip' AS kind
        FROM clips WHERE user_id = ${userId}::uuid AND created_at >= ${start} AND created_at < ${end}
        UNION ALL
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, 'project' AS kind
        FROM jobs WHERE user_id = ${userId}::uuid AND created_at >= ${start} AND created_at < ${end}
      ) activity GROUP BY day ORDER BY day
    `,
    prisma.job.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.clip.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { duration: true }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, plan: true }
    })
  ])
  const statuses: Record<ProjectStatus, number> = {
    completed: 0,
    active: 0,
    failed: 0,
    cancelled: 0,
    other: 0
  }
  for (const group of groups)
    statuses[projectStatus(group.status)] += group._count._all
  return {
    activity: buildActivity(daily, now),
    statuses,
    jobCount: groups.reduce((sum, group) => sum + group._count._all, 0),
    clipCount: clips._count._all,
    durationMinutes: Math.round((clips._sum.duration ?? 0) / 60),
    credits: user?.credits ?? 0,
    plan: user?.plan ?? 'free'
  }
}
