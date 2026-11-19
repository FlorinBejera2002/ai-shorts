import type { ScheduledPostRecord } from '@/lib/content-calendar'

export type PublishingTab = 'all' | 'scheduled' | 'drafts' | 'published' | 'failed'

/** A half-open local range; `end` is exclusive. */
export type PublishingRange = { start: Date; end: Date }

const scheduledStatuses = new Set(['scheduled', 'publishing', 'failed'])

export function getPublishingPosts(
  posts: ScheduledPostRecord[],
  tab: PublishingTab,
  range: PublishingRange
) {
  return posts
    .filter((post) => {
      const timestamp = new Date(post.scheduledAt).getTime()
      if (timestamp < range.start.getTime() || timestamp >= range.end.getTime())
        return false
      if (tab === 'drafts') return post.status === 'draft'
      if (tab === 'published') return post.status === 'published'
      if (tab === 'failed') return post.status === 'failed'
      if (tab === 'all') return true
      return scheduledStatuses.has(post.status)
    })
    .sort((left, right) => {
      if (
        tab === 'all' &&
        (left.status === 'draft') !== (right.status === 'draft')
      ) {
        return left.status === 'draft' ? 1 : -1
      }
      const direction = tab === 'published' || tab === 'drafts' ? -1 : 1
      return (
        direction *
        (new Date(left.scheduledAt).getTime() -
          new Date(right.scheduledAt).getTime())
      )
    })
}

export function groupPublishingPosts(posts: ScheduledPostRecord[]) {
  const groups: {
    key: string
    date: Date | null
    posts: ScheduledPostRecord[]
  }[] = []
  for (const post of posts) {
    const date = post.status === 'draft' ? null : new Date(post.scheduledAt)
    const key = date
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      : 'undated'
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { key, date, posts: [] }
      groups.push(group)
    }
    group.posts.push(post)
  }
  return groups
}
