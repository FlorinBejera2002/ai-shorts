# ClipForge Enterprise Transformation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ClipForge into a premium SaaS platform with full i18n (EN/RO), dark/light mode toggling, a data-rich professional dashboard, and expanded client customization — while preserving all existing functionality.

**Architecture:** next-intl for locale-based routing under `[locale]` segment, next-themes for SSR-safe theme toggling with system preference detection, server-side dashboard widgets with client-side polling for active jobs. All hardcoded UI strings extracted to JSON message files. User preferences stored in a new Prisma model.

**Tech Stack:** Next.js 15, next-intl, next-themes, Tailwind v4, Zustand, Prisma, TypeScript

---

## File Map

### Sub-Project 1: i18n

| File | Purpose |
|------|---------|
| Create: `frontend/messages/en.json` | English translations |
| Create: `frontend/messages/ro.json` | Romanian translations |
| Create: `frontend/src/i18n/config.ts` | Locale list, default locale |
| Create: `frontend/src/i18n/request.ts` | next-intl getRequestConfig |
| Create: `frontend/src/i18n/navigation.ts` | Localized Link, redirect, usePathname, useRouter |
| Modify: `frontend/src/middleware.ts` | Add locale detection before auth check |
| Modify: `frontend/next.config.ts` | Add createNextIntlPlugin wrapper |
| Modify: `frontend/src/app/layout.tsx` | Move to `[locale]/layout.tsx`, add NextIntlClientProvider |
| Move: all `src/app/*.tsx` pages | Under `src/app/[locale]/` |
| Move: all `src/app/dashboard/**` | Under `src/app/[locale]/dashboard/` |
| Keep: `src/app/api/**` | API routes stay outside `[locale]` |
| Modify: every page file | Replace hardcoded strings with `useTranslations()` or `getTranslations()` |

### Sub-Project 2: Theme System

| File | Purpose |
|------|---------|
| Create: `frontend/src/components/shared/theme-toggle.tsx` | Three-state theme toggle (light/dark/system) |
| Modify: `frontend/src/app/[locale]/layout.tsx` | Wrap with ThemeProvider from next-themes |
| Modify: `frontend/src/stores/ui-store.ts` | Remove theme state (next-themes handles it) |
| Modify: `frontend/src/app/[locale]/dashboard/layout.tsx` | Add theme toggle in sidebar |

### Sub-Project 3: Professional Dashboard

| File | Purpose |
|------|---------|
| Create: `frontend/src/components/dashboard/stats-bar.tsx` | Credits, jobs, clips, plan stats |
| Create: `frontend/src/components/dashboard/quick-actions.tsx` | Upload, YouTube, Batch action cards |
| Create: `frontend/src/components/dashboard/active-jobs.tsx` | Real-time job progress (client component) |
| Create: `frontend/src/components/dashboard/weekly-chart.tsx` | CSS bar chart of clips per day |
| Create: `frontend/src/components/dashboard/recent-clips.tsx` | Top 6 clips with thumbnails |
| Create: `frontend/src/components/dashboard/tips-panel.tsx` | Contextual tips and notifications |
| Modify: `frontend/src/app/[locale]/dashboard/page.tsx` | Compose all dashboard widgets |

---

## Tasks

### Task 1: Install i18n and theme dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install next-intl and next-themes**

```bash
cd frontend && npm install next-intl next-themes
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('next-intl'); require('next-themes'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: install next-intl and next-themes"
```

---

### Task 2: Create i18n configuration

**Files:**
- Create: `frontend/src/i18n/config.ts`
- Create: `frontend/src/i18n/request.ts`
- Create: `frontend/src/i18n/navigation.ts`

- [ ] **Step 1: Create i18n config**

```typescript
// frontend/src/i18n/config.ts
export const locales = ['en', 'ro'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'
```

- [ ] **Step 2: Create request config for next-intl**

