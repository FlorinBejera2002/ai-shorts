import { LEGAL_OPERATOR, type LegalDocumentCopy } from './legal-content'
import type { SiteLocale } from './site-config'

const updated = {
  en: 'Last updated: September 16, 2026',
  ro: 'Ultima actualizare: 16 septembrie 2026'
} as const

export const LEGAL_NOTICE_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Legal Notice',
    updated: updated.en,
    intro:
      'This page provides the company and contact information for the operator of sneepcut.com and the Sneep Cut service.',
    sections: [
      {
        title: '1. Service provider',
        bullets: [
          `Legal name: ${LEGAL_OPERATOR.legalName}`,
          `Brand and service name: ${LEGAL_OPERATOR.brand}`,
          `Registered office: ${LEGAL_OPERATOR.address}`,
          `Romanian tax identification code (CUI): ${LEGAL_OPERATOR.taxId}`,
          `Trade Register number: ${LEGAL_OPERATOR.tradeRegister}`,
          `Share capital: ${LEGAL_OPERATOR.shareCapital}`,
          `Telephone: ${LEGAL_OPERATOR.phone}`,
          `General email: ${LEGAL_OPERATOR.email}`,
          `Privacy and support email: ${LEGAL_OPERATOR.privacyEmail}`
        ]
      },
      {
        title: '2. Website and service',
        paragraphs: [
          `${LEGAL_OPERATOR.legalName} provides Sneep Cut at https://sneepcut.com as an online software service for AI-assisted video workflows, editing, export, content planning, and publishing to user-connected platforms. No regulated professional activity is offered through the service.`,
          'The company may be contacted directly and effectively through the email addresses and telephone number above. For account-specific support, use the address associated with your Sneep Cut account whenever possible.'
        ]
      },
      {
        title: '3. Prices, taxes, and delivery',
        paragraphs: [
          'Current prices, currency, billing period, included features or credits, renewal information, and the tax treatment applicable to an order are displayed before payment and on the payment or invoice record. Sneep Cut is supplied electronically, so no physical delivery fee applies.'
        ]
      },
      {
        title: '4. Complaints and consumer disputes',
        paragraphs: [
          'Please contact us first with the account email, transaction reference if relevant, and a concise description of the issue. This does not limit any statutory remedy or right to contact a competent authority or court.',
          'Eligible Romanian consumers may use the National Authority for Consumer Protection (ANPC) information and alternative dispute resolution services. The former EU Online Dispute Resolution platform was discontinued in 2025, so we do not present it as an available complaint channel.'
        ],
        links: [
          {
            label: 'Romanian consumer authority (ANPC)',
            href: 'https://anpc.ro/'
          },
          {
            label: 'ANPC alternative dispute resolution (SAL)',
            href: 'https://reclamatiisal.anpc.ro/'
          }
        ]
      },
      {
        title: '5. Intellectual property',
        paragraphs: [
          'Sneep Cut names, logos, software, interface, and original website materials belong to the operator or its licensors. User content remains governed by the Terms of Service. Nothing on this website grants a licence beyond the limited rights expressly stated in those Terms.'
        ]
      },
      {
        title: '6. Legal documents',
        paragraphs: [
          'The Privacy Policy explains personal-data processing; the Cookie Policy describes browser storage; the Terms of Service and Acceptable Use Policy govern use; the Refund and Cancellation Policy explains payment remedies; Data Deletion explains removal controls; and the Subprocessors and Data Processing Addendum pages address business processing.'
        ]
      }
    ],
    contactTitle: '7. Direct contact',
    contactPrompt: `Contact ${LEGAL_OPERATOR.legalName} at`,
    contactFallback: LEGAL_OPERATOR.email
  },
  ro: {
    title: 'Informații legale',
    updated: updated.ro,
    intro:
      'Această pagină prezintă datele societății și informațiile de contact ale operatorului sneepcut.com și al serviciului Sneep Cut.',
    sections: [
      {
        title: '1. Furnizorul serviciului',
        bullets: [
          `Denumire juridică: ${LEGAL_OPERATOR.legalName}`,
          `Marcă și denumire serviciu: ${LEGAL_OPERATOR.brand}`,
          `Sediu social: ${LEGAL_OPERATOR.address}`,
          `Cod unic de înregistrare (CUI): ${LEGAL_OPERATOR.taxId}`,
          `Număr Registrul Comerțului: ${LEGAL_OPERATOR.tradeRegister}`,
          `Capital social: ${LEGAL_OPERATOR.shareCapital}`,
          `Telefon: ${LEGAL_OPERATOR.phone}`,
          `E-mail general: ${LEGAL_OPERATOR.email}`,
          `E-mail pentru confidențialitate și asistență: ${LEGAL_OPERATOR.privacyEmail}`
        ]
      },
      {
        title: '2. Site și serviciu',
        paragraphs: [
          `${LEGAL_OPERATOR.legalName} furnizează Sneep Cut la https://sneepcut.com ca serviciu software online pentru fluxuri video asistate de AI, editare, export, planificare și publicare către platforme conectate de utilizator. Prin serviciu nu este oferită o activitate profesională reglementată.`,
          'Societatea poate fi contactată direct și efectiv prin adresele de e-mail și numărul de telefon de mai sus. Pentru asistență privind contul, folosește pe cât posibil adresa asociată contului Sneep Cut.'
        ]
      },
      {
        title: '3. Prețuri, taxe și livrare',
        paragraphs: [
          'Prețul curent, moneda, perioada de facturare, funcțiile sau creditele incluse, informațiile privind reînnoirea și tratamentul fiscal aplicabil comenzii sunt afișate înainte de plată și în evidența plății ori factură. Sneep Cut este furnizat electronic, fără cost de livrare fizică.'
        ]
      },
      {
        title: '4. Reclamații și litigii de consum',
        paragraphs: [
          'Contactează-ne mai întâi folosind e-mailul contului, referința tranzacției dacă este relevantă și o descriere scurtă. Aceasta nu limitează remediile legale sau dreptul de a contacta o autoritate ori instanță competentă.',
          'Consumatorii români eligibili pot folosi informațiile și serviciile de soluționare alternativă ale Autorității Naționale pentru Protecția Consumatorilor (ANPC). Fosta platformă europeană de soluționare online a litigiilor a fost închisă în 2025 și nu este prezentată ca mijloc disponibil.'
        ],
        links: [
          {
            label: 'Autoritatea pentru protecția consumatorilor (ANPC)',
            href: 'https://anpc.ro/'
          },
          {
            label: 'Soluționarea alternativă a litigiilor ANPC (SAL)',
            href: 'https://reclamatiisal.anpc.ro/'
          }
        ]
      },
      {
        title: '5. Proprietate intelectuală',
        paragraphs: [
          'Denumirile, siglele, software-ul, interfața și materialele originale Sneep Cut aparțin operatorului ori licențiatorilor. Conținutul utilizatorilor este reglementat de Termeni. Site-ul nu acordă alte licențe decât drepturile limitate prevăzute expres în acei Termeni.'
        ]
      },
      {
        title: '6. Documente juridice',
        paragraphs: [
          'Politica de confidențialitate explică prelucrarea datelor; Politica privind cookie-urile descrie stocarea în browser; Termenii și Politica de utilizare acceptabilă guvernează folosirea; Politica de anulare și rambursare explică remediile de plată; Ștergerea datelor descrie eliminarea; iar paginile Subprocesatori și Acord privind prelucrarea datelor privesc clienții business.'
        ]
      }
    ],
    contactTitle: '7. Contact direct',
    contactPrompt: `Contactează ${LEGAL_OPERATOR.legalName} la`,
    contactFallback: LEGAL_OPERATOR.email
  }
}

