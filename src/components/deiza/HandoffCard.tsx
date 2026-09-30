import { useState } from 'react';
import { Copy, Check, Download, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import CapuSprite from './CapuSprite';

export interface Handoff { name: string; url?: string; content: string }

/**
 * The usage quota ran out during this answer: Deiza lent a courtesy margin to close it and left a
 * clean Markdown handoff (goal, context, what was done, what is left, a ready prompt) to carry on in
 * another session or paste into another AI.
 */
export default function HandoffCard({ handoff }: { handoff: Handoff }) {
  const { language } = useLanguage();
  const es = language === 'es' || !language;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoff.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(es ? 'No se pudo copiar' : 'Could not copy');
    }
  };
  const download = () => {
    const blob = new Blob([handoff.content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = handoff.name || 'deiza-traspaso.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="mt-4 rounded-2xl border border-[hsl(var(--deiza-ochre)/0.45)] bg-[hsl(var(--deiza-ochre)/0.07)] px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <CapuSprite scene="wilt" px={1.5} className="shrink-0 opacity-95" label="Capu escribiendo el traspaso" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] text-foreground">{es ? 'Traspaso listo' : 'Handoff ready'}</div>
          <p className="mt-0.5 font-body text-[13px] leading-snug text-muted-foreground">
            {es
              ? 'Se acabó tu uso durante esta respuesta. Deiza la ha cerrado con un margen de cortesía y te deja el contexto, lo hecho y lo pendiente para seguir en otra sesión o pegárselo a otra IA.'
              : 'Your usage ran out during this answer. Deiza closed it with a courtesy margin and left the context, what was done and what is left, to continue in another session or paste into another AI.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-[52px]">
        <button onClick={download} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 font-body text-xs font-medium text-primary-foreground hover:brightness-110">
          <Download className="h-3.5 w-3.5" /> {es ? 'Descargar .md' : 'Download .md'}
        </button>
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3.5 py-1.5 font-body text-xs text-foreground hover:bg-muted/50">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? (es ? 'Copiado' : 'Copied') : (es ? 'Copiar' : 'Copy')}
        </button>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-body text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
          {es ? 'Ver' : 'View'} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/60 p-3 font-mono text-[12px] leading-relaxed text-foreground/90">{handoff.content}</pre>
      )}
    </div>
  );
}
