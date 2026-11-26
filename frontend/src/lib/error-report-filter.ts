/**
 * Decides whether a browser error is worth sending to the admin error log.
 *
 * Dropped: ResizeObserver loop notices (benign layout warnings), cross-origin
 * "Script error." reports (no details are exposed), and errors whose stack has no
 * frame from this app's bundle origin, such as WebKit's built-in media controls script.
 * Errors without a stack (rejections carrying a string or plain object, such as a failed
 * API call) are kept, because they are real app failures.
 */
const benignMessages = [/ResizeObserver loop/, /^Script error\.?$/]

export function isReportableError(message: string, stack: string, appOrigin: string): boolean {
  if (benignMessages.some((pattern) => pattern.test(message))) return false
  if (!stack) return true
  return stack.includes(`${appOrigin}/`)
}
