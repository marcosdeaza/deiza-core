import { useState } from 'react';
import {
  Search, Globe, BookOpen, MousePointerClick, Keyboard, ArrowDownUp, Undo2, Images, ImageDown, Wand2,
  ScanEye, Check, X, Loader2, ChevronDown, MonitorPlay,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { assetUrl } from '@/services/api';
import type { WorkState } from '@/lib/workTypes';

const ICONS: Record<string, typeof Search> = {
  web_search: Search, browser_open: Globe, browser_read: BookOpen, browser_click: MousePointerClick,
  browser_type: Keyboard, browser_scroll: ArrowDownUp, browser_back: Undo2, image_search: Images,
  save_image: ImageDown, edit_image: Wand2, preview_document: ScanEye,
};

/** URLs read better as host + path than as a raw string. */
const prettyDetail = (d?: string) => {
  if (!d) return '';
  if (/^https?:\/\//.test(d)) {
    try {
      const u = new URL(d);
      return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '');
    } catch { return d; }
  }
  return d;
};

interface Props {
  work: WorkState;
  live: boolean;
  thinking?: string;
  onOpenComputer?: () => void;
}

/**
 * The visible trail of a Work job: plan, every tool step and the images it prepared.
 * Open while the job runs; folded into one line once it is done (the answer is what matters then).
 */
const WorkTrace = ({ work, live, thinking, onOpenComputer }: Props) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? live;
  const steps = work.items.filter(i => i.kind === 'step');
  const running = steps.filter(s => s.kind === 'step' && s.status === 'run').pop();
  const headline = live
    ? (running && running.kind === 'step' ? running.label : thinking || t('ws.work.working'))
    : steps.length === 1 ? t('ws.work.done_one') : t('ws.work.done', { n: steps.length });

  return (
    <div className="mb-4 sm:mb-5 font-body">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!expanded)}
          className="group flex items-center gap-2 min-w-0 rounded-md py-1 pr-1 text-left focus-ring"
          aria-expanded={expanded}
        >
          <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
            {live
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              : <span className="w-2 h-2 rounded-[2px] bg-primary/80" />}
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-primary/90 shrink-0">Work</span>
          <span className="text-[13px] text-foreground/75 truncate">{headline}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {onOpenComputer && (
          <button
            onClick={onOpenComputer}
            className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-ring shrink-0"
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('ws.work.open_panel')}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 ml-[7px] border-l border-border/45 pl-4 space-y-1.5">
          {work.plan && work.plan.length > 0 && (
            <ol className="mb-2.5 space-y-1">
              {work.plan.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-5">
                  <span className={`mt-[4px] w-3 h-3 rounded-[3px] border shrink-0 flex items-center justify-center ${p.done ? 'bg-primary/85 border-primary/85' : 'border-border'}`}>
                    {p.done && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                  </span>
                  <span className={p.done ? 'text-foreground/55 line-through decoration-foreground/25' : 'text-foreground/85'}>{p.text}</span>
                </li>
              ))}
            </ol>
          )}
          {work.items.map(item => {
            if (item.kind === 'note') {
              return <p key={item.id} className="text-[12.5px] leading-5 text-foreground/55 italic">{item.text}</p>;
            }
            const Icon = ICONS[item.tool] || Globe;
            return (
              <div key={item.id} className="flex items-center gap-2 text-[12.5px] leading-5 min-w-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground/80 shrink-0">{item.label}</span>
                {item.detail && <span className="text-muted-foreground/80 truncate min-w-0">{prettyDetail(item.detail)}</span>}
                <span className="ml-auto shrink-0 pl-2">
                  {item.status === 'run' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {item.status === 'ok' && <Check className="w-3 h-3 text-[hsl(95_25%_55%)]" />}
                  {item.status === 'err' && <span title={item.error}><X className="w-3 h-3 text-destructive/80" /></span>}
                </span>
              </div>
            );
          })}
          {live && thinking && !running && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground/80">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="truncate">{thinking}</span>
            </div>
          )}
        </div>
      )}

      {work.files.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {work.files.slice(-10).map(f => (
            <a key={f.url} href={assetUrl(f.url)} target="_blank" rel="noreferrer" className="shrink-0 focus-ring rounded-md">
              <img
                src={assetUrl(f.url)}
                alt={f.name || ''}
                loading="lazy"
                className="h-14 w-14 object-cover rounded-md border border-border/40 bg-muted/30"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkTrace;
