# Brand Kit benchmark — 2026-09-11

## Scope

The benchmark covered professional brand-management and video-creation products discovered through direct web search. The goal was to identify useful interaction patterns for Sneep Cut without presenting unsupported capabilities in the UI.

## Products reviewed

| Product | Useful pattern | Source |
| --- | --- | --- |
| Adobe Express | Separates logos, colors, fonts, graphics, and templates; supports multiple palettes and type roles; makes brand choices available inside the editor. | [Adobe Express brand kit tutorial](https://www.adobe.com/us/learn/express/web/create-brand-kit) |
| Canva | Treats the Brand Kit as a central library for logos, fonts, colors, icons, imagery, graphics, templates, and usage guidance. | [Canva Brand Kit](https://www.canva.com/pro/brand-kit/) |
| VEED | Organizes shared video assets, supports multiple kits, and lets users add assets either in the dashboard or while editing. | [VEED Brand Kits](https://support.veed.io/en/articles/9616498-how-to-create-and-manage-brand-kits) |
| Kapwing | Extends brand identity into reusable subtitle styles, intros/outros, overlays, templates, and team workflows. | [Kapwing Brand Kit](https://www.kapwing.com/help/how-to-use-brand-kit-and-brand-templates-in-kapwing/) |
| Frontify | Connects brand fundamentals and usage guidance with the asset-management workflow, positioning the system as a source of truth. | [Frontify Brand Guidelines](https://info.frontify.com/hubfs/Landingpages%20Assets/DG%20Assets/LP%20-%20New%20Design%20%28after%202021-04%29/1_White%20Papers/frontify_brand-management-platform_en1.pdf) |


## Patterns adopted in Sneep Cut

- A clear split between brand identity and its application to video.
- Persistent section navigation for a longer configuration workspace.
- Immediate preview in the formats creators actually publish: 9:16, 1:1, and 16:9.
- A visible readiness indicator and subtitle contrast feedback.
- Explicit unsaved-change state, discard, reset, save, load-error, and retry behavior.
- Honest plan gating for white-label exports.
- Modular components around the existing backend contract instead of UI for unsupported asset types.

## Deliberately deferred capabilities

The research supports multiple logos, custom font uploads, reusable intros/outros, multiple brand kits, brand templates, voice/glossary rules, and team permissions. These require persistence, validation, entitlements, and renderer/editor integration. They should be designed as end-to-end product features rather than represented by non-functional controls.
