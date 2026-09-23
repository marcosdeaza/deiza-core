import { useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, KeyRound } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.png';
import { SketchCode, SketchLayers, SketchSearch, SketchLink, SketchChat } from '@/components/deiza/Sketch';

/* ── Two extra sketches specific to the docs ── */
const Wobble = ({ id }: { id: string }) => (
  <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
);
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const SketchKey = ({ className = '' }: { className?: string }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`sketch-svg ${className}`} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...stroke}>
        <circle className="sketch-path" cx="52" cy="60" r="18" />
        <circle className="sketch-path" style={{ animationDelay: '0.3s' }} cx="52" cy="60" r="6" />
        <path className="sketch-path" style={{ animationDelay: '0.5s' }} d="M70 60 h58 v14 h-10 v-8 h-8 v10 h-10 v-10" />
        <path className="sketch-path" style={{ animationDelay: '0.9s' }} d="M30 96 q30 10 60 0" opacity="0.4" />
      </g>
    </svg>
  );
};

const SketchTerminal = ({ className = '' }: { className?: string }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`sketch-svg ${className}`} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...stroke}>
        <rect className="sketch-path" x="28" y="30" width="104" height="66" rx="8" />
        <path className="sketch-path" style={{ animationDelay: '0.3s' }} d="M28 44 h104" opacity="0.5" />
        <path className="sketch-path" style={{ animationDelay: '0.5s' }} d="M42 60 l10 8 l-10 8" stroke="hsl(var(--primary))" strokeWidth={2} />
        <path className="sketch-path" style={{ animationDelay: '0.7s' }} d="M60 76 h30" />
        <rect className="sketch-blink" x="94" y="70" width="6" height="10" fill="hsl(var(--primary))" stroke="none" />
      </g>
    </svg>
  );
};

