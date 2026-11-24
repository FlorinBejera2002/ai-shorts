import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import type { CreationStep } from './create-steps'
import { useRegisterCreationStepper } from './create-stepper-state'
import pill from './story-pill-buttons.module.css'
import { useStoryLanguage } from './use-story-language'

export type StoryStep = CreationStep

interface Props {
  step: StoryStep
  furthest: StoryStep
  onStep: (step: StoryStep) => void
  onContinue: () => void
  navigationDisabled?: boolean
  continueDisabled?: boolean
  navigationHint?: string
  children: ReactNode
}

type Text = ReturnType<typeof useStoryLanguage>

const stepTitles = (text: Text) => [
  text('Add your clips', 'Adaugă filmările'),
  text('Make it yours', 'Alege cum va arăta'),
  text('Ready to generate', 'Pregătit de generare')
]

/**
 * Footer and step plumbing for the Creare clip wizard. The canvas shows no visible step heading,
 * help or agent button on Options and Review: the heading stays in the DOM, visually hidden, as
 * the focus target for step changes.
 */
export function StoryWizard({
  step,
  furthest,
  onStep,
  onContinue,
  navigationDisabled = false,
  continueDisabled = false,
  navigationHint,
  children
}: Props) {
  const text = useStoryLanguage()
  const mobile = useIsMobile()
  useSwipeBack(() => onStep((step - 1) as StoryStep), mobile && step > 0 && !navigationDisabled)
  const heading = useRef<HTMLHeadingElement>(null)
  const headingID = useId()
  const hintID = useId()

  // The step stepper is rendered by the page header next to the source switch.
  useRegisterCreationStepper({ step, furthest, disabled: navigationDisabled, onStep })

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  return (
    <section
      className="story-wizard-layout"
      aria-labelledby={headingID}
      data-testid="story-wizard"
      data-step={step}
    >
      <h2
        ref={heading}
        id={headingID}
        tabIndex={-1}
        className="sr-only"
        data-testid="story-step-heading"
      >
        {stepTitles(text)[step]}
      </h2>
      {children}
      <footer className="story-wizard-footer">
        {navigationHint && (
          <p id={hintID} role="status" className="story-wizard-hint">
            {navigationHint}
          </p>
        )}
        <div className="story-wizard-actions">
          {step > 0 && step < 2 && (
            <Button
              type="button"
              variant="outline"
              className={`story-wizard-back ${pill.pill} ${pill.outline}`}
              disabled={navigationDisabled}
              aria-describedby={navigationHint ? hintID : undefined}
              onClick={() => onStep((step - 1) as StoryStep)}
            >
              {text('Back', 'Înapoi')}
            </Button>
          )}
          {step < 2 && (
            <Button
              type="button"
              className={`story-wizard-continue ${pill.pill} ${pill.primary}`}
              disabled={navigationDisabled || continueDisabled}
              aria-describedby={navigationHint ? hintID : undefined}
              onClick={onContinue}
            >
              {text('Continue', 'Continuă')}
              <ArrowRight />
            </Button>
          )}
        </div>
      </footer>
    </section>
  )
}
