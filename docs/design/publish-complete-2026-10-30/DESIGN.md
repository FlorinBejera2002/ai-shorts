# Publish — model simplificat

**Revizie: 30 octombrie 2026. Propunere vizuală, neimplementată.**

Aceasta înlocuiește prima explorare din această conversație, respinsă de utilizator ca prea complicată, prea mult text și prea apropiată de interfața actuală. Noua cerință explicită are prioritate asupra structurii desktop cu media în stânga din referința mai veche.

**O listă simplă. Un composer compact. Opțiuni numai când sunt necesare.** Ultimul feedback cere explicit trei completări ale modelului: All implicit și filtre după status, borduri foarte rare, preview vizual fidel fiecărei platforme. All și suprapunerile sociale specifice sunt cerințe noi autorizate, nu comportamente deja implementate. Nu se adaugă alte capabilități de produs.

- [Machete revizuite](README.md)
- [Inventarul Publish, conturi și status](FUNCTIONALITY.md)
- [Inventarul complet al composerului și providerilor](COMPOSER.md)
- [Sursele DESIGN.md și adaptarea lor](SOURCES.md)
- [Referințe și contract pentru preview-urile sociale](PLATFORM-PREVIEWS.md)

## 1. Direcție vizuală

Conținut plat, aliniat, fără carduri în carduri. **Spațiu, aliniere și tipografie; de regulă nimic între secțiuni.** Bordurile și separatoarele sunt excepții, nu sistemul de organizare. Fără linii între postări, sub toate taburile, în jurul atașamentului sau între Platform options și Notes. Nu afișăm inventarul complet al funcțiilor în primul ecran.

Diferențele față de versiunea actuală sunt structurale: lista ocupă toată lățimea, preview-ul permanent dispare, composerul desktop devine o singură coloană, iar media este un atașament compact.

Păstrăm shell-ul, logo-ul, culorile semantice și fonturile proiectului. Nu adăugăm navigație, branding repetat sau controale decorative.

## 2. Culori și raze

Acțiuni și selecții prin `foreground/background`, hover prin `muted`, focus prin `foreground`. Fără albastru ca accent. Mărcile sociale autentice și logo-ul violet rămân colorate.

| Rol | Dark | Light | Token folosit |
| --- | --- | --- | --- |
| Canvas | #101218 | #ffffff | `--background` |
| Text / primary | #e8ebf2 | #1c2029 | `--foreground` |
| Hover | #242935 | #ebeef3 | `--muted` |
| Text secundar | #a0a9bb | #646d7d | `--muted-foreground` |
| Separator | #2b303d | #dfe3eb | `--border` |

Valorile sunt instantaneul dashboard-ului din [studio-shell.css](../../../frontend/src/components/dashboard/studio-shell.css). Nu se copiază drept constante în componente.

`rounded-md` / `--radius-md`: controale, carduri, upload, popups și preview. `rounded-sm` / `--radius-sm`: badge-uri text și elemente interioare. `rounded-full`: numai cercuri și controalele de progres prevăzute în AGENTS. Se reutilizează Card implicit. În interiorul postării sociale simulate, geometria nativă Follow/Subscribe urmează platforma; excepția cerută de fidelitatea preview-ului este documentată în AGENTS. Ea nu schimbă controalele Sneep Cut.

## 3. Tipografie și spațiere

Sora pentru titluri, Manrope pentru corp, conform direcției aprobate. Titlu 28–32px desktop / 24px mobil; corp 14–16px; metadata 13–14px. Fără subtitluri descriptive sub Publish sau New post.

Grilă: 4/8/12/16/24/32px. Gutters 24–32px desktop, 16px mobil. Composer de aproximativ 680–760px pe desktop, într-o coloană. Nu mărim media sau textarea pentru a umple spațiul gol.

## 4. Publish — primul ecran

Doar:

1. **Publish**, **Accounts**, **New post**.
2. **All / Drafts / Scheduled / Publishing / Published / Failed**, cu **All implicit**.
3. Luna, săgețile anterior/următor și **Today**.
4. Rânduri cu thumbnail mic, titlu, platforme, dată/stare și chevron.

