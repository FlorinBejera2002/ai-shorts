import type { SiteLocale } from './site-config'

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
  en: 'Last updated: September 22, 2026',
  ro: 'Ultima actualizare: 22 septembrie 2026'
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
        title: 'LinkedIn API integration',
        paragraphs: [
          'Sneep Cut uses the LinkedIn APIs only after you deliberately connect LinkedIn. We request OpenID profile access and permission to publish posts for your member account. Access to Pages you administer is requested only when organization publishing has been approved and enabled for Sneep Cut.',
          'We store your LinkedIn member or organization identifier, display name, public profile or Page URL, image URL, granted permissions, token expiry, connection state, encrypted OAuth credentials, and identifiers and status for posts submitted through Sneep Cut. We use this data only to show eligible destinations, verify continued authorization, and upload the video and commentary you explicitly approve. We do not export LinkedIn member data or use it for advertising, sales, recruiting, CRM enrichment, profiling, or AI training.',
          'We verify connected LinkedIn destinations periodically. Disconnecting LinkedIn, a detected revocation, or an expired authorization immediately deletes locally stored LinkedIn credentials, cached profile or Page data, and API-derived publishing records for that connection. Your source media and projects remain subject to your independent Sneep Cut retention choices. Posts already published remain on LinkedIn unless you explicitly select LinkedIn deletion in the calendar or remove them on LinkedIn.',
          'Your use of LinkedIn features is also governed by LinkedIn’s User Agreement, Privacy Policy, API Terms, and Marketing Developer Platform Terms. You can revoke Sneep Cut through LinkedIn’s permitted services settings as well as from Sneep Cut.'
        ],
        links: [
          { label: 'LinkedIn User Agreement', href: 'https://www.linkedin.com/legal/user-agreement' },
          { label: 'LinkedIn Privacy Policy', href: 'https://www.linkedin.com/legal/privacy-policy' },
          { label: 'LinkedIn API Terms', href: 'https://www.linkedin.com/legal/l/api-terms-of-use' },
          { label: 'LinkedIn Marketing API Terms', href: 'https://www.linkedin.com/legal/l/marketing-api-terms' },
          { label: 'LinkedIn permitted services', href: 'https://www.linkedin.com/mypreferences/d/permitted-services' }
        ]
      },
      {
        title: 'X API integration',
        paragraphs: [
          'Sneep Cut connects X only after your explicit authorization through OAuth 2.0 with PKCE. We request the minimum permissions needed to identify your account, upload media, create and delete posts you approve, and keep scheduled publishing connected.',
          'We store your X account identifier, name, username, profile image URL, granted internal capabilities, token expiry, encrypted OAuth credentials, and identifiers and status for posts submitted through Sneep Cut. We do not request or read your timeline, followers, following, likes, bookmarks, lists, Direct Messages, email address, or other users’ data. X data is not used for advertising, sale, surveillance, profiling, CRM enrichment, recruiting, or AI training.',
          'Disconnecting X asks X to revoke the authorization and immediately deletes the local token, cached X account record, and X API-derived publishing records for that connection. The same local deletion occurs when revocation or an unrefreshable expiry is detected. Source media and projects follow your separate Sneep Cut controls. Posts already published remain on X unless you explicitly select X deletion in the calendar or remove them on X.',
          'X API usage is subject to credit-based pay-per-usage billing and limits controlled by X. Your use of the integration is also subject to the X Terms of Service, Privacy Policy, Rules, and Developer Agreement and Policy.'
        ],
        links: [
          { label: 'X Terms of Service', href: 'https://x.com/en/tos' },
          { label: 'X Privacy Policy', href: 'https://x.com/en/privacy' },
          { label: 'X Rules', href: 'https://help.x.com/en/rules-and-policies/x-rules' },
          { label: 'X Developer Agreement and Policy', href: 'https://developer.x.com/en/developer-terms/agreement-and-policy' },
          { label: 'X connected apps', href: 'https://x.com/settings/connected_apps' }
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
        title: 'Integrarea API LinkedIn',
        paragraphs: [
          'Sneep Cut folosește API-urile LinkedIn numai după ce conectezi intenționat LinkedIn. Solicităm acces OpenID la profil și permisiunea de a publica pentru contul tău de membru. Accesul la Paginile pe care le administrezi este solicitat numai după ce publicarea pentru organizații a fost aprobată și activată pentru Sneep Cut.',
          'Stocăm identificatorul LinkedIn de membru sau organizație, numele afișat, adresa publică a profilului ori Paginii, adresa imaginii, permisiunile acordate, expirarea tokenului, starea conexiunii, credențialele OAuth criptate și identificatorii și starea postărilor trimise prin Sneep Cut. Folosim datele numai pentru a afișa destinațiile eligibile, a verifica autorizarea și a încărca videoclipul și textul aprobate explicit. Nu exportăm date despre membrii LinkedIn și nu le folosim pentru publicitate, vânzări, recrutare, îmbogățirea bazelor CRM, profilare ori antrenarea AI.',
          'Verificăm periodic destinațiile LinkedIn conectate. Deconectarea LinkedIn, detectarea revocării ori expirarea autorizării șterge imediat credențialele LinkedIn stocate local, datele de profil sau Pagină din cache și înregistrările de publicare obținute prin API pentru conexiunea respectivă. Fișierele sursă și proiectele rămân sub controlul separat al retenției Sneep Cut. Postările deja publicate rămân pe LinkedIn dacă nu selectezi explicit ștergerea de pe LinkedIn în calendar sau nu le elimini direct din LinkedIn.',
          'Utilizarea funcțiilor LinkedIn este guvernată și de Acordul utilizatorului, Politica de confidențialitate, Termenii API și Termenii Marketing Developer Platform LinkedIn. Poți revoca Sneep Cut din setările serviciilor permise LinkedIn sau din Sneep Cut.'
        ],
        links: [
          { label: 'Acordul utilizatorului LinkedIn', href: 'https://www.linkedin.com/legal/user-agreement' },
          { label: 'Politica de confidențialitate LinkedIn', href: 'https://www.linkedin.com/legal/privacy-policy' },
          { label: 'Termenii API LinkedIn', href: 'https://www.linkedin.com/legal/l/api-terms-of-use' },
          { label: 'Termenii Marketing API LinkedIn', href: 'https://www.linkedin.com/legal/l/marketing-api-terms' },
          { label: 'Servicii permise LinkedIn', href: 'https://www.linkedin.com/mypreferences/d/permitted-services' }
        ]
      },
      {
        title: 'Integrarea API X',
        paragraphs: [
          'Sneep Cut conectează X numai după autorizarea ta explicită prin OAuth 2.0 cu PKCE. Solicităm permisiunile minime pentru identificarea contului, încărcarea fișierului media, crearea și ștergerea postărilor aprobate de tine și menținerea publicării programate.',
          'Stocăm identificatorul contului X, numele, numele de utilizator, adresa imaginii de profil, capabilitățile interne acordate, expirarea tokenului, credențialele OAuth criptate și identificatorii și starea postărilor trimise prin Sneep Cut. Nu solicităm și nu citim cronologia, urmăritorii, conturile urmărite, aprecierile, marcajele, listele, mesajele directe, adresa de e-mail ori datele altor utilizatori. Datele X nu sunt folosite pentru publicitate, vânzare, supraveghere, profilare, îmbogățirea CRM, recrutare sau antrenarea AI.',
          'Deconectarea X solicită revocarea autorizării la X și șterge imediat tokenul local, datele contului X din cache și înregistrările de publicare obținute prin API pentru acea conexiune. Aceeași ștergere locală are loc la detectarea revocării ori a unei expirări care nu poate fi reînnoită. Fișierele sursă și proiectele urmează controalele Sneep Cut separate. Postările deja publicate rămân pe X dacă nu selectezi explicit ștergerea X în calendar sau nu le elimini pe X.',
          'Utilizarea API X este supusă facturării pe bază de credite și limitelor controlate de X. Integrarea este guvernată și de Termenii X, Politica de confidențialitate X, Regulile X și Acordul și Politica pentru dezvoltatori X.'
        ],
        links: [
          { label: 'Termenii X', href: 'https://x.com/en/tos' },
          { label: 'Politica de confidențialitate X', href: 'https://x.com/en/privacy' },
          { label: 'Regulile X', href: 'https://help.x.com/en/rules-and-policies/x-rules' },
          { label: 'Acordul și Politica pentru dezvoltatori X', href: 'https://developer.x.com/en/developer-terms/agreement-and-policy' },
          { label: 'Aplicații conectate X', href: 'https://x.com/settings/connected_apps' }
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
        title: 'LinkedIn API Services',
        paragraphs: [
          'When you connect LinkedIn, you authorize Sneep Cut to identify your member profile and publish only the video posts you approve. If organization publishing is enabled, you also authorize access to Pages for which LinkedIn confirms you are an administrator. You must keep that authority and may not select a destination you are not entitled to represent.',
          'You remain responsible for the video, commentary, claims, permissions, releases, intellectual-property rights, advertising disclosures, and legal compliance of every LinkedIn post. Do not use Sneep Cut to scrape, export, enrich, sell, or repurpose LinkedIn member data, or to automate prohibited advertising, sales, recruiting, surveillance, or profiling.',
          'LinkedIn may limit, review, suspend, or withdraw API access. Sneep Cut may disable LinkedIn features when required by LinkedIn, law, security, permissions, quota, or technical availability. Disconnecting stops future submissions and deletes local LinkedIn connection data, but does not remove posts already delivered unless you separately request supported remote deletion.',
          'By using the LinkedIn integration, you agree to comply with LinkedIn’s User Agreement, Professional Community Policies, API Terms, and Marketing Developer Platform Terms, as updated by LinkedIn.'
        ],
        links: [
          { label: 'LinkedIn User Agreement', href: 'https://www.linkedin.com/legal/user-agreement' },
          { label: 'LinkedIn Professional Community Policies', href: 'https://www.linkedin.com/legal/professional-community-policies' },
          { label: 'LinkedIn API Terms', href: 'https://www.linkedin.com/legal/l/api-terms-of-use' },
          { label: 'LinkedIn Marketing API Terms', href: 'https://www.linkedin.com/legal/l/marketing-api-terms' }
        ]
      },
      {
        title: 'X API Services',
        paragraphs: [
          'When you connect X, you authorize Sneep Cut to identify your account and to upload, create, and delete only the video posts you explicitly approve. Scheduled publishing uses offline access so the request can be submitted at the time you choose.',
          'You remain responsible for the video, text, claims, rights, permissions, advertising and AI disclosures, and legal compliance of every X post. You may not use Sneep Cut to scrape, export, sell, monitor, profile, or repurpose X data, or to automate spam, platform manipulation, prohibited surveillance, or other conduct forbidden by the X Rules and Developer Policy.',
          'X controls API access, billing, credits, account eligibility, rate limits, media limits, and enforcement. Sneep Cut may disable X functionality when required by X, law, security, quota, billing, or technical availability. Disconnecting stops future submissions and removes local X connection data; published posts remain until separately deleted.',
          'By using the X integration, you agree to comply with the X Terms of Service, Rules, and Developer Agreement and Policy, as updated by X.'
        ],
        links: [
          { label: 'X Terms of Service', href: 'https://x.com/en/tos' },
          { label: 'X Rules', href: 'https://help.x.com/en/rules-and-policies/x-rules' },
          { label: 'X Developer Agreement and Policy', href: 'https://developer.x.com/en/developer-terms/agreement-and-policy' }
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
        title: 'Serviciile API LinkedIn',
        paragraphs: [
          'Când conectezi LinkedIn, autorizezi Sneep Cut să identifice profilul tău de membru și să publice numai postările video aprobate de tine. Dacă publicarea pentru organizații este activată, autorizezi și accesul la Paginile pentru care LinkedIn confirmă că ești administrator. Trebuie să păstrezi această autoritate și să nu selectezi o destinație pe care nu ai dreptul să o reprezinți.',
          'Rămâi responsabil pentru videoclip, text, afirmații, permisiuni, acorduri, drepturi de proprietate intelectuală, marcaje publicitare și respectarea legii pentru fiecare postare LinkedIn. Nu folosi Sneep Cut pentru a extrage, exporta, îmbogăți, vinde ori reutiliza datele membrilor LinkedIn sau pentru a automatiza activități interzise de publicitate, vânzări, recrutare, supraveghere ori profilare.',
          'LinkedIn poate limita, verifica, suspenda ori retrage accesul API. Sneep Cut poate dezactiva funcțiile LinkedIn când o cer LinkedIn, legea, securitatea, permisiunile, cotele ori disponibilitatea tehnică. Deconectarea oprește trimiterile viitoare și șterge datele locale ale conexiunii LinkedIn, dar nu elimină postările deja livrate dacă nu soliciți separat ștergerea la distanță acceptată.',
          'Prin utilizarea integrării LinkedIn, accepți să respecți Acordul utilizatorului, Regulile comunității profesionale, Termenii API și Termenii Marketing Developer Platform LinkedIn, în forma actualizată de LinkedIn.'
        ],
        links: [
          { label: 'Acordul utilizatorului LinkedIn', href: 'https://www.linkedin.com/legal/user-agreement' },
          { label: 'Regulile comunității profesionale LinkedIn', href: 'https://www.linkedin.com/legal/professional-community-policies' },
          { label: 'Termenii API LinkedIn', href: 'https://www.linkedin.com/legal/l/api-terms-of-use' },
          { label: 'Termenii Marketing API LinkedIn', href: 'https://www.linkedin.com/legal/l/marketing-api-terms' }
        ]
      },
      {
        title: 'Serviciile API X',
        paragraphs: [
          'Când conectezi X, autorizezi Sneep Cut să identifice contul și să încarce, creeze și șteargă numai postările video aprobate explicit de tine. Publicarea programată folosește acces offline pentru ca solicitarea să poată fi trimisă la ora aleasă.',
          'Rămâi responsabil pentru videoclip, text, afirmații, drepturi, permisiuni, marcaje publicitare și privind AI și respectarea legii pentru fiecare postare X. Nu poți folosi Sneep Cut pentru extragerea, exportul, vânzarea, monitorizarea, profilarea ori reutilizarea datelor X sau pentru automatizarea spamului, manipulării platformei, supravegherii interzise ori a altui comportament interzis de Regulile și Politica pentru dezvoltatori X.',
          'X controlează accesul API, facturarea, creditele, eligibilitatea contului, limitele de rată, limitele media și aplicarea regulilor. Sneep Cut poate dezactiva funcția X când o cer X, legea, securitatea, cota, facturarea ori disponibilitatea tehnică. Deconectarea oprește trimiterile viitoare și elimină datele locale ale conexiunii X; postările publicate rămân până la ștergerea separată.',
          'Prin utilizarea integrării X, accepți Termenii X, Regulile X și Acordul și Politica pentru dezvoltatori X, în forma actualizată de X.'
        ],
        links: [
          { label: 'Termenii X', href: 'https://x.com/en/tos' },
          { label: 'Regulile X', href: 'https://help.x.com/en/rules-and-policies/x-rules' },
          { label: 'Acordul și Politica pentru dezvoltatori X', href: 'https://developer.x.com/en/developer-terms/agreement-and-policy' }
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
        title: '2. Disconnect Instagram, Facebook, TikTok, YouTube, LinkedIn, or X',
        paragraphs: [
          'Open Publish or Calendar, locate Connected accounts, choose Disconnect for the account, and confirm. Sneep Cut removes the locally stored authorization and prevents new submissions through that connection. Pending work is cancelled where cancellation remains possible; a request already sent to a platform may still complete.',
          'For LinkedIn, disconnecting immediately deletes the encrypted token, cached member or Page data, and LinkedIn API post identifiers and status records for that connection. It does not delete your source media or projects, and posts already delivered remain on LinkedIn unless you separately select supported LinkedIn deletion.',
          'For X, disconnecting asks X to revoke the token and immediately deletes the encrypted local credentials, cached account data, and X API post identifiers and status records for that connection. Posts already delivered remain on X unless you separately select X deletion in the calendar or delete them on X.',
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
        title: '2. Deconectează Instagram, Facebook, TikTok, YouTube, LinkedIn sau X',
        paragraphs: [
          'Deschide Publicare ori Calendar, găsește Conturi conectate, alege Deconectează și confirmă. Sneep Cut elimină autorizarea stocată local și împiedică trimiteri noi prin acea conexiune. Lucrările în așteptare sunt anulate unde mai este posibil; o cerere deja trimisă platformei se poate finaliza.',
          'Pentru LinkedIn, deconectarea șterge imediat tokenul criptat, datele de membru sau Pagină din cache și identificatorii și stările postărilor LinkedIn obținute prin API pentru acea conexiune. Nu șterge fișierele sursă ori proiectele, iar postările deja livrate rămân pe LinkedIn dacă nu selectezi separat ștergerea LinkedIn acceptată.',
          'Pentru X, deconectarea solicită revocarea tokenului la X și șterge imediat credențialele locale criptate, datele contului din cache și identificatorii și stările postărilor X obținute prin API pentru acea conexiune. Postările deja livrate rămân pe X dacă nu selectezi separat ștergerea X în calendar sau nu le elimini pe X.',
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
  }
}
