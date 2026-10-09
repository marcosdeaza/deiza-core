import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Folder } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { haptic } from '@/lib/native';

/**
 * Quiet dropdowns for the row under the composer: the trigger is plain text, the menu
 * opens upwards. Used for the conversation mode and the project.
 */
const useDismiss = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown, { passive: true });
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
};

interface Option<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

interface BarMenuProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  align?: 'left' | 'right';
  icon?: ReactNode;
  triggerText?: string;
}

export function BarMenu<T extends string>({ value, options, onChange, label, align = 'right', icon, triggerText }: BarMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = options.find(o => o.value === value) || options[0];
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { haptic('light'); setOpen(v => !v); }}
        className="flex items-center gap-1.5 h-8 px-2 rounded-lg font-body text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-ring max-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
      >
        {icon}
        <span className="truncate">{triggerText || current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            className={`absolute bottom-full mb-2 ${align === 'right' ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'} z-50 w-[min(300px,calc(100vw-1.5rem))] bg-card border border-border/40 deiza-shadow-lg rounded-2xl p-1.5`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            <div className="px-3 pt-2 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">{label}</div>
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => { haptic('selection'); onChange(o.value); setOpen(false); }}
                className={`w-full flex items-start gap-3 px-3 py-2 rounded-xl text-left transition-colors focus-ring ${o.value === value ? 'bg-primary/[0.08]' : 'hover:bg-muted/50'}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-body text-[13px] font-medium text-foreground/90 truncate">{o.label}</span>
                  {o.detail && <span className="block font-body text-[11px] text-muted-foreground/70 leading-snug mt-0.5">{o.detail}</span>}
                </span>
                <span className="mt-0.5 w-4 shrink-0 flex justify-end">
                  {o.value === value && <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} aria-hidden="true" />}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type ChatMode = 'auto' | 'chat' | 'work';

export const ModeMenu = ({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) => {
  const { t } = useLanguage();
  return (
    <BarMenu<ChatMode>
      value={mode}
      onChange={onChange}
      label={t('mode.label')}
      options={[
        { value: 'auto', label: t('mode.auto'), detail: t('mode.auto.detail') },
        { value: 'chat', label: t('mode.chat'), detail: t('mode.chat.detail') },
        { value: 'work', label: t('mode.work'), detail: t('mode.work.detail') },
      ]}
    />
  );
};

export const ProjectMenu = ({ projects, activeId, onChange }: {
  projects: Array<{ id: number; name: string }>;
  activeId: number | null;
  onChange: (id: number | null) => void;
}) => {
  const { t } = useLanguage();
  const value = activeId ? String(activeId) : 'none';
  const options = [{ value: 'none', label: t('proj.none') }, ...projects.slice(0, 30).map(p => ({ value: String(p.id), label: p.name }))];
  const current = projects.find(p => p.id === activeId);
  return (
    <BarMenu<string>
      value={value}
      onChange={v => onChange(v === 'none' ? null : Number(v))}
      label={t('proj.label')}
      align="left"
      icon={<Folder className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden="true" />}
      triggerText={current ? current.name : t('proj.pick')}
      options={options}
    />
  );
};
