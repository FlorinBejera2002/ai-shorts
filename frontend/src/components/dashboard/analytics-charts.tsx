'use client'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import { StudioSection } from '@/components/ui/studio-section'
import { BarChart3, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

type Datum = { label: string; count: number }

export function AnalyticsCharts({
  days,
  scores
}: { days: Datum[]; scores: Datum[] }) {
  const t = useTranslations('analytics')
  const studio = useTranslations('dashboard.studio')
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {[
        {
          title: t('last7Days'),
          description: t('clipsGenerated'),
          icon: BarChart3,
          data: days,
          color: 'var(--chart-1)'
        },
        {
          title: t('scoreDistribution'),
          description: t('avgViralScore'),
          icon: TrendingUp,
          data: scores,
          color: 'var(--chart-3)'
        }
      ].map(({ title, description, icon, data, color }) => (
        <StudioSection
          key={title}
          title={title}
          description={description}
          icon={icon}
        >
          <ChartContainer
            config={{ count: { label: t('clipsGenerated'), color } }}
            className="aspect-auto h-64 w-full"
            aria-label={title}
          >
            <BarChart
              accessibilityLayer={true}
              data={data}
              margin={{ top: 15, right: 5, left: -25, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[5, 5, 0, 0]}
                isAnimationActive={false}
                maxBarSize={44}
              />
            </BarChart>
          </ChartContainer>
          <details className="mt-5 border-t pt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {studio('viewData')}
            </summary>
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th className="py-2 font-medium">{title}</th>
                  <th className="py-2 text-right font-medium">
                    {t('clipsGenerated')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.label} className="border-t">
                    <th scope="row" className="py-2 font-normal">
                      {item.label}
                    </th>
                    <td className="py-2 text-right tabular-nums">
                      {item.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </StudioSection>
      ))}
    </div>
  )
}
