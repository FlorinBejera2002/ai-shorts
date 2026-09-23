import { StudioClipsGallery } from '@/components/studio/studio-clips-gallery'
import { StudioProjects } from '@/components/studio/studio-projects'
import { useSearchParams } from 'react-router-dom'

export function StudioRoute() {
  const [search] = useSearchParams()
  const clip = search.get('clip')
  const project = search.get('project')
  return clip || search.get('workspace') === '1' ? (
    <StudioProjects initialClipId={clip ?? undefined} initialProjectId={project ?? undefined} />
  ) : (
    <StudioClipsGallery />
  )
}
