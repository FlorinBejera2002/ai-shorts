import { useState } from 'react'
import { Pagination } from '../components/pagination'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Button } from '../components/ui/button'
import { dateTimeFormat } from '../lib/format'
import { activityDetail, activityFailed, activityLabel } from './activity-labels'
import type { ActivityItem } from './types'
import { activityPageSize, useUserActivity } from './use-user-activity'

/** Paginated history of what a user did, newest first. */
export function ActivityTimeline({ userId }: { userId: string }) {
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useUserActivity(userId, page)

  if (loading && !data) return <PageLoader compact />
  if (error) return <StatePanel compact illustration="loadError" title="Nu am putut încărca activitatea" message={error} role="alert" action={<Button variant="secondary" size="sm" onClick={() => void reload()}>Reîncearcă</Button>} />
  if (!data || data.items.length === 0) return <StatePanel compact illustration="activityEmpty" title="Nicio activitate" />
  return (
    <div className="activity" aria-busy={loading}>
      <ol className="activity-list">{data.items.map((item) => <ActivityEntry key={`${item.kind}-${item.at}`} item={item} />)}</ol>
      <Pagination page={page} total={data.total} pageSize={activityPageSize} onPage={setPage} subject="de activitate" />
    </div>
  )
}

function ActivityEntry({ item }: { item: ActivityItem }) {
  const detail = activityDetail(item)
  return (
    <li className="activity-entry">
      <span className="activity-dot" data-failed={activityFailed(item) || undefined} aria-hidden />
      <div className="stacked">
        <strong>{activityLabel(item)}</strong>
        {detail && <span>{detail}</span>}
      </div>
      <time dateTime={item.at}>{dateTimeFormat.format(new Date(item.at))}</time>
    </li>
  )
}
