import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Loader2, Globe, ImageIcon } from 'lucide-react';
import { api, assetUrl } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import type { WorkFile, WorkShot } from '@/lib/workTypes';

const VIEW_W = 1280;
const VIEW_H = 800;
const SPECIAL_KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft',
  'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

interface Props {
  chatId?: number;
  shot: WorkShot | null;
  onShot: (s: WorkShot) => void;
  files: WorkFile[];
  /** The agent is driving: the user watches, input is paused so they don't fight over the page. */
  agentBusy: boolean;
  onClose: () => void;
  /** Phones: full-screen sheet instead of a side panel. */
  overlay?: boolean;
}

/**
 * Deiza Work "computer": the live browser the agent uses (the user can take over when it is idle)
 * and the images it prepared for the deliverable.
 */
const WorkPanel = ({ chatId, shot, onShot, files, agentBusy, onClose, overlay }: Props) => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'browser' | 'files'>('browser');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState(shot?.url || '');
  const [editingAddress, setEditingAddress] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const typed = useRef('');
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheel = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { if (!editingAddress && shot?.url) setAddress(shot.url); }, [shot?.url, editingAddress]);

  const act = useCallback((body: Record<string, any>) => {
    if (!chatId) return;
    // Actions run one after another, in the order the user made them.
    queue.current = queue.current.then(async () => {
      setBusy(true);
      setError('');
      try {
        const st = await api.workBrowser(chatId, body);
        if (st?.shot) onShot({ img: st.shot, url: st.url || '', title: st.title });
        if (st?.error) setError(String(st.error));
      } catch {
        setError(t('ws.work.browser_error'));
      } finally {
        setBusy(false);
      }
    });
  }, [chatId, onShot, t]);

  // Opening the panel on a Work chat shows the page the session is on, if it is still alive.
  useEffect(() => {
    if (chatId && !shot && !agentBusy) act({ action: 'status' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const flushTyping = useCallback(() => {
    if (typeTimer.current) { clearTimeout(typeTimer.current); typeTimer.current = null; }
    if (typed.current) { const text = typed.current; typed.current = ''; act({ action: 'type', text }); }
  }, [act]);

  const onScreenClick = (e: React.MouseEvent) => {
    if (agentBusy || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    flushTyping();
    act({ action: 'click', x: Math.round((e.clientX - r.left) * VIEW_W / r.width), y: Math.round((e.clientY - r.top) * VIEW_H / r.height) });
  };

  const onScreenKey = (e: React.KeyboardEvent) => {
    if (agentBusy || e.metaKey || e.ctrlKey || e.altKey) return;
    if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      flushTyping();
      act({ action: 'key', key: e.key });
    } else if (e.key.length === 1) {
      e.preventDefault();
      typed.current += e.key;
      if (typeTimer.current) clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(flushTyping, 260);
    }
  };

  const onScreenWheel = (e: React.WheelEvent) => {
    if (agentBusy) return;
    wheel.current += e.deltaY;
    if (wheelTimer.current) return;
    wheelTimer.current = setTimeout(() => {
      const dy = Math.max(-2400, Math.min(2400, Math.round(wheel.current)));
      wheel.current = 0;
      wheelTimer.current = null;
      if (Math.abs(dy) > 20) act({ action: 'scroll', dy });
    }, 280);
  };

  const go = () => {
    let v = address.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      v = /\s/.test(v) || !/\.[a-z]{2,}/i.test(v) ? `https://duckduckgo.com/?q=${encodeURIComponent(v)}` : `https://${v}`;
    }
    setEditingAddress(false);
    act({ action: 'open', url: v });
  };

  const navBtn = 'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring disabled:opacity-40 disabled:pointer-events-none';
  const tabBtn = (on: boolean) => `px-2.5 py-1 rounded-md text-[12.5px] transition-colors focus-ring ${on ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div className={`${overlay ? 'fixed inset-0 z-50 pt-[env(safe-area-inset-top,0px)]' : 'h-full'} flex flex-col bg-background border-l border-border/25 font-body min-w-0`}>
      <div className="flex items-center gap-1 px-3 h-12 border-b border-border/25 shrink-0">
        <span className="font-display text-[17px] text-foreground mr-2">{t('ws.work.panel')}</span>
        <button className={tabBtn(tab === 'browser')} onClick={() => setTab('browser')}>{t('ws.work.browser')}</button>
        <button className={tabBtn(tab === 'files')} onClick={() => setTab('files')}>
          {t('ws.work.files')}{files.length ? ` · ${files.length}` : ''}
        </button>
        <button onClick={onClose} className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring" aria-label={t('ws.work.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {tab === 'browser' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-1 px-2 py-2 shrink-0">
            <button className={navBtn} disabled={agentBusy || !shot} onClick={() => act({ action: 'back' })} aria-label={t('ws.work.back')}><ArrowLeft className="w-4 h-4" /></button>
            <button className={navBtn} disabled={agentBusy || !shot} onClick={() => act({ action: 'forward' })} aria-label={t('ws.work.forward')}><ArrowRight className="w-4 h-4" /></button>
            <button className={navBtn} disabled={agentBusy || !shot} onClick={() => act({ action: 'reload' })} aria-label={t('ws.work.reload')}><RotateCw className="w-4 h-4" /></button>
            <div className="flex-1 min-w-0 flex items-center gap-2 h-8 px-2.5 rounded-md bg-muted/40 border border-border/30 focus-within:border-primary/40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <input
                value={address}
                onChange={e => { setEditingAddress(true); setAddress(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { setEditingAddress(false); setAddress(shot?.url || ''); } }}
                onBlur={() => setEditingAddress(false)}
                disabled={agentBusy || !chatId}
                placeholder={t('ws.work.address')}
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-foreground/90 placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-2 pb-2">
            {shot ? (
              <div className="relative rounded-lg overflow-hidden border border-border/30 bg-black/20">
                <div
                  tabIndex={agentBusy ? -1 : 0}
                  onClick={onScreenClick}
                  onKeyDown={onScreenKey}
                  onWheel={onScreenWheel}
                  onBlur={flushTyping}
                  className={`outline-none ${agentBusy ? 'cursor-default' : 'cursor-pointer focus:ring-1 focus:ring-primary/40'}`}
                >
                  <img
                    ref={imgRef}
                    src={`data:image/jpeg;base64,${shot.img}`}
                    alt={shot.title || shot.url}
                    draggable={false}
                    className="block w-full h-auto select-none"
                  />
                </div>
                <div className="absolute left-2 bottom-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/85 border border-border/30 text-[11px] text-foreground/75">
                  <span className={`w-1.5 h-1.5 rounded-full ${agentBusy ? 'bg-primary animate-pulse' : 'bg-[hsl(95_25%_55%)]'}`} />
                  {agentBusy ? t('ws.work.agent_busy') : t('ws.work.you_control')}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-8 gap-2">
                <Globe className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-[13px] text-muted-foreground max-w-[300px] leading-relaxed">{t('ws.work.empty')}</p>
              </div>
            )}
            {error && <p className="mt-2 px-1 text-[12px] text-destructive/85">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {files.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-8 gap-2">
              <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
              <p className="text-[13px] text-muted-foreground max-w-[300px] leading-relaxed">{t('ws.work.no_files')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {files.map(f => (
                <a key={f.url} href={assetUrl(f.url)} target="_blank" rel="noreferrer" className="group block rounded-lg overflow-hidden border border-border/30 bg-muted/20 focus-ring">
                  <img src={assetUrl(f.url)} alt={f.name || ''} loading="lazy" className="w-full aspect-[4/3] object-cover" />
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground truncate">
                    {f.w && f.h ? `${f.w} × ${f.h}` : ''}{f.name && f.name !== 'edit' ? ` · ${f.name}` : f.name === 'edit' ? ` · ${t('ws.work.edited')}` : ''}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkPanel;
