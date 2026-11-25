import type { ActivityItem } from './types'

const kindLabels: Record<string, string> = {
  account_created: 'Cont creat',
  security_login: 'Autentificare',
  security_mfa_enabled: '2FA activat',
  security_mfa_disabled: '2FA dezactivat',
  security_session_revoked: 'Dispozitiv deconectat',
  security_sessions_revoked: 'Alte dispozitive deconectate',
  plan_changed: 'Plan schimbat',
  profile_updated: 'Profil actualizat',
  preferences_updated: 'Setări actualizate',
  brand_kit_saved: 'Brand kit salvat',
  job_created: 'Clipuri cerute',
  job_completed: 'Clipuri gata',
  job_failed: 'Procesare eșuată',
  youtube_import_started: 'Import YouTube pornit',
  youtube_import_ready: 'Import YouTube gata',
  youtube_import_failed: 'Import YouTube eșuat',
  post_created: 'Postare programată',
  post_published: 'Postare publicată',
  post_failed: 'Postare eșuată',
  feedback_problem: 'Problemă raportată',
  feedback_idea: 'Idee trimisă',
  feedback_clip: 'Clip evaluat',
  admin_adjust_credits: 'Credite ajustate de admin',
  admin_set_role: 'Rol schimbat de admin',
  admin_set_status: 'Status schimbat de admin'
}

const detailLabels: Record<string, string> = {
  upload: 'Încărcare',
  url: 'Link',
  youtube: 'YouTube',
  story: 'Creare clip',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn'
}

export function activityLabel(item: ActivityItem) {
  return kindLabels[item.kind] ?? 'Activitate'
}

export function activityDetail(item: ActivityItem) {
  if (!item.detail) return ''
  return detailLabels[item.detail] ?? item.detail
}

export function activityFailed(item: ActivityItem) {
  return item.kind.endsWith('_failed')
}
