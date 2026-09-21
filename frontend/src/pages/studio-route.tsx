import { StudioClipsGallery } from '@/components/studio/studio-clips-gallery'
import { StudioProjects } from '@/components/studio/studio-projects'
import { useSearchParams } from 'react-router-dom'

export function StudioRoute() {
  const [search] = useSearchParams()
  const clip = search.get('clip')
  return clip ? <StudioProjects initialClipId={clip} /> : <StudioClipsGallery />
}