```typescript
// frontend/src/i18n/request.ts
import { getRequestConfig } from 'next-intl/server'
import { routing } from './navigation'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

- [ ] **Step 3: Create navigation helpers**

```typescript
// frontend/src/i18n/navigation.ts
import { createNavigation } from 'next-intl/navigation'
import { defineRouting } from 'next-intl/routing'
import { locales, defaultLocale } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/
git commit -m "feat: add i18n configuration with next-intl"
```

---

### Task 3: Create English and Romanian message files

**Files:**
- Create: `frontend/messages/en.json`
- Create: `frontend/messages/ro.json`

- [ ] **Step 1: Create English messages**

Create `frontend/messages/en.json` with all UI strings organized by section:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading...",
    "error": "Something went wrong",
    "back": "Back",
    "next": "Next",
    "submit": "Submit",
    "close": "Close",
    "search": "Search",
    "reset": "Reset",
    "upgrade": "Upgrade",
    "download": "Download",
    "copy": "Copy",
    "copied": "Copied",
    "saved": "Saved",
    "credits": "{count, plural, one {# credit} other {# credits}}",
    "clips": "{count, plural, one {# clip} other {# clips}}",
    "jobs": "{count, plural, one {# job} other {# jobs}}"
  },
  "nav": {
    "home": "Home",
    "create": "Create",
    "review": "Review",
    "clips": "Clips",
    "analytics": "Analytics",
    "brand": "Brand Kit",
    "publish": "Publish",
    "history": "History",
    "billing": "Billing",
    "settings": "Settings",
    "workspace": "My workspace"
  },
  "landing": {
    "badge": "AI-powered video clipping",
    "heroTitle1": "Turn long videos into",
    "heroTitle2": "ready-to-post shorts",
    "heroDesc": "Upload a video or paste a YouTube URL. ClipForge transcribes, detects viral hooks, crops for vertical, adds captions, and generates platform-ready clips — in minutes.",
    "ctaFree": "Start free — 100 credits",
    "ctaPricing": "See pricing",
    "pricing": "Pricing",
    "signIn": "Sign in",
    "getStarted": "Get started",
    "howItWorks": "How it works",
    "howItWorksDesc": "Three steps. Zero editing skills required.",
    "step1Title": "Upload or paste URL",
    "step1Desc": "Drop a video file or paste any YouTube link",
    "step2Title": "AI processes everything",
    "step2Desc": "Transcription, highlight detection, cropping, subtitles — all automated",
    "step3Title": "Review & export",
    "step3Desc": "Trim, preview, and download your viral-ready short-form clips",
    "featuresTitle": "Everything you need to go viral",
    "featuresDesc": "A complete pipeline from raw footage to platform-ready shorts",
    "feat1Title": "AI highlight detection",
    "feat1Desc": "Gemini 2.5 Flash analyzes your transcript and finds the most viral-worthy moments with hook scoring",
    "feat2Title": "Smart vertical crop",
    "feat2Desc": "Face and speaker tracking ensures the subject stays centered in 9:16 format",
    "feat3Title": "Auto subtitles",
    "feat3Desc": "Whisper transcription with multiple caption styles burned directly into your clips",
    "feat4Title": "AI social captions",
    "feat4Desc": "Auto-generated descriptions and hashtags optimized for TikTok, Instagram, and YouTube",
    "feat5Title": "Brand kit",
    "feat5Desc": "Custom colors, fonts, subtitle styles and watermarks applied consistently across all clips",
    "feat6Title": "Batch processing",
    "feat6Desc": "Process up to 20 YouTube URLs at once — perfect for repurposing entire playlists",
    "trustGdpr": "GDPR compliant",
    "trustGdprDesc": "Full data export, account deletion, and privacy controls built in",
    "trustFast": "Fast processing",
    "trustFastDesc": "Most videos processed in under 5 minutes with priority queue for paid plans",
    "trustViral": "Viral score analytics",
    "trustViralDesc": "AI-scored clips ranked by viral potential so you post the best content first",
    "finalCtaTitle": "Ready to create viral shorts?",
    "finalCtaDesc": "Join creators who save hours every week repurposing long-form content into short-form clips that drive engagement.",
    "finalCtaButton": "Get started for free",
    "finalCtaNote": "100 free credits. No credit card required.",
    "footer": "© {year} ClipForge. All rights reserved.",
    "privacy": "Privacy",
    "terms": "Terms",
    "statProcessing": "Processing time",
    "statCrop": "Auto crop ratio",
    "statBatch": "Clips per batch",
    "statGdpr": "Compliant"
  },
  "auth": {
    "welcomeBack": "Welcome back",
    "signInDesc": "Sign in to your workspace",
    "continueGoogle": "Continue with Google",
    "or": "or",
    "email": "Email",
    "password": "Password",
    "signIn": "Sign in",
    "forgotPassword": "Forgot password?",
    "noAccount": "Don't have an account?",
    "signUp": "Sign up",
    "createAccount": "Create account",
    "createAccountDesc": "Start with 100 free credits",
    "name": "Name",
    "creating": "Creating...",
    "hasAccount": "Already have an account?",
    "agreeTerms": "By creating an account you agree to our",
    "termsLink": "Terms",
    "andText": "and",
    "privacyLink": "Privacy Policy",
    "errorInvalidCredentials": "Invalid email or password.",
    "errorDatabase": "Database connection is unavailable. Start the local database and try again.",
    "errorGeneric": "An error occurred. Please try again.",
    "passwordRules": {
      "length": "At least 12 characters",
      "uppercase": "Uppercase letter",
      "lowercase": "Lowercase letter",
      "number": "Number",
      "special": "Special character"
    },
    "passwordWeak": "Password does not meet requirements",
    "accountCreated": "Account created! Redirecting...",
    "forgotTitle": "Reset password",
    "forgotDesc": "Enter your email to receive a reset link",
    "sendResetLink": "Send reset link",
    "backToLogin": "Back to login",
    "resetTitle": "Set new password",
    "resetDesc": "Enter your new password",
    "resetButton": "Reset password"
  },
  "dashboard": {
    "welcomeUser": "Welcome back{name, select, empty {} other {, {name}}}",
    "overview": "Here's your workspace overview",
    "newProject": "New project",
    "creditsLabel": "Credits",
    "jobsLabel": "Jobs",
    "clipsLabel": "Clips",
    "planLabel": "Plan",
    "recentJobs": "Recent jobs",
    "noJobs": "No jobs yet",
    "firstProject": "Create your first project →",
    "quickActions": "Quick Actions",
    "uploadVideo": "Upload Video",
    "youtubeUrl": "YouTube URL",
    "batchProcess": "Batch Process",
    "activeJobs": "Active Jobs",
    "noActiveJobs": "No active jobs",
    "weeklyActivity": "This Week",
    "recentClips": "Recent Clips",
    "viewAll": "View all",
    "tips": "Tips",
    "tipSubtitles": "Your clips score 15% higher with subtitles enabled",
    "tipBrandKit": "Set up your brand kit for consistent clips",
    "tipBatch": "Use batch processing to save time on multiple videos",
    "clipsReady": "{count, plural, one {# clip} other {# clips}} ready for publishing"
  },
  "create": {
    "title": "Create clips",
    "desc": "Upload a video, paste a YouTube link, or batch process multiple videos",
    "youtube": "YouTube",
    "upload": "Upload",
    "batch": "Batch",
    "youtubeUrl": "YouTube URL",
    "youtubeUrlPlaceholder": "https://youtube.com/watch?v=...",
    "dropOrChoose": "Drop or choose a video",
    "fileTypes": "MP4, MOV, AVI, MKV, WEBM up to 2 GB",
    "batchUrls": "YouTube URLs ({count}/20)",
    "addUrl": "Add URL",
    "settings": "Settings",
    "platformPreset": "Platform preset",
    "clipsPerVideo": "Clips per video",
    "aspectRatio": "Aspect ratio",
    "subtitles": "Subtitles",
    "subtitleClean": "Clean",
    "subtitleBold": "Bold",
    "subtitleCaptionBox": "Caption box",
    "subtitleNone": "None",
    "brandKit": "Brand kit",
    "cost": "Cost",
    "costBatch": "Cost ({count} videos)",
    "creditsUnit": "credits",
    "generateClips": "Generate {count, plural, one {# clip} other {# clips}}",
    "processVideos": "Process {count} videos",
    "processing": "Processing...",
    "uploadFailed": "Upload failed. Check your connection.",
    "videoUploaded": "Video uploaded",
    "jobQueued": "Job queued successfully",
    "batchQueued": "{count} jobs queued",
    "addOneUrl": "Add at least one URL"
  },
  "clips": {
    "title": "Clips",
    "count": "{count, plural, one {# clip} other {# clips}} generated",
    "noClips": "No clips yet",
    "firstProject": "Create your first project →",
    "viralScore": "{score}/10"
  },
  "history": {
    "title": "History",
    "count": "{count, plural, one {# job} other {# jobs}} total",
    "noJobs": "No jobs yet",
    "firstProject": "Create your first project →",
    "requested": "requested",
    "generated": "generated"
  },
  "analytics": {
    "title": "Analytics",
    "desc": "Overview of your clip generation performance",
    "totalProjects": "Total projects",
    "clipsGenerated": "Clips generated",
    "avgViralScore": "Avg viral score",
    "successRate": "Success rate",
    "contentCreated": "Content created",
    "sourceProcessed": "Source processed",
    "last7Days": "Clips last 7 days",
    "scoreDistribution": "Viral score distribution",
    "noClipsYet": "No clips yet — generate your first project to see stats.",
    "performanceHighlights": "Performance highlights",
    "highScoring": "High-scoring clips",
    "scoreAbove80": "score ≥ 80",
    "completionRate": "Completion rate",
    "avgClipLength": "Avg clip length",
    "perClip": "per clip",
    "timeSaved": "Time saved",
    "vsManual": "vs manual editing"
  },
  "brand": {
    "title": "Brand Kit",
    "desc": "Colors, fonts, and watermark settings applied to your clips",
    "logo": "Logo",
    "logoDesc": "Used as your watermark and across your exported clips.",
    "clickOrDrag": "Click or drag a file to upload",
    "logoFormats": "PNG, JPG, WEBP or SVG · up to 5MB",
    "replace": "Replace",
    "remove": "Remove",
    "colors": "Colors",
    "swap": "Swap",
    "palettePresets": "Palette presets",
    "primary": "Primary",
    "secondary": "Secondary",
    "fontFamily": "Font family",
    "subtitleStyle": "Subtitle style",
    "textColor": "Text color",
    "background": "Background",
    "subtitleFont": "Subtitle font",
    "bgOpacity": "Background opacity",
    "position": "Position",
    "top": "Top",
    "center": "Center",
    "bottom": "Bottom",
    "watermark": "Watermark",
    "watermarkDesc": "Your logo appears on every exported clip.",
    "opacity": "Opacity",
    "topLeft": "Top left",
    "topRight": "Top right",
    "bottomLeft": "Bottom left",
    "bottomRight": "Bottom right",
    "platformBadge": "ClipForge badge",
    "badgeOnDesc": "Show a small 'Made with ClipForge' mark on exports.",
    "badgeLockedDesc": "White-label exports are included in the Agency plan.",
    "upgradeAgency": "Upgrade to Agency",
    "preview": "Preview",
    "previewLive": "Updates live as you edit",
    "sampleSubtitle": "Sample subtitle text",
    "yourLogo": "Your logo",
    "invalidHex": "Enter a valid hex color, e.g. #6366F1",
    "pickColor": "Pick color from screen",
    "copyHex": "Copy hex code",
    "useFormats": "Use PNG, JPG, WEBP or SVG",
    "logoTooLarge": "Logo must be under 5MB",
    "logoUploaded": "Logo uploaded",
    "uploadFailed": "Upload failed",
    "saveFailed": "Save failed",
    "kitSaved": "Brand kit saved",
    "fixColors": "Fix the invalid color codes before saving"
  },
  "billing": {
    "title": "Billing",
    "remaining": "{credits} credits remaining",
    "plan": "{plan} plan",
    "currentPlan": "Current plan",
    "popular": "Popular",
    "mostPopular": "Most popular",
    "free": "Free",
    "creator": "Creator",
    "pro": "Pro",
    "agency": "Agency"
  },
  "settings": {
    "title": "Settings",
    "desc": "Account, security, and data management",
    "account": "Account",
    "accountDesc": "Manage your profile, change password, and update notification preferences.",
    "manageSubscription": "Manage subscription",
    "dataPrivacy": "Data & Privacy",
    "dataPrivacyDesc": "Under GDPR, you have the right to export or delete all your personal data.",
    "readPrivacy": "Read our",
    "privacyPolicy": "Privacy Policy",
    "and": "and",
    "termsOfService": "Terms of Service",
    "exportData": "Export all data",
    "deleteAccount": "Delete account & data",
    "exportSuccess": "Data exported",
    "exportFailed": "Could not export data",
    "deleteFailed": "Could not delete account",
    "deleteConfirm1": "Are you sure you want to permanently delete your account and all data? This action cannot be undone.",
    "deleteConfirm2": "This will permanently delete all your clips, jobs, brand kit, and account. Type OK to confirm.",
    "deleteSuccess": "Account deleted. Redirecting...",
    "preferences": "Preferences",
    "language": "Language",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System"
  },
  "publish": {
    "title": "Publish",
    "desc": "Social media publishing",
    "comingSoon": "Coming soon"
  },
  "pricing": {
    "title": "Simple, transparent pricing",
    "desc": "Start free with 100 credits. Scale as you grow — no hidden fees, no contracts.",
    "faq": "Frequently asked questions",
    "startFree": "Start free",
    "startCreating": "Start creating",
    "goPro": "Go Pro",
    "contactSales": "Contact sales"
  },
  "theme": {
    "light": "Light",
    "dark": "Dark",
    "system": "System"
  }
}
```

