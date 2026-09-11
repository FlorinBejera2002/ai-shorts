'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ScriptRecord } from '@/lib/scripts-workspace'
import { Archive, Clock3, FileText, Plus, Search } from 'lucide-react'

type Props = {
  records: ScriptRecord[]
  query: string
  includeArchived: boolean
  busy: boolean
  labels: Record<string, string>
  onQueryChange: (value: string) => void
  onArchivedChange: (value: boolean) => void
  onOpen: (record: ScriptRecord) => void
  onNew: () => void
}

export function ScriptLibrary({
  records,
  query,
  includeArchived,
  busy,
  labels,
  onQueryChange,
  onArchivedChange,
  onOpen,
  onNew
}: Props) {
  return (
    <section className="space-y-5" aria-label={labels.title}>
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.search}
            className="pl-9"
          />
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => onArchivedChange(event.target.checked)}
          />
          <Archive className="size-3.5" />
          {labels.archived}
        </label>
        <Button onClick={onNew}>
          <Plus className="size-4" />
          {labels.new}
        </Button>
      </div>

      {records.length === 0 && !busy ? (
        <Card className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-7" />
          </div>
          <div>
            <h2 className="font-semibold">{labels.emptyTitle}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {labels.emptyDescription}
            </p>
          </div>
          <Button onClick={onNew}>{labels.new}</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <button
              type="button"
              key={record.id}
              onClick={() => onOpen(record)}
              className="group rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {record.status.replace('_', ' ')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  v{record.revision}
                </span>
              </div>
              <h2 className="mt-5 line-clamp-2 text-base font-semibold group-hover:text-primary">
                {record.title}
              </h2>
              <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                {record.topic || labels.noBrief}
              </p>
              <div className="mt-5 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                <span className="capitalize">{record.platform}</span>
                <span className="flex items-center gap-1">
                  <Clock3 className="size-3" />
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium'
                  }).format(new Date(record.updatedAt))}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
