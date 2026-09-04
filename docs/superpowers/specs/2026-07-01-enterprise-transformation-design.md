# Sneepcut Enterprise Transformation — Design Spec

## Overview

Transform Sneepcut from a functional MVP into a premium, enterprise-grade SaaS platform. Six sub-projects executed in dependency order, each building on the previous.

## Current State Summary

- **Frontend**: Next.js 15 App Router, Tailwind v4, Zustand, Prisma, NextAuth v5 (beta), 22 pages, no component library, no i18n
- **Backend**: FastAPI, SQLAlchemy (async), Celery/Redis, PostgreSQL, S3/local storage, rate limiting, signed URLs
- **Auth**: JWT + Google OAuth + credentials, header-based backend auth
- **Payments**: Stripe with 4 plans (free/creator/pro/agency), credit-based billing
- **Processing**: yt-dlp → Whisper → Gemini → FFmpeg → smart crop → subtitles pipeline

---

## Sub-Project 1: Internationalization (i18n)

### Decision: next-intl with static dictionaries

**Why next-intl over alternatives:**
- Native App Router support (server components, metadata, generateStaticParams)
- Type-safe message keys with TypeScript
- ICU MessageFormat (plurals, gender, numbers, dates)
- No runtime translation API cost — translations are static JSON files
- Easy to add languages: drop a new JSON file, add locale to config
- Smaller bundle than react-i18next for Next.js App Router

**Why NOT auto-translation (Google Translate API / DeepL):**
- SaaS UI text must be precise — auto-translation produces awkward phrasing for buttons, labels, error messages
- Legal/compliance text (privacy, terms) cannot be machine-translated
- Cost grows with usage; static files are free
- We can add DeepL integration later for user-generated content (clip titles, social captions) as a premium feature

### Architecture

```
frontend/
├── messages/
│   ├── en.json          # English (default)
│   └── ro.json          # Romanian
├── src/
│   ├── i18n/
│   │   ├── config.ts    # Supported locales, default locale
│   │   ├── request.ts   # next-intl getRequestConfig
│   │   └── navigation.ts # Localized Link, redirect, usePathname
│   ├── app/
│   │   ├── [locale]/        # All pages move under [locale]
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── ...all dashboard pages
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── pricing/
│   │   └── api/            # API routes stay outside [locale]
│   └── middleware.ts    # Updated: locale detection + auth
```

### Message Structure

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading...",
    "error": "Something went wrong",
    "credits": "{count, plural, one {# credit} other {# credits}}"
  },
  "nav": {
    "home": "Home",
    "create": "Create",
    "clips": "Clips",
    "analytics": "Analytics",
    "brand": "Brand Kit",
    "publish": "Publish",
    "history": "History",
    "billing": "Billing",
    "settings": "Settings"
  },
  "dashboard": { ... },
  "create": { ... },
  "auth": { ... },
  "billing": { ... },
  "settings": { ... },
  "landing": { ... }
}
```

### Language Switcher
- Dropdown in the sidebar footer (dashboard) and navbar (public pages)
- Stores preference in cookie `NEXT_LOCALE` for SSR
- Also persisted in user settings (DB) for authenticated users

### Adding Future Languages
1. Create `messages/{locale}.json`
2. Add locale to `i18n/config.ts` array
3. Done — no code changes needed

---

## Sub-Project 2: Theme System (Dark/Light Mode)

### Decision: CSS variables + next-themes

**Current state:** Dark mode CSS variables already exist and work. The `<html>` tag has `className="dark"` hardcoded. Zustand store has theme state but it's not wired to toggle the class.

**What needs to happen:**
1. Install `next-themes` — handles class toggling, system preference detection, flash prevention, SSR-safe
2. Replace hardcoded `className="dark"` with `next-themes` provider
3. Add theme toggle component (sun/moon icon) in sidebar and navbar
4. Audit all pages for color consistency in both modes
5. Remove theme from Zustand (next-themes handles persistence)

### Architecture

```tsx
// layout.tsx
import { ThemeProvider } from 'next-themes'

