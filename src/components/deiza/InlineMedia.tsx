import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, Maximize2, X, ArrowRight, Pencil, Check, CheckCircle2, XCircle, RotateCcw, Sparkles, BookOpen, Lightbulb, GraduationCap, Award, Trophy, HelpCircle } from 'lucide-react';
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


export type PdfArtifact = {
  name: string;
  type: string;
  url?: string;
  pages?: string[];
  slides?: string[];
  title?: string;
  pageCount?: number;
};

/** Editorial A4 document viewer for a compiled PDF deliverable.
 * Displays page previews with A4 vertical ratio, page flipping, fullscreen lightbox,
 * and one-click direct download button. */
export const PdfDocumentCard = ({ artifact }: { artifact: PdfArtifact; language?: string }) => {
  const { t } = useLanguage();
  const enter = useEntryAnimation();
  const pages = artifact.pages || artifact.slides || [];
  const [loadedPage, setLoadedPage] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const total = pages.length;

  const go = useCallback((d: number) => {
    haptic('selection');
    setIdx(i => Math.min(total - 1, Math.max(0, i + d)));
  }, [total]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [full, go]);

  const label = artifact.title || artifact.name.replace(/\.pdf$/i, '');
  const downloadUrl = artifact.url || (pages.length > 0 ? pages[0].replace(/_p\d+\.png$/, '.pdf') : undefined);
  const pageBadge = total > 0 ? `${idx + 1} / ${total}` : (artifact.pageCount ? `${artifact.pageCount} ${artifact.pageCount === 1 ? 'página' : 'páginas'}` : 'PDF');

  const frame = (big: boolean) => (
    <div
      className={`relative bg-neutral-950/80 ${big ? 'w-full max-h-[85vh]' : 'w-full rounded-t-2xl'} overflow-hidden select-none flex items-center justify-center`}
      style={{ aspectRatio: big ? undefined : '1 / 1.35', minHeight: big ? '70vh' : '360px', maxHeight: big ? '85vh' : '480px' }}
    >
      {pages.length > 0 ? (
        <AnimatePresence initial={false} mode="wait">
          <motion.img
            key={pages[idx]}
            src={pages[idx]}
            alt={`${label} — ${idx + 1}/${total}`}
            className="w-full h-full object-contain drop-shadow-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: loadedPage === pages[idx] ? 1 : 0 }}
            exit={{ opacity: 0.4 }}
            transition={{ duration: 0.18 }}
            onLoad={() => setLoadedPage(pages[idx])}
            onError={() => setLoadedPage(pages[idx])}
            draggable={false}
          />
        </AnimatePresence>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
          <span className="font-mono text-xs uppercase tracking-wider">Documento PDF</span>
          <span className="font-body text-sm font-medium text-foreground/80">{label}</span>
        </div>
      )}
      {total > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); go(-1); }}
            disabled={idx === 0}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm disabled:opacity-20 hover:bg-black/75 transition-colors focus-ring"
            aria-label={t('im.prev')}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1); }}
            disabled={idx === total - 1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm disabled:opacity-20 hover:bg-black/75 transition-colors focus-ring"
            aria-label={t('im.next')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
      <span className="absolute bottom-2.5 right-3 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-body tabular-nums backdrop-blur-sm shadow-sm">
        {pageBadge}
      </span>
    </div>
  );

  return (
    <motion.div
      className="mt-5 max-w-lg w-full"
      initial={enter ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="rounded-2xl overflow-hidden bg-card deiza-border deiza-shadow transition-shadow hover:shadow-md">
        <div className="cursor-zoom-in" onClick={() => setFull(true)} role="button" aria-label={t('im.fullscreen')}>
          {frame(false)}
        </div>
        {total > 1 && (
          <div className="flex gap-2 px-3 pt-3 overflow-x-auto scrollbar-hide border-t border-border/30 bg-muted/10">
            {pages.map((p, i) => (
              <button
                key={p}
                onClick={() => setIdx(i)}
                className={`shrink-0 w-12 rounded overflow-hidden border-2 transition-all ${i === idx ? 'border-primary opacity-100 shadow-sm' : 'border-transparent opacity-50 hover:opacity-90'}`}
                style={{ aspectRatio: '1 / 1.4' }}
                aria-label={`Página ${i + 1}`}
              >
                <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-t border-border/30">
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm font-semibold text-foreground truncate" title={label}>{label}</p>
            <p className="font-body text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
              <span>PDF · {total > 0 ? `${total} ${total === 1 ? 'página' : 'páginas'}` : (artifact.pageCount ? `${artifact.pageCount} págs.` : 'Entregable')}</span>
            </p>
          </div>
          <button
            onClick={() => setFull(true)}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
            aria-label={t('im.fullscreen')}
            title={t('im.fullscreen')}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={artifact.name || 'documento.pdf'}
              onClick={e => {
                if (isNative()) {
                  e.preventDefault();
                  haptic('light');
                  void saveOrShareUrl(downloadUrl, artifact.name || 'documento.pdf', label);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-[12px] font-body font-medium hover:bg-primary/90 transition-all focus-ring shadow-sm hover:shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('artifact.download') || 'Descargar PDF'}</span>
            </a>
          )}
        </div>
      </div>

      <AnimatePresence>
        {full && typeof document !== 'undefined' && createPortal(
          <motion.div
            className="fixed inset-0 z-[150] bg-black/94 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFull(false)}
          >
            <button
              onClick={() => setFull(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors focus-ring"
              aria-label={t('artifact.close')}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
              {frame(true)}
            </div>
            <div className="mt-4 flex items-center gap-4 text-white/80 text-sm font-body" onClick={e => e.stopPropagation()}>
              <span className="font-medium text-white">{label}</span>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={artifact.name || 'documento.pdf'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>{t('artifact.download') || 'Descargar PDF'}</span>
                </a>
              )}
            </div>
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

/* ── Decision questions & Interactive Quizzes ────────────────────────────── */
export type InlineQuestion = {
  q: string;
  options: string[];
  other?: boolean;
  answer?: number; // 0-based index of correct option
  explanation?: string;
};

export type QuizData = {
  title?: string;
  questions: InlineQuestion[];
  isQuiz?: boolean;
};

const QUIZ_BLOCK_RE = /```(?:quiz|test|question)\s*\n([\s\S]*?)```/i;

/** Fallback parser: detects markdown numbered questions (1. ... a) ... b) ...)
 * if the AI responded in text instead of an interactive block. */
function parseMarkdownQuizFallback(text: string): { text: string; title?: string; questions: InlineQuestion[] } | null {
  if (!text || text.length < 30) return null;
  // Look for numbered questions like "1. ¿...", "### 1. ...", "Pregunta 1: ..."
  const qSplit = text.split(/(?:^|\n)(?:###?\s*)?(?:Pregunta\s*)?([0-9]{1,2})[\.\)]\s+/i);
  if (qSplit.length < 5) return null; // Needs at least 2 questions (preamble, num1, body1, num2, body2)

  const preamble = qSplit[0].trim();
  const questions: InlineQuestion[] = [];

  for (let i = 1; i < qSplit.length; i += 2) {
    const body = qSplit[i + 1] || '';
    const optRegex = /(?:^|\n)\s*(?:[-*]\s*)?([a-dA-D1-4])[\.\)\-]\s+([^\n]+)/g;
    const optMatches = [...body.matchAll(optRegex)];
    if (optMatches.length >= 2) {
      const qText = body.substring(0, optMatches[0].index).trim();
      const options = optMatches.map(m => m[2].trim());

      let answer: number | undefined = undefined;
      const ansMatch = body.match(/(?:Respuesta(?:\s+correcta)?|Solución|Correcta?|Answer):\s*([a-dA-D1-4]|[^\n]+)/i);
      if (ansMatch) {
        const rawAns = ansMatch[1].trim();
        const letter = rawAns.match(/^[a-dA-D]/);
        if (letter) {
          answer = letter[0].toUpperCase().charCodeAt(0) - 65;
        } else if (!isNaN(Number(rawAns)) && Number(rawAns) >= 1 && Number(rawAns) <= options.length) {
          answer = Number(rawAns) - 1;
        } else {
          const matchIdx = options.findIndex(o => o.toLowerCase().includes(rawAns.toLowerCase()));
          if (matchIdx !== -1) answer = matchIdx;
        }
      }

      let explanation: string | undefined = undefined;
      const expMatch = body.match(/(?:Explicación|Justificación|Por qué|Explanation):\s*([^\n]+(?:\n[^\n]+)?)/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
      }

      if (qText && options.length >= 2) {
        questions.push({
          q: qText,
          options,
          answer: (answer !== undefined && answer >= 0 && answer < options.length) ? answer : undefined,
          explanation,
          other: false,
        });
      }
    }
  }

  if (questions.length >= 2) {
    let title: string | undefined = undefined;
    const titleMatch = preamble.match(/^(?:#+\s*|Test:\s*|Cuestionario:\s*)([^\n]+)$/m);
    if (titleMatch) title = titleMatch[1].trim();
    return { text: preamble, title, questions };
  }
  return null;
}

/** Pull any ```quiz, ```test or ```question block out of a message.
 * Falls back to auto-detecting numbered markdown questions (1. ... a) ... b) ...)
 * Returns the clean display text, title, questions array, and isQuiz flag. */
export function extractQuestions(content: string): {
  text: string;
  questions: InlineQuestion[];
  title?: string;
  isQuiz?: boolean;
} {
  if (!content) return { text: '', questions: [], isQuiz: false };

  // 1. Try matching code block: ```quiz, ```test, ```question
  const blockMatch = content.match(QUIZ_BLOCK_RE);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      const title = parsed.title || parsed.name || undefined;
      const rawList = Array.isArray(parsed) ? parsed : (parsed.questions || (parsed.q ? [parsed] : []));
      const questions: InlineQuestion[] = rawList
        .filter((x: any) => x && typeof x.q === 'string' && Array.isArray(x.options))
        .map((x: any) => {
          const options = x.options.map(String).filter(Boolean);
          let answer: number | undefined = undefined;
          const rawAns = x.answer !== undefined ? x.answer : (x.correct !== undefined ? x.correct : (x.correct_answer !== undefined ? x.correct_answer : x.solution));
          if (typeof rawAns === 'number' && rawAns >= 0 && rawAns < options.length) {
            answer = rawAns;
          } else if (typeof rawAns === 'string') {
            const trimmed = rawAns.trim();
            const letterMatch = trimmed.match(/^[A-Da-d]\b/);
            if (letterMatch) {
              const code = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
              if (code >= 0 && code < options.length) answer = code;
            } else if (!isNaN(Number(trimmed)) && Number(trimmed) >= 1 && Number(trimmed) <= options.length) {
              answer = Number(trimmed) - 1;
            } else {
              const matchIdx = options.findIndex((opt: string) => opt.toLowerCase() === trimmed.toLowerCase());
              if (matchIdx !== -1) answer = matchIdx;
            }
          }
          return {
            q: String(x.q).trim(),
            options,
            answer,
            explanation: typeof x.explanation === 'string' ? x.explanation.trim() : undefined,
            other: x.other !== false,
          };
        });

      if (questions.length > 0) {
        const text = content.replace(QUIZ_BLOCK_RE, '').trim();
        const isQuiz = questions.some(q => q.answer !== undefined) || /```(?:quiz|test)/i.test(content) || Boolean(parsed.title);
        return { text, questions, title, isQuiz };
      }
    } catch {
      // JSON parse error, fall through
    }
  }

  // 2. Fallback: Detect markdown questions formatted like:
  // 1. ¿Pregunta?
  // a) Opción A
  // b) Opción B
  const mdQuiz = parseMarkdownQuizFallback(content);
  if (mdQuiz && mdQuiz.questions.length >= 2) {
    return {
      text: mdQuiz.text,
      questions: mdQuiz.questions,
      title: mdQuiz.title,
      isQuiz: true,
    };
  }

  return { text: content, questions: [], isQuiz: false };
}

/** Numbered options like a quick poll: pick one, write your own, or skip. */
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

/** Interactive multi-question QuizCard with instant evaluation, didactic explanations,
 * progress tracking, scoring, and a one-click tutor analysis CTA with Deiza. */
export const QuizCard = ({
  title,
  questions,
  onAnswer,
  disabled
}: {
  title?: string;
  questions: InlineQuestion[];
  onAnswer?: (text: string) => void;
  language?: string;
  disabled?: boolean;
}) => {
  const { language } = useLanguage();
  const isEs = !language || language.startsWith('es');

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [sentToChat, setSentToChat] = useState(false);

  const total = questions.length;
  const currentQ = questions[currentStep];

  // Scoring
  const answeredCount = Object.keys(answers).length;
  const hasAnswers = questions.some(q => q.answer !== undefined);
  const correctCount = questions.reduce((acc, q, idx) => {
    if (q.answer !== undefined && answers[idx] === q.answer) return acc + 1;
    return acc;
  }, 0);
  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const handlePick = (optIdx: number) => {
    if (answers[currentStep] !== undefined || disabled) return;
    haptic('light');
    setAnswers(prev => ({ ...prev, [currentStep]: optIdx }));
  };

  const handleNext = () => {
    haptic('light');
    if (currentStep + 1 < total) {
      setCurrentStep(s => s + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handlePrev = () => {
    haptic('light');
    setCurrentStep(s => Math.max(0, s - 1));
  };

  const handleReset = () => {
    haptic('medium');
    setAnswers({});
    setCurrentStep(0);
    setIsFinished(false);
    setSentToChat(false);
  };

  const handleAnalyzeWithDeiza = () => {
    if (!onAnswer || sentToChat) return;
    haptic('medium');
    setSentToChat(true);

    const testTitle = title || (isEs ? 'Test de conocimientos' : 'Knowledge Quiz');

    let prompt = isEs
      ? `He completado el test "${testTitle}" con un resultado de ${correctCount} de ${total} (${scorePercent}% de aciertos).\n\n`
      : `I completed the quiz "${testTitle}" with a score of ${correctCount} out of ${total} (${scorePercent}%).\n\n`;

    const mistakes: string[] = [];
    questions.forEach((q, idx) => {
      const userPick = answers[idx];
      const userText = userPick !== undefined ? q.options[userPick] : (isEs ? 'No respondida' : 'Unanswered');
      if (q.answer !== undefined) {
        if (userPick !== q.answer) {
          const correctText = q.options[q.answer] || '';
          mistakes.push(`- Pregunta ${idx + 1}: "${q.q}"\n  • Mi respuesta: "${userText}"\n  • Respuesta correcta: "${correctText}"`);
        }
      } else {
        mistakes.push(`- Pregunta ${idx + 1}: "${q.q}" -> Respondí: "${userText}"`);
      }
    });

    if (mistakes.length > 0) {
      prompt += isEs ? `Fallos / respuestas a revisar:\n${mistakes.join('\n')}\n\n` : `Questions to review:\n${mistakes.join('\n')}\n\n`;
      prompt += isEs
        ? `Por favor, actúa como mi tutor personal: analiza mis resultados en detalle, explícame por qué fallé en esas preguntas y los conceptos clave detrás de cada error, y dame 2 o 3 recomendaciones prácticas para dominar este tema.`
        : `Please act as my personal tutor: analyze my results in detail, explain why I made those mistakes and the key concepts behind each one, and provide 2 or 3 practical recommendations to master this topic.`;
    } else {
      prompt += isEs
        ? `¡He acertado todas las preguntas (100%)!\n\n¿Podrías hacerme un breve diagnóstico de mi nivel sobre este tema y plantearme un reto o 2 preguntas avanzadas para profundizar aún más?`
        : `I got every question right (100%)!\n\nCould you give me a brief assessment of my level on this topic and challenge me with 1 or 2 advanced questions to dive deeper?`;
    }

    onAnswer(prompt);
  };

  if (!currentQ && !isFinished) return null;

  // Results Screen
  if (isFinished) {
    const isPerfect = scorePercent === 100;
    const isGreat = scorePercent >= 80;
    const isPass = scorePercent >= 50;

    const badgeColor = isGreat
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : isPass
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';

    const gradeLabel = isPerfect
      ? (isEs ? '¡Puntuación perfecta!' : 'Perfect score!')
      : isGreat
      ? (isEs ? '¡Excelente trabajo!' : 'Great job!')
      : isPass
      ? (isEs ? 'Aprobado' : 'Passed')
      : (isEs ? 'Necesita repaso' : 'Needs review');

    return (
      <motion.div
        className="mt-4 max-w-xl rounded-2xl bg-card deiza-border deiza-shadow overflow-hidden"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-border/40 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            {isGreat ? <Trophy className="w-6 h-6 text-amber-500" /> : <Award className="w-6 h-6 text-primary" />}
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {title || (isEs ? 'Resultados del test' : 'Quiz Results')}
          </h3>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
              {gradeLabel}
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-center gap-2">
            <span className="font-heading text-4xl font-bold tracking-tight text-foreground">
              {correctCount}
            </span>
            <span className="text-xl font-medium text-muted-foreground">/ {total}</span>
            <span className="ml-2 text-sm font-semibold text-muted-foreground">({scorePercent}%)</span>
          </div>
        </div>

        {/* Breakdown list */}
        <div className="px-5 py-4 space-y-2 border-b border-border/40 max-h-52 overflow-y-auto no-scrollbar">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {isEs ? 'Resumen de preguntas' : 'Questions summary'}
          </p>
          {questions.map((q, idx) => {
            const userPick = answers[idx];
            const isCorr = userPick !== undefined && q.answer !== undefined && userPick === q.answer;
            return (
              <div
                key={idx}
                onClick={() => { setCurrentStep(idx); setIsFinished(false); }}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer text-xs transition-colors"
              >
                <div className="flex items-center gap-2 truncate mr-2">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold shrink-0 text-[10px]
                    ${isCorr ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                    {idx + 1}
                  </span>
                  <span className="truncate text-foreground/90">{q.q}</span>
                </div>
                <span className={`shrink-0 font-medium ${isCorr ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isCorr ? (isEs ? 'Acierto' : 'Correct') : (isEs ? 'Fallo' : 'Incorrect')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="p-4 bg-muted/20 flex flex-col sm:flex-row items-center gap-2.5">
          {onAnswer && (
            <button
              onClick={handleAnalyzeWithDeiza}
              disabled={sentToChat}
              className={`w-full sm:flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all focus-ring shadow-sm
                ${sentToChat
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]'}`}
            >
              {sentToChat ? (
                <>
                  <Check className="w-4 h-4" />
                  {isEs ? 'Análisis solicitado a Deiza ✓' : 'Analysis requested ✓'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isEs ? 'Analizar resultado con Deiza' : 'Analyze result with Deiza'}
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => { setCurrentStep(0); setIsFinished(false); }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-ring"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {isEs ? 'Revisar' : 'Review'}
            </button>
            <button
              onClick={handleReset}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-ring"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isEs ? 'Repetir' : 'Retry'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Active Question Card
  return (
    <motion.div
      className="mt-4 max-w-xl rounded-2xl bg-card deiza-border deiza-shadow overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header with Title and Step */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <span className="font-heading text-[14px] font-semibold text-foreground truncate max-w-[240px] sm:max-w-xs">
            {title || (isEs ? 'Test interactivo' : 'Interactive Quiz')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-body text-muted-foreground">
            {isEs ? `Pregunta ${currentStep + 1} de ${total}` : `Question ${currentStep + 1} of ${total}`}
          </span>
          {answeredCount > 0 && (
            <button
              onClick={() => { haptic('selection'); setIsFinished(true); }}
              className="text-[11px] font-medium text-primary hover:underline ml-1"
            >
              {isEs ? 'Resultados' : 'Results'}
            </button>
          )}
        </div>
      </div>

      {/* Question Navigator Chips */}
      {total > 1 && (
        <div className="flex items-center gap-1.5 px-5 py-2 overflow-x-auto no-scrollbar border-b border-border/40">
          {questions.map((q, idx) => {
            const isAns = answers[idx] !== undefined;
            const isCorr = isAns && q.answer !== undefined && answers[idx] === q.answer;
            const isWrg = isAns && q.answer !== undefined && answers[idx] !== q.answer;
            const isCurr = idx === currentStep;
            return (
              <button
                key={idx}
                onClick={() => { haptic('selection'); setCurrentStep(idx); }}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center justify-center
                  ${isCurr ? 'ring-2 ring-primary ring-offset-1 ring-offset-card font-bold' : ''}
                  ${isCorr ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                    isWrg ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                    isAns ? 'bg-primary/15 text-primary border border-primary/30' :
                    'bg-muted/60 text-muted-foreground hover:bg-muted border border-border/40'}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Question Statement */}
      <div className="px-5 pt-4 pb-2.5">
        <p className="font-body text-[15px] sm:text-[15.5px] font-medium text-foreground leading-snug">
          {currentQ.q}
        </p>
      </div>

      {/* Options */}
      <div className="px-3 pb-3 space-y-2">
        {currentQ.options.map((opt, optIdx) => {
          const isAns = answers[currentStep] !== undefined;
          const isSelected = answers[currentStep] === optIdx;
          const isCorrectOpt = currentQ.answer !== undefined && optIdx === currentQ.answer;
          const letter = String.fromCharCode(65 + optIdx);

          let optionStyle = 'hover:bg-muted/70 text-foreground border-border/50';
          let badgeStyle = 'border-border/60 text-muted-foreground group-hover:border-foreground/50';

          if (isAns) {
            if (isSelected && isCorrectOpt) {
              optionStyle = 'bg-emerald-500/15 border-emerald-500/60 text-foreground shadow-sm shadow-emerald-500/10';
              badgeStyle = 'bg-emerald-500 text-white border-emerald-500';
            } else if (isSelected && !isCorrectOpt) {
              optionStyle = 'bg-rose-500/15 border-rose-500/60 text-foreground shadow-sm shadow-rose-500/10';
              badgeStyle = 'bg-rose-500 text-white border-rose-500';
            } else if (!isSelected && isCorrectOpt) {
              optionStyle = 'bg-emerald-500/5 border-emerald-500/40 text-foreground';
              badgeStyle = 'border-emerald-500 text-emerald-600 dark:text-emerald-400';
            } else {
              optionStyle = 'opacity-40 border-border/30 text-muted-foreground';
              badgeStyle = 'border-border/30 text-muted-foreground';
            }
          }

          return (
            <button
              key={optIdx}
              onClick={() => handlePick(optIdx)}
              disabled={isAns || disabled}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left font-body text-[14px] sm:text-[14.5px] border transition-all focus-ring group ${optionStyle}`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-semibold shrink-0 border transition-colors ${badgeStyle}`}>
                {isAns && isSelected && isCorrectOpt ? <Check className="w-4 h-4" /> :
                 isAns && isSelected && !isCorrectOpt ? <X className="w-4 h-4" /> :
                 letter}
              </span>
              <span className="flex-1 leading-snug">{opt}</span>
              {isAns && isCorrectOpt && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                  {isEs ? 'Correcta' : 'Correct'}
                </span>
              )}
            </button>
          );
        })}

        {/* Didactic explanation revealed once answered */}
        <AnimatePresence>
          {answers[currentStep] !== undefined && currentQ.explanation && (
            <motion.div
              initial={{ opacity: 0, y: 6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground/90 text-[13px] sm:text-[13.5px] leading-relaxed flex items-start gap-2.5"
            >
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-600 dark:text-amber-400 mr-1.5">
                  {isEs ? 'Explicación didáctica:' : 'Explanation:'}
                </span>
                {currentQ.explanation}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-t border-border/40">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-body text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors focus-ring"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {isEs ? 'Anterior' : 'Previous'}
        </button>

        <div className="flex items-center gap-2">
          {currentStep === total - 1 ? (
            <button
              onClick={() => { haptic('selection'); setIsFinished(true); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 shadow-sm transition-all focus-ring"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isEs ? 'Ver resultados' : 'View results'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 shadow-sm transition-all focus-ring"
            >
              {isEs ? 'Siguiente' : 'Next'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
