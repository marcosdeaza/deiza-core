/**
 * Deiza news timeline — product announcements shown at /noticias.
 * Newest first. `art` picks the hand-drawn illustration (see Sketch.tsx).
 */
export type NewsArt = 'drop' | 'rose' | 'layers' | 'code' | 'image' | 'search' | 'eye' | 'link' | 'chat';

export interface NewsItem {
  id: string;
  date: string;            // ISO
  tag: { es: string; en: string };
  title: { es: string; en: string };
  excerpt: { es: string; en: string };
  body: { es: string[]; en: string[] };   // paragraphs
  art: NewsArt;
  hero?: string;           // optional artwork path (public/)
  upcoming?: boolean;
}

export const NEWS: NewsItem[] = [
  {
    id: 'deiza-escritorio',
    date: '2026-09-22',
    tag: { es: 'App de escritorio', en: 'Desktop app' },
    title: {
      es: 'Deiza para escritorio: el workspace y Deiza Code en una sola app',
      en: 'Deiza for desktop: the workspace and Deiza Code in one app',
    },
    excerpt: {
      es: 'Llega la app de Deiza para macOS y Windows. Un clic cambia entre Chat, con todo el workspace, y Code, donde el agente trabaja en las carpetas de tu equipo sin abrir una terminal.',
      en: 'The Deiza app arrives on macOS and Windows. One click switches between Chat, with the whole workspace, and Code, where the agent works in your computer\'s folders without opening a terminal.',
    },
    body: {
      es: [
        'Dos modos, una ventana. Arriba a la izquierda tienes un selector entre Chat y Code. Chat es el workspace de siempre, con todas sus funciones: artefactos, presentaciones, PDF y Word con diseño, búsqueda, imagen, vídeo y dictado por voz. Se actualiza solo, así que siempre está al día con la web.',
        'Code sin terminal. Eliges una carpeta y Deiza Code lee el proyecto, escribe archivos, ejecuta comandos y comprueba su trabajo con el motor Deiza Omniscient. Cada cambio aparece con su diff y cada comando con su salida en directo. Las páginas que crea se ven en la vista previa del panel lateral, y un botón revierte los archivos de la última respuesta si no te convence.',
        'Tres formas de trabajar. Build hace la tarea de principio a fin. Copilot te enseña cada cambio y cada comando antes de aplicarlo. Plan solo lee el proyecto y te propone el plan. Fuera de la carpeta del proyecto el agente siempre pide permiso, y nunca ejecuta comandos que destruirían el sistema.',
        'Hecha para el escritorio. Inicias sesión una vez dentro de la app, con el mismo código por email de siempre, y sirve para los dos modos. Las descargas van directas a tu carpeta, recibes avisos del sistema cuando Code termina una tarea larga y un atajo global (⌥⌘Espacio en Mac, Ctrl+Alt+Espacio en Windows) abre Deiza desde cualquier sitio.',
        'Disponible ya en deiza.org/desktop para Mac con Apple Silicon o Intel y para Windows 10 y 11. El chat funciona con cualquier cuenta; Code está incluido en los planes Friend y Signet.',
        'Y un arreglo que pedíais: el dictado por voz ahora transcribe mientras hablas. Al pulsar «Listo» solo queda el último fragmento, así que el texto aparece en un par de segundos aunque hayas hablado varios minutos. También funciona ya en Chrome y Edge, donde el micrófono estaba bloqueado.',
      ],
      en: [
        'Two modes, one window. At the top left there is a switch between Chat and Code. Chat is the workspace you know, with every feature: artifacts, decks, designed PDF and Word files, search, images, video and voice dictation. It updates itself, so it always matches the web.',
        'Code without a terminal. Pick a folder and Deiza Code reads the project, writes files, runs commands and checks its work with the Deiza Omniscient engine. Every change shows up with its diff and every command with its live output. The pages it builds render in the side panel preview, and a button reverts the files of the last answer if you do not like it.',
        'Three ways to work. Build does the task end to end. Copilot shows you every change and command before applying it. Plan only reads the project and proposes the plan. Outside the project folder the agent always asks first, and it never runs commands that would destroy the system.',
        'Made for the desktop. You sign in once inside the app, with the usual email code, and it works for both modes. Downloads go straight to your folder, you get a system notification when Code finishes a long task, and a global shortcut (⌥⌘Space on Mac, Ctrl+Alt+Space on Windows) opens Deiza from anywhere.',
        'Available now at deiza.org/desktop for Macs with Apple Silicon or Intel and for Windows 10 and 11. Chat works with any account; Code is included in the Friend and Signet plans.',
        'And a fix you asked for: voice dictation now transcribes while you speak. When you press "Done" only the last piece is left, so the text appears in a couple of seconds even after several minutes of talking. It also works in Chrome and Edge now, where the microphone was blocked.',
      ],
    },
    art: 'code',
    hero: '/art/desktop.webp',
  },
  {
    id: 'deiza-code-omniscient',
    date: '2026-09-19',
    tag: { es: 'Terminal & IA', en: 'Terminal & AI' },
    title: { 
      es: 'Deiza Code: agente autónomo en tu terminal y nuevo motor Deiza Omniscient', 
      en: 'Deiza Code: autonomous terminal agent and new Deiza Omniscient engine' 
    },
    excerpt: {
      es: 'Llega Deiza Code para macOS, Linux y Windows. Estrena en exclusiva el motor Deiza Omniscient (Liquid 5), alojado en la infraestructura dedicada de Deiza para programación autónoma de alta velocidad, diffs quirúrgicos en vivo y ejecución de tests.',
      en: 'Introducing Deiza Code for macOS, Linux, and Windows. Featuring the exclusive Deiza Omniscient model (Liquid 5) running on Deiza\'s dedicated infrastructure for high-velocity autonomous coding, surgical diffs, and test suites.'
    },
    body: {
      es: [
        'Un agente de desarrollo en tu consola. Deiza Code traslada el poder agéntico de Deiza directamente a tu terminal. Lee archivos locales, realiza modificaciones quirúrgicas mostrando diffs visuales en verde y rojo, ejecuta comandos en bash de forma segura y automatiza tareas complejas en tus repositorios de código.',
        'Motor exclusivo Deiza Omniscient (Liquid 5). A diferencia de los modelos conversacionales habituales, Deiza Code estrena en exclusiva Deiza Omniscient, basado en la arquitectura Liquid 5 y desplegado en la infraestructura dedicada de Deiza. Esta infraestructura garantiza cero tiempos de espera, latencia mínima y potencia extrema enfocada en ingeniería de software.',
        'Modos Build y Plan. Trabaja a tu ritmo: en modo Plan, el agente inspecciona tu arquitectura, analiza dependencias y te propone un plan de implementación detallado sin alterar archivos; en modo Build, ejecuta las herramientas y realiza los cambios de forma autónoma.',
        'Instalación en un solo comando y login por navegador. Disponible para macOS, Linux y Windows mediante scripts universales limpios, o a través de un prompt directo para agentes de IA. Inicia sesión en un clic con tu cuenta de Deiza vinculando tus créditos de uso y ventana de 5 horas. Disponible en exclusiva para planes de pago (Friend y Signet).',
        'Cero lock-in. El CLI es completamente universal: además de conectarse de forma nativa a Deiza, puedes reciclarlo con cualquier endpoint compatible con OpenAI (Ollama, vLLM, DeepSeek o LocalAI).'
      ],
      en: [
        'An autonomous coding agent in your terminal. Deiza Code brings the full agentic capabilities of Deiza directly to your command line. It inspects local codebases, performs surgical edits with live unified visual diffs, executes shell commands with security guards, and automates full engineering workflows.',
        'Exclusive Deiza Omniscient (Liquid 5) Engine. Unlike standard conversational chatbots, Deiza Code introduces Deiza Omniscient, powered by Liquid 5 on Deiza\'s dedicated high-compute infrastructure for instant response times and deep autonomous reasoning.',
        'Build and Plan Modes. In Plan mode, the agent explores your repository and produces architectural blueprints without modifying code. In Build mode, it autonomously executes tools and validates tests.',
        'One-command install and browser login. Ready for macOS, Linux, and Windows with clean install scripts. Seamless 1-click browser authentication with your Deiza account quota and rolling 5h window. Exclusive to paid subscribers (Friend and Signet).',
        'Zero lock-in. 100% recyclable with any OpenAI-compatible provider (Ollama, vLLM, DeepSeek, LocalAI).'
      ]
    },
    art: 'code'
  },
  {
    id: 'entregables-en-el-chat',
    date: '2026-09-17',
    tag: { es: 'Plataforma', en: 'Platform' },
    title: { es: 'Todo en el chat: presentaciones, vídeo y documentos con diseño', en: 'Everything in the chat: decks, video and designed documents' },
    excerpt: {
      es: 'Los PowerPoint se ven diapositiva a diapositiva sin salir del chat, el vídeo se genera en la propia conversación, y los PDF y Word estrenan temas, portadas y fotos. Deiza Design se integra en el Workspace.',
      en: 'PowerPoints show slide by slide without leaving the chat, video is generated inside the conversation, and PDFs and Word files get themes, covers and photos. Deiza Design merges into the Workspace.',
    },
    body: {
      es: [
        'Presentaciones dentro del chat. Cuando pides un PowerPoint, Deiza compone la presentación con un tema propio (editorial, suizo, noir, océano, bosque, atardecer, medianoche o minimal), portada, secciones, diapositivas de cifra, comparativas a dos columnas y citas. Ahora la ves diapositiva a diapositiva en la conversación, con miniaturas y pantalla completa, y descargas el .pptx cuando quieras. Puedes pedirla en cualquier momento de un chat, no solo al empezar, y decir «cambia la diapositiva 3» o «ponle otro tema» para que edite la misma presentación.',
        'PDF y Word con diseño. Se acabaron los documentos grises: cada PDF elige un tema tipográfico y de color según el contenido, con portada, tablas con estilo, citas destacadas y fotos incrustadas, tanto las que adjuntes tú como las que Deiza encuentre en la web. Los .docx llevan la misma familia de estilos, con imágenes y tablas reales. Para diseños muy concretos (un póster, un currículum, un menú, una factura) Deiza maqueta el PDF con total libertad, como una página web, y se imprime tal cual.',
        'Vídeo en la conversación. Pide «hazme un vídeo de...» o «un reel vertical de...» y DZ-Motion lo genera ahí mismo; aparece reproducible en el chat y se descarga en un toque. Con esto, Deiza Design deja de ser una página aparte: imagen, vídeo y documentos se piden donde ya estás trabajando. Disponible en los planes de pago.',
        'Sigue trabajando sobre lo que ya tienes. Cuando pides cambiar una web, un PDF o un documento anterior, Deiza parte de esa versión y entrega la completa actualizada, conservando lo que no has pedido tocar. Ya no hay que rehacer nada desde cero ni volver a pegarlo.',
        'Decisiones rápidas. Muy de vez en cuando, cuando una respuesta tuya cambia de verdad el resultado (cuántas personas viajan, para quién es una web, con qué tono), Deiza te lo pregunta con opciones que puedes tocar, o escribes lo tuyo. Nunca para cosas sencillas: en la duda, hace lo razonable.',
        'Y una corrección pendiente: las tablas anchas ya se desplazan lateralmente sin volver al principio.',
      ],
      en: [
        'Presentations inside the chat. When you ask for a PowerPoint, Deiza composes the deck with its own theme (editorial, swiss, noir, ocean, forest, sunset, midnight or minimal), a cover, sections, big-number slides, two-column comparisons and quotes. You now see it slide by slide in the conversation, with thumbnails and fullscreen, and download the .pptx whenever you want. Ask for it at any point in a chat, not just at the start, and say "change slide 3" or "try another theme" to edit the same deck.',
        'Designed PDF and Word files. No more grey documents: every PDF picks a typographic and colour theme to match its content, with a cover, styled tables, pull quotes and embedded photos, both the ones you attach and the ones Deiza finds on the web. .docx files share the same family of styles, with real images and tables. For very specific designs (a poster, a resume, a menu, an invoice) Deiza lays the PDF out with full freedom, like a web page, and prints it as is.',
        'Video in the conversation. Ask "make me a video of..." or "a vertical reel of..." and DZ-Motion generates it right there; it plays inline in the chat and downloads in one tap. With this, Deiza Design is no longer a separate page: image, video and documents are requested where you already work. Available on paid plans.',
        'Keep building on what you have. When you ask to change a previous web page, PDF or document, Deiza starts from that version and delivers the complete updated one, keeping what you did not ask to touch. Nothing needs rebuilding from scratch or pasting again.',
        'Quick decisions. Very occasionally, when your answer truly changes the result (how many people travel, who a website is for, which tone), Deiza asks with tappable options, or you write your own. Never for simple things: when in doubt, it does the reasonable thing.',
        'And a pending fix: wide tables now scroll sideways without jumping back to the start.',
      ],
    },
    art: 'layers',
  },
  {
    id: 'liquid-5',
    date: '2026-09-11',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'Liquid 5: la nueva generación de Deiza', en: 'Liquid 5: Deiza’s new generation' },
    excerpt: {
      es: 'Más inteligente, más rápido y con búsqueda web metódica. Llega junto a una interfaz renovada y, por primera vez, un modelo de Deiza ha colaborado en la programación de su propia plataforma.',
      en: 'Smarter, faster, with methodical web search. It ships with a refreshed interface and, for the first time, a Deiza model helped program its own platform.',
    },
    body: {
      es: [
        'Liquid 5 es el modelo con el que trabajarás casi siempre. Mantiene el equilibrio de Liquid —rápido, versátil, agéntico— y sube el listón en razonamiento, escritura y análisis de documentos largos: 1 millón de tokens de contexto (unas 1.500 páginas) y hasta 64.000 tokens de salida en una sola respuesta.',
        'En velocidad marca un antes y un después: cerca de 300 tokens por segundo, la salida más rápida medida por evaluadores independientes en su categoría, y respuestas que empiezan en torno a un segundo en conversación normal. Cuando la tarea es compleja, Liquid 5 piensa más antes de contestar; cuando es sencilla, responde al instante.',
        'La búsqueda web ahora es metódica: identifica qué hay que verificar, consulta varias fuentes, las contrasta y responde con fechas. Verás cada búsqueda mientras ocurre, y las fuentes quedan enlazadas bajo la respuesta.',
        'Respaldo por cadena: si un modelo no responde, Deiza prueba automáticamente con versiones anteriores de la misma familia (Liquid 5 → Liquid 4.5) sin que tengas que hacer nada. Puedes desactivarlo en Ajustes.',
        'Y una novedad que nos hace especial ilusión: por primera vez, un modelo de Deiza ha colaborado en la programación de su propia plataforma e interfaz. Gran parte de lo que estrenas hoy —el nuevo composer, la lectura en voz alta, el dictado con detección de idioma, las Skills— se construyó en esa colaboración.',
        'Liquid 4.5 sigue disponible en «Más modelos» para quien prefiera su estilo. Gas 4.5 y Solid 4.6 no cambian.',
      ],
      en: [
        'Liquid 5 is the model you will use most of the time. It keeps Liquid’s balance — fast, versatile, agentic — and raises the bar on reasoning, writing and long-document analysis: a 1-million-token context (about 1,500 pages) and up to 64,000 output tokens in a single answer.',
        'On speed it is a step change: close to 300 tokens per second, the fastest output measured by independent evaluators in its class, with answers starting around one second in normal conversation. When a task is complex, Liquid 5 thinks longer before answering; when it is simple, it answers instantly.',
        'Web search is now methodical: it identifies what needs verification, consults several sources, cross-checks them and answers with dates. You see each search as it happens, and sources stay linked under the answer.',
        'Chain fallback: if a model does not answer, Deiza automatically tries previous versions of the same family (Liquid 5 → Liquid 4.5) without you doing anything. You can turn it off in Settings.',
        'And something we are especially proud of: for the first time, a Deiza model helped program its own platform and interface. Much of what you are trying today — the new composer, read-aloud, dictation with language detection, Skills — was built in that collaboration.',
        'Liquid 4.5 stays available under “More models” for those who prefer its style. Gas 4.5 and Solid 4.6 are unchanged.',
      ],
    },
    art: 'drop',
    hero: '/art/liquid5.webp',
  },
  {
    id: 'dhisper',
    date: '2026-09-11',
    tag: { es: 'Motor de voz', en: 'Voice engine' },
    title: { es: 'Dhisper: Deiza aprende a escuchar y a hablar', en: 'Dhisper: Deiza learns to listen and speak' },
    excerpt: {
      es: 'Nuevo motor de voz. Dicta en el idioma que quieras —o mezclando varios— y escucha las respuestas con una voz cálida y natural.',
      en: 'A new voice engine. Dictate in any language — or mix several — and listen to answers in a warm, natural voice.',
    },
    body: {
      es: [
        'Dhisper sustituye al dictado del navegador. Ya no tienes que elegir idioma: reconoce el que hablas, respeta la puntuación y entiende cuando cambias de español a inglés a mitad de frase. Funciona igual en la web, en iPhone y en Android, con una onda de audio en vivo mientras grabas.',
        'También lee las respuestas en voz alta: pulsa «Escuchar» bajo cualquier mensaje. La voz es natural y conversacional, empieza a sonar en segundos y el texto se limpia antes de leerlo (sin leer código ni símbolos de formato).',
        'Dhisper llega con Liquid 5 y forma parte de la misma actualización de interfaz.',
      ],
      en: [
        'Dhisper replaces browser dictation. You no longer pick a language: it recognises the one you speak, keeps punctuation and understands when you switch from Spanish to English mid-sentence. It works the same on web, iPhone and Android, with a live waveform while you record.',
        'It also reads answers aloud: tap “Listen” under any message. The voice is natural and conversational, starts within seconds, and the text is cleaned before reading (no code or formatting symbols read out).',
        'Dhisper ships with Liquid 5 as part of the same interface update.',
      ],
    },
    art: 'chat',
  },
  {
    id: 'skills',
    date: '2026-09-11',
    tag: { es: 'Plataforma', en: 'Platform' },
    title: { es: 'Skills: enseña a Deiza cómo trabajas', en: 'Skills: teach Deiza how you work' },
    excerpt: {
      es: 'Importa un archivo Markdown con instrucciones, dale un nombre y actívalo: Deiza lo aplica cuando la tarea encaja.',
      en: 'Import a Markdown file with instructions, name it and switch it on: Deiza applies it when the task fits.',
    },
    body: {
      es: [
        'Una skill es un archivo Markdown con instrucciones: cómo quieres que Deiza escriba tus informes, el estilo de tus emails, las reglas de tu equipo… Cuando lo que pides encaja con su contenido, Deiza sigue esas instrucciones sin que tengas que repetirlas cada vez.',
        'Se gestionan en Ajustes → Skills: importa el .md (o pega el texto), ponle nombre y actívala o desactívala con un toque. Igual que las skills de los asistentes que más te gustan, pero dentro de Deiza.',
      ],
      en: [
        'A skill is a Markdown file with instructions: how you want Deiza to write your reports, your email style, your team’s rules… When your request matches its content, Deiza follows those instructions without you repeating them every time.',
        'Manage them in Settings → Skills: import the .md (or paste the text), name it and switch it on or off with a tap.',
      ],
    },
    art: 'chat',
  },
  {
    id: 'dz-code',
    date: '2026-09-11',
    tag: { es: 'Próximamente', en: 'Coming soon' },
    title: { es: 'DZ-Code, pronto', en: 'DZ-Code, coming soon' },
    excerpt: {
      es: 'Un modelo de Deiza especializado en programación, pensado para proyectos completos y no solo fragmentos.',
      en: 'A Deiza model specialised in programming, built for whole projects rather than snippets.',
    },
    body: {
      es: [
        'DZ-Code está en fase final de pruebas. Entiende repositorios completos, propone cambios coherentes entre archivos y explica solo lo que no es evidente. Llegará al chat y a la API en cuanto termine la fase de pruebas.',
      ],
      en: [
        'DZ-Code is in its final testing phase. It understands whole repositories, proposes coherent multi-file changes and explains only what is not obvious. It lands in chat and the API once testing wraps up.',
      ],
    },
    art: 'code',
    upcoming: true,
  },
  {
    id: 'june-update',
    date: '2026-06-12',
    tag: { es: 'Arquitectura', en: 'Architecture' },
    title: { es: 'Update de junio: DZ-9 se convierte en Liquid 1 y nacen Solid y Gas', en: 'June update: DZ-9 becomes Liquid 1; Solid and Gas are born' },
    excerpt: {
      es: 'Deiza deja de ser un único modelo y pasa a una arquitectura multicapa: Gas para lo instantáneo, Liquid para casi todo, Solid para pensar largo.',
      en: 'Deiza stops being a single model and moves to a multilayer architecture: Gas for instant, Liquid for almost everything, Solid for long thinking.',
    },
    body: {
      es: [
        'Con la actualización de junio, DZ-9 —nuestro modelo más completo hasta entonces— se convirtió en Deiza Liquid 1, el centro de la nueva arquitectura. A su lado nacieron Deiza Gas, pensado para respuestas instantáneas, y Deiza Solid, que dedica más tiempo a razonar antes de contestar.',
        'La idea es sencilla: que cada pregunta la responda el nivel adecuado. Tú eliges el modelo en el composer y Deiza se encarga del resto. Esa misma actualización trajo Proyectos, generación de imágenes en el chat y el rediseño oscuro de la interfaz.',
      ],
      en: [
        'With the June update, DZ-9 — our most complete model until then — became Deiza Liquid 1, the centre of the new architecture. Beside it, Deiza Gas was born for instant answers, and Deiza Solid, which spends more time reasoning before replying.',
        'The idea is simple: each question is answered by the right layer. You pick the model in the composer and Deiza handles the rest. That same update brought Projects, in-chat image generation and the dark redesign of the interface.',
      ],
    },
    art: 'layers',
  },
  {
    id: 'dz-image-2',
    date: '2026-03-18',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ-Image 2', en: 'DZ-Image 2' },
    excerpt: {
      es: 'Edición de fotos con lenguaje natural: cambia la camisa, el fondo o la luz sin salir del chat.',
      en: 'Photo editing in natural language: change the shirt, the background or the light without leaving the chat.',
    },
    body: {
      es: [
        'DZ-Image 2 añade edición sobre tus propias fotos. Adjunta una imagen, describe el cambio y Deiza la devuelve editada manteniendo lo que no has pedido tocar. También mejora la coherencia de texto dentro de las imágenes y los retratos.',
      ],
      en: [
        'DZ-Image 2 adds editing on your own photos. Attach an image, describe the change and Deiza returns it edited while keeping what you did not ask to touch. Text inside images and portraits also get more consistent.',
      ],
    },
    art: 'image',
  },
  {
    id: 'dz-8',
    date: '2026-01-22',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ-8', en: 'DZ-8' },
    excerpt: {
      es: 'Documentos largos, PDFs y Word generados desde el chat, y el primer modo agente.',
      en: 'Long documents, PDFs and Word generated from chat, and the first agent mode.',
    },
    body: {
      es: [
        'DZ-8 fue el primer modelo de Deiza capaz de entregar archivos reales: informes en PDF, documentos Word, proyectos ZIP y páginas web renderizadas en vivo dentro del panel de artefactos. Con él llegó también el modo agente para tareas de varios pasos.',
      ],
      en: [
        'DZ-8 was the first Deiza model able to deliver real files: PDF reports, Word documents, ZIP projects and web pages rendered live inside the artifact panel. Agent mode for multi-step tasks arrived with it.',
      ],
    },
    art: 'chat',
  },
  {
    id: 'dz-image',
    date: '2025-11-06',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ-Image: Deiza aprende a dibujar', en: 'DZ-Image: Deiza learns to draw' },
    excerpt: {
      es: 'Generación de imágenes integrada en la conversación. Pide una ilustración, un logo o un cartel y aparece en el chat.',
      en: 'Image generation built into the conversation. Ask for an illustration, a logo or a poster and it appears in chat.',
    },
    body: {
      es: [
        'DZ-Image trajo la generación de imágenes al chat de Deiza: ilustraciones, logotipos, carteles y mockups a partir de una descripción, con descarga directa y sin marcas de agua. Fue el primer modelo de Deiza fuera del texto.',
      ],
      en: [
        'DZ-Image brought image generation to Deiza’s chat: illustrations, logos, posters and mockups from a description, with direct download and no watermarks. It was Deiza’s first model beyond text.',
      ],
    },
    art: 'image',
  },
  {
    id: 'dz-omniscient',
    date: '2025-09-15',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ Omniscient', en: 'DZ Omniscient' },
    excerpt: {
      es: 'Búsqueda en internet en tiempo real con fuentes citadas. Deiza deja de tener fecha de caducidad.',
      en: 'Real-time internet search with cited sources. Deiza no longer has an expiry date.',
    },
    body: {
      es: [
        'DZ Omniscient conectó Deiza con la web: noticias, precios, versiones, resultados… todo con fuentes visibles bajo cada respuesta. Fue la base del método de investigación que hoy usa Liquid 5.',
      ],
      en: [
        'DZ Omniscient connected Deiza to the web: news, prices, versions, results… all with visible sources under each answer. It was the basis of the research method Liquid 5 uses today.',
      ],
    },
    art: 'eye',
  },
  {
    id: 'dz-6',
    date: '2025-06-24',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ-6 y DZ-6 Pro', en: 'DZ-6 and DZ-6 Pro' },
    excerpt: {
      es: 'Dos velocidades por primera vez: DZ-6 para el día a día y DZ-6 Pro para razonar más.',
      en: 'Two speeds for the first time: DZ-6 for everyday use and DZ-6 Pro for deeper reasoning.',
    },
    body: {
      es: [
        'Con DZ-6 estrenamos la idea de niveles: un modelo ágil para la mayoría de preguntas y una versión Pro que dedica más cómputo a los problemas difíciles. Esa semilla se convertiría un año después en la arquitectura Gas · Liquid · Solid.',
      ],
      en: [
        'With DZ-6 we introduced the idea of tiers: an agile model for most questions and a Pro version that spends more compute on hard problems. That seed would become the Gas · Liquid · Solid architecture a year later.',
      ],
    },
    art: 'layers',
  },
  {
    id: 'dz-5h',
    date: '2025-04-10',
    tag: { es: 'Modelo', en: 'Model' },
    title: { es: 'DZ-5H', en: 'DZ-5H' },
    excerpt: {
      es: 'Conversaciones más largas, memoria dentro del chat y análisis de archivos subidos.',
      en: 'Longer conversations, in-chat memory and analysis of uploaded files.',
    },
    body: {
      es: [
        'DZ-5H amplió el contexto y añadió la lectura de PDFs y archivos de texto. Fue también el primer modelo que soportó varios idiomas de forma nativa en la plataforma.',
      ],
      en: [
        'DZ-5H expanded the context and added reading of PDFs and text files. It was also the first model to support multiple languages natively on the platform.',
      ],
    },
    art: 'search',
  },
  {
    id: 'dz-4f',
    date: '2025-02-18',
    tag: { es: 'Origen', en: 'Origin' },
    title: { es: 'DZ-4F: donde empezó todo', en: 'DZ-4F: where it all began' },
    excerpt: {
      es: 'El primer modelo de Deiza. Un asistente rápido, en español, hecho por un ingeniero valenciano que quería una IA que se sintiera propia.',
      en: 'Deiza’s first model. A fast assistant, in Spanish, made by a Valencian engineer who wanted an AI that felt like his own.',
    },
    body: {
      es: [
        'DZ-4F fue el primer modelo que llevó el nombre de Deiza. Pequeño, rápido y pensado para el español desde el primer día. No sabía generar imágenes ni buscar en internet, pero ya tenía lo esencial: una forma de conversar clara, directa y sin adornos.',
        'Todo lo que ha venido después —DZ-5H, DZ-6, Omniscient, DZ-8, DZ-9 y la arquitectura multicapa— nace de aquella primera versión.',
      ],
      en: [
        'DZ-4F was the first model to carry the Deiza name. Small, fast and designed for Spanish from day one. It could not generate images or search the web, but it already had the essentials: a clear, direct, unadorned way of conversing.',
        'Everything that came after — DZ-5H, DZ-6, Omniscient, DZ-8, DZ-9 and the multilayer architecture — grows from that first version.',
      ],
    },
    art: 'rose',
  },
];
