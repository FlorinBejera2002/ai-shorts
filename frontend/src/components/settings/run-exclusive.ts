/**
 * Runs one guarded request: `claim` decides whether it may start, `onFinish` always runs.
 * Kept outside the hooks because React Compiler cannot optimize `try…finally` in a hook.
 */
export async function runExclusive({
  claim,
  onStart,
  onError,
  onFinish,
  action
}: {
  claim: () => boolean
  onStart: () => void
  onError: (error: unknown) => void
  onFinish: (succeeded: boolean) => void
  action: () => Promise<void>
}) {
  if (!claim()) return
  onStart()
  let succeeded = false
  try {
    await action()
    succeeded = true
  } catch (error) {
    onError(error)
  } finally {
    onFinish(succeeded)
  }
}
