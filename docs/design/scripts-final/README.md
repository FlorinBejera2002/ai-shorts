# Scripts — galerie de design

Data: **23 octombrie 2026**. **28 de imagini în 14 perechi desktop/mobil**, generate cu instrumentul ImageGen integrat. Utilizatorul a selectat această galerie ca referință pentru redesign pe **23 octombrie 2026**. Imaginile rămân machete statice în stilul Sneep Cut salvat; implementarea folosește componentele și tokenurile comune ale aplicației. Scenariul „A better morning routine”, conturile, textele și versiunile ilustrate sunt demonstrative.

Surse vizuale: [New post aprobat](../assets/new-post-approved-2026-10-22.png) și [ghidul Sneep Cut](../publishing-design.md). Păstrăm suprafețele întunecate, acțiunile alb/negru, tipografia Manrope/Sora și razele md/sm. Culorile de stare din surse sau marcajele accidentale generate nu înlocuiesc tokenurile proiectului; numai Scripts apare selectat în navigarea globală.

## Ecrane și briefuri ImageGen

| Stare | Desktop | Mobil | Brief |
| --- | --- | --- | --- |
| Bibliotecă | [Desktop](desktop-library.png) | [Mobil](mobile-library.png) | Căutare, Show archived, New script și carduri lizibile cu titlu, status, revizie, platformă și dată. |
| Bibliotecă goală | [Desktop](desktop-library-empty.png) | [Mobil](mobile-library-empty.png) | Your script library is ready și New script, fără acțiuni sau date inventate. |
| Arhivate vizibile | [Desktop](desktop-library-archived.png) | [Mobil](mobile-library-archived.png) | Show archived activ și înregistrări care pot fi deschise, fără filă Archive sau buton Unarchive nou. |
| Brief | [Desktop](desktop-brief.png) | [Mobil](mobile-brief.png) | Topic/Idea, platformă, durată, limbă, ton, stil și public, cu Generate script clar. |
| Alegerea platformei | [Desktop](desktop-platform-options.png) | [Mobil](mobile-platform-options.png) | Selectorul deschis cu cele patru platforme existente, în contextul brief-ului. |
| Generare în curs | [Desktop](desktop-generating.png) | [Mobil](mobile-generating.png) | Editorul și valorile rămân vizibile; butonul arată Generating… și este dezactivat. |
| Document | [Desktop](desktop-document.png) | [Mobil](mobile-document.png) | Titlu, hook, scene, call to action, caption și hashtags, cu salvarea automată vizibilă. |
| Editarea unei scene | [Desktop](desktop-scene-editor.png) | [Mobil](mobile-scene-editor.png) | Visual, Dialogue, Camera, Transition și Text overlay, cu mutare, ștergere și Add scene. |
| Istoric de versiuni | [Desktop](desktop-versions.png) | [Mobil](mobile-versions.png) | Listă inline de versiuni; Restore doar pentru versiuni mai vechi, fără dialog. |
| Coach — Studio | [Desktop](desktop-coach-studio.png) | [Mobil](mobile-coach-studio.png) | Vizualizarea Studio a scenei 3D, controale de redare, timeline și indicatori informativi. |
| Coach — Camera | [Desktop](desktop-coach-camera.png) | [Mobil](mobile-coach-camera.png) | Aceeași scenă din perspectiva camerei, fără a sugera un videoclip generat. |
| Coach — Plan | [Desktop](desktop-coach-plan.png) | [Mobil](mobile-coach-plan.png) | Vedere de sus pentru planificarea scenei, păstrând timeline-ul și controalele existente. |
| Eroare la salvare | [Desktop](desktop-save-error.png) | [Mobil](mobile-save-error.png) | Save failed și Retry save în bara editorului, cu modificările păstrate. |
| Eroare la generare | [Desktop](desktop-generation-error.png) | [Mobil](mobile-generation-error.png) | Toast de eroare peste editorul păstrat; Generate script revine disponibil, fără pagină separată sau Retry nou. |

## Structură și comportamente reale

Biblioteca și editorul sunt două vizualizări locale ale aceleiași rute, `/dashboard/script-generator`. Cele 14 stări nu introduc rute sau file globale noi. Layout-ul dashboard-ului, sidebar-ul, header-ul și starea lor trebuie păstrate.

