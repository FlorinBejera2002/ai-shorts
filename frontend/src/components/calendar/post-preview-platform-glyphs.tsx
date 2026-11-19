import type { ReactNode } from 'react'

// Glyphs copied from the Publish canvas platform boards (P-Instagram, P-Facebook, P-TikTok, P-YouTube).
// They draw with currentColor so each simulated interface inherits the colour of its screen.
export type PreviewGlyph =
  | 'heart' | 'comment' | 'repost' | 'send' | 'dots' | 'search' | 'home' | 'reels' | 'profile'
  | 'thumbsUp' | 'thumbsDown' | 'share' | 'globe' | 'person' | 'friends' | 'marketplace' | 'bell' | 'menu'
  | 'bookmark' | 'bubble' | 'note' | 'plus' | 'inbox' | 'shorts' | 'subscriptions' | 'remix' | 'live'
  | 'cellular' | 'wifi' | 'battery'

const glyphs: Record<PreviewGlyph, ReactNode> = {
  heart: <path d="M12 20.4s-8.2-4.8-8.2-10.9A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.2 2.9c0 6.1-8.2 10.9-8.2 10.9z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />,
  comment: <path d="M20.7 16.6A9.3 9.3 0 1 0 17 20.5l4.3 1.1z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />,
  repost: (
    <>
      <path d="M17 2.5l3.5 3.5L17 9.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 11V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5M7 21.5L3.5 18 7 14.5M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  send: (
    <>
      <path d="M22 3L9.2 10.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M22 3l-6.8 18-4-8.9L2 8.2z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  home: <path d="M3 10.5L12 3l9 7.5V21h-6v-6.5H9V21H3z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />,
  reels: <path d="M2.5 7.5h19V17a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 17zM2.6 6A4.5 4.5 0 0 1 7 2.5h1.6l2.6 3.5zm10.4 0l-2.6-3.5h4l2.6 3.5zm6.6 0L17 2.5a4.5 4.5 0 0 1 4.4 3.5zM10 11v7l6-3.5z" fill="currentColor" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c1-4.2 4.3-6.5 8-6.5s7 2.3 8 6.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  thumbsUp: <path d="M7 10.5v10H3.5v-10zM7 10.5l4-7.5c1.6 0 2.7 1.3 2.4 2.9L12.8 9h6.2a2 2 0 0 1 2 2.3l-1.2 7.3a2.3 2.3 0 0 1-2.3 1.9H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  thumbsDown: <path d="M7 10.5v10H3.5v-10zM8.5 20.5V10.3L12.6 3c1.4.1 2.4 1.4 2.2 2.8L14.2 9.5h5.6a2 2 0 0 1 2 2.3l-1.2 7a2.2 2.2 0 0 1-2.2 1.7z" fill="currentColor" />,
  share: <path d="M14 4.5l7 6.5-7 6.5v-4C8 13.5 5 15.5 3 19.5c.5-6 3.6-10.5 11-11z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.3 18.6c1.3-2.1 3.3-3.3 5.7-3.3s4.4 1.2 5.7 3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  friends: (
    <>
      <circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 14c2.4 0 4 1.5 4.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  marketplace: <path d="M3 9l1.5-5h15L21 9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M4.5 12v8.5h15V12M9.5 20.5v-5h5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  bookmark: <path d="M5 3.5A1.5 1.5 0 0 1 6.5 2h11A1.5 1.5 0 0 1 19 3.5V22l-7-4.6L5 22z" fill="currentColor" />,
  bubble: <path d="M12 2.5c5.5 0 10 3.9 10 8.7 0 4.9-4.5 8.8-10 8.8-.9 0-1.8-.1-2.6-.3L5 22v-3.9C3.2 16.6 2 14.5 2 11.2 2 6.4 6.5 2.5 12 2.5z" fill="currentColor" />,
  note: (
    <>
      <path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  inbox: <path d="M3 4h18v13H8l-5 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  shorts: <path d="M17.8 9.3l-1.6-.8 1.6-.9c2-1 2.7-3.5 1.6-5.4a4 4 0 0 0-5.4-1.5L6.2 5c-1.4.7-2.2 2.2-2.1 3.8.1 1.5 1 2.9 2.4 3.5l1.6.8-1.6.9c-2 1-2.7 3.5-1.6 5.4a4 4 0 0 0 5.4 1.5l7.8-4.1c1.4-.7 2.2-2.2 2.1-3.8-.1-1.5-1-2.9-2.4-3.7zM10 15V9l5 3z" fill="currentColor" />,
  subscriptions: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 5h12M8 2h8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 11.5v6l5-3z" fill="currentColor" />
    </>
  ),
  remix: <path d="M20 12a8 8 0 0 0-14-5.3L4 9M4 4v5h5M4 12a8 8 0 0 0 14 5.3l2-2.3M20 20v-5h-5M12 9v6M9 12h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  live: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3l4 3 4-3M7.5 12.5h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  cellular: (
    <>
      <rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="5" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="10" y="2.5" width="3" height="8.5" rx="1" fill="currentColor" />
      <rect x="15" y="0" width="3" height="11" rx="1" fill="currentColor" />
    </>
  ),
  wifi: <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.2A10.1 10.1 0 0 0 8 .5 10.1 10.1 0 0 0 .8 3.4L2 4.6a8.4 8.4 0 0 1 6-2.4zm0 3.4c1.4 0 2.6.5 3.6 1.4l1.2-1.2A7 7 0 0 0 8 3.9a7 7 0 0 0-4.8 1.9l1.2 1.2c1-.9 2.2-1.4 3.6-1.4zm0 3.4c.5 0 1 .2 1.3.5L8 10.8 6.7 9.5c.3-.3.8-.5 1.3-.5z" fill="currentColor" />,
  battery: (
    <>
      <rect x="0.5" y="0.5" width="22" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1" opacity=".5" />
      <rect x="2" y="2" width="17" height="7" rx="1.2" fill="currentColor" />
    </>
  )
}

const viewBoxes: Partial<Record<PreviewGlyph, string>> = {
  cellular: '0 0 18 11',
  wifi: '0 0 16 11',
  battery: '0 0 24 11'
}

export function PreviewIcon({ name, size = 24, className }: { name: PreviewGlyph; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox={viewBoxes[name] ?? '0 0 24 24'}
    >
      {glyphs[name]}
    </svg>
  )
}
