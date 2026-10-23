# Setări — galerie de design

Data: **23 octombrie 2026**. **36 de imagini în 18 perechi desktop/mobil**, generate cu ImageGen în stilul Sneep Cut salvat. Acestea sunt mockupuri statice pentru revizie, **neimplementate și neaprobate încă de utilizator**. Datele de cont, sesiunile, cheile și codurile ilustrate sunt demonstrative; nu sunt date personale sau secrete reale.

Surse vizuale: [New post aprobat](../assets/new-post-approved-2026-10-22.png), [Publish](../assets/publish-reference-2026-10-22.png), [Plan și facturare](../plan-billing-final/README.md) și [ghidul Sneep Cut](../publishing-design.md). Se păstrează suprafețele întunecate, acțiunile alb/negru, fonturile Manrope/Sora, spațierea calmă și razele md/sm.

Tokenurile proiectului au prioritate față de artefactele ImageGen: badge-ul Disabled este neutru, inclusiv în configurarea 2FA, iar badge-urile mici folosesc raza sm. Doar Settings este selectat în navigarea globală; marcajele rămase lângă Publish, accentele cyan din breadcrumb și săgețile de link extern pe navigare locală nu se reproduc în implementare.

## Ecrane și briefuri ImageGen

| Stare | Desktop | Mobil | Brief |
| --- | --- | --- | --- |
| Cont | [Desktop](desktop-account.png) | [Mobil](mobile-account.png) | Sumar Alex Morgan, avatar AM, data înscrierii, verificarea emailului și acces la profil, abonament și deconectare. |
| Profil editat | [Desktop](desktop-profile.png) | [Mobil](mobile-profile.png) | Nume valid modificat, email neverificat și read-only, Resend verification și Save profile activ. |
| Parolă și securitate | [Desktop](desktop-security-password.png) | [Mobil](mobile-security-password.png) | Current password, New password, Confirm new password și politica parolei pentru cont cu autentificare prin parolă. |
| Securitate prin furnizor | [Desktop](desktop-security-provider.png) | [Mobil](mobile-security-provider.png) | Cont Google cu explicația parolei gestionate de furnizor, fără formular local de schimbare a parolei. |
| Configurare 2FA | [Desktop](desktop-mfa-setup.png) | [Mobil](mobile-mfa-setup.png) | Cheie demonstrativă de introdus manual în aplicația de autentificare și confirmare cu cod; fără QR inventat. |
| Coduri de recuperare | [Desktop](desktop-mfa-recovery.png) | [Mobil](mobile-mfa-recovery.png) | Stare dedicată codurilor 2FA demonstrative și acțiunilor de recuperare disponibile în aplicație. |
| Sesiuni | [Desktop](desktop-sessions.png) | [Mobil](mobile-sessions.png) | Sesiuni demonstrative, sesiunea curentă identificată și controale de revocare, fără IP sau localizare inventate. |
| Notificări | [Desktop](desktop-notifications.png) | [Mobil](mobile-notifications.png) | Comutatoare pentru securitate, produs, procesare, publicare și marketing, cu salvare explicită. |
| Preferințe | [Desktop](desktop-preferences.png) | [Mobil](mobile-preferences.png) | Limbă, temă, fus orar, raport implicit și număr implicit de clipuri, cu Save preferences. |
| Conturi conectate | [Desktop](desktop-connections.png) | [Mobil](mobile-connections.png) | Instagram, Facebook, TikTok și YouTube cu starea accesului, permisiuni și acțiuni relevante. |
| Confirmare deconectare | [Desktop](desktop-disconnect.png) | [Mobil](mobile-disconnect.png) | Confirmare inline pentru contul social ales; păstrează identitatea contului și posibilitatea de anulare. |
| Date și confidențialitate | [Desktop](desktop-privacy.png) | [Mobil](mobile-privacy.png) | Export JSON direct, linkuri către politici și istoric de export fără acțiuni suplimentare pe rânduri. |
| Ștergere cu parolă | [Desktop](desktop-delete-password.png) | [Mobil](mobile-delete-password.png) | Dialog distructiv cu email de confirmare, parola curentă, Cancel și Delete permanently condiționat de validare. |
| Ștergere cont Google | [Desktop](desktop-delete-provider.png) | [Mobil](mobile-delete-provider.png) | Email de confirmare și autentificare recentă Google obligatorie, fără câmp de parolă locală. |
| Deconectare din cont | [Desktop](desktop-sign-out.png) | [Mobil](mobile-sign-out.png) | Dialog Sign out? cu Cancel focalizat inițial și confirmare explicită. |
| Eroare la salvare | [Desktop](desktop-save-error.png) | [Mobil](mobile-save-error.png) | Eroare inline lizibilă, modificările introduse păstrate și posibilitatea de a reîncerca salvarea. |
| Încărcare inițială | [Desktop](desktop-loading.png) | [Mobil](mobile-loading.png) | Cadrul aplicației rămâne prezent, cu indicator de încărcare și fără date de cont presupuse. |
| Eroare de încărcare | [Desktop](desktop-load-error.png) | [Mobil](mobile-load-error.png) | Mesaj clar de indisponibilitate și Retry, fără profil sau setări inventate. |