- **Bibliotecă:** Search, Show archived și New script; cardurile se deschid direct. Nu se adaugă meniu cu puncte, sortare, filtre suplimentare, duplicare sau ștergere definitivă. Show archived include înregistrările active împreună cu cele arhivate; arhivarea schimbă statusul în archived, afișat pe card. Înregistrările arhivate pot fi deschise; nu există control Unarchive. Mesajul Your script library is ready este folosit în cod și pentru căutarea fără rezultate.
- **Scenariu nou:** New script creează mai întâi o ciornă pe server, apoi deschide editorul. Brief-ul este inițializat cu TikTok, 30 de secunde, engleză, ton `entertaining`, stil `talking_head` și status `draft`; topicul și publicul sunt goale. Crearea ulterioară poate prelua valorile brief-ului curent, deci nu presupunem resetarea lor automată.
- **Brief:** Topic/Idea are maximum 1.000 de caractere. Platforma este obligatorie: TikTok, Instagram Reels, Facebook sau YouTube Shorts. Duratele sunt 15/30/45/60/90/120/180 de secunde; limbile sunt EN/RO/ES/FR/DE/IT/PT. Tonul, stilul video și publicul sunt câmpuri text, nu cataloage noi de opțiuni.
- **Generare:** sunt necesare topicul și o platformă suportată. Încărcarea se exprimă prin butonul Generating… dezactivat; nu se inventează progres procentual, etape, cronometru sau blocarea întregii pagini. Eșecul este comunicat prin toast, păstrând editorul; nu se introduce un ecran de eroare ori un buton Retry separat.
- **Salvare:** modificările declanșează autosave după aproximativ 900 ms. Păstrăm Saving…, Saved vN și Save failed cu Retry save; draftul rămâne disponibil la eroare. Nu se adaugă o bară permanentă Save/Discard.
- **Bara editorului:** All scripts, status, Versions, Copy, Download JSON și Archive. Cele șase statusuri sunt idea, draft, review, ready, in_production și published. Archive revine la bibliotecă, fără dialog de confirmare; nu devine ștergere definitivă.
- **Document:** titlul și hook-ul sunt editabile, la fel call to action, caption și hashtags. Hashtags acceptă valori separate prin virgulă. Durata totală și numărul scenelor sunt metadate informative.
- **Scene:** Visual, Dialogue, Camera, Transition și Text overlay sunt editabile. Păstrăm Move up/Move down, Delete scene și Add scene; mutarea în afara listei este dezactivată. Durata scenei rămâne metadată, nu un câmp nou de editare.
- **Versiuni:** istoricul se extinde inline în editor. Restore este disponibil pentru versiunile mai vechi; versiunea curentă nu primește aceeași acțiune. Nu se adaugă modal, comparație de versiuni sau alte operații neimplementate.
- **Shooting Coach:** Studio, Camera și Plan schimbă perspectiva aceleiași scene 3D. Restart, Play/Pause, Mute/Unmute și timeline-ul rămân disponibile; indicatorii sunt read-only. Acest preview nu este un videoclip generat. Nu se adaugă editor de durată, muzică sau obiectiv, nici panouri Equipment/Filming tips doar pentru că astfel de câmpuri există în modelul de date.

## Mobil și limite

Pe mobil, fiecare stare este recompusă pentru o singură coloană și derulare focalizată. Brief-ul, documentul, versiunile și Coach-ul păstrează ordinea și valorile lor, fără a micșora mecanic layout-ul desktop. Controalele rămân accesibile, versiunile rămân inline, iar alegerea platformei rămâne un selector. Nu se adaugă dialoguri sau navigare permanentă nouă.

Redesignul implementează brief-ul pliabil pe mobil, scenele compacte, istoricul inline și Coach-ul focalizat, fără rute noi. Call to action, caption și hashtags continuă mai jos în document; un viewport focalizat nu le elimină. Indicatorul Saved este informativ, chiar dacă ImageGen îi desenează un contur asemănător unui buton. Contorul 41/1000 din unele imagini este un artefact: topicul demonstrativ are 40 de caractere; nu se copiază acea valoare fixă în implementare.

Galeria acoperă cele 14 stări definite pentru acest redesign, nu toate combinațiile posibile de conținut și răspunsuri ale serverului. Imaginile nu demonstrează generarea, autosave, restaurarea versiunilor, copierea, descărcarea sau redarea Coach-ului. Nu au fost create ori arhivate înregistrări reale prin acest pachet; implementarea și verificarea funcțională rămân separate.

## Verificarea implementării

Componentele se află în `frontend/src/components/script/`. `frontend/tests/scripts-layout.browser.mjs` verifică fluxurile cu API-uri simulate și cont sintetic, inclusiv autosave/retry, generare, scene, versiuni, export, arhivare, cele trei perspective Coach și păstrarea shell-ului/Fast Refresh. `frontend/tests/scripts-preview.mjs` oferă o previzualizare locală separată cu date exclusiv sintetice. Coach-ul rămâne o proiecție geometrică din datele scenei; lumina și materialele randate în machetele ImageGen nu sunt un videoclip sau active statice folosite în aplicație.
