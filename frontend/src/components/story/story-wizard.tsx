import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GooeyNav } from '@/components/ui/gooey-nav'
import { useIsMobile } from '@/hooks/use-mobile'
import { requestStoryAgentHelp } from '@/components/workspace-agent/story-help'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'

export type StoryStep = 0 | 1 | 2

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
      label: text('Add footage', 'Adaugă filmări'),
      title: text('Add your clips', 'Adaugă filmările'),
      description: text(
        'Upload clips in the order you want. You can reorder them any time before generating.',
        'Încarcă filmările în ordinea dorită. Le poți reordona înainte de generare.'
      )
    },
    {
      label: text('Choose the result', 'Alege rezultatul'),
      title: text('Make it yours', 'Alege cum va arăta'),
      description: text(
        'Choose captions and appearance. A description, music and narration are optional.',
        'Alege subtitrările și aspectul. Descrierea, muzica și narațiunea sunt opționale.'
      )
    },
    {
      label: text('Generate & review', 'Generează și verifică'),
      title: text('Ready to generate', 'Pregătit de generare'),
      description: text(
        'Generate your video, watch it, improve it and download the version you like.',
        'Generează videoul, urmărește-l, îmbunătățește-l și descarcă versiunea dorită.'
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
        aria-label={text('Clip creation steps', 'Pașii creării clipului')}
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
      <div className="story-wizard-content">
        <div className="story-wizard-heading">
          <p className="sr-only">
            {text('Step', 'Pasul')} {step + 1} {text('of', 'din')} 3
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                ref={heading}
                id={headingID}
                tabIndex={-1}
                className="text-lg font-semibold tracking-tight outline-none"
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
              className="story-agent-help text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              onClick={(event) =>
                requestStoryAgentHelp(
                  (['footage', 'style', 'review'] as const)[step],
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
        <div className="story-wizard-footer">
          {navigationHint && (
            <p
              id={hintID}
              role="status"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {navigationHint}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
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
            ) : null}
            {step < 2 && (
              <Button
                className="story-wizard-continue flex-1 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
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
      </div>
    </section>
  )
}
