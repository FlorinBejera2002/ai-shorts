# Create clips — verificare design și implementare

final result: passed

Referința aleasă este `docs/design/create-clips-settings-left/compact-inspector.png`. Setul complet este în `docs/design/create-clips-complete/`: 64 de imagini verificate, 32 de perechi desktop/mobil. Implementarea folosește aplicația existentă, cu inspector în stânga, sursă/preview în dreapta și indicații AI compacte. Cerința ulterioară a utilizatorului de a păstra procesarea actuală are prioritate față de mockupuri.

Raportul anterior Scripts este păstrat integral în `docs/design/scripts-final/design-qa-2026-10-23.md`.

## Dovezi și condiții de comparație

| Suprafață | Sursă vizuală | Captură reală | Normalizare |
| --- | --- | --- | --- |
| YouTube desktop pregătit | compact-inspector.png, 1487×1058 | create-clips-design-qa/youtube-1487-viewport.png | 1487×1058 CSS px, deviceScaleFactor 1 |
| YouTube mobil pregătit | mobile-youtube-ready.png, 853×1844 | youtube-390-viewport.png, 390×844 | Sursa redusă la390×844; captură CSS390×844, densitate1 |
| Filmări goale desktop | desktop-footage.png, 1487×1058 | empty-1440-viewport.png | Sursa normalizată la1440×1024; captură CSS1440×1024, densitate1 |
| Filmări goale mobil | mobile-footage.png, 853×1844 | empty-390-viewport.png | Sursa normalizată la390×844; captură CSS390×844, densitate1 |
| Story gata | desktop/mobile-story-ready.png | create-clips-qa/desktop-ready-viewport.png, mobile-ready-viewport.png și mobile-320-ready-viewport.png | Dark,1440×1024 și390/320×844, densitate1 |
| Procesare YouTube | baseline real link-transcribing-desktop.png | create-clips-processing-final/link-transcribing-desktop.png | Light,1440×1000, densitate1; aceeași etapă Transcribe42% |

Toate căile de capturi sunt sub `frontend/test-results/`. Imaginile sursă sunt în `docs/design/create-clips-complete/`, dacă nu este precizat altfel. Mockupurile nu includ chrome de telefon; nici capturile nu adaugă rame sau bare OS.

Comparațiile complete pun referința și implementarea în același fișier:

- `create-clips-design-qa/desktop-youtube-comparison.png`, `mobile-youtube-comparison.png`.
- `desktop-footage-comparison.png`, `mobile-footage-comparison.png`, în aceeași stare goală. Capturile suplimentare `story-1440-viewport.png` și `story-390-*.png` au trei surse și nu sunt folosite pentru a compara densitatea cu starea goală.
- `create-clips-qa/story-ready-contact-sheet.png`, cu viewportul mobil inițial și acțiunile după scroll.
- `create-clips-design-qa/processing-before-after.png`, cu baseline-ul existent și versiunea finală.
- Comparația focalizată `youtube-controls-comparison.png` permite citirea sliderului, raporturilor, subtitrărilor și Brand Kit.
- `captions-typography-*.png`, `captions-layout-*.png` și `caption-overflow-report.json` verifică editorul extins la1440/1024/390/320px.

## Constatări și istoricul corecțiilor

Nu mai există diferențe acționabile P0/P1/P2 în suprafețele verificate.

