import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ credits: 100, plan: 'free' })
}
