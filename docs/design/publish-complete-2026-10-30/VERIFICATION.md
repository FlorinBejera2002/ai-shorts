# Verificarea pachetului

Livrabil de design, revizia 3, 30 octombrie 2026. Codul de runtime nu a fost modificat în acest task.

## Cerințe verificate

- All este primul și implicit; urmează cinci filtre exacte. Include toate statusurile din luna afișată, cu limita de date actuală documentată.
- Publish are o listă pe toată lățimea, fără preview permanent și fără separatoare între postări.
- Composerul are o singură coloană, un câmp public, media compactă și opțiuni la cerere. Liniile decorative dintre secțiuni au fost eliminate.
- Opt machete complementare: patru ecrane principale și patru suprapuneri sociale pentru video vertical.
- Funcțiile existente și cele două completări cerute explicit (All/status și preview-uri native) sunt distincte în inventare. Nu s-au inventat acțiuni sociale sau statistici.

## Inspecție și corecții

Inventarele au fost confruntate cu componentele montate. O verificare independentă a confirmat All, statusurile, intervalul lunar, rarefierea bordurilor și limitele de funcționalitate. Contradicția despre razele native a fost corectată; excepția Follow/Subscribe se aplică doar postării simulate și este documentată în AGENTS.

Cele patru referințe oficiale de platformă au fost inspectate. Verificarea independentă a confirmat seturile distincte de comenzi. La final au fost corectate contorul distribuirii Instagram și poziția meniului Facebook, iar scrubberul Instagram fără dovadă a fost eliminat. Corecțiile au fost inspectate din nou.

Filtrele mobile au fost mărite și făcute derulabile, fără comprimarea celor șase etichete pe un singur ecran. Contururile selecțiilor și geometria nativă Follow/Subscribe sunt funcționale/contextuale; nu s-au păstrat borduri ca delimitare generală.

## Verificări de fișiere

- **206 legături locale valide** în cele 8 documente Markdown; fără caractere de înlocuire la citirea UTF-8.
- **8 machete PNG și 3 referințe PNG** cu semnătură, structură și payload comprimat valide. Cele două referințe JPEG au fost inspectate vizual.
- Desktop 1487×1058; composer mobil 853×1843; celelalte machete mobile 853×1844. Acestea sunt dimensiuni raster, nu viewport-uri testate.
- Pachet final aproximativ **14,26 MiB**, inclusiv referințele oficiale păstrate.
- `git diff --check` pentru documentația urmărită: trecut. Singura modificare în AGENTS este excepția explicită a geometriei preview-ului social.
- `node scripts/storage.mjs --check`: **trecut**. Checkout 6445,7 MiB; cache 1996,0 MiB; regenerabile 440,8 MiB, sub bugetele proiectului.

## Limite

- Rasterele nu certifică geometrie pixel cu pixel, contrast măsurat, responsive funcțional, focus, Fast Refresh sau identitate DOM.
- Preview-urile sunt suprapuneri ale postării în cadrul Sneep Cut; navigația completă a aplicațiilor sociale nu este reprodusă. Numărătorile 0 și conturile/media sunt sintetice.
- Referințele video au fost verificate; fotografiile, caruselele și video-ul YouTube obișnuit au contract separat și necesită capturi proprii pentru verificarea geometriei.
- Noile renderere și All nu sunt implementate de acest livrabil. Nu au fost rulate teste de aplicație; nu s-au făcut OAuth, uploaduri, publicări, migrații sau mutații de conturi.
- Fișierele intermediare mari sau incomplete ale descărcărilor acestui task au fost eliminate. Capturile oficiale utile au fost păstrate lângă documentație.
