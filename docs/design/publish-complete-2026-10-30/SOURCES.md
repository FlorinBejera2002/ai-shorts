# Surse și adaptare — Publish

Consultate la 30 octombrie 2026. Modelul folosește fișierele `DESIGN.md` din ambele colecții solicitate, prin Product Design. Acestea sunt analize comunitare ale unor interfețe, nu specificații oficiale sau dovadă că funcționalitățile descrise există în Sneep Cut.

## Referințe externe

| Fișier citit | Principii folosite în model | Ce adaptăm sau excludem |
| --- | --- | --- |
| [Notion iOS — DESIGN.md](https://github.com/Meliwat/awesome-ios-design-md/blob/main/design-md/productivity/notion/DESIGN.md), din [awesome-ios-design-md](https://github.com/meliwat/awesome-ios-design-md) | Interfață discretă, suprafețe charcoal, conținut fără încadrare repetitivă. Ritm de 4pt, insets mobile 16pt, body 16pt, detalii secundare 14pt. Opțiuni dezvăluite progresiv; meniuri și foi dedicate. Mișcare scurtă: aproximativ 150ms pentru meniu/chevron și 200ms pentru deschiderea secțiunii. | Păstrăm fonturile și tokenii Sneep Cut. Valorile iOS în pt sunt repere, nu conversii automate în CSS. Nu importăm editorul cu blocks, comenzi slash, linkuri albastre, autosave sau navigația Notion. |
| [Vercel — DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/vercel/DESIGN.md), din [awesome-design-md](https://github.com/voltagent/awesome-design-md) | Acțiune principală monocromă, tipografie ordonată, separatoare fine, spațiere pe grilă de 4px. Repere: body 16/24px, compact 14/20px, heading 24/32px; spații 8/12/16/24/32px, gutters 24px desktop și 16px mobil. | Folosim precizia ierarhiei pentru toolbar, rânduri și formular. Excludem gradientele, hero-ul de marketing, fonturile Geist, butoanele pill, codurile cromatice și structura navigației sursei. |
| [Cal — DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/cal/DESIGN.md), din [awesome-design-md](https://github.com/voltagent/awesome-design-md) | Controale monocrome, etichete 14–16px, inputs de 40px, grilă de 4px, separatoare de 1px și focus vizibil. Recompunerea coloanelor la ecrane mici păstrează lizibilitatea și proporțiile media. | Aplicăm coerența controalelor la formular și programare. Nu importăm fonturi, badge-uri pastel, pill tabs, footer, reguli restrictive despre hover sau suprafețe de marketing. Calendarul funcțional provine din proiect. |

## Ordinea regulilor

1. Cerințele explicite ale utilizatorului și [AGENTS.md](../../../AGENTS.md).
2. Direcția aprobată din [publishing-design.md](../publishing-design.md) și imaginile sale, numai unde sunt compatibile cu ultima cerință explicită.
3. Comportamentul și componentele montate efectiv în codul rutei respective.
4. Principiile externe compatibile, adaptate în [DESIGN.md](DESIGN.md).

Prin urmare, corpul folosește Manrope, titlurile Sora, iar acțiunile principale și selecția folosesc `foreground`/`background`, inversate potrivit temei. Hover-ul rămâne `bg-muted`. Sursele nu autorizează accente albastre sau violet pe controale.

Cardurile, butoanele, inputs, popups și preview-urile folosesc `rounded-md` / `--radius-md`; badge-urile și elementele interioare folosesc `rounded-sm` / `--radius-sm`. Cercurile și progresul își păstrează geometria circulară. Excepția existentă pentru Calendar Gooey Nav rămâne cea documentată în `AGENTS.md`.

Ultima corecție a utilizatorului cere un design mai simplu, mult mai puțin text explicativ și o compoziție clar diferită. Ea înlocuiește structura anterioară cu media în stânga și preview permanent. Publish folosește o listă pe întreaga lățime disponibilă, fără inspector permanent. Composer-ul desktop are o singură coloană, un singur câmp public și un atașament compact. Opțiunile și consimțămintele existente rămân într-un drawer accesibil, cu validările păstrate.

Referințele susțin reducerea elementelor, ierarhia și dezvăluirea progresivă, nu copierea layout-ului anterior. Eliminăm explicațiile redundante, păstrând etichetele, erorile și textele obligatorii de consimțământ. Ultimul feedback autorizează explicit All implicit, filtrele exacte pe status și preview-urile vizuale ale platformelor. Nu importăm alte funcții din aplicațiile de referință.

**Borduri foarte rare:** cerința nouă prevalează asupra separatoarelor Vercel/Cal. Reținem grila și ierarhia lor, folosind spațiu și aliniere în loc de linii între rânduri, taburi sau opțiuni. Focusul vizibil rămâne obligatoriu.

**Preview social:** referințele oficiale Meta, TikTok și YouTube, imaginile inspectate și limitele fiecărui format sunt în [PLATFORM-PREVIEWS.md](PLATFORM-PREVIEWS.md). Acestea au prioritate asupra colecțiilor comunitare pentru iconurile și așezarea comenzilor sociale. Geometria nativă a suprapunerilor este excepția documentată în AGENTS; shell-ul Sneep Cut rămâne monocrom, cu tokenii existenți.

Machetele mobile se subordonează shell-ului rutei reale. În Publish și New post/edit, `CalendarMobileHeader` ascunde `MobileDashboardDock`: apar hamburger-ul, logo-ul și asistentul global, fără dock vizibil. Același header este folosit în opțiuni și media. Nu adăugăm navigație permanentă pe baza unei imagini; verificarea codului este documentată în [COMPOSER.md](COMPOSER.md).

## Limite și accesibilitate

Documentele Vercel și Cal analizează în principal marketingul. Cal exclude explicit widget-ul de booking, timpii animațiilor de programare și validările complete. Niciunul nu justifică funcții noi de publishing sau promisiuni despre API-uri.

Dimensiunile mici din exemplele surselor nu sunt dovadă de accesibilitate. Modelul cere ținte tactile de cel puțin 44×44px, focus vizibil, etichete, mesaje de eroare explicite și respectarea preferinței de mișcare redusă. Acestea sunt cerințe ale modelului; implementarea necesită verificare separată.

## Atribuire

- **awesome-ios-design-md** — Copyright © 2026 Muhammed Eliwat, [licență MIT](https://github.com/Meliwat/awesome-ios-design-md/blob/main/LICENSE).
- **awesome-design-md** — Copyright © 2026 VoltAgent, [licență MIT](https://github.com/VoltAgent/awesome-design-md/blob/main/LICENSE).

Acest document sintetizează și adaptează principiile; nu reproduce integral documentele externe. Numele, mărcile și identitățile produselor de referință rămân ale titularilor lor. Copiile ori porțiunile substanțiale redistribuite din surse trebuie să păstreze notificările cerute de licențele respective.
