import { pathToFileURL } from 'node:url'
const privateHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'backend', 'backend-go', 'nginx'])
export function validateCloudflareEnvironment(environment) {
  const issues = []
  for (const key of ['NEXT_PUBLIC_APP_URL', 'GO_API_URL', 'MEDIA_PROXY_HOST']) {
    try {
      const url = new URL(environment[key] ?? '')
      if (url.protocol !== 'https:' || privateHosts.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) issues.push(`${key} must use a public HTTPS origin without credentials, a path, query, or fragment`)
    } catch { issues.push(`${key} must be a valid public HTTPS URL`) }
  }
  if (environment.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(environment.NEXT_PUBLIC_API_URL)
      if (url.protocol !== 'https:' || privateHosts.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) issues.push('NEXT_PUBLIC_API_URL must be a public HTTPS origin without credentials, a path, query, or fragment')
    } catch { issues.push('NEXT_PUBLIC_API_URL must be a valid HTTPS origin') }
  }
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'REDIS_URL', 'AUTH_SECRET', 'NEXTAUTH_SECRET', 'INTERNAL_API_KEY', 'JWT_SECRET', 'GOOGLE_CLIENT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'UPLOAD_TOKEN_SECRET', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'RESEND_API_KEY', 'SMTP_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'UPLOAD_POST_API_KEY']) {
    if (environment[key]) issues.push(`${key} belongs only in the Go backend environment`)
  }
  return issues
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = validateCloudflareEnvironment(process.env)
  if (issues.length) { for (const issue of issues) console.error(issue); process.exitCode = 1 }
  else console.log('Frontend transport environment is valid')
}
