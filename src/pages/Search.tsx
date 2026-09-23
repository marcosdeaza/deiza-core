import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search as SearchIcon, ChevronRight, ArrowRight, ArrowUpRight, Plus,
  Menu, MessageSquare, Trash2, Pin, PinOff, X, PanelLeftClose, Globe, ImagePlus,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import { WebImageGrid } from '@/components/deiza/ChatMessage';
import AudioRecorder from '@/components/deiza/AudioRecorder';
import { authHeaders } from '@/services/api';
import { haptic } from '@/lib/native';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/* ─── Types ─── */
interface WebResult {
  title: string;
  url: string;
  domain: string;
}

interface RealtimeData {
  type: 'weather' | 'fx' | 'crypto' | 'stocks' | 'sports' | 'conflict';
  [key: string]: any;
}

interface SearchAttachment {
  name: string;
  mime_type: string;
  is_image: boolean;
  /** Inline base64 while composing (sent to the model); dropped once the photo has a URL */
  raw_bytes?: string;
  /** Persisted /api/files URL — what history keeps */
  url?: string;
}

const attachmentSrc = (f: SearchAttachment) => (f.url ? `${API_BASE}${f.url}` : `data:${f.mime_type};base64,${f.raw_bytes || ''}`);

interface SearchTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: SearchAttachment[];
  webResults?: WebResult[];
  directLink?: { url: string; domain: string };
  data?: RealtimeData | null;
  images?: Array<{ url: string; title?: string; source?: string }>;
  timestamp: number;
}

interface SearchConversation {
  id: string;
  title: string;
  turns: SearchTurn[];
  createdAt: number;
  pinned?: boolean;
}

