import { esAlternatives } from './es-alternatives'
import { esUseCases } from './es-use-cases'
import type { FeaturePagesCopy } from './types'

export const es: FeaturePagesCopy = {
  footerTitle: 'Herramientas',
  useCasesTitle: 'Para quién',
  alternativesTitle: 'Comparativas',
  highlightsLabel: 'Lo esencial',
  relatedTitle: 'Más de Sneep Cut',
  faqTitle: 'Preguntas frecuentes',
  pages: {
    'ai-video-clipper': {
      navLabel: 'Clipper de video con IA',
      metaTitle: 'Clipper de video con IA: encuentra los mejores momentos | Sneep Cut',
      metaDescription:
        'Sneep Cut es un clipper de video con IA: transcribe tu video, elige los momentos más potentes y los convierte en clips verticales con subtítulos.',
      eyebrow: 'Clipper de video con IA',
      title: 'Un clipper de video con IA que encuentra los momentos que merece la pena publicar',
      lead:
        'Sube un video largo y Sneep Cut lo escucha, elige las partes que se sostienen por sí solas y las convierte en clips verticales con subtítulos, listos para revisar y publicar.',
      imageAlt: 'Ana muestra un video en el móvil del que salen tres clips mientras Radu sostiene la tira de película',
      highlights: [
        {
          title: 'Momentos, no cortes al azar',
          text: 'La IA lee la transcripción y selecciona fragmentos con un inicio y un final claros, para que cada clip tenga sentido sin el resto del video.'
        },
        {
          title: 'Vertical por defecto',
          text: 'Los clips se recortan a 9:16 con el hablante en el encuadre. El formato cuadrado 1:1 y el horizontal 16:9 están disponibles cuando los necesites.'
        },
        {
          title: 'Subtítulos incluidos',
          text: 'Cada clip incluye subtítulos sincronizados y editables, con estilos pensados para los feeds de redes sociales.'
        },
        {
          title: 'Tú tienes el control',
          text: 'Revisa cada clip, ajusta lo que quieras y después descárgalo o prográmalo en tus redes.'
        }
      ],
      sections: [
        {
          title: 'Qué hace un clipper de video con IA',
          paragraphs: [
            'Hacer clips cortos a mano significa ver toda la grabación, anotar marcas de tiempo, cortar, reencuadrar y escribir los subtítulos. Para una entrevista de 40 minutos, eso puede ser una tarde entera de trabajo para tres o cuatro clips.',
            'Un clipper de video con IA hace la primera pasada por ti. Sneep Cut transcribe el audio, busca fragmentos que tengan sentido como historia (una idea clara, una opinión fuerte, un consejo práctico) y los prepara como clips independientes. Empiezas con una lista corta en lugar de una línea de tiempo en blanco.'
          ]
        },
        {
          title: 'Cómo elige Sneep Cut los momentos',
          paragraphs: [
            'La selección se basa en lo que realmente se dice en el video. Sneep Cut usa la transcripción para encontrar segmentos que empiezan y terminan de forma limpia, así un clip no arranca a mitad de frase ni termina antes del remate.',
            'Puedes indicarle cuántos clips quieres y añadir una breve instrucción sobre qué buscar, por ejemplo “solo consejos prácticos” o “los momentos sobre precios”. La instrucción orienta la selección hacia los temas que importan a tu audiencia.'
          ]
        },
        {
          title: 'De la selección a un clip terminado',
          paragraphs: [
            'Cada momento seleccionado se reencuadra para video vertical y recibe subtítulos sincronizados palabra por palabra. Con un kit de marca, tus colores, tipografías y marca de agua se aplican automáticamente, así todos los clips parecen salir del mismo canal.',
            'La mayoría de los videos se procesan en 2 a 5 minutos, y el progreso en vivo muestra lo que está ocurriendo. Cuando los clips están listos, puedes revisarlos, cambiar lo que no te guste, exportarlos o publicarlos en Instagram, Facebook, TikTok y YouTube Shorts.'
          ]
        },
        {
          title: 'Para quién es',
          paragraphs: [
            'Sneep Cut funciona mejor con videos en los que se habla: entrevistas, podcasts, webinars, cursos, sermones, charlas y vlogs. Los creadores lo usan para seguir publicando videos cortos sin pasar cada noche editando, y las agencias para convertir las grabaciones largas de sus clientes en un flujo constante de clips.',
            'Puedes empezar con el plan gratuito, que incluye selección automática de momentos, subtítulos y exportación 9:16, y pasar a un plan de pago cuando necesites más clips por proyecto o exportación Full HD.'
          ]
        }
      ],
      faqs: [
        {
          question: '¿Qué tipo de videos funcionan mejor?',
          answer:
            'Videos con voz: entrevistas, podcasts, presentaciones, clases y vlogs. La IA selecciona momentos a partir de lo que se dice, así que un audio claro da los mejores resultados.'
        },
        {
          question: '¿Cuántos clips saco de un video?',
          answer:
            'Tú eliges cuántos clips pedir. El plan gratuito permite hasta 5 clips por proyecto y el plan Creator hasta 15.'
        },
        {
          question: '¿Puedo cambiar un clip que eligió la IA?',
          answer:
            'Sí. Cada clip se puede revisar y ajustar antes de descargarlo o publicarlo. Nada se publica sin tu confirmación.'
        },
        {
          question: '¿Qué formatos de archivo puedo subir?',
          answer: 'MP4, MOV, WebM y MKV. También puedes elegir videos de tu canal de YouTube.'
        }
      ]
    },
    'long-video-to-shorts': {
      navLabel: 'Clips cortos de video largo',
      metaTitle: 'Convierte videos largos en clips cortos | Sneep Cut',
      metaDescription:
        'Convierte un video largo en varios clips cortos para Reels, TikTok y YouTube Shorts: momentos seleccionados, recorte vertical y subtítulos.',
      eyebrow: 'De video largo a clips cortos',
      title: 'Un solo video largo, una semana de clips cortos',
      lead:
        'Una entrevista, un podcast o un webinar esconde muchos videos cortos. Sneep Cut los encuentra, los recorta en formato vertical y les añade subtítulos, para que una sola grabación alimente tus redes durante días.',
      imageAlt: 'Radu corta una tira de película mientras Ana coloca los clips en una estantería',
      highlights: [
        {
          title: 'Varios clips por video',
          text: 'Pide los clips que necesites: hasta 5 por proyecto en el plan gratuito y hasta 15 en Creator.'
        },
        {
          title: 'Listos para cualquier feed',
          text: '9:16 para Reels, TikTok y Shorts a 1080 × 1920, además de 1:1 y 16:9 cuando una publicación los necesite.'
        },
        {
          title: 'Procesamiento por lotes',
          text: 'Los planes de pago pueden procesar varios videos de una vez: hasta 5 en Creator y 20 en Pro.'
        }
      ],
      sections: [
        {
          title: 'Por qué reutilizar videos largos',
          paragraphs: [
            'Los videos verticales cortos son el formato que más impulsan hoy las redes sociales, pero grabar algo nuevo cada día es difícil de sostener. El contenido largo que ya tienes, desde directos hasta llamadas con clientes convertidas en casos de éxito, está lleno de momentos que funcionan muy bien por sí solos.',
            'Reutilizar significa que cada grabación trabaje más. Un episodio de 45 minutos puede convertirse en una semana completa de publicaciones en Instagram, TikTok, Facebook y YouTube Shorts sin grabar nada nuevo.'
          ]
        },
        {
          title: 'Cómo funciona la conversión',
          paragraphs: [
            'Sube el archivo o elige un video de tu canal de YouTube. Sneep Cut lo transcribe, selecciona los momentos, los recorta en vertical con el sujeto en el encuadre y añade subtítulos. La mayoría de los videos están listos en 2 a 5 minutos.',
            'Cada clip tiene un principio y un final limpios, así que puede publicarse sin contexto. Puedes añadir una breve instrucción para orientar la selección, por ejemplo hacia consejos, historias o respuestas a preguntas frecuentes.'
          ]
        },
        {
          title: 'El mismo estilo en todos los clips',
          paragraphs: [
            'Los clips sacados de un mismo video deberían verse como parte de la misma serie. Un kit de marca aplica automáticamente tus colores, tipografías y marca de agua a cada clip, y los estilos de subtítulos se mantienen coherentes en todo el lote.',
            'Si trabajas para varias marcas, cada una puede conservar su propio estilo, así una agencia puede cambiar de cliente sin volver a configurar nada.'
          ]
        },
        {
          title: 'Qué grabaciones dan los mejores clips',
          paragraphs: [
            'Cuanto más se apoya un video en la voz, más buenos momentos contiene. Las entrevistas y los podcasts funcionan especialmente bien, porque los invitados responden una pregunta a la vez y cada respuesta suele ser un clip por sí misma. Los webinars y los cursos te dan consejos prácticos, y las charlas y los sermones, ideas fuertes y fáciles de citar.',
            'El audio claro importa más que un video perfecto. Una grabación con buen micrófono y poco ruido de fondo da una transcripción más exacta, lo que se traduce en mejores momentos seleccionados y mejores subtítulos. Las grabaciones con largos silencios, solo música o varias personas hablando a la vez le dan menos material a la IA.',
            'Un hábito sencillo ayuda mucho: al grabar, responde con frases completas y repite la pregunta en tu respuesta. Esos pasajes son los más fáciles de convertir en clips que tienen sentido sin el resto del video.'
          ]
        },
        {
          title: 'De los clips a las publicaciones',
          paragraphs: [
            'Después de revisarlos, puedes descargar los clips o publicarlos directamente. Conecta Instagram, Facebook, TikTok y YouTube, y publica enseguida o reparte los clips a lo largo de la semana desde el calendario de contenido.'
          ]
        }
      ],
      faqs: [
        {
          question: '¿Cuánto puede durar el video original?',
          answer:
            'Sneep Cut está pensado para grabaciones largas como entrevistas, podcasts y webinars. El límite de uso mensual de tu plan, que se muestra en la aplicación, determina cuánto video puedes procesar.'
        },
        {
          question: '¿Cuánto duran los clips generados?',
          answer:
            'Cada clip sigue un momento completo del video, así que su duración depende del contenido. Los clips habituales encajan en los límites de Reels, TikTok y YouTube Shorts.'
        },
        {
          question: '¿Puedo procesar varios videos a la vez?',
          answer: 'Sí, en los planes de pago: hasta 5 videos por lote en Creator y hasta 20 en Pro.'
        },
        {
          question: '¿En qué resolución se exportan los clips?',
          answer: '720p en el plan gratuito y Full HD 1080p en Creator y planes superiores.'
        }
      ]
    },
    'auto-captions': {
      navLabel: 'Subtítulos automáticos',
      metaTitle: 'Subtítulos automáticos para videos cortos | Sneep Cut',
      metaDescription:
        'Añade subtítulos automáticos sincronizados palabra por palabra a tus videos cortos. Sneep Cut transcribe la voz y da estilo a los subtítulos para Reels, TikTok y Shorts.',
      eyebrow: 'Subtítulos automáticos',
      title: 'Subtítulos automáticos, sincronizados palabra por palabra',
      lead:
        'Mucha gente ve los videos cortos sin sonido. Sneep Cut transcribe tu video y añade subtítulos ajustados a cada palabra, con estilos fáciles de leer en el móvil.',
      imageAlt: 'Un fotograma de video vertical con subtítulos grandes sobre el hablante',
      highlights: [
        {
          title: 'Transcripción sincronizada',
          text: 'Los subtítulos siguen la voz palabra por palabra, en lugar de aparecer como bloques largos de texto.'
        },
        {
          title: 'Énfasis dinámico',
          text: 'Las palabras clave se pueden resaltar para que el mensaje se entienda de un vistazo.'
        },
        {
          title: 'Editables',
          text: 'Corrige un nombre o un término técnico en el texto y los subtítulos se actualizan.'
        },
        {
          title: 'Tu estilo',
          text: 'Elige un estilo de subtítulo o usa las tipografías y colores de tu kit de marca.'
        }
      ],
      sections: [
        {
          title: 'Por qué importan los subtítulos en los videos cortos',
          paragraphs: [
            'En un feed, un video tiene uno o dos segundos para captar la atención, muchas veces con el móvil en silencio. Los subtítulos permiten seguir lo que dices sin activar el sonido, y hacen que tus videos sean accesibles para personas sordas o con dificultades auditivas.',
            'Los subtítulos también mantienen la atención en la pantalla. Cuando las palabras aparecen al ritmo de la voz, el público sigue leyendo y eso le ayuda a quedarse hasta el final del clip.'
          ]
        },
        {
          title: 'Cómo funcionan los subtítulos automáticos en Sneep Cut',
          paragraphs: [
            'Al subir un video, Sneep Cut transcribe el audio y conserva el momento exacto de cada palabra. Los subtítulos se generan a partir de esa transcripción y se colocan en cada clip, así que ya están sincronizados cuando el clip está listo.',
            'La transcripción sigue el idioma que se habla en el video, de modo que puedes subtitular contenido en español, inglés, rumano y otros idiomas sin una herramienta aparte.'
          ]
        },
        {
          title: 'Estilos pensados para los feeds sociales',
          paragraphs: [
            'Los estilos de subtítulo están diseñados para video vertical: texto grande y de alto contraste que se lee bien en una pantalla pequeña y no tapa al hablante. Los planes de pago incluyen más estilos.',
            'Con un kit de marca, los subtítulos usan automáticamente tus tipografías y colores, así cada clip encaja con el resto de tu contenido.'
          ]
        },
        {
          title: 'Consejos para unos subtítulos precisos',
          paragraphs: [
            'Los subtítulos automáticos son tan buenos como el audio del que provienen. Un micrófono cerca del hablante, una habitación silenciosa y una sola persona hablando a la vez dan la transcripción más precisa. La música de fondo bajo la voz dificulta reconocer las palabras, así que mantenla baja o añádela después de grabar.',
            'Antes de publicar, lee los subtítulos una vez. Los nombres de personas y marcas, los nombres de productos y los términos especializados son las palabras que más suelen necesitar corrección, y corregirlas en el texto lleva segundos.',
            'Mantén los subtítulos cortos en pantalla. Unas pocas palabras a la vez se siguen mejor en el móvil que frases completas, y dejan visible la cara del hablante.'
          ]
        },
        {
          title: 'Parte de todo el flujo de trabajo',
          paragraphs: [
            'Los subtítulos no son un paso de exportación aparte. Se crean junto con la selección de clips y el recorte vertical, y viajan con el clip cuando lo descargas o lo publicas en Instagram, Facebook, TikTok y YouTube Shorts.'
          ]
        }
      ],
      faqs: [
        {
          question: '¿Puedo editar los subtítulos generados?',
          answer: 'Sí. Puedes corregir cualquier palabra antes de exportar, por ejemplo nombres, marcas o términos técnicos.'
        },
        {
          question: '¿Qué idiomas son compatibles?',
          answer:
            'Los subtítulos siguen el idioma que se habla en el video. La interfaz de Sneep Cut está disponible en español, inglés y rumano.'
        },
        {
          question: '¿Los subtítulos están incluidos en el plan gratuito?',
          answer: 'Sí. Los subtítulos automáticos forman parte de todos los planes, incluido el gratuito. Los planes de pago añaden más estilos.'
        },
        {
          question: '¿Los subtítulos van incrustados en el video?',
          answer:
            'Sí, forman parte del clip exportado, así que se ven en todas las redes, incluidas las que no leen archivos de subtítulos.'
        }
      ]
    },
    'youtube-to-shorts': {
      navLabel: 'De YouTube a Shorts',
      metaTitle: 'Convierte tus videos de YouTube en Shorts | Sneep Cut',
      metaDescription:
        'Elige videos de tu canal de YouTube y conviértelos en Shorts, Reels y TikToks con momentos elegidos por IA, recorte vertical y subtítulos.',
      eyebrow: 'De YouTube a Shorts',
      title: 'Convierte los videos de tu canal de YouTube en Shorts',
      lead:
        'Tu canal ya tiene horas de buen material. Elige los videos que quieras y Sneep Cut convierte sus mejores momentos en clips verticales para YouTube Shorts, Reels y TikTok.',
      imageAlt: 'Ana mete un video en un portátil mientras Radu le enseña su móvil',
      highlights: [
        {
          title: 'Elige desde tu canal',
          text: 'Conecta tu canal y elige hasta 10 videos a la vez. Sin descargar ni volver a subir nada.'
        },
        {
          title: 'Momentos seleccionados para ti',
          text: 'La IA encuentra las partes de cada video que funcionan como Shorts independientes.'
        },
        {
          title: 'De vuelta a YouTube, y más allá',
          text: 'Publica los clips como Shorts y también en Instagram, Facebook y TikTok.'
        }
      ],
      sections: [
        {
          title: 'Por qué convertir videos largos de YouTube en Shorts',
          paragraphs: [
            'Los Shorts llegan a personas que nunca han visto tu canal. Un buen Short es una muestra de lo que ofrecen tus videos largos, y da a los nuevos espectadores un motivo para suscribirse y ver más.',
            'El catálogo anterior es el punto de partida más fácil. Los videos que publicaste hace meses siguen teniendo consejos, historias y opiniones que pueden volver a funcionar como clips cortos.'
          ]
        },
        {
          title: 'Cómo funciona con tu canal',
          paragraphs: [
            'En lugar de pegar enlaces, conectas tu canal de YouTube y seleccionas los videos que quieres usar, hasta 10 a la vez. Sneep Cut solo trabaja con videos de tu propio canal, así que siempre tienes los derechos sobre lo que recortas.',
            'Cada video seleccionado pasa por el mismo proceso que una subida: transcripción, selección de momentos, recorte vertical con el hablante en el encuadre y subtítulos sincronizados.'
          ]
        },
        {
          title: 'Shorts que parecen tu canal',
          paragraphs: [
            'Un kit de marca mantiene tus colores, tipografías y marca de agua en cada Short, para que el público reconozca tu contenido en el feed. Los estilos de subtítulo están pensados para video vertical y se leen bien en el móvil.'
          ]
        },
        {
          title: 'Dónde encontrar Shorts en tu catálogo',
          paragraphs: [
            'Empieza por los videos que ya han funcionado bien. Sus temas tienen interés comprobado, y una versión corta puede llevar ese interés a personas que nunca vieron el original.',
            'Busca videos con listas, pasos y respuestas: “tres errores”, “cómo lo hago yo”, una pregunta de un espectador. Cada punto de una lista o cada respuesta suele ser un Short completo. Los videos de preguntas y respuestas y los directos también están llenos de respuestas cortas y directas.',
            'El contenido atemporal es la opción más segura. Un consejo que sigue siendo válido hoy hace un buen Short aunque el video original tenga dos años, mientras que las noticias y los videos sensibles al momento es mejor dejarlos como están.'
          ]
        },
        {
          title: 'Publica en todas partes desde un solo lugar',
          paragraphs: [
            'Cuando los clips estén listos, revísalos y publícalos de vuelta en YouTube como Shorts. Los mismos clips pueden ir a Instagram Reels, Facebook y TikTok, al momento o programados.'
          ]
        }
      ],
      faqs: [
        {
          question: '¿Puedo pegar el enlace de cualquier video de YouTube?',
          answer:
            'No. Sneep Cut trabaja con videos de tu propio canal, que eliges después de conectarlo. Así, el recorte se limita a contenido que es tuyo.'
        },
        {
          question: '¿Cuántos videos puedo seleccionar a la vez?',
          answer: 'Hasta 10 videos de tu canal en una misma selección.'
        },
        {
          question: '¿Tengo que descargar antes mis videos?',
          answer: 'No. Los eliges desde tu canal dentro de Sneep Cut. Si lo prefieres, también puedes subir archivos desde tu ordenador.'
        },
        {
          question: '¿Puedo publicar los Shorts directamente en YouTube?',
          answer: 'Sí. Conecta tu cuenta de YouTube y publica al momento o programa los Shorts para más adelante.'
        }
      ]
    },
    'schedule-social-posts': {
      navLabel: 'Programar publicaciones en redes',
      metaTitle: 'Programa Reels, TikToks y Shorts en un solo lugar | Sneep Cut',
      metaDescription:
        'Publica y programa tus clips en Instagram, Facebook, TikTok y YouTube Shorts desde un solo calendario, justo después de crearlos en Sneep Cut.',
      eyebrow: 'Programación en redes sociales',
      title: 'Programa tus clips en todas las redes desde un solo calendario',
      lead:
        'Crear clips es solo la mitad del trabajo. Sneep Cut te permite publicarlos o programarlos en Instagram, Facebook, TikTok y YouTube Shorts desde el mismo lugar donde los creaste.',
      imageAlt: 'Ana envía aviones de papel desde un móvil mientras Radu los mira volar',
      highlights: [
        {
          title: 'Cuatro redes',
          text: 'Instagram, Facebook, TikTok y YouTube Shorts, conectadas una sola vez.'
        },
        {
          title: 'Ahora o más tarde',
          text: 'Publica al instante o elige un día y una hora para cada publicación.'
        },
        {
          title: 'Un solo calendario',
          text: 'Mira la semana completa de publicaciones de un vistazo y muévelas cuando cambien tus planes.'
        }
      ],
      sections: [
        {
          title: 'Por qué programar en lugar de publicar a mano',
          paragraphs: [
            'Publicar con constancia importa más que publicar mucho. Cuando los clips están programados con antelación, una semana ajetreada no rompe tu ritmo, y cada red recibe contenido a las horas que mejor encajan con tu audiencia.',
            'Hacerlo a mano significa descargar cada clip, abrir cuatro aplicaciones y escribir la misma publicación cuatro veces. Programar desde un solo lugar elimina ese trabajo repetitivo.'
          ]
        },
        {
          title: 'Del clip a la publicación programada',
          paragraphs: [
            'Cuando tus clips están listos, elige a dónde va cada uno y cuándo. Escribe el texto de la publicación, selecciona las redes y publica al momento o fija una fecha y una hora.',
            'Como la programación está junto a la creación de clips, no hay un paso de exportar y volver a subir: el clip que aprobaste es el que se publica.'
          ]
        },
        {
          title: 'Planifica la semana en el calendario de contenido',
          paragraphs: [
            'El calendario de contenido del plan Pro muestra cada publicación programada por día, en todas las redes. Puedes repartir los clips de un video largo a lo largo de la semana, llenar huecos y reprogramar una publicación cuando surge algo más urgente.',
            'Las agencias y los equipos tienen una visión clara de qué se publica para cada marca y cuándo.'
          ]
        },
        {
          title: 'Un plan semanal sencillo a partir de un solo video',
          paragraphs: [
            'Una sola grabación larga basta para toda una semana. Saca cinco o seis clips de ella y programa uno al día en lugar de publicarlos todos a la vez. Cada clip tiene su propio momento en el feed, y tu audiencia te ve cada día.',
            'Publica el mismo clip en varias redes a la vez. Mantén el texto de la publicación corto y directo: en el móvil, la mayoría de la gente decide en el primer segundo si sigue viendo, y el mensaje debe llevarlo el propio clip.',
            'Mantén un ritmo fijo, por ejemplo un video largo nuevo cada lunes y sus clips de martes a domingo. Cuando grabar y publicar siguen el mismo plan cada semana, la constancia deja de depender de lo ocupado que estés.'
          ]
        },
        {
          title: 'Cuentas conectadas y seguras',
          paragraphs: [
            'Conectas cada red a través de su inicio de sesión oficial y puedes desconectarla en cualquier momento. Los datos se cifran en tránsito y en reposo, y puedes exportar o eliminar tus datos cuando quieras.'
          ]
        }
      ],
      faqs: [
        {
          question: '¿En qué redes puedo publicar?',
          answer: 'Instagram, Facebook, TikTok y YouTube Shorts.'
        },
        {
          question: '¿Puedo publicar clips que no hice en Sneep Cut?',
          answer:
            'Sí. Los clips creados en Sneep Cut van directos a la publicación, y también puedes subir tus propios archivos al crear una publicación.'
        },
        {
          question: '¿Qué plan incluye el calendario de contenido?',
          answer:
            'El calendario de contenido forma parte del plan Pro. Consulta la página de precios para ver todo lo que incluye cada plan.'
        },
        {
          question: '¿Puedo cambiar una publicación programada?',
          answer: 'Sí. Puedes editar, reprogramar o cancelar una publicación antes de que se publique.'
        }
      ]
    },
    ...esUseCases,
    ...esAlternatives
  }
}
