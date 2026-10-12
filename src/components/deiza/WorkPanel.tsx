import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Loader2, Globe, ImageIcon, Maximize2, Minimize2, MonitorUp, ArrowUp, Square } from 'lucide-react';
import { api, assetUrl, hasLocalBrowser } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import type { WorkFile, WorkShot, WorkState } from '@/lib/workTypes';
import AudioRecorder from './AudioRecorder';
import ModelSelector, { type ModelKey, type Effort } from './ModelSelector';

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
  /** Phones and the expanded view: full-screen sheet instead of a side panel. */
  overlay?: boolean;
  maximized?: boolean;
  onToggleMax?: () => void;
  model: ModelKey;
  effort: Effort;
  userPlan: string;
  onModelChange: (model: ModelKey) => void;
  onEffortChange: (effort: Effort) => void;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  work?: WorkState;
}

/** Where the picture really sits inside its box (object-fit: contain). */
function contentRect(img: HTMLImageElement) {
  const r = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1280, nh = img.naturalHeight || 800;
  const k = Math.min(r.width / nw, r.height / nh);
  const w = nw * k, h = nh * k;
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, nw, nh, k, ox: (r.width - w) / 2, oy: (r.height - h) / 2 };
}

/**
 * Deiza Work "computer": the live browser the agent uses (the user can take over when it is idle)
 * and the images it prepared for the deliverable. browser fit v1: the page fills the panel (the
 * server sizes its viewport to the panel's shape) and Deiza's pointer shows where it acts.
 * In Deiza for desktop the browser runs on the user's computer, full screen, and this is a mirror.
 */
