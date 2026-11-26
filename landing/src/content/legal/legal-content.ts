import type { Locale as SiteLocale } from '@/lib/i18n'

export const LEGAL_OPERATOR = {
  brand: 'Sneep Cut',
  legalName: 'GENESIS PROCUREMENT S.R.L.',
  taxId: '54235600',
  tradeRegister: 'J2026016652004',
  shareCapital: '500 RON',
  address:
    'Str. Parcului nr. 25, camera 2, bl. A, et. II, ap. 9, Giroc, județul Timiș, România',
  phone: '+40 748 398 317',
  email: 'genesis.int.group@gmail.com',
  privacyEmail: 'admin@sneepcut.com'
} as const

export type LegalLink = {
  label: string
  href: string
}

export type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  links?: LegalLink[]
}

export type LegalDocumentCopy = {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
  contactTitle: string
  contactPrompt: string
  contactFallback: string
}

const updated = {
  en: 'Last updated: November 17, 2026',
  ro: 'Ultima actualizare: 17 noiembrie 2026',
  es: 'Última actualización: 17 de noviembre de 2026'
} as const

export const PRIVACY_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Privacy Policy',
    updated: updated.en,
    intro:
      'This policy explains how Sneep Cut collects, uses, shares, and protects personal data when you visit the website, create an account, upload media, use AI-assisted tools, connect social accounts, publish content, or manage a plan.',
    sections: [
      {
        title: 'YouTube API Services and Google user data',
        paragraphs: [
          'Sneep Cut uses YouTube API Services. By using these features you agree to the YouTube Terms of Service. Google processes information under its Privacy Policy.',
          'With your authorization, we access channel identifiers, name, thumbnail, granted permissions and upload status. We store OAuth access and refresh tokens encrypted and use them only to identify your channel, maintain the connection, and upload videos you select with the title, description, visibility and audience choices you approve. We do not download YouTube audiovisual content through this connection or use YouTube API data for AI training, advertising or sale.',
          'You may revoke access through Google account permissions or disconnect YouTube in the Calendar connection settings. Disconnecting immediately deletes locally stored YouTube credentials, channel metadata and associated YouTube publishing API records. Videos already uploaded remain on YouTube until you delete them there. Your original uploaded files and independently created projects follow the general retention controls.',
          'We validate YouTube authorization and refresh channel information daily. If access is revoked, the associated API data is deleted; if authorization cannot be verified, that data is purged within seven days of the last verification. Stored channel information is refreshed or deleted within thirty days. You may also request deletion at admin@sneepcut.com; YouTube API user-data requests are fulfilled as soon as possible and within seven calendar days.',
          'Access, use, storage and sharing of Google user data comply with the Google API Services User Data Policy, including its Limited Use requirements. Data is shared only with Google for your requested upload and necessary service providers under the safeguards described in this policy.'
        ],
        links: [
          {
            label: 'YouTube Terms of Service',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Google Privacy Policy',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Google account permissions',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: 'Importing your own YouTube videos with Google Data Portability',
        paragraphs: [
          'Importing is a separate, optional authorization from connecting a YouTube channel for publishing. Only after the import disclosure and your explicit authorization do we request Google Data Portability permissions for the public, unlisted or private videos you choose to include. These permissions let us copy videos you uploaded and their accompanying metadata into your Sneep Cut account. We do not request your Google password or browser cookies for this flow.',
          'We store imported video files, names, export metadata and import status to provide your media library. When you select an imported video for clip creation, we process its video and audio to transcribe speech, identify highlights, reframe, caption and render the clips you request. Necessary processing providers may receive the media or derived text under the safeguards described below. We do not sell the data, use it for advertising, or use it to train general-purpose AI models. Google user data is used only for the clearly disclosed user-facing features and in accordance with the Google Data Portability User Data and Developer Policy and applicable Limited Use requirements.',
          'Export preparation is performed by Google and may take minutes or hours. Availability depends on Google account and country eligibility, including Romania where the feature is supported; some managed, protected or under-age accounts may not qualify. You can upload an original video instead when this import is unavailable.',
          'You can stop an import from Create clips to prevent further copying. You may also revoke access through your Google account connections. Revocation or stopping an import does not delete files already copied to Sneep Cut or videos on YouTube. Remove imported videos from the import library to delete their library entries and unreferenced source files; source files still used by existing projects or processing jobs follow those projects\' retention controls. Account deletion and privacy deletion requests apply to imported media as described in this policy. We retain encrypted import credentials only as long as needed to finish the authorized transfer or complete authorization reset or revocation, including necessary retries, then erase them. Account deletion immediately erases any locally stored import credentials. We do not include tokens or temporary Google download URLs in account exports.'
        ],
        links: [
          { label: 'Google Data Portability policy', href: 'https://developers.google.com/data-portability/policy' },
          { label: 'Google account connections', href: 'https://myaccount.google.com/connections' },
          { label: 'Supported accounts and countries', href: 'https://support.google.com/accounts/answer/14452558' }
        ]
      },
      {
        title: '1. Controller, processor roles, and scope',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} is operated by ${LEGAL_OPERATOR.legalName}, registered in Romania under CUI ${LEGAL_OPERATOR.taxId} and Trade Register number ${LEGAL_OPERATOR.tradeRegister}, with its registered office at ${LEGAL_OPERATOR.address}. For account, security, billing, and direct-service administration data, the company normally acts as controller.`,
          'When a business customer uploads or connects personal data that it controls and asks Sneep Cut to process that data solely to provide the service, the customer is the controller and Sneep Cut acts as processor. The Data Processing Addendum applies to that processing. Social platforms may act as separate controllers under their own notices.'
        ]
      },
      {
        title: '2. Data we collect and its sources',
        bullets: [
          'Account and identity data: name, email address, password hash, authentication provider, preferred language, time zone, security settings, and account identifiers.',
          'Media and project data: videos, photographs, audio, logos, brand assets, scripts, prompts, transcripts, captions, edits, generated clips, project settings, job state, and files uploaded from your device.',
          'Social connection data: platform, account or Page identifiers, display name, username, avatar URL, granted permissions, encrypted access or refresh tokens, token expiry, and connection status. We do not receive your social-platform password.',
          'Publishing data: selected destinations, captions, schedules, media order, publishing options, platform post identifiers and URLs, timestamps, errors, and processing status.',
          'Billing data: plan, credits, transaction, customer, subscription, and invoice identifiers received from our payment provider. Sneep Cut does not store full payment-card details.',
          'Technical and security data: IP address or a protected representation of it, browser and device information, session metadata, request timestamps, security events, logs, diagnostics, and application errors.',
          'Communications and choices: support messages, privacy requests, feedback, notification preferences, and marketing consent where requested.'
        ],
        paragraphs: [
          'We receive this data directly from you, from your device and browser, from authentication, payment, and social-platform providers you choose to connect, and from our systems as you use the service. Required fields are identified in the interface. Without data needed for an account, requested processing, or a platform connection, we may be unable to provide that feature.'
        ]
      },
      {
        title: '3. Why we use data and our legal bases',
        bullets: [
          'Contract performance: create and secure your account; receive and process media; generate, edit, export, schedule, and publish content; connect requested services; provide credits, plans, billing controls, support, and data export or deletion tools.',
          'Legitimate interests: protect accounts and infrastructure; prevent fraud, spam, and abuse; diagnose faults; maintain service reliability; keep proportionate operational records; defend legal claims; and improve usability. We balance these interests against your rights.',
          'Legal obligations: keep accounting and tax records, respond to valid legal requests, enforce sanctions or fraud-prevention duties, and meet consumer or data-protection obligations.',
          'Consent: optional marketing communications, non-essential device storage if introduced, and any other feature that expressly asks for consent. You may withdraw consent at any time without affecting earlier lawful processing.'
        ],
        paragraphs: [
          'We do not sell personal data. We do not use uploaded media for third-party advertising or to train our own general-purpose AI models.'
        ]
      },
      {
        title: '4. AI-assisted processing',
        paragraphs: [
          'Sneep Cut uses automated tools to help transcribe, identify possible highlights, reframe, caption, and edit content. Depending on the selected feature and current configuration, relevant media-derived text, prompts, instructions, or limited project context may be sent to an AI service provider listed on our Subprocessors page. Local processing components may also be used.',
          'Suggestions can be inaccurate or unsuitable. You decide what to keep, edit, export, or publish. Sneep Cut does not make decisions producing legal or similarly significant effects about you solely by automated means.'
        ]
      },
      {
        title: '5. Connected accounts and social publishing',
        paragraphs: [
          'When you connect Instagram, a Facebook Page, TikTok, YouTube, or another supported destination, we use the authorization and permissions you approve to identify eligible accounts and provide the requested workflow. We access only the data and actions allowed by the granted permissions and current product feature.',
          'When you choose Publish now, or deliberately save a scheduled publication, Sneep Cut sends the selected photographs, videos, carousels, captions, timing, and platform options to the destinations you selected. A scheduled post may be submitted automatically at the time you chose. We display processing and final platform status when available.',
          'Disconnecting removes the locally stored authorization and prevents new submissions through that connection. An operation already delivered to a platform may complete. Disconnecting or deleting your Sneep Cut account does not automatically remove content already published on a third-party platform. Where the platform API supports deletion and you explicitly request it, Sneep Cut may submit that deletion; otherwise you must delete the post on the platform.'
        ]
      },
      {
        title: '6. Recipients and service providers',
        paragraphs: [
          'We disclose only the data reasonably needed to providers supporting hosting and storage, authentication, transactional email, AI-assisted processing, payment processing, security, and technical support. The current categories and providers are described on the Subprocessors page.',
          'When you connect or publish to a social platform, the relevant platform receives data as an independent service under its own privacy policy and terms. We may also disclose data to professional advisers, competent authorities, courts, or a successor in a corporate transaction where lawfully required and appropriately protected.'
        ]
      },
      {
        title: '7. International transfers',
        paragraphs: [
          'Our primary production hosting is in Germany. Some optional providers or social platforms may process data outside Romania or the European Economic Area. Where a transfer requires a safeguard, we rely on an applicable adequacy decision, approved Standard Contractual Clauses, or another lawful transfer mechanism, together with supplementary measures where appropriate. You may contact us for information about the relevant safeguard.'
        ]
      },
      {
        title: '8. Retention and deletion',
        bullets: [
          'Account, project, media, and publishing-history data are generally kept while your account remains active or until you delete the item or account, unless a shorter product expiry is shown.',
          'OAuth state values expire after the short authorization window. Social credentials remain until you disconnect, they expire, access is revoked, or the account is deleted.',
          'Security and diagnostic records are kept only as long as reasonably needed to investigate incidents, prevent abuse, and maintain the service.',
          'Invoices, payment, accounting, and transaction evidence may be retained for the period required by tax, accounting, anti-fraud, and limitation laws.',
          'Data in protected backups, if present, is not used for ordinary operations and is removed or overwritten according to the applicable backup lifecycle, unless preservation is legally required.'
        ],
        paragraphs: [
          'Retention is determined by the type of record, its operational purpose, contractual and legal obligations, sensitivity, risk, and whether a dispute or security investigation is open. See Data Deletion for the available controls.'
        ]
      },
      {
        title: '9. Your data-protection rights',
        bullets: [
          'Request access to your personal data and a copy of it.',
          'Correct inaccurate or incomplete personal data.',
          'Request deletion or restriction where the legal conditions apply.',
          'Object to processing based on legitimate interests, including direct marketing.',
          'Receive data you provided in a structured, commonly used, machine-readable format where portability applies.',
          'Withdraw consent at any time where processing relies on consent.',
          'Lodge a complaint with the Romanian National Supervisory Authority for Personal Data Processing (ANSPDCP) or your local supervisory authority.'
        ],
        paragraphs: [
          'Account export and deletion controls are available in Dashboard → Settings → Data & Privacy. You may also email us. We may request proportionate information to verify your identity and normally respond within one month, subject to lawful extensions.'
        ],
        links: [
          {
            label: 'Romanian data-protection authority (ANSPDCP)',
            href: 'https://www.dataprotection.ro/'
          }
        ]
      },
      {
        title: '10. Security',
        paragraphs: [
          'We use measures appropriate to the service and risk, including encrypted transport, password hashing, access controls, encrypted social credentials, signed media access, rate limiting, malware scanning for uploads, service isolation, and restricted production access. No system can guarantee absolute security. Please use a strong unique password, enable available security controls, and notify us promptly of suspected unauthorized access.'
        ]
      },
      {
        title: '11. Children, cookies, and changes',
        paragraphs: [
          'Sneep Cut is not directed to children under 16 and we do not knowingly collect their data. If you believe a child provided data without valid authorization, contact us so we can investigate and delete it where required.',
          'We currently use strictly necessary and functional browser storage described in the Cookie Policy. If non-essential analytics or marketing technologies are introduced, we will request consent where required.',
          'We may update this policy when the service, providers, or law changes. We will publish the new date and provide additional notice for material changes where required.'
        ]
      }
    ],
    contactTitle: '12. Contact',
    contactPrompt: `For privacy questions or requests, contact ${LEGAL_OPERATOR.legalName} at`,
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Politica de confidențialitate',
    updated: updated.ro,
    intro:
      'Această politică explică modul în care Sneep Cut colectează, folosește, transmite și protejează datele cu caracter personal când vizitezi site-ul, creezi un cont, încarci fișiere media, folosești instrumente asistate de AI, conectezi conturi sociale, publici conținut sau administrezi un plan.',
    sections: [
      {
        title: 'Serviciile API YouTube și datele utilizatorilor Google',
        paragraphs: [
          'Sneep Cut utilizează serviciile API YouTube. Prin utilizarea acestor funcții accepți Termenii YouTube. Google prelucrează informațiile conform Politicii sale de confidențialitate.',
          'Cu autorizarea ta, accesăm identificatorii canalului, numele, miniatura, permisiunile acordate și starea încărcărilor. Stocăm criptat tokenurile OAuth de acces și reînnoire și le folosim numai pentru identificarea canalului, menținerea conexiunii și încărcarea videoclipurilor selectate de tine cu titlul, descrierea, vizibilitatea și opțiunile de audiență aprobate. Nu descărcăm conținut audiovizual YouTube prin această conexiune și nu folosim datele API YouTube pentru antrenarea AI, publicitate sau vânzare.',
          'Poți revoca accesul din permisiunile contului Google sau deconecta YouTube din setările conexiunilor din Calendar. Deconectarea șterge imediat credențialele YouTube, metadatele canalului și înregistrările API ale publicărilor YouTube stocate local. Videoclipurile încărcate rămân pe YouTube până când le ștergi acolo. Fișierele originale încărcate și proiectele create independent urmează regulile generale de retenție.',
          'Verificăm zilnic autorizarea YouTube și actualizăm informațiile canalului. Dacă accesul este revocat, datele API asociate sunt șterse; dacă autorizarea nu poate fi verificată, datele sunt eliminate în maximum șapte zile de la ultima verificare. Informațiile canalului sunt actualizate sau șterse în maximum treizeci de zile. Poți solicita ștergerea și la admin@sneepcut.com; cererile privind datele API YouTube sunt îndeplinite cât mai repede, în maximum șapte zile calendaristice.',
          'Accesarea, utilizarea, stocarea și partajarea datelor Google respectă Google API Services User Data Policy, inclusiv cerințele Limited Use. Datele sunt partajate numai cu Google pentru încărcarea cerută și cu furnizorii necesari serviciului, conform garanțiilor din această politică.'
        ],
        links: [
          {
            label: 'YouTube Terms of Service',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Google Privacy Policy',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Google account permissions',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: 'Importul propriilor videoclipuri YouTube prin Google Data Portability',
        paragraphs: [
          'Importul presupune o autorizare separată și opțională față de conectarea canalului YouTube pentru publicare. Solicităm permisiuni Google Data Portability numai după informarea privind importul și autorizarea ta explicită, pentru videoclipurile publice, nelistate sau private pe care alegi să le incluzi. Aceste permisiuni ne permit să copiem videoclipurile încărcate de tine și metadatele lor în contul tău Sneep Cut. Nu solicităm parola Google sau cookie-uri din browser pentru acest flux.',
          'Stocăm fișierele video importate, numele, metadatele exportului și starea importului pentru a furniza biblioteca ta media. Când selectezi un videoclip importat pentru generare, îi prelucrăm imaginea și sunetul pentru transcriere, identificarea momentelor importante, reîncadrare, subtitrare și randarea clipurilor cerute. Furnizorii necesari procesării pot primi fișierele sau textul derivat conform garanțiilor descrise mai jos. Nu vindem datele, nu le folosim pentru publicitate și nu le folosim pentru antrenarea modelelor AI de uz general. Datele Google sunt utilizate numai pentru funcțiile vizibile prezentate explicit și conform Politicii Google Data Portability privind datele utilizatorilor și dezvoltatorii și cerințelor Limited Use aplicabile.',
          'Google pregătește exportul, iar acesta poate dura minute sau ore. Disponibilitatea depinde de eligibilitatea contului Google și de țară, inclusiv România unde funcția este acceptată; unele conturi administrate, protejate sau ale minorilor pot fi neeligibile. Când importul nu este disponibil, poți încărca videoclipul original.',
          'Poți opri un import din Creează clipuri pentru a împiedica copierea ulterioară. Poți revoca accesul și din conexiunile contului Google. Revocarea sau oprirea importului nu șterge fișierele deja copiate în Sneep Cut ori videoclipurile din YouTube. Elimină videoclipurile din biblioteca de import pentru a șterge înregistrările lor și fișierele sursă neutilizate; sursele folosite încă de proiecte sau lucrări de procesare urmează regulile de retenție ale acestora. Ștergerea contului și cererile de ștergere se aplică fișierelor importate conform acestei politici. Păstrăm credențialele de import criptate numai atât cât este necesar pentru finalizarea transferului autorizat sau a resetării ori revocării autorizării, inclusiv reîncercările necesare, apoi le ștergem. Ștergerea contului elimină imediat toate credențialele de import stocate local. Nu includem tokenuri ori URL-uri Google temporare de descărcare în exporturile contului.'
        ],
        links: [
          { label: 'Politica Google Data Portability', href: 'https://developers.google.com/data-portability/policy' },
          { label: 'Conexiunile contului Google', href: 'https://myaccount.google.com/connections' },
          { label: 'Conturi și țări acceptate', href: 'https://support.google.com/accounts/answer/14452558' }
        ]
      },
      {
        title: '1. Operator, persoană împuternicită și domeniu',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} este operat de ${LEGAL_OPERATOR.legalName}, societate înregistrată în România cu CUI ${LEGAL_OPERATOR.taxId} și nr. Registrul Comerțului ${LEGAL_OPERATOR.tradeRegister}, cu sediul social în ${LEGAL_OPERATOR.address}. Pentru datele privind contul, securitatea, facturarea și administrarea directă a serviciului, societatea acționează în mod obișnuit ca operator.`,
          'Când un client business încarcă ori conectează date personale pe care le controlează și solicită Sneep Cut să le prelucreze exclusiv pentru furnizarea serviciului, clientul este operator, iar Sneep Cut este persoană împuternicită. Prelucrarea este acoperită de Acordul privind prelucrarea datelor. Platformele sociale pot acționa ca operatori separați conform propriilor informări.'
        ]
      },
      {
        title: '2. Date colectate și surse',
        bullets: [
          'Date de cont și identitate: nume, adresă de e-mail, hash-ul parolei, furnizorul de autentificare, limba, fusul orar, setările de securitate și identificatorii contului.',
          'Date media și de proiect: videoclipuri, fotografii, audio, sigle, materiale de brand, scripturi, prompturi, transcrieri, descrieri, editări, clipuri generate, setări de proiect, starea lucrărilor și fișiere încărcate de pe dispozitiv.',
          'Date despre conexiunile sociale: platforma, identificatorii contului sau Paginii, numele afișat, numele de utilizator, avatarul, permisiunile acordate, tokenurile de acces ori reîmprospătare criptate, expirarea tokenului și starea conexiunii. Nu primim parola platformei sociale.',
          'Date de publicare: destinații, descrieri, programări, ordinea fișierelor, opțiuni de publicare, identificatorii și URL-urile postărilor, marcaje temporale, erori și starea procesării.',
          'Date de facturare: planul, creditele și identificatorii de tranzacție, client, abonament și factură primiți de la procesatorul de plăți. Sneep Cut nu stochează datele complete ale cardului.',
          'Date tehnice și de securitate: adresa IP sau o reprezentare protejată a acesteia, informații despre browser și dispozitiv, metadatele sesiunii, marcaje temporale, evenimente de securitate, jurnale, diagnostice și erori.',
          'Comunicări și opțiuni: mesaje de asistență, cereri de confidențialitate, feedback, preferințe de notificare și consimțământ de marketing, când este solicitat.'
        ],
        paragraphs: [
          'Primim aceste date direct de la tine, de pe dispozitiv și din browser, de la furnizorii de autentificare, plată și platformele sociale pe care alegi să le conectezi, precum și de la sistemele noastre în timpul utilizării. Câmpurile obligatorii sunt indicate în interfață. Fără datele necesare contului, procesării sau conexiunii solicitate, este posibil să nu putem furniza funcția respectivă.'
        ]
      },
      {
        title: '3. Scopuri și temeiuri juridice',
        bullets: [
          'Executarea contractului: crearea și securizarea contului; primirea și procesarea fișierelor; generarea, editarea, exportul, programarea și publicarea conținutului; conectarea serviciilor solicitate; furnizarea creditelor, planurilor, controalelor de facturare, asistenței și instrumentelor de export ori ștergere.',
          'Interese legitime: protejarea conturilor și infrastructurii; prevenirea fraudei, spamului și abuzurilor; diagnosticarea; menținerea fiabilității; păstrarea unor evidențe operaționale proporționale; apărarea drepturilor; și îmbunătățirea utilizării. Echilibrăm aceste interese cu drepturile tale.',
          'Obligații legale: evidențe contabile și fiscale, răspunsuri la cereri legale valide, obligații privind sancțiunile sau prevenirea fraudei și respectarea normelor de protecție a consumatorilor și datelor.',
          'Consimțământ: comunicări opționale de marketing, stocare neesențială pe dispozitiv dacă va fi introdusă și orice funcție care solicită expres acordul. Consimțământul poate fi retras oricând, fără a afecta prelucrarea anterioară legală.'
        ],
        paragraphs: [
          'Nu vindem date personale. Nu folosim fișierele încărcate pentru publicitate terță sau pentru antrenarea propriilor modele AI de uz general.'
        ]
      },
      {
        title: '4. Prelucrare asistată de AI',
        paragraphs: [
          'Sneep Cut folosește instrumente automate pentru transcriere, identificarea unor posibile momente importante, reîncadrare, subtitrare și editare. În funcție de funcția aleasă și configurația curentă, text derivat din fișiere, prompturi, instrucțiuni sau context limitat de proiect poate fi transmis unui furnizor AI indicat pe pagina Subprocesatori. Pot fi folosite și componente locale.',
          'Sugestiile pot fi inexacte sau nepotrivite. Tu decizi ce păstrezi, modifici, exporți sau publici. Sneep Cut nu ia decizii care produc efecte juridice ori efecte similare semnificative asupra ta exclusiv prin mijloace automate.'
        ]
      },
      {
        title: '5. Conturi conectate și publicare socială',
        paragraphs: [
          'Când conectezi Instagram, o Pagină Facebook, TikTok, YouTube sau altă destinație acceptată, folosim autorizarea și permisiunile aprobate de tine pentru identificarea conturilor eligibile și furnizarea fluxului solicitat. Accesăm numai datele și acțiunile permise de drepturile acordate și funcția curentă.',
          'Când alegi Publică acum ori salvezi în mod deliberat o publicare programată, Sneep Cut trimite fotografiile, videoclipurile, caruselele, descrierile, momentul și opțiunile selectate către destinațiile alese. O postare programată poate fi trimisă automat la momentul ales de tine. Afișăm starea procesării și rezultatul platformei când acestea sunt disponibile.',
          'Deconectarea elimină autorizarea stocată local și împiedică trimiteri noi prin acea conexiune. O operațiune deja livrată platformei se poate finaliza. Deconectarea ori ștergerea contului Sneep Cut nu elimină automat conținutul deja publicat pe o platformă terță. Dacă API-ul platformei permite ștergerea și o soliciți explicit, Sneep Cut poate transmite cererea; în caz contrar, postarea trebuie ștearsă direct de pe platformă.'
        ]
      },
      {
        title: '6. Destinatari și furnizori',
        paragraphs: [
          'Transmitem numai datele rezonabil necesare furnizorilor care sprijină găzduirea și stocarea, autentificarea, e-mailurile tranzacționale, procesarea asistată de AI, plățile, securitatea și asistența tehnică. Categoriile și furnizorii curenți sunt descriși pe pagina Subprocesatori.',
          'Când conectezi ori publici pe o platformă socială, platforma relevantă primește date ca serviciu independent, conform propriei politici și propriilor termeni. Putem transmite date și consultanților profesioniști, autorităților competente, instanțelor sau unui succesor într-o tranzacție corporativă, când este legal necesar și protejat corespunzător.'
        ]
      },
      {
        title: '7. Transferuri internaționale',
        paragraphs: [
          'Găzduirea principală de producție este în Germania. Unii furnizori opționali sau unele platforme sociale pot prelucra date în afara României ori Spațiului Economic European. Când este necesară o garanție, folosim o decizie de adecvare aplicabilă, Clauze Contractuale Standard aprobate sau alt mecanism legal, împreună cu măsuri suplimentare unde este cazul. Ne poți contacta pentru informații despre garanția relevantă.'
        ]
      },
      {
        title: '8. Păstrare și ștergere',
        bullets: [
          'Datele contului, proiectelor, fișierelor și istoricului de publicare sunt păstrate în general cât timp contul este activ sau până când ștergi elementul ori contul, dacă produsul nu afișează o expirare mai scurtă.',
          'Valorile de stare OAuth expiră după fereastra scurtă de autorizare. Credențialele sociale rămân până la deconectare, expirare, revocare ori ștergerea contului.',
          'Evidențele de securitate și diagnostic sunt păstrate numai cât este rezonabil necesar pentru investigarea incidentelor, prevenirea abuzurilor și funcționarea serviciului.',
          'Facturile și evidențele de plată, contabilitate și tranzacții pot fi păstrate pe perioada cerută de legislația fiscală, contabilă, antifraudă și de prescripție.',
          'Datele din copii de siguranță protejate, dacă există, nu sunt folosite în operațiuni obișnuite și sunt eliminate ori suprascrise conform ciclului aplicabil, cu excepția păstrării impuse de lege.'
        ],
        paragraphs: [
          'Perioada depinde de tipul evidenței, scopul operațional, obligațiile contractuale și legale, sensibilitate, risc și existența unui litigiu ori a unei investigații de securitate. Consultă pagina Ștergerea datelor pentru controalele disponibile.'
        ]
      },
      {
        title: '9. Drepturile tale',
        bullets: [
          'Solicitarea accesului la datele personale și a unei copii.',
          'Corectarea datelor inexacte sau incomplete.',
          'Solicitarea ștergerii ori restricționării când sunt îndeplinite condițiile legale.',
          'Opoziția față de prelucrarea bazată pe interese legitime, inclusiv marketing direct.',
          'Primirea datelor furnizate într-un format structurat, utilizat în mod curent și care poate fi citit automat, când se aplică portabilitatea.',
          'Retragerea consimțământului oricând, când acesta este temeiul prelucrării.',
          'Depunerea unei plângeri la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP) sau la autoritatea locală competentă.'
        ],
        paragraphs: [
          'Controalele de export și ștergere sunt disponibile în Panou → Setări → Date și confidențialitate. Ne poți scrie și prin e-mail. Putem solicita informații proporționale pentru verificarea identității și răspundem în mod normal în cel mult o lună, sub rezerva prelungirilor permise de lege.'
        ],
        links: [
          {
            label: 'Autoritatea română pentru protecția datelor (ANSPDCP)',
            href: 'https://www.dataprotection.ro/'
          }
        ]
      },
      {
        title: '10. Securitate',
        paragraphs: [
          'Folosim măsuri adecvate serviciului și riscului, inclusiv transport criptat, hash pentru parole, control al accesului, credențiale sociale criptate, acces semnat la fișiere, limitarea cererilor, scanarea încărcărilor pentru malware, izolarea serviciilor și acces restricționat la producție. Niciun sistem nu garantează securitate absolută. Folosește o parolă unică și puternică, activează controalele disponibile și notifică-ne rapid dacă suspectezi acces neautorizat.'
        ]
      },
      {
        title: '11. Minori, cookie-uri și modificări',
        paragraphs: [
          'Sneep Cut nu este destinat copiilor sub 16 ani și nu colectăm cu bună știință datele acestora. Dacă crezi că un copil a furnizat date fără autorizare validă, contactează-ne pentru investigare și ștergere când este necesar.',
          'În prezent folosim numai stocare strict necesară și funcțională în browser, descrisă în Politica privind cookie-urile. Dacă vom introduce tehnologii neesențiale de analiză sau marketing, vom cere consimțământul unde este necesar.',
          'Putem actualiza această politică atunci când se modifică serviciul, furnizorii sau legea. Vom publica noua dată și vom oferi notificări suplimentare pentru schimbări importante, când este necesar.'
        ]
      }
    ],
    contactTitle: '12. Contact',
    contactPrompt: `Pentru întrebări sau cereri privind datele, contactează ${LEGAL_OPERATOR.legalName} la`,
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  es: {
    title: 'Política de privacidad',
    updated: updated.es,
    intro:
      'Esta política explica cómo Sneep Cut recopila, utiliza, comparte y protege los datos personales cuando visitas el sitio web, creas una cuenta, subes contenido multimedia, usas herramientas asistidas por IA, conectas cuentas sociales, publicas contenido o gestionas un plan.',
    sections: [
      {
        title: 'Servicios de la API de YouTube y datos de usuario de Google',
        paragraphs: [
          'Sneep Cut utiliza los Servicios de la API de YouTube. Al usar estas funciones aceptas las Condiciones del Servicio de YouTube. Google trata la información conforme a su Política de privacidad.',
          'Con tu autorización, accedemos a los identificadores del canal, al nombre, a la miniatura, a los permisos concedidos y al estado de las subidas. Almacenamos los tokens de acceso y de actualización de OAuth cifrados y los usamos únicamente para identificar tu canal, mantener la conexión y subir los videos que selecciones con el título, la descripción, la visibilidad y las opciones de audiencia que apruebes. No descargamos contenido audiovisual de YouTube a través de esta conexión ni utilizamos los datos de la API de YouTube para entrenar IA, para publicidad ni para venderlos.',
          'Puedes revocar el acceso desde los permisos de tu cuenta de Google o desconectar YouTube en los ajustes de conexión del Calendario. Al desconectar, se eliminan de inmediato las credenciales de YouTube almacenadas localmente, los metadatos del canal y los registros asociados de la API de publicación de YouTube. Los videos ya subidos permanecen en YouTube hasta que los elimines allí. Tus archivos originales subidos y los proyectos creados de forma independiente se rigen por los controles generales de conservación.',
          'Verificamos a diario la autorización de YouTube y actualizamos la información del canal. Si se revoca el acceso, se eliminan los datos de la API asociados; si no se puede verificar la autorización, esos datos se purgan en un plazo de siete días desde la última verificación. La información del canal almacenada se actualiza o se elimina en un plazo de treinta días. También puedes solicitar la eliminación en admin@sneepcut.com; las solicitudes sobre datos de usuario de la API de YouTube se atienden lo antes posible y en un plazo máximo de siete días naturales.',
          'El acceso, uso, almacenamiento y puesta en común de los datos de usuario de Google cumplen la Política de datos de usuario de los Servicios de API de Google, incluidos sus requisitos de uso limitado. Los datos solo se comparten con Google para la subida que solicitas y con los proveedores de servicios necesarios, con las garantías descritas en esta política.'
        ],
        links: [
          {
            label: 'Condiciones del Servicio de YouTube',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Política de privacidad de Google',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Permisos de la cuenta de Google',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: 'Importar tus propios videos de YouTube con Google Data Portability',
        paragraphs: [
          'Importar es una autorización independiente y opcional, distinta de la conexión de un canal de YouTube para publicar. Solo después de la información sobre la importación y de tu autorización explícita solicitamos permisos de Google Data Portability para los videos públicos, no listados o privados que elijas incluir. Estos permisos nos permiten copiar a tu cuenta de Sneep Cut los videos que subiste y sus metadatos asociados. No solicitamos tu contraseña de Google ni cookies del navegador para este flujo.',
          'Almacenamos los archivos de video importados, sus nombres, los metadatos de la exportación y el estado de la importación para ofrecerte tu biblioteca multimedia. Cuando seleccionas un video importado para crear clips, procesamos su video y audio para transcribir la voz, identificar los momentos destacados, reencuadrar, añadir subtítulos y renderizar los clips que pidas. Los proveedores de procesamiento necesarios pueden recibir el contenido multimedia o el texto derivado con las garantías descritas más abajo. No vendemos los datos, no los usamos para publicidad ni para entrenar modelos de IA de propósito general. Los datos de usuario de Google solo se utilizan para las funciones visibles para el usuario que se describen de forma clara, de acuerdo con la Política de datos de usuario y desarrollador de Google Data Portability y con los requisitos aplicables de uso limitado.',
          'Google prepara la exportación, lo que puede tardar minutos u horas. La disponibilidad depende de la elegibilidad de la cuenta de Google y del país, incluido Rumanía, donde la función es compatible; algunas cuentas administradas, protegidas o de menores pueden no cumplir los requisitos. Si esta importación no está disponible, puedes subir el video original.',
          'Puedes detener una importación desde Crear clips para impedir que se siga copiando. También puedes revocar el acceso desde las conexiones de tu cuenta de Google. Revocar el acceso o detener una importación no elimina los archivos ya copiados en Sneep Cut ni los videos de YouTube. Quita los videos importados de la biblioteca de importación para eliminar sus entradas y los archivos de origen no referenciados; los archivos de origen que siguen usando proyectos existentes o trabajos de procesamiento se rigen por los controles de conservación de esos proyectos. La eliminación de la cuenta y las solicitudes de eliminación de datos personales se aplican al contenido multimedia importado tal como se describe en esta política. Solo conservamos las credenciales de importación cifradas el tiempo necesario para completar la transferencia autorizada o el restablecimiento o la revocación de la autorización, incluidos los reintentos necesarios, y después las borramos. Al eliminar la cuenta, se borran de inmediato las credenciales de importación almacenadas localmente. No incluimos tokens ni URL temporales de descarga de Google en las exportaciones de la cuenta.'
        ],
        links: [
          { label: 'Política de Google Data Portability', href: 'https://developers.google.com/data-portability/policy' },
          { label: 'Conexiones de la cuenta de Google', href: 'https://myaccount.google.com/connections' },
          { label: 'Cuentas y países admitidos', href: 'https://support.google.com/accounts/answer/14452558' }
        ]
      },
      {
        title: '1. Responsable, funciones de encargado y alcance',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} es operado por ${LEGAL_OPERATOR.legalName}, registrada en Rumanía con CUI ${LEGAL_OPERATOR.taxId} y número de Registro Mercantil ${LEGAL_OPERATOR.tradeRegister}, con domicilio social en ${LEGAL_OPERATOR.address}. Para los datos de cuenta, seguridad, facturación y administración directa del servicio, la empresa normalmente actúa como responsable del tratamiento.`,
          'Cuando un cliente empresarial sube o conecta datos personales que controla y pide a Sneep Cut que los trate únicamente para prestar el servicio, el cliente es el responsable del tratamiento y Sneep Cut actúa como encargado. Al tratamiento se aplica el Acuerdo de Tratamiento de Datos. Las plataformas sociales pueden actuar como responsables independientes conforme a sus propios avisos.'
        ]
      },
      {
        title: '2. Datos que recopilamos y sus fuentes',
        bullets: [
          'Datos de cuenta e identidad: nombre, dirección de correo electrónico, hash de la contraseña, proveedor de autenticación, idioma preferido, zona horaria, ajustes de seguridad e identificadores de cuenta.',
          'Datos de contenido y de proyecto: videos, fotografías, audio, logotipos, activos de marca, guiones, prompts, transcripciones, subtítulos, ediciones, clips generados, ajustes de proyecto, estado de los trabajos y archivos subidos desde tu dispositivo.',
          'Datos de conexiones sociales: plataforma, identificadores de cuenta o de Página, nombre visible, nombre de usuario, URL del avatar, permisos concedidos, tokens de acceso o de actualización cifrados, caducidad del token y estado de la conexión. No recibimos tu contraseña de la plataforma social.',
          'Datos de publicación: destinos seleccionados, subtítulos, programaciones, orden de los contenidos, opciones de publicación, identificadores y URL de las publicaciones en la plataforma, marcas de tiempo, errores y estado del procesamiento.',
          'Datos de facturación: plan, créditos e identificadores de transacción, cliente, suscripción y factura recibidos de nuestro proveedor de pagos. Sneep Cut no almacena los datos completos de la tarjeta de pago.',
          'Datos técnicos y de seguridad: dirección IP o una representación protegida de la misma, información del navegador y del dispositivo, metadatos de sesión, marcas de tiempo de las solicitudes, eventos de seguridad, registros, diagnósticos y errores de la aplicación.',
          'Comunicaciones y preferencias: mensajes de soporte, solicitudes de privacidad, comentarios, preferencias de notificación y consentimiento de marketing cuando se solicite.'
        ],
        paragraphs: [
          'Recibimos estos datos directamente de ti, de tu dispositivo y navegador, de los proveedores de autenticación, pago y plataformas sociales que decidas conectar, y de nuestros sistemas mientras usas el servicio. Los campos obligatorios se indican en la interfaz. Sin los datos necesarios para una cuenta, un tratamiento solicitado o una conexión con una plataforma, es posible que no podamos prestar esa función.'
        ]
      },
      {
        title: '3. Por qué utilizamos los datos y nuestras bases jurídicas',
        bullets: [
          'Ejecución del contrato: crear y proteger tu cuenta; recibir y procesar contenido multimedia; generar, editar, exportar, programar y publicar contenido; conectar los servicios solicitados; proporcionar créditos, planes, controles de facturación, soporte y herramientas de exportación o eliminación de datos.',
          'Intereses legítimos: proteger las cuentas y la infraestructura; prevenir el fraude, el spam y los abusos; diagnosticar fallos; mantener la fiabilidad del servicio; conservar registros operativos proporcionados; defender reclamaciones legales; y mejorar la usabilidad. Ponderamos estos intereses frente a tus derechos.',
          'Obligaciones legales: conservar registros contables y fiscales, responder a solicitudes legales válidas, cumplir obligaciones de sanciones o de prevención del fraude, y cumplir las obligaciones de protección de consumidores y de datos.',
          'Consentimiento: comunicaciones de marketing opcionales, almacenamiento no esencial en el dispositivo si se introduce, y cualquier otra función que solicite expresamente el consentimiento. Puedes retirar el consentimiento en cualquier momento sin afectar al tratamiento lícito previo.'
        ],
        paragraphs: [
          'No vendemos datos personales. No utilizamos el contenido multimedia subido para publicidad de terceros ni para entrenar nuestros propios modelos de IA de propósito general.'
        ]
      },
      {
        title: '4. Tratamiento asistido por IA',
        paragraphs: [
          'Sneep Cut utiliza herramientas automatizadas para ayudar a transcribir, identificar posibles momentos destacados, reencuadrar, añadir subtítulos y editar contenido. Según la función seleccionada y la configuración vigente, el texto derivado del contenido, los prompts, las instrucciones o un contexto limitado del proyecto pueden enviarse a un proveedor de servicios de IA indicado en nuestra página de Subencargados. También pueden utilizarse componentes de procesamiento locales.',
          'Las sugerencias pueden ser inexactas o no ser adecuadas. Tú decides qué conservar, editar, exportar o publicar. Sneep Cut no toma decisiones que produzcan efectos jurídicos o efectos igualmente significativos sobre ti basándose únicamente en medios automatizados.'
        ]
      },
      {
        title: '5. Cuentas conectadas y publicación en redes sociales',
        paragraphs: [
          'Cuando conectas Instagram, una Página de Facebook, TikTok, YouTube u otro destino compatible, utilizamos la autorización y los permisos que apruebas para identificar las cuentas elegibles y prestar el flujo de trabajo solicitado. Accedemos solo a los datos y acciones permitidos por los permisos concedidos y por la función actual del producto.',
          'Cuando eliges Publicar ahora, o programas deliberadamente una publicación, Sneep Cut envía las fotografías, videos, carruseles, subtítulos, la programación y las opciones de plataforma seleccionadas a los destinos que elegiste. Una publicación programada puede enviarse automáticamente en el momento que elegiste. Mostramos el estado de procesamiento y el estado final en la plataforma cuando está disponible.',
          'Al desconectar se elimina la autorización almacenada localmente y se impiden nuevos envíos a través de esa conexión. Una operación ya entregada a una plataforma puede completarse. Desconectar o eliminar tu cuenta de Sneep Cut no elimina automáticamente el contenido ya publicado en una plataforma de terceros. Cuando la API de la plataforma admite la eliminación y la solicitas explícitamente, Sneep Cut puede enviar esa eliminación; en caso contrario, debes eliminar la publicación en la plataforma.'
        ]
      },
      {
        title: '6. Destinatarios y proveedores de servicios',
        paragraphs: [
          'Solo comunicamos los datos razonablemente necesarios a proveedores de alojamiento y almacenamiento, autenticación, correo electrónico transaccional, tratamiento asistido por IA, procesamiento de pagos, seguridad y soporte técnico. Las categorías y los proveedores actuales se describen en la página de Subencargados.',
          'Cuando conectas o publicas en una plataforma social, la plataforma correspondiente recibe los datos como servicio independiente conforme a su propia política de privacidad y sus propias condiciones. También podemos comunicar datos a asesores profesionales, autoridades competentes, tribunales o a un sucesor en una operación societaria cuando sea legalmente exigible y esté debidamente protegido.'
        ]
      },
      {
        title: '7. Transferencias internacionales',
        paragraphs: [
          'Nuestro alojamiento principal de producción está en Alemania. Algunos proveedores opcionales o plataformas sociales pueden tratar datos fuera de Rumanía o del Espacio Económico Europeo. Cuando una transferencia requiere una garantía, nos basamos en una decisión de adecuación aplicable, en Cláusulas Contractuales Tipo aprobadas u otro mecanismo de transferencia lícito, junto con medidas complementarias cuando proceda. Puedes contactarnos para obtener información sobre la garantía correspondiente.'
        ]
      },
      {
        title: '8. Conservación y eliminación',
        bullets: [
          'Los datos de cuenta, de proyectos, de contenido multimedia y del historial de publicaciones se conservan, en general, mientras tu cuenta esté activa o hasta que elimines el elemento o la cuenta, salvo que se muestre un plazo de caducidad más corto del producto.',
          'Los valores de estado de OAuth caducan al cabo de la breve ventana de autorización. Las credenciales sociales se conservan hasta que desconectes, caduquen, se revoque el acceso o se elimine la cuenta.',
          'Los registros de seguridad y de diagnóstico se conservan solo durante el tiempo razonablemente necesario para investigar incidentes, prevenir abusos y mantener el servicio.',
          'Las facturas y las pruebas de pagos, contabilidad y transacciones pueden conservarse durante el período que exijan las leyes fiscales, contables, antifraude y de prescripción.',
          'Los datos de copias de seguridad protegidas, si existen, no se utilizan para operaciones ordinarias y se eliminan o sobrescriben según el ciclo de vida de copias de seguridad aplicable, salvo que la conservación sea legalmente obligatoria.'
        ],
        paragraphs: [
          'La conservación se determina según el tipo de registro, su finalidad operativa, las obligaciones contractuales y legales, su sensibilidad, el riesgo y si hay una disputa o una investigación de seguridad abierta. Consulta Eliminación de datos para conocer los controles disponibles.'
        ]
      },
      {
        title: '9. Tus derechos en materia de protección de datos',
        bullets: [
          'Solicitar acceso a tus datos personales y una copia de los mismos.',
          'Rectificar los datos personales inexactos o incompletos.',
          'Solicitar la supresión o la limitación cuando se cumplan las condiciones legales.',
          'Oponerte al tratamiento basado en intereses legítimos, incluido el marketing directo.',
          'Recibir los datos que nos proporcionaste en un formato estructurado, de uso común y legible por máquina, cuando sea aplicable la portabilidad.',
          'Retirar el consentimiento en cualquier momento cuando el tratamiento se base en el consentimiento.',
          'Presentar una reclamación ante la Autoridad Nacional de Supervisión del Tratamiento de Datos Personales de Rumanía (ANSPDCP) o ante tu autoridad de control local.'
        ],
        paragraphs: [
          'Los controles de exportación y eliminación de la cuenta están disponibles en Panel → Ajustes → Datos y privacidad. También puedes escribirnos por correo electrónico. Podemos solicitar la información proporcionada necesaria para verificar tu identidad y normalmente respondemos en el plazo de un mes, sujeto a las prórrogas legales.'
        ],
        links: [
          {
            label: 'Autoridad rumana de protección de datos (ANSPDCP)',
            href: 'https://www.dataprotection.ro/'
          }
        ]
      },
      {
        title: '10. Seguridad',
        paragraphs: [
          'Aplicamos medidas adecuadas al servicio y al riesgo, incluidos el transporte cifrado, el hash de contraseñas, los controles de acceso, las credenciales sociales cifradas, el acceso firmado a los archivos, la limitación de solicitudes, el análisis antimalware de las subidas, el aislamiento de servicios y el acceso restringido a producción. Ningún sistema puede garantizar una seguridad absoluta. Usa una contraseña fuerte y única, activa los controles de seguridad disponibles y notifícanos sin demora cualquier sospecha de acceso no autorizado.'
        ]
      },
      {
        title: '11. Menores, cookies y cambios',
        paragraphs: [
          'Sneep Cut no está dirigido a menores de 16 años y no recopilamos a sabiendas sus datos. Si consideras que un menor ha proporcionado datos sin una autorización válida, contáctanos para que podamos investigarlo y eliminarlos cuando sea obligatorio.',
          'Actualmente utilizamos almacenamiento del navegador estrictamente necesario y funcional, descrito en la Política de cookies. Si se introducen tecnologías de análisis o marketing no esenciales, solicitaremos el consentimiento cuando sea necesario.',
          'Podemos actualizar esta política cuando cambien el servicio, los proveedores o la ley. Publicaremos la nueva fecha y proporcionaremos un aviso adicional para los cambios sustanciales cuando sea obligatorio.'
        ]
      }
    ],
    contactTitle: '12. Contacto',
    contactPrompt: `Para consultas o solicitudes sobre privacidad, contacta con ${LEGAL_OPERATOR.legalName} en`,
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}

export const TERMS_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Terms of Service',
    updated: updated.en,
    intro:
      'These Terms govern access to Sneep Cut. By creating an account or using the service, you enter into an agreement with GENESIS PROCUREMENT S.R.L. Please read the linked policies together with these Terms.',
    sections: [
      {
        title: 'YouTube API Services and Google user data',
        paragraphs: [
          'Sneep Cut uses YouTube API Services. By using these features you agree to the YouTube Terms of Service. Google processes information under its Privacy Policy.',
          'With your authorization, we access channel identifiers, name, thumbnail, granted permissions and upload status. We store OAuth access and refresh tokens encrypted and use them only to identify your channel, maintain the connection, and upload videos you select with the title, description, visibility and audience choices you approve. We do not download YouTube audiovisual content through this connection or use YouTube API data for AI training, advertising or sale.',
          'You may revoke access through Google account permissions or disconnect YouTube in the Calendar connection settings. Disconnecting immediately deletes locally stored YouTube credentials, channel metadata and associated YouTube publishing API records. Videos already uploaded remain on YouTube until you delete them there. Your original uploaded files and independently created projects follow the general retention controls.',
          'We validate YouTube authorization and refresh channel information daily. If access is revoked, the associated API data is deleted; if authorization cannot be verified, that data is purged within seven days of the last verification. Stored channel information is refreshed or deleted within thirty days. You may also request deletion at admin@sneepcut.com; YouTube API user-data requests are fulfilled as soon as possible and within seven calendar days.',
          'Access, use, storage and sharing of Google user data comply with the Google API Services User Data Policy, including its Limited Use requirements. Data is shared only with Google for your requested upload and necessary service providers under the safeguards described in this policy.'
        ],
        links: [
          {
            label: 'YouTube Terms of Service',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Google Privacy Policy',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Google account permissions',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: '1. Operator and agreement',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} is a service of ${LEGAL_OPERATOR.legalName}, CUI ${LEGAL_OPERATOR.taxId}, Trade Register ${LEGAL_OPERATOR.tradeRegister}, registered office ${LEGAL_OPERATOR.address}. These Terms, the Privacy Policy, Acceptable Use Policy, Refund and Cancellation Policy, and the order information shown at checkout form the applicable agreement.`,
          'If you use Sneep Cut for an organization, you confirm that you have authority to bind it. Consumer rights that cannot be waived remain unaffected.'
        ]
      },
      {
        title: '2. Eligibility and account security',
        paragraphs: [
          'You must be at least 18 years old or otherwise have legal capacity to enter this agreement. Provide accurate information, keep credentials confidential, use available security controls, and notify us promptly of suspected unauthorized use. You are responsible for activity through your account except where mandatory law provides otherwise.'
        ]
      },
      {
        title: '3. Service and AI-assisted results',
        paragraphs: [
          'Sneep Cut provides tools to upload or import media, identify possible highlights, generate short clips, transcribe, caption, reframe, edit, export, schedule, and publish content to supported destinations. Features and supported formats may change as the service evolves.',
          'AI-assisted output is a suggestion, may be inaccurate, incomplete, or unsuitable, and must be reviewed before use. You remain responsible for editorial decisions, factual claims, disclosures, rights clearances, and the content you export or publish. Sneep Cut does not provide legal, medical, financial, or professional advice.'
        ]
      },
      {
        title: '4. Your content and permissions',
        paragraphs: [
          'You retain ownership of your content. You grant us a worldwide, non-exclusive, limited licence to host, copy, transmit, format, transform, and otherwise process it only as reasonably needed to operate, secure, support, and improve the service for you. This licence ends when the content is deleted, subject to legal retention, protected backups, and completed publications.',
          'You confirm that you have all rights, licences, consents, releases, and lawful bases needed for uploaded material, people depicted or heard, music, trademarks, personal data, prompts, and requested publications. Do not upload confidential information unless you are authorized to use the service for it.'
        ]
      },
      {
        title: '5. Connected platforms and publishing',
        paragraphs: [
          'Connecting a platform does not transfer ownership of that account. You authorize Sneep Cut to use the permissions you approve solely for the features you request. You must comply with the destination platform’s terms, policies, technical limits, and disclosure requirements.',
          'You control the selected media, destinations, caption, options, and publish-now or scheduled action. Scheduled posts may be submitted automatically at the time you selected. Platform review, processing, availability, rejection, removal, or later policy changes remain outside our control. Always verify the final post and avoid duplicate submission if a result is temporarily unknown.'
        ]
      },
      {
        title: '6. Plans, credits, prices, and payment',
        paragraphs: [
          'The pricing and checkout screens identify the selected product, currency, billing period, included features or credits, renewal terms, and applicable taxes before purchase. Payment is handled by the displayed payment provider. Paid subscriptions renew for the stated period until cancelled.',
          'Credits are service-use units, not money, securities, or transferable property. The product interface identifies the current credit cost before a chargeable operation. Credits may have plan-specific renewal, rollover, or expiry rules shown with the offer. A technical failure should not result in a completed-service charge; if the displayed balance appears incorrect, contact support for review.',
          'You authorize applicable charges and must keep billing information current. We may suspend paid features after a failed payment. Cancellation, statutory withdrawal, refunds, duplicate charges, and processing errors are governed by the Refund and Cancellation Policy and mandatory law.'
        ]
      },
      {
        title: '7. Acceptable use',
        paragraphs: [
          'You must follow the Acceptable Use Policy. In particular, do not process content without authorization, violate intellectual-property or privacy rights, deceive or impersonate unlawfully, exploit minors, distribute malware, bypass security or quotas, spam platforms, or use Sneep Cut for unlawful or harmful activity.'
        ]
      },
      {
        title: '8. Sneep Cut intellectual property and feedback',
        paragraphs: [
          'The service, software, interface, branding, documentation, templates, and all related rights other than your content belong to us or our licensors. We grant you a limited, revocable, non-transferable right to use the service during the agreement. You may not copy, sell, reverse engineer, or create an unauthorized competing service except where applicable law expressly permits it.',
          'If you provide feedback, you allow us to use it without restriction or compensation, but we will not identify you publicly without permission.'
        ]
      },
      {
        title: '9. Third-party services',
        paragraphs: [
          'Authentication, payment, AI, hosting, social platforms, and other integrations are third-party services governed by their own terms. We are not responsible for their independent content, outages, account decisions, or policy enforcement. The Privacy Policy explains how data is shared when you use an integration.'
        ]
      },
      {
        title: '10. Availability, changes, and beta features',
        paragraphs: [
          'Processing time and availability depend on source material, queues, maintenance, and external providers. We may update, add, restrict, or discontinue features. Where reasonably possible, we will provide advance notice of a material reduction to an active paid service. Preview or beta features may be changed or withdrawn and may be less reliable.'
        ]
      },
      {
        title: '11. Suspension, termination, and data',
        paragraphs: [
          'You may stop using the service, cancel renewal, disconnect platforms, and request account deletion through the available controls. We may restrict or suspend access where reasonably necessary for a material breach, unlawful activity, non-payment, security risk, harm to the service or others, or compliance with law. We will provide notice and an opportunity to remedy when appropriate.',
          'Termination does not remove obligations or rights that by nature survive, including payment due, ownership, liability limits, and dispute provisions. Data is handled after termination as described in the Privacy Policy and Data Deletion instructions.'
        ]
      },
      {
        title: '12. Warranties and responsibility',
        paragraphs: [
          'We provide the service with reasonable care and skill. To the maximum extent permitted by law, we do not guarantee uninterrupted availability, a specific creative outcome, platform acceptance, or that every AI-assisted result is accurate or free of third-party claims. You are responsible for keeping copies of important source material and reviewing outputs before publication.',
          'Nothing in these Terms excludes liability that cannot legally be excluded, including mandatory consumer remedies. For business users, to the extent permitted by law, neither party is liable for indirect or consequential loss, and our aggregate liability arising from the service is limited to the amount paid for the affected service during the 12 months before the event. This limit does not apply to fraud, wilful misconduct, confidentiality breaches, data-protection liability that cannot be limited, or payment obligations.'
        ]
      },
      {
        title: '13. Governing law and disputes',
        paragraphs: [
          'Romanian law governs this agreement, without depriving an EEA consumer of mandatory protection available in the consumer’s country of residence. Consumers may bring proceedings before courts competent under applicable consumer law. For disputes involving only business users, the competent courts in Timiș County, Romania have jurisdiction unless the parties agree otherwise.',
          'Please contact us first so we can try to resolve a complaint. Eligible Romanian consumers may also use the ANPC alternative dispute resolution service. The former EU Online Dispute Resolution platform was discontinued in 2025 and is not presented as an available channel.'
        ],
        links: [
          {
            label: 'ANPC alternative dispute resolution (SAL)',
            href: 'https://reclamatiisal.anpc.ro/'
          }
        ]
      },
      {
        title: '14. Changes and notices',
        paragraphs: [
          'We may update these Terms for legal, security, provider, or product changes. We will publish the revision date and give additional notice before material changes take effect where required. Continued use after the effective date constitutes acceptance only to the extent permitted by law. Notices may be sent to the account email or displayed in the service.'
        ]
      }
    ],
    contactTitle: '15. Contact',
    contactPrompt: `Questions or complaints for ${LEGAL_OPERATOR.legalName}:`,
    contactFallback: LEGAL_OPERATOR.email
  },
  ro: {
    title: 'Termeni și condiții',
    updated: updated.ro,
    intro:
      'Acești Termeni reglementează accesul la Sneep Cut. Prin crearea unui cont sau utilizarea serviciului închei un acord cu GENESIS PROCUREMENT S.R.L. Citește și politicile menționate împreună cu acești Termeni.',
    sections: [
      {
        title: 'Serviciile API YouTube și datele utilizatorilor Google',
        paragraphs: [
          'Sneep Cut utilizează serviciile API YouTube. Prin utilizarea acestor funcții accepți Termenii YouTube. Google prelucrează informațiile conform Politicii sale de confidențialitate.',
          'Cu autorizarea ta, accesăm identificatorii canalului, numele, miniatura, permisiunile acordate și starea încărcărilor. Stocăm criptat tokenurile OAuth de acces și reînnoire și le folosim numai pentru identificarea canalului, menținerea conexiunii și încărcarea videoclipurilor selectate de tine cu titlul, descrierea, vizibilitatea și opțiunile de audiență aprobate. Nu descărcăm conținut audiovizual YouTube prin această conexiune și nu folosim datele API YouTube pentru antrenarea AI, publicitate sau vânzare.',
          'Poți revoca accesul din permisiunile contului Google sau deconecta YouTube din setările conexiunilor din Calendar. Deconectarea șterge imediat credențialele YouTube, metadatele canalului și înregistrările API ale publicărilor YouTube stocate local. Videoclipurile încărcate rămân pe YouTube până când le ștergi acolo. Fișierele originale încărcate și proiectele create independent urmează regulile generale de retenție.',
          'Verificăm zilnic autorizarea YouTube și actualizăm informațiile canalului. Dacă accesul este revocat, datele API asociate sunt șterse; dacă autorizarea nu poate fi verificată, datele sunt eliminate în maximum șapte zile de la ultima verificare. Informațiile canalului sunt actualizate sau șterse în maximum treizeci de zile. Poți solicita ștergerea și la admin@sneepcut.com; cererile privind datele API YouTube sunt îndeplinite cât mai repede, în maximum șapte zile calendaristice.',
          'Accesarea, utilizarea, stocarea și partajarea datelor Google respectă Google API Services User Data Policy, inclusiv cerințele Limited Use. Datele sunt partajate numai cu Google pentru încărcarea cerută și cu furnizorii necesari serviciului, conform garanțiilor din această politică.'
        ],
        links: [
          {
            label: 'YouTube Terms of Service',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Google Privacy Policy',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Google account permissions',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: '1. Operator și acord',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} este un serviciu al ${LEGAL_OPERATOR.legalName}, CUI ${LEGAL_OPERATOR.taxId}, Registrul Comerțului ${LEGAL_OPERATOR.tradeRegister}, sediul social ${LEGAL_OPERATOR.address}. Acești Termeni, Politica de confidențialitate, Politica de utilizare acceptabilă, Politica de anulare și rambursare și informațiile comenzii afișate la plată formează acordul aplicabil.`,
          'Dacă folosești Sneep Cut pentru o organizație, confirmi că ai autoritatea de a o obliga. Drepturile consumatorilor care nu pot fi înlăturate rămân neafectate.'
        ]
      },
      {
        title: '2. Eligibilitate și securitatea contului',
        paragraphs: [
          'Trebuie să ai cel puțin 18 ani sau capacitatea legală de a încheia acordul. Furnizează informații corecte, păstrează confidențiale datele de acces, folosește controalele de securitate și anunță-ne rapid dacă suspectezi utilizare neautorizată. Răspunzi pentru activitatea din cont, cu excepția situațiilor în care legea obligatorie prevede altfel.'
        ]
      },
      {
        title: '3. Serviciul și rezultatele asistate de AI',
        paragraphs: [
          'Sneep Cut oferă instrumente pentru încărcarea sau importarea fișierelor, identificarea momentelor, generarea de clipuri scurte, transcriere, subtitrare, reîncadrare, editare, export, programare și publicare către destinații acceptate. Funcțiile și formatele se pot schimba pe măsură ce serviciul evoluează.',
          'Rezultatul asistat de AI este o sugestie, poate fi inexact, incomplet sau nepotrivit și trebuie verificat înainte de folosire. Tu răspunzi pentru deciziile editoriale, afirmațiile factuale, informările, drepturile și conținutul exportat ori publicat. Sneep Cut nu oferă consultanță juridică, medicală, financiară sau profesională.'
        ]
      },
      {
        title: '4. Conținutul și permisiunile tale',
        paragraphs: [
          'Păstrezi drepturile asupra conținutului. Ne acorzi o licență mondială, neexclusivă și limitată pentru găzduire, copiere, transmitere, formatare, transformare și altă prelucrare numai cât este rezonabil necesar pentru operarea, securizarea, sprijinirea și îmbunătățirea serviciului pentru tine. Licența încetează la ștergere, sub rezerva păstrării legale, copiilor protejate și publicărilor finalizate.',
          'Confirmi că ai toate drepturile, licențele, consimțămintele, acordurile și temeiurile necesare pentru materiale, persoanele vizibile ori audibile, muzică, mărci, date personale, prompturi și publicări. Nu încărca informații confidențiale dacă nu ești autorizat să folosești serviciul pentru acestea.'
        ]
      },
      {
        title: '5. Platforme conectate și publicare',
        paragraphs: [
          'Conectarea unei platforme nu transferă drepturile asupra contului. Autorizezi Sneep Cut să folosească permisiunile aprobate numai pentru funcțiile solicitate. Trebuie să respecți termenii, politicile, limitele tehnice și cerințele de informare ale platformei de destinație.',
          'Tu controlezi fișierele, destinațiile, descrierea, opțiunile și acțiunea de publicare imediată sau programată. Postările programate pot fi trimise automat la momentul ales. Verificarea, procesarea, disponibilitatea, respingerea ori eliminarea de către platformă rămân în afara controlului nostru. Verifică postarea finală și evită retrimiterea când rezultatul este temporar necunoscut.'
        ]
      },
      {
        title: '6. Planuri, credite, prețuri și plată',
        paragraphs: [
          'Ecranele de preț și plată indică produsul ales, moneda, perioada de facturare, funcțiile sau creditele incluse, reînnoirea și taxele aplicabile înainte de cumpărare. Plata este gestionată de furnizorul afișat. Abonamentele plătite se reînnoiesc pentru perioada indicată până la anulare.',
          'Creditele sunt unități de utilizare a serviciului, nu bani, titluri ori bunuri transferabile. Interfața indică prețul curent în credite înainte de o operațiune taxabilă. Creditele pot avea reguli specifice planului privind reînnoirea, reportarea sau expirarea, afișate împreună cu oferta. Un eșec tehnic nu ar trebui să ducă la taxarea unui serviciu finalizat; dacă soldul pare incorect, contactează asistența pentru verificare.',
          'Autorizezi taxele aplicabile și trebuie să menții datele de facturare actualizate. Putem suspenda funcțiile plătite după o plată eșuată. Anularea, retragerea legală, rambursările, taxele duplicate și erorile sunt reglementate de Politica de anulare și rambursare și legea obligatorie.'
        ]
      },
      {
        title: '7. Utilizare acceptabilă',
        paragraphs: [
          'Trebuie să respecți Politica de utilizare acceptabilă. Nu prelucra conținut fără autorizare, nu încălca drepturi de proprietate intelectuală sau viață privată, nu înșela și nu uzurpa identități ilegal, nu exploata minori, nu distribui programe malițioase, nu ocoli securitatea ori cotele, nu face spam și nu folosi Sneep Cut pentru activități ilegale sau dăunătoare.'
        ]
      },
      {
        title: '8. Proprietatea intelectuală Sneep Cut și feedback',
        paragraphs: [
          'Serviciul, software-ul, interfața, marca, documentația, șabloanele și drepturile aferente, cu excepția conținutului tău, aparțin nouă ori licențiatorilor. Primești un drept limitat, revocabil și netransferabil de utilizare pe durata acordului. Nu poți copia, vinde, face inginerie inversă ori crea un serviciu concurent neautorizat, exceptând situațiile permise expres de lege.',
          'Dacă oferi feedback, ne permiți să îl folosim fără restricții sau compensație, dar nu te vom identifica public fără acord.'
        ]
      },
      {
        title: '9. Servicii terțe',
        paragraphs: [
          'Autentificarea, plata, AI-ul, găzduirea, platformele sociale și alte integrări sunt servicii terțe supuse propriilor termeni. Nu răspundem pentru conținutul lor independent, întreruperi, decizii privind contul ori aplicarea politicilor. Politica de confidențialitate explică transmiterea datelor când folosești o integrare.'
        ]
      },
      {
        title: '10. Disponibilitate, schimbări și funcții beta',
        paragraphs: [
          'Timpul de procesare și disponibilitatea depind de material, cozi, mentenanță și furnizori externi. Putem actualiza, adăuga, restricționa ori elimina funcții. Când este rezonabil posibil, vom anunța în avans o reducere importantă a unui serviciu plătit activ. Funcțiile preview sau beta pot fi mai puțin fiabile și pot fi modificate ori retrase.'
        ]
      },
      {
        title: '11. Suspendare, încetare și date',
        paragraphs: [
          'Poți opri utilizarea, anula reînnoirea, deconecta platformele și solicita ștergerea contului prin controalele disponibile. Putem restricționa ori suspenda accesul când este rezonabil necesar pentru o încălcare importantă, activitate ilegală, neplată, risc de securitate, prejudicierea serviciului ori respectarea legii. Vom oferi notificare și posibilitate de remediere când este adecvat.',
          'Încetarea nu elimină obligațiile sau drepturile care, prin natura lor, continuă, inclusiv plata datorată, proprietatea, limitele de răspundere și soluționarea litigiilor. Datele sunt gestionate ulterior conform Politicii de confidențialitate și instrucțiunilor de Ștergere a datelor.'
        ]
      },
      {
        title: '12. Garanții și răspundere',
        paragraphs: [
          'Furnizăm serviciul cu grija și competența rezonabile. În limita permisă de lege, nu garantăm disponibilitate neîntreruptă, un rezultat creativ anume, acceptarea de către platforme sau că fiecare rezultat AI este exact ori lipsit de pretenții ale terților. Păstrează copii ale materialelor importante și verifică rezultatele înainte de publicare.',
          'Nimic din Termeni nu exclude răspunderea care nu poate fi exclusă legal, inclusiv remediile obligatorii ale consumatorilor. Pentru utilizatorii business, în limita legii, niciuna dintre părți nu răspunde pentru pierderi indirecte, iar răspunderea noastră totală este limitată la suma plătită pentru serviciul afectat în cele 12 luni anterioare evenimentului. Limita nu se aplică fraudei, intenției, încălcării confidențialității, răspunderii privind datele care nu poate fi limitată sau obligațiilor de plată.'
        ]
      },
      {
        title: '13. Legea aplicabilă și litigii',
        paragraphs: [
          'Acordul este guvernat de legea română, fără a priva un consumator din SEE de protecția obligatorie din țara sa de reședință. Consumatorii se pot adresa instanțelor competente potrivit legii. Pentru litigii exclusiv între profesioniști, sunt competente instanțele din județul Timiș, dacă părțile nu convin altfel.',
          'Contactează-ne mai întâi pentru a încerca soluționarea reclamației. Consumatorii români eligibili pot folosi și serviciul ANPC de soluționare alternativă a litigiilor. Fosta platformă europeană de soluționare online a litigiilor a fost închisă în 2025 și nu este prezentată ca opțiune disponibilă.'
        ],
        links: [
          {
            label: 'Soluționarea alternativă a litigiilor ANPC (SAL)',
            href: 'https://reclamatiisal.anpc.ro/'
          }
        ]
      },
      {
        title: '14. Modificări și notificări',
        paragraphs: [
          'Putem actualiza Termenii pentru schimbări legale, de securitate, furnizori sau produs. Vom publica data revizuirii și vom oferi notificări suplimentare înainte de schimbări importante, când este necesar. Continuarea utilizării după data intrării în vigoare reprezintă acceptare numai în limita permisă de lege. Notificările pot fi trimise la e-mailul contului ori afișate în serviciu.'
        ]
      }
    ],
    contactTitle: '15. Contact',
    contactPrompt: `Întrebări sau reclamații pentru ${LEGAL_OPERATOR.legalName}:`,
    contactFallback: LEGAL_OPERATOR.email
  },
  es: {
    title: 'Condiciones del servicio',
    updated: updated.es,
    intro:
      'Estas Condiciones regulan el acceso a Sneep Cut. Al crear una cuenta o usar el servicio, celebras un acuerdo con GENESIS PROCUREMENT S.R.L. Lee las políticas enlazadas junto con estas Condiciones.',
    sections: [
      {
        title: 'Servicios de la API de YouTube y datos de usuario de Google',
        paragraphs: [
          'Sneep Cut utiliza los Servicios de la API de YouTube. Al usar estas funciones aceptas las Condiciones del Servicio de YouTube. Google trata la información conforme a su Política de privacidad.',
          'Con tu autorización, accedemos a los identificadores del canal, al nombre, a la miniatura, a los permisos concedidos y al estado de las subidas. Almacenamos los tokens de acceso y de actualización de OAuth cifrados y los usamos únicamente para identificar tu canal, mantener la conexión y subir los videos que selecciones con el título, la descripción, la visibilidad y las opciones de audiencia que apruebes. No descargamos contenido audiovisual de YouTube a través de esta conexión ni utilizamos los datos de la API de YouTube para entrenar IA, para publicidad ni para venderlos.',
          'Puedes revocar el acceso desde los permisos de tu cuenta de Google o desconectar YouTube en los ajustes de conexión del Calendario. Al desconectar, se eliminan de inmediato las credenciales de YouTube almacenadas localmente, los metadatos del canal y los registros asociados de la API de publicación de YouTube. Los videos ya subidos permanecen en YouTube hasta que los elimines allí. Tus archivos originales subidos y los proyectos creados de forma independiente se rigen por los controles generales de conservación.',
          'Verificamos a diario la autorización de YouTube y actualizamos la información del canal. Si se revoca el acceso, se eliminan los datos de la API asociados; si no se puede verificar la autorización, esos datos se purgan en un plazo de siete días desde la última verificación. La información del canal almacenada se actualiza o se elimina en un plazo de treinta días. También puedes solicitar la eliminación en admin@sneepcut.com; las solicitudes sobre datos de usuario de la API de YouTube se atienden lo antes posible y en un plazo máximo de siete días naturales.',
          'El acceso, uso, almacenamiento y puesta en común de los datos de usuario de Google cumplen la Política de datos de usuario de los Servicios de API de Google, incluidos sus requisitos de uso limitado. Los datos solo se comparten con Google para la subida que solicitas y con los proveedores de servicios necesarios, con las garantías descritas en esta política.'
        ],
        links: [
          {
            label: 'Condiciones del Servicio de YouTube',
            href: 'https://www.youtube.com/t/terms'
          },
          {
            label: 'Política de privacidad de Google',
            href: 'https://policies.google.com/privacy'
          },
          {
            label: 'Permisos de la cuenta de Google',
            href: 'https://myaccount.google.com/permissions'
          }
        ]
      },
      {
        title: '1. Operador y acuerdo',
        paragraphs: [
          `${LEGAL_OPERATOR.brand} es un servicio de ${LEGAL_OPERATOR.legalName}, CUI ${LEGAL_OPERATOR.taxId}, Registro Mercantil ${LEGAL_OPERATOR.tradeRegister}, domicilio social ${LEGAL_OPERATOR.address}. Estas Condiciones, la Política de privacidad, la Política de uso aceptable, la Política de cancelación y reembolso, y la información del pedido que se muestra al pagar constituyen el acuerdo aplicable.`,
          'Si utilizas Sneep Cut en nombre de una organización, confirmas que tienes autoridad para obligarla. Los derechos de los consumidores que no pueden renunciarse no se ven afectados.'
        ]
      },
      {
        title: '2. Elegibilidad y seguridad de la cuenta',
        paragraphs: [
          'Debes tener al menos 18 años o tener de otro modo capacidad legal para celebrar este acuerdo. Facilita información veraz, mantén tus credenciales en confidencialidad, utiliza los controles de seguridad disponibles y notifícanos sin demora cualquier sospecha de uso no autorizado. Eres responsable de la actividad realizada a través de tu cuenta, salvo que la ley imperativa disponga otra cosa.'
        ]
      },
      {
        title: '3. Servicio y resultados asistidos por IA',
        paragraphs: [
          'Sneep Cut ofrece herramientas para subir o importar contenido multimedia, identificar posibles momentos destacados, generar clips cortos, transcribir, añadir subtítulos, reencuadrar, editar, exportar, programar y publicar contenido en destinos compatibles. Las funciones y los formatos compatibles pueden cambiar a medida que el servicio evoluciona.',
          'El resultado asistido por IA es una sugerencia, puede ser inexacto o incompleto, o no ser adecuado, y debe revisarse antes de usarse. Tú sigues siendo responsable de las decisiones editoriales, las afirmaciones de hecho, las advertencias, las autorizaciones de derechos y el contenido que exportes o publiques. Sneep Cut no ofrece asesoramiento jurídico, médico, financiero ni profesional.'
        ]
      },
      {
        title: '4. Tu contenido y permisos',
        paragraphs: [
          'Conservas la titularidad de tu contenido. Nos concedes una licencia mundial, no exclusiva y limitada para alojar, copiar, transmitir, dar formato, transformar y tratar de otro modo el contenido únicamente en la medida razonablemente necesaria para operar, proteger, dar soporte y mejorar el servicio para ti. Esta licencia termina cuando se elimina el contenido, sin perjuicio de la conservación legal, las copias de seguridad protegidas y las publicaciones ya completadas.',
          'Confirmas que tienes todos los derechos, licencias, consentimientos, autorizaciones y bases jurídicas necesarios para el material subido, las personas que aparecen o se escuchan en él, la música, las marcas, los datos personales, los prompts y las publicaciones solicitadas. No subas información confidencial salvo que estés autorizado a usar el servicio para ello.'
        ]
      },
      {
        title: '5. Plataformas conectadas y publicación',
        paragraphs: [
          'Conectar una plataforma no transfiere la titularidad de esa cuenta. Autorizas a Sneep Cut a utilizar los permisos que apruebes únicamente para las funciones que solicites. Debes cumplir las condiciones, las políticas, los límites técnicos y los requisitos de información de la plataforma de destino.',
          'Tú controlas el contenido multimedia seleccionado, los destinos, el subtítulo, las opciones y la acción de publicar ahora o programar. Las publicaciones programadas pueden enviarse automáticamente en el momento que hayas seleccionado. La revisión, el procesamiento, la disponibilidad, el rechazo, la retirada o los cambios posteriores de política de la plataforma escapan a nuestro control. Verifica siempre la publicación final y evita enviarla dos veces si el resultado es temporalmente desconocido.'
        ]
      },
      {
        title: '6. Planes, créditos, precios y pago',
        paragraphs: [
          'Las pantallas de precios y de pago indican, antes de la compra, el producto seleccionado, la moneda, el periodo de facturación, las funciones o créditos incluidos, las condiciones de renovación y los impuestos aplicables. El pago lo gestiona el proveedor de pagos que se muestra. Las suscripciones de pago se renuevan por el periodo indicado hasta que se cancelen.',
          'Los créditos son unidades de uso del servicio, no dinero, valores ni bienes transferibles. La interfaz del producto indica el coste actual en créditos antes de una operación con cargo. Los créditos pueden tener reglas de renovación, acumulación o caducidad específicas del plan, que se muestran con la oferta. Un fallo técnico no debería dar lugar al cobro de un servicio no prestado; si el saldo mostrado parece incorrecto, contacta con soporte para su revisión.',
          'Autorizas los cargos aplicables y debes mantener actualizados tus datos de facturación. Podemos suspender las funciones de pago tras un pago fallido. La cancelación, el desistimiento legal, los reembolsos, los cobros duplicados y los errores de procesamiento se rigen por la Política de cancelación y reembolso y por la ley imperativa.'
        ]
      },
      {
        title: '7. Uso aceptable',
        paragraphs: [
          'Debes cumplir la Política de uso aceptable. En particular, no proceses contenido sin autorización, no vulneres derechos de propiedad intelectual o de privacidad, no engañes ni suplantes ilegalmente a nadie, no explotes a menores, no distribuyas software malicioso, no eludas la seguridad ni las cuotas, no hagas spam en las plataformas, ni utilices Sneep Cut para actividades ilegales o dañinas.'
        ]
      },
      {
        title: '8. Propiedad intelectual de Sneep Cut y comentarios',
        paragraphs: [
          'El servicio, el software, la interfaz, la marca, la documentación, las plantillas y todos los derechos relacionados, distintos de tu contenido, pertenecen a nosotros o a nuestros licenciantes. Te concedemos un derecho limitado, revocable y no transferible a usar el servicio durante el acuerdo. No puedes copiar, vender, realizar ingeniería inversa ni crear un servicio competidor no autorizado, salvo cuando la ley aplicable lo permita expresamente.',
          'Si nos proporcionas comentarios, nos autorizas a utilizarlos sin restricción ni compensación, pero no te identificaremos públicamente sin tu permiso.'
        ]
      },
      {
        title: '9. Servicios de terceros',
        paragraphs: [
          'La autenticación, los pagos, la IA, el alojamiento, las plataformas sociales y otras integraciones son servicios de terceros regidos por sus propias condiciones. No somos responsables de su contenido independiente, de sus interrupciones, de sus decisiones sobre cuentas ni de la aplicación de sus políticas. La Política de privacidad explica cómo se comparten los datos cuando usas una integración.'
        ]
      },
      {
        title: '10. Disponibilidad, cambios y funciones beta',
        paragraphs: [
          'El tiempo de procesamiento y la disponibilidad dependen del material de origen, de las colas, del mantenimiento y de los proveedores externos. Podemos actualizar, añadir, restringir o descontinuar funciones. Cuando sea razonablemente posible, avisaremos con antelación de una reducción sustancial de un servicio de pago activo. Las funciones de vista previa o beta pueden modificarse o retirarse y pueden ser menos fiables.'
        ]
      },
      {
        title: '11. Suspensión, terminación y datos',
        paragraphs: [
          'Puedes dejar de usar el servicio, cancelar la renovación, desconectar plataformas y solicitar la eliminación de la cuenta mediante los controles disponibles. Podemos restringir o suspender el acceso cuando sea razonablemente necesario por un incumplimiento grave, actividad ilegal, impago, riesgo de seguridad, perjuicio al servicio o a terceros, o cumplimiento de la ley. Daremos aviso y una oportunidad de subsanar cuando proceda.',
          'La terminación no elimina las obligaciones o derechos que por su naturaleza subsisten, incluidos los pagos pendientes, la titularidad, los límites de responsabilidad y las disposiciones sobre controversias. Tras la terminación, los datos se gestionan como se describe en la Política de privacidad y en las instrucciones de Eliminación de datos.'
        ]
      },
      {
        title: '12. Garantías y responsabilidad',
        paragraphs: [
          'Prestamos el servicio con una diligencia y una pericia razonables. En la máxima medida permitida por la ley, no garantizamos una disponibilidad ininterrumpida, un resultado creativo concreto, la aceptación por parte de las plataformas, ni que cada resultado asistido por IA sea exacto o esté libre de reclamaciones de terceros. Eres responsable de conservar copias del material de origen importante y de revisar los resultados antes de publicarlos.',
          'Nada de estas Condiciones excluye la responsabilidad que no pueda excluirse legalmente, incluidos los recursos obligatorios de los consumidores. Para los usuarios empresariales, en la medida permitida por la ley, ninguna de las partes responde por pérdidas indirectas o consecuenciales, y nuestra responsabilidad agregada derivada del servicio se limita al importe pagado por el servicio afectado durante los 12 meses anteriores al hecho. Este límite no se aplica al fraude, a la conducta dolosa, a los incumplimientos de confidencialidad, a la responsabilidad en materia de protección de datos que no pueda limitarse, ni a las obligaciones de pago.'
        ]
      },
      {
        title: '13. Ley aplicable y controversias',
        paragraphs: [
          'Este acuerdo se rige por la ley rumana, sin privar a un consumidor del EEE de la protección imperativa disponible en el país de su residencia habitual. Los consumidores pueden presentar demandas ante los tribunales competentes conforme a la legislación aplicable en materia de consumo. En las controversias en las que intervengan únicamente usuarios empresariales, son competentes los tribunales del condado de Timiș (Rumanía), salvo que las partes acuerden otra cosa.',
          'Contáctanos primero para que podamos intentar resolver una reclamación. Los consumidores rumanos que cumplan los requisitos también pueden utilizar el servicio de resolución alternativa de litigios de la ANPC. La antigua plataforma europea de resolución de litigios en línea se discontinuó en 2025 y no se presenta como canal disponible.'
        ],
        links: [
          {
            label: 'Resolución alternativa de litigios de la ANPC (SAL)',
            href: 'https://reclamatiisal.anpc.ro/'
          }
        ]
      },
      {
        title: '14. Cambios y notificaciones',
        paragraphs: [
          'Podemos actualizar estas Condiciones por cambios legales, de seguridad, de proveedores o de producto. Publicaremos la fecha de revisión y daremos un aviso adicional antes de que entren en vigor los cambios sustanciales, cuando sea necesario. Seguir usando el servicio después de la fecha de entrada en vigor implica aceptación solo en la medida permitida por la ley. Las notificaciones pueden enviarse al correo electrónico de la cuenta o mostrarse en el servicio.'
        ]
      }
    ],
    contactTitle: '15. Contacto',
    contactPrompt: `Consultas o reclamaciones para ${LEGAL_OPERATOR.legalName}:`,
    contactFallback: LEGAL_OPERATOR.email
  }
}

export const DATA_DELETION_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Data Deletion Instructions',
    updated: updated.en,
    intro:
      'Use these instructions to delete individual content, disconnect a social account, delete published posts where supported, or request deletion of your Sneep Cut account and personal data.',
    sections: [
      {
        title: '1. Delete media or a project',
        paragraphs: [
          'Sign in, open the relevant project, clip, or calendar item, and choose its delete action. Confirm the request shown in the interface. Deleting a Sneep Cut item removes its application record and associated active media where supported. It does not automatically delete a post that already exists on a social platform.'
        ]
      },
      {
        title: '2. Disconnect Instagram, Facebook, TikTok, or YouTube',
        paragraphs: [
          'Open Publish or Calendar, locate Connected accounts, choose Disconnect for the account, and confirm. Sneep Cut removes the locally stored authorization and prevents new submissions through that connection. Pending work is cancelled where cancellation remains possible; a request already sent to a platform may still complete.',
          'You may also revoke Sneep Cut from the connected-app settings of the platform. Revoking access on the platform can take time to be reflected in Sneep Cut. Never send us a platform password, access token, recovery code, or one-time login code.'
        ]
      },
      {
        title: '3. Delete a published post',
        paragraphs: [
          'When deleting a calendar item, Sneep Cut shows platform-specific options. If a connected platform permits deletion through its API, you may explicitly select that destination and Sneep Cut will submit the deletion request. Instagram currently requires you to remove an already published post directly in Instagram. Other platforms may impose similar restrictions or reject a deletion request.',
          'Removing a post from a platform does not by itself delete the source media, project, account, or publishing history in Sneep Cut. Delete those separately if desired.'
        ]
      },
      {
        title: '4. Delete your Sneep Cut account',
        paragraphs: [
          'Open Dashboard → Settings → Data & Privacy, choose Delete account, complete the identity confirmation, and confirm the final warning. Deletion cancels active publishing authorizations and pending work where possible, removes social credentials and OAuth state, cleans up account media, and removes the account after billing cancellation and active processing have safely completed.',
          'If a temporary provider, billing, or processing condition prevents safe completion, the interface will ask you to retry. Your account is not reported as deleted until the operation completes.'
        ]
      },
      {
        title: '5. Request deletion if you cannot sign in',
        paragraphs: [
          `Email ${LEGAL_OPERATOR.privacyEmail} from the address associated with your account and state that you request account and personal-data deletion. Include only the account email and enough context to locate it. We may request proportionate identity verification. Do not include passwords, tokens, or login codes.`,
          'We acknowledge privacy requests and normally respond without undue delay and within one month where the GDPR applies, subject to permitted extensions for complex requests.'
        ]
      },
      {
        title: '6. What may remain',
        paragraphs: [
          'Deletion does not remove posts already delivered to third-party platforms unless you separately delete them. We may retain limited invoices, transaction evidence, security records, deletion evidence, or data required for legal claims for the period required by applicable law.',
          'Residual copies in protected backups, if present, are not returned to ordinary use and are removed or overwritten according to the applicable backup lifecycle, unless preservation is legally required. If a backup is restored, deletion controls and records are used to prevent deleted data from returning to active use.'
        ]
      },
      {
        title: '7. Meta and connected-platform data',
        paragraphs: [
          'The same account-deletion process covers Meta account and Page identifiers, profile information made available by the approved permissions, encrypted access credentials, permission scopes, publishing destinations, captions, platform post identifiers, and status history held in your Sneep Cut account, subject to the limited retention exceptions above.',
          'This public page provides user-facing deletion instructions. It is not a request for your Facebook or Instagram credentials and does not replace the platform’s own account-deletion controls.'
        ]
      }
    ],
    contactTitle: '8. Help with deletion',
    contactPrompt: 'Send a deletion or status request to',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Instrucțiuni pentru ștergerea datelor',
    updated: updated.ro,
    intro:
      'Folosește aceste instrucțiuni pentru a șterge conținut individual, a deconecta un cont social, a elimina postări publicate unde platforma permite sau a solicita ștergerea contului Sneep Cut și a datelor personale.',
    sections: [
      {
        title: '1. Șterge fișiere sau un proiect',
        paragraphs: [
          'Autentifică-te, deschide proiectul, clipul ori elementul din calendar și alege acțiunea de ștergere. Confirmă cererea afișată. Ștergerea unui element Sneep Cut elimină înregistrarea și fișierele active asociate unde este acceptat. Nu elimină automat o postare care există deja pe o platformă socială.'
        ]
      },
      {
        title: '2. Deconectează Instagram, Facebook, TikTok, YouTube',
        paragraphs: [
          'Deschide Publicare ori Calendar, găsește Conturi conectate, alege Deconectează și confirmă. Sneep Cut elimină autorizarea stocată local și împiedică trimiteri noi prin acea conexiune. Lucrările în așteptare sunt anulate unde mai este posibil; o cerere deja trimisă platformei se poate finaliza.',
          'Poți retrage autorizarea Sneep Cut și din setările aplicațiilor conectate ale platformei. Retragerea poate avea nevoie de timp pentru a apărea în Sneep Cut. Nu ne trimite niciodată parola platformei, tokenuri, coduri de recuperare ori coduri de autentificare.'
        ]
      },
      {
        title: '3. Șterge o postare publicată',
        paragraphs: [
          'La ștergerea unui element din calendar, Sneep Cut afișează opțiuni specifice platformei. Dacă o platformă conectată permite ștergerea prin API, poți selecta explicit destinația, iar Sneep Cut va transmite cererea. Instagram cere în prezent eliminarea direct din Instagram a unei postări deja publicate. Și alte platforme pot impune restricții ori respinge cererea.',
          'Eliminarea unei postări de pe platformă nu șterge automat fișierul sursă, proiectul, contul sau istoricul publicării din Sneep Cut. Șterge-le separat dacă dorești.'
        ]
      },
      {
        title: '4. Șterge contul Sneep Cut',
        paragraphs: [
          'Deschide Panou → Setări → Date și confidențialitate, alege Șterge contul, finalizează verificarea identității și confirmă avertismentul final. Ștergerea anulează autorizările de publicare și lucrările în așteptare unde este posibil, elimină credențialele sociale și stările OAuth, curăță fișierele contului și elimină contul după finalizarea sigură a anulării facturării și procesărilor active.',
          'Dacă o situație temporară privind un furnizor, facturarea ori procesarea împiedică finalizarea sigură, interfața va solicita reîncercarea. Contul nu este declarat șters până la finalizarea operațiunii.'
        ]
      },
      {
        title: '5. Solicită ștergerea dacă nu te poți autentifica',
        paragraphs: [
          `Trimite un e-mail la ${LEGAL_OPERATOR.privacyEmail} de la adresa asociată contului și precizează că soliciți ștergerea contului și a datelor. Include numai e-mailul contului și contextul necesar identificării. Putem solicita o verificare proporțională a identității. Nu include parole, tokenuri ori coduri de autentificare.`,
          'Confirmăm primirea cererilor și răspundem, în mod normal, fără întârzieri nejustificate și în cel mult o lună când se aplică GDPR, sub rezerva prelungirilor permise pentru cereri complexe.'
        ]
      },
      {
        title: '6. Ce date pot rămâne',
        paragraphs: [
          'Ștergerea nu elimină postările deja livrate platformelor terțe dacă nu le ștergi separat. Putem păstra facturi, dovezi ale tranzacțiilor, evidențe de securitate sau ștergere și date necesare unor pretenții juridice pe perioada impusă de lege.',
          'Copiile reziduale din backup-uri protejate, dacă există, nu revin în utilizarea obișnuită și sunt eliminate ori suprascrise conform ciclului aplicabil, cu excepția păstrării legale. Dacă se restaurează un backup, controalele și evidențele de ștergere sunt folosite pentru a împiedica revenirea datelor șterse în sistemele active.'
        ]
      },
      {
        title: '7. Date Meta și ale platformelor conectate',
        paragraphs: [
          'Același proces de ștergere acoperă identificatorii conturilor și Paginilor Meta, informațiile de profil puse la dispoziție prin permisiunile aprobate, credențialele de acces criptate, permisiunile, destinațiile, descrierile, identificatorii postărilor și istoricul stărilor din contul Sneep Cut, sub rezerva excepțiilor limitate de păstrare.',
          'Această pagină publică oferă instrucțiuni utilizatorilor. Nu solicită datele de acces Facebook ori Instagram și nu înlocuiește controalele proprii ale platformei pentru ștergerea contului.'
        ]
      }
    ],
    contactTitle: '8. Ajutor pentru ștergere',
    contactPrompt: 'Trimite cererea de ștergere sau verificare a stării la',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  es: {
    title: 'Instrucciones para la eliminación de datos',
    updated: updated.es,
    intro:
      'Utiliza estas instrucciones para eliminar contenido individual, desconectar una cuenta social, eliminar publicaciones ya publicadas cuando la plataforma lo permita, o solicitar la eliminación de tu cuenta de Sneep Cut y de tus datos personales.',
    sections: [
      {
        title: '1. Eliminar contenido multimedia o un proyecto',
        paragraphs: [
          'Inicia sesión, abre el proyecto, clip o elemento del calendario correspondiente y elige su acción de eliminar. Confirma la solicitud que se muestra en la interfaz. Eliminar un elemento de Sneep Cut borra su registro en la aplicación y el contenido multimedia activo asociado cuando sea compatible. No elimina automáticamente una publicación que ya exista en una plataforma social.'
        ]
      },
      {
        title: '2. Desconecta Instagram, Facebook, TikTok o YouTube',
        paragraphs: [
          'Abre Publicar o Calendario, localiza Cuentas conectadas, elige Desconectar para la cuenta y confirma. Sneep Cut elimina la autorización almacenada localmente e impide nuevos envíos a través de esa conexión. Los trabajos pendientes se cancelan cuando todavía es posible cancelarlos; una solicitud ya enviada a la plataforma puede completarse.',
          'También puedes revocar Sneep Cut desde los ajustes de aplicaciones conectadas de la plataforma. Que la revocación se refleje en Sneep Cut puede tardar un tiempo. Nunca nos envíes una contraseña de la plataforma, token de acceso, código de recuperación ni código de inicio de sesión de un solo uso.'
        ]
      },
      {
        title: '3. Eliminar una publicación publicada',
        paragraphs: [
          'Al eliminar un elemento del calendario, Sneep Cut muestra opciones específicas de cada plataforma. Si una plataforma conectada permite la eliminación a través de su API, puedes seleccionar explícitamente ese destino y Sneep Cut enviará la solicitud de eliminación. Instagram exige actualmente que elimines una publicación ya publicada directamente en Instagram. Otras plataformas pueden imponer restricciones similares o rechazar una solicitud de eliminación.',
          'Quitar una publicación de una plataforma no elimina por sí solo el contenido de origen, el proyecto, la cuenta ni el historial de publicaciones en Sneep Cut. Elimínalos por separado si lo deseas.'
        ]
      },
      {
        title: '4. Elimina tu cuenta de Sneep Cut',
        paragraphs: [
          'Abre Panel → Ajustes → Datos y privacidad, elige Eliminar cuenta, completa la confirmación de identidad y confirma la advertencia final. La eliminación cancela, cuando es posible, las autorizaciones de publicación activas y los trabajos pendientes, elimina las credenciales sociales y los estados de OAuth, limpia el contenido multimedia de la cuenta y elimina la cuenta una vez completadas de forma segura la cancelación de la facturación y el procesamiento activo.',
          'Si una condición temporal del proveedor, de facturación o de procesamiento impide completar la operación de forma segura, la interfaz te pedirá que lo intentes de nuevo. Tu cuenta no se considera eliminada hasta que la operación se complete.'
        ]
      },
      {
        title: '5. Solicita la eliminación si no puedes iniciar sesión',
        paragraphs: [
          `Envía un correo electrónico a ${LEGAL_OPERATOR.privacyEmail} desde la dirección asociada a tu cuenta e indica que solicitas la eliminación de la cuenta y de los datos personales. Incluye solo el correo electrónico de la cuenta y el contexto suficiente para localizarla. Podemos solicitar una verificación de identidad proporcionada. No incluyas contraseñas, tokens ni códigos de inicio de sesión.`,
          'Confirmamos la recepción de las solicitudes de privacidad y normalmente respondemos sin demoras injustificadas y en el plazo de un mes cuando se aplica el RGPD, sin perjuicio de las prórrogas permitidas para solicitudes complejas.'
        ]
      },
      {
        title: '6. Qué datos pueden permanecer',
        paragraphs: [
          'La eliminación no retira las publicaciones ya entregadas a plataformas de terceros, salvo que las elimines por separado. Podemos conservar facturas limitadas, pruebas de transacciones, registros de seguridad, pruebas de eliminación o datos necesarios para reclamaciones legales durante el período que exija la ley aplicable.',
          'Las copias residuales en copias de seguridad protegidas, si existen, no vuelven a su uso ordinario y se eliminan o sobrescriben según el ciclo de vida de copias de seguridad aplicable, salvo que la conservación sea legalmente obligatoria. Si se restaura una copia de seguridad, se utilizan los controles y registros de eliminación para impedir que los datos eliminados vuelvan a estar activos.'
        ]
      },
      {
        title: '7. Datos de Meta y de plataformas conectadas',
        paragraphs: [
          'El mismo proceso de eliminación de cuenta abarca los identificadores de cuenta y de Página de Meta, la información de perfil puesta a disposición mediante los permisos aprobados, las credenciales de acceso cifradas, los ámbitos de permisos, los destinos de publicación, los subtítulos, los identificadores de las publicaciones en la plataforma y el historial de estados conservados en tu cuenta de Sneep Cut, sujeto a las excepciones limitadas de conservación indicadas arriba.',
          'Esta página pública ofrece instrucciones de eliminación para usuarios. No solicita tus credenciales de Facebook o Instagram y no sustituye a los controles propios de la plataforma para eliminar la cuenta.'
        ]
      }
    ],
    contactTitle: '8. Ayuda con la eliminación',
    contactPrompt: 'Envía una solicitud de eliminación o de estado a',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}