- [ ] **Step 2: Create Romanian messages**

Create `frontend/messages/ro.json` with full Romanian translations. Same structure as en.json but with Romanian text. Key translations:

```json
{
  "common": {
    "save": "Salvează",
    "cancel": "Anulează",
    "delete": "Șterge",
    "loading": "Se încarcă...",
    "error": "Ceva nu a funcționat",
    "back": "Înapoi",
    "next": "Următor",
    "submit": "Trimite",
    "close": "Închide",
    "search": "Caută",
    "reset": "Resetează",
    "upgrade": "Fă upgrade",
    "download": "Descarcă",
    "copy": "Copiază",
    "copied": "Copiat",
    "saved": "Salvat",
    "credits": "{count, plural, one {# credit} other {# credite}}",
    "clips": "{count, plural, one {# clip} other {# clipuri}}",
    "jobs": "{count, plural, one {# proiect} other {# proiecte}}"
  },
  "nav": {
    "home": "Acasă",
    "create": "Creează",
    "review": "Revizuire",
    "clips": "Clipuri",
    "analytics": "Statistici",
    "brand": "Kit Branding",
    "publish": "Publică",
    "history": "Istoric",
    "billing": "Facturare",
    "settings": "Setări",
    "workspace": "Spațiul meu"
  },
  "landing": {
    "badge": "Clipuri video cu AI",
    "heroTitle1": "Transformă videoclipuri lungi în",
    "heroTitle2": "scurtmetraje gata de publicat",
    "heroDesc": "Încarcă un video sau lipește un URL YouTube. ClipForge transcrie, detectează momente virale, decupează vertical, adaugă subtitrări și generează clipuri gata pentru platforme — în câteva minute.",
    "ctaFree": "Începe gratuit — 100 credite",
    "ctaPricing": "Vezi prețurile",
    "pricing": "Prețuri",
    "signIn": "Autentificare",
    "getStarted": "Începe acum",
    "howItWorks": "Cum funcționează",
    "howItWorksDesc": "Trei pași. Fără experiență de editare.",
    "step1Title": "Încarcă sau lipește URL",
    "step1Desc": "Plasează un fișier video sau lipește orice link YouTube",
    "step2Title": "AI procesează totul",
    "step2Desc": "Transcriere, detectare momente virale, decupare, subtitrări — totul automat",
    "step3Title": "Revizuiește și exportă",
    "step3Desc": "Taie, previzualizează și descarcă clipurile tale virale",
    "featuresTitle": "Tot ce ai nevoie pentru a deveni viral",
    "featuresDesc": "Un pipeline complet de la material brut la scurtmetraje gata de publicat",
    "feat1Title": "Detectare momente virale cu AI",
    "feat1Desc": "Gemini 2.5 Flash analizează transcrierea și găsește cele mai virale momente cu scor de hook",
    "feat2Title": "Decupare verticală inteligentă",
    "feat2Desc": "Urmărirea feței și vorbitorului asigură centrarea subiectului în format 9:16",
    "feat3Title": "Subtitrări automate",
    "feat3Desc": "Transcriere Whisper cu multiple stiluri de subtitrare aplicate direct pe clipuri",
    "feat4Title": "Descrieri sociale cu AI",
    "feat4Desc": "Descrieri și hashtag-uri generate automat, optimizate pentru TikTok, Instagram și YouTube",
    "feat5Title": "Kit de branding",
    "feat5Desc": "Culori, fonturi, stiluri de subtitrare și watermark aplicate consistent pe toate clipurile",
    "feat6Title": "Procesare în lot",
    "feat6Desc": "Procesează până la 20 URL-uri YouTube simultan — ideal pentru playlisturi întregi",
    "trustGdpr": "Conform GDPR",
    "trustGdprDesc": "Export complet de date, ștergere cont și controale de confidențialitate incluse",
    "trustFast": "Procesare rapidă",
    "trustFastDesc": "Majoritatea videoclipurilor procesate în sub 5 minute cu prioritate pentru planurile plătite",
    "trustViral": "Statistici de viralitate",
    "trustViralDesc": "Clipuri clasificate cu AI după potențialul viral ca să publici conținutul cel mai bun",
    "finalCtaTitle": "Gata să creezi scurtmetraje virale?",
    "finalCtaDesc": "Alătură-te creatorilor care economisesc ore în fiecare săptămână transformând conținut lung în clipuri scurte care generează engagement.",
    "finalCtaButton": "Începe gratuit",
    "finalCtaNote": "100 credite gratuite. Fără card de credit.",
    "footer": "© {year} ClipForge. Toate drepturile rezervate.",
    "privacy": "Confidențialitate",
    "terms": "Termeni",
    "statProcessing": "Timp de procesare",
    "statCrop": "Decupare auto",
    "statBatch": "Clipuri per lot",
    "statGdpr": "Conform"
  },
  "auth": {
    "welcomeBack": "Bine ai revenit",
    "signInDesc": "Autentifică-te în spațiul tău de lucru",
    "continueGoogle": "Continuă cu Google",
    "or": "sau",
    "email": "Email",
    "password": "Parolă",
    "signIn": "Autentificare",
    "forgotPassword": "Ai uitat parola?",
    "noAccount": "Nu ai cont?",
    "signUp": "Înregistrează-te",
    "createAccount": "Creează cont",
    "createAccountDesc": "Începe cu 100 credite gratuite",
    "name": "Nume",
    "creating": "Se creează...",
    "hasAccount": "Ai deja un cont?",
    "agreeTerms": "Prin crearea contului ești de acord cu",
    "termsLink": "Termenii",
    "andText": "și",
    "privacyLink": "Politica de Confidențialitate",
    "errorInvalidCredentials": "Email sau parolă invalidă.",
    "errorDatabase": "Baza de date nu este disponibilă. Pornește baza de date locală și încearcă din nou.",
    "errorGeneric": "A apărut o eroare. Te rugăm să încerci din nou.",
    "passwordRules": {
      "length": "Minim 12 caractere",
      "uppercase": "Literă mare",
      "lowercase": "Literă mică",
      "number": "Cifră",
      "special": "Caracter special"
    },
    "passwordWeak": "Parola nu îndeplinește cerințele",
    "accountCreated": "Cont creat! Se redirecționează...",
    "forgotTitle": "Resetare parolă",
    "forgotDesc": "Introdu emailul pentru a primi un link de resetare",
    "sendResetLink": "Trimite link de resetare",
    "backToLogin": "Înapoi la autentificare",
    "resetTitle": "Setează parola nouă",
    "resetDesc": "Introdu noua parolă",
    "resetButton": "Resetează parola"
  },
  "dashboard": {
    "welcomeUser": "Bine ai revenit{name, select, empty {} other {, {name}}}",
    "overview": "Privire de ansamblu asupra spațiului tău",
    "newProject": "Proiect nou",
    "creditsLabel": "Credite",
    "jobsLabel": "Proiecte",
    "clipsLabel": "Clipuri",
    "planLabel": "Plan",
    "recentJobs": "Proiecte recente",
    "noJobs": "Niciun proiect încă",
    "firstProject": "Creează primul tău proiect →",
    "quickActions": "Acțiuni rapide",
    "uploadVideo": "Încarcă video",
    "youtubeUrl": "URL YouTube",
    "batchProcess": "Procesare în lot",
    "activeJobs": "Proiecte active",
    "noActiveJobs": "Niciun proiect activ",
    "weeklyActivity": "Săptămâna aceasta",
    "recentClips": "Clipuri recente",
    "viewAll": "Vezi toate",
    "tips": "Sfaturi",
    "tipSubtitles": "Clipurile tale au scoruri cu 15% mai mari cu subtitrări activate",
    "tipBrandKit": "Configurează kit-ul de branding pentru clipuri consistente",
    "tipBatch": "Folosește procesarea în lot pentru a economisi timp cu mai multe videoclipuri",
    "clipsReady": "{count, plural, one {# clip gata} other {# clipuri gata}} de publicare"
  },
  "create": {
    "title": "Creează clipuri",
    "desc": "Încarcă un video, lipește un link YouTube sau procesează mai multe videoclipuri",
    "youtube": "YouTube",
    "upload": "Încarcă",
    "batch": "Lot",
    "youtubeUrl": "URL YouTube",
    "youtubeUrlPlaceholder": "https://youtube.com/watch?v=...",
    "dropOrChoose": "Plasează sau alege un video",
    "fileTypes": "MP4, MOV, AVI, MKV, WEBM până la 2 GB",
    "batchUrls": "URL-uri YouTube ({count}/20)",
    "addUrl": "Adaugă URL",
    "settings": "Setări",
    "platformPreset": "Preset platformă",
    "clipsPerVideo": "Clipuri per video",
    "aspectRatio": "Raport de aspect",
    "subtitles": "Subtitrări",
    "subtitleClean": "Simplu",
    "subtitleBold": "Bold",
    "subtitleCaptionBox": "Casetă",
    "subtitleNone": "Fără",
    "brandKit": "Kit branding",
    "cost": "Cost",
    "costBatch": "Cost ({count} videoclipuri)",
    "creditsUnit": "credite",
    "generateClips": "Generează {count, plural, one {# clip} other {# clipuri}}",
    "processVideos": "Procesează {count} videoclipuri",
    "processing": "Se procesează...",
    "uploadFailed": "Încărcare eșuată. Verifică conexiunea.",
    "videoUploaded": "Video încărcat",
    "jobQueued": "Proiect adăugat în coadă",
    "batchQueued": "{count} proiecte adăugate în coadă",
    "addOneUrl": "Adaugă cel puțin un URL"
  },
  "clips": {
    "title": "Clipuri",
    "count": "{count, plural, one {# clip generat} other {# clipuri generate}}",
    "noClips": "Niciun clip încă",
    "firstProject": "Creează primul tău proiect →",
    "viralScore": "{score}/10"
  },
  "history": {
    "title": "Istoric",
    "count": "{count, plural, one {# proiect în total} other {# proiecte în total}}",
    "noJobs": "Niciun proiect încă",
    "firstProject": "Creează primul tău proiect →",
    "requested": "solicitate",
    "generated": "generate"
  },
  "analytics": {
    "title": "Statistici",
    "desc": "Privire de ansamblu asupra performanței de generare a clipurilor",
    "totalProjects": "Total proiecte",
    "clipsGenerated": "Clipuri generate",
    "avgViralScore": "Scor viral mediu",
    "successRate": "Rată de succes",
    "contentCreated": "Conținut creat",
    "sourceProcessed": "Sursă procesată",
    "last7Days": "Clipuri ultimele 7 zile",
    "scoreDistribution": "Distribuția scorului viral",
    "noClipsYet": "Niciun clip încă — generează primul proiect pentru a vedea statisticile.",
    "performanceHighlights": "Performanță",
    "highScoring": "Clipuri cu scor mare",
    "scoreAbove80": "scor ≥ 80",
    "completionRate": "Rată de finalizare",
    "avgClipLength": "Lungime medie clip",
    "perClip": "per clip",
    "timeSaved": "Timp economisit",
    "vsManual": "vs editare manuală"
  },
  "brand": {
    "title": "Kit Branding",
    "desc": "Culori, fonturi și setări watermark aplicate pe clipurile tale",
    "logo": "Logo",
    "logoDesc": "Folosit ca watermark și pe toate clipurile exportate.",
    "clickOrDrag": "Click sau trage un fișier pentru încărcare",
    "logoFormats": "PNG, JPG, WEBP sau SVG · până la 5MB",
    "replace": "Înlocuiește",
    "remove": "Elimină",
    "colors": "Culori",
    "swap": "Inversează",
    "palettePresets": "Palete predefinite",
    "primary": "Primară",
    "secondary": "Secundară",
    "fontFamily": "Familie de fonturi",
    "subtitleStyle": "Stil subtitrare",
    "textColor": "Culoare text",
    "background": "Fundal",
    "subtitleFont": "Font subtitrare",
    "bgOpacity": "Opacitate fundal",
    "position": "Poziție",
    "top": "Sus",
    "center": "Centru",
    "bottom": "Jos",
    "watermark": "Watermark",
    "watermarkDesc": "Logo-ul tău apare pe fiecare clip exportat.",
    "opacity": "Opacitate",
    "topLeft": "Stânga sus",
    "topRight": "Dreapta sus",
    "bottomLeft": "Stânga jos",
    "bottomRight": "Dreapta jos",
    "platformBadge": "Insignă ClipForge",
    "badgeOnDesc": "Afișează un mic semn 'Made with ClipForge' pe exporturi.",
    "badgeLockedDesc": "Exporturile white-label sunt incluse în planul Agency.",
    "upgradeAgency": "Fă upgrade la Agency",
    "preview": "Previzualizare",
    "previewLive": "Se actualizează live pe măsură ce editezi",
    "sampleSubtitle": "Text de subtitrare exemplu",
    "yourLogo": "Logo-ul tău",
    "invalidHex": "Introdu o culoare hex validă, ex. #6366F1",
    "pickColor": "Alege culoare de pe ecran",
    "copyHex": "Copiază codul hex",
    "useFormats": "Folosește PNG, JPG, WEBP sau SVG",
    "logoTooLarge": "Logo-ul trebuie să fie sub 5MB",
    "logoUploaded": "Logo încărcat",
    "uploadFailed": "Încărcare eșuată",
    "saveFailed": "Salvare eșuată",
    "kitSaved": "Kit branding salvat",
    "fixColors": "Corectează codurile de culoare invalide înainte de salvare"
  },
  "billing": {
    "title": "Facturare",
    "remaining": "{credits} credite rămase",
    "plan": "planul {plan}",
    "currentPlan": "Plan curent",
    "popular": "Popular",
    "mostPopular": "Cel mai popular",
    "free": "Gratuit",
    "creator": "Creator",
    "pro": "Pro",
    "agency": "Agency"
  },
  "settings": {
    "title": "Setări",
    "desc": "Cont, securitate și gestionare date",
    "account": "Cont",
    "accountDesc": "Gestionează profilul, schimbă parola și actualizează preferințele de notificare.",
    "manageSubscription": "Gestionează abonamentul",
    "dataPrivacy": "Date și Confidențialitate",
    "dataPrivacyDesc": "Conform GDPR, ai dreptul de a exporta sau șterge toate datele tale personale.",
    "readPrivacy": "Citește",
    "privacyPolicy": "Politica de Confidențialitate",
    "and": "și",
    "termsOfService": "Termenii și Condițiile",
    "exportData": "Exportă toate datele",
    "deleteAccount": "Șterge cont și date",
    "exportSuccess": "Date exportate",
    "exportFailed": "Nu s-au putut exporta datele",
    "deleteFailed": "Nu s-a putut șterge contul",
    "deleteConfirm1": "Ești sigur că vrei să ștergi permanent contul și toate datele? Această acțiune nu poate fi anulată.",
    "deleteConfirm2": "Aceasta va șterge permanent toate clipurile, proiectele, kit-ul de branding și contul. Apasă OK pentru confirmare.",
    "deleteSuccess": "Cont șters. Se redirecționează...",
    "preferences": "Preferințe",
    "language": "Limbă",
    "theme": "Temă",
    "themeLight": "Luminoasă",
    "themeDark": "Întunecată",
    "themeSystem": "Sistem"
  },
  "publish": {
    "title": "Publică",
    "desc": "Publicare pe rețele sociale",
    "comingSoon": "În curând"
  },
  "pricing": {
    "title": "Prețuri simple și transparente",
    "desc": "Începe gratuit cu 100 credite. Crește pe măsură ce evoluezi — fără costuri ascunse, fără contracte.",
    "faq": "Întrebări frecvente",
    "startFree": "Începe gratuit",
    "startCreating": "Începe să creezi",
    "goPro": "Treci la Pro",
    "contactSales": "Contactează vânzări"
  },
  "theme": {
    "light": "Luminoasă",
    "dark": "Întunecată",
    "system": "Sistem"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/messages/
git commit -m "feat: add English and Romanian message files for i18n"
```

