import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GooeyNav } from '@/components/ui/gooey-nav'
import { useIsMobile } from '@/hooks/use-mobile'
import { requestStoryAgentHelp } from '@/components/workspace-agent/story-help'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'

export type StoryStep = 0 | 1 | 2 | 3

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
  const heading = useRef<HTMLHeadingElement>(null)
  const headingID = useId()
  const hintID = useId()
  const steps = [
    {
      label: text('Footage', 'Filmări'),
      title: text('Add your clips', 'Adaugă filmările'),
      description: text(
        'Add your clips here. You can also continue and come back to them later.',
        'Adaugă filmările aici. Poți continua și să revii la ele mai târziu.'
      )
    },
    {
      label: text('Story & audio', 'Poveste și voce'),
      title: text('Story & audio', 'Poveste și voce'),
      description: text(
        'Use the sound from your clips or tell the story in your own voice.',
        'Folosește sunetul filmărilor sau spune povestea cu vocea ta.'
      )
    },
    {
      label: text('Style', 'Aspect'),
      title: text('Style', 'Aspect'),
      description: text(
        'Choose the shape and length. The suggested settings are a good place to start.',
        'Alege formatul și durata. Poți păstra setările sugerate.'
      )
    },
    {
      label: text('Review', 'Confirmare'),
      title: text('Review your story', 'Confirmă povestea'),
      description: text(
        'Check your choices. You can go back and change anything before creating.',
        'Verifică alegerile. Poți reveni și schimba orice înainte de creare.'
      )
    }
  ]

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  return (
    <section
      className="story-wizard-layout"
      aria-labelledby={headingID}
      data-testid="story-wizard"
    >
      <GooeyNav
        className="story-wizard-navigation"
        aria-label={text('Story creation steps', 'Pașii creării poveștii')}
        orientation={mobile ? 'horizontal' : 'vertical'}
        currentStep
        stretch
        value={step}
        onChange={(index) => onStep(index as StoryStep)}
        items={steps.map((item, index) => ({
          label: item.label,
          disabled: navigationDisabled || index > furthest,
          icon: (
            <span
              className="flex size-5 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              {index < step ? <Check className="size-4" /> : index + 1}
            </span>
          )
        }))}
      />
      <div className="story-wizard-content space-y-5 min-w-0">
        <div className="space-y-2">
          <p className="sr-only">
            {text('Step', 'Pasul')} {step + 1} {text('of', 'din')} 4
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                ref={heading}
                id={headingID}
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight outline-none sm:text-2xl"
                data-testid="story-step-heading"
              >
                {steps[step].title}
              </h2>
              <StoryHelp
                label={`${text('About this step', 'Despre acest pas')}: ${steps[step].label}`}
              >
                {steps[step].description}
              </StoryHelp>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              onClick={(event) =>
                requestStoryAgentHelp(
                  (['footage', 'story_audio', 'style', 'review'] as const)[step],
                  event.currentTarget
                )
              }
            >
              <MessageCircle />
              {text('Ask agent', 'Întreabă agentul')}
            </Button>
          </div>
        </div>
        {children}
        {navigationHint && (
          <p
            id={hintID}
            role="status"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {navigationHint}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 pt-4">
          {step > 0 ? (
            <Button
              variant="ghost"
              className="focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              disabled={navigationDisabled}
              aria-describedby={navigationHint ? hintID : undefined}
              onClick={() => onStep((step - 1) as StoryStep)}
            >
              <ArrowLeft />
              {text('Back', 'Înapoi')}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 && (
            <Button
              className="focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              disabled={navigationDisabled || continueDisabled}
              aria-describedby={navigationHint ? hintID : undefined}
              onClick={onContinue}
            >
              {text('Continue', 'Continuă')}
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
