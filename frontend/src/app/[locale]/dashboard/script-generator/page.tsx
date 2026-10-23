'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { ScriptEditor } from '@/components/script/script-editor'
import { ScriptLibrary } from '@/components/script/script-library'
import { useScriptsWorkspace } from '@/components/script/use-scripts-workspace'
import { useLocale, useTranslations } from 'next-intl'
import styles from '@/components/script/scripts-workspace.module.css'

export default function ScriptGeneratorPage() {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const workspace = useScriptsWorkspace()
  return (
    <div className={styles.workspace} data-script-workspace="">
      <WorkspaceMobileHeader />
      {workspace.view === 'library' ? (
        <ScriptLibrary
          records={workspace.records}
          query={workspace.query}
          includeArchived={workspace.includeArchived}
          busy={workspace.loadingLibrary}
          onQueryChange={workspace.setQuery}
          onArchivedChange={workspace.setIncludeArchived}
          creating={workspace.creating}
          onOpen={workspace.applyRecord}
          onNew={workspace.createScript}
          locale={locale}
          labels={{
            title: t('workspace.title'),
            search: t('workspace.search'),
            archived: t('workspace.showArchived'),
            new: t('workspace.new'),
            emptyTitle: t('workspace.emptyTitle'),
            emptyDescription: t('workspace.emptyDescription'),
            noBrief: t('workspace.noBrief'),
            platformRequired: t('platformRequired'),
            ...Object.fromEntries(
              [
                'idea',
                'draft',
                'review',
                'ready',
                'in_production',
                'published',
                'archived'
              ].map((status) => [
                `status.${status}`,
                t(`workspace.status.${status}`)
              ])
            )
          }}
        />
      ) : (
        <ScriptEditor key={workspace.activeId} workspace={workspace} />
      )}
    </div>
  )
}
