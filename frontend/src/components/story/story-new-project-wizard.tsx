import { StorySources } from './story-sources'
import type { RejectedSource } from './story-source-model'
import { StoryWizard } from './story-wizard'
import type { StoryProject } from './types'
import { defaultLimits } from './types'
import { useStoryLanguage } from './use-story-language'

interface StoryNewProjectWizardProps {
  creating: boolean
  canContinue: boolean
  limits: StoryProject['limits'] | typeof defaultLimits
  refused: RejectedSource[]
  onRefusedChange: (update: (current: RejectedSource[]) => RejectedSource[]) => void
  onAdd: (files: File[]) => void
  onContinue: () => void
}

/** The first step of a project that does not exist yet: choose footage, then create the project. */
export function StoryNewProjectWizard({
  creating,
  canContinue,
  limits,
  refused,
  onRefusedChange,
  onAdd,
  onContinue
}: StoryNewProjectWizardProps) {
  const text = useStoryLanguage()
  return (
    <StoryWizard
      step={0}
      furthest={0}
      onStep={() => {}}
      onContinue={onContinue}
      navigationDisabled={creating}
      continueDisabled={!canContinue}
    >
      <div className="story-step-panel" data-testid="story-step-0">
        <StorySources
          assets={[]}
          uploads={[]}
          limits={limits}
          disabled={creating}
          onAdd={onAdd}
          onRemove={() => {}}
          onRetry={() => {}}
          onDuration={() => {}}
          onChange={() => {}}
          refused={refused}
          onRefusedChange={onRefusedChange}
        />
      </div>
      {creating && (
        <p role="status" className="text-sm">
          {text('Creating your project…', 'Se creează proiectul…')}
        </p>
      )}
    </StoryWizard>
  )
}
