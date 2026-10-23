import type { ScheduledPostRecord } from '@/lib/content-calendar'

export type PublishingTab = 'scheduled' | 'drafts' | 'published'

export function getPublishingPosts(
  posts: ScheduledPostRecord[],
  tab: PublishingTab,
  month: Date
) {
  return posts
    .filter(post => {
      const date = new Date(post.scheduledAt)
      if (
        date.getFullYear() !== month.getFullYear() ||
        date.getMonth() !== month.getMonth()
      ) return false
      if (tab === 'drafts') return post.status === 'draft'
      if (tab === 'published') return post.status === 'published'
      return (
        post.status === 'scheduled' ||
        post.status === 'publishing' ||
        post.status === 'failed'
      )
    })
    .sort((left, right) => {
      const direction = tab === 'scheduled' ? 1 : -1
      return direction * (
        new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      )
    })
}