<html suppressHydrationWarning>
  <body>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </ThemeProvider>
  </body>
</html>
```

### Theme Toggle Component
- Icon: Sun (light) / Moon (dark) / Monitor (system)
- Three-state toggle: light → dark → system → light
- Placed in: sidebar footer, landing page navbar, settings page

### Color Audit Checklist
- All hardcoded colors → CSS variables
- Card borders visible in both modes
- Input backgrounds and placeholder text readable
- Chart colors have sufficient contrast in both modes
- Status indicators (success/warning/error) distinguishable

---

## Sub-Project 3: Professional Dashboard

### Decision: Data-rich overview with actionable widgets

The current dashboard shows 3 stats (credits, jobs, clips) and a recent jobs list. A premium SaaS dashboard needs significantly more.

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│ Welcome back, {name}                    [New Project ▸] │
├──────────┬──────────┬──────────┬────────────────────────┤
│ Credits  │ Jobs     │ Clips    │ Plan: {plan}           │
│   {n}    │  {n}     │  {n}     │ [Upgrade ▸]            │
├──────────┴──────────┴──────────┴────────────────────────┤
│                                                         │
│  ┌─ Quick Actions ──────────────────────────────────┐   │
│  │ [📎 Upload Video] [🔗 YouTube URL] [📦 Batch]   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Active Jobs ────────────┐ ┌─ Weekly Stats ───────┐  │
│  │ Job 1: ████░░ 65%        │ │ Line chart:          │  │
│  │ Job 2: ██████ Complete   │ │ clips/day over 7d    │  │
│  │ Job 3: ░░░░░░ Queued     │ │                      │  │
│  └──────────────────────────┘ └──────────────────────┘  │
│                                                         │
│  ┌─ Recent Clips (top 6) ───────────────────────────┐   │
│  │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │   │
│  │ │ 🎬 │ │ 🎬 │ │ 🎬 │ │ 🎬 │ │ 🎬 │ │ 🎬 │      │   │
│  │ │9.2 │ │8.7 │ │8.5 │ │8.1 │ │7.9 │ │7.5 │      │   │
│  │ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Tips & Notifications ───────────────────────────┐   │
│  │ 💡 Your clips score 15% higher with subtitles    │   │
│  │ ⚡ 3 clips ready for publishing                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Widgets

1. **Stats Bar** — credits, total jobs, total clips, current plan with upgrade CTA
2. **Quick Actions** — 3 buttons for primary creation flows
3. **Active Jobs** — real-time progress bars for in-progress jobs (polling every 5s)
4. **Weekly Activity Chart** — clips generated per day (last 7 days), pure CSS/SVG chart (no chart library needed for this)
5. **Top Recent Clips** — 6 most recent clips with thumbnails, viral scores, quick actions (download, copy link)
6. **Tips & Notifications** — contextual tips based on usage patterns, pending actions

### Data Requirements
- All data fetched server-side via Prisma queries (existing pattern)
- Active jobs polled client-side with interval
- Weekly stats aggregated with SQL GROUP BY date

---

## Sub-Project 4: Client Customization Engine

### Decision: Comprehensive settings with feature toggles

Review every page and identify what clients can customize.

### Settings Page Redesign

**Sections:**

1. **Profile** — Name, email, avatar, password change
2. **Preferences** — Language, theme, timezone, date format
3. **Default Project Settings** — Default clips count, aspect ratio, subtitle style, smart crop on/off, brand kit auto-apply
4. **Notifications** — Email notifications for: job complete, job failed, credits low, weekly summary
5. **API Access** (Pro+) — API key generation, webhook URL configuration
6. **Data & Privacy** — Export data, delete account (existing)

### Per-Page Customization Opportunities

| Page | Customizable Elements |
|------|----------------------|
| Dashboard | Widget visibility/order, stats timeframe (7d/30d/all) |
| Create | Default platform preset, default clip count, remember last settings |
| Clips | Grid/list view, sort order, items per page |
| Brand Kit | All brand settings (already exists, expand with more options) |
| Billing | Already customizable (plan selection) |
| Analytics | Date range, chart type preferences |
| History | Filters, items per page, auto-archive old jobs |

### User Preferences Schema (Prisma)

```prisma
model UserPreferences {
  id                    String   @id @default(uuid())
  userId                String   @unique
  user                  User     @relation(fields: [userId], references: [id])
  
  // Display
  language              String   @default("en")
  theme                 String   @default("dark")
  timezone              String   @default("UTC")
  dateFormat            String   @default("DD/MM/YYYY")
  
  // Default project settings
  defaultClips          Int      @default(5)
  defaultAspectRatio    String   @default("9:16")
  defaultSubtitleStyle  String   @default("clean")
  defaultSmartCrop      Boolean  @default(true)
  defaultBrandKit       Boolean  @default(false)
  defaultPlatform       String   @default("shorts")
  
  // Dashboard
  dashboardWidgets      Json     @default("{}")
  dashboardTimeframe    String   @default("7d")
  
  // Clips view
  clipsViewMode         String   @default("grid")
  clipsSortBy           String   @default("createdAt")
  clipsSortOrder        String   @default("desc")
  clipsPerPage          Int      @default(12)
  
  // Notifications
  notifyJobComplete     Boolean  @default(true)
  notifyJobFailed       Boolean  @default(true)
  notifyCreditsLow      Boolean  @default(true)
  notifyWeeklySummary   Boolean  @default(false)
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

---

## Sub-Project 5: Architecture & Security Hardening

### Authentication Improvements

1. **Upgrade NextAuth** — Currently on beta.29, upgrade to latest stable v5
2. **Add email verification** — Required for new accounts
3. **Add 2FA/TOTP** (Enterprise tier) — Optional two-factor authentication
4. **Session management** — View active sessions, revoke sessions
5. **Password policies** — Minimum length, complexity requirements

### Authorization & RBAC

```
Roles:
- user (default)         — standard access
- team_admin             — manage team members, shared brand kits
- org_admin              — billing, team management, API access
- super_admin            — platform administration

Permissions per plan:
- free:     5 clips/month, 100 credits, no API, no batch
- creator:  50 clips/month, 500 credits, batch up to 5
- pro:      unlimited clips, 2000 credits, API access, batch up to 20, priority queue
- agency:   unlimited, 10000 credits, team seats, white-label, webhook integrations
```

### API Hardening

1. **Input validation** — Strict Pydantic schemas on all endpoints (already mostly done)
2. **Rate limiting** — Already implemented with slowapi, add per-plan limits
3. **CSRF protection** — Add CSRF tokens for state-changing operations
4. **Content Security Policy** — Already in next.config.ts headers, audit and tighten
5. **SQL injection** — SQLAlchemy parameterized queries (already safe), audit raw queries
6. **XSS** — React auto-escapes, audit dangerouslySetInnerHTML usage (none found)
7. **File upload validation** — Magic byte verification, not just extension checks
8. **Signed URLs** — Already implemented, ensure all media access uses them in production

### Audit Logging

New `AuditLog` model:
```
- id, userId, action, resource, resourceId, metadata (JSON), ipAddress, userAgent, createdAt
- Actions: login, logout, job.create, job.cancel, clip.delete, settings.update, billing.change, data.export, data.delete
```

### Performance

1. **Database indexes** — Audit and add composite indexes for common queries
2. **Connection pooling** — Already using SQLAlchemy pool, tune pool_size
3. **Redis caching** — Cache user preferences, plan limits, frequently accessed data
4. **API response compression** — Already gzip in Nginx
5. **Frontend code splitting** — Next.js does this automatically, verify bundle sizes
6. **Image optimization** — Use Next.js Image component where applicable

### Monitoring & Logging

1. **Structured logging** — Replace print statements with Python logging module
2. **Health checks** — Already exist, add deep health (DB, Redis, Celery connectivity)
3. **Error tracking** — Add Sentry integration (optional, env-configured)

---

## Sub-Project 6: Premium Features & Subscription Tiers

### New Features by Tier

**Free (existing):**
- 100 credits, 5 clips/month
- YouTube URL + upload
- Basic subtitle styles (clean)
- Standard processing queue

**Creator ($19/mo):**
- 500 credits, 50 clips/month
- Batch processing (up to 5 URLs)
- All subtitle styles
- Brand kit basics (colors, font)
- Social captions (AI-generated)
- Priority processing queue

**Pro ($49/mo):**
- 2000 credits, unlimited clips
- Batch processing (up to 20 URLs)
- Full brand kit (watermark, intro/outro)
- API access with webhook notifications
- Advanced analytics dashboard
- Custom subtitle fonts
- Team sharing (up to 3 seats)
- Export presets (platform-specific encoding)

**Agency ($149/mo):**
- 10000 credits, unlimited everything
- White-label mode (remove Sneepcut branding)
- Team management (up to 20 seats)
- Custom webhook integrations
- Dedicated processing priority
- Bulk operations
- Usage analytics & reporting
- SSO/SAML (future)
- SLA guarantee

### New Pages/Modules

1. **Team Management** (`/dashboard/team`) — Invite members, assign roles, shared brand kits (Pro+)
2. **API Keys** (`/dashboard/settings/api`) — Generate/revoke API keys, view usage (Pro+)
3. **Webhooks** (`/dashboard/settings/webhooks`) — Configure webhook URLs for job events (Pro+)
4. **Advanced Analytics** (`/dashboard/analytics`) — Upgrade from placeholder to full analytics:
   - Clips generated over time
   - Average viral scores
   - Most used platforms
   - Credit usage trends
   - Processing time averages
5. **Export Presets** — Save and reuse processing configurations (Creator+)
6. **Templates** — Pre-built clip configurations for common use cases (all tiers, premium templates for paid)

### Feature Gating Implementation

```typescript
// lib/plan-limits.ts
export const PLAN_LIMITS = {
  free:    { clips: 5, credits: 100, batch: 0, api: false, team: 0, brandKit: false, webhooks: false },
  creator: { clips: 50, credits: 500, batch: 5, api: false, team: 0, brandKit: true, webhooks: false },
  pro:     { clips: -1, credits: 2000, batch: 20, api: true, team: 3, brandKit: true, webhooks: true },
  agency:  { clips: -1, credits: 10000, batch: 50, api: true, team: 20, brandKit: true, webhooks: true },
} as const

export function canAccess(plan: Plan, feature: keyof PlanLimits): boolean { ... }
export function getPlanLimit(plan: Plan, feature: keyof PlanLimits): number { ... }
```

Gate checked both client-side (hide UI) and server-side (API validation).

---

## Implementation Order

1. **i18n** — Foundation layer, all subsequent work uses translated strings
2. **Theme System** — Quick win, mostly wiring existing CSS variables
3. **Dashboard** — High-impact visual improvement
4. **Settings & Customization** — New DB schema, preferences API
5. **Security & Architecture** — Hardening pass, audit logging
6. **Premium Features** — New pages, feature gating, tier system

Each sub-project gets its own implementation plan and is committed as a logical unit.

---

## Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| i18n library | next-intl | Best App Router support, type-safe, no API costs |
| Theme management | next-themes | SSR-safe, system preference, flash prevention |
| Chart library | None (CSS/SVG) | Dashboard charts are simple, avoid bundle bloat |
| Component library | Stay without (Tailwind + custom) | Already established pattern, no migration needed |
| Auth upgrade | NextAuth v5 stable | Fix beta issues, add email verification |
| Audit logging | Custom PostgreSQL table | Simple, queryable, no external service needed |
| Feature gating | Static config + server validation | No feature flag service needed at this scale |
| Team management | Prisma relations | User → Team → TeamMember with roles |
| API keys | HMAC-SHA256 tokens | Stored hashed in DB, shown once on creation |

---

## What This Spec Does NOT Cover

- Mobile app (React Native) — future phase
- SSO/SAML — mentioned as Agency future feature
- Real-time collaboration — not needed for video clipping workflow
- CDN setup — deployment infrastructure, separate concern
- CI/CD pipeline — separate concern
- Video player upgrade — current HTML5 video is sufficient
