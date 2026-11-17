# Create clips — două variante Settings left

Data: **23 octombrie 2026**. Utilizatorul a indicat [Settings left](../create-clips-models/settings-left.png) ca direcție interesantă și a cerut încă două variante în același stil. Acestea sunt propuneri statice, fără implementare. Numerele urmează ordinea afișării noului set în chat.

| Model | Imagine | Compoziție |
| --- | --- | --- |
| 1 | [Deschide imaginea](compact-inspector.png) | Inspector mai îngust, stilul subtitrărilor într-un select, Generate sub setările din stânga. |
| 2 | [Deschide imaginea](balanced-inspector.png) | Inspector mai lat, controale grupate, sursă în dreapta și Generate în bara comună de jos. |

Ambele păstrează setările în stânga, folosesc întreaga lățime și au un câmp AI mic sub sursă. Nu apare un buton Write script în conținut; Scripts rămâne în navigarea globală. Sunt păstrate paleta neutră Sneep Cut, logo-ul violet, acțiunile albe și razele md/sm din [ghidul de design](../publishing-design.md).

## Brief comun

Cadru desktop țintă 1440 × 1024, sidebar de aproximativ 240 px, header de aproximativ 64 px. Tipografie Manrope/Sora și corp de text 14–16 px. Ierarhie prin aliniere, spațiere și separatoare, text redus la etichetele necesare. Miniatură sursă mare și naturală, fără player sau rezultate video inventate. Fiecare concept a fost generat independent cu ImageGen, cu Settings left și [New post aprobat](../assets/new-post-approved-2026-10-22.png) atașate ca referințe vizuale.

Date demonstrative identice: `https://youtu.be/ScDemoA0001`, Morning studio tour, Demo studio, Ready to process. Cinci clipuri, format 9:16, subtitrări Clean activate, No branding, Advanced închis. Cost ilustrativ 50 credits și sold 360. Câmpul AI conține „Focus on practical tips and the strongest moments.”

## Alegere

Utilizatorul a ales explicit **varianta 1 — compact-inspector.png** pe 23 octombrie 2026 și a cerut extinderea la întregul flux Create clips, inclusiv mobil, apoi implementarea. Varianta 2 rămâne o explorare nealeasă. [Setul complet](../create-clips-complete/README.md) urmărește continuarea în direcția aprobată; [setul anterior de cinci modele](../create-clips-models/README.md) rămâne disponibil pentru comparație.

Imaginile sunt mockupuri statice cu date sintetice. Nu s-a modificat aplicația, nu s-au încărcat fișiere și nu s-au pornit generări video sau cheltuit credite din contul utilizatorului. Verificarea vizuală a acestor imagini nu verifică interacțiunile sau accesibilitatea aplicației.

## Verificare

Două PNG-uri distincte, diferite și de referința inițială, decodate cu succes: **1487 × 1058 px** fiecare, **2,82 MiB** în total. Verificate vizual și verificate cele **15 legături locale** din indexul nou și cel anterior.

`node scripts/storage.mjs --check` a trecut cu exit 0: checkout 6322,4 MiB, `.cache` 1996,0 MiB, ieșiri regenerabile 422,6 MiB; toate sub pragurile configurate. Nu s-a efectuat curățare de fișiere în această etapă.