export const COOKIE_POLICY_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Cookie Policy',
    updated: updated.en,
    intro:
      'This policy explains the cookies and similar browser storage used by Sneep Cut. We currently use them only where necessary for security, authentication, language, interface preferences, and requested integrations—not for third-party advertising.',
    sections: [
      {
        title: '1. What these technologies are',
        paragraphs: [
          'Cookies are small values stored by the browser and sent with relevant requests. Local storage and session storage keep limited information in the browser without automatically sending it with every request. Some values are first-party and some temporary authorization values are created only when you choose a third-party sign-in or social connection.'
        ]
      },
      {
        title: '2. Strictly necessary cookies',
        bullets: [
          'refreshToken: an HTTP-only, Secure production cookie used to maintain and renew an authenticated session. It is restricted to the authentication path and expires with the session or when you sign out.',
          'goGoogleState: a short-lived HTTP-only authorization-state cookie used when you choose Google sign-in. It normally expires after 10 minutes.',
          'social_oauth_<provider>: a short-lived HTTP-only authorization-state cookie used when you choose to connect a supported social account. It normally expires after 10 minutes.',
          'NEXT_LOCALE: a language preference used to keep the English or Romanian version you selected.',
          'sidebar_state: a functional preference that remembers the dashboard sidebar state.'
        ],
        paragraphs: [
          'These values support security or a feature you request. Blocking them can prevent sign-in, language persistence, account connections, or normal dashboard operation.'
        ]
      },
      {
        title: '3. Local and session storage',
        bullets: [
          'Theme preference: remembers light, dark, or system appearance on the device.',
          'Studio last-project preference: remembers the last Studio project for the signed-in user on that browser.',
          'Social connection popup state: temporarily coordinates the authorization popup with the page that opened it and is removed after the flow.'
        ]
      },
      {
        title: '4. Analytics and marketing',
        paragraphs: [
          'Sneep Cut does not currently set non-essential advertising or third-party analytics cookies on the public website. If that changes, we will update this policy and present consent choices before setting non-essential technologies where law requires it. Rejecting optional storage will not block the core service.'
        ]
      },
      {
        title: '5. Your controls',
        paragraphs: [
          'You can delete or block cookies and site data through browser settings. You can also clear local and session storage. Doing so may sign you out, reset language or appearance preferences, close authorization flows, or require you to reconnect a platform. Sign out before using a shared device.'
        ]
      },
      {
        title: '6. Third-party destinations',
        paragraphs: [
          'Google, Meta, TikTok, YouTube, Stripe, or another service may set cookies on its own domain when you visit its authorization, payment, or platform page. Those cookies are controlled by that provider and described in its notice. Sneep Cut cannot read unrelated third-party-domain cookies.'
        ]
      },
      {
        title: '7. Changes',
        paragraphs: [
          'We review this inventory when storage practices change. The revision date identifies the current version. Material additions, especially analytics or marketing technologies, will receive additional notice and consent controls where required.'
        ]
      }
    ],
    contactTitle: '8. Questions',
    contactPrompt: 'Questions about cookies or browser storage:',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Politica privind cookie-urile',
    updated: updated.ro,
    intro:
      'Această politică explică modulele cookie și stocarea similară folosite de Sneep Cut. În prezent le folosim numai când sunt necesare pentru securitate, autentificare, limbă, preferințe de interfață și integrările solicitate—nu pentru publicitate terță.',
    sections: [
      {
        title: '1. Ce sunt aceste tehnologii',
        paragraphs: [
          'Cookie-urile sunt valori mici stocate de browser și trimise împreună cu cererile relevante. Stocarea locală și de sesiune păstrează informații limitate în browser fără a le trimite automat la fiecare cerere. Unele valori sunt proprii, iar unele valori temporare de autorizare sunt create numai când alegi autentificarea sau conectarea unui serviciu terț.'
        ]
      },
      {
        title: '2. Cookie-uri strict necesare',
        bullets: [
          'refreshToken: cookie HTTP-only și Secure în producție, folosit pentru menținerea și reînnoirea sesiunii. Este limitat la calea de autentificare și expiră cu sesiunea sau la deconectare.',
          'goGoogleState: cookie HTTP-only de stare, cu durată scurtă, folosit când alegi autentificarea Google. Expiră în mod normal după 10 minute.',
          'social_oauth_<provider>: cookie HTTP-only de stare, cu durată scurtă, folosit când conectezi un cont social acceptat. Expiră în mod normal după 10 minute.',
          'NEXT_LOCALE: preferința de limbă folosită pentru păstrarea versiunii engleze sau române selectate.',
          'sidebar_state: preferință funcțională care reține starea barei laterale din panou.'
        ],
        paragraphs: [
          'Aceste valori susțin securitatea ori funcția solicitată. Blocarea poate împiedica autentificarea, păstrarea limbii, conectarea conturilor sau funcționarea normală a panoului.'
        ]
      },
      {
        title: '3. Stocare locală și de sesiune',
        bullets: [
          'Preferința temei: reține aspectul luminos, întunecat sau al sistemului pe dispozitiv.',
          'Ultimul proiect Studio: reține ultimul proiect pentru utilizatorul autentificat în acel browser.',
          'Starea ferestrei de conectare socială: coordonează temporar fereastra de autorizare cu pagina care a deschis-o și este eliminată după flux.'
        ]
      },
      {
        title: '4. Analiză și marketing',
        paragraphs: [
          'Sneep Cut nu setează în prezent cookie-uri neesențiale de publicitate sau analiză terță pe site-ul public. Dacă situația se schimbă, vom actualiza politica și vom prezenta opțiuni de consimțământ înainte de setarea tehnologiilor neesențiale, unde legea o cere. Refuzul stocării opționale nu va bloca serviciul de bază.'
        ]
      },
      {
        title: '5. Controalele tale',
        paragraphs: [
          'Poți șterge ori bloca cookie-urile și datele site-ului din setările browserului și poți goli stocarea locală sau de sesiune. Aceasta te poate deconecta, poate reseta limba sau aspectul, poate închide autorizări ori poate cere reconectarea unei platforme. Deconectează-te înainte de a folosi un dispozitiv comun.'
        ]
      },
      {
        title: '6. Destinații terțe',
        paragraphs: [
          'Google, Meta, TikTok, YouTube, Stripe sau alt serviciu poate seta cookie-uri pe propriul domeniu când vizitezi pagina sa de autorizare, plată ori platformă. Acestea sunt controlate de furnizor și descrise în informarea sa. Sneep Cut nu poate citi cookie-uri fără legătură de pe domenii terțe.'
        ]
      },
      {
        title: '7. Modificări',
        paragraphs: [
          'Revizuim inventarul când se schimbă practicile de stocare. Data revizuirii indică versiunea curentă. Adăugările importante, în special tehnologii de analiză ori marketing, vor primi notificare și controale de consimțământ unde este necesar.'
        ]
      }
    ],
    contactTitle: '8. Întrebări',
    contactPrompt: 'Întrebări despre cookie-uri sau stocarea în browser:',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}