/* ── Code block with copy ── */
const Code = ({ code, lang = 'bash' }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-3 rounded-2xl overflow-hidden border border-border/30 bg-[hsl(var(--background))]/70">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20">
        <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground hover:text-primary transition-colors focus-ring rounded px-1.5 py-0.5"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'OK' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed font-mono text-foreground/85 whitespace-pre" style={{ contain: 'inline-size' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

const Section = ({ id, title, kicker, art, children }: { id: string; title: string; kicker?: string; art?: React.ReactNode; children: React.ReactNode }) => (
  <motion.section
    id={id}
    className="scroll-mt-24 mt-14 first:mt-8"
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
  >
    <div className="flex items-start gap-5">
      {art && <div className="hidden sm:block w-28 shrink-0 text-foreground/75 -mt-3">{art}</div>}
      <div className="flex-1 min-w-0">
        {kicker && <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">{kicker}</p>}
        <h2 className="font-display text-2xl sm:text-3xl tracking-tight text-foreground">{title}</h2>
        <div className="mt-3 font-body text-[15px] leading-[1.8] text-foreground/85 space-y-3 [&_p]:m-0">{children}</div>
      </div>
    </div>
  </motion.section>
);

const BASE = 'https://deiza.org/api/code';

/** /docs — Deiza API documentation, hand-drawn and to the point. */
const Docs = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const es = language === 'es';
  useEffect(() => { document.body.style.overflow = ''; window.scrollTo(0, 0); }, []);

  const toc = es
    ? [['intro', 'Introducción'], ['auth', 'Autenticación'], ['models', 'Modelos'], ['chat', 'Chat'], ['stream', 'Streaming'], ['usage', 'Uso y límites'], ['errors', 'Errores'], ['clients', 'Clientes']]
    : [['intro', 'Introduction'], ['auth', 'Authentication'], ['models', 'Models'], ['chat', 'Chat'], ['stream', 'Streaming'], ['usage', 'Usage & limits'], ['errors', 'Errors'], ['clients', 'Clients']];

  const curl = `curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer $DEIZA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deiza-liquid-5",
    "messages": [
      {"role": "system", "content": "${es ? 'Responde en español, breve y directo.' : 'Answer briefly and directly.'}"},
      {"role": "user", "content": "${es ? '¿Qué es un transformer? En tres frases.' : 'What is a transformer? Three sentences.'}"}
    ]
  }'`;

  const py = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE}",
    api_key="TU_API_KEY",   # ${es ? 'Ajustes → Claves de API' : 'Settings → API keys'}
)

resp = client.chat.completions.create(
    model="deiza-liquid-5",
    messages=[{"role": "user", "content": "${es ? 'Resume la teoría de la relatividad en 5 líneas.' : 'Summarise relativity in 5 lines.'}"}],
)
print(resp.choices[0].message.content)`;

  const js = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${BASE}",
  apiKey: process.env.DEIZA_API_KEY,
});

const stream = await client.chat.completions.create({
  model: "deiza-liquid-5",
  stream: true,
  messages: [{ role: "user", content: "${es ? 'Dame 3 ideas de nombre para una cafetería.' : 'Give me 3 name ideas for a café.'}" }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;

  const sse = `data: {"id":"chatcmpl-1757600000","object":"chat.completion.chunk","model":"deiza-liquid-5",
       "choices":[{"index":0,"delta":{"content":"Un transformer "},"finish_reason":null}]}

data: {"id":"chatcmpl-1757600000","object":"chat.completion.chunk","model":"deiza-liquid-5",
       "choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]`;

  const usage = `curl ${BASE}/usage -H "Authorization: Bearer $DEIZA_API_KEY"

{
  "plan": "friend",
  "tokens_used": 12480,
  "token_limit": 100000,
  "tokens_remaining": 87520,
  "next_reset": "2026-09-11T20:00:00",
  "exhausted": false
}`;

  const models = [
    ['deiza-liquid-5', 'Liquid 5', es ? 'Equilibrado y agéntico, con búsqueda web. El modelo por defecto.' : 'Balanced and agentic, with web search. The default.', es ? 'Todos' : 'All'],
    ['deiza-gas-4.1', 'Gas 4.5', es ? 'Respuestas instantáneas para tareas ligeras.' : 'Instant answers for light tasks.', es ? 'Todos' : 'All'],
    ['deiza-solid-4.5', 'Solid 4.6', es ? 'Razonamiento profundo para análisis complejos.' : 'Deep reasoning for complex analysis.', 'Friend · Signet'],
    ['deiza-liquid-4.5', 'Liquid 4.5', es ? 'Generación anterior de Liquid.' : 'Previous Liquid generation.', es ? 'Todos' : 'All'],
  ];

  const errors = [
    ['401', es ? 'Clave ausente o inválida.' : 'Missing or invalid key.'],
    ['403 plan_required', es ? 'El modelo requiere un plan superior (p. ej. Solid en Free).' : 'The model needs a higher plan (e.g. Solid on Free).'],
    ['429 model_sublimit', es ? 'Sublímite de ese modelo alcanzado en la ventana actual.' : 'Per-model sub-limit reached in the current window.'],
    ['429 usage_limit', es ? 'Tokens del plan agotados hasta el siguiente reinicio.' : 'Plan tokens exhausted until the next reset.'],
    ['503', es ? 'Deiza no disponible temporalmente; reintenta con backoff.' : 'Deiza temporarily unavailable; retry with backoff.'],
  ];

  return (
    <div className="min-h-dvh bg-background">
      <AmbientRose />
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background/85 backdrop-blur-xl border-b border-border/20">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors focus-ring" aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <button onClick={() => navigate(isAuthenticated ? '/workspace' : '/')} className="flex items-center gap-2 focus-ring rounded-lg">
          <img src={logo} alt="" className="w-7 h-7 blend-multiply" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </button>
        <span className="ml-1 font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">API</span>
        <div className="ml-auto hidden md:flex items-center gap-1">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="font-body text-[12px] text-muted-foreground/70 hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">{label}</a>
          ))}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 pb-24">
        <motion.div className="mt-8 sm:mt-12" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-3">{es ? 'Documentación' : 'Documentation'}</p>
          <h1 className="font-display text-[34px] sm:text-5xl leading-[1.05] tracking-tight text-foreground max-w-2xl">
            {es ? 'La API de Deiza, explicada a mano.' : 'The Deiza API, explained by hand.'}
          </h1>
          <p className="font-body text-[15px] sm:text-base text-muted-foreground mt-4 max-w-xl leading-relaxed">
            {es
              ? 'Compatible con el formato de OpenAI: si ya has usado un SDK de chat, ya sabes usar Deiza. Un endpoint, tu clave y los modelos Gas, Liquid y Solid desde tu propio código.'
              : 'OpenAI-compatible: if you have used a chat SDK before, you already know how to use Deiza. One endpoint, your key, and the Gas, Liquid and Solid models from your own code.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={() => navigate(isAuthenticated ? '/settings' : '/login')} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring">
              <KeyRound className="w-4 h-4" /> {es ? 'Crear mi clave' : 'Create my key'}
            </button>
            <a href="#chat" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-sm font-medium transition focus-ring">
              {es ? 'Ir al ejemplo' : 'Jump to the example'}
            </a>
          </div>
        </motion.div>

        <Section id="intro" kicker={es ? 'Cómo funciona' : 'How it works'} title={es ? 'Un endpoint, tu cuenta' : 'One endpoint, your account'} art={<SketchLayers />}>
          <p>{es
            ? 'Todo pasa por https://deiza.org/api/code. Cada petición se autentica con una clave ligada a tu cuenta y consume tokens de tu plan, igual que una conversación en el chat. No hay tarjeta aparte ni facturación separada: la API es tu plan Deiza desde fuera de la interfaz.'
            : 'Everything goes through https://deiza.org/api/code. Each request is authenticated with a key tied to your account and spends tokens from your plan, exactly like a chat conversation. No separate card or billing: the API is your Deiza plan outside the interface.'}</p>
          <p>{es
            ? 'Los modelos que ves en el composer (Gas 4.5, Liquid 5, Solid 4.6) son los mismos que respondes aquí, con la misma búsqueda web integrada y el mismo respaldo por cadena.'
            : 'The models you see in the composer (Gas 4.5, Liquid 5, Solid 4.6) are the same ones answering here, with the same built-in web search and chain fallback.'}</p>
        </Section>

        <Section id="auth" kicker={es ? 'Paso 1' : 'Step 1'} title={es ? 'Autenticación' : 'Authentication'} art={<SketchKey />}>
          <p>{es
            ? 'Crea una clave en Ajustes → Claves de API. Se muestra una sola vez: guárdala en una variable de entorno, nunca en el código ni en el navegador.'
            : 'Create a key in Settings → API keys. It is shown once: keep it in an environment variable, never in code or in the browser.'}</p>
          <Code lang="http" code={`Authorization: Bearer pm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n# ${es ? 'o, si lo prefieres' : 'or, if you prefer'}\nX-Api-Key: pm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
          <p className="text-muted-foreground text-[14px]">{es ? 'Puedes revocar una clave en cualquier momento desde Ajustes; las peticiones con esa clave pasan a devolver 401 al instante.' : 'You can revoke a key any time from Settings; requests with that key return 401 immediately.'}</p>
        </Section>

        <Section id="models" kicker={es ? 'Paso 2' : 'Step 2'} title={es ? 'Modelos' : 'Models'} art={<SketchSearch />}>
          <div className="overflow-x-auto rounded-2xl border border-border/30" style={{ contain: 'inline-size' }}>
            <table className="w-full text-[13.5px] font-body">
              <thead>
                <tr className="bg-muted/30 text-left">
                  <th className="px-3 py-2 font-semibold">model</th>
                  <th className="px-3 py-2 font-semibold">{es ? 'Nombre' : 'Name'}</th>
                  <th className="px-3 py-2 font-semibold">{es ? 'Para qué' : 'Best for'}</th>
                  <th className="px-3 py-2 font-semibold">{es ? 'Planes' : 'Plans'}</th>
                </tr>
              </thead>
              <tbody>
                {models.map(([id, name, desc, plans]) => (
                  <tr key={id} className="border-t border-border/20 align-top">
                    <td className="px-3 py-2 font-mono text-[12.5px] text-primary whitespace-nowrap">{id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{name}</td>
                    <td className="px-3 py-2 text-foreground/80">{desc}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{plans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-[14px]">GET {BASE}/models {es ? 'devuelve esta lista en JSON.' : 'returns this list as JSON.'}</p>
        </Section>

        <Section id="chat" kicker={es ? 'Paso 3' : 'Step 3'} title={es ? 'Tu primera petición' : 'Your first request'} art={<SketchChat />}>
          <p>{es ? 'POST a /chat/completions con la lista de mensajes. El rol system es opcional y se añade a las instrucciones de Deiza.' : 'POST to /chat/completions with the message list. The system role is optional and is added to Deiza’s instructions.'}</p>
          <Code lang="curl" code={curl} />
          <p>{es ? 'Con el SDK de OpenAI en Python (solo cambia base_url y la clave):' : 'With the OpenAI SDK in Python (only base_url and the key change):'}</p>
          <Code lang="python" code={py} />
          <p>{es ? 'La respuesta sigue el formato estándar:' : 'The response follows the standard format:'}</p>
          <Code lang="json" code={`{
  "id": "chatcmpl-1757600000",
  "object": "chat.completion",
  "model": "deiza-liquid-5",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 18, "completion_tokens": 96, "total_tokens": 114 }
}`} />
        </Section>

        <Section id="stream" kicker={es ? 'Paso 4' : 'Step 4'} title="Streaming" art={<SketchTerminal />}>
          <p>{es ? 'Añade "stream": true y recibirás Server-Sent Events con fragmentos a medida que Deiza escribe. Ideal para interfaces propias.' : 'Add "stream": true and you receive Server-Sent Events with fragments as Deiza writes. Ideal for your own interfaces.'}</p>
          <Code lang="javascript" code={js} />
          <p>{es ? 'Cada evento es una línea data: con un chunk; el último lleva finish_reason "stop" y después llega data: [DONE].' : 'Each event is a data: line with a chunk; the last carries finish_reason "stop" and then data: [DONE] arrives.'}</p>
          <Code lang="sse" code={sse} />
        </Section>

        <Section id="usage" kicker={es ? 'Cuentas claras' : 'Clear accounting'} title={es ? 'Uso y límites' : 'Usage & limits'} art={<SketchLink />}>
          <p>{es
            ? 'Cada respuesta descuenta tokens ponderados de tu plan (Gas ×1, Liquid y Solid con multiplicador según plan), en la misma ventana de 4 horas que el chat. Consulta el estado en cualquier momento:'
            : 'Each answer deducts weighted tokens from your plan (Gas ×1, Liquid and Solid with a plan-dependent multiplier), in the same 4-hour window as the chat. Check the state at any time:'}</p>
          <Code lang="curl" code={usage} />
          <p className="text-muted-foreground text-[14px]">{es ? 'Límites orientativos por ventana: Free 20k · Friend 100k · Signet 300k tokens ponderados. Además hay un límite de 30 peticiones por minuto por cuenta.' : 'Indicative limits per window: Free 20k · Friend 100k · Signet 300k weighted tokens. There is also a limit of 30 requests per minute per account.'}</p>
        </Section>

        <Section id="errors" kicker={es ? 'Cuando algo falla' : 'When something fails'} title={es ? 'Errores' : 'Errors'} art={<SketchCode />}>
          <div className="overflow-x-auto rounded-2xl border border-border/30" style={{ contain: 'inline-size' }}>
            <table className="w-full text-[13.5px] font-body">
              <tbody>
                {errors.map(([code, desc]) => (
                  <tr key={code} className="border-t first:border-t-0 border-border/20 align-top">
                    <td className="px-3 py-2 font-mono text-[12.5px] text-primary whitespace-nowrap">{code}</td>
                    <td className="px-3 py-2 text-foreground/80">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{es ? 'Los errores llegan como JSON con el campo error. Ante 429 o 503, reintenta con espera exponencial (1 s, 2 s, 4 s).' : 'Errors arrive as JSON with an error field. On 429 or 503, retry with exponential backoff (1 s, 2 s, 4 s).'}</p>
        </Section>

        <Section id="clients" kicker={es ? 'En tus herramientas' : 'In your tools'} title={es ? 'Clientes compatibles' : 'Compatible clients'} art={<SketchTerminal />}>
          <p>{es
            ? 'Cualquier cliente compatible con el formato de OpenAI (Cursor, Continue, Open WebUI, LibreChat, tu propio agente…) funciona con Deiza cambiando solo la URL base, la clave y el modelo.'
            : 'Any OpenAI-format compatible client (Cursor, Continue, Open WebUI, LibreChat, your own agent…) works with Deiza by changing only the base URL, the key and the model.'}</p>
          <Code lang="env" code={`OPENAI_BASE_URL=${BASE}\nOPENAI_API_KEY=pm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nOPENAI_MODEL=deiza-liquid-5`} />
        </Section>

        <p className="mt-16 font-body text-[12px] text-muted-foreground/45 text-center">DeizaLab · API v1 · {new Date().getFullYear()}</p>
      </main>
    </div>
  );
};

export default Docs;
