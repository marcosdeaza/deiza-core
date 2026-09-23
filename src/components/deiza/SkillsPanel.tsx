import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, ChevronDown, Sparkles, Loader2, FileText, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, type CustomSkill } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';

const Toggle = ({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={e => { e.stopPropagation(); onToggle(); }}
    className={`w-10 h-[22px] rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-muted/70'}`}
  >
    <motion.span
      className="w-[18px] h-[18px] rounded-full bg-white shadow-sm absolute top-[2px]"
      animate={{ left: on ? 20 : 2 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
    />
  </button>
);

/** Title from the first markdown heading (or the file name), description from the first paragraph. */
function parseSkillMarkdown(text: string, fallbackName: string): { name: string; description: string } {
  const lines = text.replace(/\r/g, '').split('\n');
  let name = '';
  let description = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!name && /^#{1,3}\s+/.test(line)) { name = line.replace(/^#{1,3}\s+/, '').trim(); continue; }
    if (/^(name|title)\s*:/i.test(line) && !name) { name = line.split(':').slice(1).join(':').trim(); continue; }
    if (/^description\s*:/i.test(line)) { description = line.split(':').slice(1).join(':').trim(); continue; }
    if (line === '---' || line.startsWith('#')) continue;
    if (!description) { description = line.replace(/[*_`>]/g, '').slice(0, 160); }
    if (name && description) break;
  }
  return { name: (name || fallbackName).slice(0, 80), description };
}

const MAX_CHARS = 8000;

/** Settings → Skills: import a Markdown file, name it, switch it on. That's it. */
const SkillsPanel = () => {
  const { t } = useLanguage();
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSkills().then(r => setSkills(r.custom || [])).catch(() => { /* keep empty */ }).finally(() => setLoading(false));
  }, []);

  const persist = async (next: CustomSkill[]) => {
    setSkills(next);
    try {
      const r = await api.updateSkills({ custom: next });
      setSkills(r.custom);
    } catch {
      toast.error(t('skl.err.save'));
    }
  };

  const addFromText = (text: string, fallbackName: string) => {
    const body = text.trim();
    if (!body) { toast.info(t('skl.empty.file')); return; }
    const { name, description } = parseSkillMarkdown(body, fallbackName);
    const sk: CustomSkill = { id: `skill-${Date.now()}`, name, description, instructions: body.slice(0, MAX_CHARS), enabled: true };
    void persist([...skills, sk]);
    setOpen(true);
    if (body.length > MAX_CHARS) toast.info(t('skl.truncated', { n: MAX_CHARS.toLocaleString() }));
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 5)) {
      const text = await f.text();
      addFromText(text, f.name.replace(/\.(md|markdown|txt)$/i, ''));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const active = skills.filter(s => s.enabled).length;

  return (
    <div className="rounded-2xl bg-card/60" style={{ border: '0.5px solid hsl(var(--border) / 0.25)' }}>
      {/* Summary row */}
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-4 p-4 text-left focus-ring rounded-2xl" aria-expanded={open}>
        <div className="w-10 h-10 rounded-2xl bg-primary/12 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-medium text-foreground">Skills</p>
          <p className="font-body text-xs text-muted-foreground mt-0.5 leading-snug">
            {loading
              ? t('common.loading')
              : skills.length === 0
                ? t('skl.summary.empty')
                : `${active}/${skills.length} ${t('skl.active')}`}
          </p>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted-foreground/50 shrink-0">
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-3">
                <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple className="hidden" onChange={e => void onFiles(e.target.files)} />
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-primary text-primary-foreground font-body text-[12.5px] font-medium hover:brightness-110 transition focus-ring">
                  <Upload className="w-3.5 h-3.5" /> {t('skl.import')}
                </button>
                <button onClick={() => setPasting(v => !v)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-[12.5px] font-medium transition focus-ring">
                  <FileText className="w-3.5 h-3.5" /> {t('skl.paste')}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {pasting && (
                  <motion.div key="paste" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder={t('skl.paste.ph')}
                      rows={6}
                      className="w-full bg-muted/30 rounded-xl px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none border border-border/30 focus:border-primary/50 resize-y mb-2"
                      style={{ fontSize: '16px' }}
                      maxLength={MAX_CHARS}
                    />
                    <div className="flex justify-end gap-2 mb-3">
                      <button onClick={() => { setPasting(false); setPasteText(''); }} className="px-3 py-1.5 rounded-full text-xs font-body text-muted-foreground hover:bg-muted/60 focus-ring">{t('ws.cancel')}</button>
                      <button onClick={() => { addFromText(pasteText, t('skl.untitled')); setPasting(false); setPasteText(''); }} className="px-4 py-1.5 rounded-full text-xs font-body font-semibold bg-primary text-primary-foreground hover:brightness-110 focus-ring">{t('skl.add')}</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {loading ? (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground/60 text-xs font-body">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('skl.loading')}
                </div>
              ) : skills.length === 0 ? (
                <p className="font-body text-[12.5px] text-muted-foreground/55 leading-relaxed px-1">
                  {t('skl.explain')}
                </p>
              ) : (
                <ul className="divide-y divide-border/20 rounded-xl overflow-hidden border border-border/20">
                  {skills.map(sk => {
                    const isOpen = expanded === sk.id;
                    const isRenaming = renaming?.id === sk.id;
                    return (
                      <li key={sk.id} className="bg-background/30">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <button onClick={() => setExpanded(isOpen ? null : sk.id)} className="flex-1 min-w-0 text-left focus-ring rounded" aria-expanded={isOpen}>
                            {isRenaming ? (
                              <span className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  value={renaming.name}
                                  onChange={e => setRenaming({ id: sk.id, name: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { void persist(skills.map(x => (x.id === sk.id ? { ...x, name: renaming.name.trim() || x.name } : x))); setRenaming(null); }
                                    if (e.key === 'Escape') setRenaming(null);
                                  }}
                                  className="flex-1 min-w-0 bg-transparent border-b border-primary/40 outline-none font-body text-[13px] text-foreground"
                                  style={{ fontSize: '16px' }}
                                  maxLength={80}
                                />
                                <button onClick={() => { void persist(skills.map(x => (x.id === sk.id ? { ...x, name: renaming.name.trim() || x.name } : x))); setRenaming(null); }} className="p-1 rounded text-primary focus-ring" aria-label="OK"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setRenaming(null)} className="p-1 rounded text-muted-foreground focus-ring" aria-label={t('ws.cancel')}><X className="w-3.5 h-3.5" /></button>
                              </span>
                            ) : (
                              <>
                                <span className={`block font-body text-[13px] font-medium truncate ${sk.enabled ? 'text-foreground' : 'text-foreground/60'}`}>{sk.name}</span>
                                <span className="block font-body text-[11.5px] text-muted-foreground/65 truncate">
                                  {sk.description || `${(sk.instructions || '').length.toLocaleString()} ${t('skl.chars')}`}
                                </span>
                              </>
                            )}
                          </button>
                          <Toggle on={sk.enabled} onToggle={() => void persist(skills.map(x => (x.id === sk.id ? { ...x, enabled: !x.enabled } : x)))} label={sk.name} />
                        </div>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div key="detail" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="px-3 pb-3">
                                <pre className="max-h-56 overflow-auto rounded-lg bg-muted/30 border border-border/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap" style={{ contain: 'inline-size' }}>{sk.instructions}</pre>
                                <div className="flex items-center justify-between mt-2">
                                  <span className="font-body text-[11px] text-muted-foreground/50">{(sk.instructions || '').length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
                                  <span className="flex items-center gap-1">
                                    <button onClick={() => setRenaming({ id: sk.id, name: sk.name })} className="px-2 py-1 rounded-md font-body text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-ring">{t('ws.rename')}</button>
                                    <button onClick={() => { void persist(skills.filter(x => x.id !== sk.id)); setExpanded(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-body text-[11.5px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-ring">
                                      <Trash2 className="w-3 h-3" /> {t('ws.delete')}
                                    </button>
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SkillsPanel;
