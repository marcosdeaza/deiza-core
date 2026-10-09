import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, Check, KeyRound, MoreHorizontal, Pencil, Trash2, BookOpen, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.webp';
import { api, authHeaders, type CodeKey } from '@/services/api';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { countdownLabel, resetDateLabel, secondsUntil } from '@/lib/usageReset';
import { haptic, isNative } from '@/lib/native';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const BASE = 'https://deiza.org/api/v1';
const DOCS = 'https://deiza.org/docs/';
const MODELS = [
  { id: 'deiza-liquid-5.1', note: 'default' },
  { id: 'deiza-solid-5', note: '1M' },
  { id: 'deiza-gas-4.5', note: 'fast' },
];
const EXPIRY = [0, 7, 30, 90, 365] as const;

type Snip = 'curl' | 'python' | 'node' | 'env';

function snippet(kind: Snip, key: string) {
  const k = key || '$DEIZA_API_KEY';
  if (kind === 'curl') {
    return `curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deiza-liquid-5.1", "messages": [{"role": "user", "content": "Hola"}]}'`;
  }
  if (kind === 'python') {
    return `from openai import OpenAI

client = OpenAI(base_url="${BASE}", api_key="${key || 'dz_...'}")
resp = client.chat.completions.create(
    model="deiza-liquid-5.1",
    messages=[{"role": "user", "content": "Hola"}],
)
print(resp.choices[0].message.content)`;
  }
  if (kind === 'node') {
    return `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${BASE}", apiKey: "${key || 'dz_...'}" });
const resp = await client.chat.completions.create({
  model: "deiza-liquid-5.1",
  messages: [{ role: "user", content: "Hola" }],
});
console.log(resp.choices[0].message.content);`;
  }
  return `OPENAI_BASE_URL=${BASE}
OPENAI_API_KEY=${key || 'dz_...'}
OPENAI_MODEL=deiza-liquid-5.1`;
}

