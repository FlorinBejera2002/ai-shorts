# Create clips — cinci modele desktop

Data: **23 octombrie 2026**. Cinci concepte statice realizate cu ImageGen pentru alegerea layoutului. Nu sunt încă aprobate sau implementate. Numerele de mai jos urmează ordinea afișării imaginilor în chat, nu ordinea lansării generărilor.

## Galerie

| Model | Imagine | Organizare |
| --- | --- | --- |
| 1 | [Deschide imaginea](compact-grid.png) | Sursă în stânga, setări într-o grilă compactă în dreapta. |
| 2 | [Deschide imaginea](preview-first.png) | Aceeași orientare, cu mai mult spațiu acordat imaginii sursă. |
| 3 | [Deschide imaginea](top-toolbar.png) | Setări în bara de sus, imagine mare dedesubt. |
| 4 | [Deschide imaginea](panoramic.png) | Imagine panoramică sus, setări pe rânduri dedesubt. |
| 5 | [Deschide imaginea](settings-left.png) | Setări în stânga, sursă și ghidare AI în dreapta. |

## Cerințe comune

- Folosirea întregului spațiu de lucru și text redus la etichetele necesare.
- Ghidare AI într-un câmp mic; fără panou mare de asistență sau chat.
- Fără butonul **Write script** în pagină. Ruta globală **Scripts** rămâne în sidebar.
- Cadrul persistent Sneep Cut, paletă neutră închisă, acțiuni și selecții albe, colțuri md/sm. Logo-ul păstrează violetul.
- O singură imagine per concept, fără colaj, telefon sau browser desenat în jurul interfeței.

Referințe: [New post aprobat](../assets/new-post-approved-2026-10-22.png) și [ghidul Sneep Cut](../publishing-design.md). Compozițiile sunt alternative propuse, nu noi funcționalități aprobate.

## Brief pentru generare

Cadru desktop țintă **1440 × 1024**, cu sidebar de aproximativ 240 px și header de aproximativ 64 px. Tipografie Manrope/Sora, text de bază 14–16 px, suprafețe aproape negre și gri neutru, buton Generate alb. Prioritate pentru aliniere, spațiere și separatoare; fără descrieri repetitive, carduri în carduri sau conținut decorativ.

Același scenariu demonstrativ: sursă YouTube validă, URL sintetic `https://youtu.be/ScDemoA0001`, miniatură de studio la apus, titlul „Morning studio tour”, autor „Demo studio”, starea „Ready to process”. Cinci clipuri, format 9:16, subtitrări Clean activate, No branding, Advanced închis. Cost demonstrativ 50 credits și sold 360. Ghidare opțională: „Focus on practical tips and the strongest moments.”

Direcțiile de compoziție sunt cele din galerie: grilă echilibrată, sursă mai lată, toolbar superior, sursă panoramică deasupra setărilor, inspector în stânga. Fiecare imagine a fost generată independent, cu referințe vizuale locale atașate. Ajustarea sliderului din modelul 5 păstrează aceeași compoziție.

## Etapa următoare

În feedbackul din 23 octombrie, utilizatorul a indicat **Settings left** ca direcție de aprofundat și a cerut [încă două variante în același stil](../create-clips-settings-left/README.md). Numerele 1–5 din acest index rămân specifice setului inițial. Restul fluxului Create clips și adaptările mobile se continuă după alegerea variantei. [Drafturile inițiale](../create-clips-final/README.md) rămân provizorii; planul anterior pentru fluxul complet este amânat.

Imaginile folosesc date fictive. Nu au fost încărcate fișiere, pornite generări video, cheltuite credite sau modificate date din aplicație. Fișierele PNG verifică prezentarea vizuală; nu verifică interacțiuni, accesibilitate sau comportamentul aplicației.

## Verificare

Cele cinci PNG-uri sunt distincte, se decodează corect și au fiecare **1487 × 1058 px**; raportul păstrează cadrul desktop cerut. Total: **7,44 MiB**. Au fost verificate vizual cele cinci compoziții și cele 14 legături locale din index și din pagina drafturilor.

`node scripts/storage.mjs --check` a fost rulat. Checkout: 6514,6 MiB; `.cache`: 2351,8 MiB; ieșiri regenerabile: 776,3 MiB, peste pragul de 512 MiB deja depășit înaintea acestei etape. Scanarea semnalează și o cale necitibilă. Nu s-a făcut curățare de date sau dependențe.
