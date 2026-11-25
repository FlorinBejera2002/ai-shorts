/** Destructive actions: their approval shows the delete illustration instead of the approval scene. */
const DELETE_ACTIONS = new Set(['stories.delete', 'clips.delete', 'folders.delete', 'calendar.delete', 'studio.assets.delete', 'studio.renders.delete'])

export function isDeleteApproval(preview?: Record<string, unknown>): boolean {
  return typeof preview?.action === 'string' && DELETE_ACTIONS.has(preview.action)
}
