import { StudioClipsGallery } from '@/components/studio/studio-clips-gallery'
import { StudioProjects } from '@/components/studio/studio-projects'

export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ clip?: string }>
}) {
  const { clip } = await searchParams

  return clip ? <StudioProjects initialClipId={clip} /> : <StudioClipsGallery />
}
