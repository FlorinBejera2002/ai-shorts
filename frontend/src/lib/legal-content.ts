import type { SiteLocale } from './site-config'

export type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

type LegalDocumentCopy = {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
  contactTitle: string
  contactPrompt: string
  contactFallback: string
}

export const PRIVACY_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: September 7, 2026',
    intro:
      'This policy explains how Sneepcut processes personal data when you create an account, upload media, generate clips, or manage a subscription.',
    sections: [
      {
        title: '1. Data we process',
        bullets: [
          'Account data, including your name, email address, authentication provider, and password hash when password sign-in is used.',
          'Content and workflow data, including source videos, generated clips, transcripts, captions, processing settings, and job status.',
          'Billing records, including plan and transaction identifiers supplied by our payment processor. Sneepcut does not store complete card details.',
          'Security and diagnostic data, such as IP address, user agent, timestamps, and application errors.'
        ]
      },
      {
        title: '2. Purposes and legal bases',
        bullets: [
          'Contract performance: providing video processing, account, credit, and subscription features.',
          'Legitimate interests: securing the service, preventing abuse, troubleshooting, and improving reliability.',
          'Legal obligations: maintaining records required for accounting, tax, fraud prevention, or lawful requests.',
          'Consent: only where a feature or communication specifically asks for it; consent can be withdrawn.'
        ],
        paragraphs: [
          'We do not sell personal data. We do not use uploaded content for third-party advertising.'
        ]
      },
      {
        title: '3. Service providers',
        paragraphs: [
          'We use service providers to operate selected parts of Sneepcut, including infrastructure and storage, AI-assisted analysis, payment processing through Stripe, and Google authentication when selected. They process data under their own terms and our applicable agreements and configuration.'
        ]
      },
      {
        title: '4. Retention and deletion',
        paragraphs: [
          'We retain account and content data while it is needed to provide the service. You can delete individual content or request account deletion from Settings. Removal from active systems may not immediately remove encrypted backups; backup copies are isolated and expire on their normal retention schedule.',
          'Some billing, security, and transaction records may be retained longer where required by law or necessary to establish, exercise, or defend legal claims.'
        ]
      },
      {
        title: '5. Your rights',
        bullets: [
          'Access and receive a portable copy of your personal data.',
          'Correct inaccurate or incomplete personal data.',
          'Request erasure or restriction where the law allows it.',
          'Object to processing based on legitimate interests.',
          'Withdraw consent without affecting processing that was lawful before withdrawal.',
          'Submit a complaint to your competent data-protection authority.'
        ],
        paragraphs: [
          'Account export and deletion controls are available in Dashboard → Settings → Data & Privacy. We may need to verify your identity before completing a request.'
        ]
      },
      {
        title: '6. Security',
        paragraphs: [
          'Sneepcut uses safeguards such as encrypted transport, hashed passwords, access controls, signed media access, rate limiting, and restricted production access. No online service can guarantee absolute security.'
        ]
      },
      {
        title: '7. Cookies',
        paragraphs: [
          'Sneepcut uses essential authentication and security cookies needed to keep you signed in and protect account workflows. If non-essential cookies are introduced, we will update this notice and request consent where required.'
        ]
      },
      {
        title: '8. International processing and changes',
        paragraphs: [
          'Service providers may process data in more than one country. Where required, we use appropriate transfer safeguards. We may update this policy as the service or legal requirements change and will publish the revised date here.'
        ]
      },
      {
        title: '9. Connected social accounts and publishing',
        paragraphs: [
          'When you connect Instagram, a Facebook Page, or TikTok, we store the platform account identifier, display name and available username, authorization scopes, and encrypted access and refresh tokens needed to provide the publishing feature. We do not receive your social account password.',
          'After you explicitly confirm a post, we send the selected video, caption, and publishing preferences to the platforms you selected. Those platforms process the information under their own privacy policies. We retain publishing records, including destinations, captions, timestamps, platform post identifiers, and processing status, as part of your account history until account deletion, subject to the retention exceptions described above.',
          'Use Publish → Disconnect to remove the locally stored authorization for an account and cancel work where cancellation is still possible. Requests already sent to a platform may complete. You can also revoke the application in that platform’s app settings. Disconnecting does not delete posts already published on the platform. Public instructions are available on our Data deletion page.'
        ]
      }
    ],
    contactTitle: '10. Contact',
    contactPrompt: 'Privacy inquiries:',
    contactFallback:
      'No public privacy address is configured. Use the account controls in Settings while signed in.'
  },
  ro: {
    title: 'Politica de confidențialitate',
    updated: 'Ultima actualizare: 7 septembrie 2026',
    intro:
      'Această politică explică modul în care Sneepcut prelucrează datele cu caracter personal când creezi un cont, încarci conținut media, generezi clipuri sau administrezi un abonament.',
    sections: [
      {
        title: '1. Datele pe care le prelucrăm',
        bullets: [
          'Date de cont, inclusiv numele, adresa de e-mail, furnizorul de autentificare și hash-ul parolei când folosești autentificarea cu parolă.',
          'Conținut și date despre fluxul de lucru, inclusiv videoclipuri sursă, clipuri generate, transcrieri, subtitrări, setări de procesare și starea lucrărilor.',
          'Evidențe de facturare, inclusiv planul și identificatorii tranzacțiilor furnizați de procesatorul de plăți. Sneepcut nu stochează datele complete ale cardului.',
          'Date de securitate și diagnostic, precum adresa IP, agentul utilizator, marcajele temporale și erorile aplicației.'
        ]
      },
      {
        title: '2. Scopuri și temeiuri juridice',
        bullets: [
          'Executarea contractului: funcțiile de procesare video, cont, credite și abonament.',
          'Interese legitime: securizarea serviciului, prevenirea abuzurilor, diagnosticarea și îmbunătățirea fiabilității.',
          'Obligații legale: păstrarea evidențelor necesare pentru contabilitate, taxe, prevenirea fraudei sau cereri legale.',
          'Consimțământ: numai când o funcție sau comunicare îl solicită în mod expres; consimțământul poate fi retras.'
        ],
        paragraphs: [
          'Nu vindem date cu caracter personal și nu folosim conținutul încărcat pentru publicitate terță.'
        ]
      },
      {
        title: '3. Furnizori de servicii',
        paragraphs: [
          'Folosim furnizori pentru anumite părți ale Sneepcut, inclusiv infrastructură și stocare, analiză asistată de AI, procesarea plăților prin Stripe și autentificarea Google atunci când este aleasă. Aceștia prelucrează date conform propriilor termeni și acordurilor și configurării aplicabile.'
        ]
      },
      {
        title: '4. Păstrare și ștergere',
        paragraphs: [
          'Păstrăm datele contului și conținutul atât timp cât sunt necesare pentru furnizarea serviciului. Poți șterge conținut individual sau poți solicita ștergerea contului din Setări. Eliminarea din sistemele active poate să nu elimine imediat copiile de siguranță criptate; acestea sunt izolate și expiră conform perioadei lor normale de păstrare.',
          'Unele evidențe de facturare, securitate și tranzacții pot fi păstrate mai mult dacă legea o cere sau dacă sunt necesare pentru constatarea, exercitarea ori apărarea unui drept.'
        ]
      },
      {
        title: '5. Drepturile tale',
        bullets: [
          'Acces și primirea unei copii portabile a datelor personale.',
          'Corectarea datelor inexacte sau incomplete.',
          'Solicitarea ștergerii ori restricționării, când legea permite.',
          'Opoziția față de prelucrarea bazată pe interese legitime.',
          'Retragerea consimțământului fără a afecta prelucrarea legală anterioară.',
          'Depunerea unei plângeri la autoritatea competentă pentru protecția datelor.'
        ],
        paragraphs: [
          'Controalele pentru export și ștergere se află în Panou → Setări → Date și confidențialitate. Este posibil să fie necesară verificarea identității înainte de soluționarea unei cereri.'
        ]
      },
      {
        title: '6. Securitate',
        paragraphs: [
          'Sneepcut folosește măsuri precum transport criptat, parole stocate sub formă de hash, control al accesului, acces semnat la fișiere media, limitarea cererilor și acces restricționat la producție. Niciun serviciu online nu poate garanta securitate absolută.'
        ]
      },
      {
        title: '7. Cookie-uri',
        paragraphs: [
          'Sneepcut folosește cookie-uri esențiale de autentificare și securitate, necesare pentru menținerea sesiunii și protejarea fluxurilor contului. Dacă vor fi introduse cookie-uri neesențiale, vom actualiza această notificare și vom cere consimțământul unde este necesar.'
        ]
      },
      {
        title: '8. Prelucrare internațională și modificări',
        paragraphs: [
          'Furnizorii pot prelucra date în mai multe țări. Unde este necesar, folosim garanții adecvate pentru transfer. Putem actualiza politica odată cu serviciul sau cerințele legale și vom publica aici data revizuită.'
        ]
      },
      {
        title: '9. Conturi sociale conectate și publicare',
        paragraphs: [
          'Când conectezi Instagram, o pagină Facebook sau TikTok, stocăm identificatorul contului de pe platformă, numele afișat și numele de utilizator disponibil, permisiunile acordate și tokenurile de acces și reîmprospătare criptate necesare funcției de publicare. Nu primim parola contului tău social.',
          'După ce confirmi explicit o postare, trimitem videoclipul, descrierea și preferințele de publicare către platformele selectate. Acestea prelucrează informațiile conform propriilor politici de confidențialitate. Păstrăm evidențele publicărilor, inclusiv destinațiile, descrierile, marcajele temporale, identificatorii postărilor și starea procesării, în istoricul contului până la ștergerea acestuia, cu excepțiile de păstrare descrise mai sus.',
          'Folosește Publicare → Deconectează pentru a elimina autorizarea salvată local pentru un cont și a opri lucrările care pot fi anulate. Cererile deja trimise unei platforme se pot finaliza. Poți retrage autorizarea aplicației și din setările platformei respective. Deconectarea nu șterge postările deja publicate pe platformă. Instrucțiunile publice sunt disponibile pe pagina Ștergerea datelor.'
        ]
      }
    ],
    contactTitle: '10. Contact',
    contactPrompt: 'Întrebări despre confidențialitate:',
    contactFallback:
      'Nu este configurată o adresă publică pentru confidențialitate. Folosește controalele contului din Setări după autentificare.'
  }
}

