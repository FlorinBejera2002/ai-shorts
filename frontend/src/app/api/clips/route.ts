import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ message: 'Clips API — Phase 3' })
}
