# Plan și facturare — galerie

Data: **23 octombrie 2026**. **22 de imagini, în 11 perechi desktop/mobil**, generate cu ImageGen în stilul Sneep Cut salvat. Setul acoperă lista de ecrane solicitată de utilizator. Sunt mockupuri statice pentru revizie, **neimplementate și neaprobate încă de utilizator**. Nu au fost efectuate achiziții sau modificări de abonament.

Surse: [New post aprobat](../assets/new-post-approved-2026-10-22.png), [ghidul vizual Sneep Cut](../publishing-design.md) și [captura funcțională actuală de facturare pe mobil](../../../frontend/test-results/billing-mobile.png). Captura documentează pagina existentă; imaginile de mai jos propun reorganizarea ei.

## Ecrane și briefuri ImageGen

| Stare | Desktop | Brief desktop | Mobil | Brief mobil |
| --- | --- | --- | --- | --- |
| Privire de ansamblu | [Desktop](desktop-overview.png) | Pro activ, sold și reînnoire, acțiuni compacte, detalii extensibile și facturi aliniate. | [Mobil](mobile-overview.png) | Aceleași informații într-o coloană, cu acțiuni și facturi lizibile. |
| Alegerea planului | [Desktop](desktop-plans.png) | Compară patru planuri; Pro curent dezactivat, modificările continuă în portal. | [Mobil](mobile-plans.png) | Planuri suprapuse, preț lunar și credite clare, cu revenire la sumar. |
| Istoric de facturi | [Desktop](desktop-invoices.png) | Tabel cu număr, dată, Paid, sumă și acțiunile individuale View/PDF. | [Mobil](mobile-invoices.png) | Facturile devin blocuri compacte; datele și acțiunile rămân ușor de citit. |
| Detalii de facturare | [Desktop](desktop-billing-details.png) | Deschide detaliile despre credite, acces, schimbări și anulare într-o zonă calmă. | [Mobil](mobile-billing-details.png) | Aceeași explicație în secțiune extensibilă, lizibilă fără derulare orizontală. |
| Free și facturi goale | [Desktop](desktop-free.png) | Free, 1.000 de credite inițiale, fără abonament activ și fără facturi. | [Mobil](mobile-free.png) | Sumar Free compact, Upgrade și mesajul No invoices yet, fără acțiuni fictive. |
| Anulare programată | [Desktop](desktop-cancel-scheduled.png) | Pro și 3.240 de credite, Ends on 23 Nov 2026, fără reînnoire automată. | [Mobil](mobile-cancel-scheduled.png) | Data încheierii și accesul până la termen apar clar lângă sold. |
| Confirmare checkout în curs | [Desktop](desktop-payment-pending.png) | Banner neutru de confirmare; păstrează Free și soldul confirmat de 1.000 de credite. | [Mobil](mobile-payment-pending.png) | Confirmare în curs și Refresh billing status, fără succes sau acces acordat anticipat. |
| Checkout anulat | [Desktop](desktop-checkout-canceled.png) | Mesaj de anulare a checkout-ului; planul Free și 1.000 de credite rămân neschimbate. | [Mobil](mobile-checkout-canceled.png) | Anunț compact No changes were made, cu sumarul existent păstrat. |
| Plată restantă | [Desktop](desktop-past-due.png) | Acces efectiv Free, sold păstrat, starea financiară Past due și Manage billing. | [Mobil](mobile-past-due.png) | Explică suspendarea funcțiilor plătite și accesul în portal, fără promisiune de grație. |
| Încărcare inițială | [Desktop](desktop-loading.png) | Păstrează cadrul aplicației și indicatorul de încărcare, fără date financiare inventate. | [Mobil](mobile-loading.png) | Indicator accesibil în conținut, cu meniul aplicației disponibil. |
| Eroare de încărcare | [Desktop](desktop-load-error.png) | Mesaj de eroare inițială și Try again, fără a afișa un plan presupus. | [Mobil](mobile-load-error.png) | Mesaj scurt și acțiune Retry accesibilă, fără modificări ale contului. |

Change plan deschide vizualizarea locală de alegere a planului; abia Continue in billing portal inițiază navigarea externă în scenariul cu abonament existent. O eventuală pictogramă de link extern generată pe Change plan este un artefact vizual și nu indică navigare imediată sau cumpărare automată. Pe mobil se păstrează accesul la meniul aplicației, fără un meniu permanent nou în partea de jos.

## Datele ilustrate

Exemplul este ancorat la **23 octombrie 2026**: Pro la **49 €/lună**, alocare de **5.000 credite/lună**, sold disponibil de **3.240 credite**, echivalent estimat cu **324 de clipuri**, și reînnoire la **23 noiembrie 2026**. Facturile din **23 octombrie, 23 septembrie și 23 august 2026** au fiecare suma de **49 €** și starea **Paid**.

