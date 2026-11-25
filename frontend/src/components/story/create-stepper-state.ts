import { createContext, useContext, useEffect, useRef } from 'react'
import type { CreationStep } from './create-steps'

export interface CreationStepperModel {
  step: CreationStep
  furthest: CreationStep
  disabled: boolean
  onStep: (step: CreationStep) => void
}

// The wizard lives inside the Creare clip upload workspace, while the stepper
// sits beside the source switch in the page header. The wizard publishes its
// state here; `null` means no stepper is shown (for example, on the result view).
export const CreationStepperContext = createContext<
  ((model: CreationStepperModel | null) => void) | null
>(null)

type RegisteredStep = Omit<CreationStepperModel, 'onStep'> & {
  onStep: (step: CreationStep) => void
}

export function useRegisterCreationStepper({ step, furthest, disabled, onStep }: RegisteredStep) {
  const publish = useContext(CreationStepperContext)
  // The stepper calls the latest handler without re-publishing on every render.
  const onStepRef = useRef(onStep)
  useEffect(() => {
    onStepRef.current = onStep
  })
  useEffect(() => {
    if (!publish) return
    publish({
      step,
      furthest,
      disabled,
      onStep: (next) => onStepRef.current(next)
    })
    return () => publish(null)
  }, [publish, step, furthest, disabled])
}
