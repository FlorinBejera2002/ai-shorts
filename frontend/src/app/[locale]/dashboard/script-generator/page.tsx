'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { ScriptEditor } from '@/components/script/script-editor'
import { ScriptLibrary } from '@/components/script/script-library'
import {
  scriptSurfaceClass,
  scriptSurfaceProps
} from '@/components/script/script-theme'
import { useScriptsWorkspace } from '@/components/script/use-scripts-workspace'
import styles from '@/components/script/scripts-workspace.module.css'

export default function ScriptGeneratorPage() {
  const workspace = useScriptsWorkspace()
  return (
    <div
      className={`${scriptSurfaceClass} ${styles.workspace}`}
      data-script-workspace=""
      data-script-view={workspace.view}
      {...scriptSurfaceProps}
    >
      <WorkspaceMobileHeader variant="menu" />
      {workspace.view === 'library' ? (
        <ScriptLibrary
          records={workspace.records}
          query={workspace.query}
          includeArchived={workspace.includeArchived}
          busy={workspace.loadingLibrary}
          error={workspace.libraryError}
          creating={workspace.creating}
          onQueryChange={workspace.setQuery}
          onArchivedChange={workspace.setIncludeArchived}
          onRetry={workspace.retryLibrary}
          onOpen={workspace.applyRecord}
          onNew={workspace.createScript}
        />
      ) : (
        <ScriptEditor key={workspace.activeId} workspace={workspace} />
      )}
    </div>
  )
}
