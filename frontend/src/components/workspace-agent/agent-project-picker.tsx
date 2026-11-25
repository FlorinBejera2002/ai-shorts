import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight } from 'lucide-react'
import { storyRequest } from '@/components/story/api'
import { AgentPill } from './agent-pill'
import styles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

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
        ...(Array.isArray(stories) ? stories : stories.stories).map(story => ({ id: story.id, kind: 'story' as const, name: story.title || story.options?.brief || (ro ? 'Proiect fără titlu' : 'Untitled project') }))
      ]
    }
  })
  const choices = projects.data?.filter(project => !storiesOnly || project.kind === 'story')
  return <div className={styles.body} data-agent-project-picker>
    {projects.isPending && <p role="status" className={uiStyles.hint}>{ro ? 'Se încarcă proiectele…' : 'Loading projects…'}</p>}
    {projects.isError && <div className={uiStyles.stack}>
      <p role="alert" className={uiStyles.error}>{ro ? 'Proiectele nu au putut fi încărcate.' : 'Could not load projects.'}</p>
      <AgentPill onClick={() => void projects.refetch()}>{ro ? 'Reîncearcă' : 'Retry'}</AgentPill>
    </div>}
    {choices?.length === 0 && <p className={uiStyles.hint}>{ro ? 'Nu ai încă proiecte. Cere agentului să creeze clipuri.' : 'No projects yet. Ask the agent to create clips.'}</p>}
    <ul className={styles.projectList}>
      {choices?.map(project => {
        const selected = selectedId === project.id
        return <li key={`${project.kind}-${project.id}`}>
          <button type="button" className={styles.projectRow} disabled={disabled} aria-pressed={selected} onClick={() => onSelect(project)}>
            <span className={styles.projectText}>
              <span className={styles.projectName}>{project.name}</span>
              <span className={styles.projectKind}>{project.kind === 'story' ? (ro ? 'Filmări încărcate' : 'Uploaded footage') : (ro ? 'Proiect' : 'Project')}</span>
            </span>
            {selected ? <span className={styles.check}><Check aria-hidden="true" /></span> : <ChevronRight className={styles.chevron} aria-hidden="true" />}
          </button>
        </li>
      })}
    </ul>
  </div>
}
