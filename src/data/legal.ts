/**
 * Legal texts for deiza.org — Spain / EU (RGPD + LOPDGDD, LSSI-CE, TRLGDCU, Directiva
 * 2019/770 sobre contenidos y servicios digitales, AI Act art. 50, DSA).
 *
 * Everything the law requires to be *identifiable* lives in OWNER below. Fill the empty
 * fields before going live: a legal notice without NIF and address is itself a breach
 * of LSSI art. 10.
 *
 * Paragraph mini-markup: **bold**, [text](url), and lines starting with "- " render as lists.
 */

export const OWNER = {
  brand: 'Deiza',
  /** Legal name of the company or sole trader operating the service */
  legalName: 'DeizaLab',
  /** NIF / CIF — required by LSSI art. 10 */
  nif: '',
  /** Postal address — required by LSSI art. 10 */
  address: '',
  /** Registro Mercantil data, if a company */
  registry: '',
  domain: 'deiza.org',
  email: 'legal@deiza.org',
  privacyEmail: 'privacidad@deiza.org',
  supportEmail: 'hola@deiza.org',
  hostingProvider: 'Contabo GmbH (Múnich, Alemania — Unión Europea)',
};

export const LEGAL_VERSION = '2026-09-17';
export const WITHDRAWAL_WAIVER_VERSION = '2026-09-17';

export type LegalSlug = 'aviso-legal' | 'privacidad' | 'cookies' | 'terminos' | 'reembolsos';
type L = { es: string; en: string };
export interface LegalSection { h: L; p: { es: string[]; en: string[] } }
export interface LegalDoc { slug: LegalSlug; title: L; short: L; intro: L; sections: LegalSection[] }

export const LEGAL_SLUGS: LegalSlug[] = ['aviso-legal', 'privacidad', 'cookies', 'terminos', 'reembolsos'];

const identity = (lang: 'es' | 'en') => {
  const rows = [
    [lang === 'es' ? 'Titular' : 'Owner', OWNER.legalName],
    ...(OWNER.nif ? [['NIF', OWNER.nif]] : []),
    ...(OWNER.address ? [[lang === 'es' ? 'Domicilio' : 'Address', OWNER.address]] : []),
    ...(OWNER.registry ? [[lang === 'es' ? 'Registro' : 'Registry', OWNER.registry]] : []),
    [lang === 'es' ? 'Correo' : 'Email', OWNER.email],
    [lang === 'es' ? 'Dominio' : 'Domain', OWNER.domain],
  ];
  return rows.map(([k, v]) => `- **${k}:** ${v}`);
};

