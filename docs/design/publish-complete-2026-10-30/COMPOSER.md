# Publish — model complet pentru New post, media și opțiuni

Data inventarului: 30 octombrie 2026. Acest document descrie **modelul de design simplificat pentru revizuire**, întemeiat pe interfața și validările existente, cu preview-ul specific platformei cerut explicit în ultima revizie. Acesta este un comportament vizual nou autorizat, nu o funcție deja implementată în composer și nu o integrare pentru acțiuni sociale. Documentul nu reprezintă implementare în aplicație, aprobare de design, test de browser sau verificare a publicării reale la furnizori.

Se citește împreună cu [DESIGN.md](DESIGN.md), [sursele externe](SOURCES.md), [regulile proiectului](../../../AGENTS.md) și [direcția aprobată Publish](../publishing-design.md). Regulile Sneep Cut și funcțiile reale au prioritate față de detaliile decorative din referințe sau machete.

**Direcția curentă:** utilizatorul a cerut un design mult mai simplu, cu text minim și delimitări prin bordură foarte rare. Ultima revizie cere explicit All implicit în lista Publish și preview fidel diferit pentru fiecare platformă, cu elementele sale sociale. Aceste completări au prioritate asupra excluderii previewului social din revizia anterioară. Compoziția desktop rămâne într-o singură coloană, cu media compactă; regulile de brand, raze, un singur caption și toate validările se păstrează.

## 1. Contractul vizual și funcțional

- Un singur câmp public principal, **Textul postării / Post text**. Fără titlu public separat în suprafața principală, fără duplicarea captionului și fără subtitlu explicativ permanent sub New post.
- Titlul intern se derivă din clip sau din text. Nu se expune ca al doilea editor public. Titlul și descrierea cerute de YouTube rămân în opțiunile specifice YouTube; sunt metadate reale ale destinației.
- Desktop și mobil: formular pe o singură coloană, conturi compacte cu identitate reală, un singur caption și media ca atașament compact. Change media și extinderea previewului rămân intrările existente; preview-ul extins trebuie să redea vizual platforma selectată, conform [PLATFORM-PREVIEWS.md](PLATFORM-PREVIEWS.md). Nu se rezervă o coloană permanentă pentru previzualizare.
- O singură intrare Platform options deschide panourile existente. Notes este o secțiune opțională închisă implicit. Consimțămintele și setările specifice furnizorilor rămân în panourile lor, fără rezumate sau acorduri duplicate în formularul principal.
- Draft / Schedule / Publish now rămân modurile existente. Data, ora și fusul orar apar numai în Schedule. Pe mobil, eticheta vizibilă Change media poate deveni Change, păstrând numele accesibil complet al acțiunii.
- Acțiunea principală reflectă modul ales: Save draft, Schedule post sau Publish now. Cancel și Save draft secundar rămân discrete; nu se afișează trei acțiuni principale concurente.
- Opțiunile avansate sunt accesibile prin dezvăluire progresivă. Funcționalitate completă înseamnă acces la toate stările, nu toate controalele vizibile simultan.
- Culori semantice neutre, acțiuni principale prin foreground/background, hover prin muted. Mărcile platformelor și logo-ul violet existent își păstrează identitatea. Culorile lor nu devin culori de selecție ale aplicației.
- Spațiul și alinierea delimitează grupurile; nu încadrăm fiecare secțiune, cont, atașament sau toolbar într-o bordură. Bordurile apar foarte rar, numai unde sunt necesare pentru identificarea unui câmp ori unei suprafețe. Focusul, selecția și eroarea rămân vizibile. Chrome-ul social din interiorul previewului urmează referința platformei, nu se stilizează arbitrar ca un formular Sneep Cut.
- `rounded-md` pentru suprafețe și controale, `rounded-sm` pentru etichete mici și interioare, `rounded-full` doar pentru forme circulare și progres. Controalele Sneep Cut păstrează aceste reguli. Suprapunerile sociale urmează geometria nativă conform excepției explicite din AGENTS și [contractului preview-urilor](PLATFORM-PREVIEWS.md).
- Se păstrează layoutul dashboard montat, starea sidebarului și granițele componentelor. Acest model nu propune schimbarea routerului sau a comportamentului Fast Refresh.

