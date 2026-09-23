import { X, Copy, Download, Check, Code, Eye, Maximize2, Minimize2, RefreshCw, FileText, Globe, FileCode, ChevronLeft, ChevronRight, ExternalLink, Printer, Share2, Terminal, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import RoseMark from './RoseMark';
import { useLanguage } from '@/contexts/LanguageContext';
import { authHeaders } from '@/services/api';
import { isNative, saveOrShareFile, shareText, haptic } from '@/lib/native';
import 'katex/dist/katex.min.css';

/** Generated PDFs are cached per (name, content) so reopening the panel is instant */
const PDF_CACHE = new Map<string, Blob>();
const PDF_CACHE_MAX = 12;
const pdfKey = (name: string, content: string) => { let h = 0; for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0; return `${name}:${content.length}:${h}`; };

/* ── Heavy libs loaded lazily to avoid blocking /workspace mount ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SyntaxHighlighterLazy = lazy(() =>
  import('react-syntax-highlighter/dist/esm/prism-light').then((mod) => ({
    default: mod.default,
  }))
) as unknown as React.ComponentType<any>;
const ReactMarkdownLazy = lazy(() => import('react-markdown'));
const PDFViewerLazy = lazy(() => import('./PDFViewer'));

// These are loaded on-demand only when markdown rendering is needed


let remarkGfm: any = null;
let remarkMath: any = null;
let rehypeKatex: any = null;
let DOMPurify: any = null;
const loadMarkdownPlugins = async () => {
  if (!remarkGfm) {
    const [gfm, math, katex, purify] = await Promise.all([
      import('remark-gfm'),
      import('remark-math'),
      import('rehype-katex'),
      import('dompurify'),
    ]);
    remarkGfm = gfm.default;
    remarkMath = math.default;
    rehypeKatex = katex.default;
    DOMPurify = purify.default;
  }
};

interface ArtifactPanelProps {
  open: boolean;
  onClose: () => void;
  artifact: { name: string; type: string; content?: string } | null;
  /** When true, renders inline (no fixed positioning) — used inside ResizablePanel */
  inline?: boolean;
  /** History navigation */
  historyIndex?: number;
  historyTotal?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

/* ── Custom syntax highlight theme matching Deiza palette ── */
const codeStyle: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    background: 'transparent', padding: '1rem', overflow: 'auto',
    fontSize: '0.78rem', lineHeight: '1.65',
  },
  'code[class*="language-"]': {
    background: 'none',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.78rem',
  },
  comment: { color: '#9ca3af', fontStyle: 'italic' },
  keyword: { color: '#8C2F39', fontWeight: '600' },
  string: { color: '#4a8c5c' },
  number: { color: '#c78033' },
  function: { color: '#3b6ea5' },
  operator: { color: '#6b7280' },
  punctuation: { color: '#9ca3af' },
  'class-name': { color: '#c78033' },
  boolean: { color: '#8C2F39' },
  builtin: { color: '#3b6ea5' },
};

function getLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', css: 'css', html: 'html', json: 'json',
    md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash',
    yml: 'yaml', yaml: 'yaml', rs: 'rust', go: 'go',
    java: 'java', cpp: 'cpp', c: 'c', rb: 'ruby',
    php: 'php', swift: 'swift', kt: 'kotlin',
  };
  return map[ext] || 'text';
}

/* ── Type icon helper ── */
const TypeIcon = ({ ext }: { ext: string }) => {
  if (['html', 'htm'].includes(ext)) return <Globe className="w-3.5 h-3.5 text-primary/70" />;
  if (ext === 'md') return <FileText className="w-3.5 h-3.5 text-secondary/80" />;
  if (ext === 'pdf') return <FileText className="w-3.5 h-3.5 text-red-500/70" />;
  return <FileCode className="w-3.5 h-3.5 text-muted-foreground/60" />;
};

/* ── Lightweight loading placeholder for Suspense fallbacks ── */
const CodeSkeleton = () => (
  <div className="space-y-2 p-4" role="status" aria-label="Loading...">
    {[80, 60, 90, 45, 70].map((w, i) => (
      <div key={i} className="h-3 bg-muted/40 rounded animate-pulse" style={{ width: `${w}%` }} />
    ))}
  </div>
);

