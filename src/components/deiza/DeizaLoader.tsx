import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import RoseMark from './RoseMark';
import { useLanguage } from '@/contexts/LanguageContext';

interface DeizaLoaderProps {
  fullScreen?: boolean;
  language?: string;
  model?: string;
  thinkingSteps?: string[];
}

/* ── Petal: a single rotating, fading petal shape ── */
const Petal = ({ index, total, color, size, duration, radius }: {
  index: number; total: number; color: string; size: number; duration: number; radius: number;
}) => {
  const angle = (index / total) * 360;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size * 1.6,
        background: color,
        borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
        transformOrigin: `50% ${radius + size * 0.8}px`,
        top: `calc(50% - ${radius + size * 0.8}px)`,
        left: `calc(50% - ${size / 2}px)`,
        filter: 'blur(0.5px)',
      }}
      animate={{
        rotate: [angle, angle + 360],
        opacity: [0.15, 0.5, 0.15],
        scale: [0.85, 1.1, 0.85],
      }}
      transition={{
        rotate: { duration, repeat: Infinity, ease: 'linear' },
        opacity: { duration: duration / 2, repeat: Infinity, ease: 'easeInOut' },
        scale: { duration: duration / 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.15 },
      }}
    />
  );
};

/* ── Ink ripple ring — expands and fades ── */
const InkRipple = ({ delay, size }: { delay: number; size: number }) => (
  <motion.span
    className="absolute rounded-full border"
    style={{
      width: size,
      height: size,
      top: `calc(50% - ${size / 2}px)`,
      left: `calc(50% - ${size / 2}px)`,
      borderColor: 'hsl(var(--primary) / 0.15)',
    }}
    animate={{
      scale: [0.6, 1.5],
      opacity: [0.4, 0],
    }}
    transition={{
      duration: 2.8,
      repeat: Infinity,
      delay,
      ease: 'easeOut',
    }}
  />
);

/* ── Breathing glow behind the logo ── */
const BreathingGlow = ({ tier }: { tier: 'fast' | 'pro' | 'ultra' }) => {
  const glowColor = tier === 'ultra'
    ? 'hsl(var(--primary) / 0.12)'
    : tier === 'pro'
    ? 'hsl(var(--primary) / 0.08)'
    : 'hsl(var(--primary) / 0.05)';
  const glowSize = tier === 'ultra' ? 100 : tier === 'pro' ? 80 : 56;

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: glowSize,
        height: glowSize,
        top: `calc(50% - ${glowSize / 2}px)`,
        left: `calc(50% - ${glowSize / 2}px)`,
        background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
      }}
      animate={{
        scale: [1, 1.4, 1],
        opacity: [0.7, 1, 0.7],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

/* ── Flowing line — the "ink stroke" under the loader ── */
const InkStroke = ({ tier }: { tier: 'fast' | 'pro' | 'ultra' }) => {
  const width = tier === 'ultra' ? 160 : tier === 'pro' ? 120 : 80;
  return (
    <div className="relative overflow-hidden" style={{ width, height: 2 }}>
      <motion.div
        className="absolute inset-y-0 rounded-full"
        style={{
          width: '40%',
          background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.4), transparent)',
        }}
        animate={{ left: ['-40%', '100%'] }}
        transition={{ duration: tier === 'ultra' ? 1.8 : tier === 'pro' ? 2.2 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'hsl(var(--primary) / 0.08)' }}
      />
    </div>
  );
};