---

### Task 4: Update Next.js config for next-intl

**Files:**
- Modify: `frontend/next.config.ts`

- [ ] **Step 1: Wrap config with createNextIntlPlugin**

```typescript
// frontend/next.config.ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: imageRemoteHosts.map((hostname) => ({
      protocol: 'https',
      hostname,
    }))
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: 'http://nginx:80/media/:path*',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/next.config.ts
git commit -m "feat: integrate next-intl plugin into Next.js config"
```

---

### Task 5: Update middleware for locale detection + auth

**Files:**
- Modify: `frontend/src/middleware.ts`

- [ ] **Step 1: Rewrite middleware to handle both locale and auth**

```typescript
// frontend/src/middleware.ts
import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/navigation'

const intlMiddleware = createMiddleware(routing)

const AUTH_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (routing.locales.includes(segments[0] as any)) {
    return '/' + segments.slice(1).join('/')
  }
  return pathname
}

function extractLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (routing.locales.includes(segments[0] as any)) {
    return segments[0]
  }
  return routing.defaultLocale
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pathWithoutLocale = stripLocale(pathname)

  if (pathWithoutLocale.startsWith('/dashboard')) {
    const hasSession = AUTH_COOKIES.some((name) => request.cookies.has(name))
    if (!hasSession) {
      const locale = extractLocale(pathname)
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      const loginUrl = new URL(`${prefix}/login`, request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|media|.*\\..*).*)'],
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/middleware.ts
git commit -m "feat: combine locale detection and auth in middleware"
```