## Date demonstrative și organizare

Contul de referință este **Alex Morgan**, `alex@example.invalid`, avatar **AM**, membru din **1 octombrie 2026**. În starea Profil, emailul este neverificat, butonul Resend verification este disponibil, iar numele a fost modificat valid, astfel încât Save profile este activ. Stările Google ilustrează separat autentificarea prin furnizor; nu combină parola locală cu parola Google.

Navigarea pe secțiuni și păstrarea modificărilor nesalvate sunt o reorganizare locală propusă pentru Setări. Trecerea între secțiuni trebuie să păstreze valorile introduse și cadrul dashboard-ului; nu reprezintă salvare automată. Pe mobil conținutul este recompus într-o coloană, cu acces la meniul existent al aplicației, fără o navigare permanentă nouă în partea de jos.

## Comportamente de păstrat

- **Profil:** doar numele afișat este editabil, cu limita 2–80 de caractere. Avatarul este imaginea existentă sau inițialele; nu se adaugă upload/remove pentru avatar. Emailul este read-only, cu îndrumare către suport pentru schimbare. Save profile este dezactivat când nu există modificări sau o acțiune este în curs; succesul are confirmare, iar eroarea rămâne inline.
- **Verificarea emailului:** Resend verification apare doar când emailul nu este verificat. Trimiterea reușită confirmă expedierea, fără a marca imediat contul drept Verified. Păstrăm încărcarea și eroarea trimiterii.
- **Parolă:** conturile eligibile cer parola curentă și o parolă nouă confirmată, cu cel puțin 12 caractere, majuscule, minuscule, număr și caracter special; validarea reală include limita bcrypt de 72 de octeți UTF-8. Schimbarea reușită închide sesiunile existente și cere autentificare din nou. Conturile Google arată mesajul furnizorului în locul formularului local.
- **2FA:** păstrăm configurarea prin cheie manuală și verificarea codului, precum și starea de recuperare disponibilă în aplicație. Cheile și codurile din imagini sunt exclusiv demo; nu se adaugă un QR sau funcții nesusținute.
- **Sesiuni:** identificăm sesiunea curentă și păstrăm acțiunile reale de revocare. Nu deducem adrese IP sau orașe din informațiile dispozitivului.
- **Notificări:** valorile implicite sunt security, product, processing și publishing **pornite**, marketing **oprit**. Păstrăm numele și scopul celor cinci categorii.
- **Preferințe:** valorile implicite sunt limba **en**, tema **system**, fusul orar **UTC**, raportul **9:16** și **3 clipuri**. Notificările și preferințele folosesc acțiunea comună **Save preferences**; modificarea unui comutator sau selector nu salvează automat.
- **Conexiuni:** doar cele patru platforme suportate; păstrăm identitatea contului, permisiunile, expirarea accesului, configurarea indisponibilă și acțiunile Connect/Reconnect/Disconnect. Confirmarea deconectării este inline. Încărcarea, erorile și stările de lucru nu trebuie să permită acțiuni concurente nevalide.
- **Confidențialitate:** Export all data descarcă direct JSON, fără un flux nou de solicitare a exportului. Istoricul existent este informativ, fără View/Download/Delete adăugate pe rând. Păstrăm stările goale, încărcarea și feedbackul exportului.
- **Ștergere:** confirmarea constă în emailul contului, ignorând diferențele de majuscule și spațiile de la margini. Conturile cu parolă cer parola curentă; conturile Google cer autentificare recentă, cu Sign in again când lipsește. Explicația păstrează anularea abonamentului activ înaintea ștergerii definitive. Delete permanently rămâne blocat până la îndeplinirea condițiilor și în timpul operației; eroarea rămâne vizibilă. Ștergerea incompletă trebuie să poată fi reluată.
- **Sign out:** confirmare separată, Cancel focalizat inițial, controale blocate în timpul deconectării și eroare cu posibilitate de reîncercare.
- **Încărcare și erori:** păstrăm cadrul dashboard-ului; nu afișăm valori presupuse când datele nu au fost încă obținute. La eșecul salvării păstrăm editările și arătăm eroarea lângă formularul relevant.

Galeria acoperă cele 18 stări cerute, nu toate combinațiile posibile ale contului, permisiunilor și răspunsurilor serverului. Nu au fost schimbate profiluri, parole, preferințe, conexiuni sau sesiuni și nu au fost exportate ori șterse date reale. Imaginile nu demonstrează funcționarea autentificării, 2FA, salvării, gesturilor, navigării sau accesibilității; implementarea și verificarea rămân etape separate.