export const ACCEPTABLE_USE_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Acceptable Use Policy',
    updated: updated.en,
    intro:
      'This policy protects users, people appearing in content, connected platforms, and the Sneep Cut service. It forms part of the Terms of Service.',
    sections: [
      {
        title: '1. Rights and lawful use',
        bullets: [
          'Use only media, personal data, music, brands, accounts, and platform permissions you are authorized to use.',
          'Respect copyright, privacy, publicity, contractual, employment, advertising, consumer, and data-protection laws.',
          'Obtain required consent from people depicted, recorded, profiled, or targeted by the content.'
        ]
      },
      {
        title: '2. Harmful and illegal content',
        bullets: [
          'Do not create, upload, distribute, or promote child sexual abuse material, sexual exploitation, non-consensual intimate content, trafficking, or grooming.',
          'Do not facilitate violence, credible threats, terrorism, self-harm encouragement, illegal goods, fraud, extortion, or other criminal conduct.',
          'Do not publish unlawful hate, harassment, doxxing, or content intended to cause serious harm.'
        ]
      },
      {
        title: '3. Deception and synthetic media',
        bullets: [
          'Do not impersonate a person or organization unlawfully, forge authority, or conceal sponsorship or material commercial relationships where disclosure is required.',
          'Do not use edited or AI-generated media to defraud, manipulate civic processes, fabricate evidence, or falsely present a real person as saying or doing something harmful.',
          'Add labels or disclosures required by law and the destination platform for synthetic, altered, sponsored, or branded content.'
        ]
      },
      {
        title: '4. Security and service integrity',
        bullets: [
          'Do not introduce malware, probe without authorization, evade rate limits or quotas, scrape protected data, interfere with another account, or attempt to obtain credentials or tokens.',
          'Do not reverse engineer or copy the service except where law expressly permits, use stolen payment methods, resell unauthorized access, or share credentials outside permitted team features.',
          'Do not use automated activity to overload Sneep Cut or a connected platform.'
        ]
      },
      {
        title: '5. Platform abuse and spam',
        bullets: [
          'Follow each destination platform’s community, developer, music, advertising, branded-content, and publishing rules.',
          'Do not mass-post unsolicited or substantially duplicative content, manipulate engagement, evade platform enforcement, or reconnect an account to bypass a restriction.'
        ]
      },
      {
        title: '6. Enforcement',
        paragraphs: [
          'We may investigate credible reports, preserve evidence where lawfully required, block a file or operation, limit features, suspend an account, or terminate access proportionately to the risk and violation. We may report apparently illegal material to competent authorities where required. We will provide notice and an opportunity to appeal or remedy when appropriate and lawful.'
        ]
      },
      {
        title: '7. Reporting',
        paragraphs: [
          'Report suspected abuse with the relevant URL, account or project reference, why the content violates this policy, and information showing your authority or rights where relevant. Do not include passwords, access tokens, or unnecessary sensitive data.'
        ]
      }
    ],
    contactTitle: '8. Report abuse',
    contactPrompt: 'Send a policy or abuse report to',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Politica de utilizare acceptabilă',
    updated: updated.ro,
    intro:
      'Această politică protejează utilizatorii, persoanele din conținut, platformele conectate și serviciul Sneep Cut. Ea face parte din Termeni.',
    sections: [
      {
        title: '1. Drepturi și utilizare legală',
        bullets: [
          'Folosește numai fișiere, date personale, muzică, mărci, conturi și permisiuni pe care ești autorizat să le folosești.',
          'Respectă drepturile de autor, viața privată, dreptul la imagine, contractele, normele de muncă, publicitate, consum și protecția datelor.',
          'Obține acordul necesar al persoanelor reprezentate, înregistrate, profilate ori vizate de conținut.'
        ]
      },
      {
        title: '2. Conținut dăunător și ilegal',
        bullets: [
          'Nu crea, încărca, distribui ori promova materiale de abuz sexual asupra copiilor, exploatare sexuală, conținut intim fără consimțământ, trafic sau ademenire.',
          'Nu facilita violența, amenințările credibile, terorismul, încurajarea autovătămării, bunurile ilegale, frauda, șantajul sau alte infracțiuni.',
          'Nu publica ură ilegală, hărțuire, divulgarea datelor personale ori conținut menit să producă prejudicii grave.'
        ]
      },
      {
        title: '3. Înșelare și conținut sintetic',
        bullets: [
          'Nu uzurpa ilegal identitatea unei persoane ori organizații, nu falsifica autoritatea și nu ascunde sponsorizarea ori relațiile comerciale importante când informarea este obligatorie.',
          'Nu folosi conținut editat ori generat de AI pentru fraudă, manipularea proceselor civice, fabricarea probelor sau prezentarea falsă și dăunătoare a unei persoane reale.',
          'Adaugă etichetele ori informările cerute de lege și platformă pentru conținut sintetic, modificat, sponsorizat sau de brand.'
        ]
      },
      {
        title: '4. Securitate și integritatea serviciului',
        bullets: [
          'Nu introduce malware, nu testa fără autorizare, nu ocoli limite ori cote, nu extrage date protejate și nu încerca să obții credențiale sau tokenuri.',
          'Nu face inginerie inversă ori copia serviciul în afara permisiunii legale, nu folosi metode de plată furate, nu revinde acces neautorizat și nu partaja datele de acces în afara funcțiilor de echipă permise.',
          'Nu folosi automatizări pentru a supraîncărca Sneep Cut ori o platformă conectată.'
        ]
      },
      {
        title: '5. Abuz și spam pe platforme',
        bullets: [
          'Respectă regulile comunității, dezvoltatorilor, muzicii, publicității, conținutului de brand și publicării ale fiecărei destinații.',
          'Nu publica masiv conținut nesolicitat ori substanțial duplicat, nu manipula interacțiunile, nu evita măsurile platformei și nu reconecta un cont pentru a ocoli o restricție.'
        ]
      },
      {
        title: '6. Aplicarea politicii',
        paragraphs: [
          'Putem investiga sesizări credibile, păstra dovezi unde legea cere, bloca un fișier ori o operațiune, limita funcții, suspenda un cont sau înceta accesul proporțional cu riscul și încălcarea. Putem raporta materiale aparent ilegale autorităților competente când este obligatoriu. Oferim notificare și posibilitatea de contestare ori remediere când este adecvat și legal.'
        ]
      },
      {
        title: '7. Sesizări',
        paragraphs: [
          'Trimite URL-ul, contul ori proiectul relevant, motivul încălcării și informații care arată autoritatea sau drepturile tale, dacă este cazul. Nu include parole, tokenuri sau date sensibile nenecesare.'
        ]
      }
    ],
    contactTitle: '8. Raportează un abuz',
    contactPrompt: 'Trimite o sesizare privind politica sau un abuz la',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}

