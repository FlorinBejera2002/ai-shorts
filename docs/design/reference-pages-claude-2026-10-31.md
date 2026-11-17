# Remaining pages: approved Claude reference (2026-10-31)

The user asked to implement every remaining page from the canvas [Sneepcut – Redesign](https://claude.ai/artifact/GxXHfmy7iu1vKNB6KAZeAW) (pages *Panou principal*, *Abonament*, *Setări*, *Brand kit*, *Creare clipuri*, *Pagini publice*), extending the Publish/Clips/Scripts exception in `AGENTS.md`.

| Area | Implementation |
| --- | --- |
| Home | Theme surface; header with "Vezi clipurile" + "Clip nou" pills; 4 stat cards with tinted icons; 9:13 recent clip posters (`home-workspace.module.css`, `recent-clips.module.css`) |
| Navigation | Sidebar: blue pill create action, icon rows, soft profile card (reference block at the end of `app-sidebar.module.css`). Mobile dock: Home, Clips, + Create, Publish, More (Editor, Scripts, Brand, Billing, Settings in a 3-column sheet). `WorkspaceMobileHeader` has `profile` (logo + avatar, default) and `menu` (approved Publish/Clips/Scripts hamburger header, hides the dock) variants |
| Billing | One summary card with the credit balance on a gradient panel, card invoice table, tile plan selector, notice tones |
| Settings | Sticky pill section nav, card panels, soft fields, blue/secondary pill buttons |
| Brand kit | Card sections on the left, sticky preview card; the mobile save bar hides the dock |
| Create | Segmented source switch (radiogroup), card panels, blue actions; Story Builder keeps Gooey Nav |

Not changed: the public pages (landing, pricing, auth, legal — user asked to keep them as they were), processing (user asked to keep it, see `design-qa.md`).

Known pre-existing failures (same on the baseline): `publishing-layout.browser.mjs` "Switching to light preserves selectedRow" and `billing.browser.mjs` waiting for the summary-level scheduled-cancellation copy, which never renders because the page shows notices in the banner.

UI copy: the upload flow creates clips from one or more uploaded videos; the user asked not to present it as a "story" ("poveste"). Wording uses clip/project instead. Internal names (`story-*` files, `stories.*` API) are unchanged.

## Studio editor

Theme-level implementation of the canvas page *Editor video*: navy surfaces (#0b111c canvas, #121a27 panels, #1a2535 raised, #243147 lines), blue accent (#5b8cff, primary actions #2563eb), Inter body and Sora headings, 8/12px radii. The `neutral` Tailwind scale and the `studio-*`/`panel-*` tokens are remapped in `tailwind-preset.shared.js`; timeline colors live in `timelineTheme.ts`, inline-style tokens in `panelTokens.ts`. Studio UI copy remains English (no i18n layer in the package).
