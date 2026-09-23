import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { liquid5LaunchActive } from '@/lib/launch';
import { haptic } from '@/lib/native';

export type ModelKey = 'gas' | 'liquid' | 'solid' | 'vainilla' | 'fast' | 'pro' | 'ultra';

interface ModelSelectorProps {
  model: ModelKey;
  onModelChange: (model: ModelKey) => void;
  userPlan?: string;
  onUpgradeClick?: () => void;
  hideFast?: boolean;
}

type Family = 'gas' | 'liquid' | 'solid' | 'vainilla';

interface ModelMeta {
  key: ModelKey;
  family: Family;
  name: string;        // "Liquid"
  version: string;     // "5"
  /** i18n keys: model.<key>.tag / model.<key>.detail */
  plans: readonly string[];
  legacy?: boolean;
  isNew?: boolean;
}

/** Public model lineup — Gas 4.5 · Liquid 5 · Solid 4.6 (+ Liquid 4.5 under "more"). */
export const MODELS: ModelMeta[] = [
  {
    key: 'gas', family: 'gas', name: 'Gas', version: '4.5',
    plans: ['free', 'friend', 'signet'],
  },
  {
    key: 'liquid', family: 'liquid', name: 'Liquid', version: '5',
    plans: ['free', 'friend', 'signet'],
    isNew: true,
  },
  {
    key: 'solid', family: 'solid', name: 'Solid', version: '4.6',
    plans: ['friend', 'signet'],
  },
  {
    key: 'vainilla', family: 'vainilla', name: 'Vainilla', version: '1.0',
    plans: ['free', 'friend', 'signet'],
    legacy: true,
  },
];

const LEGACY_ALIASES: Record<string, ModelKey> = { fast: 'gas', pro: 'liquid', ultra: 'solid' };

export const resolveModel = (m: ModelKey): ModelMeta =>
  MODELS.find(x => x.key === (LEGACY_ALIASES[m] || m)) || MODELS[1];

const FAMILY_DOT: Record<Family, string> = {
  gas: 'bg-amber-400/90',
  liquid: 'bg-primary',
  solid: 'bg-violet-400/90',
  vainilla: 'bg-amber-200/90',
};

interface RowProps {
  m: ModelMeta;
  index: number;
  selected: boolean;
  hasAccess: boolean;
  t: (k: string) => string;
  onSelect: (m: ModelMeta) => void;
}

const ModelRow = ({ m, selected, hasAccess, t, onSelect }: RowProps) => (
  <button
    type="button"
    onClick={() => onSelect(m)}
    className={`group w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors focus-ring ${
      selected ? 'bg-primary/[0.08]' : 'hover:bg-muted/50'
    } ${!hasAccess ? 'opacity-70' : ''}`}
    role="option"
    aria-selected={selected}
  >
    <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" aria-hidden="true">
      <span className={`block w-1.5 h-1.5 rounded-full ${FAMILY_DOT[m.family]} ${selected ? '' : 'opacity-60'}`} />
    </span>
    <span className="flex-1 min-w-0">
      <span className="flex items-baseline gap-1.5">
        <span className={`font-body text-[13px] font-semibold ${selected ? 'text-foreground' : 'text-foreground/85'}`}>
          {m.name} <span className="font-medium text-foreground/60">{m.version}</span>
        </span>
        {m.isNew && liquid5LaunchActive() && (
          <span className="font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-primary/80 border border-primary/30 rounded-full px-1.5 py-[1px] leading-none">
            {t('model.new')}
          </span>
        )}
      </span>
      <span className="block font-body text-[11px] text-muted-foreground/75 leading-snug mt-0.5">
        {t(`model.${m.key}.tag`)}
      </span>
      <span className="hidden sm:block font-body text-[11px] text-muted-foreground/50 leading-snug mt-1 max-w-[260px]">
        {t(`model.${m.key}.detail`)}
      </span>
    </span>
    <span className="mt-1 shrink-0 w-4 flex justify-end">
      {!hasAccess ? (
        <Lock className="w-3.5 h-3.5 text-muted-foreground/45" aria-hidden="true" />
      ) : selected ? (
        <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} aria-hidden="true" />
      ) : null}
    </span>
  </button>
);

const ModelSelector = ({ model, onModelChange, userPlan = 'free', onUpgradeClick }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const justOpenedRef = useRef(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (justOpenedRef.current) {
        justOpenedRef.current = false;
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = resolveModel(model);
  useEffect(() => { if (current.legacy) setShowMore(true); }, [current.legacy]);

  const handleSelect = (m: ModelMeta) => {
    const hasAccess = m.plans.includes(userPlan);
    if (!hasAccess) {
      haptic('warning');
      onUpgradeClick?.();
      setOpen(false);
      return;
    }
    haptic('selection');
    onModelChange(m.key);
    setOpen(false);
  };

  const handleToggle = () => {
    haptic('light');
    if (!open) {
      justOpenedRef.current = true;
    }
    setOpen(v => !v);
  };

  const primary = MODELS.filter(m => !m.legacy);
  const more = MODELS.filter(m => m.legacy);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full hover:bg-muted/60 transition-colors focus-ring text-foreground/80 hover:text-foreground"
        aria-label={`${t('model.label')}: ${current.name} ${current.version}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${FAMILY_DOT[current.family]}`} aria-hidden="true" />
        <span className="font-body text-[12px] font-medium tracking-tight">
          {current.name} <span className="text-foreground/55">{current.version}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} aria-hidden="true" className="text-muted-foreground/60">
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            className="absolute bottom-full mb-2 left-0 z-50 w-[min(320px,calc(100vw-1.5rem))] bg-card border border-border/40 deiza-shadow-lg rounded-2xl p-1.5 origin-bottom-left"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: 0.08, ease: 'easeIn' } }}
          >
            <div className="px-3 pt-2 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
              {t('model.label')}
            </div>
            {primary.map((m, i) => (
              <ModelRow key={m.key} m={m} index={i} selected={m.key === current.key} hasAccess={m.plans.includes(userPlan)} t={t} onSelect={handleSelect} />
            ))}

            <button
              type="button"
              onClick={() => setShowMore(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 mt-0.5 rounded-xl text-[11px] font-body text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors focus-ring"
              aria-expanded={showMore}
            >
              <span>{t('model.more')}</span>
              <motion.span animate={{ rotate: showMore ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {showMore && (
                <motion.div
                  key="more"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border/25 mt-1 pt-1">
                    {more.map((m, i) => (
                      <ModelRow key={m.key} m={m} index={i} selected={m.key === current.key} hasAccess={m.plans.includes(userPlan)} t={t} onSelect={handleSelect} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModelSelector;
