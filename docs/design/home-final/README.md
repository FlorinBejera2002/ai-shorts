# Home — galerie de design

Data: **23 octombrie 2026**. **16 imagini în 8 perechi desktop/mobil**, generate cu instrumentul ImageGen integrat în stilul Sneep Cut salvat. Sunt propuneri statice pentru revizie, **neimplementate și neaprobate încă de utilizator**. Clipurile, statisticile și contul Alex Morgan din imagini sunt demonstrative.

Surse vizuale: [New post aprobat](../assets/new-post-approved-2026-10-22.png), [Publish](../assets/publish-reference-2026-10-22.png) și [ghidul Sneep Cut](../publishing-design.md). Home păstrează un titlu compact și acțiunile utile, fără titlul supradimensionat și descrierea lungă ale vechiului hero. Layout-ul folosește suprafețe întunecate, acțiuni alb/negru și tipografia Manrope/Sora.

## Ecrane și briefuri ImageGen

| Stare | Desktop | Mobil | Brief |
| --- | --- | --- | --- |
| Privire de ansamblu | [Desktop](desktop-overview.png) | [Mobil](mobile-overview.png) | Home compact, New clip și Open library, patru statistici și primele patru clipuri recente; pe telefon se păstrează dockul existent. |
| Cont fără conținut | [Desktop](desktop-empty.png) | [Mobil](mobile-empty.png) | Hero și statistici 0/0/0/360, cu stare goală pentru clipuri și fără carduri inventate. |
| Zero credite | [Desktop](desktop-zero-credits.png) | [Mobil](mobile-zero-credits.png) | Sold 0, cu New clip și navigarea păstrate; fără paywall sau blocare adăugată pe Home. |
| Credite nelimitate | [Desktop](desktop-unlimited.png) | [Mobil](mobile-unlimited.png) | Available credits afișează ∞; celelalte statistici și clipurile rămân lizibile. |
| Previzualizare lipsă | [Desktop](desktop-missing-preview.png) | [Mobil](mobile-missing-preview.png) | Card fără thumbnail cu pictograma Film și No preview, păstrând metadatele și linkul către editor. |
| Încărcare inițială | [Desktop](desktop-loading.png) | [Mobil](mobile-loading.png) | Conținutul rutei arată indicatorul de încărcare; cadrul aplicației și dockul mobil rămân montate. |
| Eroare de încărcare | [Desktop](desktop-load-error.png) | [Mobil](mobile-load-error.png) | Unable to load this page. și Try again, fără hero, statistici sau carduri presupuse. |
| Navigare | [Desktop](desktop-navigation.png) | [Mobil](mobile-navigation.png) | Desktop: Quick navigation cu căutare de pagini; mobil: dialogul real Menu cu legăturile secundare. |

## Datele ilustrate

Exemplul principal folosește **24 de clipuri**, **6 proiecte**, **18 minute video** și **360 de credite**. Badge-ul Recent clips arată **6**, iar grila redă **primele 4** înregistrări primite. Aceste valori sunt compatibile: totalul de 24 de clipuri nu este numărul înregistrărilor recente trimise pentru acest widget.

Ancorele [desktop](desktop-overview.png) și [mobil](mobile-overview.png) păstrează următoarele carduri, toate cu rezoluția 1080 × 1920:

| Titlu demonstrativ | Durată | Scor afișat |
| --- | --- | --- |
| Inside the creative studio | 00:28 | 8.7/10 |
| A better morning routine | 00:42 | 8.3/10 |
| A different perspective | 00:35 | 7.9/10 |
| Make the next cut count | 00:47 | Fără scor |

În starea goală se păstrează 360 de credite, iar numărul de clipuri, proiecte și minute este 0. Zero credits schimbă soldul în 0; Unlimited folosește ∞ în locul unui sold numeric.

## Comportamente de păstrat

- **Structură reală:** ruta `/dashboard` montează StudioHero, StatsBar și RecentClips. Pachetul nu adaugă Activity, Status, plan, Active jobs, grafice, cozi sau organizare pe foldere, care nu sunt montate în Home.
- **Acțiuni:** New clip deschide `/dashboard/create`; Open library și View all deschid `/dashboard/clips`. Primele trei statistici duc la Clips, iar Available credits duce la `/dashboard/billing`.
- **Semnificația statisticilor:** Projects reprezintă numărul de joburi, nu numărul folderelor. Minutele video sunt suma duratelor convertită în minute și rotunjită. Soldul 0 nu dezactivează acțiunea New clip și nu introduce un paywall pe Home.
- **Clipuri recente:** API-ul livrează maximum 6 înregistrări, iar componenta afișează primele 4; badge-ul poate rămâne 6. Cardul întreg deschide editorul clipului. Nu se adaugă player inline, meniu cu puncte sau acțiuni separate de publicare, descărcare ori ștergere.
- **Metadate:** păstrăm titlul, durata, rezoluția și scorul doar când este mai mare decât 0. Un thumbnail lipsă folosește Film și No preview; nu dispare cardul și nu apare un scor fictiv.
- **Încărcare și eroare inițială:** când datele API lipsesc, doar conținutul rutei devine loader sau mesaj cu Try again. Nu se afișează hero, statistici și carduri inventate. O eroare de actualizare când există deja date păstrează Home existent și nu se confundă cu eroarea inițială.

## Navigarea desktop și mobil

Pe desktop se păstrează sidebar-ul și topbar-ul. Quick navigation, accesibil prin **Ctrl K**, caută **pagini**, nu clipuri. Exemplul de navigare folosește interogarea `set`, cu rezultatul Settings.

Pe ecrane sub breakpoint-ul `lg`, aplicația montează deja **MobileDashboardDock**, iar topbar-ul desktop este ascuns. Cele șapte acțiuni sunt **Home, Editor, Clips, New project, Brand, Publish și Menu**. Dockul existent rămâne prezent în toate imaginile mobile Home, inclusiv Loading și Load error; nu se înlocuiește cu un header vechi cu hamburger și nu se inventează altă navigare permanentă.

Menu deschide dialogul existent cu **Scripts, Plan & billing și Settings**. Se păstrează închiderea prin X, fundal, Escape sau alegerea unei legături, precum și blocarea derulării paginii în spate. Perechea Navigation ilustrează aceeași nevoie pe desktop și mobil prin controalele lor reale, fără a impune un control identic pe ambele.

Mockupurile mobile mai vechi nu sunt dovadă pentru cadrul mobil actual; Home se bazează pe componentele montate acum. Navigarea trebuie să păstreze identitatea layout-ului dashboard, sidebar-ului, header-ului și starea lor, schimbând numai conținutul rutei.

## Limitele imaginilor

Se folosesc tokenurile md/sm ale proiectului; formele rotunjite ale dockului sau badge-urilor din imaginile generate nu creează excepții noi. Cercul rămâne potrivit pentru avataruri și pictograme circulare. Marcajele accidentale sau accentele neconforme din imagini nu devin tokenuri de design.

Cele opt perechi acoperă stările definite pentru acest redesign, nu toate combinațiile posibile de date și erori. Nu au fost create, editate sau șterse clipuri reale. Imaginile nu dovedesc funcționarea linkurilor, căutării, dialogului Menu, încărcării ori accesibilității; implementarea și verificarea funcțională rămân separate.