export const REFUND_POLICY_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Refund and Cancellation Policy',
    updated: updated.en,
    intro:
      'This policy explains subscription cancellation, credit purchases, billing errors, refunds, and statutory withdrawal rights. Mandatory consumer law prevails if it gives you stronger rights.',
    sections: [
      {
        title: '1. Before purchase',
        paragraphs: [
          'The pricing and checkout screens show the product, price, currency, billing period, renewal, included credits or features, and applicable taxes before payment. Review that information and the Terms before confirming. Payments are processed by the provider shown at checkout; Sneep Cut does not store full card details.'
        ]
      },
      {
        title: '2. Cancel a subscription',
        paragraphs: [
          'Open Dashboard → Billing and use the subscription-management control, or contact us if the control is unavailable. Cancellation stops future renewal; it does not ordinarily reverse a charge already incurred. Unless a refund or statutory withdrawal applies, paid access continues until the end of the current billing period.',
          'Deleting an account also starts cancellation of an active subscription as part of the protected deletion workflow. If provider confirmation is temporarily unavailable, retry or contact support before assuming cancellation completed.'
        ]
      },
      {
        title: '3. Credit packs and service credits',
        paragraphs: [
          'Credits are service-use units and have no cash value. Plan and pack screens identify applicable renewal, rollover, or expiry rules. Used credits are normally not refundable after the requested processing has been supplied, except where mandatory law or a confirmed service failure requires a remedy.',
          'If processing fails technically and the product nevertheless shows a completed-service credit charge, contact us with the job reference. We will investigate the ledger and restore incorrectly consumed credits or provide another legally appropriate remedy.'
        ]
      },
      {
        title: '4. Billing errors and voluntary refunds',
        bullets: [
          'Report a duplicate charge, incorrect amount, unauthorized transaction, or inaccessible paid feature without undue delay.',
          'Include the account email, date, amount, currency, and provider transaction or invoice reference—never full card details.',
          'Outside mandatory rights, voluntary refunds are assessed case by case based on service delivery, usage, provider records, and the reason for the request.'
        ],
        paragraphs: [
          'Approved cash refunds are returned through the original payment method where possible. Bank and payment-provider processing times are outside our control. Credit corrections may appear directly in the Sneep Cut balance.'
        ]
      },
      {
        title: '5. EEA consumer withdrawal',
        paragraphs: [
          'An EEA consumer generally has 14 days from concluding a distance service or digital-content contract to communicate withdrawal, unless a lawful exception applies. You may use the model below or any clear statement. Send it before the deadline.',
          'If you expressly request service performance during the withdrawal period, you may owe a proportionate amount for service supplied before withdrawal. For digital content not supplied on a physical medium, the right can be lost only where the legal conditions—including prior express consent and acknowledgment—are met. We do not treat policy text alone as that consent.',
          'A valid withdrawal results in reimbursement required by law, normally using the original payment method and within the statutory period. Consumer conformity remedies for defective digital services remain separate.'
        ]
      },
      {
        title: '6. Model withdrawal statement',
        paragraphs: [
          `To ${LEGAL_OPERATOR.legalName}, ${LEGAL_OPERATOR.address}, ${LEGAL_OPERATOR.email}: I hereby give notice that I withdraw from my contract for the following Sneep Cut service: [plan or credit pack]. Ordered on: [date]. Account email: [email]. Consumer name and address: [details]. Date: [date]. Signature only if sent on paper.`,
          'You do not have to use this exact wording. A clear email identifying the contract and decision to withdraw is sufficient.'
        ]
      },
      {
        title: '7. Chargebacks',
        paragraphs: [
          'Contact us first where practical so we can investigate quickly. A chargeback does not remove amounts lawfully due and may require temporary account restriction while the payment provider investigates. This does not limit your right to dispute an unauthorized or incorrect transaction.'
        ]
      },
      {
        title: '8. Policy changes',
        paragraphs: [
          'Changes apply prospectively and do not remove rights already accrued. Material changes affecting an active paid subscription receive notice where required.'
        ]
      }
    ],
    contactTitle: '9. Cancellation or refund request',
    contactPrompt: 'Send the request and transaction reference to',
    contactFallback: LEGAL_OPERATOR.email
  },
  ro: {
    title: 'Politica de anulare și rambursare',
    updated: updated.ro,
    intro:
      'Această politică explică anularea abonamentelor, cumpărarea creditelor, erorile de facturare, rambursările și dreptul legal de retragere. Legea obligatorie a consumatorilor prevalează dacă oferă drepturi mai puternice.',
    sections: [
      {
        title: '1. Înainte de cumpărare',
        paragraphs: [
          'Ecranele de preț și plată arată produsul, prețul, moneda, perioada, reînnoirea, creditele ori funcțiile și taxele aplicabile înainte de plată. Verifică informațiile și Termenii înainte de confirmare. Plățile sunt procesate de furnizorul afișat; Sneep Cut nu stochează datele complete ale cardului.'
        ]
      },
      {
        title: '2. Anularea abonamentului',
        paragraphs: [
          'Deschide Panou → Facturare și folosește controlul de administrare a abonamentului sau contactează-ne dacă nu este disponibil. Anularea oprește reînnoirea viitoare; în mod obișnuit nu inversează o taxă deja datorată. Dacă nu se aplică o rambursare ori retragere legală, accesul plătit continuă până la finalul perioadei curente.',
          'Ștergerea contului inițiază și anularea abonamentului în fluxul protejat. Dacă confirmarea furnizorului nu este temporar disponibilă, reîncearcă ori contactează asistența înainte de a presupune că anularea s-a finalizat.'
        ]
      },
      {
        title: '3. Pachete și credite de serviciu',
        paragraphs: [
          'Creditele sunt unități de utilizare și nu au valoare în numerar. Ecranele planului și pachetului indică regulile aplicabile privind reînnoirea, reportarea sau expirarea. Creditele folosite nu sunt în mod normal rambursabile după furnizarea procesării solicitate, cu excepția cazului în care legea obligatorie ori un eșec confirmat impune un remediu.',
          'Dacă procesarea eșuează tehnic, dar produsul arată o taxare pentru serviciu finalizat, contactează-ne cu referința lucrării. Vom verifica registrul și vom restitui creditele consumate incorect ori vom oferi alt remediu legal.'
        ]
      },
      {
        title: '4. Erori de plată și rambursări voluntare',
        bullets: [
          'Raportează fără întârzieri nejustificate o taxă duplicată, sumă incorectă, tranzacție neautorizată ori funcție plătită inaccesibilă.',
          'Include e-mailul contului, data, suma, moneda și referința tranzacției sau facturii—niciodată datele complete ale cardului.',
          'În afara drepturilor obligatorii, rambursările voluntare sunt analizate individual pe baza furnizării, utilizării, evidențelor furnizorului și motivului cererii.'
        ],
        paragraphs: [
          'Rambursările aprobate sunt returnate prin metoda inițială unde este posibil. Durata băncii și furnizorului este în afara controlului nostru. Corecțiile de credite pot apărea direct în sold.'
        ]
      },
      {
        title: '5. Retragerea consumatorilor din SEE',
        paragraphs: [
          'Un consumator din SEE are, în general, 14 zile de la încheierea unui contract la distanță pentru servicii ori conținut digital să comunice retragerea, dacă nu se aplică legal o excepție. Poți folosi modelul de mai jos sau orice declarație clară, transmisă înainte de termen.',
          'Dacă soliciți expres începerea serviciului în perioada de retragere, poți datora suma proporțională pentru serviciul furnizat înainte de retragere. Pentru conținut digital fără suport material, dreptul poate fi pierdut numai dacă sunt îndeplinite condițiile legale, inclusiv consimțământul expres prealabil și confirmarea luării la cunoștință. Textul politicii, singur, nu reprezintă acel consimțământ.',
          'Retragerea validă duce la rambursarea cerută de lege, în mod normal prin metoda inițială și în termenul legal. Remediile de conformitate pentru servicii digitale defecte rămân separate.'
        ]
      },
      {
        title: '6. Model de declarație de retragere',
        paragraphs: [
          `Către ${LEGAL_OPERATOR.legalName}, ${LEGAL_OPERATOR.address}, ${LEGAL_OPERATOR.email}: Vă informez că mă retrag din contractul privind următorul serviciu Sneep Cut: [plan sau pachet]. Comandat la: [data]. E-mail cont: [e-mail]. Numele și adresa consumatorului: [date]. Data: [data]. Semnătura numai dacă formularul este trimis pe hârtie.`,
          'Nu este obligatorie această formulare. Este suficient un e-mail clar care identifică acordul și decizia de retragere.'
        ]
      },
      {
        title: '7. Refuzul la plată',
        paragraphs: [
          'Contactează-ne mai întâi când este practic, pentru investigare rapidă. Un refuz la plată nu elimină sumele legal datorate și poate necesita restricționarea temporară a contului în timpul investigației furnizorului. Aceasta nu limitează dreptul de a contesta o tranzacție neautorizată ori incorectă.'
        ]
      },
      {
        title: '8. Modificări',
        paragraphs: [
          'Schimbările se aplică pentru viitor și nu elimină drepturi deja dobândite. Modificările importante pentru un abonament plătit activ sunt notificate unde este necesar.'
        ]
      }
    ],
    contactTitle: '9. Cerere de anulare sau rambursare',
    contactPrompt: 'Trimite cererea și referința tranzacției la',
    contactFallback: LEGAL_OPERATOR.email
  }
}

