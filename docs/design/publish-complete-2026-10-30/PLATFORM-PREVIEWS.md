# Publish — contractul previzualizărilor sociale

Data verificării: **30 octombrie 2026**. Cerința utilizatorului este ca previzualizarea să reproducă interfața platformei alese, inclusiv apreciere, comentarii și distribuire. Este o completare vizuală autorizată explicit pentru acest model; nu înseamnă că integrarea există deja sau că Sneep Cut primește funcții sociale noi.

## Fidelitate și limitele dovezilor

Ținta este fidelitatea față de o referință identificată: platformă, tip media, variantă mobilă, dată și stare a playerului. Nu combinăm iconuri din versiuni diferite într-un singur player generic. Cerința de fidelitate rămâne valabilă; unde nu avem o captură inspectată, geometria exactă rămâne de verificat, nu se declară confirmată.

Interfața reală poate varia după versiune, dispozitiv, regiune, funcții activate și descriere extinsă. Un anunț oficial confirmă controalele descrise, dar o ilustrație de marketing nu certifică fiecare distanță sau dimensiune. Copiem interfața observabilă, fără fundalul promoțional, adnotări ori elemente mărite pentru prezentare.

Aceste precizări apar în documentația de design. În produs este suficientă eticheta exterioară **Preview** și selectorul platformei; nu încărcăm fiecare vizualizare cu disclaimere repetate.

## Dovezi și referințe