**Diferență explicită față de codul actual:** More options conține astăzi un câmp de titlu intern. Modelul îl tratează ca metadată derivată, conform instrucțiunii aprobate de a păstra un singur câmp public principal. Notele interne rămân editabile. Aceasta este o cerință pentru o eventuală implementare, nu o modificare deja efectuată.

Surse: [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), liniile 145–209; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), liniile 534–558.

## 2. Shell mobil verificat în cod

New post și editarea unei postări montează `CalendarMobileHeader`, alias pentru `WorkspaceMobileHeader`. Acesta afișează butonul de meniu și logo-ul sub 1024 px. CSS-ul comun ascunde dockul existent atunci când documentul conține acel header; dockul rămâne montat în `DashboardShell`, dar nu este vizibil pe această suprafață. Butonul agentului este mutat în dreapta sus a headerului.

Prin urmare, machetele New post, media și Platform options păstrează **headerul mobil cu acces la sidebar**, fără un dock nou și fără combinarea headerului cu dockul ascuns. Acțiunea persistentă a formularului folosește spațiul disponibil și safe area; nu se adaugă un rând de navigație permanentă. Pe desktop se păstrează topbarul comun și sidebarul.

| Dovadă | Fișier și linii |
| --- | --- |
| Aliasul CalendarMobileHeader | [calendar-mobile-header.tsx](../../../frontend/src/components/calendar/calendar-mobile-header.tsx), linia 3 |
| Meniu, logo, aria-expanded și control sidebar | [workspace-mobile-header.tsx](../../../frontend/src/components/dashboard/workspace-mobile-header.tsx), liniile 10–33 |
| Header mobil; dock ascuns la prezența headerului; agent în header | [workspace-mobile-header.module.css](../../../frontend/src/components/dashboard/workspace-mobile-header.module.css), liniile 5–38 |
| Dock montat în shell; topbar desktop; conținut rutabil | [dashboard-shell.tsx](../../../frontend/src/components/dashboard/dashboard-shell.tsx), liniile 40–105 |
| Header inclus în composer | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), linia 108 |

## 3. Matricea stărilor composerului

ID-urile sunt identificatori de acoperire pentru design. Nu sunt nume de rute noi și nu înseamnă că fiecare stare are o imagine separată.

