export type AccountCredits = {
  credits: number
  plan: string
  creditsUnlimited?: boolean
}

export const accountCreditsKey = (userId: string | undefined) => ['account-credits', userId] as const