---

### Task 6: Move pages under [locale] segment

**Files:**
- Move all page files from `src/app/` to `src/app/[locale]/`
- Keep `src/app/api/` in place

This is the largest structural change. All pages move under `[locale]`.

- [ ] **Step 1: Create [locale] directory and move layout**

Move `src/app/layout.tsx` to `src/app/[locale]/layout.tsx` and update it:

```typescript
// frontend/src/app/[locale]/layout.tsx
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/navigation'
import { Toaster } from '@/components/ui/toast'
import '../globals.css'

export const metadata: Metadata = {
  title: 'ClipForge - AI Video Clipping',
  description:
    'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.',
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!routing.locales.includes(locale as any)) {
    notFound()
  }
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Create a minimal root layout at `src/app/layout.tsx` that just provides the HTML shell:

```typescript
// frontend/src/app/layout.tsx (root - minimal)
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
```

- [ ] **Step 2: Move all public pages under [locale]**

Move these files maintaining their directory structure:
- `src/app/page.tsx` → `src/app/[locale]/page.tsx`
- `src/app/login/page.tsx` → `src/app/[locale]/login/page.tsx`
- `src/app/register/page.tsx` → `src/app/[locale]/register/page.tsx`
- `src/app/pricing/page.tsx` → `src/app/[locale]/pricing/page.tsx`
- `src/app/privacy/page.tsx` → `src/app/[locale]/privacy/page.tsx`
- `src/app/terms/page.tsx` → `src/app/[locale]/terms/page.tsx`
- `src/app/forgot-password/page.tsx` → `src/app/[locale]/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx` → `src/app/[locale]/reset-password/page.tsx`

- [ ] **Step 3: Move dashboard pages under [locale]**

Move entire dashboard directory:
- `src/app/dashboard/` → `src/app/[locale]/dashboard/`

This includes layout.tsx and all sub-pages (create, clips, clips/[id], jobs/[id], analytics, brand, publish, history, billing, settings, review).

- [ ] **Step 4: Keep API routes in place**

`src/app/api/` stays at `src/app/api/` (no locale prefix for APIs).

- [ ] **Step 5: Update all internal links to use i18n Link**

In every page and component file, replace:
```typescript
import Link from 'next/link'
```
with:
```typescript
import { Link } from '@/i18n/navigation'
```

And replace:
```typescript
import { useRouter } from 'next/navigation'
```
with:
```typescript
import { useRouter } from '@/i18n/navigation'
```

And replace:
```typescript
import { usePathname } from 'next/navigation'
```
with:
```typescript
import { usePathname } from '@/i18n/navigation'
```

And replace:
```typescript
import { redirect } from 'next/navigation'
```
with:
```typescript
import { redirect } from '@/i18n/navigation'
```

Files to update:
- `[locale]/page.tsx` (landing)
- `[locale]/login/page.tsx`
- `[locale]/register/page.tsx`
- `[locale]/pricing/page.tsx`
- `[locale]/dashboard/layout.tsx`
- `[locale]/dashboard/page.tsx`
- `[locale]/dashboard/create/page.tsx`
- `[locale]/dashboard/clips/page.tsx`
- `[locale]/dashboard/clips/[id]/page.tsx`
- `[locale]/dashboard/history/page.tsx`
- `[locale]/dashboard/settings/page.tsx`
- `[locale]/dashboard/billing/page.tsx`
- `[locale]/dashboard/analytics/page.tsx`
- `[locale]/dashboard/brand/page.tsx`
- `[locale]/dashboard/jobs/[id]/page.tsx`
- `[locale]/dashboard/review/page.tsx`
- `[locale]/dashboard/publish/page.tsx`
- `src/components/clip/clip-workspace.tsx`

Also update any `<a href="...">` tags that point to internal routes to use `<Link href="...">`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/
git commit -m "feat: restructure pages under [locale] segment for i18n routing"
```