/* ── Search step indicator — spinning globe pill shown DURING web search ── */
const SearchStepsRow = ({ steps }: { steps: string[] }) => {
  if (!steps || steps.length === 0) return null;
  const last = steps[steps.length - 1];
  const label = (() => { const c = last.indexOf(': '); return c >= 0 ? last.slice(c + 2) : last; })();
  return (
    <AnimatePresence>
      <motion.div
        className="flex items-center mt-2 min-w-0"
        initial={{ opacity: 0, scale: 0.9, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: -2 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full min-w-0"
          style={{
            background: 'hsl(var(--primary) / 0.06)',
            border: '1px solid hsl(var(--primary) / 0.15)',
          }}
        >
          {/* Deiza rose — blooms gently while searching / focusing / creating */}
          <span className="relative flex w-4 h-4 shrink-0 items-center justify-center" aria-hidden="true">
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ background: 'hsl(var(--primary) / 0.14)' }}
              animate={{ scale: [0.7, 1.5, 0.7], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <RoseMark size={14} mode="bloom" className="relative" />
          </span>
          <span
            className="font-body text-[10px] truncate max-w-[180px]"
            style={{ color: 'hsl(var(--muted-foreground) / 0.75)' }}
          >
            {label}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/* ── Vertical list of agentic steps — compresses older ones ── */
const ThinkingStepsList = ({ steps }: { steps: string[]; language?: string }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [steps.length]);
  if (!steps || steps.length === 0) return null;

  const clean = (s: string) => {
    const c = s.indexOf(': ');
    let out = (c >= 0 ? s.slice(c + 2) : s).replace(/[*_#`]/g, '').trim();
    if (out.length > 54) {
      const cut = out.slice(0, 50);
      const lastSpace = cut.lastIndexOf(' ');
      out = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + '…';
    }
    return out;
  };

  const MAX_VISIBLE = 4;
  const total = steps.length;
  const hidden = steps.slice(0, Math.max(0, total - MAX_VISIBLE));
  const visible = steps.slice(Math.max(0, total - MAX_VISIBLE));
  const isLast = (i: number) => i === visible.length - 1;
  const showExpand = hidden.length > 0 && !expanded;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {showExpand && (
        <motion.button
          className="flex items-center gap-1 px-2 py-0.5 rounded-full self-start font-body text-[10px] transition-colors hover:bg-primary/5"
          style={{
            background: 'hsl(var(--primary) / 0.04)',
            border: '1px solid hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--muted-foreground) / 0.6)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setExpanded(true)}
        >
          <ChevronDown className="w-3 h-3" />
          {hidden.length === 1 ? t('loader.prev.one') : t('loader.prev.many', { n: hidden.length })}
        </motion.button>
      )}
      {expanded && hidden.map((s, i) => (
        <div key={`h-${i}`} className="flex items-center gap-1.5 min-w-0 opacity-55">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/40" aria-hidden="true" />
          <span className="font-body text-[10px] text-muted-foreground/60 truncate">{clean(s)}</span>
        </div>
      ))}
      {expanded && (
        <motion.button
          className="flex items-center gap-1 px-2 py-0.5 rounded-full self-start font-body text-[10px] transition-colors hover:bg-primary/5"
          style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}
          onClick={() => setExpanded(false)}
        >
          <ChevronUp className="w-3 h-3" />
          {t('loader.less')}
        </motion.button>
      )}
      {visible.map((s, i) => {
        const active = isLast(i);
        return (
          <div key={`v-${i}`} className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex w-2 h-2 shrink-0 items-center justify-center" aria-hidden="true">
              {active && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'hsl(var(--primary) / 0.2)' }}
                  animate={{ scale: [0.5, 1.7, 0.5], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <span
                className="relative w-1.5 h-1.5 rounded-full"
                style={{ background: active ? 'hsl(var(--primary) / 0.85)' : 'hsl(var(--primary) / 0.32)' }}
              />
            </span>
            <span
              className={`font-body text-[10px] truncate leading-relaxed ${active ? 'text-foreground/85' : 'text-muted-foreground/55'}`}
            >
              {clean(s)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const DeizaLoader = ({ fullScreen = false, language, model = 'fast', thinkingSteps = [] }: DeizaLoaderProps) => {
  const { t } = useLanguage();
  void language;
  const [phraseIndex, setPhraseIndex] = useState(0);
  const tier = (model === 'ultra' || model === 'solid') ? 'ultra' : (model === 'pro' || model === 'liquid' || model === 'liquid45') ? 'pro' : 'fast';
  const phrases = useMemo(() => [1, 2, 3, 4, 5].map(i => t(`loader.${tier}.${i}`)), [t, tier]);

  const intervalMs = tier === 'ultra' ? 2400 : tier === 'pro' ? 2000 : 1800;

  useEffect(() => {
    setPhraseIndex(0);
    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % phrases.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [phrases.length, intervalMs]);

  // Live status label: when the model emits a real procedure/thought step
  // ("Generando imagen con DZ-Image...", a reasoning header…), show THAT instead of
  // the generic "Pensando..." filler. Kept SHORT and COMPLETE — never cut mid-word.
  const lastStep = thinkingSteps.length > 0 ? thinkingSteps[thinkingSteps.length - 1] : '';
  const cleanStep = (() => {
    if (!lastStep) return '';
    const c = lastStep.indexOf(': ');
    let s = (c >= 0 ? lastStep.slice(c + 2) : lastStep).replace(/[*_#`]/g, '').trim();
    if (!s) return '';
    // Prefer the first sentence/clause so the label reads complete and concise
    const stop = s.search(/[.!?·]\s|[.!?]$/);
    if (stop > 0 && stop <= 70) {
      s = s.slice(0, stop + 1).trim();
    } else if (s.length > 64) {
      // Otherwise cut at the last word boundary before 60 chars + ellipsis (never mid-word)
      const cut = s.slice(0, 60);
      const lastSpace = cut.lastIndexOf(' ');
      s = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim() + '…';
    }
    return s;
  })();
  const liveLabel = cleanStep || phrases[phraseIndex];
  const liveKey = cleanStep ? `step-${thinkingSteps.length}` : `phrase-${phraseIndex}`;

  // Petal configuration per tier
  const petals = useMemo(() => {
    if (tier === 'ultra') return { count: 6, radius: 26, size: 7, duration: 8, color: 'hsl(var(--primary) / 0.35)' };
    if (tier === 'pro') return { count: 5, radius: 22, size: 5, duration: 10, color: 'hsl(var(--primary) / 0.25)' };
    return { count: 0, radius: 0, size: 0, duration: 0, color: '' }; // fast: no petals
  }, [tier]);

  const tierLabel = tier === 'ultra' ? 'Solid' : tier === 'pro' ? 'Liquid' : '';

  /* ── FULL-SCREEN (page transitions, auth loading) ── */
  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[999] bg-background flex items-center justify-center"
        role="status"
        aria-label="Loading"
      >
        <div className="flex flex-col items-center gap-6 relative">
          <div className="relative" style={{ width: 100, height: 100 }}>
            <BreathingGlow tier="pro" />
            <InkRipple delay={0} size={90} />
            <InkRipple delay={1.4} size={90} />
            <span className="absolute inset-0 flex items-center justify-center z-10"><RoseMark size={92} mode="bloom" /></span>
          </div>
          <InkStroke tier="pro" />
          <AnimatePresence mode="wait">
            <motion.p
              key={phraseIndex}
              className="font-body text-sm text-muted-foreground text-center"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.3 }}
            >
              {phrases[phraseIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /* ── INLINE PRO / ULTRA — artistic rose bloom animation ── */
  if (tier === 'pro' || tier === 'ultra') {
    const containerSize = tier === 'ultra' ? 64 : 52;
    const logoSize = tier === 'ultra' ? 28 : 24;

    return (
      <div
        className="flex flex-col items-start py-5 gap-3.5"
        role="status"
        aria-live="polite"
        aria-label={`Deiza ${tier} is thinking`}
      >
        <div className="flex items-center gap-3">
          {/* Rose bloom container */}
          <div className="relative flex-shrink-0" style={{ width: containerSize, height: containerSize }}>
            <BreathingGlow tier={tier} />

            {/* Ink ripple rings */}
            <InkRipple delay={0} size={containerSize - 4} />
            {tier === 'ultra' && <InkRipple delay={1} size={containerSize - 4} />}

            {/* Rotating petals */}
            {petals.count > 0 && Array.from({ length: petals.count }).map((_, i) => (
              <Petal
                key={i}
                index={i}
                total={petals.count}
                color={petals.color}
                size={petals.size}
                duration={petals.duration}
                radius={petals.radius}
              />
            ))}

            {/* Logo at center */}
            <span
              className="absolute z-10 flex items-center justify-center"
              style={{ width: logoSize, height: logoSize, top: `calc(50% - ${logoSize / 2}px)`, left: `calc(50% - ${logoSize / 2}px)` }}
            >
              <RoseMark size={logoSize} mode="bloom" />
            </span>
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            {/* Tier label */}
            <div className="flex items-center gap-1.5">
              <span className="font-body text-[10px] font-semibold text-primary/70 tracking-widest uppercase">
                {tierLabel}
              </span>
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-primary/50"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                aria-hidden="true"
              />
            </div>

            {/* Live status line — real procedure/thought when available, else rotating phrase */}
            {thinkingSteps.length > 0 ? (
              <ThinkingStepsList steps={thinkingSteps} language={language} />
            ) : (
              <AnimatePresence mode="wait">
                <motion.p
                  key={liveKey}
                  className="font-body text-xs text-muted-foreground/75 tracking-wide leading-relaxed max-w-[clamp(220px,70vw,460px)]"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                >
                  {liveLabel}
                </motion.p>
              </AnimatePresence>
            )}

            {/* Ink stroke progress */}
            <InkStroke tier={tier} />
          </div>
        </div>
      </div>
    );
  }

  /* ── INLINE FAST — minimal, elegant pulse ── */
  return (
    <div
      className="flex flex-col items-start py-5 gap-2.5"
      role="status"
      aria-live="polite"
      aria-label="Deiza is thinking"
    >
      <div className="flex items-center gap-3">
        {/* Simple breathing logo */}
        <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          <BreathingGlow tier="fast" />
          <span className="absolute inset-0 flex items-center justify-center z-10"><RoseMark size={22} mode="bloom" /></span>
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          {/* Live status line — real procedure/thought when available, else rotating phrase */}
          {thinkingSteps.length > 0 ? (
            <ThinkingStepsList steps={thinkingSteps} language={language} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.p
                key={liveKey}
                className="font-body text-xs text-muted-foreground/70 tracking-wide leading-relaxed max-w-[clamp(220px,70vw,460px)]"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {liveLabel}
              </motion.p>
            </AnimatePresence>
          )}

          {/* Ink stroke */}
          <InkStroke tier="fast" />
        </div>
      </div>
    </div>
  );
};

export default DeizaLoader;
