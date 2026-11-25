import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { formatGigabytes } from './story-source-model'
import styles from './story-sources.module.css'

interface Props {
  limits: StoryProject['limits']
  active: boolean
  onChoose: () => void
}

/** Empty-state drop target. Dropping files anywhere in the source step also adds them. */
export function SourceDropzone({ limits, active, onChoose }: Props) {
  const text = useStoryLanguage()
  const gigabytes = formatGigabytes(limits.max_file_bytes, text('.', ','), 0)
  return (
    <div className={`${styles.dropzone} ${active ? styles.dropzoneActive : ''}`}>
      <img
        src="/illustrations/create-upload.webp"
        alt={text(
          'Ana and Radu with footage ready to upload',
          'Ana și Radu cu filmările pregătite pentru încărcare'
        )}
        className={styles.dropzoneIllustration}
      />
      <h2 className={styles.dropzoneTitle}>
        <span className={styles.desktopOnly}>{text('Drop footage here', 'Trage filmările aici')}</span>
        <span className={styles.mobileOnly}>
          {text('Choose footage from your gallery', 'Alege filmările din galerie')}
        </span>
      </h2>
      <p className={styles.dropzoneSubtitle}>
        {text(
          `MP4, MOV, WebM, MKV · up to ${gigabytes} GB per file`,
          `MP4, MOV, WebM, MKV · până la ${gigabytes} GB pe fișier`
        )}
      </p>
      <Button type="button" className={styles.chooseButton} onClick={onChoose}>
        <Upload aria-hidden="true" />
        {text('Choose files', 'Alege fișiere')}
      </Button>
    </div>
  )
}