| Plan | Preț ilustrativ | Credite |
| --- | --- | --- |
| Free | Free | 1.000 la înscriere, o singură dată |
| Creator | 19 €/lună | 1.500/lună |
| Pro | 49 €/lună | 5.000/lună |
| Agency | 149 €/lună | 20.000/lună |

Toate sumele, datele, facturile și soldul de mai sus sunt **date sintetice pentru design**. Prețurile plătite și moneda din producție provin din `GET /api/stripe/plans`; imaginile nu confirmă tarife live. Eticheta Free evită introducerea unei alte monede în comparație.

Aplicația oferă facturare lunară. Fiecare clip solicitat consumă 10 credite; estimarea din sold este `floor(credite / 10)`. Soldul disponibil poate include credite reportate, deci nu reprezintă procentul rămas din alocarea lunară.

Scenariile suplimentare folosesc următoarele reguli:

- **Free și facturi goale:** 1.000 de credite disponibile, aproximativ 100 de clipuri, fără alocare lunară sau reînnoire. Fără profil de facturare nu apare Manage billing. No invoices yet nu adaugă View/PDF, filtre sau alte acțiuni.
- **Confirmare în curs și checkout anulat:** Free și 1.000 de credite sunt ultimele valori confirmate. În primul caz nu se acordă anticipat Pro sau credite; în al doilea nu s-a schimbat nimic. Anularea checkout-ului nu înseamnă anularea unui abonament.
- **Anulare programată:** Pro păstrează 3.240 de credite și accesul plătit până la sfârșitul perioadei confirmate, **23 noiembrie 2026**. Data este Ends on, nu Renews on; nu se sugerează rambursare sau pierderea imediată a accesului.
- **Past due:** planul efectiv afișat este **Free**, chiar dacă abonamentul financiar restant este Pro. Soldul de 3.240 de credite este păstrat; funcțiile plătite sunt indisponibile cât plata este restantă/incompletă. Recuperarea se face prin Manage billing, fără reînnoire confirmată sau perioadă de grație inventată.

Starea Free include deja istoricul gol; nu există o pereche separată de fișiere pentru Empty invoices.

## Comportamente de păstrat la implementare

- **Sumar:** planul efectiv, starea abonamentului, soldul și estimarea de clipuri, data corectă de reînnoire sau încheiere. Anularea programată, plata restantă/incompletă, pauza și accesul neconfirmat necesită mesaje distincte.
- **Schimbarea planului:** Change plan este o etapă locală de selecție; alegerea unei opțiuni nu schimbă accesul. Cu abonament existent și profil de facturare, modificările continuă în portalul Stripe; fără abonament eligibil, checkout-ul este disponibil pentru un plan superior configurat. Planul curent și opțiunile neconfigurate sunt dezactivate după regulile existente.
- **Acțiuni găzduite:** Manage billing folosește profilul de facturare; checkout/portal au indicator de deschidere, blocarea acțiunilor concurente și eroare inline. Navigarea folosește numai destinațiile Stripe validate de cod.
- **Administrator:** conturile cu credite nelimitate afișează ∞ și accesul de administrator; comparația de planuri este ascunsă conform răspunsului API.
- **Mod test:** păstrează mesajul vizibil că plățile sunt de test, fără debitări reale, și folosesc carduri de test Stripe.
- **Actualizare și revenire:** păstrează Refresh billing status, verificarea checkout-ului și stările complete/pending/delayed/invalid/unavailable/canceled. La probleme temporare se afișează ultimele date confirmate și opțiunea Retry, fără a inventa o confirmare de plată.
- **Facturi:** număr, dată, stare și sumă/monedă; View și PDF apar doar pentru linkuri HTTPS valide. Păstrează lista goală și eroarea furnizorului cu Retry. Pe mobil, rândurile se recompun în blocuri compacte.
- **Detalii de facturare:** zona extensibilă propusă păstrează informațiile reale: creditele lunare sunt adăugate după plata reușită, creditele nefolosite rămân în sold, planurile plătite nu au trial sau perioadă de grație la restanțe, schimbarea planului nu produce prorată, iar anularea intră în vigoare la finalul perioadei.

Pachetul nu introduce selector anual, cumpărare de credite suplimentare, editor de card bancar sau procent de utilizare inventat. Administrarea plăților rămâne în portalul găzduit.

Cele 11 perechi acoperă lista solicitată, nu toate combinațiile posibile ale stărilor aplicației. Accesul de administrator, modul test, indisponibilitatea Stripe, confirmarea întârziată/invalidă și abonamentul în pauză rămân cerințe funcționale, fără imagini separate în acest set. La o eroare de actualizare după încărcare se păstrează ultimele date confirmate; ecranele Load error ilustrează eroarea inițială.

Mockupurile nu demonstrează plăți, navigare, actualizarea datelor, comportament adaptiv sau accesibilitate; acestea trebuie verificate separat după implementare.
