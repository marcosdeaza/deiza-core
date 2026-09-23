import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, Maximize2, X, ArrowRight, Pencil } from 'lucide-react';
import { useEntryAnimation } from '@/lib/entryAnimation';
import { useLanguage } from '@/contexts/LanguageContext';
import { isNative, saveOrShareUrl, haptic } from '@/lib/native';

/* ────────────────────────────────────────────────────────────────────────────
 * Inline media for the chat thread: slide-deck viewer (.pptx previews), generated
 * video, and decision questions with options. Kept apart from ChatMessage so that
 * file stays about markdown rendering.
 * ──────────────────────────────────────────────────────────────────────────── */

export type DeckArtifact = { name: string; type: string; url?: string; slides?: string[]; title?: string; theme?: string };

/** Slide-by-slide viewer for a compiled PowerPoint. `slides` are PNG URLs rendered on
 * the server from the same plan as the .pptx, so what you see is what you download. */
export const SlideDeckCard = ({ artifact }: { artifact: DeckArtifact; language?: string }) => {
  const { t } = useLanguage();
  const enter = useEntryAnimation();
  const [loadedSlide, setLoadedSlide] = useState<string | null>(null);
  const slides = artifact.slides || [];
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const total = slides.length;

  const go = useCallback((d: number) => { haptic('selection'); setIdx(i => Math.min(total - 1, Math.max(0, i + d))); }, [total]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [full, go]);

  if (!total) return null;
  const label = artifact.title || artifact.name.replace(/\.pptx$/i, '');

  const frame = (big: boolean) => (
    <div className={`relative bg-black/40 ${big ? 'w-full' : 'rounded-t-2xl'} overflow-hidden select-none`} style={{ aspectRatio: '16 / 9' }}>
      <AnimatePresence initial={false} mode="wait">
        <motion.img
          key={slides[idx]}
          src={slides[idx]}
          alt={`${label} — ${idx + 1}/${total}`}
          className="absolute inset-0 w-full h-full object-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: loadedSlide === slides[idx] ? 1 : 0 }}
          exit={{ opacity: 0.4 }}
          transition={{ duration: 0.18 }}
          onLoad={() => setLoadedSlide(slides[idx])}
          onError={() => setLoadedSlide(slides[idx])}
          draggable={false}
        />
      </AnimatePresence>
      {total > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); go(-1); }} disabled={idx === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm disabled:opacity-25 hover:bg-black/65 transition-colors focus-ring"
            aria-label={t('im.prev')}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={e => { e.stopPropagation(); go(1); }} disabled={idx === total - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm disabled:opacity-25 hover:bg-black/65 transition-colors focus-ring"
            aria-label={t('im.next')}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
      <span className="absolute bottom-2 right-3 px-2 py-0.5 rounded-full bg-black/50 text-white text-[11px] font-body tabular-nums backdrop-blur-sm">
        {idx + 1} / {total}
      </span>
    </div>
  );

  return (
    <motion.div className="mt-5 max-w-2xl" initial={enter ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="rounded-2xl overflow-hidden bg-card deiza-border deiza-shadow">
        <div className="cursor-zoom-in" onClick={() => setFull(true)} role="button" aria-label={t('im.fullscreen')}>
          {frame(false)}
        </div>
        {/* thumbnails */}
        {total > 1 && (
          <div className="flex gap-1.5 px-3 pt-3 overflow-x-auto scrollbar-hide">
            {slides.map((s, i) => (
              <button key={s} onClick={() => setIdx(i)}
                className={`shrink-0 w-16 rounded-md overflow-hidden border-2 transition-all ${i === idx ? 'border-primary opacity-100' : 'border-transparent opacity-55 hover:opacity-90'}`}
                style={{ aspectRatio: '16 / 9' }} aria-label={`${t('im.slide')} ${i + 1}`}>
                <img src={s} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm font-medium text-foreground truncate">{label}</p>
            <p className="font-body text-[11px] text-muted-foreground mt-0.5">
              {total} {t('im.slides')}{artifact.theme ? ` · ${artifact.theme}` : ''} · PowerPoint
            </p>
          </div>
          <button onClick={() => setFull(true)} className="p-2 rounded-full hover:bg-muted transition-colors focus-ring" aria-label={t('im.fullscreen')} title={t('im.fullscreen')}>
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          </button>
          {artifact.url && (
            <a href={artifact.url} download={artifact.name || 'presentacion.pptx'}
              onClick={e => { if (isNative()) { e.preventDefault(); haptic('light'); void saveOrShareUrl(artifact.url!, artifact.name || 'presentacion.pptx', label); } }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-[12px] font-body font-medium hover:bg-primary/90 transition-colors focus-ring">
              <Download className="w-3.5 h-3.5" />
              {t('im.download.pptx')}
            </a>
          )}
        </div>
      </div>

      <AnimatePresence>
        {full && typeof document !== 'undefined' && createPortal(
          <motion.div className="fixed inset-0 z-[150] bg-black/92 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFull(false)}>
            <button onClick={() => setFull(false)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-ring" aria-label={t('artifact.close')}>
              <X className="w-5 h-5" />
            </button>
            <div className="w-full max-w-6xl" onClick={e => e.stopPropagation()}>{frame(true)}</div>
            <p className="mt-4 text-white/70 text-sm font-body">{label}</p>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/** Generated clip (DZ-Motion). 16:9 or 9:16 depending on the request. */
export const VideoCard = ({ artifact }: { artifact: { name: string; url?: string; aspect?: string }; language?: string }) => {
  const { t } = useLanguage();
  const enter = useEntryAnimation();
  if (!artifact.url) return null;
  const vertical = artifact.aspect === '9:16';
  return (
    <motion.div className={`mt-4 relative group/vid ${vertical ? 'max-w-[300px]' : 'max-w-xl'} w-full`}
      initial={enter ? { opacity: 0, scale: 0.98 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
      <video src={artifact.url} controls playsInline preload="metadata"
        className="w-full rounded-2xl deiza-border deiza-shadow-lg bg-black" style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9' }} />
      <a href={artifact.url} download={artifact.name || 'video.mp4'}
        onClick={e => { if (isNative()) { e.preventDefault(); haptic('light'); void saveOrShareUrl(artifact.url!, artifact.name || 'video.mp4'); } }}
        className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-body opacity-80 sm:opacity-0 sm:group-hover/vid:opacity-100 transition-opacity focus-ring"
        aria-label={t('im.download.video')}>
        <Download className="w-3 h-3" aria-hidden="true" />
        {t('artifact.download')}
      </a>
    </motion.div>
  );
};

/* ── Decision questions ──────────────────────────────────────────────────── */
export type InlineQuestion = { q: string; options: string[]; other?: boolean };

const QUESTION_RE = /```question\s*\n([\s\S]*?)```/;

/** Pull the trailing ```question block out of a message. Returns the clean text and
 * the parsed questions (empty when there is no valid block). */
export function extractQuestions(content: string): { text: string; questions: InlineQuestion[] } {
  const m = content.match(QUESTION_RE);
  if (!m) return { text: content, questions: [] };
  let questions: InlineQuestion[] = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    const list = Array.isArray(parsed) ? parsed : (parsed.questions || (parsed.q ? [parsed] : []));
    questions = list
      .filter((x: any) => x && typeof x.q === 'string' && Array.isArray(x.options))
      .slice(0, 3)
      .map((x: any) => ({ q: x.q, options: x.options.map(String).filter(Boolean).slice(0, 6), other: x.other !== false }));
  } catch {
    questions = [];
  }
  return { text: content.replace(QUESTION_RE, '').trim(), questions };
}

/** Numbered options like a quick poll: pick one, write your own, or skip. With several
 * questions the answers are collected and sent together as one message. */
export const QuestionCard = ({ questions, onAnswer, disabled }:
  { questions: InlineQuestion[]; onAnswer: (text: string) => void; language?: string; disabled?: boolean }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [done, setDone] = useState(false);
  const total = questions.length;
  const q = questions[step];

  const finish = (all: string[]) => {
    const lines = questions.map((qq, i) => all[i] ? `${qq.q} ${all[i]}` : null).filter(Boolean);
    setDone(true);
    if (lines.length) onAnswer(total === 1 ? all[0] : lines.join('\n'));
  };
  const pick = (value: string) => {
    if (disabled || done) return;
    haptic('light');
    const next = [...answers]; next[step] = value;
    setAnswers(next); setOther('');
    if (step + 1 < total) setStep(step + 1); else finish(next);
  };
  const skip = () => pick('');

  if (!q || done) return null;
  return (
    <motion.div className="mt-4 max-w-xl rounded-2xl bg-card deiza-border deiza-shadow overflow-hidden"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <p className="flex-1 font-body text-[15px] font-medium text-foreground leading-snug">{q.q}</p>
        {total > 1 && (
          <div className="flex items-center gap-1 text-[11px] font-body text-muted-foreground shrink-0">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="p-1 rounded-full hover:bg-muted disabled:opacity-30 focus-ring" aria-label={t('im.prev')}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="tabular-nums">{step + 1} {t('im.of')} {total}</span>
            <button onClick={() => setStep(s => Math.min(total - 1, s + 1))} disabled={step === total - 1 || !answers[step]} className="p-1 rounded-full hover:bg-muted disabled:opacity-30 focus-ring" aria-label={t('im.next')}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="px-2 pb-2">
        {q.options.map((opt, i) => (
          <button key={opt} onClick={() => pick(opt)} disabled={disabled}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-body text-[14px] transition-colors focus-ring group/opt
              ${answers[step] === opt ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground/90'} disabled:opacity-50`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 border
              ${answers[step] === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border/50 text-muted-foreground group-hover/opt:border-foreground/40'}`}>
              {i + 1}
            </span>
            <span className="flex-1">{opt}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/opt:opacity-100 transition-opacity" />
          </button>
        ))}
        {q.other !== false && (
          <form className="flex items-center gap-2 px-3 py-2" onSubmit={e => { e.preventDefault(); if (other.trim()) pick(other.trim()); }}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input value={other} onChange={e => setOther(e.target.value)} disabled={disabled}
              placeholder={t('im.other')}
              className="flex-1 bg-transparent outline-none font-body text-[14px] text-foreground placeholder:text-muted-foreground/60 !text-[14px]" />
            {other.trim() ? (
              <button type="submit" className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-body focus-ring">{t('im.send')}</button>
            ) : (
              <button type="button" onClick={skip} disabled={disabled} className="px-3 py-1 rounded-full border border-border/50 text-[11px] font-body text-muted-foreground hover:bg-muted focus-ring">{t('im.skip')}</button>
            )}
          </form>
        )}
      </div>
    </motion.div>
  );
};
