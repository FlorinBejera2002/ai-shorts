# Sneep Cut studio redesign — 7 September 2026

## Evidence and direction

The authenticated product should feel like a professional video workbench. Its central object is the user's footage and generated clips; the workflow is import, process, review, publish. Publish and Scripts remain distinct destinations.

- [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh), March 2026: supporting navigation should recede, actions should appear predictably, and borders should communicate relationships without dominating. Applied through quieter navigation, compact controls and a consistent shell.
- [Descript product tour](https://www.descript.com/tour): script, canvas and timeline support specific editing tasks, with related controls grouped in one side panel. Applied as task-oriented creation and processing areas, rather than a promotional illustration inside the dashboard.
- [Frame.io](https://frame.io/): media management, review and sharing are distinct parts of creative work. Applied by making actual clips and their metadata central while retaining separate publication and library routes. This is a conceptual interpretation, not a copied interface.
- [Motion accessibility documentation](https://motion.dev/docs/react-accessibility): MotionConfig and useReducedMotion adapt motion to the operating system preference. Applied to route arrivals, collection transitions and section indicators.

## Design decisions

Cool neutral light surfaces and graphite dark surfaces; exact logo accent #5139ef in light mode with a legible lighter variant in dark mode. Sora identifies page headings; Manrope handles working controls and body copy; tabular numerals make metrics readable. Small radii, deliberate spacing and restrained separators replace toy-like raised buttons and tilted geometric artwork.

Interaction adds utility: searchable navigation via Ctrl/Cmd+K, useful collection controls and short state transitions. Controls must use real routes/data; no invented processing, preview buttons, sample projects or social connection status. Missing thumbnails remain visibly missing.

## Verification scope

Run browser fixtures against the actual local app on port 3000, intercepting all account/API traffic with synthetic data. Check light/dark, EN/RO, 390/768/1440 widths, keyboard operation, reduced motion, empty/error states, navigation and relevant TypeScript/Biome checks. Screenshots are fixture previews, not user projects. No production deployment is implied.

## Page-level rollout

The first pass redesigned Home and shared chrome. The follow-up extends the actual page compositions, rather than relying on inherited color tokens:

| Workspace | Page-level treatment |
| --- | --- |
| Clips and Review | Compact filter rail, graphite media cards, readiness filters and review ledger |
| Projects and Analytics | Searchable project ledger, status filters and unified metric matrix |
| Create | Numbered source workspace, segmented import modes, settings and credits inspector |
| Scripts | Consolidated brief panel and screenplay canvas with live platform/duration context |
| Publish | Connected-channel rail, composer/preview and publication history |
| Calendar | Unified summary, month planner and selected-day agenda |
| Account | Section navigation, grouped forms and account/preferences inspector |
| Brand | Connected control panels and persistent graphite preview inspector |
| Billing | Ruled subscription summary and compact plan comparison |
| Clip details, editor, processing | Preview monitor, editing toolbar, property inspector and processing progress panel |

All workspace pages share the graphite PageHeader with blue action emphasis. Legacy routes continue to redirect to canonical tabs. Public login and marketing pages are outside this authenticated rollout.
