'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import type { ActivityDay, ProjectStatus } from '@/lib/dashboard-activity'
import { ArrowUpRight, ChartNoAxesCombined, CircleDot } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis
} from 'recharts'

const statusColors: Record<ProjectStatus, string> = {
  completed: 'var(--chart-1)',
  active: 'var(--chart-3)',
  failed: 'var(--destructive)',
  cancelled: 'var(--chart-5)',
  other: 'var(--muted-foreground)'
}

export function ActivityCharts({
  activity,
  statuses
}: {
  activity: ActivityDay[]
  statuses: Record<ProjectStatus, number>
}) {
  const t = useTranslations('dashboard.studio')
  const locale = useLocale()
  const [range, setRange] = useState('30')
  const gradientId = `activity-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const data = activity.slice(-Number(range))
  const clipTotal = data.reduce((sum, day) => sum + day.clips, 0)
  const projectTotal = data.reduce((sum, day) => sum + day.projects, 0)
  const total = Object.values(statuses).reduce((sum, value) => sum + value, 0)
  const statusData = (
    Object.entries(statuses) as [ProjectStatus, number][]
  ).map(([status, count]) => ({ status, count, fill: statusColors[status] }))
  const config = {
    clips: { label: t('clips'), color: 'var(--chart-1)' },
    projects: { label: t('projects'), color: 'var(--chart-3)' }
  }
  const statusConfig = Object.fromEntries(
    statusData.map(({ status, fill }) => [
      status,
      { label: t(status), color: fill }
    ])
  )
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${value}T00:00:00Z`))
  const number = (value: number) => value.toLocaleString(locale)

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0 gap-5 shadow-none" data-testid="activity-card">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>
                <h2 className="text-base tracking-tight">{t('activity')}</h2>
              </CardTitle>
              <CardDescription className="mt-2 text-xs">
                {t('activityDescription')}
              </CardDescription>
            </div>
            <div
              role="group"
              aria-label={t('dateRange')}
              className="flex rounded-lg bg-muted p-1"
            >
              {['7', '30', '90'].map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant="ghost"
                  onClick={() => setRange(days)}
                  className={`h-7 px-3 text-xs ${range === days ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  aria-pressed={range === days}
                >
                  {t('days', { count: Number(days) })}
                </Button>
              ))}
            </div>
          </div>
          <div
            className="flex items-end gap-7 border-t border-border/70 pt-4"
            aria-live="polite"
          >
            <div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-1" />
                {t('clips')}
              </p>
              <p
                className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums"
                data-testid="range-clips"
              >
                {number(clipTotal)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-3" />
                {t('projects')}
              </p>
              <p
                className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums"
                data-testid="range-projects"
              >
                {number(projectTotal)}
              </p>
            </div>
            <Badge
              variant="outline"
              className="mb-1 ml-auto hidden font-normal sm:inline-flex"
            >
              UTC
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={config}
            className="h-[230px] w-full aspect-auto"
            aria-label={t('activity')}
          >
            <AreaChart
              accessibilityLayer={true}
              data={data}
              margin={{ left: -18, right: 8, top: 12, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-clips)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-clips)"
                    stopOpacity={0.015}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 5" />
              <XAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                minTickGap={35}
                tickFormatter={dateLabel}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                domain={[0, 'auto']}
                tickMargin={10}
                width={45}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      typeof label === 'string' ? dateLabel(label) : label
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="clips"
                stroke="var(--color-clips)"
                fill={`url(#${gradientId})`}
                strokeWidth={2.5}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="projects"
                stroke="var(--color-projects)"
                fill="transparent"
                strokeWidth={2}
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
          {clipTotal + projectTotal === 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <ChartNoAxesCombined className="size-4 shrink-0" />
              {t('emptyActivity')}
            </p>
          )}
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded px-1 py-1 focus-visible:outline-2 focus-visible:outline-ring">
              {t('viewData')}
            </summary>
            <div className="mt-2 max-h-52 overflow-auto rounded-lg border">
              <table className="w-full text-left tabular-nums">
                <caption className="sr-only">{t('activity')}</caption>
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th scope="col" className="p-2">
                      {t('date')}
                    </th>
                    <th scope="col" className="p-2">
                      {t('clips')}
                    </th>
                    <th scope="col" className="p-2">
                      {t('projects')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((day) => (
                    <tr key={day.date} className="border-t">
                      <td className="p-2">{dateLabel(day.date)}</td>
                      <td className="p-2">{number(day.clips)}</td>
                      <td className="p-2">{number(day.projects)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card className="gap-3 shadow-none" data-testid="status-card">
        <CardHeader>
          <CardTitle>
            <h2 className="text-base tracking-tight">{t('projectHealth')}</h2>
          </CardTitle>
          <CardDescription className="text-xs">{t('allTime')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {total > 0 ? (
            <ChartContainer
              config={statusConfig}
              className="mx-auto h-[210px] w-full aspect-auto"
              aria-label={t('projectHealth')}
            >
              <PieChart accessibilityLayer={true}>
                <ChartTooltip
                  content={
                    <ChartTooltipContent nameKey="status" hideLabel={true} />
                  }
                />
                <Pie
                  data={statusData.filter((item) => item.count > 0)}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={3}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  <Label
                    content={({ viewBox }) =>
                      viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 5}
                            className="fill-foreground text-3xl font-semibold"
                          >
                            {number(total)}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 21}
                            className="fill-muted-foreground text-xs"
                          >
                            {t('projects')}
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="flex min-h-[210px] flex-col items-center justify-center text-center">
              <div className="flex size-36 flex-col items-center justify-center rounded-full border-[14px] border-muted">
                <span className="text-3xl font-semibold">0</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {t('projects')}
                </span>
              </div>
            </div>
          )}
          <ul className="mt-2 space-y-3 text-xs">
            {statusData
              .filter(
                (item) =>
                  item.count > 0 ||
                  ['completed', 'active', 'failed'].includes(item.status)
              )
              .map((item) => (
                <li key={item.status} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="text-muted-foreground">
                    {t(item.status)}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {number(item.count)}
                  </span>
                </li>
              ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            {total ? (
              <>
                <ArrowUpRight className="size-4 text-primary" />
                {t('completionRate', {
                  value: Math.round((statuses.completed / total) * 100)
                })}
              </>
            ) : (
              <>
                <CircleDot className="size-4 shrink-0" />
                {t('emptyProjects')}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
