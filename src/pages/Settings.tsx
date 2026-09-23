import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import {
  ArrowLeft, Brain, MessageSquare,
  ChevronRight, LogOut, Globe, Sparkles, Shield, Info, Trash2, Sun, Moon, Check, KeyRound, Plus, Copy, X,
  Link2, Newspaper, BookOpen, Camera, User as UserIcon,
} from 'lucide-react';
import SkillsPanel from '@/components/deiza/SkillsPanel';
import { getMemoryFacts, clearMemoryFacts, isMemoryEnabled, setMemoryEnabled, syncMemoryFromServer } from '@/lib/memory';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.png';
import { api, CodeKey, authHeaders } from '@/services/api';
import { LEGAL_DOCS } from '@/data/legal';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { haptic, isNative } from '@/lib/native';
import { isDesktopApp, desktopBridge } from '@/lib/desktop';

const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={e => { e.stopPropagation(); haptic('selection'); onToggle(); }}
    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-muted/70'}`}
  >
    <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

const Row = ({
  icon, iconBg = 'bg-muted/50', label, sublabel, right, onClick,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick ? () => { haptic('light'); onClick(); } : undefined}
    className="press w-full flex items-center gap-4 p-4 rounded-2xl bg-card/60 hover:bg-card/90 transition-colors text-left"
    style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
  >
    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-body text-sm font-medium text-foreground">{label}</p>
      {sublabel && <p className="font-body text-xs text-muted-foreground mt-0.5 leading-snug">{sublabel}</p>}
    </div>
    {right}
  </button>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <motion.section
    className="mb-7"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <h2 className="font-body text-[11px] font-semibold text-muted-foreground/55 uppercase tracking-widest mb-3 px-1">
      {title}
    </h2>
    <div className="space-y-2">
      {children}
    </div>
  </motion.section>
);