export const LEGAL_DOCS: LegalDoc[] = [
  /* ───────────────────────────── AVISO LEGAL ───────────────────────────── */
  {
    slug: 'aviso-legal',
    title: { es: 'Aviso legal', en: 'Legal notice' },
    short: { es: 'Quién está detrás de Deiza', en: 'Who is behind Deiza' },
    intro: {
      es: 'Información general exigida por el artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE).',
      en: 'General information required by article 10 of Spanish Law 34/2002 on Information Society Services and E-commerce (LSSI-CE).',
    },
    sections: [
      {
        h: { es: 'Identificación del titular', en: 'Identity of the provider' },
        p: { es: identity('es'), en: identity('en') },
      },
      {
        h: { es: 'Objeto', en: 'Purpose' },
        p: {
          es: [
            'Deiza es un asistente de inteligencia artificial accesible en deiza.org y en sus aplicaciones. Permite conversar, buscar en la web, analizar archivos y generar textos, código, documentos, presentaciones, imágenes y vídeo.',
            'El acceso al sitio es gratuito. Algunas funciones requieren cuenta y otras un plan de pago, en los términos descritos en las [Condiciones de uso](/legal/terminos).',
          ],
          en: [
            'Deiza is an artificial-intelligence assistant available at deiza.org and in its apps. It lets you chat, search the web, analyse files and generate text, code, documents, presentations, images and video.',
            'Access to the site is free. Some features require an account and others a paid plan, as described in the [Terms of use](/legal/terminos).',
          ],
        },
      },
      {
        h: { es: 'Propiedad intelectual', en: 'Intellectual property' },
        p: {
          es: [
            'El diseño, la marca Deiza, los logotipos, las ilustraciones, el código y los textos del sitio son titularidad de ' + OWNER.legalName + ' o de sus licenciantes y están protegidos por la legislación de propiedad intelectual e industrial. No se cede ningún derecho sobre ellos por el mero uso del servicio.',
            'Lo que tú creas con Deiza es tuyo: ver el apartado «Contenido generado» de las Condiciones de uso.',
          ],
          en: [
            'The design, the Deiza brand, logos, illustrations, code and texts of the site belong to ' + OWNER.legalName + ' or its licensors and are protected by intellectual and industrial property law. Using the service grants no rights over them.',
            'What you create with Deiza is yours: see “Generated content” in the Terms of use.',
          ],
        },
      },
      {
        h: { es: 'Contenido publicado por usuarios y avisos (DSA)', en: 'User-published content and notices (DSA)' },
        p: {
          es: [
            'Deiza permite compartir conversaciones y artefactos mediante enlaces públicos. Ese contenido lo publica el usuario que lo comparte, bajo su responsabilidad. Conforme al Reglamento (UE) 2022/2065 de Servicios Digitales, cualquier persona puede notificarnos contenido que considere ilícito escribiendo a **' + OWNER.email + '** con el enlace y el motivo. Revisamos las notificaciones con diligencia y retiramos el contenido cuando procede; el punto de contacto único para autoridades y usuarios es ese mismo correo.',
          ],
          en: [
            'Deiza lets users share conversations and artifacts through public links. That content is published by the sharing user, under their responsibility. Under Regulation (EU) 2022/2065 (Digital Services Act), anyone can notify us of content they consider illegal by writing to **' + OWNER.email + '** with the link and the reason. We review notices diligently and remove content where appropriate; that address is the single point of contact for authorities and users.',
          ],
        },
      },
      {
        h: { es: 'Accesibilidad', en: 'Accessibility' },
        p: {
          es: [
            'Trabajamos para que Deiza cumpla la norma EN 301 549 y el nivel AA de las WCAG 2.2, conforme a la Ley 11/2023 sobre requisitos de accesibilidad de productos y servicios. Si encuentras una barrera, escríbenos a ' + OWNER.email + ' y la corregiremos.',
          ],
          en: [
            'We work to keep Deiza compliant with EN 301 549 and WCAG 2.2 level AA, as required by Spanish Law 11/2023 (European Accessibility Act). If you find a barrier, write to ' + OWNER.email + ' and we will fix it.',
          ],
        },
      },
      {
        h: { es: 'Ley aplicable', en: 'Governing law' },
        p: {
          es: ['Este aviso se rige por la legislación española. Para los consumidores, serán competentes los juzgados de su domicilio.'],
          en: ['This notice is governed by Spanish law. For consumers, the courts of their place of residence have jurisdiction.'],
        },
      },
    ],
  },

  /* ───────────────────────────── PRIVACIDAD ───────────────────────────── */
  {
    slug: 'privacidad',
    title: { es: 'Política de privacidad', en: 'Privacy policy' },
    short: { es: 'Qué datos tratamos y por qué', en: 'What data we process and why' },
    intro: {
      es: 'Cumplimos el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). Aquí te explicamos, sin rodeos, qué hacemos con tus datos.',
      en: 'We comply with Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD). Here is, plainly, what we do with your data.',
    },
    sections: [
      {
        h: { es: 'Responsable del tratamiento', en: 'Data controller' },
        p: {
          es: [...identity('es'), 'Contacto de privacidad: **' + OWNER.privacyEmail + '**.'],
          en: [...identity('en'), 'Privacy contact: **' + OWNER.privacyEmail + '**.'],
        },
      },
      {
        h: { es: 'Qué datos tratamos', en: 'What data we process' },
        p: {
          es: [
            '- **Cuenta:** correo electrónico, nombre y foto de perfil (si accedes con Google), fecha de alta y último acceso.',
            '- **Uso del servicio:** las conversaciones, archivos, imágenes y proyectos que subes o generas, tus preferencias (idioma, tema, instrucciones personalizadas, Skills) y la memoria que Deiza guarda para recordarte cosas entre chats.',
            '- **Pagos:** plan contratado, fechas y el identificador de la operación en Stripe. **Nunca vemos ni guardamos tu tarjeta**; la gestiona Stripe.',
            '- **Técnicos:** dirección IP, tipo de navegador y registros de acceso y errores, necesarios para que el servicio funcione y para su seguridad.',
            '- **Consentimientos:** cuándo aceptaste estas condiciones y la renuncia al desistimiento al contratar un plan (fecha, versión, IP).',
          ],
          en: [
            '- **Account:** email, name and profile picture (if you sign in with Google), sign-up date and last login.',
            '- **Service use:** the conversations, files, images and projects you upload or generate, your preferences (language, theme, custom instructions, Skills) and the memory Deiza keeps to remember things across chats.',
            '- **Payments:** plan purchased, dates and the Stripe transaction identifier. **We never see or store your card**; Stripe handles it.',
            '- **Technical:** IP address, browser type and access and error logs, needed for the service to work and stay secure.',
            '- **Consents:** when you accepted these terms and the withdrawal waiver when buying a plan (date, version, IP).',
          ],
        },
      },
      {
        h: { es: 'Para qué y con qué base legal', en: 'Purposes and legal bases' },
        p: {
          es: [
            '- **Prestar el servicio** (crear tu cuenta, responder a tus mensajes, guardar tus chats, cobrar los planes): ejecución del contrato (art. 6.1.b RGPD).',
            '- **Seguridad, prevención de abuso y límites de uso:** interés legítimo (art. 6.1.f) en mantener el servicio disponible y protegerlo.',
            '- **Correos transaccionales** (código de acceso, recibos, avisos de caducidad del plan): ejecución del contrato. No enviamos publicidad.',
            '- **Obligaciones legales** (facturación, requerimientos de autoridades): art. 6.1.c.',
            '- **Cookies o tecnologías no esenciales**, si algún día las incorporamos: solo con tu consentimiento (art. 6.1.a), que podrás retirar en cualquier momento.',
            'Tus conversaciones **no se usan para entrenar modelos** ni se venden a terceros.',
          ],
          en: [
            '- **Providing the service** (creating your account, answering your messages, storing your chats, charging plans): performance of a contract (art. 6.1.b GDPR).',
            '- **Security, abuse prevention and usage limits:** legitimate interest (art. 6.1.f) in keeping the service available and protected.',
            '- **Transactional emails** (login code, receipts, plan expiry notices): performance of a contract. We do not send advertising.',
            '- **Legal obligations** (invoicing, requests from authorities): art. 6.1.c.',
            '- **Non-essential cookies or technologies**, should we ever add them: only with your consent (art. 6.1.a), which you can withdraw at any time.',
            'Your conversations **are not used to train models** and are not sold to third parties.',
          ],
        },
      },
      {
        h: { es: 'Quién accede a tus datos (encargados)', en: 'Who accesses your data (processors)' },
        p: {
          es: [
            'Para funcionar, Deiza se apoya en proveedores que tratan datos por nuestra cuenta, con contratos de encargo del tratamiento (art. 28 RGPD):',
            '- **Alojamiento:** ' + OWNER.hostingProvider + '. Tus datos y archivos se almacenan en servidores de la UE.',
            '- **Modelos de inteligencia artificial:** los proveedores de modelos que configure quien opera el servicio, para generar respuestas, imágenes, vídeo, voz y código. El texto de tu mensaje y los archivos necesarios se envían a estos proveedores para producir la respuesta y no se conservan para entrenar sus modelos.',
            '- **Pagos:** Stripe Payments Europe Ltd. (Irlanda).',
            '- **Correo:** Resend, Inc. para el envío de códigos de acceso y avisos.',
            '- **Acceso con Google:** Google Ireland Ltd., si eliges iniciar sesión con tu cuenta de Google.',
            'Los proveedores establecidos en Estados Unidos están adheridos al **Marco de Privacidad de Datos UE-EE. UU.** o firman las **Cláusulas Contractuales Tipo** de la Comisión Europea, con medidas adicionales de cifrado en tránsito.',
            'No cedemos datos a otros terceros salvo obligación legal.',
          ],
          en: [
            'To work, Deiza relies on providers that process data on our behalf under data-processing agreements (art. 28 GDPR):',
            '- **Hosting:** ' + OWNER.hostingProvider + '. Your data and files are stored on EU servers.',
            '- **AI models:** the model providers configured by whoever operates the service, to generate answers, images, video, speech and code. The text of your message and the required files are sent to these providers to produce the answer and are not retained to train their models.',
            '- **Payments:** Stripe Payments Europe Ltd. (Ireland).',
            '- **Email:** Resend, Inc. for login codes and notices.',
            '- **Sign in with Google:** Google Ireland Ltd., if you choose to sign in with your Google account.',
            'Providers established in the United States are certified under the **EU-US Data Privacy Framework** or sign the European Commission’s **Standard Contractual Clauses**, with additional in-transit encryption.',
            'We do not disclose data to other third parties unless legally required.',
          ],
        },
      },
      {
        h: { es: 'Cuánto tiempo los conservamos', en: 'How long we keep it' },
        p: {
          es: [
            '- **Conversaciones, archivos y memoria:** mientras tu cuenta exista o hasta que los borres tú. Al eliminar un chat se elimina de forma definitiva.',
            '- **Cuenta:** hasta que la elimines desde Ajustes. Después borramos tus datos en un plazo máximo de 30 días, salvo los que debamos conservar por ley.',
            '- **Datos de facturación:** 6 años, por obligación mercantil y fiscal.',
            '- **Registros técnicos:** hasta 12 meses.',
            '- **Contenido compartido con enlace público:** hasta que lo retires o elimines tu cuenta.',
          ],
          en: [
            '- **Conversations, files and memory:** as long as your account exists or until you delete them. Deleting a chat removes it permanently.',
            '- **Account:** until you delete it from Settings. We then erase your data within 30 days, except what we must keep by law.',
            '- **Billing data:** 6 years, as required by commercial and tax law.',
            '- **Technical logs:** up to 12 months.',
            '- **Content shared via public link:** until you withdraw it or delete your account.',
          ],
        },
      },
      {
        h: { es: 'Tus derechos', en: 'Your rights' },
        p: {
          es: [
            'Puedes ejercer en cualquier momento tus derechos de **acceso, rectificación, supresión, oposición, limitación y portabilidad**, y retirar el consentimiento que hayas dado. Desde **Ajustes** puedes descargar una copia de tus datos y eliminar tu cuenta tú mismo; para cualquier otra solicitud escribe a ' + OWNER.privacyEmail + ' indicando tu correo de la cuenta. Respondemos en el plazo máximo de un mes.',
            'Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la **Agencia Española de Protección de Datos** ([aepd.es](https://www.aepd.es)).',
            'No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni elaboramos perfiles con fines publicitarios.',
          ],
          en: [
            'You can exercise at any time your rights of **access, rectification, erasure, objection, restriction and portability**, and withdraw any consent given. From **Settings** you can download a copy of your data and delete your account yourself; for any other request write to ' + OWNER.privacyEmail + ' from your account email. We answer within one month at most.',
            'If you believe we have not handled your request properly, you can lodge a complaint with the **Spanish Data Protection Agency** ([aepd.es](https://www.aepd.es)).',
            'We make no automated decisions with legal effects on you and do not profile you for advertising.',
          ],
        },
      },
      {
        h: { es: 'Menores', en: 'Minors' },
        p: {
          es: ['Deiza está dirigido a mayores de 14 años. Los menores de 14 necesitan el consentimiento de sus padres o tutores (art. 7 LOPDGDD). Contratar un plan de pago requiere ser mayor de edad o contar con autorización de quien ostente la patria potestad.'],
          en: ['Deiza is intended for people aged 14 and over. Under-14s need the consent of their parents or guardians (art. 7 LOPDGDD). Buying a paid plan requires being of legal age or having authorisation from a parent or guardian.'],
        },
      },
      {
        h: { es: 'Seguridad', en: 'Security' },
        p: {
          es: ['Todo el tráfico va cifrado (HTTPS/TLS). El acceso se hace sin contraseña, mediante código de un solo uso enviado a tu correo o con Google. Los archivos se guardan en servidores de la UE con acceso restringido. Si detectáramos una brecha que afecte a tus datos, te lo notificaríamos y lo comunicaríamos a la AEPD en 72 horas, como exige el RGPD.'],
          en: ['All traffic is encrypted (HTTPS/TLS). Sign-in is passwordless, via one-time code sent to your email or with Google. Files are stored on EU servers with restricted access. Should we detect a breach affecting your data, we would notify you and report it to the AEPD within 72 hours, as the GDPR requires.'],
        },
      },
      {
        h: { es: 'Cambios', en: 'Changes' },
        p: {
          es: ['Si cambiamos esta política de forma relevante, te avisaremos en la aplicación o por correo antes de que entre en vigor. La fecha de la última versión figura al principio de la página.'],
          en: ['If we materially change this policy we will notify you in the app or by email before it takes effect. The date of the latest version is shown at the top of the page.'],
        },
      },
    ],
  },

  /* ───────────────────────────── COOKIES ───────────────────────────── */
  {
    slug: 'cookies',
    title: { es: 'Política de cookies', en: 'Cookie policy' },
    short: { es: 'Solo las imprescindibles', en: 'Only the essential ones' },
    intro: {
      es: 'Conforme al artículo 22.2 de la LSSI-CE y a la Guía sobre el uso de cookies de la AEPD. La versión corta: Deiza solo usa cookies y almacenamiento técnicos, sin rastreo ni publicidad.',
      en: 'In accordance with article 22.2 LSSI-CE and the AEPD cookie guidelines. Short version: Deiza only uses technical cookies and storage, with no tracking and no advertising.',
    },
    sections: [
      {
        h: { es: 'Qué es una cookie', en: 'What a cookie is' },
        p: {
          es: ['Un pequeño archivo que el navegador guarda cuando visitas un sitio. También existen tecnologías equivalentes, como el almacenamiento local del navegador (localStorage), que tratamos aquí con las mismas reglas.'],
          en: ['A small file your browser stores when you visit a site. Equivalent technologies such as the browser’s local storage (localStorage) exist too; we treat them under the same rules here.'],
        },
      },
      {
        h: { es: 'Cookies que usamos', en: 'Cookies we use' },
        p: {
          es: [
            'Todas son **técnicas y estrictamente necesarias**, por lo que están exentas de consentimiento. No usamos cookies analíticas, publicitarias ni de redes sociales.',
            '- **session** (cookie, deiza.org, 7 días): mantiene tu sesión iniciada. Propia.',
            '- **deiza:auth_token** (localStorage): sesión en las apps móviles y de escritorio. Propio.',
            '- **deiza:consent** (localStorage, 12 meses): recuerda que ya has visto este aviso y tus preferencias. Propio.',
            '- **deiza-language, deiza-theme, deiza-chain-fallback, deiza-initial-prompt** y similares (localStorage): tus preferencias de idioma, tema y chat. Propios.',
            '- **Stripe** (\\_\\_stripe\\_mid, \\_\\_stripe\\_sid; dominio stripe.com; hasta 1 año): prevención de fraude durante el pago. Solo se instalan en la página de pago de Stripe. Terceros; ver [política de Stripe](https://stripe.com/es/privacy).',
            '- **Google** (dominio google.com): únicamente si eliges «Acceder con Google», las cookies de tu sesión de Google. Terceros; ver [política de Google](https://policies.google.com/privacy).',
          ],
          en: [
            'All of them are **technical and strictly necessary**, so they are exempt from consent. We use no analytics, advertising or social-media cookies.',
            '- **session** (cookie, deiza.org, 7 days): keeps you signed in. First-party.',
            '- **deiza:auth_token** (localStorage): session in the mobile and desktop apps. First-party.',
            '- **deiza:consent** (localStorage, 12 months): remembers that you have seen this notice and your preferences. First-party.',
            '- **deiza-language, deiza-theme, deiza-chain-fallback, deiza-initial-prompt** and similar (localStorage): your language, theme and chat preferences. First-party.',
            '- **Stripe** (\\_\\_stripe\\_mid, \\_\\_stripe\\_sid; domain stripe.com; up to 1 year): fraud prevention during payment. Only set on Stripe’s checkout page. Third-party; see [Stripe’s policy](https://stripe.com/privacy).',
            '- **Google** (domain google.com): only if you choose “Sign in with Google”, your Google session cookies. Third-party; see [Google’s policy](https://policies.google.com/privacy).',
          ],
        },
      },
      {
        h: { es: 'Cómo gestionarlas', en: 'How to manage them' },
        p: {
          es: [
            'Como solo usamos cookies necesarias, no hay nada que aceptar o rechazar: el aviso que ves al entrar es informativo. Si en el futuro añadimos alguna cookie no esencial, te pediremos consentimiento antes, con opciones de aceptar y rechazar al mismo nivel, y podrás cambiar de opinión desde el enlace «Cookies» del pie de página.',
            'Puedes borrar o bloquear cookies desde tu navegador: [Chrome](https://support.google.com/chrome/answer/95647), [Safari](https://support.apple.com/es-es/guide/safari/sfri11471/mac), [Firefox](https://support.mozilla.org/es/kb/Borrar%20cookies), [Edge](https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-6ac9-a3d3-bfd7-ffc1a1d0cb01). Si bloqueas la cookie de sesión no podrás mantener la sesión iniciada.',
          ],
          en: [
            'Since we only use necessary cookies there is nothing to accept or reject: the notice you see on arrival is informational. Should we add any non-essential cookie in the future we will ask for consent first, with accept and reject options at the same level, and you will be able to change your mind from the “Cookies” link in the footer.',
            'You can delete or block cookies from your browser: [Chrome](https://support.google.com/chrome/answer/95647), [Safari](https://support.apple.com/guide/safari/sfri11471/mac), [Firefox](https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox), [Edge](https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-6ac9-a3d3-bfd7-ffc1a1d0cb01). Blocking the session cookie means you cannot stay signed in.',
          ],
        },
      },
    ],
  },

  /* ───────────────────────────── TÉRMINOS ───────────────────────────── */
  {
    slug: 'terminos',
    title: { es: 'Condiciones de uso', en: 'Terms of use' },
    short: { es: 'Las reglas del juego', en: 'The rules of the game' },
    intro: {
      es: 'Estas condiciones regulan el uso de Deiza entre ' + OWNER.legalName + ' y tú. Al crear una cuenta o usar el servicio las aceptas. Si contratas un plan, se aplican además la [Política de reembolsos](/legal/reembolsos).',
      en: 'These terms govern the use of Deiza between ' + OWNER.legalName + ' and you. By creating an account or using the service you accept them. If you buy a plan, the [Refund policy](/legal/reembolsos) also applies.',
    },
    sections: [
      {
        h: { es: 'El servicio', en: 'The service' },
        p: {
          es: [
            'Deiza es un asistente de inteligencia artificial: genera texto, código, documentos, presentaciones, imágenes y vídeo a partir de lo que le pides, y puede buscar en la web. **Estás interactuando con un sistema de IA, no con una persona.** Los resultados pueden contener errores, imprecisiones o sesgos; revísalos antes de usarlos, especialmente en asuntos médicos, legales, financieros o de seguridad. Deiza no sustituye el consejo de un profesional.',
            'Las imágenes y vídeos generados son sintéticos. Cuando los difundas, no los presentes como reales; conforme al Reglamento (UE) 2024/1689 (Reglamento de IA), el contenido generado se marca como tal en la medida técnica disponible.',
          ],
          en: [
            'Deiza is an artificial-intelligence assistant: it generates text, code, documents, presentations, images and video from your requests, and can search the web. **You are interacting with an AI system, not a person.** Outputs may contain errors, inaccuracies or bias; review them before relying on them, especially for medical, legal, financial or safety matters. Deiza does not replace professional advice.',
            'Generated images and videos are synthetic. When you distribute them, do not present them as real; under Regulation (EU) 2024/1689 (AI Act), generated content is marked as such to the extent technically available.',
          ],
        },
      },
      {
        h: { es: 'Cuenta', en: 'Account' },
        p: {
          es: [
            'Necesitas una cuenta para guardar conversaciones y usar los planes. Se crea con tu correo (código de un solo uso) o con Google. Eres responsable de lo que se haga desde tu cuenta y de mantener el acceso a tu correo. Puedes eliminar tu cuenta cuando quieras desde Ajustes.',
            'Debes tener al menos 14 años; para contratar un plan, ser mayor de edad o contar con autorización.',
          ],
          en: [
            'You need an account to save conversations and use plans. It is created with your email (one-time code) or with Google. You are responsible for what is done from your account and for keeping access to your email. You can delete your account at any time from Settings.',
            'You must be at least 14; to buy a plan, of legal age or authorised.',
          ],
        },
      },
      {
        h: { es: 'Planes, precios y pago', en: 'Plans, prices and payment' },
        p: {
          es: [
            'El plan **Free** es gratuito y tiene límites de uso. Los planes de pago (**Friend** y **Signet**) se contratan por un **periodo de 30 días** mediante un **pago único** a través de Stripe; **no se renuevan automáticamente** ni guardamos tu tarjeta. Los precios se muestran en euros con IVA incluido en la página de [Planes](/plans). Cada plan incluye un cupo de uso por modelo que se muestra en la propia aplicación; al agotarse, el uso se reanuda en la siguiente ventana.',
            'También puedes comprar un **código regalo** para que otra persona active un plan. Los códigos caducan si no se canjean en el plazo indicado al comprarlos.',
            'Como el servicio es digital y empieza a prestarse inmediatamente, al pagar te pediremos que confirmes expresamente que quieres empezar ya y que renuncias al derecho de desistimiento. Los detalles están en la [Política de reembolsos](/legal/reembolsos).',
          ],
          en: [
            'The **Free** plan is free and has usage limits. Paid plans (**Friend** and **Signet**) are purchased for a **30-day period** as a **one-off payment** through Stripe; **they do not renew automatically** and we do not store your card. Prices are shown in euros, VAT included, on the [Plans](/plans) page. Each plan includes a usage allowance per model shown in the app; once exhausted, use resumes in the next window.',
            'You can also buy a **gift code** so someone else can activate a plan. Codes expire if not redeemed within the period shown at purchase.',
            'Because the service is digital and starts immediately, at checkout we will ask you to expressly confirm that you want to start now and waive the right of withdrawal. Details are in the [Refund policy](/legal/reembolsos).',
          ],
        },
      },
      {
        h: { es: 'Uso aceptable', en: 'Acceptable use' },
        p: {
          es: [
            'No uses Deiza para:',
            '- Actividades ilegales, fraude, acoso, o para generar contenido que vulnere derechos de terceros (incluida la creación de imágenes o vídeos de personas reales sin su consentimiento).',
            '- Material de abuso sexual infantil, incitación a la violencia o al odio, o instrucciones para causar daño grave.',
            '- Intentar acceder sin autorización a la plataforma, sortear límites de uso, revender el servicio o automatizar el acceso sin usar la API oficial.',
            'Podemos suspender o cerrar cuentas que incumplan estas reglas. Si el cierre se debe a un incumplimiento grave, no procederá devolución del plan.',
          ],
          en: [
            'Do not use Deiza for:',
            '- Illegal activities, fraud, harassment, or generating content that infringes third-party rights (including creating images or videos of real people without their consent).',
            '- Child sexual abuse material, incitement to violence or hatred, or instructions to cause serious harm.',
            '- Attempting unauthorised access to the platform, circumventing usage limits, reselling the service or automating access without the official API.',
            'We may suspend or close accounts that break these rules. If closure is due to a serious breach, no plan refund applies.',
          ],
        },
      },
      {
        h: { es: 'Contenido generado y propiedad', en: 'Generated content and ownership' },
        p: {
          es: [
            'Lo que subes sigue siendo tuyo. Nos concedes únicamente la licencia necesaria para procesarlo y mostrártelo. En la medida en que la ley lo permita, los resultados que Deiza genera para ti te pertenecen y puedes usarlos con cualquier fin, incluido el comercial. Ten en cuenta que otros usuarios pueden obtener resultados parecidos y que la legislación sobre obras generadas por IA varía según el país.',
            'Si compartes una conversación o un artefacto con enlace público, autorizas a que cualquiera con el enlace lo vea. Puedes retirarlo en cualquier momento.',
          ],
          en: [
            'What you upload remains yours. You grant us only the licence needed to process it and show it to you. To the extent permitted by law, the outputs Deiza generates for you belong to you and you may use them for any purpose, including commercially. Note that other users may obtain similar outputs and that law on AI-generated works varies by country.',
            'If you share a conversation or artifact via public link, you allow anyone with the link to view it. You can withdraw it at any time.',
          ],
        },
      },
      {
        h: { es: 'API', en: 'API' },
        p: {
          es: ['Las claves de API son personales. El uso a través de la API consume el cupo de tu plan y está sujeto a estas mismas condiciones. Si integras Deiza en un producto propio, eres responsable de informar a tus usuarios de que interactúan con una IA y de cumplir la normativa aplicable.'],
          en: ['API keys are personal. API use consumes your plan allowance and is subject to these same terms. If you integrate Deiza into your own product, you are responsible for telling your users they interact with an AI and for complying with applicable law.'],
        },
      },
      {
        h: { es: 'Disponibilidad y cambios', en: 'Availability and changes' },
        p: {
          es: ['Hacemos lo posible por mantener Deiza disponible, pero puede haber interrupciones por mantenimiento, incidencias de proveedores o causas ajenas. Podemos mejorar, cambiar o retirar funciones; si un cambio afecta de forma sustancial a un plan que has pagado, te avisaremos y podrás resolver el contrato con la devolución proporcional del tiempo no disfrutado.'],
          en: ['We do our best to keep Deiza available, but there may be interruptions due to maintenance, provider incidents or causes beyond our control. We may improve, change or withdraw features; if a change materially affects a plan you paid for, we will tell you and you may terminate with a pro-rata refund of the unused time.'],
        },
      },
      {
        h: { es: 'Responsabilidad', en: 'Liability' },
        p: {
          es: ['Respondemos de los daños causados por dolo o negligencia y de la falta de conformidad del servicio en los términos de la ley. No respondemos de las decisiones que tomes basándote en los resultados de la IA ni del uso que hagas del contenido generado. Nada de lo aquí escrito limita los derechos que te reconoce la legislación de consumo, que prevalece sobre estas condiciones en caso de conflicto.'],
          en: ['We are liable for damage caused by wilful misconduct or negligence and for lack of conformity of the service as provided by law. We are not liable for decisions you take based on AI outputs or for the use you make of generated content. Nothing here limits the rights granted to you by consumer law, which prevails over these terms in case of conflict.'],
        },
      },
      {
        h: { es: 'Reclamaciones y ley aplicable', en: 'Complaints and governing law' },
        p: {
          es: [
            'Cualquier duda o reclamación: **' + OWNER.email + '**. Intentaremos resolverla en un plazo máximo de un mes. Como consumidor puedes acudir además al Sistema Arbitral de Consumo, a las Oficinas Municipales de Información al Consumidor y, en litigios transfronterizos, al Centro Europeo del Consumidor en España ([cec.consumo.gob.es](https://cec.consumo.gob.es)).',
            'Estas condiciones se rigen por la legislación española. Para los consumidores, los juzgados competentes son los de su domicilio.',
          ],
          en: [
            'Any question or complaint: **' + OWNER.email + '**. We aim to resolve it within one month. As a consumer you may also use the Spanish Consumer Arbitration System, municipal consumer offices and, for cross-border disputes, the European Consumer Centre in Spain ([cec.consumo.gob.es](https://cec.consumo.gob.es)).',
            'These terms are governed by Spanish law. For consumers, the competent courts are those of their place of residence.',
          ],
        },
      },
    ],
  },

  /* ───────────────────────────── REEMBOLSOS ───────────────────────────── */
  {
    slug: 'reembolsos',
    title: { es: 'Política de reembolsos', en: 'Refund policy' },
    short: { es: 'Sin devoluciones; los fallos se compensan', en: 'No refunds; faults are compensated' },
    intro: {
      es: 'Aplicable a los planes Friend y Signet y a los códigos regalo. Está redactada conforme al Real Decreto Legislativo 1/2007 (Ley General para la Defensa de los Consumidores y Usuarios) y a la Directiva (UE) 2019/770 sobre contenidos y servicios digitales.',
      en: 'Applies to the Friend and Signet plans and to gift codes. Drafted in accordance with Spanish Royal Legislative Decree 1/2007 (General Law for the Protection of Consumers and Users) and Directive (EU) 2019/770 on digital content and services.',
    },
    sections: [
      {
        h: { es: 'En una frase', en: 'In one sentence' },
        p: {
          es: ['Los planes no se devuelven una vez activados, porque el servicio empieza al instante y tú lo has pedido así expresamente; si algo falla por nuestra parte, lo arreglamos, te reponemos el tiempo o te damos crédito de uso, y solo si no pudiéramos hacerlo tendrías derecho a una rebaja o a la devolución que marca la ley.'],
          en: ['Plans are not refundable once activated, because the service starts immediately and you expressly asked for that; if something fails on our side, we fix it, restore your time or give you usage credit, and only if we could not would you be entitled to the price reduction or refund the law provides.'],
        },
      },
      {
        h: { es: 'Derecho de desistimiento y renuncia expresa', en: 'Right of withdrawal and express waiver' },
        p: {
          es: [
            'Como consumidor, la ley te reconoce 14 días para desistir de una compra a distancia. **Ese derecho no se aplica a los servicios digitales cuya ejecución ha comenzado con tu consentimiento expreso y tu reconocimiento de que pierdes el derecho de desistimiento** (art. 103.a y 103.m TRLGDCU; art. 16 de la Directiva 2011/83/UE).',
            'Por eso, antes de pagar te mostramos una casilla que debes marcar: «Solicito que el plan se active inmediatamente y entiendo que, al hacerlo, pierdo el derecho de desistimiento de 14 días». Guardamos la fecha, la versión del texto y la IP de esa confirmación. Sin marcarla no se puede completar la compra.',
            'En consecuencia, **no se aceptan devoluciones** por cambio de opinión, por no haber usado el plan, por haber elegido un plan distinto al deseado, ni por el cupo de uso no consumido al terminar los 30 días.',
          ],
          en: [
            'As a consumer, the law gives you 14 days to withdraw from a distance purchase. **That right does not apply to digital services whose performance has begun with your express consent and your acknowledgement that you lose the right of withdrawal** (art. 103.a and 103.m TRLGDCU; art. 16 of Directive 2011/83/EU).',
            'That is why, before paying, we show a box you must tick: “I request that the plan be activated immediately and understand that by doing so I lose the 14-day right of withdrawal”. We record the date, the text version and the IP of that confirmation. The purchase cannot be completed without it.',
            'Consequently, **no refunds are accepted** for change of mind, for not having used the plan, for having chosen a different plan than intended, or for usage allowance left over at the end of the 30 days.',
          ],
        },
      },
      {
        h: { es: 'Si algo falla: garantía de conformidad', en: 'If something goes wrong: conformity guarantee' },
        p: {
          es: [
            'Tienes derecho a que el servicio funcione como se describe. Si un plan no se activa, se activa con un nivel distinto al pagado, o una función incluida deja de estar disponible por causa nuestra durante un tiempo significativo, escríbenos a ' + OWNER.supportEmail + ' y lo resolveremos, en este orden y sin coste:',
            '- **Puesta en conformidad:** corregimos el problema o activamos el plan correcto.',
            '- **Reposición:** ampliamos la duración de tu plan por el tiempo afectado, o te lo sustituimos por un periodo nuevo completo.',
            '- **Crédito de uso:** te añadimos cupo de uso equivalente en tu cuenta.',
            'Estas soluciones se aplican dentro de la aplicación, en un plazo razonable y sin inconvenientes mayores para ti. **Solo si no fuera posible ponerlo en conformidad, o no lo hiciéramos en un plazo razonable**, tendrías derecho a una reducción proporcional del precio o a resolver el contrato con la devolución correspondiente, tal y como establecen los artículos 119 ter y siguientes del TRLGDCU. No renunciamos a nada de lo que la ley te garantiza.',
          ],
          en: [
            'You are entitled to a service that works as described. If a plan does not activate, activates at a different tier than paid for, or an included feature becomes unavailable for a significant time due to us, write to ' + OWNER.supportEmail + ' and we will resolve it, in this order and at no cost:',
            '- **Bringing into conformity:** we fix the problem or activate the correct plan.',
            '- **Replacement:** we extend your plan by the affected time, or replace it with a full new period.',
            '- **Usage credit:** we add equivalent usage allowance to your account.',
            'These remedies are applied in-app, within a reasonable time and without significant inconvenience to you. **Only if conformity could not be restored, or we failed to do so within a reasonable time**, would you be entitled to a proportionate price reduction or to terminate the contract with the corresponding refund, as set out in articles 119 ter et seq. TRLGDCU. We do not waive anything the law guarantees you.',
          ],
        },
      },
      {
        h: { es: 'Casos concretos', en: 'Specific cases' },
        p: {
          es: [
            '- **Pago duplicado o cobro erróneo:** se devuelve íntegramente, sin preguntas.',
            '- **Códigos regalo:** no se devuelven una vez enviados; si el código no funciona, lo sustituimos por otro.',
            '- **Cuenta cerrada por incumplimiento grave de las Condiciones:** no procede devolución.',
            '- **Cambios sustanciales del servicio por nuestra parte** durante tu plan: podrás resolver el contrato con devolución proporcional del tiempo no disfrutado.',
            '- **Cancelación del servicio por nuestra parte:** devolución proporcional del tiempo no disfrutado.',
          ],
          en: [
            '- **Duplicate payment or wrong charge:** refunded in full, no questions asked.',
            '- **Gift codes:** not refundable once sent; if the code does not work, we replace it.',
            '- **Account closed for serious breach of the Terms:** no refund applies.',
            '- **Substantial changes to the service on our side** during your plan: you may terminate with a pro-rata refund of the unused time.',
            '- **Discontinuation of the service by us:** pro-rata refund of the unused time.',
          ],
        },
      },
      {
        h: { es: 'Cómo reclamar', en: 'How to claim' },
        p: {
          es: ['Escribe a ' + OWNER.supportEmail + ' desde el correo de tu cuenta, con la fecha del pago y una descripción del problema. Respondemos en un máximo de 5 días laborables y aplicamos la solución en la aplicación. Si no quedas conforme, tienes a tu disposición las vías de reclamación indicadas en las [Condiciones de uso](/legal/terminos).'],
          en: ['Write to ' + OWNER.supportEmail + ' from your account email, with the payment date and a description of the problem. We answer within 5 working days at most and apply the remedy in-app. If you are not satisfied, the complaint channels listed in the [Terms of use](/legal/terminos) are available to you.'],
        },
      },
    ],
  },
];

export const getLegalDoc = (slug: string) => LEGAL_DOCS.find(d => d.slug === slug);