const CopyBtn = ({ text, label, done, className = '' }: { text: string; label?: string; done?: string; className?: string }) => {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); haptic('light'); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-body text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring ${className}`}
      aria-label={label || 'Copy'}
    >
      {ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {(ok ? done : label) && <span>{ok ? done : label}</span>}
    </button>
  );
};

const CodeTabs = ({ apiKey, t }: { apiKey: string; t: (k: string, p?: Record<string, string | number>) => string }) => {
  const [tab, setTab] = useState<Snip>('curl');
  const code = snippet(tab, apiKey);
  return (
    <div className="rounded-2xl overflow-hidden border border-border/30 bg-[hsl(20_12%_8%)]">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-white/[0.06]">
        {(['curl', 'python', 'node', 'env'] as Snip[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`px-2.5 py-1.5 rounded-t-lg font-body text-[11.5px] transition-colors focus-ring ${tab === s ? 'text-[hsl(32_22%_90%)] bg-white/[0.06]' : 'text-[hsl(30_12%_58%)] hover:text-[hsl(32_22%_86%)]'}`}
          >
            {s === 'env' ? '.env' : s === 'node' ? 'Node.js' : s === 'python' ? 'Python' : 'cURL'}
          </button>
        ))}
        <span className="ml-auto mb-1"><CopyBtn text={code} label={t('ak.copy')} done={t('ak.copied')} className="!text-[hsl(30_12%_66%)] hover:!text-[hsl(32_22%_92%)] hover:!bg-white/[0.06]" /></span>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed font-mono text-[hsl(32_22%_86%)] whitespace-pre" style={{ contain: 'inline-size' }}><code>{code}</code></pre>
    </div>
  );
};

interface Usage {
  tokens_used: number; token_limit: number; reset_in_seconds?: number | null; pct?: number;
  weekly_pct?: number; weekly_reset_at?: string | null; weekly_reset_in_seconds?: number | null;
}

/** /api-keys: the API console. Keys with name, origin, last use, requests and expiry; quick start; plan usage. */
const ApiKeys = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { language, t } = useLanguage();
  const [keys, setKeys] = useState<CodeKey[]>([]);
  const [maxKeys, setMaxKeys] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [plan, setPlan] = useState<string>('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [filter, setFilter] = useState<'all' | 'web' | 'cli'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [expiry, setExpiry] = useState<number>(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [revealed, setRevealed] = useState<{ key: string; name: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CodeKey | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => { document.title = `${t('ak.title')} · Deiza`; window.scrollTo(0, 0); }, [t]);
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate(`/login?redirect=${encodeURIComponent('/api-keys')}`, { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const load = useCallback(async () => {
    try {
      const r = await api.getCodeKeys();
      setKeys(r.keys || []);
      if (r.max_keys) setMaxKeys(r.max_keys);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    try {
      const res = await fetch(`${API_URL}/api/plan`, { credentials: 'include', headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setPlan(d.plan || ''); setUsage(d.usage || null); }
    } catch { /* usage strip stays hidden */ }
  }, []);
  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  const fmtDate = useMemo(() => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }), [language]);
  const rtf = useMemo(() => { try { return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }); } catch { return null; } }, [language]);
  const ago = (iso?: string | null) => {
    if (!iso) return t('ak.never');
    const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime();
    const s = Math.round((d - Date.now()) / 1000);
    if (!rtf) return fmtDate.format(d);
    const a = Math.abs(s);
    if (a < 60) return rtf.format(Math.round(s), 'second');
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    return fmtDate.format(d);
  };
  const date = (iso?: string | null) => (iso ? fmtDate.format(new Date(iso.endsWith('Z') ? iso : `${iso}Z`)) : '');
  const sourceOf = (k: CodeKey) => k.source || (k.name.startsWith('Deiza Code CLI') ? 'cli' : 'web');

  const shown = keys.filter(k => filter === 'all' || sourceOf(k) === filter);
  const cliCount = keys.filter(k => sourceOf(k) === 'cli').length;

  const create = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const name = newName.trim() || t('ak.unnamed');
      const { raw_key } = await api.createCodeKey(name, expiry || undefined);
      setCreateOpen(false);
      setRevealed({ key: raw_key, name });
      setNewName('');
      setExpiry(0);
      void load();
    } catch (e) {
      setCreateError((e as Error)?.message || t('ak.err.create'));
    } finally {
      setCreating(false);
    }
  };

  const saveRename = async (k: CodeKey) => {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name || name === k.name) return;
    try {
      await api.renameCodeKey(k.id, name);
      setKeys(ks => ks.map(x => (x.id === k.id ? { ...x, name } : x)));
    } catch {
      toast.error(t('ak.err.rename'));
    }
  };

  const revoke = async () => {
    const k = revokeTarget;
    if (!k) return;
    setRevokeTarget(null);
    try {
      await api.revokeCodeKey(k.id);
      setKeys(ks => ks.filter(x => x.id !== k.id));
      toast.success(t('ak.revoked', { name: k.name }));
    } catch {
      toast.error(t('ak.err.revoke'));
    }
  };

  const openDocs = () => {
    if (isNative()) window.open(DOCS, '_blank');
    else window.location.assign('/docs/');
  };

  const pct5 = usage && usage.token_limit > 0 ? Math.min(100, Math.round((usage.tokens_used / usage.token_limit) * 100)) : 0;
  const weekIn = countdownLabel(usage?.weekly_reset_in_seconds ?? secondsUntil(usage?.weekly_reset_at));
  const weekWhen = resetDateLabel(usage?.weekly_reset_at, language, true);
  const windowIn = usage && usage.tokens_used > 0 ? countdownLabel(usage.reset_in_seconds) : null;

  const KeyMenu = ({ k }: { k: CodeKey }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors focus-ring" aria-label={t('ak.actions')}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => { setRenaming(k.id); setRenameValue(k.name); }}>
          <Pencil className="w-3.5 h-3.5 mr-2" />{t('ak.rename')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setRevokeTarget(k)} className="text-red-400 focus:text-red-400">
          <Trash2 className="w-3.5 h-3.5 mr-2" />{t('ak.revoke')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const NameCell = ({ k }: { k: CodeKey }) => (renaming === k.id ? (
    <input
      autoFocus
      value={renameValue}
      onChange={e => setRenameValue(e.target.value)}
      onBlur={() => saveRename(k)}
      onKeyDown={e => { if (e.key === 'Enter') saveRename(k); if (e.key === 'Escape') setRenaming(null); }}
      maxLength={120}
      className="w-full bg-muted/40 rounded-lg px-2 py-1 font-body text-[13.5px] text-foreground outline-none border border-primary/50"
      style={{ fontSize: '16px' }}
    />
  ) : (
    <span className="font-body text-[13.5px] font-medium text-foreground truncate block" title={k.name}>{k.name}</span>
  ));

  const SourceBadge = ({ k }: { k: CodeKey }) => {
    const s = sourceOf(k);
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-body text-[10.5px] font-medium tracking-wide ${s === 'cli' ? 'bg-deiza-ochre/15 text-deiza-ochre' : 'bg-primary/10 text-primary'}`}>
        {s === 'cli' ? 'CLI' : 'Web'}
      </span>
    );
  };

  const Expiry = ({ k }: { k: CodeKey }) => {
    if (!k.expires_at) return <span className="text-muted-foreground/60">{t('ak.noexpiry')}</span>;
    if (k.expired) return <span className="text-red-400">{t('ak.expired')}</span>;
    return <span>{date(k.expires_at)}</span>;
  };

  return (
    <div className="min-h-dvh bg-background text-foreground relative">
      <AmbientRose />
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background/85 backdrop-blur-xl border-b border-border/20">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors focus-ring" aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <button onClick={() => navigate('/workspace')} className="flex items-center gap-2 focus-ring rounded-lg">
          <img src={logo} alt="" className="w-7 h-7 blend-multiply" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </button>
        <span className="ml-1 font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">API</span>
        <button onClick={openDocs} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring">
          <BookOpen className="w-3.5 h-3.5" /> {t('ak.docs')}
        </button>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 pb-24">
        <motion.div className="mt-8 sm:mt-12 flex flex-wrap items-end justify-between gap-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          <div className="max-w-2xl">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-3">{t('ak.kicker')}</p>
            <h1 className="font-display text-[34px] sm:text-5xl leading-[1.05] tracking-tight">{t('ak.title')}</h1>
            <p className="font-body text-[15px] text-muted-foreground mt-3 leading-relaxed">{t('ak.subtitle')}</p>
          </div>
          <button
            onClick={() => { setCreateOpen(true); setCreateError(''); }}
            disabled={keys.length >= maxKeys}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {t('ak.create')}
          </button>
        </motion.div>

        {plan === 'free' && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[22px] border border-primary/30 bg-primary/[0.07] px-5 py-4">
            <p className="flex-1 min-w-[220px] font-body text-[13.5px] text-foreground/90">{t('ak.free')}</p>
            <button onClick={() => navigate('/plans')} className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring">{t('ak.free.cta')}</button>
          </div>
        )}

        {/* Quick start */}
        <motion.section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}>
          <div className="rounded-[22px] border border-border/30 bg-card/60 p-5">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">{t('ak.base')}</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted/40 border border-border/30 pl-3 pr-1 py-1">
              <code className="flex-1 min-w-0 truncate font-mono text-[13px] text-foreground">{BASE}</code>
              <CopyBtn text={BASE} />
            </div>
            <p className="mt-5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">{t('ak.models')}</p>
            <ul className="mt-2 space-y-1.5">
              {MODELS.map(m => (
                <li key={m.id} className="flex items-center gap-2">
                  <code className="font-mono text-[12.5px] text-primary">{m.id}</code>
                  <span className="font-body text-[11.5px] text-muted-foreground/70">{t(`ak.model.${m.note}`)}</span>
                  <CopyBtn text={m.id} className="ml-auto" />
                </li>
              ))}
            </ul>
            <p className="mt-5 font-body text-[12.5px] leading-relaxed text-muted-foreground">
              {t('ak.compat')}{' '}
              <button onClick={openDocs} className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary focus-ring rounded">{t('ak.readdocs')}</button>
            </p>
          </div>
          <CodeTabs apiKey="" t={t} />
        </motion.section>

        {/* Plan usage */}
        {usage && usage.token_limit > 0 && (
          <motion.section className="mt-4 grid gap-4 sm:grid-cols-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
            <button onClick={() => navigate('/plans')} className="text-left rounded-[22px] border border-border/30 bg-card/60 px-5 py-4 hover:bg-card/90 transition-colors focus-ring">
              <div className="flex items-baseline justify-between font-body">
                <span className="text-[12px] text-muted-foreground">{t('ak.window')}{plan ? ` · ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : ''}</span>
                <span className="text-[13px] tabular-nums text-foreground">{pct5}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted/60 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct5}%` }} /></div>
              <p className="mt-2 font-body text-[11.5px] text-muted-foreground/70">{windowIn ? t('ak.resetsin', { t: windowIn }) : t('ak.windowidle')}</p>
            </button>
            <button onClick={() => navigate('/plans')} className="text-left rounded-[22px] border border-border/30 bg-card/60 px-5 py-4 hover:bg-card/90 transition-colors focus-ring">
              <div className="flex items-baseline justify-between font-body">
                <span className="text-[12px] text-muted-foreground">{t('ak.week')}</span>
                <span className="text-[13px] tabular-nums text-foreground">{Math.round(usage.weekly_pct || 0)}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted/60 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, usage.weekly_pct || 0)}%` }} /></div>
              <p className="mt-2 font-body text-[11.5px] text-muted-foreground/70 truncate">{weekIn && weekWhen ? t('ak.weekreset', { when: weekWhen, t: weekIn }) : ''}</p>
            </button>
          </motion.section>
        )}

        {/* Keys */}
        <motion.section className="mt-10" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.15 }}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-2xl tracking-tight">{t('ak.yours')}</h2>
              <p className="font-body text-[12.5px] text-muted-foreground/70 mt-0.5">{t('ak.count', { n: keys.length, max: maxKeys })}</p>
            </div>
            {keys.length > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1" role="tablist">
                {(['all', 'web', 'cli'] as const).map(f => (
                  <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-full font-body text-[12px] transition-colors focus-ring ${filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {f === 'all' ? t('ak.filter.all') : f === 'web' ? 'Web' : 'CLI'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && !loading && <p className="font-body text-[13px] text-red-400 mb-3">{t('ak.err.load')}</p>}

          {loading ? (
            <div className="rounded-[22px] border border-border/30 bg-card/40 h-40 animate-pulse" />
          ) : keys.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/50 bg-card/30 px-6 py-10 text-center">
              <KeyRound className="w-7 h-7 mx-auto text-primary/70" aria-hidden="true" />
              <p className="mt-3 font-display text-xl">{t('ak.empty.title')}</p>
              <p className="mt-1 font-body text-[13.5px] text-muted-foreground max-w-md mx-auto">{t('ak.empty.desc')}</p>
              <button onClick={() => setCreateOpen(true)} className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring">
                <Plus className="w-4 h-4" /> {t('ak.create')}
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-[22px] border border-border/30 bg-card/60 overflow-hidden">
                <table className="w-full font-body text-[13px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
                      <th className="px-5 py-3 font-semibold">{t('ak.col.name')}</th>
                      <th className="px-3 py-3 font-semibold">{t('ak.col.key')}</th>
                      <th className="px-3 py-3 font-semibold">{t('ak.col.origin')}</th>
                      <th className="px-3 py-3 font-semibold">{t('ak.col.created')}</th>
                      <th className="px-3 py-3 font-semibold">{t('ak.col.lastused')}</th>
                      <th className="px-3 py-3 font-semibold text-right">{t('ak.col.requests')}</th>
                      <th className="px-3 py-3 font-semibold">{t('ak.col.expires')}</th>
                      <th className="px-3 py-3" aria-label={t('ak.actions')} />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(k => (
                      <tr key={k.id} className={`border-t border-border/20 ${k.expired ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3 max-w-[220px]"><NameCell k={k} /></td>
                        <td className="px-3 py-3"><code className="font-mono text-[12px] text-muted-foreground">{k.display || k.key_prefix}</code></td>
                        <td className="px-3 py-3"><SourceBadge k={k} /></td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{date(k.created_at)}</td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap" title={k.last_used_at ? new Date(`${k.last_used_at}Z`).toLocaleString(language) : undefined}>{ago(k.last_used_at)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{(k.use_count || 0).toLocaleString(language)}</td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap"><Expiry k={k} /></td>
                        <td className="px-3 py-3 text-right"><KeyMenu k={k} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <ul className="md:hidden space-y-2">
                {shown.map(k => (
                  <li key={k.id} className={`rounded-2xl border border-border/30 bg-card/60 px-4 py-3 ${k.expired ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0"><NameCell k={k} /></div>
                      <SourceBadge k={k} />
                      <KeyMenu k={k} />
                    </div>
                    <code className="mt-1 block font-mono text-[12px] text-muted-foreground">{k.display || k.key_prefix}</code>
                    <p className="mt-1.5 font-body text-[11.5px] text-muted-foreground/75">
                      {t('ak.lastused')} {ago(k.last_used_at)} · {t('ak.requests', { n: (k.use_count || 0).toLocaleString(language) })} · <Expiry k={k} />
                    </p>
                  </li>
                ))}
              </ul>
              {cliCount >= 3 && filter !== 'web' && (
                <p className="mt-3 font-body text-[12px] text-muted-foreground/70">{t('ak.clihint')}</p>
              )}
            </>
          )}
        </motion.section>

        <p className="mt-10 font-body text-[12px] leading-relaxed text-muted-foreground/60 max-w-2xl">{t('ak.security')}</p>
      </main>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-card border-border/30">
          <DialogTitle className="font-display text-2xl font-normal tracking-tight">{t('ak.new.title')}</DialogTitle>
          <DialogDescription className="font-body text-[13px] text-muted-foreground">{t('ak.new.desc')}</DialogDescription>
          <form onSubmit={e => { e.preventDefault(); void create(); }} className="mt-2 space-y-4">
            <label className="block">
              <span className="font-body text-[12px] font-medium text-foreground/80">{t('ak.new.name')}</span>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={120}
                placeholder={t('ak.new.name.ph')}
                className="mt-1.5 w-full bg-muted/30 rounded-xl px-3 py-2.5 font-body text-foreground placeholder:text-muted-foreground/40 outline-none border border-border/40 focus:border-primary/60 transition-colors"
                style={{ fontSize: '16px' }}
              />
            </label>
            <div>
              <span className="font-body text-[12px] font-medium text-foreground/80">{t('ak.new.expiry')}</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXPIRY.map(d => (
                  <button key={d} type="button" onClick={() => setExpiry(d)}
                    className={`px-3 py-1.5 rounded-full font-body text-[12.5px] border transition-colors focus-ring ${expiry === d ? 'border-primary bg-primary/10 text-foreground' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}>
                    {d === 0 ? t('ak.noexpiry') : d === 365 ? t('ak.year') : t('ak.days', { n: d })}
                  </button>
                ))}
              </div>
            </div>
            {createError && <p className="font-body text-[12.5px] text-red-400">{createError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-full font-body text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring">{t('ak.cancel')}</button>
              <button type="submit" disabled={creating} className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring disabled:opacity-50">{creating ? '…' : t('ak.create')}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reveal (once) */}
      <Dialog open={Boolean(revealed)} onOpenChange={o => { if (!o) setRevealed(null); }}>
        <DialogContent className="max-w-xl rounded-3xl bg-card border-border/30" onInteractOutside={e => e.preventDefault()}>
          <DialogTitle className="font-display text-2xl font-normal tracking-tight">{t('ak.reveal.title')}</DialogTitle>
          <DialogDescription className="font-body text-[13px] text-muted-foreground">{revealed?.name}</DialogDescription>
          <div className="mt-1 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-body text-[12.5px] text-foreground/85">{t('ak.reveal.warn')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border/40 pl-3 pr-1 py-1.5">
            <code className="flex-1 min-w-0 break-all font-mono text-[12.5px] text-foreground select-all">{revealed?.key}</code>
            <CopyBtn text={revealed?.key || ''} label={t('ak.copy')} done={t('ak.copied')} />
          </div>
          <p className="font-body text-[12px] text-muted-foreground mt-1">{t('ak.reveal.try')}</p>
          <CodeTabs apiKey={revealed?.key || ''} t={t} />
          <div className="flex justify-end pt-1">
            <button onClick={() => setRevealed(null)} className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring">{t('ak.reveal.done')}</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <Dialog open={Boolean(revokeTarget)} onOpenChange={o => { if (!o) setRevokeTarget(null); }}>
        <DialogContent className="max-w-md rounded-3xl bg-card border-border/30">
          <DialogTitle className="font-display text-2xl font-normal tracking-tight">{t('ak.revoke.title', { name: revokeTarget?.name || '' })}</DialogTitle>
          <DialogDescription className="font-body text-[13px] text-muted-foreground">{t('ak.revoke.desc')}</DialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setRevokeTarget(null)} className="px-4 py-2 rounded-full font-body text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-ring">{t('ak.cancel')}</button>
            <button onClick={revoke} className="px-4 py-2 rounded-full bg-red-500/90 hover:bg-red-500 text-white font-body text-sm font-medium transition focus-ring">{t('ak.revoke')}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiKeys;
