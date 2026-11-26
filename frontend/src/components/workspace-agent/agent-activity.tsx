import { Bot } from 'lucide-react'
import { useLocale } from 'next-intl'
import { resolveSiteLocale } from '@/lib/site-config'
import { ActionTitle } from './action-details'
import { agentMessages } from './messages'
import type { AgentActivity as Activity } from './activity'

export function AgentActivity({ activity }: { activity: Activity }) {
  const locale = resolveSiteLocale(useLocale())
  return <div role="status" aria-live="polite" className="mb-3 flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs" data-agent-activity={activity.runId} data-agent-resource={activity.resourceId}>
    <Bot className="size-4 shrink-0" aria-hidden="true" />
    <span><ActionTitle action={{ name: activity.action, input: {} }} locale={locale} /> · {agentMessages[locale].statuses[activity.status]}</span>
  </div>
}
