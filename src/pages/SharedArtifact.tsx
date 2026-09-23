import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { useLanguage } from '@/contexts/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface SharedArtifactData {
  slug: string;
  title: string;
  content: string;
  artifact_type: string;
  created_at: string;
  view_count: number;
}

/** Defensive + tolerant parser — same as ArtifactPanel */
function parseZipFiles(rawContent: string, fallbackName: string): { name: string; content: string }[] {
  if (!rawContent) return [];
  const text = rawContent.trim();
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
  } catch { /* fall through to tolerant walk */ }
  // Tolerant walk — recovers files when AI emits broken JSON escapes
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
    let j = openQ + 1;
    let closeIdx = -1;
    while (j < text.length) {
      if (text[j] === '"') {
        let bs = 0, k = j - 1;
        while (k >= openQ && text[k] === '\\') { bs++; k--; }
        if (bs % 2 === 0) {
          const tail = text.substring(j + 1, j + 12);
          if (/^\s*[},]/.test(tail) || /^\s*\]/.test(tail)) { closeIdx = j; break; }
        }
      }
      j++;
    }
    if (closeIdx < 0) closeIdx = text.length;
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
  if (/<!doctype|<html/i.test(text)) {
    return [{ name: 'index.html', content: text }];
  }
  return [{ name: fallbackName.replace(/\.zip$/i, '.txt') || 'content.txt', content: text }];
}

/** Inline CSS/JS/assets into a single runnable HTML doc */
function buildRunnableHTML(zipFiles: { name: string; content: string }[]): string | null {
  const entry = zipFiles.find(f => f.name.toLowerCase() === 'index.html')
              || zipFiles.find(f => f.name.toLowerCase().endsWith('.html'));
  if (!entry) return null;
  const cssByName: Record<string, string> = {};
  const jsByName: Record<string, string> = {};
  const imgByName: Record<string, string> = {};
  const IMG_MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.avif': 'image/avif', '.bmp': 'image/bmp',
  };
  zipFiles.forEach(f => {
    const base = f.name.split('/').pop()!.toLowerCase();
    if (base.endsWith('.css')) cssByName[base] = f.content || '';
    if (base.endsWith('.js') || base.endsWith('.mjs')) jsByName[base] = f.content || '';
    const mime = IMG_MIME[base.slice(base.lastIndexOf('.'))];
    if (mime && f.content && /^[A-Za-z0-9+/=\r\n]+$/.test(f.content) && f.content.replace(/[\r\n]/g, '').length > 100) {
      imgByName[base] = `data:${mime};base64,${f.content.replace(/[\r\n]/g, '')}`;
    }
  });
  let html = entry.content || '';
  html = html.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*\/?>(?:\s*<\/link>)?/gi, (m, href) => {
    const key = href.split('/').pop().toLowerCase();
    return cssByName[key] ? `<style>\n${cssByName[key]}\n</style>` : m;
  });
  html = html.replace(/<script([^>]*)\bsrc=["']([^"']+\.(?:js|mjs))["']([^>]*)>\s*<\/script>/gi, (m, before, src, after) => {
    const key = src.split('/').pop().toLowerCase();
    if (!jsByName[key]) return m;
    const isModule = /\btype=["']module["']/i.test(before + after);
    return `<script${isModule ? ' type="module"' : ''}>\n${jsByName[key]}\n</script>`;
  });
  html = html.replace(/(<(?:img|audio|video|source)[^>]*\bsrc=["']|<\s*link[^>]*\brel=["']icon["'][^>]*\bhref=["'])([^"']+)(["'])/gi, (m, pre, ref, post) => {
    const key = ref.split('/').pop()!.split('?')[0].toLowerCase();
    return imgByName[key] ? pre + imgByName[key] + post : m;
  });
  return html;
}

const SharedArtifactPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useLanguage();
  const [artifact, setArtifact] = useState<SharedArtifactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_URL}/api/artifacts/share/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Artifact not found');
        return res.json();
      })
      .then(data => {
        setArtifact(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  const ext = (artifact?.title || '').split('.').pop()?.toLowerCase() || '';
  const type = (artifact?.artifact_type || '').toLowerCase();
  const isHTML = ['html', 'htm'].includes(type) || ['html', 'htm'].includes(ext);
  const isZip = type === 'zip' || ext === 'zip';
  const isPDF = type === 'pdf' || ext === 'pdf';

  // For ZIP: compute the runnable HTML
  const zipRunnable = useMemo(() => {
    if (!isZip || !artifact) return null;
    const files = parseZipFiles(artifact.content, artifact.title);
    return buildRunnableHTML(files);
  }, [isZip, artifact]);

  // For PDF: fetch the generated PDF blob
  useEffect(() => {
    let url: string | null = null;
    if (!isPDF || !artifact) { setPdfBlobUrl(null); return; }
    // Public endpoint — works for anonymous visitors (generate/pdf requires login)
    fetch(`${API_URL}/api/artifacts/share/${slug}/pdf`)
      .then(r => r.ok ? r.blob() : Promise.reject(new Error('PDF gen failed')))
      .then(blob => { url = URL.createObjectURL(blob); setPdfBlobUrl(url); })
      .catch(() => setPdfBlobUrl(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [isPDF, artifact]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <img src={logo} alt="Deiza" className="w-16 h-16 blend-multiply animate-pulse" />
          <p className="font-body text-muted-foreground text-sm">{t('common.loading')}</p>
        </motion.div>
      </div>
    );
  }

  if (error || !artifact) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <img src={logo} alt="Deiza" className="w-16 h-16 blend-multiply mx-auto opacity-50" />
          <h1 className="font-display text-2xl text-foreground">{t('sa.notfound')}</h1>
          <p className="font-body text-muted-foreground text-sm">{t('sh.notfound.sub')}</p>
          <a href="/" className="inline-block mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-body text-sm hover:opacity-90 transition-opacity">
            {t('sh.cta')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-8 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-border/30 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <img src={logo} alt="" className="w-8 h-8 blend-multiply" />
            <span className="font-display text-xl text-foreground">Deiza</span>
          </a>
          <span className="text-border/60 hidden sm:inline">|</span>
          <span className="font-body text-sm text-muted-foreground truncate max-w-xs hidden sm:block">{artifact.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-muted-foreground/60 hidden sm:block">{artifact.view_count} {t('sh.views')}</span>
          <a href="/workspace" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-body text-xs transition-colors">
            {t('sh.cta')} →
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {isHTML ? (
          <iframe
            srcDoc={artifact.content}
            sandbox="allow-scripts allow-forms allow-popups"
            className="flex-1 min-h-0 w-full border-0 bg-white"
            title={artifact.title}
          />
        ) : isZip && zipRunnable ? (
          <iframe
            srcDoc={zipRunnable}
            sandbox="allow-scripts allow-forms allow-popups"
            className="flex-1 min-h-0 w-full border-0 bg-white"
            title={artifact.title}
          />
        ) : isZip ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <p className="font-body text-sm text-muted-foreground">
                {t('sa.zip.noindex')}
              </p>
            </div>
          </div>
        ) : isPDF ? (
          pdfBlobUrl ? (
            <iframe
              src={`${pdfBlobUrl}#view=FitH`}
              className="flex-1 min-h-0 w-full border-0 bg-white"
              title={artifact.title}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="font-body text-sm text-muted-foreground">{t('ap.pdf.generating')}</span>
              </div>
            </div>
          )
        ) : (
          <div className="flex-1 overflow-auto p-4 sm:p-8">
            <div className="max-w-3xl mx-auto">
              <h1 className="font-display text-2xl text-foreground mb-6">{artifact.title}</h1>
              <pre className="whitespace-pre-wrap font-mono text-sm text-foreground bg-muted/20 rounded-xl p-6 border border-border/20 overflow-x-auto">
                {artifact.content}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedArtifactPage;
