import type { Project, ProjectFolder } from './clips-project-types'

export type ClipsFolderEntry = {
  folder: ProjectFolder
  owner: Project
  count: number
}

/** Flattens project folders with their clip counts for project pickers. */
export function summarizeClipsProjects(projects: Project[]) {
  const folders: ClipsFolderEntry[] = projects.flatMap((owner) =>
    owner.folders.map((folder) => ({
      folder,
      owner,
      count: owner.clips.filter((clip) => clip.folderId === folder.id).length
    }))
  )
  const total = projects.reduce((sum, owner) => sum + owner.clips.length, 0)
  const unassigned = projects.reduce(
    (sum, owner) =>
      sum + owner.clips.filter((clip) => clip.folderId === null).length,
    0
  )
  return { folders, total, unassigned }
}