const WorkPanel = ({ chatId, shot, onShot, files, agentBusy, onClose, overlay, maximized, onToggleMax,
  model, effort, userPlan, onModelChange, onEffortChange, onSend, onStop, work }: Props) => {
  const { t } = useLanguage();
  const local = hasLocalBrowser();
  const [tab, setTab] = useState<'browser' | 'files'>('browser');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [voice, setVoice] = useState('idle');
  const [address, setAddress] = useState(shot?.url || '');
  const [editingAddress, setEditingAddress] = useState(false);
  const [echo, setEcho] = useState('');
  const [pointer, setPointer] = useState<{ x: number; y: number; n: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const typed = useRef('');
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheel = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const viewport = useRef<{ w: number; h: number } | null>(null);
  const sentViewport = useRef('');

  useEffect(() => { setDraft(''); setError(''); }, [chatId]);
  useEffect(() => () => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
  }, []);
  const send = async () => {
    const text = draft.trim();
    if (!text || sending || voice !== 'idle') return;
    setSending(true);
    try {
      if (await onSend(text)) setDraft(prev => prev.trim() === text ? '' : prev);
    } finally { setSending(false); }
  };

  useEffect(() => { if (!editingAddress && shot?.url) setAddress(shot.url); }, [shot?.url, editingAddress]);
  // Deiza's pointer follows the agent's last click or drag.
  useEffect(() => {
    if (shot?.pointer && Number.isFinite(shot.pointer.x)) setPointer(p => ({ x: shot.pointer!.x, y: shot.pointer!.y, n: (p?.n || 0) + 1 }));
  }, [shot]);

  const act = useCallback((body: Record<string, any>) => {
    if (!chatId || local) return;
    queue.current = queue.current.then(async () => {
      setBusy(true);
      setError('');
      try {
        const vp = viewport.current;
        const st = await api.workBrowser(chatId, vp ? { ...body, viewport: vp } : body);
        if (vp) sentViewport.current = `${vp.w}x${vp.h}`;
        if (st?.shot) onShot({ img: st.shot, url: st.url || '', title: st.title });
        if (st?.error) setError(String(st.error));
      } catch {
        setError(t('ws.work.browser_error'));
      } finally {
        setBusy(false);
        if (body.action === 'type') setEcho(typed.current);
      }
    });
  }, [chatId, onShot, t, local]);

  // Opening the panel on a Work chat shows the page the session is on, if it is still alive.
  useEffect(() => {
    if (chatId && !shot && !agentBusy) act({ action: 'status' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // The server's page takes the shape of this panel, so the picture fills it with no empty band.
  useEffect(() => {
    const el = screenRef.current;
    if (!el || local) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      if (w < 200 || h < 150) return;
      viewport.current = { w, h };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const key = `${w}x${h}`;
        if (key !== sentViewport.current && shot && !agentBusy) act({ action: 'status' });
      }, 450);
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (timer) clearTimeout(timer); };
  }, [act, shot, agentBusy, local, tab]);

  const flushTyping = useCallback(() => {
    if (typeTimer.current) { clearTimeout(typeTimer.current); typeTimer.current = null; }
    if (typed.current) { const text = typed.current; typed.current = ''; act({ action: 'type', text }); }
  }, [act]);

  const onScreenClick = (e: React.MouseEvent) => {
    if (agentBusy || local || !imgRef.current) return;
    const c = contentRect(imgRef.current);
    const x = (e.clientX - c.left) / c.k, y = (e.clientY - c.top) / c.k;
    if (x < 0 || y < 0 || x > c.nw || y > c.nh) return;
    flushTyping();
    setPointer(p => ({ x, y, n: (p?.n || 0) + 1 }));
    act({ action: 'click', x: Math.round(x), y: Math.round(y) });
  };

  const onScreenKey = (e: React.KeyboardEvent) => {
    if (agentBusy || local || e.metaKey || e.ctrlKey || e.altKey) return;
    if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      flushTyping();
      setEcho('');
      act({ action: 'key', key: e.key });
    } else if (e.key.length === 1) {
      e.preventDefault();
      typed.current += e.key;
      setEcho(prev => prev + e.key);
      // Short pause, then send: letters show at once in the echo and on the page a moment later.
      if (typeTimer.current) clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(flushTyping, 70);
    }
  };

  const onScreenWheel = (e: React.WheelEvent) => {
    if (agentBusy || local) return;
    wheel.current += e.deltaY;
    if (wheelTimer.current) return;
    wheelTimer.current = setTimeout(() => {
      const dy = Math.max(-2400, Math.min(2400, Math.round(wheel.current)));
      wheel.current = 0;
      wheelTimer.current = null;
      if (Math.abs(dy) > 20) act({ action: 'scroll', dy });
    }, 160);
  };

  // The echo disappears once the page has caught up with what was typed.
  useEffect(() => { if (!busy && !typed.current) { const id = setTimeout(() => setEcho(''), 900); return () => clearTimeout(id); } }, [busy, shot]);

  const go = () => {
    let v = address.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      v = /\s/.test(v) || !/\.[a-z]{2,}/i.test(v) ? `https://duckduckgo.com/?q=${encodeURIComponent(v)}` : `https://${v}`;
    }
    setEditingAddress(false);
    act({ action: 'open', url: v });
  };

  // Brings the browser of this chat to the front, and reopens it on its last page if it was closed.
  const showLocal = () => { try { (window as any).deizaDesktop?.workBrowserFocus?.(chatId, shot?.url || ''); } catch { /* app closed */ } };

  // Pointer position inside the box, from page pixels.
  const pointerStyle = (() => {
    const img = imgRef.current;
    if (!pointer || !img || !img.naturalWidth) return null;
    const c = contentRect(img);
    return { transform: `translate3d(${c.ox + pointer.x * c.k}px, ${c.oy + pointer.y * c.k}px, 0)` };
  })();

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
        <div className="ml-auto flex items-center gap-0.5">
          {onToggleMax && (
            <button onClick={onToggleMax} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring"
              aria-label={maximized ? t('ws.work.restore') : t('ws.work.maximize')} title={maximized ? t('ws.work.restore') : t('ws.work.maximize')}>
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring" aria-label={t('ws.work.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {tab === 'browser' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {local ? (
            <div className="mx-2 mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-muted/30 shrink-0">
              <MonitorUp className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-foreground leading-tight">{t('ws.work.local_title')}</p>
                <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{t('ws.work.local_text')}</p>
              </div>
              <button onClick={showLocal} className="shrink-0 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[12px] hover:brightness-110 transition focus-ring">
                {t('ws.work.local_show')}
              </button>
            </div>
          ) : (
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
          )}

          <div ref={screenRef} className={`flex-1 min-h-0 relative mx-2 mb-2 mt-2 ${local ? 'overflow-auto' : 'rounded-lg overflow-hidden border border-border/30 bg-[hsl(20_10%_7%)]'}`}>
            {shot ? (
              <div
                tabIndex={agentBusy || local ? -1 : 0}
                onClick={onScreenClick}
                onKeyDown={onScreenKey}
                onWheel={onScreenWheel}
                onBlur={flushTyping}
                className={`absolute inset-0 outline-none ${agentBusy || local ? 'cursor-default' : 'cursor-pointer focus:ring-1 focus:ring-inset focus:ring-primary/40'}`}
              >
                <img
                  ref={imgRef}
                  src={`data:image/jpeg;base64,${shot.img}`}
                  alt={shot.title || shot.url}
                  draggable={false}
                  onClick={local ? showLocal : undefined}
                  className={local
                    ? 'block w-full h-auto rounded-lg border border-border/30 shadow-sm select-none cursor-pointer hover:opacity-95 transition-opacity'
                    : 'absolute inset-0 w-full h-full object-contain select-none'}
                  onLoad={() => setPointer(p => (p ? { ...p } : p))}
                />
                {pointerStyle && (
                  <div className="absolute left-0 top-0 pointer-events-none transition-transform duration-300 ease-out" style={pointerStyle} aria-hidden="true">
                    <span key={pointer!.n} className="absolute -left-[18px] -top-[18px] w-9 h-9 rounded-full border-2 border-[hsl(354_60%_66%)] animate-[ping_0.7s_ease-out_1_forwards]" />
                    <svg width="26" height="26" viewBox="0 0 28 28" className="absolute -left-[4px] -top-[3px] drop-shadow-[0_3px_5px_rgba(24,9,12,0.45)]">
                      <path d="M4 3 L4 22.4 L9.1 17.7 L12.6 25.4 L16.3 23.8 L12.9 16.3 L20 16.3 Z" fill="#b8404f" stroke="#fbf3ea" strokeWidth="1.7" strokeLinejoin="round" />
                    </svg>
                    <span className="absolute left-[17px] top-[22px] px-2 py-0.5 rounded-md bg-[#6f1f2c] text-[#fbf3ea] text-[10.5px] font-semibold shadow-lg whitespace-nowrap">Deiza</span>
                  </div>
                )}
                {echo && !local && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-3 max-w-[80%] px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-white text-[12.5px] font-body truncate pointer-events-none">
                    {echo}<span className="inline-block w-px h-3.5 align-[-2px] ml-0.5 bg-white/80 animate-pulse" />
                  </div>
                )}
                {agentBusy && (
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/85 border border-border/30 text-[11px] text-foreground/75 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    {t('ws.work.agent_busy')}
                  </div>
                )}
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 gap-2">
                <Globe className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-[13px] text-muted-foreground max-w-[300px] leading-relaxed">{local ? t('ws.work.local_text') : t('ws.work.empty')}</p>
              </div>
            )}
          </div>
          {error && <p className="mx-3 mb-2 -mt-1 text-[12px] text-destructive/85 shrink-0" role="alert">{error}</p>}
          <div className="border-t border-border/30 px-3 py-2.5 shrink-0 bg-card/30">
            <div className="flex items-center gap-2 mb-2 text-[11.5px] text-muted-foreground min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agentBusy ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
              <span className="truncate" role="status">{agentBusy ? t('ws.work.running') : work?.status === 'interrupted' ? t('ws.work.interrupted') : work?.status === 'cancelled' ? t('ws.work.cancelled') : t('ws.work.ready')}</span>
              {agentBusy && work?.checkpoint && <span className="ml-auto shrink-0 tabular-nums">{Math.floor(work.checkpoint.elapsed_seconds / 60)} min · {work.checkpoint.steps ?? work.items.filter(x => x.kind === 'step').length}</span>}
              {agentBusy && <button onClick={onStop} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted focus-ring text-foreground" title={t('ws.kbd.stop')}><Square className="w-2.5 h-2.5" />{t('ws.kbd.stop')}</button>}
            </div>
            <div className="rounded-xl border border-border/45 bg-background focus-within:border-primary/50 transition-colors">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={8000}
                aria-label={t('ws.work.message')} placeholder={agentBusy ? t('ws.work.steer_placeholder') : t('ws.work.message')}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 outline-none placeholder:text-muted-foreground/85" />
              <div className="flex items-center gap-2 px-2 pb-2">
                <span className="mr-auto text-[10.5px] text-muted-foreground/85">{voice === 'recording' ? t('aud.listening') : voice === 'transcribing' ? t('aud.transcribing') : agentBusy ? t('ws.work.queued_hint') : t('ws.work.enter_hint')}</span>
                <AudioRecorder size="sm" disabled={sending || !chatId} onStateChange={setVoice}
                  onTranscript={text => setDraft(prev => [prev.trim(), text.trim()].filter(Boolean).join(' ').slice(0, 8000))} />
                <button onClick={() => void send()} disabled={!draft.trim() || sending || voice !== 'idle' || !chatId}
                  aria-label={t('ws.work.send')} className="w-7 h-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center focus-ring disabled:opacity-40">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="text-[10.5px] text-muted-foreground/85">{agentBusy ? t('ws.work.next_task') : 'Deiza Work'}</span>
              <ModelSelector model={model} onModelChange={onModelChange} effort={effort} onEffortChange={onEffortChange} userPlan={userPlan} hideFast align="right" />
            </div>
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
            <div className={`grid gap-2 ${maximized ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
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