const ArtifactPanel = ({ open, onClose, artifact, inline = false, historyIndex = -1, historyTotal = 0, onPrev, onNext }: ArtifactPanelProps) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // Used to force iframe refresh
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pluginsReady, setPluginsReady] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  // Multi-file (zip) preview: hidden until the page has loaded, so it never flashes white.
  const [zipFrameReady, setZipFrameReady] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
  const [iframeZoom, setIframeZoom] = useState(100);
  const [shareLoading, setShareLoading] = useState(false);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const effectiveContent = localContent ?? artifact?.content ?? '';
  // Apply JSON artifact spec normalization to effective content
  const _rawEffective = effectiveContent;
  const isEffectiveJsonSpec = _rawEffective.trimStart().startsWith('{"name":');


  // Reset to preview mode whenever a new artifact is loaded (different name)
  useEffect(() => {
    if (artifact?.name) {
      setViewMode('preview');
      setIframeZoom(100);
      setConsoleMessages([]);
      setShowConsole(false);
      setIframeLoading(true);
      setZipFrameReady(false);
      setLocalContent(null);
    }
  }, [artifact?.name]);

  useEffect(() => {
    if (viewMode === 'preview') setZipFrameReady(false);
  }, [viewMode]);

  useEffect(() => {
    if (zipFrameReady) return;
    const id = setTimeout(() => setZipFrameReady(true), 2500);
    return () => clearTimeout(id);
  }, [zipFrameReady, artifact?.name]);

  useEffect(() => {
    if (!iframeLoading) return;
    const id = setTimeout(() => setIframeLoading(false), 2500);
    return () => clearTimeout(id);
  }, [iframeLoading]);

  // Listen for console messages from iframe via postMessage
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'console' && e.data?.msg) {
        setConsoleMessages(prev => [...prev.slice(-99), `[${e.data.level || 'log'}] ${e.data.msg}`]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Escape key exits fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Lazy-load markdown plugins only when a markdown artifact is opened
  const extForEffect = artifact?.name.split('.').pop()?.toLowerCase() || '';
  useEffect(() => {
    if (open && extForEffect === 'md' && !pluginsReady) {
      loadMarkdownPlugins().then(() => setPluginsReady(true));
    }
  }, [open, extForEffect, pluginsReady]);

  const ext = artifact?.name.split('.').pop()?.toLowerCase() || '';
  const isHTML = ['html', 'htm'].includes(ext);
  // PDF blob URL for inline preview
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!artifact) { setPdfBlobUrl(null); return; }
    const artExt = artifact.name?.split('.').pop()?.toLowerCase();
    if (artExt !== 'pdf') { setPdfBlobUrl(null); return; }

    const body = localContent || normalizedContent || artifact?.content || '';
    const key = pdfKey(artifact.name, body);
    const cached = PDF_CACHE.get(key);
    let cancelled = false;
    if (cached) {
      objectUrl = URL.createObjectURL(cached);
      setPdfBlobUrl(objectUrl);
      setPdfLoading(false);
    } else {
      setPdfLoading(true);
      fetch('/api/generate/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ content: body, filename: artifact?.name }),
        credentials: 'include',
      })
        .then(res => {
          if (!res.ok) throw new Error('PDF generation failed');
          return res.blob();
        })
        .then(blob => {
          if (cancelled) return;
          PDF_CACHE.set(key, blob);
          if (PDF_CACHE.size > PDF_CACHE_MAX) PDF_CACHE.delete(PDF_CACHE.keys().next().value as string);
          objectUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(objectUrl);
          setPdfLoading(false);
        })
        .catch(err => {
          if (cancelled) return;
          console.error('PDF preview error:', err);
          setPdfLoading(false);
        });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.name, artifact?.content]);

  // Default to Preview when opening a previewable ZIP (entry html present)
  useEffect(() => {
    if (artifact?.name?.toLowerCase().endsWith('.zip')) {
      setViewMode('preview');
    }
  }, [artifact?.name]);


  // ── Content normalization: if content is a raw JSON artifact spec (mis-parsed), extract real content
  let normalizedContent = artifact?.content;
  if (normalizedContent && (normalizedContent.trimStart().startsWith('{"name":') || normalizedContent.trimStart().startsWith('{ "name":'))) {
    try {
      const parsed = JSON.parse(normalizedContent);
      if (parsed.content && typeof parsed.content === 'string') {
        normalizedContent = parsed.content;
      }
    } catch {
      // Not valid JSON artifact spec — keep as is
    }
  }

  const isPDF = ext === 'pdf';
  const isZip = ext === 'zip';
  const isMarkdown = ext === 'md';
  const isCode = /^(tsx?|jsx?|py|css|json|sql|sh|bash|yml|yaml|rs|go|java|cpp|c|rb|php|swift|kt)$/.test(ext);
  const canToggleView = isHTML || isMarkdown;
  const canRefresh = isHTML || isPDF;

  /* ── Actions ── */
  const handleCopy = useCallback(() => {
    if (!artifact?.content) return;
    navigator.clipboard.writeText(artifact.content.trim());
    haptic('light');
    setCopied(true);
    toast.success(t('artifact.copied'));
    setTimeout(() => setCopied(false), 2000);
  }, [artifact, t]);


  // Defensive parser that accepts:
  //  - JSON array of files [{name, content}, ...]
  //  - JSON object map {name: content, ...}
  //  - Raw HTML / single-file content (auto-wrapped as index.html)
  const _parseZipFiles = (rawContent: string): { name: string; content: string }[] => {
    if (!rawContent) return [];
    const text = rawContent.trim();
    // 1) Strict JSON parse
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(f => f && typeof f.name === 'string' && typeof f.content === 'string');
      }
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .filter(([_, v]) => typeof v === 'string')
          .map(([name, content]) => ({ name, content: content as string }));
      }
    } catch { /* fall through */ }
    // 2) Tolerant walk — recovers files when AI emits broken escapes
    const tolerantFiles: { name: string; content: string }[] = [];
    let i = 0;
    while (i < text.length) {
      const nameStart = text.indexOf('"name"', i);
      if (nameStart < 0) break;
      const nm = text.substring(nameStart).match(/"name"\s*:\s*"([^"]+)"/);
      if (!nm) { i = nameStart + 6; continue; }
      const fileName = nm[1];
      const contentLabel = text.indexOf('"content"', nameStart);
      if (contentLabel < 0) break;
      const colon = text.indexOf(':', contentLabel);
      const openQ = text.indexOf('"', colon);
      if (openQ < 0) break;
      // Walk forward to closing `"` that is not escaped AND followed by `}` or `,"`
      let j = openQ + 1;
      let closeIdx = -1;
      while (j < text.length) {
        if (text[j] === '"') {
          // Count preceding backslashes
          let bs = 0;
          let k = j - 1;
          while (k >= openQ && text[k] === '\\') { bs++; k--; }
          if (bs % 2 === 0) {
            // Unescaped quote. Check if it's a value-terminator.
            const tail = text.substring(j + 1, j + 12);
            if (/^\s*[},]/.test(tail) || /^\s*\]/.test(tail)) { closeIdx = j; break; }
          }
        }
        j++;
      }
      if (closeIdx < 0) {
        // Take the rest as content (truncated)
        closeIdx = text.length;
      }
      const raw = text.substring(openQ + 1, closeIdx);
      const SENT = String.fromCharCode(1);
      const content = raw
        .replace(/\\\\/g, SENT)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\//g, '/')
        .split(SENT).join('\\');
      tolerantFiles.push({ name: fileName, content });
      i = closeIdx + 1;
    }
    if (tolerantFiles.length > 0) return tolerantFiles;
    // 3) Final fallback: looks like HTML? wrap as single index.html
    if (/<!doctype|<html/i.test(text)) {
      return [{ name: 'index.html', content: text }];
    }
    return [{ name: artifact?.name?.replace(/\.zip$/i, '.txt') || 'content.txt', content: text }];
  };

  const handleDownloadZip = useCallback(async () => {
    if (!artifact?.content) return;
    try {
      const files = _parseZipFiles(artifact.content);
      if (files.length === 0) { toast.error(t('ap.zip.empty')); return; }
      const res = await fetch('/api/generate/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ files, filename: artifact.name }),
        credentials: 'include',
      });
      if (!res.ok) { toast.error(t('ap.zip.error')); return; }
      const blob = await res.blob();
      const r = await saveOrShareFile(blob, artifact.name, artifact.name);
      if (r === 'downloaded') toast.success(t('ap.zip.done'));
    } catch (e) { toast.error(t('ap.zip.error')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, t]);

  const handlePrintAsPDF = useCallback(async () => {
    if (!artifact?.content) return;
    haptic('light');
    // Inside the app there is no print dialog: render the page server-side (same
    // Chromium engine as every Deiza PDF) and hand the file to the share sheet.
    if (isNative()) {
      try {
        toast.info(t('ap.pdf.generating'));
        const res = await fetch('/api/generate/pdf', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ content: localContent || artifact.content, filename: artifact.name.replace(/\.html?$/i, '') + '.pdf' }),
        });
        if (!res.ok) throw new Error('pdf');
        await saveOrShareFile(await res.blob(), artifact.name.replace(/\.html?$/i, '') + '.pdf');
      } catch { toast.error(t('ap.pdf.error')); }
      return;
    }
    // Prefer printing from the existing preview iframe: it is sandboxed (opaque
    // origin), so ask it to print itself via postMessage.
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: 'deiza-print' }, '*');
        return;
      } catch { /* fall through */ }
    }
    // Fallback: inject a hidden iframe into the current document and print from it
    const blob = new Blob([artifact.content.trim()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const hidden = document.createElement('iframe');
    hidden.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;visibility:hidden';
    hidden.src = url;
    document.body.appendChild(hidden);
    hidden.onload = () => {
      try {
        hidden.contentWindow?.focus();
        hidden.contentWindow?.print();
      } finally {
        setTimeout(() => {
          document.body.removeChild(hidden);
          URL.revokeObjectURL(url);
        }, 5000);
      }
    };
  }, [artifact]);

  /** Download raw HTML file */
  const handleDownloadHTML = useCallback(async () => {
    if (!artifact?.content) return;
    haptic('light');
    const blob = new Blob([(localContent ?? artifact.content).trim()], { type: 'text/html' });
    const r = await saveOrShareFile(blob, artifact.name, artifact.name);
    if (r === 'downloaded') toast.success(t('ap.html.done'));
  }, [artifact, localContent, t]);

  const _triggerDownload = async (blob: Blob, name: string) => saveOrShareFile(blob, name, name);

  const handleDownload = useCallback(async () => {
    if (!artifact?.content) return;
    const realContent = localContent || normalizedContent || artifact.content || '';

    haptic('light');
    // ZIP: build the REAL zip from the files list (was previously dumping raw text)
    if (ext === 'zip') {
      try {
        const files = _parseZipFiles(realContent);
        if (files.length === 0) { toast.error(t('ap.zip.empty')); return; }
        const res = await fetch('/api/generate/zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ files, filename: artifact.name }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('ZIP generation failed');
        const blob = await res.blob();
        const r = await _triggerDownload(blob, artifact.name);
        if (r === 'downloaded') toast.success(t('ap.zip.done'));
      } catch {
        toast.error(t('ap.zip.error'));
      }
      return;
    }

    // PDF: download the REAL generated PDF — never the markdown source
    if (ext === 'pdf') {
      try {
        let blob: Blob;
        if (pdfBlobUrl) {
          blob = await (await fetch(pdfBlobUrl)).blob();
        } else {
          const res = await fetch('/api/generate/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ content: realContent, filename: artifact.name }),
            credentials: 'include',
          });
          if (!res.ok) throw new Error('PDF generation failed');
          blob = await res.blob();
        }
        const r = await _triggerDownload(blob, artifact.name);
        if (r === 'downloaded') toast.success(t('ap.pdf.done'));
      } catch {
        toast.error(t('ap.pdf.error'));
      }
      return;
    }

    // DOCX: generate the real Word document
    if (ext === 'docx' || ext === 'doc') {
      try {
        const res = await fetch('/api/generate/docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ content: realContent, filename: artifact.name }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('DOCX generation failed');
        const blob = await res.blob();
        const r = await _triggerDownload(blob, artifact.name);
        if (r === 'downloaded') toast.success(t('ap.docx.done'));
      } catch {
        toast.error(t('ap.docx.error'));
      }
      return;
    }

    // Text-based files: download raw content directly
    const mimeMap: Record<string, string> = {
      json: 'application/json', css: 'text/css', py: 'text/x-python',
      md: 'text/markdown', js: 'text/javascript', ts: 'text/typescript',
      tsx: 'text/typescript', jsx: 'text/javascript',
      sql: 'text/x-sql', sh: 'text/x-shellscript',
    };
    const mimeType = mimeMap[ext] || 'text/plain';
    const blob = new Blob([(localContent ?? artifact.content).trim()], { type: mimeType });
    const r = await _triggerDownload(blob, artifact.name);
    if (r === 'downloaded') toast.success(t('artifact.downloaded'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, ext, t, pdfBlobUrl, normalizedContent, localContent]);

  const handleRefresh = useCallback(() => {
    haptic('light');
    setIframeKey(k => k + 1);
    setIframeLoading(true);
    setConsoleMessages([]);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    if (!artifact?.content) return;
    const blob = new Blob([(localContent ?? artifact.content).trim()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    // Revoke after short delay
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (!win) toast.info(t('ap.popup'));
  }, [artifact, localContent, t]);

  const handleShare = useCallback(async () => {
    if (!artifact?.content || shareLoading) return;
    setShareLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? '';
      const resp = await fetch(`${apiUrl}/api/artifacts/share`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          title: artifact.name,
          content: artifact.content,
          artifact_type: ext || 'html',
        }),
      });
      if (!resp.ok) throw new Error('Share failed');
      const data = await resp.json();
      haptic('success');
      if (isNative()) {
        await shareText(data.url, data.url, artifact.name);
      } else {
        await navigator.clipboard.writeText(data.url);
        toast.success(t('ap.share.copied'), { description: data.url, duration: 5000 });
      }
    } catch (e) {
      haptic('error');
      toast.error(t('ap.share.error'));
    } finally {
      setShareLoading(false);
    }
  }, [artifact, ext, shareLoading, t]);

  const toggleFullscreen = useCallback(() => {
    haptic('light');
    setIsFullscreen(v => !v);
  }, []);

  /* ── Content Rendering ── */
  const renderContent = () => {
    if (!artifact?.content?.trim()) {
      return (
        <div className="space-y-3 p-6" role="status" aria-label="Loading artifact">
          {[3, 5, 4, 3, 5].map((w, i) => (
            <div
              key={i}
              className="h-2.5 bg-muted/50 rounded-full animate-pulse"
              style={{ width: `${w * 15}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      );
    }

    const content = artifact.content.trim();

    /* Generated image (DZ-Image) — centered viewer */
    if (content.startsWith('data:image') || (artifact.type === 'image' && content.startsWith('/api/files/'))) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 overflow-auto">
          <img
            src={content}
            alt={artifact.name}
            className="max-w-full max-h-full object-contain rounded-2xl deiza-shadow-lg"
          />
        </div>
      );
    }

    /* HTML — full iframe render, sandboxed for safety */
    if (isHTML) {
      if (viewMode === 'source') {
        return (
          <div className="relative flex-1 flex flex-col">
            <textarea
              className="flex-1 w-full bg-transparent resize-none font-mono text-xs text-foreground/85 p-4 outline-none leading-relaxed"
              value={localContent ?? content}
              onChange={e => setLocalContent(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            {localContent !== null && localContent !== content && (
              <div className="shrink-0 p-2 border-t border-border/20 flex justify-end gap-2">
                <button
                  onClick={() => setLocalContent(null)}
                  className="px-3 py-1.5 text-xs font-body text-muted-foreground hover:text-foreground transition-colors"
                >{t('ap.reset')}</button>
                <button
                  onClick={() => { haptic('light'); setViewMode('preview'); setIframeKey(k => k + 1); }}
                  className="px-3 py-1.5 text-xs font-body bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >&#9654; {t('ap.apply')}</button>
              </div>
            )}
          </div>
        );
      }
      // Inject console interceptor into HTML to forward console.log to parent
      const consoleInterceptor = `<script>
(function(){
  var orig = {log:console.log, warn:console.warn, error:console.error, info:console.info};
  ['log','warn','error','info'].forEach(function(l){
    console[l] = function(){
      var msg = Array.from(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(e){return String(a);}}).join(' ');
      window.parent.postMessage({type:'console',level:l,msg:msg},'*');
      orig[l].apply(console,arguments);
    };
  });
  window.addEventListener('error', function(e){ window.parent.postMessage({type:'console',level:'error',msg:String(e.message||e)},'*'); });
  window.addEventListener('message', function(e){ if (e.data && e.data.type === 'deiza-print') { try { window.focus(); window.print(); } catch(err) {} } });
})();
</script>`;
      const injectedContent = effectiveContent.includes('</head>')
        ? effectiveContent.replace('</head>', consoleInterceptor + '</head>')
        : consoleInterceptor + effectiveContent;
      return (
        <>
          {iframeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card z-10 rounded-xl">
              <RoseMark size={44} mode="bloom" />
            </div>
          )}
          <iframe
            key={iframeKey}
            ref={iframeRef}
            srcDoc={injectedContent}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="w-full h-full rounded-xl border border-border/20 bg-white"
            title={artifact.name}
            onLoad={() => setIframeLoading(false)}
            style={{
              opacity: iframeLoading ? 0 : 1,
              transition: 'opacity 140ms ease-out',
              minHeight: isFullscreen ? '100vh' : '300px',
              height: isFullscreen ? '100%' : '100%',
              transform: iframeZoom !== 100 ? `scale(${iframeZoom / 100})` : undefined,
              transformOrigin: 'top left',
              width: iframeZoom !== 100 ? `${(100 / iframeZoom) * 100}%` : '100%',
            }}
          />
        </>
      );
    }

    /* PDF — pdf.js viewer everywhere (web and inside the app) */
    if (isPDF) {
      const spinner = (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="relative w-10 h-10">
            <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <div className="text-center space-y-1">
            <p className="font-body text-sm text-foreground/85">{t('ap.pdf.generating')}</p>
            <p className="font-body text-[11px] text-muted-foreground/60 italic">{t('ap.pdf.rendering')}</p>
          </div>
        </div>
      );

      /* data: URI path (base64 embedded PDF) */
      if (artifact.content.startsWith('data:')) {
        return (
          <div className="absolute inset-0">
            <Suspense fallback={<CodeSkeleton />}>
              <PDFViewerLazy
                url={artifact.content}
                fileName={artifact.name}
                onDownload={handleDownload}
              />
            </Suspense>
          </div>
        );
      }

      /* Blob URL path (generated from markdown via /api/generate/pdf) */
      return (
        <div className="absolute inset-0 flex flex-col">
          {pdfLoading ? spinner : pdfBlobUrl ? (
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<CodeSkeleton />}>
                <PDFViewerLazy
                  url={pdfBlobUrl}
                  fileName={artifact.name}
                  onDownload={handleDownload}
                />
              </Suspense>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm p-6 text-center">
              {t('ap.pdf.failed')}
              <button onClick={handleRefresh} className="px-4 py-2 rounded-full bg-muted text-foreground text-xs font-body focus-ring">{t('ap.retry')}</button>
            </div>
          )}
        </div>
      );
    }

    /* ZIP --- file tree + download */
    if (isZip) {
      const zipFiles = _parseZipFiles(artifact.content || '');

      // Detect entry HTML + linked CSS/JS for a live preview
      const entryHtml = zipFiles.find(f => f.name.toLowerCase() === 'index.html')
                     || zipFiles.find(f => f.name.toLowerCase().endsWith('.html'));
      const cssByName: Record<string, string> = {};
      const jsByName: Record<string, string> = {};
      zipFiles.forEach(f => {
        const base = f.name.split('/').pop()!.toLowerCase();
        if (base.endsWith('.css')) cssByName[base] = f.content || '';
        if (base.endsWith('.js') || base.endsWith('.mjs')) jsByName[base] = f.content || '';
      });

      // Build a runnable single-document HTML by inlining linked stylesheets and scripts
      let runnable = '';
      if (entryHtml) {
        runnable = entryHtml.content || '';
        runnable = runnable.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*\/?>(?:\s*<\/link>)?/gi, (m, href) => {
          const key = href.split('/').pop().toLowerCase();
          return cssByName[key] ? `<style>\n${cssByName[key]}\n</style>` : m;
        });
        runnable = runnable.replace(/<script[^>]*src=["']([^"']+\.(?:js|mjs))["'][^>]*>\s*<\/script>/gi, (m, src) => {
          const key = src.split('/').pop().toLowerCase();
          return jsByName[key] ? `<script>\n${jsByName[key]}\n</script>` : m;
        });
      }
      const canPreview = !!entryHtml && runnable.length > 0;
      const zipView: 'preview' | 'source' = canPreview && viewMode === 'preview' ? 'preview' : 'source';

      return (
        <div className="absolute inset-0 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/30 bg-card/50 shrink-0">
            <span className="text-[11px] font-mono text-foreground/70">
              {t('ap.files', { n: zipFiles.length })}{entryHtml ? ` · ${entryHtml.name}` : ''}
            </span>
            <div className="flex items-center gap-1">
              {canPreview && (
                <div className="flex items-center rounded-md border border-border/30 overflow-hidden">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${zipView === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                  >
                    {t('ap.preview')}
                  </button>
                  <button
                    onClick={() => setViewMode('source')}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${zipView === 'source' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                  >
                    {t('ap.files.tab')}
                  </button>
                </div>
              )}
              <button
                onClick={handleDownloadZip}
                className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
              >
                <Download className="w-3 h-3" />
                .zip
              </button>
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-hidden relative">
            {zipView === 'preview' && canPreview ? (
              <>
                {!zipFrameReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                    <RoseMark size={44} mode="bloom" />
                  </div>
                )}
                <iframe
                  srcDoc={runnable}
                  sandbox="allow-scripts allow-forms allow-modals allow-popups"
                  className="w-full h-full border-0 bg-white"
                  style={{ opacity: zipFrameReady ? 1 : 0, transition: 'opacity 140ms ease-out' }}
                  onLoad={() => setZipFrameReady(true)}
                  title={artifact.name}
                />
              </>
            ) : (
              <div className="absolute inset-0 overflow-auto p-3 space-y-2 bg-card">
                {zipFiles.length === 0 ? (
                  <p className="font-body text-sm text-muted-foreground/70 italic px-3 py-6 text-center">
                    {t('ap.zip.unreadable')}
                  </p>
                ) : zipFiles.map((file, i) => (
                  <div key={i} className="rounded-xl overflow-hidden deiza-border bg-muted/10">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/25 text-[11px] font-mono text-foreground/90 border-b border-border/30">
                      <FileCode className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                        {(file.content || '').length} chars
                      </span>
                    </div>
                    {file.content && (
                      <pre className="px-4 py-2.5 text-[11px] font-mono text-foreground/80 overflow-x-auto max-h-48 whitespace-pre-wrap bg-card/50 leading-relaxed">
                        {file.content.slice(0, 1500)}{file.content.length > 1500 ? `\n… ${t('ap.zip.truncated')}` : ''}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    /* Markdown — beautiful rendered preview */
    if (isMarkdown) {
      if (viewMode === 'source') {
        return (
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<CodeSkeleton />}>
              <SyntaxHighlighterLazy
                style={codeStyle}
                language="markdown"
                customStyle={{ background: 'transparent', padding: '0.5rem', fontSize: '0.75rem' }}
              >
                {content}
              </SyntaxHighlighterLazy>
            </Suspense>
          </div>
        );
      }
      if (!pluginsReady) return <CodeSkeleton />;
      return (
        <div className="prose prose-sm max-w-none font-body text-foreground leading-relaxed
          overflow-x-hidden [word-break:break-word] [overflow-wrap:anywhere]
          prose-headings:font-display prose-headings:text-foreground prose-headings:tracking-tight
          prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
          prose-a:text-primary prose-a:underline-offset-2
          prose-code:text-primary prose-code:bg-muted/40 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs
          prose-pre:bg-muted/20 prose-pre:rounded-xl prose-pre:border prose-pre:border-border/20 prose-pre:overflow-x-auto
          prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:italic
          prose-table:text-sm prose-th:font-semibold prose-table:w-full
          prose-strong:text-foreground prose-strong:font-semibold
          prose-hr:border-border/30
        ">
          <Suspense fallback={<CodeSkeleton />}>
            <ReactMarkdownLazy
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                /* Sanitize any raw HTML in markdown */
                html: ({ children }) => (
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify?.sanitize(String(children)) || String(children) }} />
                ),
                /* Code blocks inside markdown */
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  if (isInline) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  return (
                    <SyntaxHighlighterLazy
                      style={codeStyle}
                      language={match[1]}
                      showLineNumbers
                      customStyle={{ background: 'transparent', fontSize: '0.72rem', borderRadius: '0.75rem' }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighterLazy>
                  );
                },
              }}
            >
            {content}
          </ReactMarkdownLazy>
          </Suspense>
        </div>
      );
    }

    /* Code files — editable textarea with syntax highlight fallback */
    if (isCode) {
      const lang = getLanguageFromFilename(artifact.name);
      return (
        <div className="relative flex-1 flex flex-col">
          <textarea
            className="flex-1 w-full bg-transparent resize-none font-mono text-xs text-foreground/85 p-4 outline-none leading-relaxed"
            value={localContent ?? content}
            onChange={e => setLocalContent(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {localContent !== null && localContent !== content && (
            <div className="shrink-0 p-2 border-t border-border/20 flex justify-end gap-2">
              <button
                onClick={() => setLocalContent(null)}
                className="px-3 py-1.5 text-xs font-body text-muted-foreground hover:text-foreground transition-colors"
              >{t('ap.reset')}</button>
              <button
                onClick={() => { navigator.clipboard.writeText(localContent); haptic('light'); toast.success(t('cm.copied')); }}
                className="px-3 py-1.5 text-xs font-body bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >{t('ap.copychanges')}</button>
            </div>
          )}
          {/* Show syntax highlighter as read-only overlay hint when not editing */}
          {localContent === null && (
            <div className="absolute inset-0 pointer-events-none overflow-auto opacity-0">
              <Suspense fallback={null}>
                <SyntaxHighlighterLazy
                  style={codeStyle}
                  language={lang}
                  showLineNumbers
                  lineNumberStyle={{ color: 'hsl(var(--muted-foreground))', opacity: 0.35, fontSize: '0.68rem', userSelect: 'none' }}
                  customStyle={{ background: 'transparent', padding: '0.5rem', fontSize: '0.75rem' }}
                >
                  {content}
                </SyntaxHighlighterLazy>
              </Suspense>
            </div>
          )}
        </div>
      );
    }

    /* CSV / TSV — mini spreadsheet preview (reports, exports) */
    const _ext = (artifact.name || '').toLowerCase().split('.').pop() || '';
    if (_ext === 'csv' || _ext === 'tsv') {
      const _sep = content.includes('\t') ? '\t' : ',';
      const rows = content
        .split('\n')
        .filter(r => r.trim())
        .slice(0, 300)
        .map(r => r.split(_sep).map(c => c.replace(/^"|"$/g, '').trim()));
      if (rows.length > 0) {
        return (
          <div className="absolute inset-0 overflow-auto p-4">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {rows[0].map((h, i) => (
                    <th key={i} className="bg-muted/40 text-foreground/90 font-semibold px-3 py-2 border-b border-border/40 whitespace-nowrap text-[11px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 250).map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className={`px-3 py-1.5 border-b border-border/10 ${ci === 0 ? 'text-foreground/90' : 'text-muted-foreground'} whitespace-nowrap`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    /* Plain text / other */
    return (
      <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed p-2">
        {content}
      </pre>
    );
  };

  /* ── Badge for content type ── */
  const getTypeBadge = () => {
    if (artifact?.content?.startsWith('data:image') || artifact?.type === 'image') return { label: t('ap.badge.image'), color: 'bg-secondary/20 text-secondary-foreground border-secondary/30' };
    if (isHTML) return { label: 'HTML', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
    if (isPDF) return { label: 'PDF', color: 'bg-red-500/10 text-red-600 border-red-500/20' };
    if (isMarkdown) return { label: 'Markdown', color: 'bg-secondary/20 text-secondary-foreground border-secondary/30' };
    if (isCode) return { label: getLanguageFromFilename(artifact?.name || '').toUpperCase(), color: 'bg-primary/10 text-primary border-primary/20' };
    return { label: t('ap.badge.text'), color: 'bg-muted/40 text-muted-foreground border-border/20' };
  };

  const badge = getTypeBadge();

  // Mobile: slides up from bottom (bottom-sheet UX). Desktop: irrelevant (uses inline mode)
  const panelVariants = {
    hidden: { y: '100%', opacity: 0.6 },
    visible: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0.6, transition: { type: 'spring' as const, damping: 34, stiffness: 380 } },
  };
  // Mobile sheet: drag down from the handle/header to dismiss
  const sheetDrag = useDragControls();

  const fullscreenVariants = {
    hidden: { opacity: 0, scale: 0.97 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.97 },
  };

  /* ── Shared body content ── */
  const bodyContent = (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className={`flex-1 overflow-auto overscroll-contain min-w-0 min-h-0 relative ${(isHTML && viewMode === 'preview') || isPDF ? 'p-0' : 'p-3 sm:p-5'}`}>
        {(isHTML && viewMode === 'preview') || isPDF ? (
          <div className="h-full relative" style={{ minHeight: isPDF ? '100%' : '500px' }}>
            {renderContent()}
          </div>
        ) : (
          <div className="bg-muted/20 rounded-2xl p-4 sm:p-6 min-h-full flex flex-col deiza-border">
            {renderContent()}
          </div>
        )}
      </div>
      {/* Console log panel */}
      {showConsole && isHTML && (
        <div className="shrink-0 border-t border-border/20 bg-black/90 max-h-36 overflow-y-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
            <Terminal className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-green-400 font-mono font-medium">{t('ap.console')}</span>
            <button onClick={() => setConsoleMessages([])} className="ml-auto text-[10px] text-white/40 hover:text-white/70 font-mono">{t('ap.console.clear')}</button>
          </div>
          {consoleMessages.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-white/30 font-mono">{t('ap.console.empty')}</p>
          ) : (
            <div className="px-3 py-1 space-y-0.5">
              {consoleMessages.map((msg, i) => (
                <p key={i} className={`text-[11px] font-mono whitespace-pre-wrap break-all ${msg.startsWith('[error]') ? 'text-red-400' : msg.startsWith('[warn]') ? 'text-amber-400' : 'text-green-300'}`}>{msg}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ── Shared header props ── */
  const headerProps = {
    artifact, badge, ext, copied, viewMode,
    canToggleView, canRefresh, isFullscreen,
    onViewMode: setViewMode,
    onCopy: handleCopy,
    onDownload: isHTML ? undefined : handleDownload,
    onDownloadHTML: isHTML ? handleDownloadHTML : undefined,
    onRefresh: handleRefresh,
    onToggleFullscreen: toggleFullscreen, t,
    historyIndex, historyTotal, onPrev, onNext,
    onOpenNewTab: isHTML && !isNative() ? handleOpenNewTab : undefined,
    onPrintAsPDF: isHTML ? handlePrintAsPDF : undefined,
    onShare: handleShare,
    shareLoading,
    showConsole, onToggleConsole: () => setShowConsole(v => !v),
    consoleMessages,
    iframeZoom, onZoomIn: () => setIframeZoom(z => Math.min(200, z + 20)),
    onZoomOut: () => setIframeZoom(z => Math.max(50, z - 20)),
  };

  /* ── INLINE mode (inside ResizablePanel — no fixed positioning) ── */
  if (inline) {
    if (!open || !artifact) return null;
    return (
      <>
        {/* Fullscreen overlay (still uses fixed when in fullscreen) */}
        <AnimatePresence>
          {isFullscreen && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={toggleFullscreen}
                aria-hidden="true"
              />
              <motion.div
                className="fixed inset-4 z-50 flex flex-col rounded-2xl overflow-hidden bg-card deiza-panel-shadow"
                variants={fullscreenVariants}
                initial="hidden" animate="visible" exit="exit"
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                <PanelHeader {...headerProps} onClose={() => setIsFullscreen(false)} />
                <div className={`flex-1 overflow-auto ${(isHTML && viewMode === 'preview') || isPDF ? 'p-0' : 'p-4 sm:p-6'}`}>
                  <div className="h-full relative">
                    {renderContent()}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Inline panel — fills the ResizablePanel container; slides in from the right */}
        <motion.div
          className="flex h-full parchment-texture bg-card overflow-hidden"
          initial={{ x: 36, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 30, mass: 0.9 }}
        >
          <div className="book-spine shrink-0" />
          <motion.div
            className="flex-1 flex flex-col overflow-hidden min-w-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <PanelHeader {...headerProps} onClose={onClose} />
            {bodyContent}
          </motion.div>
        </motion.div>
      </>
    );
  }

  /* ── OVERLAY mode (mobile or standalone use) ── */
  return (
    <AnimatePresence>
      {open && artifact && (
        <>
          {/* Backdrop */}
          <motion.div
            className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 ${isFullscreen ? 'block' : 'lg:hidden'}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={isFullscreen ? toggleFullscreen : onClose}
            aria-hidden="true"
          />

          {/* Fullscreen mode */}
          <AnimatePresence>
            {isFullscreen && (
              <motion.div
                className="fixed inset-2 sm:inset-4 z-50 flex flex-col rounded-2xl overflow-hidden bg-card deiza-panel-shadow"
                variants={fullscreenVariants}
                initial="hidden" animate="visible" exit="exit"
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                <PanelHeader {...headerProps} onClose={() => setIsFullscreen(false)} />
                <div className={`flex-1 overflow-auto ${(isHTML && viewMode === 'preview') || isPDF ? 'p-0' : 'p-3 sm:p-6'}`}>
                  <div className="h-full relative">
                    {renderContent()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Normal side panel — mobile: bottom sheet style, desktop: fixed right */}
          {!isFullscreen && (
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - env(safe-area-inset-top, 0px) - 44px)' }}
              variants={panelVariants}
              initial="hidden" animate="visible" exit="exit"
              transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.9 }}
              drag="y"
              dragListener={false}
              dragControls={sheetDrag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 700) { haptic('light'); onClose(); } }}
            >
              <div className="book-spine shrink-0 hidden lg:block" />
              <div className="flex-1 flex flex-col parchment-texture deiza-panel-shadow bg-card overflow-hidden rounded-t-3xl lg:rounded-none min-w-0">
                {/* Mobile drag handle — grab here (or the header) and pull down to close */}
                <div
                  className="lg:hidden pt-2.5 pb-1 flex justify-center shrink-0 touch-none cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => sheetDrag.start(e)}
                  aria-hidden="true"
                >
                  <div className="w-10 h-1 rounded-full bg-border/60" />
                </div>
                <div onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; sheetDrag.start(e); }}>
                  <PanelHeader {...headerProps} onClose={onClose} />
                </div>
                <div className="flex-1 flex flex-col min-h-0 pb-[env(safe-area-inset-bottom,0px)]">{bodyContent}</div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};

/* ── Extracted Header Component ── */
interface PanelHeaderProps {
  artifact: { name: string; type: string; content?: string };
  badge: { label: string; color: string };
  ext: string;
  copied: boolean;
  viewMode: 'preview' | 'source';
  canToggleView: boolean;
  canRefresh: boolean;
  isFullscreen: boolean;
  onViewMode: (mode: 'preview' | 'source') => void;
  onCopy: () => void;
  onDownload?: () => void;
  onDownloadHTML?: () => void;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  historyIndex?: number;
  historyTotal?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenNewTab?: () => void;
  onPrintAsPDF?: () => void;
  onShare?: () => void;
  shareLoading?: boolean;
  showConsole?: boolean;
  onToggleConsole?: () => void;
  consoleMessages?: string[];
  iframeZoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

const PanelHeader = ({
  artifact, badge, ext, copied, viewMode, canToggleView, canRefresh,
  isFullscreen, onViewMode, onCopy, onDownload, onDownloadHTML, onRefresh,
  onToggleFullscreen, onClose, t,
  historyIndex = -1, historyTotal = 0, onPrev, onNext,
  onOpenNewTab, onPrintAsPDF,
  onShare, shareLoading = false,
  showConsole = false, onToggleConsole,
  iframeZoom = 100, onZoomIn, onZoomOut,
}: PanelHeaderProps) => (
  <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 deiza-border border-t-0 border-l-0 border-r-0 shrink-0 gap-2">
    {/* Left: name + badge + history nav */}
    <div className="flex items-center gap-2 min-w-0">
      {/* History prev/next — only shown when there are multiple artifacts */}
      {historyTotal > 1 && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onPrev}
            disabled={historyIndex <= 0}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-25 focus-ring"
            aria-label={t('ap.prev')}
            title={t('ap.prev')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-body text-[10px] text-muted-foreground/60 tabular-nums">
            {historyIndex + 1}/{historyTotal}
          </span>
          <button
            onClick={onNext}
            disabled={historyIndex >= historyTotal - 1}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-25 focus-ring"
            aria-label={t('ap.next')}
            title={t('ap.next')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <TypeIcon ext={ext} />
      <h3 className="font-display text-base text-foreground truncate" title={artifact.name}>
        {artifact.name}
      </h3>
      <span className={`hidden sm:inline font-body text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}>
        {badge.label}
      </span>
    </div>

    {/* Right: controls */}
    <div className="flex items-center gap-0.5 shrink-0">
      {/* Preview / Source toggle */}
      {canToggleView && (
        <div className="flex items-center bg-muted/50 rounded-full p-0.5 mr-1.5 border border-border/20">
          <button
            onClick={() => onViewMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-body transition-all duration-200 ${
              viewMode === 'preview'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={t('ap.preview')}
            aria-pressed={viewMode === 'preview'}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">{t('ap.preview')}</span>
          </button>
          <button
            onClick={() => onViewMode('source')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-body transition-all duration-200 ${
              viewMode === 'source'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={t('ap.code')}
            aria-pressed={viewMode === 'source'}
          >
            <Code className="w-3 h-3" />
            <span className="hidden sm:inline">{t('ap.code')}</span>
          </button>
        </div>
      )}

      {/* Refresh (HTML/PDF only) */}
      {canRefresh && viewMode === 'preview' && (
        <button
          onClick={onRefresh}
          className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
          aria-label={t('ap.refresh')}
          title={t('ap.refresh')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Fullscreen toggle */}
      <button
        onClick={onToggleFullscreen}
        className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
        aria-label={isFullscreen ? t('ap.exitfull') : t('im.fullscreen')}
        title={isFullscreen ? t('ap.exitfull') : t('im.fullscreen')}
      >
        {isFullscreen
          ? <Minimize2 className="w-3.5 h-3.5" />
          : <Maximize2 className="w-3.5 h-3.5" />
        }
      </button>

      {/* Zoom controls (HTML preview) */}
      {onZoomIn && iframeZoom !== undefined && (
        <>
          <button onClick={onZoomOut} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring" title={t('ap.zoomout')} aria-label={t('ap.zoomout')}>
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground/60 w-8 text-center tabular-nums">{iframeZoom}%</span>
          <button onClick={onZoomIn} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring" title={t('ap.zoomin')} aria-label={t('ap.zoomin')}>
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {/* Console toggle (HTML only) */}
      {onToggleConsole && (
        <button
          onClick={onToggleConsole}
          className={`p-2 rounded-full transition-colors focus-ring ${showConsole ? 'bg-green-500/20 text-green-600' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
          title={t('ap.console')}
          aria-label={t('ap.console')}
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Open in new tab (HTML) */}
      {onOpenNewTab && (
        <button
          onClick={onOpenNewTab}
          className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
          aria-label={t('ap.newtab')}
          title={t('ap.newtab')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Share button */}
      {onShare && (
        <button
          onClick={onShare}
          disabled={shareLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors focus-ring text-[11px] font-body font-medium disabled:opacity-50"
          aria-label={t('cm.share.aria')}
          title={t('cm.share')}
        >
          <Share2 className={`w-3 h-3 ${shareLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('cm.share')}</span>
        </button>
      )}

      {/* HTML artifacts: PDF pill + HTML pill — two clear export options, no format menu */}
      {onPrintAsPDF && (
        <button
          onClick={onPrintAsPDF}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors focus-ring text-[11px] font-body font-medium"
          aria-label={t('ap.savepdf')}
          title={t('ap.savepdf')}
        >
          <Printer className="w-3 h-3" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      )}
      {onDownloadHTML && (
        <button
          onClick={onDownloadHTML}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring text-[11px] font-body font-medium"
          aria-label={t('ap.downloadhtml')}
          title={t('ap.downloadhtml')}
        >
          <Download className="w-3 h-3" />
          <span className="hidden sm:inline">HTML</span>
        </button>
      )}

      {/* Copy */}
      <button
        onClick={onCopy}
        className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
        aria-label={t('artifact.copy')}
        title={t('artifact.copy')}
        disabled={!artifact.content}
      >
        {copied
          ? <Check className="w-3.5 h-3.5 text-green-600" />
          : <Copy className="w-3.5 h-3.5" />
        }
      </button>

      {/* Download (non-HTML files only) */}
      {onDownload && (
        <button
          onClick={onDownload}
          className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring"
          aria-label={t('artifact.download')}
          title={t('artifact.download')}
          disabled={!artifact.content}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-ring ml-0.5"
        aria-label={t('artifact.close')}
        title={t('artifact.close')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

export default ArtifactPanel;
