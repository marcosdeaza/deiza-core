import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.png';
import { NEWS, type NewsArt } from '@/data/news';
import {
  SketchDrop, SketchRose, SketchLayers, SketchCode, SketchImage, SketchSearch, SketchEye, SketchLink, SketchChat,
} from '@/components/deiza/Sketch';

const ART: Record<NewsArt, (p: { className?: string; delay?: number }) => JSX.Element> = {
  drop: SketchDrop, rose: SketchRose, layers: SketchLayers, code: SketchCode, image: SketchImage,
  search: SketchSearch, eye: SketchEye, link: SketchLink, chat: SketchChat,
};

const fmtDate = (iso: string, lang: string) => {
  const d = new Date(iso + 'T12:00:00');
  try {
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
};

/** /noticias — Deiza's announcements, editorial and hand-drawn. */
const News = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { language, t } = useLanguage();
  const es = language === 'es';
  const L = es ? 'es' : 'en';
  const [openId, setOpenId] = useState<string | null>(() => params.get('post') || NEWS[0]?.id || null);

  // A modal elsewhere may have left body overflow locked — this page must scroll.
  useEffect(() => { document.body.style.overflow = ''; window.scrollTo(0, 0); }, []);

  const items = useMemo(() => [...NEWS].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : Number(!!a.upcoming) - Number(!!b.upcoming))), []);
  const featured = items.find(n => n.id === 'liquid-5') || items[0];

  return (
    <div className="min-h-dvh bg-background">
      <AmbientRose />

      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background/85 backdrop-blur-xl border-b border-border/20">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors focus-ring" aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <button onClick={() => navigate('/workspace')} className="flex items-center gap-2 focus-ring rounded-lg">
          <img src={logo} alt="" className="w-7 h-7 blend-multiply" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </button>
        <span className="ml-1 font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">{t('nav.news')}</span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 pb-20">
        {/* Hero */}
        <motion.section
          className="mt-8 sm:mt-12"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-3">
            {es ? 'Novedades de Deiza' : 'What’s new in Deiza'}
          </p>
          <h1 className="font-display text-[34px] sm:text-5xl leading-[1.05] tracking-tight text-foreground max-w-2xl">
            {es ? 'Lo que hemos construido, contado despacio.' : 'What we have built, told slowly.'}
          </h1>
          <p className="font-body text-[15px] sm:text-base text-muted-foreground mt-4 max-w-xl leading-relaxed">
            {es
              ? 'Modelos, arquitectura y decisiones de producto desde el primer DZ-4F hasta Liquid 5.'
              : 'Models, architecture and product decisions from the first DZ-4F to Liquid 5.'}
          </p>
          <div className="mt-8 rounded-[28px] overflow-hidden border border-border/30 deiza-shadow-lg bg-card">
            <img src="/art/news-hero.webp" alt="" className="w-full aspect-[16/9] object-cover" loading="eager" />
          </div>
        </motion.section>

        {/* Timeline */}
        <section className="mt-12 sm:mt-16 relative">
          <div className="absolute left-[7px] sm:left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-border/60 via-border/30 to-transparent" aria-hidden="true" />
          <ul className="space-y-3">
            {items.map((n, i) => {
              const Art = ART[n.art];
              const open = openId === n.id;
              return (
                <motion.li
                  key={n.id}
                  className="relative pl-8 sm:pl-10"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.2), ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className={`absolute left-0 sm:left-0.5 top-6 w-[15px] h-[15px] rounded-full border-2 ${n.id === featured.id ? 'bg-primary border-primary' : n.upcoming ? 'bg-background border-dashed border-border' : 'bg-background border-border'}`} aria-hidden="true" />
                  <article className={`rounded-[22px] border transition-colors ${open ? 'border-border/50 bg-card/80' : 'border-border/25 bg-card/40 hover:bg-card/70'}`}>
                    <button
                      onClick={() => setOpenId(open ? null : n.id)}
                      className="w-full text-left p-4 sm:p-5 flex gap-4 focus-ring rounded-[22px]"
                      aria-expanded={open}
                    >
                      <div className="hidden sm:block w-28 shrink-0 text-foreground/80">
                        <Art className="w-full h-auto" delay={0.1} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-body text-[10px] font-semibold uppercase tracking-[0.14em] ${n.upcoming ? 'text-amber-400/90' : 'text-primary/80'}`}>{n.tag[L]}</span>
                          <span className="text-border/60">·</span>
                          <time className="font-body text-[11px] text-muted-foreground/60" dateTime={n.date}>{fmtDate(n.date, L)}</time>
                        </div>
                        <h2 className="font-display text-xl sm:text-[22px] leading-snug tracking-tight text-foreground mt-1.5">{n.title[L]}</h2>
                        <p className="font-body text-[14px] text-muted-foreground leading-relaxed mt-1.5">{n.excerpt[L]}</p>
                      </div>
                      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="shrink-0 mt-1 text-muted-foreground/50" aria-hidden="true">
                        <ChevronDown className="w-4 h-4" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key="body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 sm:px-5 pb-5">
                            {n.hero && (
                              <div className="rounded-2xl overflow-hidden border border-border/30 mb-5">
                                <img src={n.hero} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" />
                              </div>
                            )}
                            <div className="sm:hidden w-24 text-foreground/80 mb-3">
                              <Art className="w-full h-auto" />
                            </div>
                            <div className="prose-deiza font-body text-[15px] leading-[1.8] max-w-prose">
                              {n.body[L].map((p, k) => <p key={k}>{p}</p>)}
                            </div>
                            {n.id === 'liquid-5' && (
                              <button
                                onClick={() => navigate('/workspace?model=liquid')}
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring"
                              >
                                {es ? 'Probar Liquid 5' : 'Try Liquid 5'}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </article>
                </motion.li>
              );
            })}
          </ul>
        </section>

        <p className="mt-14 font-body text-[12px] text-muted-foreground/45 text-center">
          DeizaLab · {es ? 'Valencia' : 'Valencia'} · {new Date().getFullYear()}
        </p>
      </main>
    </div>
  );
};

export default News;