| ID | Stare / interacțiune | Cerință de design | Dovadă în cod |
| --- | --- | --- | --- |
| C01 | New post inițial | O singură coloană, titlu compact, conturi, un editor de text, atașament media compact gol sau preselectat, Platform options și Notes închise, Draft implicit. Compoziția este noua propunere; controalele și valorile provin din cod. | [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 125–170; [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 106–186 |
| C02 | Editare | Reîncarcă textul, media, conturile încă disponibile, data și opțiunile salvate. Titlul e metadată internă; notele sunt opționale. | [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 125–170, 266–284 |
| C03 | Selectarea conturilor | Identitate și handle accesibile, stare selectată neutră și explicită. Platformele neconectate sunt indisponibile, nu par selectabile. | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 114–143 |
| C04 | Fără cont disponibil | Text clar și acțiune de întoarcere pentru conectare; nu se simulează un cont conectat. | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 140–143 |
| C05 | Text și contor | Contorul urmărește limita reală a selecției; schimbarea destinației nu ascunde o depășire existentă. Eroare lângă câmp. | [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 326–337, 606–614 |
| C06 | Previzualizare | Atașament compact pe desktop și mobil. Extinderea păstrează media video/imagine/carousel și adaugă reprezentarea vizuală cerută explicit pentru platforma selectată; nu este deja implementată în rendererul curent. Lipsa media invită la alegere. Fără preview mare permanent. | [post-composer-preview.tsx](../../../frontend/src/components/calendar/post-composer-preview.tsx), 15–84; [PLATFORM-PREVIEWS.md](PLATFORM-PREVIEWS.md) |
| C07 | Draft | Salvare explicită. Nu se afișează Autosaved sau indicator de salvare automată: nu există autosave în această funcție. | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 79–82, 204–209 |
| C08 | Schedule | Data, ora și fusul orar devin vizibile; acțiunea principală este Schedule post. | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 168–186 |
| C09 | Publish now | Acțiune principală explicită; Save draft rămâne secundar. Succesul inițial înseamnă pornirea publicării. | [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 204–209; [post-editor-page.tsx](../../../frontend/src/components/calendar/post-editor-page.tsx), 89–99 |
| C10 | În curs de salvare / upload / ștergere | Controalele dependente sunt indisponibile; label și indicator exprimă operația reală. Fără a bloca fictiv alte operații independente ale aplicației. | [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 254–289, 791–841 |
| C11 | Eroare de formular / server | Valorile rămân; erori de câmp plus mesaj general când nu există câmp identificabil. Utilizatorul poate corecta și retrimite. | [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 738–807 |
| C12 | Încărcare, eroare inițială, post lipsă, post blocat | Stări distincte; Retry doar pentru eroare de încărcare. Published și Publishing nu intră în editor. | [post-editor-page.tsx](../../../frontend/src/components/calendar/post-editor-page.tsx), 60–153 |

### Conturi și text

- Se oferă numai conturi utilizabile și furnizori care declară suport de publicare. Nu se păstrează artificial în selecție un cont expirat sau eliminat.
- Mai multe conturi ale aceleiași platforme pot fi disponibile. TikTok este excepția: selectarea altui cont TikTok îl înlocuiește pe cel curent.
- Schimbarea contului TikTok resetează setările lui; schimbarea contului Instagram resetează setările Instagram în cazurile prevăzute de cod. Schimbarea selecției YouTube invalidează consimțământul YouTube.
- Selectarea unui clip poate completa titlul intern și captionul dacă acestea erau goale; nu suprascrie un text deja scris.
- Caption comun: 2.200 când Instagram este selectat; altfel 4.000 pentru fotografii TikTok, 2.200 pentru video TikTok, 5.000 pentru celelalte combinații. Când sunt selectate mai multe destinații, se aplică limita comună mai restrictivă calculată de aplicație.
- Notele interne au maximum 2.000 de caractere. Titlul intern are maximum 120; pentru titlul trimis la TikTok photo se aplică limita 90.

Surse: [post-editor-page.tsx](../../../frontend/src/components/calendar/post-editor-page.tsx), 159–168; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 326–337, 456–500, 534–558, 602–619.

### Previzualizare specifică platformei — cerință nouă explicită

**Codul actual:** taburile de destinație schimbă selecția iconului, dar `CalendarPostMedia` nu primește platforma selectată și redă aceeași media. Dialogul extins nu primește nici el platforma selectată. În Brandkit există separat `SocialPreviewOverlay`, cu date demonstrative; acesta este un punct de reutilizare structurală, nu dovada fidelității vizuale pentru Publish.

**Modelul cerut acum:** selectarea Instagram, TikTok, Facebook sau YouTube schimbă efectiv aspectul previewului, inclusiv poziția și forma controalelor de apreciere, comentarii, distribuire și celelalte elemente prezente în referința relevantă. Geometria, iconurile și conținutul vizual urmează [PLATFORM-PREVIEWS.md](PLATFORM-PREVIEWS.md); nu se copiază un singur rail generic pe toate platformele și nu se deduc iconurile din amintirea unor versiuni vechi.

- Se folosesc media, captionul și identitatea reală a destinației selectate când datele sunt disponibile. Nu se inventează un handle sau se ascunde ambiguitatea când sunt selectate mai multe conturi ale aceleiași platforme.
- Tipul media contează: Reel/video vertical, fotografie și carousel nu sunt tratate ca același ecran. YouTube acceptă un video în implementarea curentă; simpla alegere a platformei nu justifică prezentarea oricărui video drept Short.
- Like, comments, share, follow și alte elemente sociale ale machetei reprezintă **aspectul rezultatului în platformă**. Nu trimit reacții, comentarii, distribuiri sau follow și nu deschid fluxuri de publicare noi. Interacțiunile reale din preview rămân redarea, schimbarea platformei, navigarea media și închiderea.
- Nu se prezintă numărători fictive drept engagement real. Datele sample din overlay-ul Brandkit nu se transferă în Publish. Pentru un post nepublicat, lipsa statisticilor nu devine o predicție; reprezentarea fără metrici ori marcajul demonstrativ se stabilește în specificația de preview.
- Elementele sociale decorative nu intră în ordinea de focus ca butoane funcționale. Controalele reale au nume accesibile și păstrează focusul. Explicația că este un preview se poate păstra scurt în titlul suprafeței, fără un paragraf repetat peste media.

Surse pentru diferența actuală: [post-composer-preview.tsx](../../../frontend/src/components/calendar/post-composer-preview.tsx), liniile 27–59 și 83; [social-preview-overlay.tsx](../../../frontend/src/components/dashboard/brand/social-preview-overlay.tsx), liniile 15–38; [preview-stage.tsx](../../../frontend/src/components/dashboard/brand/preview-stage.tsx), linia 57. Referințele vizuale externe și limitele de versiune sunt documentate separat, nu presupuse din cod.

## 4. Media: alegere, încărcare și editare

### Alegerea sursei

Change media deschide două surse egale: **My clips** și **From device**. Se păstrează starea locală a fiecărei surse cât timp dialogul este deschis. Confirmarea aplică fie un clip generat, fie lista de uploaduri; nu le combină în același post. Cancel revine la selecția inițială a composerului.

| ID | Stare / control | Conținut și comportament |
| --- | --- | --- |
| M01 | My clips | Căutare după titlu, selecție unică, thumbnail sau fallback, durată și indicator de eligibilitate TikTok unde există. |
| M02 | Paginare | 6 clipuri/pagină desktop, 4 mobil; poziție curentă, Previous/Next și număr de clipuri selectate. |
| M03 | Bibliotecă goală / căutare fără rezultate | Mesaje diferite; sursa From device rămâne disponibilă. |
| M04 | From device gol | Zonă de upload, file picker nativ cu selecție multiplă, drag/drop pe dispozitivele care îl permit. |
| M05 | Upload în curs | Fișierul curent și poziția N din M. Nu se afișează procent exact de bytes, deoarece nu este măsurat. Confirmarea și schimbarea sursei sunt indisponibile până la terminare. |
| M06 | Upload parțial reușit | Fișierele reușite rămân; fiecare eroare identifică fișierul. Utilizatorul poate selecta din nou fișierele eșuate; nu există promisiune de reluare automată de la ultimul byte. |
| M07 | Media selectată | Thumbnail, nume, ordine, eliminare și drag handle; primul element este identificat ca media de copertă a listei. |
| M08 | Reordonare accesibilă | Drag vertical și tastatură ArrowUp / ArrowDown / Home / End. Ordinea și selecția copertei TikTok urmăresc identitatea fișierului. |
| M09 | Editare fotografie | Format comun, crop și zoom; alt text pentru Meta; user tags pentru Instagram. |
| M10 | Confirmare / anulare | Use clip / Use media numai cu selecție validă și fără upload activ. Cancel nu schimbă media composerului. |
| M11 | Preview indisponibil | Numele fișierului și controalele rămân utilizabile; lipsa thumbnailului nu devine o eroare de upload inventată. |

Surse: [post-media-dialog.tsx](../../../frontend/src/components/calendar/post-media-dialog.tsx), 36–189; [publishing-media-picker.tsx](../../../frontend/src/components/calendar/publishing-media-picker.tsx), 60–153, 184–230; [publishing-media-upload-zone.tsx](../../../frontend/src/components/calendar/publishing-media-upload-zone.tsx), 34–76; [publishing-media-item.tsx](../../../frontend/src/components/calendar/publishing-media-item.tsx), 46–150.

### Limite reale ale selecției

| Nivel / destinație | Limită păstrată de model |
| --- | --- |
| Picker comun | Maximum 35 de fișiere. JPG/JPEG, PNG, WebP; MP4, MOV, WebM, AVI, MKV. Acceptarea în picker nu garantează compatibilitatea fiecărei destinații. |
| Upload server | Plafon de 4 GiB per upload. Acesta nu este o recomandare universală de dimensiune pentru fiecare rețea socială. |
| Instagram | Maximum 10 elemente; video MP4/MOV. Imaginea efectivă trimisă la Instagram trebuie să fie cel mult 8 MiB. Serverul poate pregăti derivat JPEG păstrând originalul. |
| Facebook | Maximum 10 fotografii sau un singur video; fără carousel mixt ori cu mai multe video-uri. Video MP4/MOV. |
| TikTok | Maximum 35 fotografii sau un singur video MP4/MOV/WebM. Clipurile generate trebuie să fie eligibile și să respecte durata permisă contului. |
| YouTube | Un singur video. Nu se afișează mod foto/carousel ca funcție de publicare YouTube. |

Surse: [publishing-media-utils.ts](../../../frontend/src/components/calendar/publishing-media-utils.ts), 3–73; [publishing.go](../../../backend/internal/media/publishing.go), 16–23, 29–79; [tiktok-direct-post.ts](../../../frontend/src/lib/tiktok-direct-post.ts), 89–133.

### Editorul de fotografii

- Este disponibil când selecția conține Instagram, Facebook sau TikTok și elementul este imagine.
- Format comun: Original, 1:1, 4:5, 1.91:1. Schimbarea formatului se aplică fotografiilor din listă; mesajele explică formatul comun și cazurile mixte. Nu se inventează un format 9:16 absent din selectorul actual.
- Crop: poziție orizontală/verticală 0–100%, zoom 1–3×, reset la centru și 1×. Nu se adaugă rotire, filtre sau editor video în acest model.
- Alt text pentru Instagram/Facebook: până la 1.000 de caractere Unicode, cu contor. Nu se afișează ca opțiune de publicare TikTok.
- User tags Instagram: maximum 20 pe imagine; username valid de 1–30 caractere, fără duplicate indiferent de majuscule; adăugare, eliminare, coordonate x/y și poziție în preview.
- Editorul poate păstra controalele când previewul nu este disponibil; afișează mesaj clar în locul fotografiei.

Surse: [publishing-image-format.tsx](../../../frontend/src/components/calendar/publishing-image-format.tsx), 19–97; [publishing-image-editor.tsx](../../../frontend/src/components/calendar/publishing-image-editor.tsx), 13–114; [publishing-image-tags.tsx](../../../frontend/src/components/calendar/publishing-image-tags.tsx), 11–142.

## 5. Platform options

Un singur drawer desktop sau o vedere mobilă focalizată, cu scroll propriu și footer vizibil. Numai platformele selectate apar în taburi. Handle-ul contului este text de identificare, ca în panoul existent; nu devine un dropdown nou de schimbare a contului. Toate setările și consimțămintele de mai jos apar numai în aceste panouri, nu ca listă suplimentară în composer. Cancel, Back, închiderea drawerului și Escape păstrează semantica de anulare a modificărilor locale; Done le păstrează în formular. Închidere cu restabilirea focusului la controlul care a deschis vederea.

Sursă: [post-platform-options.tsx](../../../frontend/src/components/calendar/post-platform-options.tsx), 30–142; snapshotul este în [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 883–893.

### P01 — Instagram

| Control | Condiție și regulă |
| --- | --- |
| Collaborators | Toate tipurile media; maximum 3 usernames unice, fiecare 1–30 caractere alfanumerice, punct sau underscore; prefixul @ este normalizat. |
| Location | ID numeric de maximum 64 cifre; nu se înlocuiește cu o căutare de locații fictivă. |
| AI-generated | Toggle pentru conținut generat cu AI. |
| Share to feed | Numai pentru Reel. |
| Cover | Numai Reel: upload/change/remove imagine JPG/JPEG/PNG/WebP, preview și eroare proprie. |
| Cover frame | Numai Reel fără copertă încărcată; timp 0–900 secunde. |
| Audio name | Numai Reel; maximum 100 de caractere Unicode. Este nume de audio, nu selector de melodii. |
| Trial Reel | Numai Reel: Off, Manual, Automatic / `SS_PERFORMANCE`. |
| Comments | Explică faptul că sunt gestionate prin setările contului. Nu se inventează un toggle de comentarii suportat de API. Pentru drafturi vechi cu comentarii dezactivate: mesaj și Use account settings; publicarea este blocată până la corectare. |

În vederea compactă, coperta și setările uzuale preced More options; frame time, Trial și informația despre comentarii pot rămâne în zona avansată. Opțiunile Reel nu apar pentru o fotografie sau carousel.

Surse: [instagram-post-settings.tsx](../../../frontend/src/components/calendar/instagram-post-settings.tsx), 73–191; [instagram-post-settings.ts](../../../frontend/src/lib/instagram-post-settings.ts), 31–58; [instagram-cover-picker.tsx](../../../frontend/src/components/calendar/instagram-cover-picker.tsx), 13–139; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 584–589.

### P02 — Facebook

| Control | Condiție și regulă |
| --- | --- |
| Place | ID numeric de maximum 64 cifre. |
| Reel title | Numai Reel; maximum 255 de caractere Unicode. Rămâne metadată specifică Facebook. |
| AI-generated | Numai Reel. |

Nu se adaugă controale pentru grupuri, profil personal, carousel video sau setări de audiență absente din implementare. Identitatea destinației este pagina Facebook conectată.

Surse: [facebook-post-settings.tsx](../../../frontend/src/components/calendar/facebook-post-settings.tsx), 8–83; [facebook-post-settings.ts](../../../frontend/src/lib/facebook-post-settings.ts), 22–46.

### P03 — TikTok

| Control / stare | Condiție și regulă |
| --- | --- |
| Încărcare opțiuni cont | Indicator real de încărcare înaintea controalelor care depind de răspuns. |
| Eroare opțiuni cont | Mesaj și Retry; nu se înlocuiește răspunsul lipsă cu setări presupuse. |
| Privacy | Alegere explicită dintre valorile oferite de cont. Fără Public preselectat automat. |
| Comments | Activarea respectă `commentDisabled` returnat de furnizor. |
| Duet / Stitch | Numai video; respectă capabilitățile `duetDisabled` și `stitchDisabled`. |
| Commercial content | Activează Own brand și Paid partnership; trebuie selectat cel puțin un tip dacă este activ. |
| Paid partnership | Indisponibil cu privacy `SELF_ONLY`. Schimbarea către SELF_ONLY îl dezactivează. |
| Video cover | Timestamp opțional, număr finit ≥0, strict mai mic decât durata cunoscută. |
| Photo cover | Selectarea unei imagini din ordinea curentă. Reordonarea urmărește referința imaginii; dacă dispare, se revine la prima. |
| Auto-add music | Numai postare foto; nu este bibliotecă de muzică. |
| AI-generated | Toggle `isAigc`. |
| Consimțământ | Acceptare explicită a politicii muzicale, cu link. Pentru branded content apare și politica de conținut comercial. Nu se ascunde în text decorativ. |

Schimbarea contului TikTok resetează setările. Modificarea disclosure-ului comercial sau a tipurilor comerciale resetează consimțământul. Clipul generat trebuie să fie marcat eligibil și să respecte durata maximă returnată de cont. Titlul foto are maximum 90 caractere; captionul foto 4.000, video 2.200, cu limită comună mai mică dacă este selectat și Instagram.

Surse: [tiktok-post-settings.tsx](../../../frontend/src/components/calendar/tiktok-post-settings.tsx), 45–292; [tiktok-direct-post.ts](../../../frontend/src/lib/tiktok-direct-post.ts), 22–34, 89–194, 220–244; [tiktok-cover-settings.tsx](../../../frontend/src/components/calendar/tiktok-cover-settings.tsx), 8–83; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 456–525.

### P04 — YouTube

| Control | Condiție și regulă |
| --- | --- |
| Canal | Numele canalelor selectate este vizibil înainte de metadate și consimțământ. |
| Title | Titlu public specific YouTube, obligatoriu pentru publicare/programare; maximum 100 caractere Unicode. |
| Description | Descriere publică specifică YouTube; validare maximum 5.000 **bytes UTF-8**. Nu se afirmă că limita este întotdeauna 5.000 caractere. |
| Privacy | Private / Unlisted / Public. Când auditul nu este aprobat, numai Private este disponibil; motivul apare lângă control. |
| Made for kids | Alegere explicită Yes/No; nu se deduce automat. |
| Synthetic media | Alegere explicită Yes/No; nu se deduce automat. |
| Notify subscribers | Toggle păstrat. |
| Tags | Listă separată prin virgule; plafon de 500 caractere calculat conform regulilor existente, inclusiv separatorii și ghilimelele pentru tagurile cu spații. Fără taguri goale, caractere de control sau angle brackets. |
| License | Standard YouTube / Creative Commons. |
| Embeddable | Toggle păstrat. |
| Review and terms | Consimțământ explicit, cu link la termeni; nu este presupus dintr-o salvare anterioară. |

Titlul și descrierea nu acceptă `<` sau `>`. Consimțământul se resetează la schimbarea oricărei setări YouTube, a selecției media sau a contului YouTube și la redeschiderea unui post salvat. Aceste resetări trebuie să rămână clare și să nu fie ocolite prin precompletare vizuală.

Surse: [youtube-post-settings.tsx](../../../frontend/src/components/calendar/youtube-post-settings.tsx), 26–165; [youtube-advanced-settings.tsx](../../../frontend/src/components/calendar/youtube-advanced-settings.tsx), 14–86; [youtube-post-settings.ts](../../../frontend/src/lib/youtube-post-settings.ts), 3–57; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 441–466, 534–535, 873–880.

## 6. Programare și validări

### S01 — alegerea momentului

Data deschide un calendar cu navigare între luni și zi selectată; ora deschide un selector de 24 de ore și minute la interval de 5, păstrând și minutul exact al unei valori existente. În română săptămâna începe luni. Un singur popup este deschis; Escape închide popupul curent înaintea suprafeței părinte.

Fusul orar este explicit: valoarea curentă și lista comună includ Europe/Bucharest, Europe/London, Europe/Paris, Europe/Berlin, America/New_York, America/Los_Angeles, Asia/Dubai, Asia/Tokyo și UTC. Nu se înlocuiește selecția cu o etichetă vagă Local time.

Pagina combină data și ora în fusul ales și transmite un timestamp ISO. Draft și Publish now folosesc momentul curent în payload. Reschedule modifică numai `scheduledAt`. Nu se pretinde că pickerul actual blochează client-side toate datele din trecut: validarea locală verifică existența și interpretarea datei/orei; erorile serverului rămân autoritatea suplimentară.

Surse: [schedule-picker.tsx](../../../frontend/src/components/calendar/schedule-picker.tsx), 28–322; [post-composer.tsx](../../../frontend/src/components/calendar/post-composer.tsx), 50, 168–186; [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 562–564, 682–735.

### V01–V06 — erori și dependențe

| ID | Caz | Prezentare și regulă |
| --- | --- | --- |
| V01 | Câmp invalid | Mesaj lângă câmp; păstrarea valorii; asociere accesibilă. Textul, notele, media și conturile nu dispar. |
| V02 | Opțiuni platformă incomplete | Mesaj rezumat lângă Platform options și eroare în panoul destinației; o cale clară către corectare. |
| V03 | Media incompatibilă | Nume de fișier și/sau platformă; utilizatorul poate schimba media ori destinația. Nu se convertește automat o selecție invalidă într-o alta fără informare. |
| V04 | Upload eșuat | Se disting prea mare, format invalid, limitare de trafic, autentificare, indisponibilitate temporară și eroare generică. Reușitele din lot se păstrează. |
| V05 | Salvare eșuată | Mesaje pentru autentificare, post lipsă, rate limit și eroare generică; butonul revine în stare utilizabilă. |
| V06 | Formular blocat | În curs de upload/save/delete, se evită trimiterea dublă; Published/Publishing nu oferă editor de modificare. |

Draftul nu este fără validare: păstrează verificările de titlu, caption, note, cel puțin o platformă, dată/oră interpretabilă, opțiuni Instagram/Facebook, setări avansate YouTube și copertă TikTok. Poate omite media și consimțământul complet necesar publicării. Schedule și Publish now cer suplimentar media compatibilă, conturi și validările complete ale destinațiilor.

Surse: [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 580–689, 738–807; [publishing-media-utils.ts](../../../frontend/src/components/calendar/publishing-media-utils.ts), 80–91.

## 7. Rezultat, progres și ștergere

### R01 — publicare în curs / rezultat

Un răspuns reușit la Save/Publish actualizează cacheul și întoarce utilizatorul în Publish. Mesajul de pornire nu afirmă că toate destinațiile au publicat. Detaliile publicării păstrează rânduri pe cont și platformă, stadiu, timp scurs, eroare și link când furnizorul l-a oferit.

Stadiile active includ queued, submitting, processing și finalizing. Rezultatul poate fi published fără URL imediat disponibil; nu se inventează un link. Indicatorul procentual existent este derivat din stadii, nu reprezintă un transfer măsurat în bytes. Macheta poate prefera un label de stadiu pentru a evita precizie falsă.

Composerul nu conține un buton autonom Retry publication. Retry-ul de aici înseamnă reîncărcarea datelor/opțiunilor sau retrimiterea formularului păstrat după corectare. Nu se adaugă promisiuni de retry independent pe destinație fără implementare confirmată.

Surse: [post-editor-page.tsx](../../../frontend/src/components/calendar/post-editor-page.tsx), 67–100; [publishing-status-dialog.tsx](../../../frontend/src/components/calendar/publishing-status-dialog.tsx), 23–218.

### D01 — confirmarea ștergerii

- Confirmare explicită cu Keep/Cancel și acțiune distructivă. Se păstrează focusul și starea de lucru.
- Eliminarea din calendar este descrisă separat de ștergerea conținutului de pe o platformă.
- Dacă există destinație Facebook publicată, se oferă o alegere explicită pentru ștergerea și de pe Facebook.
- Dacă există destinație Instagram publicată, mesajul explică necesitatea ștergerii manuale din Instagram.
- Nu se promite ștergere remote universală pe TikTok/YouTube/Instagram. Aceste controale nu există în dialogul curent.
- În timpul publicării, dialogul de progres nu oferă Delete. La eroare, se păstrează mesajul relevant de autentificare, not-found, rate limit sau ștergere nereușită.

Surse: [post-dialog.tsx](../../../frontend/src/components/calendar/post-dialog.tsx), 291–299, 816–841, 1115–1229; [publishing-status-dialog.tsx](../../../frontend/src/components/calendar/publishing-status-dialog.tsx), 205–218.

## 8. Accesibilitate și continuitate

- Focus vizibil semantic, etichete pentru icon-only, selecție comunicată prin text/stare accesibilă, nu doar culoare.
- Restabilirea focusului la deschizător după media/options/preview. Formularele și media au mesaje de stare accesibile; uploadul anunță fișierul curent.
- Reordonare și setări utilizabile prin tastatură. Drag nu este singura metodă.
- Un singur popup contextual activ. Pe mobil, drawerul trebuie să poată fi parcurs și cu tastatura afișată, fără a acoperi definitiv acțiunea de revenire.
- Textul și selecțiile rămân la întoarcerea din media sau opțiuni; Cancel în opțiuni restaurează snapshotul, Done îl acceptă. Nu se inventează autosave la ieșirea din ruta composerului.
- Reduced motion păstrează informația de progres și affordance-urile. Nu se bazează înțelegerea unei stări pe animație.

## 9. Verificare de acoperire a modelului

Aceasta este o verificare documentară; testarea aplicației și publicarea reală nu au fost executate pentru acest livrabil.

| Acoperire | Stare |
| --- | --- |
| Un singur caption public principal; titlu intern derivat; YouTube în opțiuni | Specificat în secțiunile 1, 3 și P04 |
| Composer simplificat pe o coloană; media compactă; o intrare Platform options; Notes opțional | Propunere de prezentare din secțiunile 1 și 3, conform celei mai recente cereri a utilizatorului |
| Preview vizual distinct per platformă, cu controalele sale native ca reprezentare | Cerință nouă explicită în secțiunea 3 și PLATFORM-PREVIEWS; fără mutații sociale sau engagement inventat |
| Borduri foarte rare, grupare prin spațiu și aliniere | Contractul vizual din secțiunea 1; focusul și erorile rămân vizibile |
| Desktop și mobil cu shellul actual | Specificat în secțiunea 2; verificat prin componente și CSS |
| Draft / Schedule / Publish now / edit / loading / locked / error | C01–C12, S01 și V01–V06 |
| Ambele surse media, paginare, upload, eșec parțial, reordonare, preview | M01–M11 |
| Editare foto, alt text, tags și limite pe destinații | Secțiunea 4 |
| Toate setările montate ale celor patru platforme | P01–P04 |
| Consimțământ, audit YouTube și capabilități TikTok | P03–P04 |
| Progres pe cont, rezultat fără link și erori | R01 |
| Ștergere locală vs Facebook vs Instagram manual | D01 |
| Comportament verificat în browser / upload / API extern | Nu a fost executat; necesită implementare și fixture izolat ulterior |

Pentru o eventuală implementare, se verifică aceste stări în mediul izolat al proiectului, inclusiv selecția nativă de fișiere pe mobil, păstrarea draftului local între subvederi, răspunsurile de eroare, identitatea DOM a shellului și Fast Refresh. O machetă nu dovedește funcționarea acestor interacțiuni.
