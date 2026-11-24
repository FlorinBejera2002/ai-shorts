import { Check } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  creationStepCounter,
  creationStepItems,
  creationStepLabels,
  creationStepSegments
} from './create-steps'
import type { CreationStepperModel } from './create-stepper-state'
import { useStoryLanguage } from './use-story-language'

export function CreationStepper({ step, furthest, disabled, onStep }: CreationStepperModel) {
  const text = useStoryLanguage()
  const mobile = useIsMobile()
  const labels = creationStepLabels(text)
  const navLabel = text('Clip creation steps', 'Pașii creării clipului')

  if (mobile) {
    const segments = creationStepSegments(step)
    return (
      <nav aria-label={navLabel} className="creation-stepper creation-stepper-mobile">
        <div className="creation-stepper-mobile-row">
          <p className="creation-stepper-current" aria-current="step">
            {labels[step]}
          </p>
          <p className="creation-stepper-counter">{creationStepCounter(step, text)}</p>
        </div>
        <div className="creation-stepper-segments" aria-hidden="true">
          {segments.map((filled, index) => (
            <span key={index} data-filled={filled} />
          ))}
        </div>
      </nav>
    )
  }

  const items = creationStepItems({ step, furthest, disabled, labels })
  return (
    <nav aria-label={navLabel} className="creation-stepper">
      <ol className="creation-stepper-list">
        {items.map((item) => (
          <li key={item.index}>
            <button
              type="button"
              className="creation-stepper-item"
              data-state={item.state}
              aria-current={item.state === 'current' ? 'step' : undefined}
              disabled={!item.reachable && item.state !== 'current'}
              onClick={() => onStep(item.index)}
            >
              <span className="creation-stepper-number" aria-hidden="true">
                {item.state === 'done' ? <Check strokeWidth={3} /> : item.index + 1}
              </span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
