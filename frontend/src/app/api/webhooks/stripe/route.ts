import { NextResponse } from 'next/server'

export function POST() {
  return NextResponse.json({ message: 'Stripe webhook — Phase 7' })
}