1. **P2 — densitate și ierarhie YouTube.** Rândul separat URL/tooltip consuma spațiu mobil, iar valoarea sliderului era deasupra lui. Eticheta a rămas accesibilă, tooltipul este acum în câmp, numărul este lângă slider, iar coloana/fonturile desktop au fost apropiate de referință. Dovezi inițiale: `desktop-youtube-before-comparison.png`, `mobile-youtube-before-comparison.png`. Recapturile și comparațiile finale de mai sus confirmă corecția.
2. **P2 — ținte prea mici.** La rădăcina existentă de15px, 2.75rem însemna41.25px. Acțiunile principale, inputurile și selecturile afectate au primit minimum44px reali. Măsurători pentru Result: `create-clips-qa/story-metrics.json`; acțiunile au44px și trec hit-testul central.
3. **P2 — transcriptul împingea sursele în jos.** Blocul de trei transcripturi era deasupra wizardului. Acum este un disclosure compact după wizard, închis implicit, cu componenta și textul revizuit păstrate. Capturile draft finale și testul transcript confirmă accesul și salvarea textului fără generare.
4. **P2 — proporții rezultat mobil și suprapunere.** Preview-ul portret avea aproximativ608px. Limita mobilă este acum min(40dvh,20rem),300px la viewporturile verificate, cu object-fit:contain, raportul real și controale native. La320px, New story este icon44px cu nume accesibil, păstrând selectorul pe același rând. În ambele390/320px, Download este la y667.125–711.125, deasupra launcherului y720.25–754 și dockului y777.5–830. Toate cele trei acțiuni sunt libere după scrollul de jos. Dovezi înainte: `mobile-ready-viewport-before-proportion-fix.png`, `story-metrics-before-proportion-fix.json`; după: contact sheet și story-metrics.json.
5. **P2 — editor îngust.** Rândurile fixe de spacing au fost adaptate preventiv în Story. Verificarea Layout la1024px a mai găsit etichete Horizontal/Vertical în celule de33px, cu text57/42px. Poziția a fost adaptată local în Story.css. Recapturile și raportul păstrează constatarea inițială și confirmă apoi editor225/scroll225 la1024px și288/288 la320px, zero offenders. Editorul Brand Kit comun nu a fost modificat.
6. **P2 — affordance încărcare/Continue.** În comparația corectă cu starea goală lipsea CTA-ul vizual Choose files, iar Continue era mic. S-a adăugat spanul vizual în butonul nativ existent, fără handler sau input suplimentar, și Continue ocupă inspectorul la pasul0. Înainte: `desktop-footage-empty-before-comparison.png`, `mobile-footage-empty-before-comparison.png`. După: comparațiile Filmări finale.
7. **P1 — contrast antet procesare în light.** Un antet transparent făcea labelurile existente aproape albe pe alb. Antetul a fost restaurat byte-exact din HEAD, conform preferinței utilizatorului. Înainte: `processing-contrast-before-comparison.png`; după: `processing-before-after.png`. Suita de procesare a fost rerulată PASS după restaurare. JobProcessingHeader, ProcessingPipeline, JobProcessingPanel, CSS-ul pipeline-ului și StoryProcessing au diff gol față de baseline.

## Cele cinci suprafețe de fidelitate

- **Fonturi și tipografie:** fonturile reale Manrope/Sora ale aplicației sunt păstrate. Titlul și labelurile inspectorului au o ierarhie clară; numericile sunt tabulare, titlurile media lungi sunt limitate și numele fișierelor se trunchiază. Rasterul generat nu definește o familie de font exactă. Caption typography/layout nu au text tăiat în rail-ul de225px după fix.
- **Spațiere și proporții:** două coloane pe desktop, formular într-o coloană pe mobil, ordine sursă→setări→indicații→generare. Zona media folosește spațiul disponibil; AI nu este un panou permanent mare. Radii md/sm partajate, fără radii decorative noi. Mobilul derulează natural pentru ținte de44px; nu comprimă toate controalele la dimensiunile mici ale rasterului.
- **Culori și tokenuri:** foreground/background pentru acțiuni și selecții, muted neutru pentru hover, tokens dark/light existenți. Nu se introduce un accent albastru nou. Accentele existente ale procesării au fost păstrate explicit, împreună cu antetul original și contrastul lui.
- **Imagery:** fotografia de studio generată este fixture local numai pentru preview/teste. Producția folosește thumbnailurile/media reale. Logo-ul violet existent și iconurile Lucide sunt păstrate; nu există imagini UI rasterizate sau înlocuiri de artă cu CSS/SVG improvizat. Result folosește un MP4 sintetic2sec,90×160 pentru verificarea playerului; imaginea/durata lui diferă intenționat de mockup.
- **Copy și conținut:** un singur câmp opțional de direcție, texte scurte, fără buton Write script în conținut. Scripts rămâne în navigarea globală. Costurile/creditele, limita20URL, deduplicarea, restricțiile fișierelor, erorile, retry și condițiile rezultatului vin din logica existentă. Datele demo nu sunt introduse în contul utilizatorului.

