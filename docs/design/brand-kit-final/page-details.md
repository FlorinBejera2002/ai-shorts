# Brand Kit — galerie de design

Data: **2026-10-22**. Mockupuri statice create cu instrumentul ImageGen integrat, în stilul Sneep Cut salvat. Aceste variante Brand Kit sunt pentru revizie: **nu sunt implementate și nu au fost încă aprobate de utilizator**.

Surse aprobate pentru limbajul vizual: [New post, varianta a treia](../assets/new-post-approved-2026-10-22.png), [Publish, varianta a doua rafinată](../assets/publish-reference-2026-10-22.png) și [ghidul proiectului](../publishing-design.md). Aprobarea acestor surse nu constituie aprobarea noilor ecrane Brand Kit.

Extensie cerută ulterior: [previzualizare în Instagram, TikTok, YouTube și Facebook](social-preview-details.md), cu câte o machetă finală desktop și mobil pentru fiecare platformă. [Indexul tuturor celor 20 de imagini](README.md).

## Ecrane și briefuri ImageGen

Fiecare pereche păstrează fundalurile întunecate, acțiunile alb/negru, spațierea calmă, fonturile Manrope/Sora și geometria md/sm. Pe telefon, controalele sunt reorganizate într-o singură coloană, cu acces clar la previzualizare și salvare; nu se introduce o navigare permanentă nouă.

| Stare | Desktop | Telefon | Brief pentru generare |
| --- | --- | --- | --- |
| Privire de ansamblu | [Desktop](desktop-overview.png) | [Telefon](mobile-overview.png) | Brand Kit simplu, cu secțiunile reale Logo & watermark și Captions, previzualizare și acțiuni de salvare ușor de găsit. |
| Logo și watermark | [Desktop](desktop-logo-watermark.png) | [Telefon](mobile-logo-watermark.png) | Logo încărcat, Replace/Remove, activare watermark, dimensiune, margine, colț, opacitate și vizibilitatea badge-ului Sneep Cut; previzualizarea arată poziția rezultată. |
| Stiluri de subtitrare | [Desktop](desktop-caption-styles.png) | [Telefon](mobile-caption-styles.png) | Selecție clară între cele 12 preseturi, cu stilul activ și o previzualizare de subtitrare lizibilă. |
| Tipografie | [Desktop](desktop-typography.png) | [Telefon](mobile-typography.png) | Căutare și alegere font, grosime, spațiere și zona de font personalizat TTF/OTF cu confirmarea dreptului de utilizare. |
| Culori și efecte | [Desktop](desktop-colors-effects.png) | [Telefon](mobile-colors-effects.png) | Culorile subtitrării, contur, fundal, evidențierea cuvântului activ și animație, grupate compact; previzualizarea reflectă selecția. |
| Așezare și previzualizare | [Desktop](desktop-layout-preview.png) | [Telefon](mobile-layout-preview.png) | Ajustări avansate de dimensiune, lățime, rânduri, aliniere și poziție X/Y, cu rapoarte 9:16, 1:1 și 16:9 și resetarea poziției. |

## Funcționalități de păstrat

- **Logo:** încărcare de pe dispozitiv sau drag-and-drop, PNG/JPEG/WebP până la 5 MiB; stare fără logo, înlocuire, eliminare și progres de încărcare.
- **Watermark:** activare, dimensiune 1–50%, margine 0–20%, patru colțuri și opacitate 10–100%. Mutarea manuală și redimensionarea în preview rămân disponibile. Alegerea unui colț sau schimbarea marginii elimină coordonatele manuale.
- **Badge Sneep Cut:** ascundere în funcție de permisiunea `canWhiteLabel`; fără dreptul necesar, control blocat și acces la upgrade. Nu sugerăm că toate conturile pot elimina badge-ul.
- **Preseturi:** Classic, Minimal, Bold outline, Contrast box, Headline, Word by word, Karaoke, Active color, Active background, Phrase pop, Subtle fade și Stacked.
- **Fonturi:** căutare, selecție și grosimile disponibile; TTF/OTF personalizat până la 8 MiB, cu confirmarea licenței. Păstrăm înlocuirea, arhivarea/eliminarea fontului și avertizarea pentru lipsa diacriticelor românești.
- **Spațiere:** litere −0,05–0,30 em, cuvinte 0–1 em și rânduri 1–1,8×.
- **Culori și efecte pentru subtitrări:** text, contur, fundal și evidențiere, cu HEX, selector, pipetă și copiere. Conturul, fundalul și cuvântul activ au comutatoare; animația oferă None, Phrase pop, Subtle fade, Word pop și Word fade.
- **Ajustări avansate:** dimensiune 0,02–0,16, lățime 0,20–0,96, 1–3 rânduri, contur și umbră 0–8, opacitate fundal 0–1, aliniere stânga/centru/dreapta, poziție X/Y și Reset position.
- **Previzualizare:** rapoarte 9:16, 1:1 și 16:9, ghidaje de siguranță, subtitrare animată, logo condiționat de activarea watermark-ului și badge condiționat de permisiuni. Păstrăm gesturile și alternativele de tastatură pentru poziționare/redimensionare.

Pagina actuală nu montează secțiunile separate pentru paleta globală de brand sau fontul global de brand. Acest pachet nu le adaugă; culorile și tipografia ilustrate aparțin editorului de subtitrări.

## Salvare și stări temporare

Setările modificate rămân nesalvate până la **Save**. **Discard** revine la setările persistate. **Reset** restaurează valorile implicite, păstrează logo-ul și necesită salvare. Încărcarea sau eliminarea logo-ului se persistă imediat; Discard nu anulează aceste operații.

La implementare trebuie păstrate indicatorul de modificări nesalvate, salvarea în curs, confirmarea Saved și erorile. Save este dezactivat pentru HEX invalid sau cât timp se salvează/încarcă logo-ul. Încărcarea inițială, eroarea de încărcare cu Retry, eroarea fontului și feedbackul pentru diacritice lipsă trebuie tratate explicit, chiar dacă nu apar toate în imaginile principale.

Imaginile nu dovedesc funcționarea încărcărilor, gesturilor, permisiunilor, animațiilor, salvării sau accesibilității. Aceste comportamente necesită implementare și verificare separată; nici aspectul mobil nu este validat funcțional printr-un mockup static.