export const SUBPROCESSORS_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Subprocessors',
    updated: updated.en,
    intro:
      'This page identifies providers that may process customer personal data for Sneep Cut. A provider is used only when the relevant feature is enabled or requested.',
    sections: [
      {
        title: '1. Core infrastructure',
        bullets: [
          'netcup GmbH — Germany — production hosting, compute, networking, database, media storage, and storage used for operator-managed backups.'
        ]
      },
      {
        title: '2. Authentication and email',
        bullets: [
          'Google Ireland Limited / Google LLC — EEA and United States — Google sign-in, only when the user selects that method.',
          'Resend, Inc. — United States — transactional account and security email, only when the Resend delivery adapter is configured.',
          'Configured SMTP provider — location depends on the operator selected — transactional email when SMTP is used instead of Resend. Contact us for the provider active for your account.'
        ]
      },
      {
        title: '3. AI-assisted processing',
        bullets: [
          'OpenRouter, Inc. — United States — routes selected text or multimodal AI requests to the configured model provider when OpenRouter is enabled.',
          'Google LLC / Google Cloud — EEA, United States, and provider infrastructure — Gemini processing when configured directly or selected through an AI router.',
          'The configured model provider — location depends on the model selected — receives only the request context needed for the feature. The provider/model may change as documented here or in an enterprise order.'
        ],
        paragraphs: [
          'Local media-processing components, including local transcription where configured, do not constitute an external subprocessor.'
        ]
      },
      {
        title: '4. Payments',
        bullets: [
          'Stripe Payments Europe, Limited and relevant Stripe group entities — EEA, United States, and global infrastructure — checkout, subscriptions, invoices, fraud prevention, and payment support when a paid product is used.'
        ]
      },
      {
        title: '5. Connected platforms are separate services',
        paragraphs: [
          'Meta, TikTok, Google/YouTube, and any other destination selected by a user receive content and account data at the user’s direction. They generally act under their own platform terms and privacy notices rather than as general Sneep Cut subprocessors. Their use is optional and initiated through account connection or publishing.'
        ]
      },
      {
        title: '6. Changes and objections',
        paragraphs: [
          'Business customers provide general authorization for the listed subprocessors under the Data Processing Addendum. We will update this page before a material new subprocessor begins processing where reasonably possible. A customer may object on reasonable data-protection grounds by contacting us promptly; the parties will work in good faith on a solution, which may include disabling the affected optional feature or ending it under the agreement.'
        ]
      }
    ],
    contactTitle: '7. Subprocessor questions',
    contactPrompt: 'Request current provider or transfer information at',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Subprocesatori',
    updated: updated.ro,
    intro:
      'Această pagină identifică furnizorii care pot prelucra date personale ale clienților pentru Sneep Cut. Un furnizor este folosit numai când funcția relevantă este activată sau solicitată.',
    sections: [
      {
        title: '1. Infrastructură principală',
        bullets: [
          'netcup GmbH — Germania — găzduire de producție, calcul, rețea, bază de date, stocare media și spațiu folosit pentru copii administrate de operator.'
        ]
      },
      {
        title: '2. Autentificare și e-mail',
        bullets: [
          'Google Ireland Limited / Google LLC — SEE și Statele Unite — autentificare Google, numai când utilizatorul alege metoda.',
          'Resend, Inc. — Statele Unite — e-mailuri tranzacționale pentru cont și securitate, numai când adaptorul Resend este configurat.',
          'Furnizor SMTP configurat — locația depinde de furnizorul selectat de operator — e-mail tranzacțional când este folosit SMTP în locul Resend. Contactează-ne pentru furnizorul activ pentru contul tău.'
        ]
      },
      {
        title: '3. Prelucrare asistată de AI',
        bullets: [
          'OpenRouter, Inc. — Statele Unite — direcționează cereri AI text sau multimodale către modelul configurat când OpenRouter este activ.',
          'Google LLC / Google Cloud — SEE, Statele Unite și infrastructura furnizorului — procesare Gemini când este configurat direct ori selectat printr-un router AI.',
          'Furnizorul modelului configurat — locația depinde de model — primește numai contextul necesar funcției. Furnizorul/modelul se poate schimba conform acestei pagini ori unei comenzi enterprise.'
        ],
        paragraphs: [
          'Componentele locale de procesare media, inclusiv transcrierea locală când este configurată, nu sunt subprocesatori externi.'
        ]
      },
      {
        title: '4. Plăți',
        bullets: [
          'Stripe Payments Europe, Limited și entitățile relevante din grupul Stripe — SEE, Statele Unite și infrastructură globală — plată, abonamente, facturi, prevenirea fraudei și asistență de plată când este folosit un produs plătit.'
        ]
      },
      {
        title: '5. Platformele conectate sunt servicii separate',
        paragraphs: [
          'Meta, TikTok, Google/YouTube și orice altă destinație aleasă primesc conținut și date de cont la instrucțiunea utilizatorului. Acestea acționează în general conform propriilor termeni și politici, nu ca subprocesatori generali Sneep Cut. Folosirea lor este opțională și inițiată prin conectare ori publicare.'
        ]
      },
      {
        title: '6. Schimbări și obiecții',
        paragraphs: [
          'Clienții business oferă autorizare generală pentru subprocesatorii enumerați potrivit Acordului privind prelucrarea datelor. Vom actualiza pagina înainte ca un subprocesator nou important să înceapă prelucrarea, când este rezonabil posibil. Clientul poate obiecta prompt pentru motive rezonabile de protecție a datelor; părțile vor căuta o soluție, inclusiv dezactivarea funcției opționale afectate ori încetarea ei conform acordului.'
        ]
      }
    ],
    contactTitle: '7. Întrebări despre subprocesatori',
    contactPrompt:
      'Solicită informații actuale despre furnizori sau transferuri la',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}

