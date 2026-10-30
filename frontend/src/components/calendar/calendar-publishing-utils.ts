import type { ScheduledPostRecord } from '@/lib/content-calendar'

export type PublishingTab = 'all' | 'scheduled' | 'drafts' | 'published'

export function getPublishingPosts(
  posts: ScheduledPostRecord[],
  tab: PublishingTab,
  month: Date
) {
  return posts
    .filter((post) => {
      const date = new Date(post.scheduledAt)
      if (
        date.getFullYear() !== month.getFullYear() ||
        date.getMonth() !== month.getMonth()
      )
        return false
      if (tab === 'drafts') return post.status === 'draft'
      if (tab === 'published') return post.status === 'published'
      if (tab === 'all') return true
      return (
        post.status === 'scheduled' ||
        post.status === 'publishing' ||
        post.status === 'failed'
      )
    })
    .sort((left, right) => {
      if (
        tab === 'all' &&
        (left.status === 'draft') !== (right.status === 'draft')
      ) {
        return left.status === 'draft' ? 1 : -1
      }
      const direction = tab === 'scheduled' || tab === 'all' ? 1 : -1
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