---

### Task 7: Extract strings from all pages using useTranslations

This task replaces all hardcoded English strings with translation function calls.

**For server components**, use:
```typescript
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sectionName')
  // use t('key')
}
```

**For client components**, use:
```typescript
import { useTranslations } from 'next-intl'

export default function Page() {
  const t = useTranslations('sectionName')
  // use t('key')
}
```

- [ ] **Step 1: Update landing page** (`[locale]/page.tsx`)

Replace all hardcoded strings with `t('landing.key')`. This is a server component, so use `getTranslations`.

- [ ] **Step 2: Update auth pages** (login, register, forgot-password, reset-password)

Login is a server component → `getTranslations('auth')`.
Register is a client component → `useTranslations('auth')`.

- [ ] **Step 3: Update pricing page**

Server component → `getTranslations('pricing')` and `getTranslations('landing')` for shared nav.

- [ ] **Step 4: Update dashboard layout**

Client component → `useTranslations('nav')`.

- [ ] **Step 5: Update dashboard home page**

Server component → `getTranslations('dashboard')`.

- [ ] **Step 6: Update create page**

Client component → `useTranslations('create')`.

- [ ] **Step 7: Update clips, history, analytics, billing pages**

Each server component gets its own `getTranslations()` call.

- [ ] **Step 8: Update brand, settings, publish, review pages**