Diferențe intenționate: sidebarul/headerul/dockul existente rămân montate și își păstrează dimensiunile; pickerul de proiect și New story sunt păstrate; rezultatul gata nu reintroduce un wizard de editare; Originals/settings este disclosure sub rezultat. Progresul real are prioritate față de interpretările imaginilor generate.

## Verificare funcțională

- Typecheck și build final: PASS. Lint: exit0, numai avertismente preexistente. Buildul păstrează avertismentele existente despre chunk mare și viitorul configLoader Vite.
- 19 teste unitare Story forms și18 teste unitare rezultat/review/audio: PASS.
- Unified Create browser:1487×1058,390×844,320×844 și RO; upload în curs, draft, URL/step state, query, batch/dedup, credite insuficiente/unlimited/API indisponibil, payloaduri: PASS.
- Asistentul YouTube este închis implicit, deschis explicit într-un Sheet îngust; deschiderea și tastarea nu trimit cereri. Send aplică update_settings/set_instructions în formularul controlat și payloadul Generate: PASS.
- Wizard, narration, music, fidelity/playback, result, transcript, retry, audio cleanup și job-load/retry browser: PASS, cu date sintetice și API-uri interceptate.
- Fast Refresh CreationWorkspace, StoryMusic, StoryOptions și StoryResultHeader: PASS. DOM-ul draftului/playerului, poziția redării și identitatea sidebar/header se păstrează. Toate sursele temporare restaurate byte-exact, zero markeri rămași; Vite nu a fost repornit.
- Processing browser rerulat după restaurarea antetului: PASS pentru faze/polling/repair, anulare, needs-review/failure, progres Story indeterminat,18/42/100% YouTube,320px și reduced-motion.
- Geometrie/capturi finale: zero overflow orizontal sau clipping în cazurile testate; console/page exceptions zero în capturile finale. Un mesaj tranzitoriu HMR din timpul editării unui modul a fost rezolvat înainte de build și verificările finale.
- React Doctor: scanările changed nu au constatări; comparația full a crescut de la13 la14. Scorul changed74 nu este comparabil direct cu scorul full.
- Scratch-ul MP4 al acestei sarcini a fost șters după playback. Storage check final: PASS, checkout6431.5MiB, .cache1996.0MiB, regenerabile440.8MiB, sub bugetele8GiB/3GiB/512MiB.

## Limite și polish P3

Verificările folosesc cont, media și API-uri sintetice. Nu s-au folosit baza/media utilizatorului, credite reale, furnizori de generare sau deployment. Confirmarea procesării prin servicii externe nu a fost lansată.

Launcherul global existent poate acoperi părți ale controalelor secundare la poziții intermediare de scroll; acțiunile principale verificate și toate acțiunile de la final sunt accesibile. Track-ul nativ Music volume are contrast redus dintr-o regulă globală preexistentă; valoarea, thumb-ul și tastatura rămân funcționale. Acestea sunt P3, fără extinderea acestei sarcini la shellul global.

## Checklist

- [x] Referința aleasă, desktop și mobil.
- [x] Stările Upload/YouTube, opțiunile, recuperările și rezultatele păstrate.
- [x] Procesarea existentă păstrată; contrast reverificat.
- [x] P0/P1/P2 corectate și recapturate.
- [x] Verificări funcționale și Fast Refresh.
- [x] Artefacte finale și raport, fără deployment.
