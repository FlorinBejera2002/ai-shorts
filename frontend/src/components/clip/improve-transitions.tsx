import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'
import type { ApiClip } from '@/types/api'

interface ImproveTransitionsProps {
  clipId: string
  initialClip: ApiClip
}

export function ImproveTransitions({ clipId, initialClip }: ImproveTransitionsProps) {
  const locale = useLocale()
  const romanian = locale === 'ro'
  const client = useQueryClient()
  const path = `/api/clips/${clipId}`
  const queryKey = ['api-resource', path]
  const query = useQuery({
    queryKey,
    initialData: initialClip,
    queryFn: async (): Promise<ApiClip> => {
      const response = await apiFetch(path)
      const data = await response.json()
      if (!response.ok) throw new Error(extractApiError(data, 'Unable to load transition status'))
      return data
    },
    refetchInterval: (state) => Number(state.state.data?.active_edit_tasks) > 0 ? 2000 : false
  })
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`${path}/transitions`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(extractApiError(data, 'Unable to improve transitions'))
    },
    onSuccess: async () => {
      client.setQueryData<ApiClip>(queryKey, (previous) => ({ ...previous, active_edit_tasks: 1, edit_status: 'pending' }))
      await client.invalidateQueries({ queryKey })
    }
  })
  const busy = mutation.isPending || Number(query.data.active_edit_tasks) > 0 || query.data.processing_active === true
  if (query.data.can_improve_transitions !== true) return null
  const error = mutation.error?.message || query.error?.message || (mutation.isSuccess && query.data.edit_status === 'failed' ? String(query.data.edit_error || 'Transition improvement failed') : null)

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" disabled={busy} onClick={() => mutation.mutate()}>
        <Sparkles className="size-4" />
        {busy ? (romanian ? 'Se analizează tranzițiile…' : 'Analyzing transitions…') : (romanian ? 'Îmbunătățește tranzițiile' : 'Improve transitions')}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {mutation.isSuccess && !busy && query.data.edit_status === 'completed' && <p role="status" className="text-xs text-muted-foreground">{romanian ? 'Tranzițiile au fost verificate. Previzualizarea este actualizată.' : 'Transitions reviewed. Preview is up to date.'}</p>}
    </div>
  )
}