Brand and settings are client components → `useTranslations()`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/ frontend/src/components/
git commit -m "feat: extract all UI strings to i18n translation keys"
```

---

### Task 8: Add language switcher component

**Files:**
- Create: `frontend/src/components/shared/language-switcher.tsx`
- Modify: `frontend/src/app/[locale]/dashboard/layout.tsx`

- [ ] **Step 1: Create language switcher**

```typescript
// frontend/src/components/shared/language-switcher.tsx
'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { locales } from '@/i18n/config'

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ro: 'Română',
}

const LOCALE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  ro: '🇷🇴',
}

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale as any })
  }

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs appearance-none cursor-pointer pr-7"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
        }}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_FLAGS[loc]} {LOCALE_NAMES[loc]}
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: Add to dashboard sidebar footer**

In `[locale]/dashboard/layout.tsx`, import and render `<LanguageSwitcher />` in the sidebar footer next to the workspace info.

- [ ] **Step 3: Add to landing page and public page navbars**

Add the language switcher to the navbar on landing, pricing, login, and register pages.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/language-switcher.tsx frontend/src/app/
git commit -m "feat: add language switcher to sidebar and public pages"
```

---

### Task 9: Create theme toggle component

**Files:**
- Create: `frontend/src/components/shared/theme-toggle.tsx`

- [ ] **Step 1: Create theme toggle**

```typescript
// frontend/src/components/shared/theme-toggle.tsx
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'

