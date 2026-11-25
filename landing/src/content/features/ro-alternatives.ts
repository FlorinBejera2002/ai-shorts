import type { AlternativePageId, FeaturePageCopy } from './types'

const CHECKED =
  'Datele despre concurenți au fost verificate pe paginile lor publice de prețuri și ajutor pe 25 noiembrie 2026. Planurile se schimbă des, așa că verifică pe site-ul lor detaliile actuale. Numele produselor aparțin proprietarilor lor; Sneep Cut nu este afiliat cu ei.'

const COLUMNS = (competitor: string): [string, string, string] => ['Criteriu', 'Sneep Cut', competitor]

export const roAlternatives: Record<AlternativePageId, FeaturePageCopy> = {
  'alternatives/opus-clip': {
    navLabel: 'Alternativă la OpusClip',
    metaTitle: 'Alternativă la OpusClip, cu interfață în română | Sneep Cut',
    metaDescription:
      'Cauți o alternativă la OpusClip? Compară Sneep Cut și OpusClip: plan gratuit, publicare, kit de brand și surse video, cu date verificate în noiembrie 2026.',
    eyebrow: 'Alternativă la OpusClip',
    title: 'Sneep Cut, o alternativă la OpusClip',
    lead:
      'OpusClip este unul dintre cele mai cunoscute instrumente de clipuri cu AI. Dacă compari variante, iată o privire onestă asupra diferențelor: unde e Sneep Cut altfel, unde face OpusClip mai mult și cum alegi.',
    imageAlt: 'Ana arată un video pe telefon din care ies trei clipuri, iar Radu ține banda de film',
    highlights: [
      {
        title: 'Română și engleză',
        text: 'Toată interfața Sneep Cut este disponibilă în română, nu doar în engleză.'
      },
      {
        title: 'Publicare pe patru rețele',
        text: 'Instagram, Facebook, TikTok și YouTube Shorts, din același loc în care faci clipurile.'
      },
      {
        title: 'O companie din UE',
        text: 'Sneep Cut este operat din România, iar datele sunt tratate conform GDPR.'
      }
    ],
    comparison: {
      title: 'Sneep Cut și OpusClip, față în față',
      columns: COLUMNS('OpusClip'),
      rows: [
        {
          label: 'Plan gratuit',
          ours: 'Da: până la 5 clipuri pe proiect, subtitrări, export 720p',
          theirs: 'Da: 60 de minute de procesare pe lună; șabloanele de subtitrare au watermark'
        },
        {
          label: 'Planuri plătite',
          ours: 'Creator, Pro și Agenție (vezi pagina de prețuri)',
          theirs: 'Starter 15 $/lună, Pro 29 $/lună, Business la cerere'
        },
        {
          label: 'Publicare și programare',
          ours: 'Instagram, Facebook, TikTok și YouTube Shorts; calendar de conținut pe Pro',
          theirs: 'Postare directă pe YouTube, TikTok și Instagram de la Starter; programare și mai multe rețele, inclusiv Facebook, de la Pro'
        },
        {
          label: 'Kit de brand',
          ours: 'De la Creator, cu kituri separate pentru fiecare brand',
          theirs: '1 șablon pe Free și Starter, până la 4 pe Pro'
        },
        {
          label: 'Surse video',
          ours: 'Încărcare (MP4, MOV, WebM, MKV) sau videoclipuri de pe propriul canal de YouTube',
          theirs: 'Încărcare plus linkuri din YouTube, Google Drive, Zoom și multe alte servicii, în funcție de plan'
        },
        {
          label: 'Vorbire în română',
          ours: 'Suportată',
          theirs: 'Listată ca suportată (în beta)'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Unde e Sneep Cut diferit',
        paragraphs: [
          'Sneep Cut este construit de o echipă mică din România pentru creatori și firme din România și din restul Europei. Toată interfața este disponibilă în română și engleză. Dacă publicul tău, echipa ta sau clienții tăi lucrează în română, folosirea zilnică devine mai simplă.',
          'Publicarea face parte din fluxul principal. Când un clip e gata, îl poți publica sau programa pe Instagram, Facebook, TikTok și YouTube Shorts fără să-l exporți și să-l încarci în altă parte, iar calendarul de conținut din Pro arată toată săptămâna pe toate rețelele.',
          'Pentru agenții și creatori cu mai multe branduri, Sneep Cut păstrează câte un kit de brand separat pentru fiecare, cu culori, fonturi, stil de subtitrare și watermark.'
        ]
      },
      {
        title: 'Unde face OpusClip mai mult',
        paragraphs: [
          'OpusClip acceptă videoclipuri din mult mai multe surse, inclusiv linkuri din Google Drive, Zoom, Vimeo și alte servicii, în timp ce Sneep Cut lucrează cu fișiere încărcate și cu videoclipuri de pe propriul tău canal de YouTube.',
          'OpusClip publică și pe mai multe rețele în planurile superioare, cum ar fi LinkedIn, X și Pinterest, și are un plan Business pentru echipe mari. Dacă aceste surse sau rețele sunt esențiale pentru tine, OpusClip poate fi alegerea mai potrivită.'
        ]
      },
      {
        title: 'Cum alegi',
        paragraphs: [
          'Cel mai simplu test este să treci același video prin ambele instrumente. Amândouă au plan gratuit, așa că poți compara ce momente alege fiecare, cum arată subtitrările și cât trebuie să corectezi înainte să postezi.',
          'Alege Sneep Cut dacă vrei o interfață în română și engleză, publicare pe cele patru rețele principale dintr-un singur loc și un furnizor din UE. Alege OpusClip dacă te bazezi pe multe surse de import sau ai nevoie de rețele în afară de Instagram, Facebook, TikTok și YouTube.'
        ]
      },
      {
        title: 'Trecerea de la OpusClip',
        paragraphs: [
          'Nu ai nimic de migrat: îți faci un cont gratuit, încarci un video recent sau alegi unul de pe canalul tău de YouTube și compari rezultatele. Dacă folosești un șablon de brand în OpusClip, refă aceleași culori, fonturi și watermark într-un kit de brand Sneep Cut, ca clipurile să-și păstreze aspectul.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Sneep Cut e gratuit ca OpusClip?',
        answer: 'Sneep Cut are un plan gratuit cu până la 5 clipuri pe proiect, subtitrări automate și export 720p. Planurile plătite adaugă Full HD, mai multe clipuri și kituri de brand.'
      },
      {
        question: 'Pot importa linkuri de YouTube în Sneep Cut?',
        answer:
          'Sneep Cut lucrează cu videoclipuri de pe propriul tău canal de YouTube, pe care le alegi după ce îl conectezi, nu cu linkuri lipite către orice video.'
      },
      {
        question: 'Pot folosi Sneep Cut în română?',
        answer: 'Da. Toată interfața este disponibilă în română și engleză, iar subtitrările urmează limba vorbită în video.'
      },
      {
        question: 'Unde văd prețurile Sneep Cut?',
        answer: 'Toate planurile și prețurile actuale sunt pe pagina de prețuri Sneep Cut.'
      }
    ]
  },
  'alternatives/vizard': {
    navLabel: 'Alternativă la Vizard',
    metaTitle: 'Alternativă la Vizard pentru clipuri scurte | Sneep Cut',
    metaDescription:
      'Compari Vizard și Sneep Cut? Vezi diferențele dintre planurile gratuite, publicare, kituri de brand și limbi, cu date verificate în noiembrie 2026.',
    eyebrow: 'Alternativă la Vizard',
    title: 'Sneep Cut, o alternativă la Vizard',
    lead:
      'Vizard și Sneep Cut transformă amândouă videoclipurile lungi în clipuri scurte cu subtitrări și te ajută să le postezi. Iată o comparație corectă a ce oferă fiecare, ca să-l alegi pe cel potrivit felului în care lucrezi.',
    imageAlt: 'Radu taie o bandă de film, iar Ana aranjează clipurile pe un raft',
    highlights: [
      {
        title: 'Gândit pentru română și engleză',
        text: 'Toată interfața Sneep Cut funcționează în română și engleză.'
      },
      {
        title: 'Clipuri care rămân',
        text: 'Proiectele rămân în contul tău, nu expiră după câteva zile.'
      },
      {
        title: 'Planuri simple',
        text: 'Planurile sunt descrise în clipuri și funcții, iar consumul apare ca procent în aplicație.'
      }
    ],
    comparison: {
      title: 'Sneep Cut și Vizard, față în față',
      columns: COLUMNS('Vizard'),
      rows: [
        {
          label: 'Plan gratuit',
          ours: 'Da: până la 5 clipuri pe proiect, subtitrări, export 720p',
          theirs: 'Da: 60 de credite pe lună, export 720p, videoclipuri de până la 60 de minute'
        },
        {
          label: 'Stocare pe planul gratuit',
          ours: 'Proiectele rămân în cont până le ștergi',
          theirs: 'Videoclipurile expiră după 3 zile'
        },
        {
          label: 'Planuri plătite',
          ours: 'Creator, Pro și Agenție (vezi pagina de prețuri)',
          theirs: 'Creator și Business, cu plată în credite (vezi pagina de prețuri Vizard)'
        },
        {
          label: 'Publicare și programare',
          ours: 'Instagram, Facebook, TikTok și YouTube Shorts; calendar de conținut pe Pro',
          theirs: 'Programare pe toate planurile: 1 cont social pe Free, 6 pe Creator, 20 pe Business'
        },
        {
          label: 'Kit de brand',
          ours: 'De la Creator, cu kituri separate pentru fiecare brand',
          theirs: 'Listat pe toate planurile'
        },
        {
          label: 'Calitate maximă la export',
          ours: 'Full HD 1080p pe planurile plătite',
          theirs: 'Până la 4K pe planurile plătite'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Unde e Sneep Cut diferit',
        paragraphs: [
          'Sneep Cut este făcut în România, iar interfața lui e disponibilă complet în română și engleză. Pentru creatori, biserici, școli și firme care lucrează în română, asta înseamnă meniuri pe care le înțelegi din prima.',
          'Clipurile pe care le creezi rămân în contul tău. Pe planul gratuit Vizard, videoclipurile expiră după trei zile, așa că trebuie să descarci ce vrei să păstrezi. Sneep Cut te lasă să revii mai târziu la un proiect, să verifici din nou clipurile și să le programezi când ești gata.',
          'Planurile sunt descrise în clipuri pe proiect, calitatea exportului și funcții, iar consumul lunar apare ca procent simplu în aplicație.'
        ]
      },
      {
        title: 'Unde face Vizard mai mult',
        paragraphs: [
          'Vizard exportă până la 4K pe planurile plătite și acceptă încărcări mai lungi, de până la 10 ore pe planurile plătite. Permite și mai multe conturi sociale pe plan, până la 20 pe Business, și listează kitul de brand și invitarea colegilor încă din planul gratuit.',
          'Dacă lucrezi cu înregistrări foarte lungi, ai nevoie de export 4K sau administrezi multe conturi sociale deodată, Vizard ți se poate potrivi mai bine.'
        ]
      },
      {
        title: 'Cum alegi',
        paragraphs: [
          'Amândouă au plan gratuit, așa că testul cel mai corect e să procesezi aceeași înregistrare în fiecare și să compari momentele alese, subtitrările și timpul petrecut corectându-le.',
          'Alege Sneep Cut dacă pentru tine contează cel mai mult o interfață în română, clipuri care rămân în cont și publicarea pe Instagram, Facebook, TikTok și YouTube Shorts dintr-un singur loc. Alege Vizard dacă exportul 4K, încărcările foarte lungi sau multe conturi conectate sunt esențiale.'
        ]
      },
      {
        title: 'Trecerea de la Vizard',
        paragraphs: [
          'Începe cu un cont gratuit Sneep Cut și unul dintre videoclipurile tale recente. Refă culorile, fonturile și watermark-ul brandului într-un kit de brand, conectează-ți rețelele și compară o săptămână de clipuri înainte să decizi.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Sneep Cut folosește credite ca Vizard?',
        answer:
          'Nu. Fiecare plan are un consum lunar inclus, afișat ca procent în aplicație, plus limite precum numărul de clipuri pe proiect și calitatea exportului.'
      },
      {
        question: 'Sneep Cut exportă în 4K?',
        answer: 'Nu. Sneep Cut exportă la 720p pe planul gratuit și Full HD 1080p pe planurile plătite.'
      },
      {
        question: 'Îmi pot păstra clipurile pe planul gratuit?',
        answer: 'Da. Proiectele rămân în contul tău Sneep Cut, iar clipurile le poți descărca oricând.'
      },
      {
        question: 'Interfața Sneep Cut e disponibilă în română?',
        answer: 'Da. Sneep Cut e disponibil complet în română și engleză.'
      }
    ]
  },
  'alternatives/klap': {
    navLabel: 'Alternativă la Klap',
    metaTitle: 'Alternativă la Klap, cu plan gratuit | Sneep Cut',
    metaDescription:
      'Cauți o alternativă la Klap cu plan gratuit? Compară Sneep Cut și Klap: prețuri, publicare, limbi și limite, verificate în noiembrie 2026.',
    eyebrow: 'Alternativă la Klap',
    title: 'Sneep Cut, o alternativă la Klap',
    lead:
      'Klap este un instrument plătit popular pentru transformarea videoclipurilor lungi în clipuri scurte. Dacă vrei să începi fără să plătești sau lucrezi în română, Sneep Cut ți se poate potrivi mai bine. Iată cum se compară.',
    imageAlt: 'Ana lipește un clip pe un calendar pe care îl ține Radu',
    highlights: [
      {
        title: 'Un plan gratuit adevărat',
        text: 'Pe planul gratuit creezi, descarci și păstrezi clipuri, nu doar le previzualizezi.'
      },
      {
        title: 'Română și engleză',
        text: 'Folosești toată aplicația în română sau în engleză.'
      },
      {
        title: 'Patru rețele, un singur loc',
        text: 'Publici sau programezi pe Instagram, Facebook, TikTok și YouTube Shorts.'
      }
    ],
    comparison: {
      title: 'Sneep Cut și Klap, față în față',
      columns: COLUMNS('Klap'),
      rows: [
        {
          label: 'Plan gratuit',
          ours: 'Da: până la 5 clipuri pe proiect, subtitrări, export 720p',
          theirs: 'Nu are plan gratuit; o probă gratuită pe 1 video, iar descărcarea sau postarea cer un plan plătit'
        },
        {
          label: 'Planuri plătite',
          ours: 'Creator, Pro și Agenție (vezi pagina de prețuri)',
          theirs: 'Basic 29 $/lună, Pro 79 $/lună, Pro+ 189 $/lună; jumătate de preț la plata anuală'
        },
        {
          label: 'Cum se măsoară consumul',
          ours: 'Consum lunar inclus, afișat ca procent în aplicație',
          theirs: 'Clipuri pe lună: 100, 300 sau 1.000'
        },
        {
          label: 'Publicare și programare',
          ours: 'Instagram, Facebook, TikTok și YouTube Shorts; calendar de conținut pe Pro',
          theirs: 'TikTok, YouTube, Instagram, LinkedIn și Facebook pe toate planurile plătite'
        },
        {
          label: 'Limbile subtitrărilor',
          ours: 'Urmează limba vorbită în video',
          theirs: 'Peste 99 de limbi'
        },
        {
          label: 'Limbile interfeței',
          ours: 'Română și engleză',
          theirs: 'Nu sunt menționate pe pagina de prețuri'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Unde e Sneep Cut diferit',
        paragraphs: [
          'Cea mai mare diferență e felul în care începi. Klap oferă o probă gratuită pe un singur video, dar descărcarea sau postarea clipurilor cer un plan plătit. Sneep Cut are un plan gratuit pe care poți crea clipuri, le poți descărca și poți folosi instrumentul înainte să decizi dacă plătești.',
          'Sneep Cut este făcut în România și funcționează complet în română și engleză, ceea ce ajută echipele și publicul care lucrează în română. Publicarea pe Instagram, Facebook, TikTok și YouTube Shorts face parte din același flux cu crearea clipurilor.',
          'Kiturile de brand păstrează aceleași culori, fonturi, stil de subtitrare și watermark, cu câte un kit separat pentru fiecare brand pe care îl administrezi.'
        ]
      },
      {
        title: 'Unde face Klap mai mult',
        paragraphs: [
          'Klap include postarea și programarea, conturi sociale nelimitate și LinkedIn pe toate planurile plătite și listează subtitrări în peste 99 de limbi. Oferă și un API pentru dezvoltatori și acceptă videoclipuri sursă de până la trei ore.',
          'Dacă ai nevoie de publicare pe LinkedIn, de un API pentru dezvoltatori sau de un număr mare și fix de clipuri pe lună, merită să iei în calcul Klap.'
        ]
      },
      {
        title: 'Cum alegi',
        paragraphs: [
          'Dacă vrei să testezi temeinic înainte să plătești, începe cu planul gratuit Sneep Cut și compară-l cu proba Klap pe un singur video, folosind aceeași înregistrare.',
          'Alege Sneep Cut pentru un plan gratuit pe care poți crea și descărca clipuri, o interfață în română și engleză și publicare pe cele patru rețele principale de video scurt. Alege Klap dacă LinkedIn, un API sau un număr mare de clipuri pe lună sunt prioritatea.'
        ]
      },
      {
        title: 'Cum începi',
        paragraphs: [
          'Îți faci un cont gratuit Sneep Cut, încarci un video recent sau alegi unul de pe canalul tău de YouTube și verifici clipurile. Conectezi rețelele când ești gata să publici și treci pe un plan plătit doar când ai nevoie de Full HD, mai multe clipuri pe proiect sau kituri de brand.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Sneep Cut e mai ieftin decât Klap?',
        answer:
          'Sneep Cut are un plan gratuit, iar Klap pornește de la 29 $ pe lună (sau 14,50 $ pe lună cu plata anuală) după o probă pe un singur video. Prețurile actuale Sneep Cut sunt pe pagina de prețuri.'
      },
      {
        question: 'Pot publica pe LinkedIn din Sneep Cut?',
        answer: 'Deocamdată nu. Sneep Cut publică pe Instagram, Facebook, TikTok și YouTube Shorts.'
      },
      {
        question: 'Sneep Cut numără clipurile pe lună?',
        answer: 'Fiecare plan are un consum lunar inclus, afișat ca procent în aplicație, plus o limită de clipuri pe proiect.'
      },
      {
        question: 'Clipurile Sneep Cut au watermark?',
        answer: 'Poți adăuga propriul watermark printr-un kit de brand. Exporturile fără brandingul Sneep Cut fac parte din planul Agenție.'
      }
    ]
  }
}