| Platformă | Dovezi disponibile | Starea verificării vizuale |
| --- | --- | --- |
| Instagram Reels | [Meta, 6 august 2025](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/): repost pentru postări publice și Reels; taburile Reels/Friends sus. [Captură oficială](https://about.fb.com/wp-content/uploads/2025/08/04_Friends.jpg?resize=960%2C836), [copie locală inspectată](references/instagram-friends-2025.jpg). | Două stări complete: Reels obișnuit în stânga, Friends în dreapta. Coloana dreaptă: inimă, comentarii, repost, distribuire cu avion de hârtie, meniu, miniatură audio. Jos-stânga: avatar, cont, Follow, Original audio și caption. Bulele prietenilor apar numai în starea Friends. |
| Facebook Reels | [Meta, 7 octombrie 2025](https://about.fb.com/news/2025/10/finding-sharing-reels-facebook-just-got-easier-more-fun/). [GIF oficial din corpul articolului](https://about.fb.com/wp-content/uploads/2025/10/02_Search-Pills.gif?resize=960%2C836), [primul cadru inspectat](references/facebook-reels-2025.jpg). | Sus: For you / Explore, profil și căutare. Dreapta: thumbs-up, comentarii, distribuire; meniul la nivelul captionului. Jos-stânga: avatar, cont, Follow, apoi caption. Banda de căutare sugerată este condițională. Cadrul nu arată un tile audio; nu adăugăm unul prin analogie cu Instagram. |
| TikTok video | [TikTok, 8 decembrie 2025](https://newsroom.tiktok.com/new-ways-for-friends-and-families-to-discover-share-and-connect-on-tiktok?lang=en), [captură For You inspectată](references/tiktok-for-you-dec2025.png), [captură Shared Feed inspectată](references/tiktok-shared-feed-dec2025.png). | Dreapta: avatar cu follow, inimă, comentarii, bookmark, distribuire, element circular pentru sunet; caption jos-stânga. Taburile regionale și suprapunerile de chat din Shared Feed nu se importă în preview-ul obișnuit. Titlul audio nu este verificat în aceste capturi și nu se inventează. |
| YouTube Shorts | [YouTube, 25 iunie 2026](https://blog.youtube/news-and-events/youtube-shorts-experience-updates-features/), [imagine oficială locală](references/youtube-shorts-june-2026.png). | Textul și imaginea au fost inspectate. Inimă, comentarii, distribuire, Remix, apoi tile-ul pentru sunet în coloana dreaptă; fără dislike. Imaginea include un callout mărit, care nu se copiază ca o capsulă nativă a playerului. |

Machetele video au fost generate și inspectate comparativ cu dovezile de mai sus. Ele reprezintă suprapunerile postării în Preview Sneep Cut, nu capturi complete ale aplicațiilor native. Selectorul comun prezintă toate patru platformele pentru comparația designului; în produs sunt disponibile numai destinațiile selectate ale postării.

| Machetă | Stare |
| --- | --- |
| [05 — Instagram](05-instagram-preview.png) | Ordinea comenzilor verificată; contorul distribuirii corectat, scrubberul fără dovadă eliminat |
| [06 — TikTok](06-tiktok-preview.png) | Profil/follow, heart, comentarii, bookmark, share și audio circular verificate |
| [07 — YouTube](07-youtube-preview.png) | Setul de comenzi Shorts 2026 verificat; fără dislike sau capsula promoțională |
| [08 — Facebook](08-facebook-preview.png) | Thumbs-up, comentarii și share verificate; meniul corectat la nivelul captionului |

Traseele iconurilor, dimensiunile și spațierile din raster rămân aproximative. Referințele inspectate sunt ținta pentru implementare; imaginile generate nu certifică identitate pixel cu pixel. Variantele foto/carusel/video obișnuit de mai jos necesită capturi proprii înainte de a declara aceeași fidelitate.

YouTube anunță trecerea de la thumbs-up la inimă și retragerea dislike, cu lansare treptată. Clear Screen poate ascunde suprapunerile în aplicația sursă; nu devine automat un control nou Sneep Cut. [Sursă](https://blog.youtube/news-and-events/youtube-shorts-experience-updates-features/)

Pentru Facebook, [playerul oficial din 2024](https://about.fb.com/news/2024/04/exploring-videos-on-facebook-just-got-easier/) documentează vizualizarea verticală fullscreen, scrubber jos și controale de redare afișate la atingere. [Actualizarea Feed din decembrie 2025](https://about.fb.com/news/2025/12/making-it-easier-to-create-discover-and-share-content-on-facebook/) documentează grilele pentru postările cu mai multe fotografii. Aceste contexte nu se înlocuiesc reciproc.

## Alegerea rendererului după tipul media

Se folosește formatul real al postării și destinația acceptată de implementare, conform [inventarului funcțional](FUNCTIONALITY.md) și [composerului](COMPOSER.md). Selectarea unei platforme nu transformă fișierul în alt tip de publicație.

| Platformă și media acceptată | Prezentarea cerută |
| --- | --- |
| Instagram — video/Reel | Player Reels cu suprapunerile și ordinea controalelor din cadrul ales; cont și caption ale postării. Nu se folosește structura unei postări foto. |
| Instagram — imagine/carusel | Structură de postare în Feed, media în proporția efectivă și comenzile corespunzătoare sub media. Pentru carusel se păstrează ordinea, poziția curentă și navigarea existente. Geometria exactă a acestei variante necesită propria referință. |
| Facebook — Reel/video în context Reels | Playerul Facebook verificat, inclusiv propriile iconuri și metadate. Bulele prietenilor, căutările sugerate sau alte elemente condiționale nu devin ornamente permanente ale unei postări noi. |
| Facebook — fotografie/postare cu fotografii | Structură Feed cu identitatea contului, text, media și acțiunile postării. Mai multe fotografii folosesc prezentarea specifică Feed; nu se aplică automat coloana Reels. Referința exactă a stării foto trebuie verificată separat. |
| TikTok — video | Contextul video TikTok verificat, cu identitatea creatorului, caption, sunet și comenzile native. Nu se reutilizează overlay-ul Instagram doar schimbând sigla. |
| TikTok — fotografii | Context photo/carousel corespunzător, cu ordinea și poziția imaginilor. Nu se desenează controale video sau durată inventată. Captura exactă pentru photo rămâne de verificat. |
| YouTube — Short eligibil | Interfața Shorts din referința din iunie 2026: inimă, comentarii, distribuire, Remix și tile de sunet; fără dislike. Eligibilitatea se bazează pe media și regulile reale, nu doar pe numele platformei. |
| YouTube — alt video acceptat | Preview video obișnuit în proporția fișierului și contextul corespunzător. Nu se etichetează automat Shorts și nu se decupează forțat la 9:16. Geometria playerului obișnuit necesită referință separată. |

Nu se introduc tipuri media sau setări de export care lipsesc din implementare. Nu folosim un crop universal 9:16: un fișier orizontal, pătrat sau fotografie își păstrează conținutul și transformările deja alese. Orice decupare specifică unei suprafețe trebuie susținută de referința acelei suprafețe și nu modifică fișierul sursă.

## Datele din preview

- **Cont:** identitatea destinației efective, când este disponibilă. Lipsa avatarului folosește fallback neutru; nu se inventează un handle sau un badge verificat.
- **Text:** captionul public al postării și, unde este necesar, metadatele reale ale platformei. Titlul intern nu devine un al doilea caption. Trunchierea imită referința; textul complet rămâne în editor.
- **Media:** fișierul/clipul, ordinea caruselului și editările reale. Loading, lipsa sursei și eroarea păstrează stările existente, fără o imagine generată care ar masca problema.
- **Sunet:** numele se afișează numai când este cunoscut. Elementul vizual cerut de referință nu justifică inventarea unui artist, a unei melodii sau a unei licențe.
- **Numărători:** preview-ul nu citește engagement. Dacă sunt necesare pentru geometria machetei, se folosește `0` ca valoare demonstrativă consemnată aici; nu este statistică reală și nu înlocuiește o valoare încărcată. Fără `1.2K`, like-uri simulate sau promisiuni despre rezultate.

## Interacțiuni și prezentare

1. Selectorul schimbă exclusiv contextul vizual al preview-ului, dintre destinațiile relevante. Nu schimbă conturile selectate, platformele de publicare, captionul, programarea sau datele de salvat.
2. Like, comment, share, follow/subscribe, repost și Remix reproduc aspectul interfeței sursă. Sunt suprapuneri de simulare, fără mutații sociale, cereri API, ferestre de comentarii sau navigare nouă. Nu intră în ordinea de tabulare ca acțiuni funcționale.
3. Controalele Sneep Cut existente pentru redare, extindere, închidere și carusel rămân funcționale și accesibile. Overlay-ul nu interceptează comenzile reale ale playerului. Previzualizarea nu oferă impresia că un buton social inactiv poate publica sau distribui.
4. Shellul exterior păstrează tokenii Sneep Cut: acțiuni monocrome, raze md/sm, spațiere în locul bordurilor. În interiorul simulării, iconurile, culorile, tipografia și geometria platformei urmează referința, conform cerinței explicite de fidelitate; nu se rebranduiesc ca Sneep Cut.
5. Previzualizarea este conținutul unei suprafețe existente, nu o aplicație socială nouă. Nu se dublează navigația globală; nu adăugăm un dock social permanent sau pagini de feed/profil. O captură completă de telefon poate rămâne dovadă în documentație, fără a-i importa întreaga navigație în produs.
6. La schimbarea platformei sau închiderea preview-ului se păstrează textul, media și opțiunile editorului. Pe mobil, selectorul și revenirea sunt accesibile fără micșorarea ilizibilă a întregii interfețe desktop.

## Relația cu implementarea existentă

[PostComposerPreview](../../../frontend/src/components/calendar/post-composer-preview.tsx) are un selector local de platformă, dar redă aceeași componentă media; acesta nu dovedește existența preview-urilor cerute. [SocialPreviewOverlay din Brand Kit](../../../frontend/src/components/dashboard/brand/social-preview-overlay.tsx) oferă un exemplu de separare media/overlay, însă folosește cont, caption și numărători demonstrative. Este reper de arhitectură, nu referință oficială de fidelitate, și nu se copiază ca atare.

Modelul cere separarea dintre media, datele postării și prezentarea specifică platformei. Nu prescrie duplicarea playerelor, biblioteci noi sau schimbări ale API-urilor. Implementarea și verificarea funcțională rămân distincte de această documentație și de imaginile statice.

## Criterii de verificare

- Pentru fiecare variantă declarată fidelă: sursă, dată, cadru local inspectat și comparație vizuală la aceeași proporție; iconurile, ordinea, captionul și zonele suprapuse corespund.
- Pentru variantele fără captură inspectată: starea rămâne explicit „de verificat”; nu se prezintă geometria generată ca dovadă.
- Video vertical/orizontal, imagine și carusel folosesc contextul corect, fără crop forțat sau pierderea editărilor.
- Identitatea și captionul provin din postare; numărătorile demonstrative nu sunt prezentate drept engagement real.
- Schimbarea preview-ului nu modifică destinațiile sau datele de salvat și nu produce cereri sociale.
- Focusul, închiderea, redarea și caruselul funcționează separat de overlay; shellul dashboardului își păstrează starea.

Acest fișier stabilește contractul de design. Nu raportează publicări reale, teste în conturi sociale sau implementarea noilor renderere.
