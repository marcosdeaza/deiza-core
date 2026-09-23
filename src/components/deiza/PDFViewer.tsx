import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isNative, haptic } from '@/lib/native';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// The worker ships as a plain .js file at the site root (see vite.config.ts) so it
// loads in every browser and inside the Capacitor web view.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js?v=' + pdfjs.version;

interface PDFViewerProps {
  url: string;
  fileName?: string;
  onDownload?: () => void;
}

/** Only pages near the viewport are rasterised: a 40-page report stays smooth on a phone. */
const LazyPage = ({ pageNumber, width, scale, active, onVisible }: { pageNumber: number; width: number; scale: number; active: boolean; onVisible: (n: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setNear(true); if (e.intersectionRatio > 0.5) onVisible(pageNumber); }
      }
    }, { rootMargin: '900px 0px', threshold: [0, 0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, onVisible]);
  const h = Math.round(width * scale * 1.414);
  return (
    <div ref={ref} className={`mb-2 rounded-sm ${active ? 'ring-2 ring-primary/30' : ''}`} style={{ minHeight: near ? undefined : h, width: Math.round(width * scale) }}>
      {near ? (
        <Page pageNumber={pageNumber} scale={scale} width={width} renderTextLayer renderAnnotationLayer
          loading={<div className="bg-white/90 animate-pulse rounded-sm" style={{ width: Math.round(width * scale), height: h }} />} />
      ) : (
        <div className="bg-white/80 rounded-sm" style={{ width: Math.round(width * scale), height: h }} />
      )}
    </div>
  );
};

const PDFViewer = ({ url, fileName, onDownload }: PDFViewerProps) => {
  const { t } = useLanguage();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pageWidth, setPageWidth] = useState(300);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setPageWidth(Math.max(200, w - 24));
      }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && containerRef.current ? new ResizeObserver(measure) : null;
    ro?.observe(containerRef.current!);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); ro?.disconnect(); };
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const onVisible = useCallback((n: number) => setPageNumber(n), []);

  const scrollToPage = (n: number) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPageNumber(n);
  };

  const zoomIn = () => { haptic('selection'); setScale(s => Math.min(2.5, +(s + 0.25).toFixed(2))); };
  const zoomOut = () => { haptic('selection'); setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2))); };
  const prevPage = () => { haptic('selection'); scrollToPage(Math.max(1, pageNumber - 1)); };
  const nextPage = () => { haptic('selection'); scrollToPage(Math.min(numPages, pageNumber + 1)); };

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
        <p className="font-body text-sm text-muted-foreground">{t('ap.pdf.failed')}</p>
        {onDownload && (
          <button onClick={onDownload} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-body hover:bg-primary/90 transition-colors">
            {t('artifact.download')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-card/80 border-b border-border/30 gap-2">
        <div className="flex items-center gap-1">
          <button onClick={prevPage} disabled={pageNumber <= 1} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors" aria-label={t('im.prev')}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums min-w-[60px] text-center">
            {pageNumber} / {numPages || '…'}
          </span>
          <button onClick={nextPage} disabled={pageNumber >= numPages} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors" aria-label={t('im.next')}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t('ap.zoomout')}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t('ap.zoomin')}>
            <ZoomIn className="w-4 h-4" />
          </button>
          {onDownload && (
            <button onClick={() => { haptic('light'); onDownload(); }} className="ml-1 p-1.5 rounded-lg hover:bg-muted transition-colors" title={t('artifact.download')} aria-label={t('artifact.download')}>
              {isNative() ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="flex-1 overflow-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 min-h-[40vh]">
            <div className="relative w-8 h-8">
              <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
              <span className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="font-body text-xs text-muted-foreground">{t('common.loading')}</p>
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          className="flex flex-col items-center py-3"
          externalLinkTarget="_blank"
        >
          {Array.from({ length: numPages || 0 }, (_, i) => i + 1).map(page => (
            <div key={page} data-page={page} ref={el => { pageRefs.current[page] = el; }}>
              <LazyPage pageNumber={page} width={pageWidth} scale={scale} active={page === pageNumber} onVisible={onVisible} />
            </div>
          ))}
        </Document>
        {fileName && numPages > 0 && (
          <p className="text-center font-body text-[11px] text-muted-foreground/50 pb-4">{fileName} · {numPages} {t('ap.pages')}</p>
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
