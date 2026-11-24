import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStoryLanguage } from './use-story-language'

export interface ResultStat {
  label: string
  value: string
}

/** Heading and the stats strip (duration, format and version or clip count). */
export function StoryResultHeader({ title, stats }: { title: string; stats: ResultStat[] }) {
  return (
    <div className="story-result-header">
      <h2 className="story-result-title">{title}</h2>
      <dl className="story-result-stats" data-testid="story-result-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Primary download action; the label depends on whether the version is reviewed. */
export function StoryResultDownload({ href, ready }: { href: string; ready: boolean }) {
  const text = useStoryLanguage()
  return (
    <Button asChild className="story-result-download rounded-full">
      <a href={href} download target="_blank" rel="noreferrer">
        <Download className="size-4" aria-hidden="true" />
        {ready
          ? text('Download video', 'Descarcă video')
          : text('Download draft', 'Descarcă versiunea preliminară')}
      </a>
    </Button>
  )
}