Accounts deschide dialogul existent Manage accounts. Eliminăm banda permanentă de conturi din suprafața implicită; erorile conturilor rămân semnalate contextual lângă control.

All include toate cele cinci statusuri din luna selectată. Nu înseamnă întreg istoricul: încărcarea actuală are interval calendaristic și limită de rezultate, documentate în FUNCTIONALITY. All se ordonează descrescător după scheduledAt, stabil la egalitate; Scheduled păstrează ordinea cronologică crescătoare. Filtrele pe status sunt exacte: Publishing și Failed nu mai sunt grupate sub Scheduled în noul model.

Un rând deschide detaliul și preview-ul. Back întoarce utilizatorul în listă. Propunem folosirea prezentării listă → detaliu deja existente pe mobil și pe desktop. Acest model nu este încă implementat.

În detaliu rămân media, caption, platforme, data/fusul orar și Edit post sau View status, în funcție de stare. La previzualizarea socială, contul și textul real al postării intră în suprapunerile platformei. Nu adăugăm meniu nou de acțiuni al postării; meniurile/iconurile native din imaginea socială sunt doar context vizual.

În All, fiecare rând arată statusul prin text discret, fără badge sau contur. Failed poate folosi culoarea semantică de eroare. Într-un filtru exact, eticheta repetitivă poate fi omisă. Pe mobil, taburile au scroll orizontal și text lizibil; nu comprimăm șase etichete ca să încapă artificial.

## 5. New post — suprafața implicită

O singură coloană pe desktop și mobil:

| Element | Conținut |
| --- | --- |
| Header | Back + New post / Edit post |
| Conturi | Iconuri compacte, selecție cu check, identitate reală; conturile aceleiași platforme rămân distincte |
| Post text | Un singur câmp public, contor discret |
| Media | Thumbnail compact, durată când există, Preview extins cu platforma selectabilă și Change media |
| Opționale | O singură intrare Platform options; Notes în disclosure |
| Mod | Draft / Schedule / Publish now |
| Programare | Dată, oră și timezone numai în Schedule |
| Footer | Acțiunea modului; Cancel și Save draft unde se aplică; Delete numai în editarea permisă |

Pe mobil, eticheta Change media poate deveni Change; numele accesibil rămâne complet. Back oferă ieșirea existentă. Formularul și selecțiile rămân controlate de aceeași logică.

Titlul intern se derivă conform logicii existente; nu introducem un al doilea editor public. Titlul și descrierea YouTube și titlul Facebook Reel rămân în setările providerului. Notes este câmpul intern existent.

**Consimțămintele TikTok/YouTube rămân în panourile lor**, fără paragrafe repetate în formularul principal. Nu sunt eliminate și nu se acceptă automat. Erorile reale apar lângă Platform options și în câmpul relevant.

## 6. Funcțiile existente, accesibile la cerere

| Intrare | Ce păstrăm |
| --- | --- |
| Change media | My clips + From device; căutare/paginare în biblioteca de clipuri; upload și erori; selecție, remove și reorder |
| Editarea imaginilor existentă | Original/1:1/4:5/1.91:1, poziție x/y, zoom/reset, alt text și tags unde sunt acceptate |
| Platform options | Numai platformele selectate, setările reale și capabilitățile contului; Done păstrează modificările, Cancel restaurează snapshot-ul |
| Accounts | Connect/reconnect/disconnect și confirmare, stări indisponibile, acord YouTube |
| View status | Rezultat pe cont, progres pe etape, erori, link numai când există; published fără link rămâne valid |
| Delete | Confirmarea existentă; eliminarea din planner distinctă de opțiunea Facebook și de ștergerea manuală Instagram |

Toate limitele și condițiile sunt în [COMPOSER.md](COMPOSER.md) și [FUNCTIONALITY.md](FUNCTIONALITY.md). Ele sunt documentație de design/implementare, **nu texte de introdus în interfață**.

În afara completărilor solicitate acum, nu includem search sau filtre arbitrare pe lista Publish, grid calendar, bulk actions, auto-schedule, autosave, AI rewrite, generator de hashtags, readiness score, retry individual pe destinație, locații autocomplete, dropdown de cont în opțiunile Facebook sau video trim.

### Preview specific platformei

