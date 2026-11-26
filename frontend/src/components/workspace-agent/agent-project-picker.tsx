import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { storyRequest } from '@/components/story/api'
import { AgentPill } from './agent-pill'
import styles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

type ProjectChoice = { id: string; name: string; kind: 'project' | 'story' }
type StorySummary = { id: string; title?: string; options?: { brief?: string } }

export function AgentProjectPicker({ locale, selectedId, disabled, onSelect, storiesOnly = false }: {
  locale: SiteLocale; selectedId?: string; disabled: boolean; storiesOnly?: boolean; onSelect: (project: ProjectChoice) => void
}) {
  const projects = useQuery({ queryKey: ['workspace-agent', 'project-choices'], staleTime: 30000,
    queryFn: async ({ signal }) => {
      const [library, stories] = await Promise.all([
        storyRequest<{ id: string; name: string }[]>('/api/projects', 'GET', undefined, signal),
        storyRequest<StorySummary[] | { stories: StorySummary[] }>('/api/stories', 'GET', undefined, signal)
      ])
      return [
        ...library.map(project => ({ ...project, kind: 'project' as const })),
        ...(Array.isArray(stories) ? stories : stories.stories).map(story => ({ id: story.id, kind: 'story' as const, name: story.title || story.options?.brief || { en: 'Untitled project', ro: 'Proiect fără titlu', es: 'Proyecto sin título' }[locale] }))
      ]
    }
  })
  const choices = projects.data?.filter(project => !storiesOnly || project.kind === 'story')
  return <div className={styles.body} data-agent-project-picker>
    {projects.isPending && <p role="status" className={uiStyles.hint}>{{ en: 'Loading projects…', ro: 'Se încarcă proiectele…', es: 'Cargando proyectos…' }[locale]}</p>}
    {projects.isError && <div className={uiStyles.stack}>
      <p role="alert" className={uiStyles.error}>{{ en: 'Could not load projects.', ro: 'Proiectele nu au putut fi încărcate.', es: 'No se pudieron cargar los proyectos.' }[locale]}</p>
      <AgentPill onClick={() => void projects.refetch()}>{{ en: 'Retry', ro: 'Reîncearcă', es: 'Reintentar' }[locale]}</AgentPill>
    </div>}
    {choices?.length === 0 && <p className={uiStyles.hint}>{{ en: 'No projects yet. Ask the agent to create clips.', ro: 'Nu ai încă proiecte. Cere agentului să creeze clipuri.', es: 'Aún no tienes proyectos. Pide al agente que cree clips.' }[locale]}</p>}
    <ul className={styles.projectList}>
      {choices?.map(project => {
        const selected = selectedId === project.id
        return <li key={`${project.kind}-${project.id}`}>
          <button type="button" className={styles.projectRow} disabled={disabled} aria-pressed={selected} onClick={() => onSelect(project)}>
            <span className={styles.projectText}>
              <span className={styles.projectName}>{project.name}</span>
              <span className={styles.projectKind}>{project.kind === 'story'
                ? { en: 'Uploaded footage', ro: 'Filmări încărcate', es: 'Material subido' }[locale]
                : { en: 'Project', ro: 'Proiect', es: 'Proyecto' }[locale]}</span>
            </span>
            {selected ? <span className={styles.check}><Check aria-hidden="true" /></span> : <ChevronRight className={styles.chevron} aria-hidden="true" />}
          </button>
        </li>
      })}
    </ul>
  </div>
}
