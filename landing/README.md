# Sneep Cut public site

Static Next.js (App Router) export of the public pages from the public-pages design canvas:
home, pricing, legal documents and the 404 page, in English (`/…`) and Romanian (`/ro/…`).
The web app (dashboard, auth, Studio session) stays in `frontend/`; `deploy/Caddyfile` sends
those paths to the SPA and everything else to this site.

## Commands

```sh
pnpm install
pnpm dev            # http://127.0.0.1:3100
pnpm build          # static export in out/
pnpm start          # serves out/ with the production routing (scripts/serve-static.mjs)
pnpm test           # SEO audit of out/ (metadata, h1, hreflang, JSON-LD, sitemap, 404)
pnpm test:browser   # Playwright: links, controls, themes, viewports, overflow, 404s
```

`APP_ORIGIN=http://127.0.0.1:5205 pnpm test:browser` also checks the hand-off to a running
Vite dev server of `frontend/` (`pnpm start -- --app-origin …` previews both together).

## Build settings

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public origin for canonical URLs, hreflang, sitemap and JSON-LD (default `https://sneepcut.com`). Non-production origins are built `noindex`. |
| `PLANS_SOURCE_URL` | Optional plan catalog (`/api/stripe/plans`) baked into the HTML and JSON-LD. Prices also refresh in the browser from the same-origin endpoint. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact address for the Agency plan and legal pages (default `admin@sneepcut.com`). |

Legal copy in `src/content/legal/` is ported from `frontend/src/lib/legal-content.ts` and
`additional-legal-content.ts`; update both while the SPA still contains its fallback pages.