Preview extins schimbă efectiv suprapunerile atunci când se schimbă platforma: cont, caption, audio disponibil, apreciere, comentarii, distribuire și celelalte elemente verificate pentru formatul ales. Selectarea preview-ului nu schimbă conturile de publicare sau media. Se păstrează numai platformele selectate în composer.

Nu folosim aceeași coloană generică de iconuri pentru toate platformele. Instagram, Facebook, TikTok și YouTube au referințe și reguli distincte în PLATFORM-PREVIEWS. Se reproduce suprafața postării, nu navigația globală a aplicației sociale. Pentru fotografii, carusele și video obișnuit se folosește formatul potrivit; nu se aplică automat chrome Reels/Shorts.

Like/comment/share sunt elemente ale simulării vizuale: nu trimit acțiuni către conturi, nu au click-uri înșelătoare și nu creează statistici. Zero, dacă apare în machetă, reprezintă starea demonstrativă a unei postări încă nepublicate, nu date citite din API. Fidelitatea este raportată la sursa și versiunea inspectate; rollout-urile și variantele platformelor nu permit promisiunea de identitate universală.

Nu promitem restaurarea lunii/tabului/scrollului după întoarcerea din ruta editorului: codul actual nu o demonstrează. Păstrăm comportamentul real și documentăm limita.

## 7. Regula pentru text și stări

Un control intuitiv primește o etichetă, nu o explicație. Fără descrieri sub fiecare switch, rezumate repetitive, liste de avantaje, numărători decorative sau tutorial permanent.

Text suplimentar apare numai pentru:

- eroare și acțiunea de recuperare;
- restricție a contului/platformei care nu este evidentă;
- consimțământ obligatoriu;
- consecință de ștergere sau disconnect;
- stare goală ori lipsa unui rezultat/link.

Loading, erorile, lipsa media, eșecul thumbnailului, rezultatele trunchiate și publicarea parțială rămân accesibile. Simplificarea nu ascunde o problemă pentru a păstra ecranul curat.

## 8. Mobil, accesibilitate și mișcare

Publish/New post/options/media folosesc header-ul existent cu hamburger, logo și asistent global. Dock-ul dashboard-ului este ascuns de cod pe aceste suprafețe; nu îl desenăm din nou.

Pe mobil rândurile listei se recompun cu platformele și data sub titlu. Composerul rămâne într-o coloană. Data și ora pot ocupa aceeași linie; timezone rămâne lizibil. Sheet-urile scroll-ează între header și footer. Safe area și tastatura nu trebuie să acopere ultimul control.

Ținte tactile minimum 44×44px, focus vizibil, etichete accesibile, tab order logic, Escape/Back și revenire la trigger, erori asociate câmpurilor. Iconurile de acțiune Sneep Cut fără text au nume accesibil; iconurile sociale din simulare nu devin butoane funcționale. Drag păstrează alternativa de tastatură existentă. Lipsa bordurilor decorative nu elimină focusul; câmpurile pot avea umplere discretă, iar conturul de focus apare la interacțiune.

Hover 120–150ms, disclosure 150–200ms, Sheet 200–300ms, cu mișcare redusă respectată. Fără animații decorative noi. Sidebar-ul/header-ul rămân montate la navigare; Fast Refresh rămâne pe componentă.

## 9. Ghid de implementare ulterioară

> Aplică machetele revizuite din acest director: All implicit, filtre exacte pe status, borduri foarte rare și preview-uri sociale specifice platformei. Folosește lista→detaliu existentă, composerul controlat și dialogurile existente. Un singur text public, atașament compact, setări și consimțăminte la cerere, texte numai când sunt necesare. Respectă AGENTS, tokenii md/sm și inventarele FUNCTIONALITY/COMPOSER/PLATFORM-PREVIEWS. Nu adăuga alte capabilități, acțiuni sociale reale, API-uri sau stări de succes fictive.

Machetele sunt raster, nu măsurători CSS ori verificare funcțională. La implementare se păstrează iconurile și componentele reale, se recalculează contoarele și se măsoară contrastul, responsive, focusul și comportamentul. În acest task nu s-au modificat componentele aplicației și nu s-au efectuat publicări, conectări OAuth sau uploaduri reale.