export const DPA_COPY: Record<SiteLocale, LegalDocumentCopy> = {
  en: {
    title: 'Data Processing Addendum',
    updated: updated.en,
    intro:
      'This Data Processing Addendum (DPA) supplements the Terms or other service agreement when Sneep Cut processes Customer Personal Data on behalf of a business customer. It is designed to address Article 28 GDPR requirements.',
    sections: [
      {
        title: '1. Parties and effect',
        paragraphs: [
          `The customer accepting or signing the service agreement is “Customer.” ${LEGAL_OPERATOR.legalName}, operator of Sneep Cut, is “Processor.” This DPA applies automatically where Customer is controller or processor of personal data and Sneep Cut processes that data on Customer’s documented instructions to provide the service.`,
          'If Customer acts as processor for another controller, Customer confirms it may appoint Sneep Cut as subprocessor and will communicate relevant controller instructions. A signed counterpart is available on request. If a negotiated signed DPA conflicts with this page, the signed DPA controls.'
        ]
      },
      {
        title: '2. Processing details',
        bullets: [
          'Subject matter and purpose: hosting, ingesting, transcribing, analyzing, transforming, editing, storing, exporting, scheduling, publishing, supporting, and securing media workflows requested by Customer.',
          'Duration: the service term plus the limited deletion, backup, security, and legal-retention periods described in the agreement and Privacy Policy.',
          'Data subjects: Customer users, personnel, contractors, clients, audience members, speakers, people depicted or heard in media, social-account contacts, and other people whose data Customer submits.',
          'Data types: identifiers, contact and account data, images, video, voice, likeness, transcripts, captions, prompts, project metadata, social identifiers and tokens, publishing data, technical data, and any other personal data chosen by Customer.',
          'Processing operations: collection from Customer, organization, storage, retrieval, consultation, automated analysis, alteration, transmission to Customer-selected destinations, restriction, export, and deletion.'
        ]
      },
      {
        title: '3. Customer instructions and obligations',
        paragraphs: [
          'The agreement, feature configuration, Customer actions, and written support directions are documented instructions. Processor will process Customer Personal Data only on those instructions unless Union or Member State law requires otherwise, in which case Processor will notify Customer before processing unless law prohibits notice.',
          'Customer is responsible for the lawfulness, fairness, accuracy, transparency, and minimization of submitted data; required notices and consents; user authorization; and ensuring instructions comply with law. Processor will promptly inform Customer if, in its opinion, an instruction infringes applicable data-protection law and may pause the affected operation.'
        ]
      },
      {
        title: '4. Confidentiality and personnel',
        paragraphs: [
          'Processor limits access to personnel and contractors who need it for the service and binds them to confidentiality obligations that survive access. Access is reviewed and removed when no longer required.'
        ]
      },
      {
        title: '5. Security measures',
        bullets: [
          'Encrypted network transport and Secure/HTTP-only authentication cookies in production.',
          'Password hashing, role and service access controls, restricted production access, and secrets separation.',
          'Encryption of stored social credentials, short-lived OAuth state, signed media access, rate limiting, and account-scoped storage paths.',
          'Upload validation and malware scanning, service and network isolation, monitoring, logging, and recovery procedures appropriate to the environment.',
          'Deletion workflows that coordinate active jobs, billing cancellation, social credentials, database records, and account media before finalization.'
        ],
        paragraphs: [
          'Processor may update safeguards to reflect risk and technology, provided overall protection is not materially reduced. No control eliminates all risk.'
        ]
      },
      {
        title: '6. Subprocessors',
        paragraphs: [
          'Customer gives general authorization to use the providers listed on the Subprocessors page. Processor remains responsible for imposing data-protection obligations appropriate to the services supplied. Processor will post material additions before use where reasonably possible.',
          'Customer may object promptly on reasonable data-protection grounds. The parties will try to resolve the concern, including by changing configuration where commercially and technically feasible. If no reasonable solution exists, either party may terminate the affected optional feature or service under the agreement.'
        ]
      },
      {
        title: '7. International transfers',
        paragraphs: [
          'Customer authorizes transfers needed for the listed providers and selected destinations. Processor will use a lawful transfer mechanism where required, including an adequacy decision or approved Standard Contractual Clauses with appropriate supplementary measures. If Standard Contractual Clauses must apply directly between Customer and Processor, the parties will complete and execute the appropriate module; Customer may request that document using the contact below.'
        ]
      },
      {
        title: '8. Data-subject requests and compliance assistance',
        paragraphs: [
          'Taking into account the nature of processing, Processor provides available self-service export, correction, disconnection, and deletion tools and reasonable assistance for Customer to answer rights requests. If Processor receives a request concerning Customer Personal Data, it will redirect the requester to Customer where feasible and will not respond substantively unless authorized or legally required.',
          'Processor will provide reasonable information needed for Customer’s data-protection impact assessments, consultations, security obligations, and breach notifications, considering the service and information available to Processor.'
        ]
      },
      {
        title: '9. Personal-data incidents',
        paragraphs: [
          'Processor will notify Customer without undue delay after confirming a personal-data breach affecting Customer Personal Data. Notice will include available information about the nature, likely consequences, affected categories, measures taken, and contact point, and may be supplied in phases. Notification is not an admission of fault. Customer is responsible for notifications it is legally required to make as controller.'
        ]
      },
      {
        title: '10. Return and deletion',
        paragraphs: [
          'During the term, Customer may use available export tools. On account deletion or service termination, Processor will delete or return Customer Personal Data according to Customer’s choice where technically available, then remove remaining active copies, unless law requires retention. Protected backup remnants are isolated from ordinary use and removed or overwritten according to the applicable lifecycle. Customer-selected publications on third-party platforms must be managed separately.'
        ]
      },
      {
        title: '11. Information and audits',
        paragraphs: [
          'Processor will make available information reasonably necessary to demonstrate Article 28 compliance. Customer should first use current documentation, independent reports if available, and written answers. If these are insufficient, Customer may request one proportionate audit per year by an independent, confidential, non-competitor auditor, with reasonable notice, during business hours, without accessing other customers’ data or disrupting security. Customer bears its audit costs unless a material breach by Processor is confirmed.'
        ]
      },
      {
        title: '12. Liability, priority, and law',
        paragraphs: [
          'The agreement’s liability limits apply to this DPA to the extent permitted by data-protection law. This DPA controls over inconsistent agreement language about processing Customer Personal Data; otherwise the agreement remains unchanged. Romanian law governs, without displacing mandatory GDPR rights or the supervisory authority and court rights provided by GDPR.'
        ]
      }
    ],
    contactTitle: '13. DPA requests',
    contactPrompt: 'Request a signed copy or send privacy instructions to',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  },
  ro: {
    title: 'Acord privind prelucrarea datelor',
    updated: updated.ro,
    intro:
      'Acest Acord privind prelucrarea datelor (DPA) completează Termenii sau alt acord când Sneep Cut prelucrează Date personale ale Clientului în numele unui client business. Documentul urmărește cerințele art. 28 GDPR.',
    sections: [
      {
        title: '1. Părți și aplicare',
        paragraphs: [
          `Clientul care acceptă ori semnează acordul de servicii este „Clientul”. ${LEGAL_OPERATOR.legalName}, operatorul Sneep Cut, este „Persoana împuternicită”. DPA se aplică automat când Clientul este operator ori persoană împuternicită, iar Sneep Cut prelucrează date conform instrucțiunilor documentate pentru furnizarea serviciului.`,
          'Dacă Clientul este împuternicit pentru alt operator, confirmă că poate numi Sneep Cut ca subîmputernicit și va comunica instrucțiunile relevante. O versiune semnată este disponibilă la cerere. Dacă un DPA negociat și semnat contrazice această pagină, documentul semnat prevalează.'
        ]
      },
      {
        title: '2. Detaliile prelucrării',
        bullets: [
          'Obiect și scop: găzduirea, primirea, transcrierea, analiza, transformarea, editarea, stocarea, exportul, programarea, publicarea, asistența și securizarea fluxurilor solicitate.',
          'Durată: perioada serviciului plus perioadele limitate de ștergere, backup, securitate și păstrare legală descrise în acord și Politica de confidențialitate.',
          'Persoane vizate: utilizatorii, personalul, colaboratorii și clienții Clientului, membrii audienței, vorbitori, persoane vizibile ori audibile, contacte sociale și alte persoane ale căror date sunt trimise.',
          'Tipuri de date: identificatori, date de contact și cont, imagine, video, voce, trăsături vizibile, transcrieri, descrieri, prompturi, metadate de proiect, identificatori și tokenuri sociale, date de publicare, date tehnice și alte date alese de Client.',
          'Operațiuni: colectare de la Client, organizare, stocare, extragere, consultare, analiză automată, modificare, transmitere către destinații alese, restricționare, export și ștergere.'
        ]
      },
      {
        title: '3. Instrucțiuni și obligațiile Clientului',
        paragraphs: [
          'Acordul, configurația funcțiilor, acțiunile Clientului și instrucțiunile scrise de asistență sunt instrucțiuni documentate. Persoana împuternicită prelucrează numai conform acestora, dacă dreptul Uniunii sau al unui stat membru nu impune altfel; în acest caz informează Clientul înainte, dacă legea nu interzice.',
          'Clientul răspunde pentru legalitatea, echitatea, exactitatea, transparența și minimizarea datelor; informări și consimțăminte; autorizarea utilizatorilor; și conformitatea instrucțiunilor. Persoana împuternicită informează prompt dacă apreciază că o instrucțiune încalcă legea și poate suspenda operațiunea afectată.'
        ]
      },
      {
        title: '4. Confidențialitate și personal',
        paragraphs: [
          'Accesul este limitat la personalul și colaboratorii care au nevoie pentru serviciu și sunt obligați la confidențialitate inclusiv după încetarea accesului. Accesul este revizuit și retras când nu mai este necesar.'
        ]
      },
      {
        title: '5. Măsuri de securitate',
        bullets: [
          'Transport criptat și cookie-uri de autentificare Secure/HTTP-only în producție.',
          'Hash pentru parole, controale de rol și serviciu, acces restricționat la producție și separarea secretelor.',
          'Criptarea credențialelor sociale, stare OAuth de scurtă durată, acces semnat la fișiere, limitarea cererilor și căi de stocare izolate pe cont.',
          'Validarea și scanarea anti-malware a încărcărilor, izolarea serviciilor și rețelei, monitorizare, jurnale și proceduri de recuperare adecvate.',
          'Fluxuri de ștergere care coordonează lucrările active, facturarea, credențialele sociale, înregistrările și fișierele înainte de finalizare.'
        ],
        paragraphs: [
          'Măsurile pot fi actualizate conform riscului și tehnologiei, fără reducerea materială a protecției generale. Nicio măsură nu elimină toate riscurile.'
        ]
      },
      {
        title: '6. Subprocesatori',
        paragraphs: [
          'Clientul oferă autorizare generală pentru furnizorii de pe pagina Subprocesatori. Persoana împuternicită impune obligații adecvate și rămâne responsabilă conform legii. Adăugările importante sunt publicate înainte de utilizare, când este rezonabil posibil.',
          'Clientul poate obiecta prompt din motive rezonabile de protecție a datelor. Părțile vor căuta o soluție, inclusiv schimbarea configurației unde este fezabil. Dacă nu există o soluție rezonabilă, funcția opțională ori serviciul afectat poate înceta conform acordului.'
        ]
      },
      {
        title: '7. Transferuri internaționale',
        paragraphs: [
          'Clientul autorizează transferurile necesare furnizorilor enumerați și destinațiilor selectate. Se folosește un mecanism legal când este necesar, inclusiv o decizie de adecvare ori Clauze Contractuale Standard și măsuri suplimentare. Dacă aceste clauze trebuie să se aplice direct între Client și Persoana împuternicită, părțile vor completa și semna modulul potrivit; Clientul poate solicita documentul folosind contactul de mai jos.'
        ]
      },
      {
        title: '8. Cereri ale persoanelor și asistență',
        paragraphs: [
          'Ținând cont de natura prelucrării, sunt oferite controale de export, corectare, deconectare și ștergere și asistență rezonabilă pentru răspunsul Clientului la cereri. Dacă primim o cerere privind Datele Clientului, o redirecționăm către Client unde este posibil și nu răspundem pe fond fără autorizare ori obligație legală.',
          'Furnizăm informații rezonabile pentru evaluări de impact, consultări, obligații de securitate și notificări de încălcare, ținând cont de serviciu și informațiile disponibile.'
        ]
      },
      {
        title: '9. Incidente privind datele',
        paragraphs: [
          'Vom notifica Clientul fără întârzieri nejustificate după confirmarea unei încălcări care afectează Datele Clientului. Notificarea include informațiile disponibile despre natură, consecințe, categorii afectate, măsuri și contact și poate fi oferită în etape. Notificarea nu reprezintă recunoașterea culpei. Clientul răspunde pentru notificările sale ca operator.'
        ]
      },
      {
        title: '10. Returnare și ștergere',
        paragraphs: [
          'În timpul acordului, Clientul poate folosi exportul disponibil. La ștergerea contului ori încetarea serviciului, datele sunt returnate sau șterse conform alegerii unde este tehnic disponibil, apoi copiile active rămase sunt eliminate, dacă legea nu cere păstrarea. Resturile din backup sunt izolate și suprascrise conform ciclului aplicabil. Publicările de pe platforme terțe se administrează separat.'
        ]
      },
      {
        title: '11. Informații și audituri',
        paragraphs: [
          'Punem la dispoziție informații rezonabil necesare demonstrării conformității cu art. 28. Clientul va folosi mai întâi documentația, rapoartele independente dacă există și răspunsurile scrise. Dacă sunt insuficiente, poate solicita un audit proporțional anual realizat de un auditor independent, confidențial și neconcurent, cu notificare rezonabilă, în program, fără acces la datele altor clienți ori perturbarea securității. Clientul suportă costul, exceptând confirmarea unei încălcări materiale.'
        ]
      },
      {
        title: '12. Răspundere, prioritate și lege',
        paragraphs: [
          'Limitele de răspundere ale acordului se aplică DPA în măsura permisă de lege. DPA prevalează pentru neconcordanțe privind prelucrarea Datelor Clientului; în rest acordul rămâne neschimbat. Se aplică legea română, fără înlăturarea drepturilor obligatorii GDPR ori a drepturilor privind autoritatea și instanțele prevăzute de GDPR.'
        ]
      }
    ],
    contactTitle: '13. Cereri privind DPA',
    contactPrompt: 'Solicită o copie semnată sau transmite instrucțiuni la',
    contactFallback: LEGAL_OPERATOR.privacyEmail
  }
}
