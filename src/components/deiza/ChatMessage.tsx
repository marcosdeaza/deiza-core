import { memo, useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { stripArtifactBlocks } from '@/lib/artifactBlock';
import { EntryAnimationContext } from '@/lib/entryAnimation';
import { useLanguage } from '@/contexts/LanguageContext';
import { isNative, saveOrShareUrl, haptic } from '@/lib/native';
import 'katex/dist/katex.min.css';
import { FileText, Copy, Check, ExternalLink, Globe, FileCode, Image, Pencil, X, Loader2, Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import useLongPress from '@/hooks/useLongPress';
import { motion, AnimatePresence } from 'framer-motion';
import ReadAloudButton from './ReadAloudButton';
import { SlideDeckCard, VideoCard, QuestionCard, extractQuestions } from './InlineMedia';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** Route remote web photos through the server proxy so hotlink-protected and
 * referrer-blocked images always render in chat and search results. */
export const proxiedImage = (url: string): string => {
  if (!url) return url;
  // Normalize protocol-relative URLs (//host/path) against https
  if (/^\/\//i.test(url)) url = 'https:' + url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/img-proxy?u=${encodeURIComponent(url)}`;
};

/**
 * Parse a partially-streamed ZIP artifact content string and detect each file
 * being written. The last file is "in progress" unless the array is closed.
 */
function _parseStreamingZipFiles(content: string): { name: string; size: number; complete: boolean }[] {
  if (!content) return [];
  const positions: { name: string; start: number }[] = [];
  const re = /"name"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    positions.push({ name: m[1], start: m.index });
  }
  const trimmed = content.trim();
  const arrayClosed = trimmed.endsWith(']') || trimmed.endsWith(']}') || trimmed.endsWith(']\"');
  return positions.map((p, i) => {
    const start = p.start;
    const end = i + 1 < positions.length ? positions[i + 1].start : content.length;
    const size = Math.max(0, end - start - p.name.length - 20);
    const complete = i + 1 < positions.length || arrayClosed;
    return { name: p.name, size, complete };
  });
}

// Lazy load heavy libs — don't load on initial page render
const SyntaxHighlighterLazy = lazy(() =>
  import('react-syntax-highlighter/dist/esm/prism-light').then(async (mod) => {
    const SH = mod.default;
    const [tsx, ts, js, py, css, html, json, bash, sql, rust, go] = await Promise.all([
      import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
      import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/python'),
      import('react-syntax-highlighter/dist/esm/languages/prism/css'),
      import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
      import('react-syntax-highlighter/dist/esm/languages/prism/json'),
      import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
      import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
      import('react-syntax-highlighter/dist/esm/languages/prism/rust'),
      import('react-syntax-highlighter/dist/esm/languages/prism/go'),
    ]);
    SH.registerLanguage('tsx', tsx.default);
    SH.registerLanguage('typescript', ts.default); SH.registerLanguage('ts', ts.default);
    SH.registerLanguage('javascript', js.default); SH.registerLanguage('js', js.default); SH.registerLanguage('jsx', js.default);
    SH.registerLanguage('python', py.default); SH.registerLanguage('py', py.default);
    SH.registerLanguage('css', css.default);
    SH.registerLanguage('html', html.default); SH.registerLanguage('markup', html.default);
    SH.registerLanguage('json', json.default);
    SH.registerLanguage('bash', bash.default); SH.registerLanguage('sh', bash.default);
    SH.registerLanguage('sql', sql.default);
    SH.registerLanguage('rust', rust.default); SH.registerLanguage('rs', rust.default);
    SH.registerLanguage('go', go.default);
    return { default: SH };
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as unknown as React.ComponentType<any>;

/**
 * Markdown element renderers that do not depend on message props. They live at
 * module level so their identity is stable across renders: ReactMarkdown treats a
 * new function as a new element type, which unmounts and remounts the node. For
 * tables that meant every re-render (each stream chunk, each keystroke in the
 * input) reset the wrapper's scrollLeft to 0 and killed horizontal scrolling.
 */
const MD_STATIC_COMPONENTS = {
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-70 transition-opacity">
        {children}
      </a>
    );
  },
  pre({ children }: { children?: React.ReactNode }) {
    // Strip prose <pre> wrapper — our CodeBlock handles its own container
    return <>{children}</>;
  },
  img({ src, alt }: { src?: string; alt?: string }) {
    if (!src || !/^https?:\/\//i.test(src)) return null;
    return (
      <img
        src={proxiedImage(src)}
        alt={alt || ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-2.5 rounded-2xl border border-border/20 max-w-full max-h-80 object-contain bg-muted/10"
        onError={e => {
          // A dead link (hallucinated or blocked) is worse than nothing: hide it quietly
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  },
  table({ children }: { children?: React.ReactNode }) {
    return (
      <div className="md-table-wrap overflow-x-auto my-3 rounded-xl border border-border/20 max-w-full">
        <table className="min-w-full w-max text-sm font-body">{children}</table>
      </div>
    );
  },
  th({ children }: { children?: React.ReactNode }) {
    return <th className="px-3 py-2 text-left text-xs font-semibold bg-muted/30 border-b border-border/20 whitespace-nowrap">{children}</th>;
  },
  td({ children }: { children?: React.ReactNode }) {
    return <td className="px-3 py-2 text-sm border-b border-border/10 min-w-[6.5rem] max-w-[22rem] align-top">{children}</td>;
  },
  blockquote({ children }: { children?: React.ReactNode }) {
    return (
      <blockquote className="border-l-2 border-primary/40 pl-4 my-3 italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  p({ children }: { children?: React.ReactNode }) {
    return <p>{children}</p>;
  },
};

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  /** Stable id used to key the read-aloud audio cache */
  messageId?: string | number;
  /** Show the "Escuchar" (TTS) action on assistant messages */
  canListen?: boolean;
  artifact?: { name: string; type: string; content?: string; url?: string; slides?: string[]; title?: string; theme?: string; aspect?: string };
  onArtifactClick?: () => void;
  /** Sends a quick reply chosen from an inline question card (see InlineMedia) */
  onQuickReply?: (text: string) => void;
  /** Only the last assistant message can still be answered */
  canReply?: boolean;
  onIterateArtifact?: () => void;
  onShare?: () => void;
  isStreaming?: boolean;
  /** The user stopped the answer here */
  stopped?: boolean;
  /** Files attached by the user — shown as preview chips above the message */
  attachedFiles?: Array<{ name: string; mime_type?: string; is_image?: boolean; raw_bytes?: string; url?: string }>;
  /** Web images fetched from search grounding — rendered as a grid below the response */
  images?: Array<{ url: string; alt: string; source?: string; caption?: string }>;
  /** Current app mode — in agent/teach, code blocks are always shown as artifact cards */
  mode?: string;
  sources?: Array<{ title: string; url: string; domain: string }>;
  /** Fade/slide in on mount (off for messages loaded from history, so switching chats does not flash) */
  animateIn?: boolean;
}

const codeStyle: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': { background: 'transparent', padding: '1rem', overflow: 'auto', fontSize: '0.8rem', lineHeight: '1.6' },
  'code[class*="language-"]': { background: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.8rem' },
  comment: { color: '#8b8b8b' },
  keyword: { color: '#8C2F39' },
  string: { color: '#4a8c5c' },
  number: { color: '#c78033' },
  function: { color: '#3b6ea5' },
  operator: { color: '#555' },
  punctuation: { color: '#999' },
  'class-name': { color: '#8C2F39' },
  builtin: { color: '#3b6ea5' },
};

// Short inline code block (≤ 20 lines) — shown directly in chat
const InlineCodeBlock = ({ language, code }: { language: string; code: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative group my-4 rounded-2xl overflow-hidden bg-muted/40">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20">
        <span className="font-body text-[10px] text-muted-foreground/60 uppercase tracking-wider">{language || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1.5 font-body text-[10px] text-muted-foreground hover:text-primary transition-colors focus-ring rounded p-1">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? t('cm.copied') : t('cm.copy')}
        </button>
      </div>
      <Suspense fallback={
        <pre style={{ padding: '1rem', fontSize: '0.8rem', overflowX: 'auto' }}>
          <code>{code}</code>
        </pre>
      }>
        <SyntaxHighlighterLazy style={codeStyle} language={language || 'text'} PreTag="div"
          customStyle={{ background: 'transparent', padding: '1rem', margin: 0, fontSize: '0.8rem' }}>
          {code}
        </SyntaxHighlighterLazy>
      </Suspense>
    </div>
  );
};
const MermaidDiagram = ({ code }: { code: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const w = window as any;
        if (!w.mermaid) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load mermaid'));
            document.head.appendChild(s);
          });
          w.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        }
        const id = 'mermaid-' + Math.random().toString(36).slice(2);
        const { svg: rendered } = await w.mermaid.render(id, code);
        if (!cancelled) { setSvg(rendered); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) return <div className="my-4 h-32 bg-muted/30 rounded-2xl animate-pulse" />;
  if (error) return <InlineCodeBlock language="mermaid" code={code} />;
  return (
    <div className="my-4 rounded-2xl overflow-hidden bg-muted/20 border border-border/20 p-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
};


/* ── Artifact icon by file extension ── */
const ArtifactIcon = ({ ext }: { ext: string }) => {
  if (['html', 'htm'].includes(ext)) return <Globe className="w-5 h-5 text-blue-500" />;
  if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (ext === 'md') return <FileText className="w-5 h-5 text-secondary" />;
  if (['py'].includes(ext)) return <FileCode className="w-5 h-5 text-yellow-600" />;
  if (['ts', 'tsx'].includes(ext)) return <FileCode className="w-5 h-5 text-blue-600" />;
  if (['js', 'jsx'].includes(ext)) return <FileCode className="w-5 h-5 text-yellow-500" />;
  if (['css'].includes(ext)) return <FileCode className="w-5 h-5 text-purple-500" />;
  if (['json'].includes(ext)) return <FileCode className="w-5 h-5 text-green-600" />;
  if (['sql'].includes(ext)) return <FileCode className="w-5 h-5 text-orange-500" />;
  return <FileCode className="w-5 h-5 text-muted-foreground" />;
};

const extBadgeColor: Record<string, string> = {
  html: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  htm: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  pdf: 'bg-red-500/10 text-red-600 border-red-500/20',
  md: 'bg-secondary/15 text-secondary-foreground border-secondary/25',
  py: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  ts: 'bg-blue-600/10 text-blue-700 border-blue-600/20',
  tsx: 'bg-blue-600/10 text-blue-700 border-blue-600/20',
  js: 'bg-yellow-400/10 text-yellow-700 border-yellow-400/20',
  jsx: 'bg-yellow-400/10 text-yellow-700 border-yellow-400/20',
  css: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  json: 'bg-green-500/10 text-green-700 border-green-500/20',
  sql: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

// Large artifact card — opens in side panel
type ArtifactData = { name: string; type: string; content?: string; url?: string };
const ArtifactCard = ({ artifact, onClick, onIterate }: { artifact: ArtifactData; onClick?: () => void; onIterate?: () => void }) => {
  const { t } = useLanguage();
  const ext = artifact.name.split('.').pop()?.toLowerCase() || '';
  const badge = extBadgeColor[ext] || 'bg-primary/10 text-primary border-primary/20';

  // Downloaded-file artifacts (e.g. .pptx saved on the server) link straight to the file
  if (artifact.url) {
    return (
      <div className="mt-5">
        <a
          href={artifact.url}
          download={artifact.name || 'archivo'}
          onClick={e => { haptic('light'); if (isNative()) { e.preventDefault(); void saveOrShareUrl(artifact.url!, artifact.name || 'archivo'); } }}
          className="w-full flex items-center gap-3 bg-card deiza-border rounded-2xl px-5 py-4 deiza-shadow hover:deiza-shadow-lg transition-all duration-300 group focus-ring text-left"
          aria-label={`${t('artifact.download')}: ${artifact.name}`}
        >
          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
            <ArtifactIcon ext={ext} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm font-medium text-foreground truncate">{artifact.name}</p>
            <p className="font-body text-[11px] text-muted-foreground mt-0.5">{artifact.type}</p>
          </div>
          <span className={`hidden sm:inline font-body text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${badge}`}>
            {ext.toUpperCase() || 'FILE'}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-body text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
            <Download className="w-3.5 h-3.5" />
            {t('artifact.download')}
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <motion.button
        onClick={onClick}
        className="w-full flex items-center gap-3 bg-card deiza-border rounded-2xl px-5 py-4 deiza-shadow hover:deiza-shadow-lg transition-all duration-300 group cursor-pointer focus-ring text-left"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        aria-label={`${t('cm.open.artifact')}: ${artifact.name}`}
      >
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
          <ArtifactIcon ext={ext} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-medium text-foreground truncate">{artifact.name}</p>
          <p className="font-body text-[11px] text-muted-foreground mt-0.5">{artifact.type}</p>
        </div>
        <span className={`hidden sm:inline font-body text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${badge}`}>
          {ext.toUpperCase() || 'FILE'}
        </span>
        <ExternalLink className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" aria-hidden="true" />
      </motion.button>
      {onIterate && (
        <div className="flex justify-end mt-1.5">
          <button
            onClick={e => { e.stopPropagation(); onIterate(); }}
            className="flex items-center gap-1 text-[11px] font-body text-muted-foreground hover:text-primary transition-colors"
          >
            <Pencil className="w-3 h-3" />
            {t('cm.iterate')}
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Inline HTML preview — renders each HTML block in chat as a live page (sandboxed),
   with a Preview/Código toggle and fullscreen. Lets "varios renders html" each render. ── */
const HtmlPreviewBlock = ({ code }: { code: string }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const [full, setFull] = useState(false);
  const html = code.trim();

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const frame = (h: string) => (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      className="w-full bg-white"
      style={{ height: h, border: 'none' }}
      title="HTML preview"
      loading="lazy"
    />
  );

  return (
    <>
      <div className="my-4 rounded-2xl overflow-hidden bg-card deiza-border deiza-shadow">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/20 bg-muted/20">
          <span className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
            <Globe className="w-3 h-3 text-primary/70" /> HTML
          </span>
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-muted/50 rounded-full p-0.5 border border-border/20">
              <button onClick={() => setMode('preview')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-body transition-colors ${mode === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                {t('cm.preview')}
              </button>
              <button onClick={() => setMode('code')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-body transition-colors ${mode === 'code' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                {t('cm.code')}
              </button>
            </div>
            <button onClick={() => setFull(true)} title={t('im.fullscreen')}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {mode === 'preview'
          ? frame('360px')
          : <div className="max-h-[360px] overflow-auto"><InlineCodeBlock language="html" code={html} /></div>}
      </div>

      <AnimatePresence>
        {full && (
          <motion.div
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col p-2 sm:p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setFull(false)}
          >
            <div className="self-end mb-2">
              <button onClick={() => setFull(false)} aria-label={t('artifact.close')}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 rounded-2xl overflow-hidden bg-white" onClick={e => e.stopPropagation()}>
              <iframe
                srcDoc={html}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="w-full h-full"
                style={{ border: 'none' }}
                title="HTML preview fullscreen"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Code block router: short → inline, long → artifact card, agent mode → always card
const CodeBlock = ({
  language, code, onArtifactClick, artifactName, forceCard,
}: {
  language: string; code: string; onArtifactClick?: () => void; artifactName?: string; forceCard?: boolean;
}) => {
  const { t } = useLanguage();
  const lineCount = code.split('\n').length;
  const isLong = lineCount > 20;

  if ((isLong || forceCard) && onArtifactClick && artifactName) {
    return (
      <motion.button
        onClick={onArtifactClick}
        className="my-4 w-full flex items-center gap-3 bg-card deiza-border rounded-2xl px-4 py-3 deiza-shadow hover:deiza-shadow-lg transition-all group cursor-pointer focus-ring text-left"
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm shrink-0">💻</div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs font-medium text-foreground">{artifactName}</p>
          <p className="font-body text-[10px] text-muted-foreground">{t('cm.lines', { n: lineCount })} · {language}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </motion.button>
    );
  }

  return <InlineCodeBlock language={language} code={code} />;
};

/* ── Web image grid from search grounding ── */
export const WebImageGrid = ({ images }: { images: Array<{ url: string; alt?: string; title?: string; source?: string; caption?: string }> }) => {
  const { t } = useLanguage();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [retryKey, setRetryKey] = useState<Record<number, number>>({});
  // Filter out placeholder/icon images that aren't real photos
  const filtered = images.filter(img => {
    const u = img.url.toLowerCase();
    if (u.endsWith('.svg') || u.endsWith('.gif') || u.includes('/icon') || u.includes('logo')) return false;
    if (u.includes('placeholder') || u.includes('default') || u.includes('no-image')) return false;
    if (u.includes('1x1') || u.includes('pixel') || u.includes('spacer') || u.includes('blank')) return false;
    if (u.includes('/avatar') || u.includes('favicon')) return false;
    // Filter CDN thumbnails that are too small (common patterns)
    if (/[?&](w|width|h|height)=(1[0-9]|[1-9])[&$]/i.test(u)) return false;
    if (/\/(\d{1,2})x(\d{1,2})\//i.test(u)) return false;
    // Filter tracking pixels and ad images
    if (u.includes('track') || u.includes('beacon') || u.includes('analytics')) return false;
    if (u.includes('.ad.') || u.includes('/ad/') || u.includes('doubleclick')) return false;
    return true;
  });
  if (filtered.length === 0) return null;

  return (
    <>
      {/* Horizontal swipeable carousel — all photos grouped together */}
      <div
        className="mt-4 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scrollbar-thin"
        onWheel={e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; } }}
      >
        {filtered.map((img, i) => {
          const src = proxiedImage(img.url);
          const isFailed = failed[i];
          const isLoading = !isFailed && !loaded[i];
          return (
            <motion.div
              key={i}
              className="relative shrink-0 snap-center overflow-hidden rounded-xl bg-muted/20 cursor-zoom-in group w-[68vw] max-w-[240px] min-w-[180px]"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              onClick={() => { if (!isFailed && loaded[i]) setLightbox(src); }}
            >
              {isFailed ? (
                <button
                  className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-1.5 text-muted-foreground/70"
                  onClick={e => { e.stopPropagation(); setFailed(prev => ({ ...prev, [i]: false })); setLoaded(prev => ({ ...prev, [i]: false })); setRetryKey(prev => ({ ...prev, [i]: (prev[i] || 0) + 1 })); }}
                >
                  <Image className="w-5 h-5 opacity-50" />
                  <span className="text-[11px]">{t('cm.img.retry')}</span>
                </button>
              ) : (
                <>
                  {/* The <img> is always mounted: the spinner is an overlay, otherwise onLoad can never fire */}
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/10 pointer-events-none">
                      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                  )}
                  <img
                    key={`${retryKey[i] || 0}`}
                    src={src}
                    alt={img.alt || (img as any).title || ''}
                    className={`w-full object-cover aspect-[4/3] group-hover:scale-105 transition-all duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(prev => ({ ...prev, [i]: true }))}
                    onLoad={e => {
                      const el = e.target as HTMLImageElement;
                      if (el.naturalWidth < 40 || el.naturalHeight < 40) {
                        setFailed(prev => ({ ...prev, [i]: true }));
                        return;
                      }
                      setLoaded(prev => ({ ...prev, [i]: true }));
                    }}
                  />
                </>
              )}
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>
        {lightbox && typeof document !== 'undefined' && createPortal(
          <motion.div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop */}
            <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
            {/* Close — tap anywhere or X */}
            <motion.button
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              onClick={() => setLightbox(null)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.1 }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </motion.button>
            {/* Image */}
            <motion.img
              src={lightbox}
              alt=""
              className="relative z-[1] max-w-[92vw] max-h-[88vh] rounded-xl object-contain shadow-2xl"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              referrerPolicy="no-referrer"
              draggable={false}
            />
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
};

/* ── Typewriter blinking cursor shown while streaming ── */
const StreamingCursor = () => (
  <motion.span
    className="inline-block w-[2px] h-[1.1em] bg-primary/60 rounded-full ml-1 align-text-bottom"
    animate={{ opacity: [1, 0.2, 1] }}
    transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
    aria-hidden="true"
  />
);

/* ── File preview chip for user-attached files ── */
const FileChip = ({ file }: { file: { name: string; mime_type?: string; is_image?: boolean; raw_bytes?: string; url?: string } }) => {
  const [lightbox, setLightbox] = useState(false);
  const isImage = file.is_image || file.mime_type?.startsWith('image/');
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (isImage && (file.raw_bytes || file.url)) {
    const src = file.url || `data:${file.mime_type || 'image/png'};base64,${file.raw_bytes}`;
    return (
      <>
        <motion.div
          className="relative group rounded-2xl overflow-hidden border border-border/20 bg-muted/20 cursor-zoom-in active:scale-[0.97] transition-transform"
          style={{ maxWidth: 200 }}
          onClick={() => setLightbox(true)}
          role="button"
          aria-label={`Ver imagen: ${file.name}`}
          whileTap={{ scale: 0.96 }}
        >
          <img src={src} alt={file.name} className="w-full h-28 object-cover" />
        </motion.div>
        <AnimatePresence>
          {lightbox && typeof document !== 'undefined' && createPortal(
            <motion.div
              className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setLightbox(false)}
              role="dialog"
              aria-modal="true"
              aria-label={file.name}
            >
              <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
              <motion.button
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                onClick={() => setLightbox(false)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.1 }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </motion.button>
              <motion.img
                src={src}
                alt={file.name}
                className="relative z-[1] max-w-[92vw] max-h-[88vh] rounded-xl object-contain shadow-2xl"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
                draggable={false}
              />
            </motion.div>,
            document.body
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2 border border-border/30">
      <Image className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="font-body text-xs text-muted-foreground truncate max-w-[120px]">{file.name}</span>
      <span className="font-body text-[10px] text-muted-foreground/60 uppercase">{ext}</span>
    </div>
  );
};


/* Sources widget - shown at top of AI responses with web search results */
const SourcesWidget = ({ sources }: { sources: Array<{ title: string; url: string; domain: string }> }) => {
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;
  const shown = expanded ? sources : sources.slice(0, 4);
  return (
    <div className="mb-3 mt-1">
      <div className="flex flex-wrap gap-1.5 items-center">

        {shown.map((src, i) => (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/30 bg-muted/30 text-[11px] font-body text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all max-w-[200px] group"
            title={src.title}
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=16`}
              alt=""
              className="w-3 h-3 rounded-sm shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="truncate">{src.domain}</span>
          </a>
        ))}
        {!expanded && sources.length > 4 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] font-body text-muted-foreground/60 hover:text-primary transition-colors px-1.5 py-0.5 rounded-full border border-border/20 hover:border-primary/30"
          >
            +{sources.length - 4}
          </button>
        )}
      </div>
    </div>
  );
};

/** Strip the ```artifact JSON block from displayed content (module-level so hooks can use it) */
const _stripArtifactBlock = (txt: string) => stripArtifactBlocks(txt);

/** Fullscreen lightbox for generated images — click to open, tap/Esc to close */
const ImageLightbox = ({ src, name, onClose }: { src: string; name: string; onClose: () => void }) => {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-10"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog" aria-label={name}
    >
      <motion.img
        src={src} alt={name}
        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
      />
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => { haptic('light'); void saveOrShareUrl(src, name || 'imagen.png'); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-body backdrop-blur-sm transition-colors focus-ring"
        >
          <Download className="w-3.5 h-3.5" /> {t('artifact.download')}
        </button>
        <button onClick={onClose} aria-label={t('artifact.close')}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors focus-ring">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>,
    document.body
  );
};

const ChatMessage = memo(({ role, content, artifact, onArtifactClick, onIterateArtifact, onShare, isStreaming, attachedFiles, images, mode, sources, messageId, canListen, onQuickReply, canReply, stopped, animateIn = true }: ChatMessageProps) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Mobile: long-press any message to copy it (native-app style)
  const longPress = useLongPress(() => {
    const text = role === 'user' ? content : _stripArtifactBlock(content);
    if (!text.trim()) return;
    navigator.clipboard.writeText(text);
    haptic('medium');
    toast.success(t('cm.copied.clipboard'));
  });
  // Only the code renderer depends on props; everything else is static (see MD_STATIC_COMPONENTS)
  const mdComponents = useMemo(() => ({
    ...MD_STATIC_COMPONENTS,
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');

      // HTML blocks ALWAYS render as a live page (even multiple per message),
      // never as raw code — as long as it's a real document.
      if (match && (match[1] === 'html' || match[1] === 'htm') &&
          /<\s*(!doctype|html|body|div|section|main|h1|style)/i.test(codeString)) {
        return <HtmlPreviewBlock code={codeString} />;
      }

      // When artifact exists, suppress ALL fenced code blocks in chat
      if (artifact && match) return null;

      // In agent/teach mode: ALWAYS suppress code blocks — artifact card at bottom handles display
      const isAgentMode = mode === 'agent' || mode === 'teach';
      if (isAgentMode && match) {
        return null; // Never dump code inline in agent/teach mode
      }

      if (match) {
        const lang = match[1];
        // Never dump raw artifact JSON in chat — the artifact card handles it
        if (lang === 'artifact') return null;
        if (lang === 'mermaid') return <MermaidDiagram code={codeString} />;
        return (
          <CodeBlock
            language={lang}
            code={codeString}
            onArtifactClick={onArtifactClick}
            artifactName={artifact?.name}
          />
        );
      }
      return (
        <code className="px-1.5 py-0.5 rounded-md text-[0.82em] font-mono bg-muted/60 text-primary" {...props}>
          {children}
        </code>
      );
    },
  }), [artifact?.name, mode, onArtifactClick]);
  if (role === 'user') {
    return (
      <EntryAnimationContext.Provider value={animateIn}>
      <motion.div
        className="flex justify-end mb-5 sm:mb-10 group"
        initial={animateIn ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="flex flex-col items-end gap-2 max-w-[86%] sm:max-w-md">
          {/* Attached file previews above the bubble */}
          {attachedFiles && attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {attachedFiles.map((f, i) => <FileChip key={i} file={f} />)}
            </div>
          )}
          <div className="bg-muted/55 rounded-[22px] rounded-br-md px-4 sm:px-5 py-2.5 sm:py-3 border border-border/25 shadow-sm select-text">
            <p className="font-body text-[15px] text-foreground leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</p>
          </div>
          {/* Copy user message button — appears on hover (desktop) like assistant responses */}
          <div className="flex items-center gap-2 -mr-2 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                navigator.clipboard.writeText(content);
                haptic('light');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-body text-muted-foreground/60 hover:text-primary hover:bg-muted/40 transition-colors focus-ring"
              aria-label={t('cm.copy.aria')}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t('cm.copied') : t('cm.copy')}
            </button>
          </div>
        </div>
      </motion.div>
      </EntryAnimationContext.Provider>
    );
  }

  // Strip artifact JSON blocks from displayed content (find-based to handle backticks in content)
  const _stripArtifact = (txt: string) => stripArtifactBlocks(txt);
  const displayContent = artifact ? _stripArtifact(content) : content;

  // Also strip any large fenced code blocks when artifact exists (they belong in the panel)
  const cleanContentRaw = artifact
    ? displayContent.replace(/```[\w]*\n[\s\S]{500,}?```/g, '').trim()
    : displayContent;
  // Decision questions live in a trailing ```question block: shown as option buttons,
  // never as a code block. While streaming the block is still partial, so keep it hidden.
  let { text: cleanContent, questions } = extractQuestions(cleanContentRaw.replace(/```question[\s\S]*$/, m => (m.includes('```', 12) ? m : '')));

  // Retroactive fallback: If questions array is empty but this message was saved with an artifact of type question
  const isQuestionArtifact = Boolean(artifact && (artifact.type === 'question' || artifact.name?.endsWith('.question')));
  if (questions.length === 0 && isQuestionArtifact && artifact?.content) {
    try {
      const parsed = JSON.parse(artifact.content.trim());
      const list = Array.isArray(parsed) ? parsed : (parsed.questions || (parsed.q ? [parsed] : []));
      questions = list
        .filter((x: any) => x && typeof x.q === 'string' && Array.isArray(x.options))
        .slice(0, 3)
        .map((x: any) => ({ q: x.q, options: x.options.map(String).filter(Boolean).slice(0, 6), other: x.other !== false }));
    } catch {}
  }

  return (
    <EntryAnimationContext.Provider value={animateIn}>
    <motion.div
      className="mb-7 sm:mb-12 ink-blot group"
      initial={animateIn ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Sources from web search - shown at top of AI response as soon as received */}
      {sources && sources.length > 0 && <SourcesWidget sources={sources} />}
      {/* Only render markdown prose when there's actual text content */}
      {cleanContent.length > 0 && (
        <div className="prose-deiza font-body text-[15px] leading-[1.75] sm:text-[15.5px] sm:leading-[1.85] [overflow-wrap:anywhere]" {...longPress}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={mdComponents}
          >
            {cleanContent}
          </ReactMarkdown>
          {/* Streaming cursor — shown at the very end of content */}
          {isStreaming && <StreamingCursor />}
        </div>
      )}

      {/* Decision questions with options (only answerable on the latest message) */}
      {questions.length > 0 && !isStreaming && canReply && onQuickReply && (
        <QuestionCard questions={questions} onAnswer={onQuickReply} />
      )}

      {/* Web image grid — shown after AI response when search grounding returned images */}
      {images && images.length > 0 && !isStreaming && (
        <WebImageGrid images={images} />
      )}

      {/* Artifact card — during streaming show terminal-style indicator */}
      {artifact && !isQuestionArtifact && (
        isStreaming ? (
          <motion.div
            className="mt-5 rounded-2xl overflow-hidden bg-card/95 deiza-border deiza-shadow"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {(() => {
              const ext = artifact.name?.split('.').pop()?.toLowerCase() ?? '';
              const isPdf = ext === 'pdf';
              const isHtml = ext === 'html' || ext === 'htm';
              const isZip = ext === 'zip';
              const skillLabel = isPdf ? t('cm.art.pdf')
                : isHtml ? t('cm.art.html')
                : isZip ? t('cm.art.zip')
                : ext === 'md' ? t('cm.art.md')
                : t('cm.art.code');
              const fullContent = artifact.content || '';
              const charLen = fullContent.length;
              const lines = fullContent.split('\n');
              const visibleLines = lines.slice(-7);
              const startLineNum = Math.max(1, lines.length - visibleLines.length + 1);
              const kb = (charLen / 1024).toFixed(1);
              return (
                <>
                  {/* Header — minimal, Deiza palette */}
                  <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/30 bg-muted/15">
                    <span className="relative flex shrink-0 items-center justify-center">
                      <span className="absolute w-3 h-3 rounded-full bg-primary/20 animate-ping" />
                      <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
                    </span>
                    <span className="font-mono text-[11px] text-foreground/85 truncate flex-1">{artifact.name}</span>
                    <span className="font-body text-[10px] text-muted-foreground/70 italic shrink-0">{skillLabel}</span>
                    {charLen > 80 && (
                      <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums shrink-0">{kb} KB</span>
                    )}
                  </div>
                  {/* Body — ZIP shows file-by-file checklist; else terminal line view */}
                  {isZip ? (() => {
                    const zipFiles = _parseStreamingZipFiles(fullContent);
                    const completedCount = zipFiles.filter(f => f.complete).length;
                    return (
                      <div className="relative bg-card/40 max-h-[260px] overflow-hidden">
                        {zipFiles.length === 0 ? (
                          <p className="font-body text-[12px] text-muted-foreground/60 italic px-4 py-4">
                            {t('cm.art.preparing')}
                          </p>
                        ) : (
                          <div className="px-3 py-2.5 space-y-1">
                            {zipFiles.slice(-8).map((f, i) => (
                              <motion.div
                                key={`${f.name}-${i}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center gap-2.5 px-1.5 py-1 font-mono text-[11px]"
                              >
                                {f.complete ? (
                                  <Check className="w-3.5 h-3.5 shrink-0 text-primary" strokeWidth={2.5} />
                                ) : (
                                  <Loader2 className="w-3.5 h-3.5 shrink-0 text-primary animate-spin" />
                                )}
                                <span className={`flex-1 truncate ${f.complete ? 'text-foreground/85' : 'text-foreground'}`}>
                                  {f.name}
                                </span>
                                <span className="text-muted-foreground/50 text-[10px] tabular-nums shrink-0">
                                  {f.complete ? `${(f.size / 1024).toFixed(1)}kb` : t('cm.art.writing')}
                                </span>
                              </motion.div>
                            ))}
                            <p className="px-1.5 pt-1 font-body text-[10px] text-muted-foreground/60 italic">
                              {t('cm.art.zip.progress', { done: completedCount, total: zipFiles.length })}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                  <div className="relative bg-card/40 max-h-[220px] overflow-hidden">
                    {charLen < 14 ? (
                      <p className="font-body text-[12px] text-muted-foreground/60 italic px-4 py-4">
                        {t('cm.art.preparing')}
                      </p>
                    ) : (
                      <div className="px-3 py-3 font-mono text-[11px] leading-[1.75] text-foreground/80">
                        {visibleLines.map((line, i) => (
                          <div key={i} className="flex gap-3 items-baseline">
                            <span className="text-muted-foreground/30 select-none w-7 text-right shrink-0 text-[10px] tabular-nums">
                              {startLineNum + i}
                            </span>
                            <span className="whitespace-pre-wrap break-all flex-1">
                              {line || '\u00A0'}
                              {i === visibleLines.length - 1 && (
                                <motion.span
                                  className="inline-block w-[2px] h-[1em] bg-primary/70 ml-0.5 align-text-bottom rounded-sm"
                                  animate={{ opacity: [1, 0.2, 1] }}
                                  transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
                                />
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Soft top fade — older lines vanish gently */}
                    <div className="pointer-events-none absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-card to-transparent" />
                  </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        ) : artifact.type === 'pptx' && artifact.slides && artifact.slides.length > 0 ? (
          /* Compiled PowerPoint — slide viewer inline, .pptx download */
          <SlideDeckCard artifact={artifact} />
        ) : artifact.type === 'video' && artifact.url ? (
          /* Generated clip (DZ-Motion) — plays inline */
          <VideoCard artifact={artifact} />
        ) : artifact.type === 'image' && (artifact.content?.startsWith('data:image') || artifact.content?.startsWith('/api/files/')) ? (
          /* Generated image (DZ-Image) — shown inline with a download action */
          <motion.div
            className="mt-4 relative group/img inline-block max-w-full"
            initial={animateIn ? { opacity: 0, scale: 0.97 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <img
              src={artifact.content}
              alt={artifact.name}
              className="rounded-2xl max-w-full sm:max-w-md max-h-[60vh] deiza-border deiza-shadow-lg object-contain cursor-zoom-in hover:opacity-95 transition-opacity"
              loading="lazy"
              onClick={() => setLightboxOpen(true)}
              role="button"
              aria-label={`${t('cm.zoom')} ${artifact.name}`}
            />
            <AnimatePresence>
              {lightboxOpen && (
                <ImageLightbox src={artifact.content!} name={artifact.name} onClose={() => setLightboxOpen(false)} />
              )}
            </AnimatePresence>
            <button
              onClick={() => { haptic('light'); void saveOrShareUrl(artifact.content!, artifact.name || 'imagen.png'); }}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-body opacity-80 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity focus-ring"
              aria-label={t('cm.download.image')}
            >
              <Download className="w-3 h-3" aria-hidden="true" />
              {t('artifact.download')}
            </button>
          </motion.div>
        ) : (
          <ArtifactCard artifact={artifact} onClick={onArtifactClick} onIterate={onIterateArtifact} />
        )
      )}

      {stopped && !isStreaming && (
        <p className="mt-2 font-body text-[11px] text-muted-foreground/55 italic">{t('cm.stopped')}</p>
      )}

      {/* Copy response button — appears on hover for assistant messages */}
      {!isStreaming && (
        <div className="flex items-center gap-1 -ml-2 mt-2.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => {
              navigator.clipboard.writeText(cleanContent);
              haptic('light');
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-body text-muted-foreground/60 hover:text-primary hover:bg-muted/40 transition-colors focus-ring"
            aria-label={t("cm.copy.aria")}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? t('cm.copied') : t('cm.copy')}
          </button>
          {canListen && cleanContent.trim().length > 0 && (
            <ReadAloudButton messageId={messageId ?? cleanContent.length} content={cleanContent} />
          )}
          {onShare && (
            <button
              onClick={onShare}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-body text-muted-foreground/60 hover:text-primary hover:bg-muted/40 transition-colors focus-ring"
              aria-label={t('cm.share.aria')}
            >
              <Share2 className="w-3.5 h-3.5" />
              {t('cm.share')}
            </button>
          )}
        </div>
      )}
    </motion.div>
    </EntryAnimationContext.Provider>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;