const Settings = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const native = isNative();
  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[1];
  // ── Profile editing ──
  const [editingName, setEditingName] = useState(user?.name || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const { updateProfile } = useAuth();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5 MB'); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({
        name: editingName.trim() || undefined,
        avatarFile: avatarFile || undefined,
      });
      setAvatarFile(null);
      setAvatarPreview(null);
      toast.success(t('st.profile.saved'));
    } catch {
      toast.error(t('st.profile.error'));
    } finally {
      setSavingProfile(false);
    }
  };

  const avatarUrl = avatarPreview || user?.avatar_url || user?.picture || null;
  const inDesktopApp = typeof isDesktopApp === 'function' && isDesktopApp();
  const desktopVersion = inDesktopApp ? desktopBridge()?.version : null;


  const [langOpen, setLangOpen] = useState(false);
  // Dark mode only — no light theme
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('deiza-dark-mode', 'true');
  }, []);
  useEffect(() => { document.body.style.overflow = ''; }, []);
  const [memoryMode, setMemoryMode] = useState(() => isMemoryEnabled());
  // "Respaldo por cadena": try previous/peer versions of the same model family when one fails
  const [chainFallback, setChainFallback] = useState(() => localStorage.getItem('deiza-chain-fallback') !== 'false');
  const toggleChainFallback = () => {
    setChainFallback(v => {
      const next = !v;
      localStorage.setItem('deiza-chain-fallback', next ? 'true' : 'false');
      return next;
    });
  };
  const [memoryFacts, setMemoryFactsState] = useState(() => getMemoryFacts());
  const [initialPrompt, setInitialPrompt] = useState(() => localStorage.getItem('deiza-initial-prompt') || '');
  // Privacy self-service (RGPD art. 15/17/20)
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '';

  const exportData = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API_BASE}/api/account/export`, { credentials: 'include', headers: { ...authHeaders() } });
      if (!r.ok) throw new Error('export');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `deiza-datos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      toast.error(t('st.export.error'));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true); setDeleteError(null);
    try {
      const r = await fetch(`${API_BASE}/api/account`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ confirm_email: deleteEmail.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDeleteError(d.error === 'confirm_email_mismatch' ? t('st.delete.mismatch') : t('st.delete.failed'));
        setDeleting(false);
        return;
      }
      try { localStorage.clear(); } catch { /* no-op */ }
      logout();
      navigate('/');
    } catch {
      setDeleteError(t('api.err.network'));
      setDeleting(false);
    }
  };

  const [saved, setSaved] = useState(false);
  const [keys, setKeys] = useState<CodeKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keysError, setKeysError] = useState(false);

  useEffect(() => {
    void syncMemoryFromServer().then(({ enabled, items }) => {
      setMemoryMode(enabled);
      setMemoryFactsState(items);
    });
  }, []);

  useEffect(() => {
    api.getCodeKeys()
      .then(({ keys }) => setKeys(keys))
      .catch(() => setKeysError(true))
      .finally(() => setKeysLoading(false));
  }, []);

  const createKey = async () => {
    setCreating(true);
    try {
      const { raw_key } = await api.createCodeKey(newKeyName.trim() || 'mi-clave');
      const { keys: updated } = await api.getCodeKeys();
      setKeys(updated);
      setNewKeyName('');
      setRawKey(raw_key);
      setCopiedKey(false);
    } catch {
      setKeysError(true);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: number) => {
    try {
      await api.revokeCodeKey(id);
      setKeys(k => k.filter(x => x.id !== id));
    } catch {
      setKeysError(true);
    }
  };

  const toggleMemory = () => {
    const next = !memoryMode;
    setMemoryMode(next);
    setMemoryEnabled(next);
  };

  const savePrompt = () => {
    localStorage.setItem('deiza-initial-prompt', initialPrompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className="min-h-dvh bg-background"
      style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      <AmbientRose />

      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4 bg-background/90 backdrop-blur-xl border-b border-border/20"
        style={{ height: 'calc(56px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <div className="flex items-center gap-2">
          <img src={logo} alt="Deiza" className="w-7 h-7 rounded-lg blend-multiply" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </div>
      </header>

      {/* Two-column on desktop, single on mobile */}
      <div className="px-4 pb-12 mx-auto w-full max-w-3xl">
        <motion.div
          className="mt-6 mb-8"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h1 className="font-display text-3xl tracking-tight text-foreground mb-1">
            {t('st.title')}
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            {t('st.subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {/* Left column */}
          <div>

            {/* Profile */}
            <Section title={t('st.profile') || 'Perfil'}>
              <div
                className="p-5 rounded-2xl bg-card/60"
                style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
              >
                <div className="flex items-center gap-4 mb-4">
                  {/* Avatar */}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative w-16 h-16 rounded-full overflow-hidden bg-muted/50 border-2 border-border/30 hover:border-primary/50 transition-colors group shrink-0"
                    aria-label="Cambiar foto"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-display text-foreground/60">
                        {user?.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <input
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      placeholder={t('st.profile.name') || 'Tu nombre'}
                      className="w-full bg-transparent font-body text-lg font-semibold text-foreground outline-none border-b border-transparent focus:border-primary/50 transition-colors pb-0.5"
                      style={{ fontSize: '16px' }}
                      maxLength={100}
                    />
                    <p className="font-body text-xs text-muted-foreground/60 mt-1">{user?.email}</p>
                  </div>
                </div>
                {(editingName.trim() !== (user?.name || '') || avatarFile) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex justify-end gap-2"
                  >
                    <button
                      onClick={() => { setEditingName(user?.name || ''); setAvatarFile(null); setAvatarPreview(null); }}
                      className="px-4 py-2 rounded-full text-xs font-body font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('ws.cancel') || 'Cancelar'}
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={savingProfile}
                      className="px-4 py-2 rounded-full text-xs font-body font-semibold bg-primary text-primary-foreground hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      {savingProfile ? '...' : (t('st.save') || 'Guardar')}
                    </button>
                  </motion.div>
                )}
              </div>
            </Section>

            {/* Language */}
            <Section title={t('st.general')}>
              <Row
                onClick={() => setLangOpen(!langOpen)}
                icon={<Globe className="w-5 h-5 text-blue-400" />}
                iconBg="bg-blue-500/15"
                label={t('st.language')}
                sublabel={t('st.language.desc')}
                right={
                  <span className="font-body text-xs font-semibold text-foreground/70 bg-muted/60 px-2.5 py-1 rounded-full shrink-0">
                    {currentLang.flag} {currentLang.nativeName}
                  </span>
                }
              />
              <AnimatePresence initial={false}>
                {langOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-2xl bg-card/60 border border-border/25 max-h-72 overflow-y-auto">
                      {LANGUAGES.map(l => (
                        <button
                          key={l.code}
                          onClick={() => { haptic('selection'); setLanguage(l.code); setLangOpen(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                            language === l.code ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'
                          }`}
                        >
                          <span className="text-base leading-none">{l.flag}</span>
                          <span className="flex-1 font-body text-sm">{l.nativeName}</span>
                          {language === l.code && <Check className="w-4 h-4 shrink-0 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {/* AI Behavior */}
            <Section title={t('st.ai')}>
              <Row
                onClick={toggleMemory}
                icon={<Brain className="w-5 h-5 text-primary" />}
                iconBg="bg-primary/12"
                label={t('st.memory')}
                sublabel={memoryMode
                  ? t('st.memory.on')
                  : t('st.memory.off')}
                right={<Toggle on={memoryMode} onToggle={toggleMemory} />}
              />

              {/* Memory facts */}
              {memoryMode && memoryFacts.length > 0 && (
                <div className="p-4 rounded-2xl bg-card/60" style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-body text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide">
                      {t('st.memory.what')}
                    </p>
                    <button
                      onClick={() => { clearMemoryFacts(); setMemoryFactsState([]); }}
                      className="flex items-center gap-1.5 text-xs font-body text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('st.clear')}
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {memoryFacts.map((f, i) => (
                      <li key={i} className="font-body text-sm text-foreground/75 leading-snug">· {f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Initial prompt */}
              <div
                className="p-4 rounded-2xl bg-card/60"
                style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-secondary/15 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-secondary-foreground/80" />
                  </div>
                  <div className="flex-1">
                    <p className="font-body text-sm font-medium text-foreground">
                      {t('st.prompt')}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {t('st.prompt.desc')}
                    </p>
                  </div>
                </div>
                <textarea
                  value={initialPrompt}
                  onChange={e => setInitialPrompt(e.target.value)}
                  placeholder={t('st.prompt.placeholder')}
                  className="w-full bg-muted/30 rounded-xl p-3 text-sm font-body text-foreground placeholder:text-muted-foreground/40 outline-none border border-border/30 focus:border-primary/50 transition-colors resize-none"
                  rows={3}
                  style={{ fontSize: '16px' }}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={savePrompt}
                    className={`px-4 py-2 rounded-full text-xs font-body font-semibold transition-all ${
                      saved
                        ? 'bg-green-500/15 text-green-600'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {saved ? t('st.saved') : t('st.save')}
                  </button>
                </div>
              </div>

              {/* Chain fallback */}
              <Row
                onClick={toggleChainFallback}
                icon={<Link2 className="w-5 h-5 text-amber-400" />}
                iconBg="bg-amber-500/15"
                label={t('st.chain')}
                sublabel={chainFallback ? t('st.chain.on') : t('st.chain.off')}
                right={<Toggle on={chainFallback} onToggle={toggleChainFallback} />}
              />

              {/* Skills */}
              <SkillsPanel />
            </Section>
          </div>

          {/* Right column */}
          <div>
            {/* Desktop Update */}
            {inDesktopApp && (
              <Section title="Deiza Desktop">
                <Row
                  icon={<Download className="w-5 h-5 text-green-400" />}
                  iconBg="bg-green-500/15"
                  label={`Versión ${desktopVersion || '1.0.0'}`}
                  sublabel={t('st.desktop.uptodate') || 'Deiza para escritorio'}
                  onClick={async () => {
                    const bridge = desktopBridge();
                    if (bridge?.checkUpdate) {
                      try {
                        const update = await bridge.checkUpdate();
                        if (update.available) {
                          toast.success(`Versión ${update.version} disponible`, {
                            action: { label: 'Instalar', onClick: () => bridge.installUpdate?.() },
                            duration: 15000,
                          });
                        } else {
                          toast.success(t('st.desktop.uptodate') || 'Ya tienes la última versión');
                        }
                      } catch { toast.error('Error al buscar actualizaciones'); }
                    } else {
                      toast.info(t('st.desktop.uptodate') || 'Ya tienes la última versión');
                    }
                  }}
                  right={<ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
                />
              </Section>
            )}


            {/* Account */}
            {user && (
              <Section title={t('st.account')}>
                <div
                  className="flex items-center gap-4 p-4 rounded-2xl bg-card/60"
                  style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
                >
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || ''} className="w-12 h-12 rounded-full shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="font-display text-base font-medium text-primary">{user.name?.charAt(0) || 'U'}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-semibold text-foreground truncate">{user.name || user.email}</p>
                    <p className="font-body text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { haptic('medium'); logout(); navigate('/login'); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-body font-medium text-destructive/80 hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t('st.logout')}
                  </button>
                </div>
              </Section>
            )}

            {/* Subscription */}
            <Section title={t('st.subscription')}>
              <Row
                onClick={() => navigate('/plans')}
                icon={<Sparkles className="w-5 h-5 text-violet-400" />}
                iconBg="bg-violet-500/15"
                label={t('st.plans')}
                sublabel={t('st.plans.desc')}
                right={<ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
              />
            </Section>

            {/* API Keys */}
            <Section title={t('st.keys')}>
              <div
                className="p-4 rounded-2xl bg-card/60"
                style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-medium text-foreground">{t('st.keys')}</p>
                    <p className="font-body text-xs text-muted-foreground mt-0.5">{t('st.keys.desc')}</p>
                  </div>
                </div>

                {keysError && !keysLoading && (
                  <p className="font-body text-xs text-destructive mb-2">{t('st.keys.err')}</p>
                )}

                {!keysLoading && keys.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {keys.map(k => (
                      <div key={k.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30">
                        <div className="min-w-0">
                          <p className="font-body text-xs font-medium text-foreground truncate">{k.name}</p>
                          <p className="font-body text-[11px] text-muted-foreground/60">
                            {k.key_prefix} · {k.last_used_at
                              ? new Date(k.last_used_at).toLocaleDateString()
                              : t('st.keys.never')}
                          </p>
                        </div>
                        <button
                          onClick={() => revokeKey(k.id)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!keysLoading && keys.length === 0 && !keysError && (
                  <p className="font-body text-xs text-muted-foreground/60 mb-3">{t('st.keys.empty')}</p>
                )}

                <div className="flex gap-2">
                  <input
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    placeholder={t('st.keys.name.ph')}
                    className="flex-1 bg-muted/30 rounded-xl px-3 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground/40 outline-none border border-border/30 focus:border-primary/50 transition-colors"
                    onKeyDown={e => { if (e.key === 'Enter') createKey(); }}
                    style={{ fontSize: '16px' }}
                  />
                  <button
                    onClick={createKey}
                    disabled={creating}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-body font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('st.keys.create')}
                  </button>
                </div>
              </div>
            </Section>

            {/* Raw key modal */}
            <AnimatePresence>
              {rawKey && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                  onClick={() => setRawKey(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl"
                    style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-body text-sm font-semibold text-foreground">{t('st.keys.raw.title')}</p>
                        <p className="font-body text-xs text-muted-foreground mt-0.5">{t('st.keys.raw.desc')}</p>
                      </div>
                      <button
                        onClick={() => setRawKey(null)}
                        className="shrink-0 p-1.5 rounded-full hover:bg-muted/70 transition-colors"
                      >
                        <X className="w-4 h-4 text-muted-foreground/60" />
                      </button>
                    </div>
                    <div className="relative mb-4">
                      <code className="block w-full bg-muted/40 rounded-xl p-3 text-xs font-mono text-foreground break-all select-all border border-border/30">
                        {rawKey}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(rawKey); setCopiedKey(true); }}
                        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-body font-medium bg-muted/60 hover:bg-muted/90 transition-colors text-muted-foreground"
                      >
                        {copiedKey ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copiedKey ? t('st.keys.copied') : t('st.keys.copy')}
                      </button>
                    </div>
                    <button
                      onClick={() => setRawKey(null)}
                      className="w-full py-2.5 rounded-xl text-sm font-body font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                    >
                      {t('st.keys.done')}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Your data: RGPD self-service */}
            <div id="datos" className="scroll-mt-20" />
            <Section title={t('st.data')}>
              <Row
                onClick={exportData}
                icon={<Download className="w-5 h-5 text-emerald-500" />}
                iconBg="bg-emerald-500/15"
                label={t('st.data.export')}
                sublabel={t('st.data.export.desc')}
                right={exporting ? <span className="font-body text-xs text-muted-foreground">…</span> : <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              />
              <Row
                onClick={() => navigate('/legal/privacidad')}
                icon={<FileText className="w-5 h-5 text-sky-400" />}
                iconBg="bg-sky-500/15"
                label={t('st.data.legal')}
                sublabel={LEGAL_DOCS.map(d => d.title[language === 'es' ? 'es' : 'en']).join(' · ')}
                right={<ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              />
              <Row
                onClick={() => { setDeleteOpen(true); setDeleteEmail(''); setDeleteError(null); }}
                icon={<Trash2 className="w-5 h-5 text-destructive" />}
                iconBg="bg-destructive/12"
                label={t('st.delete.title')}
                sublabel={t('st.delete.desc')}
                right={<ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              />
            </Section>

            {/* About */}
            <Section title={t('st.about')}>
              <Row
                onClick={() => navigate('/docs')}
                icon={<BookOpen className="w-5 h-5 text-sky-400" />}
                iconBg="bg-sky-500/15"
                label={t('ws.docs')}
                sublabel={t('st.docs.desc')}
                right={<ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              />
              <Row
                onClick={() => navigate('/noticias')}
                icon={<Newspaper className="w-5 h-5 text-primary" />}
                iconBg="bg-primary/12"
                label={t('nav.news')}
                sublabel={t('st.news.desc')}
                right={<ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
              />
              <Row
                icon={<Shield className="w-5 h-5 text-green-500" />}
                iconBg="bg-green-500/15"
                label={t('st.privacy')}
                sublabel={t('st.privacy.desc')}
              />
              <Row
                icon={<Info className="w-4.5 h-4.5 text-muted-foreground" />}
                iconBg="bg-muted/50"
                label="Deiza"
                sublabel={`${t('st.version')} 5.5 · Liquid 5${native ? ' · iOS' : ''}`}
              />
            </Section>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {deleteOpen && (
          <motion.div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !deleting && setDeleteOpen(false)}>
            <motion.div role="dialog" aria-modal="true" className="w-full sm:max-w-md bg-card deiza-border deiza-shadow-lg rounded-t-3xl sm:rounded-3xl p-6 sm:p-7"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-destructive/80 mb-1.5">{t('st.delete.kicker')}</p>
              <h2 className="font-display text-2xl tracking-tight text-foreground leading-tight">{t('st.delete.title')}</h2>
              <p className="font-body text-[14px] text-foreground/80 leading-relaxed mt-3">
                {t('st.delete.body')}
              </p>
              <label className="block mt-5 font-body text-[12.5px] text-muted-foreground">
                {t('st.delete.confirm')}
                <input value={deleteEmail} onChange={e => setDeleteEmail(e.target.value)} placeholder={user?.email || ''} autoComplete="off"
                  className="mt-1.5 w-full px-4 py-3 font-body text-sm bg-background deiza-border rounded-2xl outline-none focus:ring-2 focus:ring-destructive/30 transition-all" />
              </label>
              {deleteError && <p className="mt-3 font-body text-[13px] text-destructive">{deleteError}</p>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="font-body text-[13.5px] font-medium py-3 rounded-full border border-border/50 text-foreground hover:bg-muted/60 transition-colors focus-ring">
                  {t('ws.cancel')}
                </button>
                <button onClick={deleteAccount} disabled={deleting || deleteEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase()}
                  className="font-body text-[13.5px] font-semibold py-3 rounded-full bg-destructive text-destructive-foreground hover:brightness-110 transition disabled:opacity-40 focus-ring">
                  {deleting ? t('st.delete.deleting') : t('st.delete.cta')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
