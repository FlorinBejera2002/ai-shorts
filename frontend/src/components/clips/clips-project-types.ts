export type ProjectFolder = {
  id: string
  parentId: string | null
  name: string
}

export type ProjectClip = {
  id: string
  folderId: string | null
  title: string
  duration: number
  viralScore: number | null
  aspectRatio: string
  thumbnailUrl: string | null
  hookText: string | null
  resolution: string
  hasSubtitles: boolean
  fileUrl?: string | null
  createdAt: string
}

export type ProjectBrand = {
  name?: string
  logoPath?: string
  logoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  fontFamily?: string
  subtitleFont?: string
  subtitleColor?: string
}

export type Project = {
  id: string
  name: string
  status: string
  source: string
  brandKit: ProjectBrand
  folders: ProjectFolder[]
  clips: ProjectClip[]
  updatedAt: string
}

export type ClipsWorkspaceCopy = {
  allProjects: string
  organization: string
  foldersTitle: string
  unassignedClips: string
  dropHere: string
  createFolder: string
  renameFolder: string
  deleteFolder: string
  clips: string
  moveTo: string
  root: string
  brand: string
  cancel: string
  emptyFolder: string
  emptyHint: string
  failed: string
}

export type ClipsWorkspaceProps = {
  projects: Project[]
  project?: Project
  folderId: string | null | 'all'
  text: ClipsWorkspaceCopy
  onProject: (id: string) => void
  onFolder: (id: string | null | 'all') => void
  onBrand: (project: Project) => void
  onMoveClip: (
    projectId: string,
    clipId: string,
    folderId: string | null
  ) => Promise<boolean>
  onCreateFolder: () => void
  onRenameFolder: (projectId: string, folder: ProjectFolder) => void
  onDeleteFolder: (projectId: string, folderId: string) => void
  onDeleted: () => void | Promise<void>
}
