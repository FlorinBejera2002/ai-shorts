import { useState } from 'react'

/**
 * Opens the project named by a changed `?story=` link. The change is consumed only once
 * switching is safe, so an unchanged link never overrides a manual selection or a new project.
 */
export function useRequestedStoryLink({
  requestedID,
  currentID,
  switchingLocked,
  openProject
}: {
  requestedID: string | null
  currentID: string
  switchingLocked: boolean
  openProject: (id: string) => void
}) {
  const [previousRequestedID, setPreviousRequestedID] = useState(requestedID)
  if (requestedID === previousRequestedID || switchingLocked) return
  setPreviousRequestedID(requestedID)
  if (requestedID && requestedID !== currentID) openProject(requestedID)
}