/* ─── Strip markdown artifacts (double safety, server already cleans) ─── */
function cleanText(text: string): string {
  return (text || '')
    .replace(/\*{1,3}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/SOURCES:.*$/s, '')
    .replace(/\x00/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ─── Helpers ─── */
const fmtUsd = (n: number | null | undefined) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

function WeatherIcon({ code }: { code?: number }) {
  if (code == null) return null;
  const sun = code <= 2, rain = code >= 51 && code <= 67 || code >= 80 && code <= 82, storm = code >= 95;
  return <span className="text-xl">{storm ? '⛈️' : rain ? '🌧️' : sun ? '☀️' : '☁️'}</span>;
}

/* ─── Realtime data card ─── */
function DataCard({ data, es }: { data: RealtimeData; es: boolean }) {
  const { t } = useLanguage();
  const locale = es ? 'es-ES' : 'en-US';
  if (data.type === 'weather') {
    const days: any[] = data.days || [];
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
          <div className="flex items-center gap-2">
            <WeatherIcon code={data.weather_code} />
            <span className="font-body text-sm">{data.place}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60">{t('sr.now')}</span>
        </div>
        <div className="px-4 py-3 flex items-end gap-3">
          <span className="text-4xl font-body tracking-tight">{data.temp}°</span>
          <div className="pb-1">
            <p className="text-xs text-foreground/80">{data.label}</p>
            <p className="text-[10px] text-muted-foreground">
              {t('sr.feels')} {data.feels}° · {t('sr.humidity')} {data.humidity}%
            </p>
          </div>
        </div>
        {days.length > 0 && (
          <div className="grid grid-cols-5 gap-1 px-3 pb-3">
            {days.map((d, i) => {
              const dt = new Date((d.date || '') + 'T12:00:00');
              const day = isNaN(dt.getTime()) ? d.date : dt.toLocaleDateString(locale, { weekday: 'short' });
              const today = i === 0;
              return (
                <div key={i} className={`flex flex-col items-center rounded-xl py-1.5 ${today ? 'bg-primary/10' : ''}`}>
                  <span className={`text-[9px] font-mono uppercase ${today ? 'text-primary' : 'text-muted-foreground/60'}`}>{day}</span>
                  <span className="text-xs font-semibold mt-0.5">{d.max}°</span>
                  <span className="text-[9px] text-muted-foreground/60">{d.min}°</span>
                  <span className="text-[9px] text-sky-500">{d.pop}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (data.type === 'fx') {
    const rates: { code: string; rate: number }[] = data.rates || [];
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <span className="font-body text-sm">1 {data.base}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{t('sr.live')}</span>
        </div>
        <div className="px-3 py-2">
          {rates.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
              <span className="font-mono text-xs">{r.code}</span>
              <span className="font-mono text-xs font-semibold tabular-nums">{fmtNum(r.rate, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (data.type === 'crypto') {
    const up = (data.change_24h ?? 0) >= 0;
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-body text-sm">{data.name} <span className="text-[10px] text-muted-foreground">{data.symbol}</span></p>
            <p className="text-2xl font-body tracking-tight mt-0.5">{fmtUsd(data.price_usd)}</p>
            <p className={`text-[11px] font-mono mt-0.5 ${up ? 'text-green-500' : 'text-red-500'}`}>
              {up ? '▲' : '▼'} {fmtNum(Math.abs(data.change_24h ?? 0), 2)}% · 24h
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono text-muted-foreground/60">{t('sr.marketcap')}</p>
            <p className="text-xs font-mono mt-0.5">{fmtUsd(data.market_cap / 1e9)}B</p>
          </div>
        </div>
      </div>
    );
  }
  if (data.type === 'stocks') {
    const quotes: any[] = data.quotes || [];
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <span className="font-body text-sm">{t('sr.markets')}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{t('sr.latestclose')}</span>
        </div>
        <div className="px-3 py-2">
          {quotes.map((q, i) => {
            const up = (q.change ?? 0) >= 0;
            return (
              <div key={i} className="flex items-center justify-between px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{q.symbol}</p>
                  <p className="text-[9px] text-muted-foreground/60 truncate max-w-[140px]">{q.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-semibold tabular-nums">{fmtNum(q.close)}</p>
                  <p className={`font-mono text-[10px] tabular-nums ${up ? 'text-green-500' : 'text-red-500'}`}>
                    {up ? '+' : ''}{fmtNum(q.change)} ({up ? '+' : ''}{fmtNum(q.change_pct)}%)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (data.type === 'sports') {
    const games: any[] = data.games || [];
    const liveStatus = (s: string) => /in play|live|in progress|en vivo/i.test(s || '');
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <span className="font-body text-sm">{data.league}</span>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/60">
            {t('sr.fixtures')} ·{' '}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-500">{t('sr.live2')}</span>
            </span>
          </span>
        </div>
        {games.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground/60">
            {t('sr.nogames')}
          </p>
        ) : (
          <div className="px-3 py-2">
            {games.map((g, i) => {
              const live = liveStatus(g.status);
              return (
                <div key={i} className={`flex items-center justify-between px-1 py-2 rounded-xl ${live ? 'bg-red-500/5' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{g.home}</p>
                    <p className="text-xs font-medium truncate text-muted-foreground mt-0.5">{g.away}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {g.home_score ?? '–'} <span className="text-muted-foreground/50">-</span> {g.away_score ?? '–'}
                    </p>
                    {live ? (
                      <p className="text-[9px] font-mono text-red-500 flex items-center justify-end gap-1">
                        <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /> {g.status}
                      </p>
                    ) : (
                      <p className="text-[9px] font-mono text-muted-foreground/50">{g.status}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (data.type === 'conflict') {
    const links: { name: string; url: string }[] = data.links || [];
    return (
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/10">
          <span className="font-body text-sm">{t('sr.conflictmaps')}</span>
        </div>
        <div className="px-3 py-2 flex flex-wrap gap-2">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-muted/40 hover:bg-muted border border-border/20 transition-colors"
            >
              <Globe className="w-3 h-3" />
              {l.name}
              <ArrowUpRight className="w-3 h-3 opacity-50" />
            </a>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

/* ─── Component ─── */
export default function DeizaSearch() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { t, language } = useLanguage();
  const es = language === 'es';

  const [conversations, setConversations] = useState<SearchConversation[]>(() => {
    try { return JSON.parse(localStorage.getItem('deiza_search_convos') || '[]'); }
    catch { return []; }
  });
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('deiza_search_desk') !== '0'; } catch { return true; }
  });
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [indexedSites, setIndexedSites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('deiza_indexed_sites') || '[]'); }
    catch { return []; }
  });
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [indexInput, setIndexInput] = useState('');
  const onVoiceTranscript = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setInputQuery(prev => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
    inputRef.current?.focus();
  }, []);

  const [attachFiles, setAttachFiles] = useState<SearchAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photos go to the server as soon as they are attached: history then keeps a small URL
  // instead of megabytes of base64 (which used to overflow localStorage and wipe everything).
  const persistPhoto = async (att: SearchAttachment) => {
    if (!isAuthenticated || !att.raw_bytes) return;
    try {
      const r = await fetch(`${API_BASE}/api/uploads`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ files: [{ name: att.name, mime_type: att.mime_type, raw_bytes: att.raw_bytes }] }),
      });
      if (!r.ok) return;
      const res = await r.json();
      const url = res.files?.[0]?.url;
      if (url) setAttachFiles(prev => prev.map(a => (a === att ? { ...a, url } : a)));
    } catch { /* inline fallback */ }
  };

  const addPhotoFile = (f: File, fallbackName = 'foto.png') => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '').split(',')[1] || '';
      if (!raw) return;
      const att: SearchAttachment = { name: f.name || fallbackName, mime_type: f.type, is_image: true, raw_bytes: raw };
      setAttachFiles(prev => [...prev, att]);
      void persistPhoto(att);
    };
    reader.readAsDataURL(f);
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error(t('sr.err.imagesonly'));
      e.target.value = '';
      return;
    }
    addPhotoFile(f);
    e.target.value = '';
  };

  const onPasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) addPhotoFile(f, 'pegada.png');
        return;
      }
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConvo = conversations.find(c => c.id === activeConvoId) || null;
  const pinnedChats = conversations.filter(c => c.pinned);
  const convoList = conversations.filter(c => !c.pinned);

  // Server copy of the conversations (source of truth for signed-in users); localStorage
  // only paints first. Turns are stored without inline photo bytes.
  const [serverLoaded, setServerLoaded] = useState(false);
  const savedJsonRef = useRef<Record<string, string>>({});
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const slimConvo = (c: SearchConversation): SearchConversation => ({
    ...c,
    turns: c.turns.map(tn => (tn.attachments?.some(a => a.raw_bytes)
      ? { ...tn, attachments: tn.attachments.map(a => (a.url ? { ...a, raw_bytes: undefined } : a)).filter(a => a.url || a.raw_bytes) }
      : tn)),
  });
  const serverPayload = (c: SearchConversation) => ({ title: c.title, pinned: !!c.pinned, data: { createdAt: c.createdAt, turns: slimConvo(c).turns } });
  const saveConvo = useCallback((c: SearchConversation) => {
    const json = JSON.stringify(serverPayload(c));
    if (savedJsonRef.current[c.id] === json) return;
    savedJsonRef.current[c.id] = json;
    fetch(`${API_BASE}/api/convos/search/${c.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: json,
    }).catch(() => { delete savedJsonRef.current[c.id]; });
  }, []);

  useEffect(() => {
    if (serverLoaded) return;
    if (!isAuthenticated) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/convos/search`, { credentials: 'include', headers: { ...authHeaders() } });
        if (!r.ok) throw new Error('load');
        const data = await r.json();
        if (!alive) return;
        const rows: SearchConversation[] = (data.convos || []).map((row: any) => ({
          id: row.id, title: row.title || '', pinned: !!row.pinned,
          createdAt: row.data?.createdAt || (row.updated_at ? Date.parse(row.updated_at) : Date.now()),
          turns: Array.isArray(row.data?.turns) ? row.data.turns : [],
        }));
        if (rows.length > 0) {
          rows.forEach(c => { savedJsonRef.current[c.id] = JSON.stringify(serverPayload(c)); });
          setConversations(rows);
        } else if (conversations.length > 0) {
          conversations.slice(0, 40).forEach(saveConvo);
        }
      } catch { /* keep local cache */ }
      if (alive) setServerLoaded(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, serverLoaded]);

  useEffect(() => {
    if (!serverLoaded || !isAuthenticated) return;
    for (const c of conversations) {
      if (savedJsonRef.current[c.id] === JSON.stringify(serverPayload(c))) continue;
      if (saveTimerRef.current[c.id]) clearTimeout(saveTimerRef.current[c.id]);
      saveTimerRef.current[c.id] = setTimeout(() => saveConvo(c), 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, serverLoaded, isAuthenticated]);

  useEffect(() => {
    try { localStorage.setItem('deiza_search_convos', JSON.stringify(conversations.slice(0, 40).map(slimConvo))); } catch {}
  }, [conversations]);

  useEffect(() => {
    try { localStorage.setItem('deiza_indexed_sites', JSON.stringify(indexedSites)); } catch {}
  }, [indexedSites]);

  useEffect(() => {
    localStorage.setItem('deiza_search_desk', deskOpen ? '1' : '0');
  }, [deskOpen]);

  useEffect(() => {
    if (activeConvo && activeConvo.turns.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
    }
  }, [activeConvo?.turns.length, loading]);

  const startNewConvo = useCallback(() => {
    setActiveConvoId(null);
    setInputQuery('');
    setAttachFiles([]);
    setSidebarOpen(false);
    setDeskOpen(true);
    inputRef.current?.focus();
  }, []);

  const shareConvo = async (convo: SearchConversation) => {
    const messages = convo.turns.map(turn => ({
      role: turn.role,
      content: turn.content,
      attachments: turn.attachments,
      meta: turn.webResults?.length
        ? { sources: turn.webResults.slice(0, 8).map(r => ({ title: r.title, url: r.url, domain: r.domain })) }
        : undefined,
    }));
    try {
      const res = await api.createShare({ title: convo.title || t('sh.cta'), messages });
      if (res?.url) {
        await navigator.clipboard.writeText(res.url);
        toast.success(t('ws.share.copied'));
      }
    } catch { toast.error(t('cm.share.aria')); }
  };

  const patchConvos = (id: string | null, fn: (c: SearchConversation) => SearchConversation) => {
    setConversations(prev => id ? prev.map(c => c.id === id ? fn(c) : c) : prev);
  };

  const performSearch = async (queryText: string) => {
    const q = queryText.trim();
    const files = attachFiles;
    if (!q && files.length === 0) return;
    if (loading) return;

    haptic('light');
    setLoading(true);
    setInputQuery('');
    setAttachFiles([]);

    const userTurn: SearchTurn = { id: Date.now().toString(), role: 'user', content: q, attachments: files.length ? files : undefined, timestamp: Date.now() };
    let convoId = activeConvoId;
    if (!convoId) {
      convoId = Date.now().toString();
      const newConvo: SearchConversation = {
        id: convoId, title: q.slice(0, 60), turns: [userTurn], createdAt: Date.now(),
      };
      setConversations(prev => [newConvo, ...prev]);
      setActiveConvoId(convoId);
    } else {
      patchConvos(convoId, c => ({ ...c, turns: [...c.turns, userTurn] }));
    }

    const addAssistant = (turn: SearchTurn) => {
      setConversations(prev => prev.map(c =>
        c.id === convoId ? { ...c, turns: [...c.turns, turn] } : c
      ));
    };

    const history = (() => {
      const convo = conversations.find(c => c.id === activeConvoId);
      if (!convo) return [];
      return convo.turns.slice(-10).map(t => ({
        role: t.role === 'user' ? 'user' : 'model',
        content: t.role === 'user' ? t.content : (t.content || (t.directLink ? 'Enlace: ' + t.directLink.domain : '')),
      }));
    })();

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, custom_urls: indexedSites, language, history, files }),
      });
      const data = await res.json();

      if (data.direct_link) {
        addAssistant({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '',
          directLink: { url: data.direct_link.url, domain: data.direct_link.domain },
          timestamp: Date.now(),
        });
      } else {
        const sources: WebResult[] = (data.sources || []).map((s: any) => ({
          title: s.title || s.domain || '',
          url: s.url,
          domain: s.domain || s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        }));
        const error = data.error;
        const primary = data.primary_site || null;
        addAssistant({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: error ? t('search.error') : cleanText(data.ai_overview || ''),
          webResults: sources.slice(0, 6),
          data: data.data || null,
          directLink: primary ? { url: primary.url, domain: primary.domain || '' } : undefined,
          images: (data.images || []).filter((im: any) => im && im.url).slice(0, 6),
          timestamp: Date.now(),
        });
      }
    } catch {
      addAssistant({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('search.error'),
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() && attachFiles.length === 0) return;
    performSearch(inputQuery.trim());
  };

  // Implicit form submission is unreliable (IME composition, some mobile keyboards), so submit on Enter explicitly.
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (loading) return;
    handleSubmit(e as unknown as React.FormEvent);
  };


  const handleAddSite = () => {
    const site = indexInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (site && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) && !indexedSites.includes(site) && indexedSites.length < 12) {
      setIndexedSites(prev => [...prev, site]);
      toast.success(t('sr.indexed.ok', { site }));
    } else if (site) {
      toast.error(t('sr.indexed.err'));
    }
    setIndexInput('');
    setShowIndexModal(false);
  };

  const togglePin = (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  const deleteConvo = (id: string) => {
    if (saveTimerRef.current[id]) clearTimeout(saveTimerRef.current[id]);
    delete savedJsonRef.current[id];
    if (isAuthenticated) {
      fetch(`${API_BASE}/api/convos/search/${id}`, { method: 'DELETE', credentials: 'include', headers: { ...authHeaders() } }).catch(() => {});
    }
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvoId === id) setActiveConvoId(null);
  };

  const isHome = !activeConvo;

  const convoRow = (c: SearchConversation) => (
    <div
      key={c.id}
      className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors text-[13px] ${
        activeConvoId === c.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
      }`}
      onClick={() => {
        setActiveConvoId(c.id);
        setSidebarOpen(false);
        if (window.matchMedia('(min-width: 640px)').matches) setDeskOpen(false);
      }}
    >
      {c.pinned ? <Pin className="w-3.5 h-3.5 shrink-0 text-primary/80" /> : <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />}
      <span className="flex-1 truncate">{c.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); togglePin(c.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
        title={c.pinned ? t('sr.unpin') : t('sr.pin')}
      >
        {c.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); deleteConvo(c.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-3 pt-[max(12px,env(safe-area-inset-top,12px))] border-b border-border/20 flex items-center justify-between">
        <button onClick={startNewConvo} className="flex items-center gap-2 group">
          <img src={logo} alt="Deiza" className="w-6 h-6 blend-multiply" />
          <span className="font-display text-sm tracking-tight">{t('search.title')}</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setDeskOpen(false)} className="hidden sm:block p-1.5 rounded-lg hover:bg-muted transition-colors" title={t('sr.collapse')}>
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <button onClick={startNewConvo} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={t('search.new')}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {pinnedChats.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1">
              <Pin className="w-2.5 h-2.5" /> {t('search.pinned')}
            </p>
            {pinnedChats.map(convoRow)}
          </>
        )}
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-8 font-mono">{t('search.conversations')}</p>
        )}
        {convoList.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
              {t('search.conversations')}
            </p>
            {convoList.map(convoRow)}
          </>
        )}
      </div>

      <div className="p-3 pb-[max(12px,env(safe-area-inset-bottom,12px))] border-t border-border/20 space-y-1">
        <div className="flex items-center justify-between px-1 pt-1">
          <button onClick={() => navigate('/')} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono">deiza.org</button>
          <button onClick={() => navigate('/workspace')} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono">{t('sr.workspace')}</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex bg-background text-foreground font-body overflow-hidden">

      {/* ─── Desktop sidebar ─── */}
      <motion.aside
        className="hidden sm:flex h-full shrink-0 bg-card border-r border-border/30 flex-col overflow-hidden"
        initial={false}
        animate={{ width: deskOpen ? 256 : 48 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        {deskOpen ? sidebar : (
          <div className="flex flex-col items-center py-3 gap-2 w-12">
            <button onClick={() => setDeskOpen(true)} className="p-2 rounded-lg hover:bg-muted transition-colors" title={t('sr.expand')}>
              <Menu className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/workspace')} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors font-mono mt-auto">WS</button>
          </div>
        )}
      </motion.aside>

      {/* ─── Mobile drawer ─── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 bg-black/40 z-40 sm:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-50 w-72 bg-card sm:hidden shadow-2xl"
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onPickImage}
        className="hidden"
      />

      {/* ─── Main ─── */}
      <main className="flex-1 flex flex-col min-w-0 relative">

        {/* Top bar */}
        <header className="h-[calc(48px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-4 flex items-center justify-between border-b border-border/20 bg-card/30 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted sm:hidden"
            title={t('sr.opensidebar')}
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          
          <button
            onClick={() => navigate(isAuthenticated ? '/workspace' : '/login')}
            className="text-[11px] font-medium bg-foreground text-background px-3.5 py-1.5 rounded-full hover:opacity-90 transition-opacity ml-2"
          >
            {isAuthenticated ? (user?.name?.split(' ')[0] || 'Deiza') : t('sr.signin')}
          </button>
        </header>

        {/* ─── HOME ─── */}
        {isHome && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16 overflow-y-auto">
            <motion.div
              className="flex flex-col items-center gap-3 sm:gap-4 w-full max-w-3xl"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
            >
              <div className="flex flex-col items-center gap-4 text-center select-none">
                <div className="flex items-center gap-3">
                  <h1 className="font-display font-semibold text-7xl sm:text-8xl tracking-tight text-foreground">
                    Deiza
                  </h1>
                  <motion.img
                    src={logo} alt="Deiza" className="w-24 h-24 sm:w-28 sm:h-28 [filter:saturate(1.2)_contrast(1.05)]"
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}
                  />
                </div>
                <p className="text-[13px] sm:text-sm text-muted-foreground/75 font-light tracking-wide -mt-1">
                  {t('search.tagline')}
                </p>
              </div>

              {/* Giant search bar */}
              <form onSubmit={handleSubmit} className="w-full">
                {attachFiles.length > 0 && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    {attachFiles.map((f, i) => (
                      <div key={i} className="relative">
                        <img
                          src={attachmentSrc(f)}
                          alt={f.name}
                          className="w-10 h-10 rounded-lg object-cover border border-border/40"
                        />
                        <button
                          type="button"
                          onClick={() => setAttachFiles(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border/50 flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <motion.div
                  className="flex items-center w-full max-w-xl mx-auto bg-card border border-border/50 rounded-full px-4 sm:px-5 py-2.5 sm:py-3 gap-3 shadow-sm shadow-black/5 transition-all duration-300 hover:shadow-md focus-within:shadow-md focus-within:border-primary/30"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}
                >
                  <SearchIcon className="w-4.5 h-4.5 text-muted-foreground/50 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputQuery}
                    onChange={e => setInputQuery(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    onPaste={onPasteImage}
                    placeholder={t('search.placeholder')}
                    className="flex-1 bg-transparent text-base sm:text-[15px] outline-none placeholder:text-muted-foreground/40 min-w-0"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <motion.button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-full transition-all shrink-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60"
                    whileTap={{ scale: 0.9 }}
                    title={t('sr.attach')}
                  >
                    <ImagePlus className="w-4.5 h-4.5" />
                  </motion.button>
                  <AudioRecorder size="sm" onTranscript={onVoiceTranscript} disabled={loading} />
                  <motion.button
                    type="submit"
                    disabled={(!inputQuery.trim() && attachFiles.length === 0) || loading}
                    className="p-2.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-25 shrink-0"
                    whileTap={{ scale: 0.9 }}
                    aria-label={t('search.title')}
                    title={t('search.title')}
                  >
                    {loading ? (
                      <span className="block w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </motion.button>
                </motion.div>
              </form>

              {/* Indexed sites — floating favicon chips + FAB */}
              <div className="w-full max-w-xl mx-auto mt-2">
                {indexedSites.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {indexedSites.slice(0, 12).map((site, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.7, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: 0.03 * i + 0.1, type: 'spring', stiffness: 380, damping: 24 }}
                          onClick={() => window.open('https://' + site, '_blank', 'noopener,noreferrer')}
                          className="relative group w-11 h-11 rounded-2xl bg-card border border-border/40 flex items-center justify-center overflow-visible cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-black/5"
                          whileHover={{ scale: 1.08, y: -2 }}
                          whileTap={{ scale: 0.92 }}
                          title={site}
                        >
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${site}&sz=128`}
                            alt={site}
                            className="w-6 h-6"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <span
                            onClick={e => { e.stopPropagation(); setIndexedSites(prev => prev.filter((_, j) => j !== i)); }}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-auto"
                          >
                            <X className="w-2.5 h-2.5" />
                          </span>
                        </motion.div>
                      ))}
                      {indexedSites.length < 12 && (
                        <motion.button
                          onClick={() => { setIndexInput(''); setShowIndexModal(true); }}
                          className="w-11 h-11 rounded-2xl bg-card/60 text-foreground/45 hover:bg-card hover:text-foreground ring-1 ring-border/60 hover:ring-border flex items-center justify-center transition-all"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.94 }}
                          title={t('search.index')}
                        >
                          <Plus className="w-5 h-5" strokeWidth={2.5} />
                        </motion.button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <motion.button
                      onClick={() => { setIndexInput(''); setShowIndexModal(true); }}
                      className="px-3.5 py-1.5 rounded-full text-[11px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-card border border-border/40 hover:border-primary/30 transition-all flex items-center gap-1.5"
                      whileTap={{ scale: 0.96 }}
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('search.index')}
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── CONVERSATION ─── */}
        {activeConvo && (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
              <div className="max-w-2xl mx-auto space-y-7">
                <div className="flex items-center justify-between gap-3">
                  {(() => {
                    const firstUserQuery = activeConvo.turns.find(t => t.role === 'user')?.content?.trim().slice(0, 60);
                    const isDup = firstUserQuery && activeConvo.title === firstUserQuery;
                    if (isDup) return null;
                    return (
                      <p className="font-display text-lg sm:text-xl font-semibold text-foreground truncate min-w-0">
                        {activeConvo.title || t('search.new')}
                      </p>
                    );
                  })()}
                  {activeConvo.turns.length > 0 && (
                    <button
                      onClick={() => shareConvo(activeConvo)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-primary transition-colors focus-ring text-[11px] font-body shrink-0 ml-auto"
                      aria-label={t('ws.share.chat')}
                      title={t('ws.share.chat')}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('cm.share')}</span>
                    </button>
                  )}
                </div>
                {activeConvo.turns.map((turn, i) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i === activeConvo.turns.length - 1 ? 0 : 0 }}
                  >
                    {turn.role === 'user' ? (
                      <div className="flex items-start gap-3 px-1">
                        <SearchIcon className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          {turn.attachments && turn.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pb-1.5">
                              {turn.attachments.map((f, j) =>
                                f.is_image ? (
                                  <img
                                    key={j}
                                    src={attachmentSrc(f)}
                                    alt={f.name}
                                    className="w-24 h-24 object-cover rounded-xl border border-border/30 shadow-sm"
                                  />
                                ) : (
                                  <span key={j} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/20 text-muted-foreground font-mono">
                                    📎 {f.name}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                          {turn.content && (
                            <p className="text-base font-body font-medium tracking-tight">{turn.content}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 pl-7">
                        {turn.directLink && (
                          <motion.a
                            href={turn.directLink.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/30 hover:border-primary/25 transition-all group shadow-sm hover:shadow-md"
                            initial={{ scale: 0.97 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                          >
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${turn.directLink.domain}&sz=32`}
                              alt=""
                              className="w-7 h-7 rounded-lg"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{turn.directLink.domain}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{turn.directLink.url}</p>
                            </div>
                            <span className="text-[10px] font-mono text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
                              {t('search.open')}
                            </span>
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                          </motion.a>
                        )}

                        {turn.data && <DataCard data={turn.data} es={es} />}

                        {turn.content && (
                          <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                            {turn.content}
                          </div>
                        )}

                        {turn.images && turn.images.length > 0 && (
                          <div className="mt-3">
                            <WebImageGrid images={turn.images} />
                          </div>
                        )}

                        {turn.webResults && turn.webResults.length > 0 && (
                          <div>
                            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 mb-1.5">
                              {t('search.sources')}
                            </p>
                            <div className="grid sm:grid-cols-2 gap-1.5">
                              {turn.webResults.map((src, j) => {
                                const label = src.title && src.title !== src.domain ? src.title : '';
                                return (
                                  <a
                                    key={j}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={src.url}
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-card/60 border border-border/25 hover:border-primary/20 hover:bg-card transition-all min-w-0"
                                  >
                                    <span className="text-[10px] font-mono text-muted-foreground/60 w-3 shrink-0 text-right">{j + 1}</span>
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=32`}
                                      alt=""
                                      className="w-4 h-4 rounded-sm shrink-0"
                                      loading="lazy"
                                    />
                                    <span className="flex-1 min-w-0 leading-tight">
                                      <span className="block text-[11px] truncate text-foreground/85">{label || src.domain}</span>
                                      {label && <span className="block text-[10px] truncate text-muted-foreground/70">{src.domain}</span>}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {loading && (
                  <div className="pl-7 flex items-center gap-2.5 text-muted-foreground">
                    <SearchIcon className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span className="text-xs font-mono">{t('search.searching')}</span>
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map(i => (
                        <motion.span
                          key={i}
                          className="w-1 h-1 rounded-full bg-primary"
                          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom input */}
            <div className="p-3 sm:p-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] border-t border-border/20 bg-card/30 backdrop-blur-sm shrink-0">
              <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-2">
                {attachFiles.length > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    {attachFiles.map((f, i) => (
                      <div key={i} className="relative">
                        <img
                          src={attachmentSrc(f)}
                          alt={f.name}
                          className="w-9 h-9 rounded-lg object-cover border border-border/40"
                        />
                        <button
                          type="button"
                          onClick={() => setAttachFiles(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border/50 flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center bg-card border border-border/40 rounded-2xl px-4 py-3 gap-3 focus-within:border-primary/25 transition-all shadow-sm focus-within:shadow-md">
                <SearchIcon className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                <input
                  type="text"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  onPaste={onPasteImage}
                  placeholder={t('search.followup')}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                  autoComplete="off"
                  spellCheck={false}
                />
                <motion.button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all shrink-0"
                  whileTap={{ scale: 0.9 }}
                  title={t('sr.attach')}
                >
                  <ImagePlus className="w-4 h-4" />
                </motion.button>
                <AudioRecorder size="sm" onTranscript={onVoiceTranscript} disabled={loading} />
                <motion.button
                  type="submit"
                  disabled={loading || (!inputQuery.trim() && attachFiles.length === 0)}
                  className="p-2 rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-25 shrink-0"
                  whileTap={{ scale: 0.92 }}
                >
                  {loading ? (
                    <span className="block w-3.5 h-3.5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </motion.button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* ─── Index Modal ─── */}
        <AnimatePresence>
          {showIndexModal && (
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowIndexModal(false)}
            >
              <motion.div
                className="bg-card border border-border/50 rounded-2xl p-5 w-full max-w-sm space-y-4"
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-medium">{t('search.index')}</h3>
                  <button onClick={() => setShowIndexModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t('search.index.desc')}</p>
                <input
                  type="url"
                  value={indexInput}
                  onChange={e => setIndexInput(e.target.value)}
                  placeholder="youtube.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/40 text-sm outline-none focus:border-primary/30 transition-colors"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddSite()}
                />
                {indexedSites.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {indexedSites.map((site, i) => (
                      <span key={i} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted/50 text-muted-foreground">
                        {site}
                        <button onClick={() => setIndexedSites(prev => prev.filter((_, j) => j !== i))}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowIndexModal(false)} className="px-3 py-2 rounded-xl text-xs hover:bg-muted transition-colors">{t('search.index.cancel')}</button>
                  <button onClick={handleAddSite} className="px-3 py-2 rounded-xl bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity">{t('search.index.add')}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
