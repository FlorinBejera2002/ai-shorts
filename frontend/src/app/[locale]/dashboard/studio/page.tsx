import { StudioClipsGallery } from '@/components/studio/studio-clips-gallery'
import { StudioProjects } from '@/components/studio/studio-projects'

export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ clip?: string; workspace?: string }>
}) {
  const { clip, workspace } = await searchParams

  return clip || workspace === '1' ? (
    <StudioProjects initialClipId={clip} />
  ) : (
    <StudioClipsGallery />
  )
}