export const TERMS_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: September 3, 2026',
    intro:
      'These terms govern your access to Sneepcut. By creating an account or using the service, you agree to them.',
    sections: [
      {
        title: '1. Service and eligibility',
        paragraphs: [
          'Sneepcut provides tools for turning source videos into short clips, including processing, AI-assisted highlight selection, reframing, subtitles, and related workflow features. You must be at least 16 years old and legally able to accept these terms.'
        ]
      },
      {
        title: '2. Your account',
        paragraphs: [
          'Provide accurate information, protect your credentials, and notify the operator if you suspect unauthorized access. You are responsible for activity performed through your account unless applicable law states otherwise.'
        ]
      },
      {
        title: '3. Content and permissions',
        paragraphs: [
          'You retain ownership of your content. You grant Sneepcut the limited rights needed to host, process, transform, and deliver it for the service. You must have the rights and permissions required for every upload and must respect privacy, publicity, copyright, and other applicable laws.'
        ]
      },
      {
        title: '4. Credits, plans, and payment',
        paragraphs: [
          'The checkout screen states the applicable plan, price, billing period, and included credits before purchase. Paid plans renew until cancelled. Taxes, refunds, failed processing, and cancellation rights are handled according to the checkout terms and mandatory law. Account billing controls show the current subscription status.'
        ]
      },
      {
        title: '5. Acceptable use',
        bullets: [
          'Do not upload content you are not authorized to process.',
          'Do not use the service for illegal, harmful, deceptive, or rights-infringing activity.',
          'Do not bypass quotas, security controls, access controls, or rate limits.',
          'Do not introduce malicious code or interfere with the service or other users.',
          'Do not resell access or share credentials unless your plan expressly allows it.'
        ]
      },
      {
        title: '6. Availability and changes',
        paragraphs: [
          'Processing time and availability vary with source material, queue capacity, external providers, and maintenance. Features may change as the service evolves. Where reasonably possible, material reductions to paid service will be communicated in advance.'
        ]
      },
      {
        title: '7. Suspension and termination',
        paragraphs: [
          'You may stop using Sneepcut and use account controls to request deletion. Access may be suspended or terminated for a material breach, security risk, unlawful use, or non-payment. Data handling after termination follows the Privacy Policy and applicable law.'
        ]
      },
      {
        title: '8. Warranties and liability',
        paragraphs: [
          'To the extent permitted by law, the service is provided without guarantees that every generated result will be accurate, suitable, or continuously available. Nothing in these terms excludes consumer rights or liability that cannot legally be excluded.'
        ]
      },
      {
        title: '9. Governing rules and updates',
        paragraphs: [
          'Applicable mandatory law and any service agreement identify the governing rules and dispute forum. We may update these terms for legal, security, or service changes. The revised date will be published here, and material changes will be communicated when required.'
        ]
      }
    ],
    contactTitle: '10. Contact',
    contactPrompt: 'Questions about these terms:',
    contactFallback:
      'No public legal address is configured. Operator contact details may be provided in your applicable service agreement.'
  },
  ro: {
    title: 'Termeni și condiții',
    updated: 'Ultima actualizare: 3 septembrie 2026',
    intro:
      'Acești termeni reglementează accesul la Sneepcut. Prin crearea unui cont sau utilizarea serviciului, îi accepți.',
    sections: [
      {
        title: '1. Serviciul și eligibilitatea',
        paragraphs: [
          'Sneepcut oferă instrumente pentru transformarea videoclipurilor sursă în clipuri scurte, inclusiv procesare, selecția momentelor asistată de AI, reîncadrare, subtitrări și funcții conexe. Trebuie să ai cel puțin 16 ani și capacitatea legală de a accepta acești termeni.'
        ]
      },
      {
        title: '2. Contul tău',
        paragraphs: [
          'Furnizează informații corecte, protejează datele de acces și notifică operatorul dacă suspectezi acces neautorizat. Ești responsabil pentru activitatea din cont, cu excepția cazurilor în care legea aplicabilă prevede altfel.'
        ]
      },
      {
        title: '3. Conținut și permisiuni',
        paragraphs: [
          'Păstrezi drepturile asupra conținutului tău. Acordi Sneepcut drepturile limitate necesare pentru găzduire, procesare, transformare și livrare în cadrul serviciului. Trebuie să deții drepturile și permisiunile necesare pentru fiecare încărcare și să respecți legislația privind confidențialitatea, imaginea, drepturile de autor și alte norme aplicabile.'
        ]
      },
      {
        title: '4. Credite, planuri și plată',
        paragraphs: [
          'Ecranul de plată indică planul, prețul, perioada de facturare și creditele incluse înainte de cumpărare. Planurile plătite se reînnoiesc până la anulare. Taxele, rambursările, procesările eșuate și drepturile de anulare sunt gestionate conform termenilor afișați la plată și legii obligatorii. Controalele de facturare arată starea abonamentului curent.'
        ]
      },
      {
        title: '5. Utilizare acceptabilă',
        bullets: [
          'Nu încărca materiale pe care nu ai dreptul să le procesezi.',
          'Nu folosi serviciul pentru activități ilegale, dăunătoare, înșelătoare sau care încalcă drepturi.',
          'Nu ocoli cotele, controalele de securitate, acces sau limitarea cererilor.',
          'Nu introduce cod malițios și nu perturba serviciul ori alți utilizatori.',
          'Nu revinde accesul și nu partaja datele de autentificare decât dacă planul permite expres.'
        ]
      },
      {
        title: '6. Disponibilitate și modificări',
        paragraphs: [
          'Durata procesării și disponibilitatea variază în funcție de material, capacitatea cozii, furnizorii externi și mentenanță. Funcțiile se pot schimba pe măsură ce serviciul evoluează. Când este rezonabil posibil, reducerile materiale ale serviciului plătit vor fi comunicate în avans.'
        ]
      },
      {
        title: '7. Suspendare și încetare',
        paragraphs: [
          'Poți înceta utilizarea Sneepcut și poți solicita ștergerea prin controalele contului. Accesul poate fi suspendat sau închis pentru încălcări materiale, riscuri de securitate, utilizare ilegală sau neplată. Datele după încetare sunt tratate conform Politicii de confidențialitate și legii aplicabile.'
        ]
      },
      {
        title: '8. Garanții și răspundere',
        paragraphs: [
          'În limita permisă de lege, serviciul este furnizat fără garanția că fiecare rezultat generat va fi exact, adecvat sau disponibil permanent. Nimic din acești termeni nu exclude drepturile consumatorilor ori răspunderea care nu poate fi exclusă legal.'
        ]
      },
      {
        title: '9. Reguli aplicabile și actualizări',
        paragraphs: [
          'Legea obligatorie aplicabilă și orice acord de servicii identifică regulile și instanța competentă. Putem actualiza termenii pentru modificări legale, de securitate sau ale serviciului. Data revizuită va fi publicată aici, iar schimbările materiale vor fi comunicate când este necesar.'
        ]
      }
    ],
    contactTitle: '10. Contact',
    contactPrompt: 'Întrebări despre acești termeni:',
    contactFallback:
      'Nu este configurată o adresă juridică publică. Datele operatorului pot fi furnizate în acordul de servicii aplicabil.'
  }
}