const MODES = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-8 w-[104px] rounded-lg bg-muted" />

  return (
    <div className="flex rounded-lg bg-muted p-0.5">
      {MODES.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={`flex items-center justify-center rounded-md p-1.5 transition-all ${
            theme === value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label={`Switch to ${value} theme`}
          title={value.charAt(0).toUpperCase() + value.slice(1)}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/shared/theme-toggle.tsx
git commit -m "feat: add theme toggle component (light/dark/system)"
```

---

### Task 10: Wire theme toggle into layout and clean up Zustand

**Files:**
- Modify: `frontend/src/app/[locale]/dashboard/layout.tsx`
- Modify: `frontend/src/stores/ui-store.ts`

- [ ] **Step 1: Add theme toggle to sidebar footer**

In the dashboard layout sidebar footer, add the `ThemeToggle` component alongside the `LanguageSwitcher`.

- [ ] **Step 2: Remove theme from Zustand store**

Update `ui-store.ts` to remove theme-related state since next-themes handles it:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'clipforge-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/ frontend/src/stores/
git commit -m "feat: wire theme toggle into dashboard, remove theme from Zustand"
```

---

### Task 11: Create professional dashboard components

**Files:**
- Create: `frontend/src/components/dashboard/stats-bar.tsx`
- Create: `frontend/src/components/dashboard/quick-actions.tsx`
- Create: `frontend/src/components/dashboard/active-jobs.tsx`
- Create: `frontend/src/components/dashboard/weekly-chart.tsx`
- Create: `frontend/src/components/dashboard/recent-clips.tsx`
- Create: `frontend/src/components/dashboard/tips-panel.tsx`

- [ ] **Step 1: Create StatsBar component**

```typescript
// frontend/src/components/dashboard/stats-bar.tsx
import { useTranslations } from 'next-intl'

interface StatsBarProps {
  credits: number
  jobCount: number
  clipCount: number
  plan: string
}

export function StatsBar({ credits, jobCount, clipCount, plan }: StatsBarProps) {
  const t = useTranslations('dashboard')
  const stats = [
    { label: t('creditsLabel'), value: credits },
    { label: t('jobsLabel'), value: jobCount },
    { label: t('clipsLabel'), value: clipCount },
    { label: t('planLabel'), value: plan, capitalize: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl bg-border overflow-hidden">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="bg-card px-5 py-4 animate-slide-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="text-xs text-muted-foreground">{stat.label}</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${stat.capitalize ? 'capitalize' : ''}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create QuickActions component**

```typescript
// frontend/src/components/dashboard/quick-actions.tsx
'use client'

import { Upload, Link2, Layers } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')
  const actions = [
    { href: '/dashboard/create?mode=upload', icon: Upload, label: t('uploadVideo') },
    { href: '/dashboard/create?mode=youtube', icon: Link2, label: t('youtubeUrl') },
    { href: '/dashboard/create?mode=batch', icon: Layers, label: t('batchProcess') },
  ]

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('quickActions')}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {actions.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-xs font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ActiveJobs component**

```typescript
// frontend/src/components/dashboard/active-jobs.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Loader2 } from 'lucide-react'

interface ActiveJob {
  id: string
  sourceUrl: string | null
  sourceFilePath: string | null
  status: string
  progress: number
  progressMessage: string | null
}

export function ActiveJobs() {
  const t = useTranslations('dashboard')
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)

  const ACTIVE_STATUSES = ['pending', 'downloading', 'transcribing', 'detecting', 'generating', 'processing']

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const res = await fetch('/api/jobs')
        if (res.ok && mounted) {
          const data = await res.json()
          const active = (data.jobs ?? []).filter(
            (j: ActiveJob) => ACTIVE_STATUSES.includes(j.status)
          )
          setJobs(active)
        }
      } catch {
        // silent — polling will retry
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void poll()
    const interval = setInterval(poll, 5000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('activeJobs')}
        </h2>
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('activeJobs')}
      </h2>
      {jobs.length > 0 ? (
        <div className="mt-3 space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="block rounded-lg p-2 transition-colors hover:bg-muted/50"
            >
              <div className="text-[13px] font-medium truncate">
                {job.sourceUrl ?? job.sourceFilePath ?? 'Processing...'}
              </div>
              <div className="mt-2 progress-bar h-1.5">
                <div
                  className={`progress-bar-fill ${job.status === 'completed' ? 'done' : ''}`}
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{job.progressMessage ?? job.status}</span>
                <span className="tabular-nums">{job.progress}%</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{t('noActiveJobs')}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create WeeklyChart component**

```typescript
// frontend/src/components/dashboard/weekly-chart.tsx
import { useTranslations } from 'next-intl'

interface DayData {
  label: string
  count: number
}

export function WeeklyChart({ data }: { data: DayData[] }) {
  const t = useTranslations('dashboard')
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('weeklyActivity')}
      </h2>
      <div className="mt-4 flex items-end gap-2 h-28">
        {data.map((day) => (
          <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {day.count > 0 ? day.count : ''}
            </span>
            <div
              className="w-full rounded-t bg-primary/80 transition-all"
              style={{
                height: `${Math.max((day.count / max) * 100, day.count > 0 ? 8 : 2)}%`,
                opacity: day.count > 0 ? 1 : 0.2,
              }}
            />
            <span className="text-[10px] text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create RecentClips component**

```typescript
// frontend/src/components/dashboard/recent-clips.tsx
import { Play } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

interface ClipPreview {
  id: string
  title: string
  duration: number
  viralScore: number
  fileUrl: string | null
  resolution: string
}

export function RecentClips({ clips }: { clips: ClipPreview[] }) {
  const t = useTranslations('dashboard')

  if (clips.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('recentClips')}
        </h2>
        <Link
          href="/dashboard/clips"
          className="text-xs font-medium text-primary hover:underline underline-offset-4"
        >
          {t('viewAll')}
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 6).map((clip, i) => (
          <Link
            key={clip.id}
            href={`/dashboard/clips/${clip.id}`}
            className="group relative rounded-xl bg-card border border-border overflow-hidden transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 animate-slide-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="aspect-video bg-muted relative overflow-hidden">
              {clip.fileUrl && (
                <video
                  src={clip.fileUrl}
                  muted={true}
                  preload="metadata"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                  <Play className="w-3 h-3 text-black ml-0.5" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="px-2.5 py-2">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-medium truncate">{clip.title}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.round(clip.duration)}s
                  </p>
                </div>
                {clip.viralScore > 0 && (
                  <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                    {clip.viralScore}/10
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create TipsPanel component**

```typescript
// frontend/src/components/dashboard/tips-panel.tsx
import { Lightbulb, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface TipsPanelProps {
  hasSubtitles: boolean
  hasBrandKit: boolean
  pendingClips: number
}

export function TipsPanel({ hasSubtitles, hasBrandKit, pendingClips }: TipsPanelProps) {
  const t = useTranslations('dashboard')

  const tips: { icon: typeof Lightbulb; text: string }[] = []

  if (!hasSubtitles) {
    tips.push({ icon: Lightbulb, text: t('tipSubtitles') })
  }
  if (!hasBrandKit) {
    tips.push({ icon: Lightbulb, text: t('tipBrandKit') })
  }
  if (pendingClips > 0) {
    tips.push({ icon: Zap, text: t('clipsReady', { count: pendingClips }) })
  }

  if (tips.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {t('tips')}
      </h2>
      <div className="space-y-2">
        {tips.map((tip, i) => {
          const Icon = tip.icon
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>{tip.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/
git commit -m "feat: create professional dashboard widget components"
```

---

### Task 12: Redesign dashboard page with new widgets

**Files:**
- Modify: `frontend/src/app/[locale]/dashboard/page.tsx`

- [ ] **Step 1: Rewrite dashboard page**

```typescript
// frontend/src/app/[locale]/dashboard/page.tsx
import { Plus } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ActiveJobs } from '@/components/dashboard/active-jobs'
import { WeeklyChart } from '@/components/dashboard/weekly-chart'
import { RecentClips } from '@/components/dashboard/recent-clips'
import { TipsPanel } from '@/components/dashboard/tips-panel'

export const runtime = 'nodejs'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('dashboard')
  const session = await auth()
  const userId = session?.user?.id

  const [jobCount, clipCount, recentClips, brandKit] = userId
    ? await Promise.all([
        prisma.job.count({ where: { userId } }),
        prisma.clip.count({ where: { userId } }),
        prisma.clip.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            title: true,
            duration: true,
            viralScore: true,
            fileUrl: true,
            resolution: true,
          },
        }),
        prisma.brandKit.findUnique({ where: { userId } }),
      ])
    : [0, 0, [], null]

  const credits = session?.user?.credits ?? 0
  const plan = session?.user?.plan ?? 'free'

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    return d
  })

  const allClipsForChart = userId
    ? await prisma.clip.findMany({
        where: {
          userId,
          createdAt: { gte: last7Days[0] },
        },
        select: { createdAt: true },
      })
    : []

  const chartData = last7Days.map((day) => {
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    return {
      label: day.toLocaleDateString(locale, { weekday: 'short' }),
      count: allClipsForChart.filter(
        (c) => new Date(c.createdAt) >= day && new Date(c.createdAt) < next
      ).length,
    }
  })

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t('welcomeUser', {
              name: session?.user?.name ? session.user.name : 'empty',
            })}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('overview')}
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newProject')}
        </Link>
      </div>

      <StatsBar
        credits={credits}
        jobCount={jobCount}
        clipCount={clipCount}
        plan={plan}
      />

      <QuickActions />

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveJobs />
        <WeeklyChart data={chartData} />
      </div>

      <RecentClips clips={recentClips} />

      <TipsPanel
        hasSubtitles={true}
        hasBrandKit={!!brandKit}
        pendingClips={recentClips.length}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/
git commit -m "feat: redesign dashboard with stats, quick actions, charts, and recent clips"
```

---

### Task 13: Add preferences to settings page

**Files:**
- Modify: `frontend/src/app/[locale]/dashboard/settings/page.tsx`

- [ ] **Step 1: Add language and theme preferences section**

Update the settings page to include a "Preferences" section with language selector and theme toggle. Import `LanguageSwitcher` and `ThemeToggle` components.

Add between the Account and Data & Privacy sections:

```tsx
<div className="rounded-xl border border-border bg-card p-5">
  <div className="flex items-center gap-2 mb-3">
    <Globe className="w-4 h-4 text-muted-foreground" />
    <h2 className="text-[13px] font-semibold">{t('preferences')}</h2>
  </div>
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <span className="text-[13px]">{t('language')}</span>
      <LanguageSwitcher />
    </div>
    <div className="flex items-center justify-between">
      <span className="text-[13px]">{t('theme')}</span>
      <ThemeToggle />
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/
git commit -m "feat: add language and theme preferences to settings page"
```

---

### Task 14: Build and verify

- [ ] **Step 1: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run Next.js build**

```bash
npm run build
```

Expected: Build succeeds with all pages compiled.

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```

Verify:
- `http://localhost:3000` → landing page in English (default)
- `http://localhost:3000/ro` → landing page in Romanian
- `http://localhost:3000/dashboard` → professional dashboard (requires auth)
- Theme toggle switches between light/dark/system
- Language switcher changes locale in URL and all strings update
- All existing functionality still works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete i18n, theme system, and professional dashboard"
```

---

## Verification Summary

| Feature | How to verify |
|---------|--------------|
| English strings | Navigate to `/en/dashboard` — all text in English |
| Romanian strings | Navigate to `/ro/dashboard` — all text in Romanian |
| Language switcher | Click switcher in sidebar — URL and text update |
| Dark mode | Click moon icon — UI switches to dark theme |
| Light mode | Click sun icon — UI switches to light theme |
| System theme | Click monitor icon — follows OS preference |
| Dashboard stats | Dashboard shows credits, jobs, clips, plan |
| Quick actions | Three clickable cards for upload/youtube/batch |
| Active jobs | Shows in-progress jobs with progress bars |
| Weekly chart | Bar chart shows clips per day last 7 days |
| Recent clips | Grid of 6 most recent clips with thumbnails |
| Tips panel | Contextual tips based on usage |
| API routes unchanged | `/api/*` routes work without locale prefix |
| Existing pages work | All dashboard pages render correctly |
