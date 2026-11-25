// Pure step model for the Creare clip stepper. Kept free of React and i18n
// imports so it can be unit-tested directly.

export type CreationStep = 0 | 1 | 2

export type CreationStepState = 'done' | 'current' | 'upcoming'

export interface CreationStepItem {
  index: CreationStep
  label: string
  state: CreationStepState
  // A step can be opened when it was reached before and no operation is running.
  reachable: boolean
}

export const creationStepCount = 3

export type TranslateFn = (english: string, romanian: string) => string

export function creationStepLabels(text: TranslateFn): readonly [string, string, string] {
  return [
    text('Add footage', 'Adaugă filmări'),
    text('Choose result', 'Alege rezultatul'),
    text('Generate', 'Generează')
  ]
}

export function creationStepItems({
  step,
  furthest,
  disabled,
  labels
}: {
  step: CreationStep
  furthest: CreationStep
  disabled: boolean
  labels: readonly string[]
}): CreationStepItem[] {
  return labels.map((label, index) => ({
    index: index as CreationStep,
    label,
    state: index < step ? 'done' : index === step ? 'current' : 'upcoming',
    reachable: !disabled && index <= furthest && index !== step
  }))
}

// Mobile progress: segments up to and including the current step are filled.
export function creationStepSegments(step: CreationStep): boolean[] {
  return Array.from({ length: creationStepCount }, (_, index) => index <= step)
}

export function creationStepCounter(step: CreationStep, text: TranslateFn): string {
  const position = step + 1
  return text(
    `Step ${position} of ${creationStepCount}`,
    `Pasul ${position} din ${creationStepCount}`
  )
}
