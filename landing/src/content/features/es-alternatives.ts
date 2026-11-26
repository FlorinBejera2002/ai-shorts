import type { AlternativePageId, FeaturePageCopy } from './types'

const CHECKED =
  'Los datos de los competidores se revisaron en sus páginas públicas de precios y ayuda el 25 de noviembre de 2026. Los planes cambian con frecuencia, así que consulta sus sitios para ver los detalles actuales. Los nombres de los productos pertenecen a sus propietarios; Sneep Cut no está afiliado a ellos.'

const COLUMNS = (competitor: string): [string, string, string] => ['Criterio', 'Sneep Cut', competitor]

export const esAlternatives: Record<AlternativePageId, FeaturePageCopy> = {
  'alternatives/opus-clip': {
    navLabel: 'Alternativa a OpusClip',
    metaTitle: 'Alternativa a OpusClip con interfaz en rumano | Sneep Cut',
    metaDescription:
      '¿Buscas una alternativa a OpusClip? Compara Sneep Cut y OpusClip en planes gratuitos, publicación, kits de marca y fuentes de video (datos de noviembre de 2026).',
    eyebrow: 'Alternativa a OpusClip',
    title: 'Sneep Cut, una alternativa a OpusClip',
    lead:
      'OpusClip es una de las herramientas de clips con IA más conocidas. Si estás comparando opciones, aquí tienes una visión honesta de en qué se diferencia Sneep Cut, en qué hace más OpusClip y cómo elegir.',
    imageAlt: 'Ana muestra un video en el teléfono del que salen tres clips, mientras Radu sostiene la tira de película',
    highlights: [
      {
        title: 'Rumano e inglés',
        text: 'La interfaz completa de Sneep Cut está disponible en rumano y en inglés.'
      },
      {
        title: 'Publicación en cuatro redes',
        text: 'Instagram, Facebook, TikTok y YouTube Shorts, desde el mismo lugar donde creas los clips.'
      },
      {
        title: 'Una empresa de la UE',
        text: 'Sneep Cut se opera desde Rumanía y los datos se tratan según el RGPD.'
      }
    ],
    comparison: {
      title: 'Sneep Cut y OpusClip, cara a cara',
      columns: COLUMNS('OpusClip'),
      rows: [
        {
          label: 'Plan gratuito',
          ours: 'Sí: hasta 5 clips por proyecto, subtítulos, exportación en 720p',
          theirs: 'Sí: 60 minutos de procesamiento al mes; las plantillas de subtítulos llevan marca de agua'
        },
        {
          label: 'Planes de pago',
          ours: 'Creator, Pro y Agencia (consulta la página de precios)',
          theirs: 'Starter 15 $/mes, Pro 29 $/mes, Business bajo petición'
        },
        {
          label: 'Publicación y programación',
          ours: 'Instagram, Facebook, TikTok y YouTube Shorts; calendario de contenido en Pro',
          theirs: 'Publicación directa en YouTube, TikTok e Instagram desde Starter; programador y más redes, incluido Facebook, desde Pro'
        },
        {
          label: 'Kit de marca',
          ours: 'Desde Creator, con kits separados para cada marca',
          theirs: '1 plantilla en los planes Free y Starter, hasta 4 en Pro'
        },
        {
          label: 'Fuentes de video',
          ours: 'Subida (MP4, MOV, WebM, MKV) o videos de tu propio canal de YouTube',
          theirs: 'Subida y enlaces de YouTube, Google Drive, Zoom y otros muchos servicios, según el plan'
        },
        {
          label: 'Voz en rumano',
          ours: 'Compatible',
          theirs: 'Aparece como compatible (en beta)'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Dónde es diferente Sneep Cut',
        paragraphs: [
          'Sneep Cut lo crea un equipo pequeño de Rumanía para creadores y empresas de Rumanía y del resto de Europa. Toda la interfaz está disponible en rumano e inglés. Si tu público, tu equipo o tus clientes trabajan en rumano, el uso diario resulta más sencillo.',
          'La publicación forma parte del flujo principal. Cuando un clip está listo, puedes publicarlo o programarlo en Instagram, Facebook, TikTok y YouTube Shorts sin exportarlo ni subirlo a otro sitio, y el calendario de contenido de Pro muestra toda la semana en todas las redes.',
          'Para agencias y creadores con varias marcas, Sneep Cut mantiene un kit de marca separado para cada una, con colores, tipografías, estilo de subtítulos y marca de agua.'
        ]
      },
      {
        title: 'Dónde hace más OpusClip',
        paragraphs: [
          'OpusClip acepta videos de muchas más fuentes, incluidos enlaces de Google Drive, Zoom, Vimeo y otros servicios, mientras que Sneep Cut trabaja con archivos subidos y con videos de tu propio canal de YouTube.',
          'OpusClip también publica en más redes en sus planes superiores, como LinkedIn, X y Pinterest, y tiene un plan Business para equipos grandes. Si esas fuentes o redes son esenciales para ti, OpusClip puede ser la opción más adecuada.'
        ]
      },
      {
        title: 'Cómo elegir',
        paragraphs: [
          'La prueba más sencilla es pasar el mismo video por las dos herramientas. Ambas tienen plan gratuito, así que puedes comparar qué momentos elige cada una, cómo quedan los subtítulos y cuánto tienes que corregir antes de publicar.',
          'Elige Sneep Cut si quieres una interfaz en rumano e inglés, publicar en las cuatro redes principales desde un solo lugar y un proveedor de la UE. Elige OpusClip si dependes de muchas fuentes de importación o necesitas redes además de Instagram, Facebook, TikTok y YouTube.'
        ]
      },
      {
        title: 'Cómo pasar desde OpusClip',
        paragraphs: [
          'No tienes nada que migrar: crea una cuenta gratuita, sube un video reciente o elige uno de tu canal de YouTube y compara los resultados. Si usas una plantilla de marca en OpusClip, recrea los mismos colores, tipografías y marca de agua en un kit de marca de Sneep Cut, para que tus clips conserven el mismo aspecto.'
        ]
      }
    ],
    faqs: [
      {
        question: '¿Sneep Cut es gratis como OpusClip?',
        answer:
          'Sneep Cut tiene un plan gratuito con hasta 5 clips por proyecto, subtítulos automáticos y exportación en 720p. Los planes de pago añaden Full HD, más clips y kits de marca.'
      },
      {
        question: '¿Puedo importar enlaces de YouTube en Sneep Cut?',
        answer:
          'Sneep Cut trabaja con videos de tu propio canal de YouTube, que seleccionas después de conectarlo, en lugar de con enlaces pegados a cualquier video.'
      },
      {
        question: '¿Puedo usar Sneep Cut en rumano?',
        answer: 'Sí. Toda la interfaz está disponible en rumano e inglés, y los subtítulos siguen el idioma hablado en el video.'
      },
      {
        question: '¿Dónde puedo ver los precios de Sneep Cut?',
        answer: 'Todos los planes y precios actuales están en la página de precios de Sneep Cut.'
      }
    ]
  },
  'alternatives/vizard': {
    navLabel: 'Alternativa a Vizard',
    metaTitle: 'Alternativa a Vizard para clips cortos | Sneep Cut',
    metaDescription:
      '¿Vizard o Sneep Cut? Compara planes gratuitos, publicación, kits de marca e idiomas, con datos de la competencia verificados en noviembre de 2026.',
    eyebrow: 'Alternativa a Vizard',
    title: 'Sneep Cut, una alternativa a Vizard',
    lead:
      'Vizard y Sneep Cut convierten ambos videos largos en clips cortos con subtítulos y te ayudan a publicarlos. Aquí tienes una comparación justa de lo que ofrece cada uno, para que elijas el que mejor encaje con tu forma de trabajar.',
    imageAlt: 'Radu corta una tira de película, mientras Ana ordena los clips en una estantería',
    highlights: [
      {
        title: 'Pensado para rumano e inglés',
        text: 'Toda la interfaz de Sneep Cut funciona en rumano y en inglés.'
      },
      {
        title: 'Clips que se quedan',
        text: 'Tus proyectos se guardan en tu cuenta en lugar de caducar al cabo de unos días.'
      },
      {
        title: 'Planes sencillos',
        text: 'Los planes se describen en clips y funciones, y el consumo aparece como porcentaje en la aplicación.'
      }
    ],
    comparison: {
      title: 'Sneep Cut y Vizard, cara a cara',
      columns: COLUMNS('Vizard'),
      rows: [
        {
          label: 'Plan gratuito',
          ours: 'Sí: hasta 5 clips por proyecto, subtítulos, exportación en 720p',
          theirs: 'Sí: 60 créditos al mes, exportación en 720p, videos de hasta 60 minutos'
        },
        {
          label: 'Almacenamiento en el plan gratuito',
          ours: 'Los proyectos se quedan en tu cuenta hasta que los borras',
          theirs: 'Los videos caducan a los 3 días'
        },
        {
          label: 'Planes de pago',
          ours: 'Creator, Pro y Agencia (consulta la página de precios)',
          theirs: 'Creator y Business, con pago en créditos (consulta la página de precios de Vizard)'
        },
        {
          label: 'Publicación y programación',
          ours: 'Instagram, Facebook, TikTok y YouTube Shorts; calendario de contenido en Pro',
          theirs: 'Programación en todos los planes: 1 cuenta social en el plan Free, 6 en Creator y 20 en Business'
        },
        {
          label: 'Kit de marca',
          ours: 'Desde Creator, con kits separados para cada marca',
          theirs: 'Aparece en todos los planes'
        },
        {
          label: 'Calidad máxima de exportación',
          ours: 'Full HD 1080p en los planes de pago',
          theirs: 'Hasta 4K en los planes de pago'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Dónde es diferente Sneep Cut',
        paragraphs: [
          'Sneep Cut se hace en Rumanía y su interfaz está disponible por completo en rumano e inglés. Para creadores, iglesias, escuelas y empresas que trabajan en rumano, eso significa no tener que adivinar qué dice cada menú.',
          'Los clips que creas se quedan en tu cuenta. En el plan gratuito de Vizard, los videos caducan a los tres días, así que tienes que descargar lo que quieras conservar. Sneep Cut te permite volver a un proyecto más tarde, revisar los clips de nuevo y programarlos cuando estés listo.',
          'Los planes se describen por clips por proyecto, calidad de exportación y funciones, y tu consumo mensual aparece como un porcentaje sencillo en la aplicación.'
        ]
      },
      {
        title: 'Dónde hace más Vizard',
        paragraphs: [
          'Vizard exporta hasta 4K en sus planes de pago y acepta subidas más largas, de hasta 10 horas en los planes de pago. También permite más cuentas sociales por plan, hasta 20 en Business, y ya incluye un kit de marca y la invitación de colaboradores en su plan gratuito.',
          'Si trabajas con grabaciones muy largas, necesitas salida en 4K o gestionas muchas cuentas sociales a la vez, Vizard puede encajarte mejor.'
        ]
      },
      {
        title: 'Cómo elegir',
        paragraphs: [
          'Ambas tienen plan gratuito, así que la prueba más justa es procesar la misma grabación en cada una y comparar los momentos elegidos, los subtítulos y el tiempo que dedicas a corregirlos.',
          'Elige Sneep Cut si lo que más importa es una interfaz en rumano, clips que se quedan en tu cuenta y publicar en Instagram, Facebook, TikTok y YouTube Shorts desde un solo lugar. Elige Vizard si son imprescindibles las exportaciones en 4K, las subidas muy largas o muchas cuentas conectadas.'
        ]
      },
      {
        title: 'Cómo pasar desde Vizard',
        paragraphs: [
          'Empieza con una cuenta gratuita de Sneep Cut y uno de tus videos recientes. Recrea los colores, las tipografías y la marca de agua de tu marca en un kit de marca, conecta tus redes y compara una semana de clips antes de decidir.'
        ]
      }
    ],
    faqs: [
      {
        question: '¿Sneep Cut usa créditos como Vizard?',
        answer:
          'No. Cada plan tiene un consumo mensual incluido, que se muestra como porcentaje en la aplicación, además de límites como el número de clips por proyecto y la calidad de exportación.'
      },
      {
        question: '¿Sneep Cut exporta en 4K?',
        answer: 'No. Sneep Cut exporta en 720p en el plan gratuito y en Full HD 1080p en los planes de pago.'
      },
      {
        question: '¿Puedo conservar mis clips en el plan gratuito?',
        answer: 'Sí. Los proyectos se quedan en tu cuenta de Sneep Cut, y puedes descargar los clips cuando quieras.'
      },
      {
        question: '¿La interfaz de Sneep Cut está disponible en rumano?',
        answer: 'Sí. Sneep Cut está disponible por completo en rumano e inglés.'
      }
    ]
  },
  'alternatives/klap': {
    navLabel: 'Alternativa a Klap',
    metaTitle: 'Alternativa a Klap con plan gratuito | Sneep Cut',
    metaDescription:
      '¿Buscas una alternativa a Klap con plan gratuito? Compara Sneep Cut y Klap en precios, publicación, idiomas y límites, con datos verificados en noviembre de 2026.',
    eyebrow: 'Alternativa a Klap',
    title: 'Sneep Cut, una alternativa a Klap',
    lead:
      'Klap es una herramienta de pago muy popular para convertir videos largos en shorts. Si quieres empezar sin pagar o trabajas en rumano, Sneep Cut puede encajarte mejor. Aquí tienes cómo se comparan.',
    imageAlt: 'Ana pega un clip en un calendario que sostiene Radu',
    highlights: [
      {
        title: 'Un plan gratuito de verdad',
        text: 'En el plan gratuito creas, descargas y conservas clips, no solo los previsualizas.'
      },
      {
        title: 'Rumano e inglés',
        text: 'Usa toda la aplicación en rumano o en inglés.'
      },
      {
        title: 'Cuatro redes, un solo lugar',
        text: 'Publica o programa en Instagram, Facebook, TikTok y YouTube Shorts.'
      }
    ],
    comparison: {
      title: 'Sneep Cut y Klap, cara a cara',
      columns: COLUMNS('Klap'),
      rows: [
        {
          label: 'Plan gratuito',
          ours: 'Sí: hasta 5 clips por proyecto, subtítulos, exportación en 720p',
          theirs: 'No hay plan gratuito; una prueba gratuita con 1 video, y descargar o publicar requiere un plan de pago'
        },
        {
          label: 'Planes de pago',
          ours: 'Creator, Pro y Agencia (consulta la página de precios)',
          theirs: 'Basic 29 $/mes, Pro 79 $/mes, Pro+ 189 $/mes; mitad de precio con pago anual'
        },
        {
          label: 'Cómo se mide el consumo',
          ours: 'Consumo mensual incluido, que se muestra como porcentaje en la aplicación',
          theirs: 'Clips al mes: 100, 300 o 1.000'
        },
        {
          label: 'Publicación y programación',
          ours: 'Instagram, Facebook, TikTok y YouTube Shorts; calendario de contenido en Pro',
          theirs: 'TikTok, YouTube, Instagram, LinkedIn y Facebook en todos los planes de pago'
        },
        {
          label: 'Idiomas de los subtítulos',
          ours: 'Siguen el idioma hablado en el video',
          theirs: 'Más de 99 idiomas'
        },
        {
          label: 'Idiomas de la interfaz',
          ours: 'Rumano e inglés',
          theirs: 'No se indican en la página de precios'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Dónde es diferente Sneep Cut',
        paragraphs: [
          'La mayor diferencia está en cómo empiezas. Klap ofrece una prueba gratuita con un solo video, pero descargar o publicar clips requiere un plan de pago. Sneep Cut tiene un plan gratuito en el que puedes crear clips, descargarlos y seguir usando la herramienta antes de decidir si pagas.',
          'Sneep Cut se hace en Rumanía y funciona por completo en rumano e inglés, lo que ayuda a equipos y públicos que trabajan en rumano. La publicación en Instagram, Facebook, TikTok y YouTube Shorts forma parte del mismo flujo que crear los clips.',
          'Los kits de marca mantienen coherentes los colores, las tipografías, el estilo de subtítulos y la marca de agua, con un kit separado para cada marca que administras.'
        ]
      },
      {
        title: 'Dónde hace más Klap',
        paragraphs: [
          'Klap incluye publicación y programación, cuentas sociales ilimitadas y LinkedIn en todos sus planes de pago, y ofrece subtítulos en más de 99 idiomas. También tiene una API para desarrolladores y acepta videos de origen de hasta tres horas.',
          'Si necesitas publicar en LinkedIn, una API para desarrolladores o un número alto y fijo de clips al mes, merece la pena considerar Klap.'
        ]
      },
      {
        title: 'Cómo elegir',
        paragraphs: [
          'Si quieres probar a fondo antes de pagar, empieza con el plan gratuito de Sneep Cut y compáralo con la prueba de Klap sobre un solo video, usando la misma grabación.',
          'Elige Sneep Cut para tener un plan gratuito en el que puedas crear y descargar clips, una interfaz en rumano e inglés y publicación en las cuatro redes principales de video corto. Elige Klap si LinkedIn, una API o una gran cantidad mensual de clips son la prioridad.'
        ]
      },
      {
        title: 'Cómo empezar',
        paragraphs: [
          'Crea una cuenta gratuita de Sneep Cut, sube un video reciente o elige uno de tu canal de YouTube, y revisa los clips. Conecta tus redes cuando estés listo para publicar, y pasa a un plan de pago solo cuando necesites Full HD, más clips por proyecto o kits de marca.'
        ]
      }
    ],
    faqs: [
      {
        question: '¿Sneep Cut es más barato que Klap?',
        answer:
          'Sneep Cut tiene un plan gratuito, mientras que Klap empieza en 29 $ al mes (o 14,50 $ al mes con pago anual) tras una prueba con un solo video. Los precios actuales de Sneep Cut están en la página de precios.'
      },
      {
        question: '¿Puedo publicar en LinkedIn desde Sneep Cut?',
        answer: 'Por ahora no. Sneep Cut publica en Instagram, Facebook, TikTok y YouTube Shorts.'
      },
      {
        question: '¿Sneep Cut cuenta los clips al mes?',
        answer:
          'Cada plan tiene un consumo mensual incluido, que se muestra como porcentaje en la aplicación, además de un límite de clips por proyecto.'
      },
      {
        question: '¿Los clips de Sneep Cut llevan marca de agua?',
        answer:
          'Puedes añadir tu propia marca de agua mediante un kit de marca. Las exportaciones sin la marca de Sneep Cut forman parte del plan Agencia.'
      }
    ]
  }
}
