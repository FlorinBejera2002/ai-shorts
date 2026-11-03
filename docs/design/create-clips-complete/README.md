# Create clips — set complet desktop și mobil

64 de imagini finale, în 32 de perechi, verificate la 23 octombrie 2026. Varianta aleasă este inspectorul compact în stânga: [referința desktop](desktop-youtube-ready.png), copiată exact din imaginea aprobată. Mobilul recompune interfața într-o coloană: [YouTube pregătit](mobile-youtube-ready.png).

Deschide [galeria interactivă](gallery.html) pentru căutare, filtrare și zoom. [Brief-ul](design-brief.md) descrie stările și comportamentele; [manifestul](manifest.json) enumeră livrabilele, iar [verificarea imaginilor](image-verification.json) include dimensiuni, dimensiuni pe disc și hash-uri SHA-256. Toate cele 64 de fișiere se decodează corect, au proporțiile desktop/mobil așteptate și conținut distinct.

Procesarea păstrează componenta existentă, animația și etapele actuale, conform ultimei cerințe. Imaginile de procesare YouTube au fost revizuite pentru această regulă. Implementarea urmează tokenurile reale Sneep Cut, logo-ul violet existent și componentele accesibile ale aplicației; mici artefacte ale imaginilor generate nu devin reguli de implementare. Titlurile, melodiile și datele demo sunt exemple vizuale, nu date introduse în contul utilizatorului.

| # | Stare | Desktop | Mobil |
| --- | --- | --- | --- |
| 1 | Filmări | [Desktop](desktop-footage.png) | [Mobil](mobile-footage.png) |
| 2 | Proiecte | [Desktop](desktop-projects.png) | [Mobil](mobile-projects.png) |
| 3 | Încărcare în curs | [Desktop](desktop-uploads.png) | [Mobil](mobile-uploads.png) |
| 4 | Recuperarea încărcării | [Desktop](desktop-upload-recovery.png) | [Mobil](mobile-upload-recovery.png) |
| 5 | Preferințe sursă | [Desktop](desktop-clip-preferences.png) | [Mobil](mobile-clip-preferences.png) |
| 6 | Direcție video | [Desktop](desktop-story-brief.png) | [Mobil](mobile-story-brief.png) |
| 7 | Muzică | [Desktop](desktop-music.png) | [Mobil](mobile-music.png) |
| 8 | Înregistrare voce | [Desktop](desktop-narration-recording.png) | [Mobil](mobile-narration-recording.png) |
| 9 | Înregistrare nesalvată | [Desktop](desktop-narration-draft.png) | [Mobil](mobile-narration-draft.png) |
| 10 | Subtitrări | [Desktop](desktop-story-captions.png) | [Mobil](mobile-story-captions.png) |
| 11 | Format | [Desktop](desktop-story-format.png) | [Mobil](mobile-story-format.png) |
| 12 | Verificare înainte de generare | [Desktop](desktop-story-review.png) | [Mobil](mobile-story-review.png) |
| 13 | Revizuire transcript | [Desktop](desktop-transcript-review.png) | [Mobil](mobile-transcript-review.png) |
| 14 | Comparare audio | [Desktop](desktop-audio-comparison.png) | [Mobil](mobile-audio-comparison.png) |
| 15 | Ajutor la cerere | [Desktop](desktop-story-agent.png) | [Mobil](mobile-story-agent.png) |
| 16 | Procesare Story | [Desktop](desktop-story-processing.png) | [Mobil](mobile-story-processing.png) |
| 17 | Rezultat gata | [Desktop](desktop-story-ready.png) | [Mobil](mobile-story-ready.png) |
| 18 | Rezultat de verificat | [Desktop](desktop-story-needs-review.png) | [Mobil](mobile-story-needs-review.png) |
| 19 | Eroare Story | [Desktop](desktop-story-error.png) | [Mobil](mobile-story-error.png) |
| 20 | Confirmare ștergere | [Desktop](desktop-story-delete.png) | [Mobil](mobile-story-delete.png) |
| 21 | Eroare încărcare Story | [Desktop](desktop-story-load-error.png) | [Mobil](mobile-story-load-error.png) |
| 22 | YouTube gol | [Desktop](desktop-youtube-empty.png) | [Mobil](mobile-youtube-empty.png) |
| 23 | YouTube pregătit | [Desktop](desktop-youtube-ready.png) | [Mobil](mobile-youtube-ready.png) |
| 24 | Mai multe linkuri | [Desktop](desktop-youtube-batch.png) | [Mobil](mobile-youtube-batch.png) |
| 25 | Stil subtitrări | [Desktop](desktop-youtube-style.png) | [Mobil](mobile-youtube-style.png) |
| 26 | Credite insuficiente | [Desktop](desktop-youtube-no-credits.png) | [Mobil](mobile-youtube-no-credits.png) |
| 27 | Opțiuni avansate | [Desktop](desktop-youtube-advanced.png) | [Mobil](mobile-youtube-advanced.png) |
| 28 | Procesare YouTube | [Desktop](desktop-job-processing.png) | [Mobil](mobile-job-processing.png) |
| 29 | Recuperare audio | [Desktop](desktop-job-audio-recovery.png) | [Mobil](mobile-job-audio-recovery.png) |
| 30 | Job eșuat | [Desktop](desktop-job-failed.png) | [Mobil](mobile-job-failed.png) |
| 31 | Clipuri gata | [Desktop](desktop-job-completed.png) | [Mobil](mobile-job-completed.png) |
| 32 | Eroare încărcare job | [Desktop](desktop-job-load-error.png) | [Mobil](mobile-job-load-error.png) |

Implementarea și verificările funcționale sunt urmărite separat în tichetul [Create clips — set complet desktop și mobil](https://app.notion.com/p/402c7071a19881908c97cef3edf7b2ef). Raportul de comparație cu aplicația este în [design-qa.md](../../../design-qa.md).
