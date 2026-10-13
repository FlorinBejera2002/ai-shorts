import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storyRequest } from '@/components/story/api'

type ProjectChoice = { id: string; name: string; kind: 'project' | 'story' }
type StorySummary = { id: string; title?: string; options?: { brief?: string } }

export function AgentProjectPicker({ ro, selectedId, disabled, onSelect, storiesOnly = false }: {
  ro: boolean; selectedId?: string; disabled: boolean; storiesOnly?: boolean; onSelect: (project: ProjectChoice) => void
}) {
  const projects = useQuery({ queryKey: ['workspace-agent', 'project-choices'], staleTime: 30000,
    queryFn: async ({ signal }) => {
      const [library, stories] = await Promise.all([
        storyRequest<{ id: string; name: string }[]>('/api/projects', 'GET', undefined, signal),
        storyRequest<StorySummary[] | { stories: StorySummary[] }>('/api/stories', 'GET', undefined, signal)
      ])
      return [
        ...library.map(project => ({ ...project, kind: 'project' as const })),
        ...(Array.isArray(stories) ? stories : stories.stories).map(story => ({ id: story.id, kind: 'story' as const, name: story.title || story.options?.brief || (ro ? 'Poveste fără titlu' : 'Untitled story') }))
      ]
    }
  })
  const choices = projects.data?.filter(project => !storiesOnly || project.kind === 'story')
  return <div className="space-y-2 text-xs" data-agent-project-picker>
    {projects.isPending && <p role="status">{ro ? 'Se încarcă proiectele…' : 'Loading projects…'}</p>}
    {projects.isError && <div><p role="alert">{ro ? 'Proiectele nu au putut fi încărcate.' : 'Could not load projects.'}</p><Button size="sm" variant="outline" onClick={() => void projects.refetch()}>{ro ? 'Reîncearcă' : 'Retry'}</Button></div>}
    {choices?.length === 0 && <p className="text-muted-foreground">{ro ? 'Nu ai încă proiecte. Cere agentului să creeze o poveste.' : 'No projects yet. Ask the agent to create a story.'}</p>}
    <ul className="max-h-64 space-y-1 overflow-auto">{choices?.map(project => <li key={`${project.kind}-${project.id}`}><Button variant="ghost" className="h-auto min-h-10 w-full justify-start px-2 py-2 text-left" disabled={disabled} onClick={() => onSelect(project)} aria-pressed={selectedId === project.id}><span className="min-w-0 flex-1"><span className="block truncate text-xs">{project.name}</span><span className="text-[10px] font-normal text-muted-foreground">{project.kind === 'story' ? (ro ? 'Poveste' : 'Story') : (ro ? 'Proiect' : 'Project')}</span></span>{selectedId === project.id ? <Check className="size-3" /> : <ChevronRight className="size-3" />}</Button></li>)}</ul>
  </div>
}
