import { dashboardRedirect } from '@/lib/dashboard-redirect'

// The former review page no longer exists; old bookmarks return to Clips.
export default dashboardRedirect('review')
