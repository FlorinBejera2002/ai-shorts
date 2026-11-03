import { Bookmark, Camera, ChevronLeft, Heart, MessageCircle, MoreHorizontal, Music2, Repeat2, Search, Send, Share2, ThumbsUp } from 'lucide-react'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { useTranslations } from 'next-intl'
import type { ContentPlatform } from '@/lib/content-calendar'
import styles from './preview-panel.module.css'

function SocialHeader({ platform }: { platform: ContentPlatform }) {
  const t = useTranslations('brand.previewDesign')
  if (platform === 'tiktok') return <><span className={styles.socialTopTabs}>{t('following')}<strong>{t('forYou')}</strong></span><Search /></>
  if (platform === 'youtube') return <><ChevronLeft /><span className={styles.socialTopIcons}><Search /><MoreHorizontal /></span></>
  if (platform === 'facebook') return <><ChevronLeft /><strong>Reels</strong><span className={styles.socialTopIcons}><Search /><Camera /></span></>
  return <><span className={styles.socialTopTabs}><strong>Reels</strong>{t('friends')}</span><Camera /></>
}

export function SocialPreviewOverlay({ platform, accountName, caption }: {
  platform: ContentPlatform
  accountName?: string
  caption?: string
}) {
  const t = useTranslations('brand.previewDesign')
  return (
    <div className={styles.socialOverlay} aria-hidden="true" data-brand-social-overlay={platform}>
      <div className={styles.socialHeader}><SocialHeader platform={platform} /></div>
      <div className={styles.socialActions}>
        {platform === 'tiktok' && <span className={styles.avatar}><img src="/logo-icon.svg" alt="" /></span>}
        <span>{platform === 'facebook' ? <ThumbsUp /> : <Heart />}<small>1.2K</small></span>
        <span><MessageCircle /><small>24</small></span>
        {platform === 'tiktok' && <span><Bookmark /><small>86</small></span>}
        <span>{platform === 'instagram' ? <Send /> : <Share2 />}<small>86</small></span>
        {(platform === 'instagram' || platform === 'youtube') && <span><Repeat2 /></span>}
        <span><MoreHorizontal /></span>
      </div>
      <div className={styles.socialCaption}>
        <div className={styles.socialAccount}>
          {platform !== 'tiktok' && <span className={styles.avatar}><img src="/logo-icon.svg" alt="" /></span>}
          <strong>{accountName || (platform === 'youtube' || platform === 'tiktok' ? '@sneepcutstudio' : 'sneepcutstudio')}</strong>
          {platform !== 'tiktok' && <span className={styles.follow}>{t(platform === 'youtube' ? 'subscribe' : 'follow')}</span>}
        </div>
        <p>{caption === undefined ? t('sampleCaption') : caption}</p>
        <span className={styles.socialAudio}><Music2 />{t('sampleAudio')}</span>
      </div>
      {platform === 'tiktok' && <span className={styles.socialDisc}><PlatformBrandIcon provider="tiktok" className="size-5" /></span>}
    </div>
  )
}
