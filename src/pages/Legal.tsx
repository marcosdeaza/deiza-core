import { useEffect, useId } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.png';
import { LEGAL_DOCS, LEGAL_VERSION, OWNER, getLegalDoc, type LegalSlug } from '@/data/legal';

/* ── Hand-drawn sketches in the Docs/News family, one per document ── */
const Wobble = ({ id }: { id: string }) => (
  <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="5" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
);
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Sketch = ({ kind }: { kind: LegalSlug }) => {
  const id = useId().replace(/:/g, '');
  const paths: Record<LegalSlug, JSX.Element> = {
    'aviso-legal': (
      <>
        <rect className="sketch-path" x="44" y="26" width="72" height="72" rx="6" />
        <path className="sketch-path" style={{ animationDelay: '0.3s' }} d="M58 46 h44 M58 60 h44 M58 74 h28" />
        <circle className="sketch-path" style={{ animationDelay: '0.6s' }} cx="104" cy="84" r="9" stroke="hsl(var(--primary))" />
      </>
    ),
    privacidad: (
      <>
        <path className="sketch-path" d="M80 22 l38 14 v28 c0 22 -18 36 -38 44 c-20 -8 -38 -22 -38 -44 v-28 z" />
        <path className="sketch-path" style={{ animationDelay: '0.4s' }} d="M64 62 l12 12 l22 -24" stroke="hsl(var(--primary))" strokeWidth={2} />
      </>
    ),
    cookies: (
      <>
        <path className="sketch-path" d="M80 26 a34 34 0 1 0 34 34 a12 12 0 0 1 -14 -14 a12 12 0 0 1 -20 -20 z" />
        <circle className="sketch-path" style={{ animationDelay: '0.4s' }} cx="66" cy="58" r="3" fill="currentColor" />
        <circle className="sketch-path" style={{ animationDelay: '0.5s' }} cx="82" cy="76" r="3" fill="currentColor" />
        <circle className="sketch-path" style={{ animationDelay: '0.6s' }} cx="64" cy="80" r="2.5" fill="hsl(var(--primary))" stroke="none" />
      </>
    ),
    terminos: (
      <>
        <path className="sketch-path" d="M50 30 h44 l18 18 v50 h-62 z" />
        <path className="sketch-path" style={{ animationDelay: '0.3s' }} d="M94 30 v18 h18" />
        <path className="sketch-path" style={{ animationDelay: '0.5s' }} d="M62 62 h38 M62 74 h38 M62 86 h22" />
        <path className="sketch-path" style={{ animationDelay: '0.8s' }} d="M40 100 q40 10 80 0" opacity="0.4" stroke="hsl(var(--primary))" />
      </>
    ),
    reembolsos: (
      <>
        {/* Clean circular return arrow */}
        <path className="sketch-path" d="M80 32 A32 32 0 1 1 54 44" />
        <path className="sketch-path" style={{ animationDelay: '0.3s' }} d="M48 34 L54 44 L64 40" />
        {/* Elegant Euro symbol in center */}
        <path className="sketch-path" style={{ animationDelay: '0.6s' }} d="M92 48 A16 16 0 1 0 92 72 M68 56 H88 M68 64 H84" stroke="hsl(var(--primary))" strokeWidth={2} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 160 120" className="sketch-svg w-28 h-20 sm:w-36 sm:h-28 text-foreground/70" aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...stroke}>{paths[kind]}</g>
    </svg>
  );
};

/* ── Tiny inline markup: **bold**, [text](url), "- " lists ── */
const Inline = ({ text }: { text: string }) => {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**')) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          const internal = m[2].startsWith('/');
          return internal
            ? <Link key={i} to={m[2]} className="text-primary underline underline-offset-[3px] decoration-primary/40 hover:decoration-primary transition-colors">{m[1]}</Link>
            : <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-[3px] decoration-primary/40 hover:decoration-primary transition-colors">{m[1]}</a>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
};

const Paragraphs = ({ items }: { items: string[] }) => {
  const out: JSX.Element[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`l${out.length}`} className="my-3 space-y-2 pl-1">
          {list.map((li, i) => (
            <li key={i} className="flex gap-3 font-body text-[15px] leading-relaxed text-foreground/85">
              <span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
              <span><Inline text={li} /></span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  items.forEach((p, i) => {
    if (p.startsWith('- ')) { list.push(p.slice(2)); return; }
    flush();
    out.push(<p key={`p${i}`} className="font-body text-[15px] leading-relaxed text-foreground/85 my-3"><Inline text={p} /></p>);
  });
  flush();
  return <>{out}</>;
};

/** /legal/:doc — the five legal documents, hand-drawn like the rest of Deiza. */
const Legal = () => {
  const navigate = useNavigate();
  const { doc: slugParam } = useParams();
  const { language, t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const es = language === 'es';
  const lang = es ? 'es' : 'en';
  const slug = (LEGAL_DOCS.some(d => d.slug === slugParam) ? slugParam : 'aviso-legal') as LegalSlug;
  const doc = getLegalDoc(slug)!;

  useEffect(() => { document.body.style.overflow = ''; window.scrollTo(0, 0); }, [slug]);
  useEffect(() => { document.title = `${doc.title[lang]} · Deiza`; return () => { document.title = 'Deiza'; }; }, [doc, lang]);

  const updated = new Date(LEGAL_VERSION).toLocaleDateString(es ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-dvh bg-background">
      <AmbientRose />
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background/85 backdrop-blur-xl border-b border-border/20">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors focus-ring" aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <button onClick={() => navigate(isAuthenticated ? '/workspace' : '/')} className="flex items-center gap-2 focus-ring rounded-lg">
          <img src={logo} alt="" className="w-7 h-7 blend-multiply" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </button>
        <span className="ml-1 font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">Legal</span>
      </header>

      {/* Document switcher: chips, scrollable on phones */}
      <nav className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 mt-6" aria-label={es ? 'Documentos legales' : 'Legal documents'}>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
          {LEGAL_DOCS.map(d => (
            <Link key={d.slug} to={`/legal/${d.slug}`}
              className={`shrink-0 font-body text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors focus-ring ${d.slug === slug ? 'bg-foreground text-background border-foreground' : 'border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
              aria-current={d.slug === slug ? 'page' : undefined}>
              {d.title[lang]}
            </Link>
          ))}
        </div>
      </nav>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 pb-24">
        <motion.div key={slug} className="mt-8 sm:mt-10 flex items-start gap-5 sm:gap-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex-1 min-w-0">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-3">{doc.short[lang]}</p>
            <h1 className="font-display text-[32px] sm:text-5xl leading-[1.05] tracking-tight text-foreground">{doc.title[lang]}</h1>
            <p className="font-body text-[15px] text-muted-foreground mt-4 leading-relaxed max-w-xl"><Inline text={doc.intro[lang]} /></p>
            <p className="font-body text-[12px] text-muted-foreground/60 mt-3">{es ? 'Última actualización' : 'Last updated'}: {updated}</p>
          </div>
          <div className="hidden sm:block shrink-0 pt-2"><Sketch kind={slug} /></div>
        </motion.div>

        <div className="mt-10 space-y-9">
          {doc.sections.map((s, i) => (
            <section key={i} id={`s${i + 1}`} className="scroll-mt-20">
              <h2 className="font-display text-[22px] sm:text-2xl tracking-tight text-foreground flex items-baseline gap-3">
                <span className="font-body text-[11px] text-muted-foreground/50 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                {s.h[lang]}
              </h2>
              <div className="mt-1 pl-0 sm:pl-8 border-l-0 sm:border-l border-border/25 sm:ml-1">
                <Paragraphs items={s.p[lang]} />
              </div>
            </section>
          ))}
        </div>

        {/* Self-service rights: the two things RGPD asks us to make easy */}
        {slug === 'privacidad' && (
          <div className="mt-12 rounded-2xl bg-card/70 deiza-border p-5 sm:p-6">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">{es ? 'Tus datos, en tus manos' : 'Your data, in your hands'}</p>
            <p className="font-body text-[14.5px] text-foreground/85 leading-relaxed">
              {es ? 'Desde Ajustes puedes descargar todo lo que guardamos sobre ti o eliminar tu cuenta y sus datos sin pedir permiso a nadie.' : 'From Settings you can download everything we hold about you or delete your account and its data without asking anyone.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => navigate(isAuthenticated ? '/settings#datos' : '/login')} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring">
                <Download className="w-4 h-4" /> {es ? 'Descargar mis datos' : 'Download my data'}
              </button>
              <button onClick={() => navigate(isAuthenticated ? '/settings#datos' : '/login')} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-sm font-medium transition focus-ring">
                <Trash2 className="w-4 h-4" /> {es ? 'Eliminar mi cuenta' : 'Delete my account'}
              </button>
            </div>
          </div>
        )}

        <footer className="mt-14 pt-6 border-t border-border/20 flex flex-wrap items-center gap-x-4 gap-y-2">
          {LEGAL_DOCS.filter(d => d.slug !== slug).map(d => (
            <Link key={d.slug} to={`/legal/${d.slug}`} className="font-body text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">{d.title[lang]}</Link>
          ))}
          <span className="ml-auto font-body text-[12px] text-muted-foreground/50">{OWNER.legalName} · {OWNER.email}</span>
        </footer>
      </main>
    </div>
  );
};

export default Legal;
