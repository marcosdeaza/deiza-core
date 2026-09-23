import { useId } from 'react';

/**
 * Hand-drawn ("drawy") SVG illustrations — single-weight ink strokes with a
 * subtle wobble filter and a draw-on animation. Colours come from the theme
 * (currentColor + --primary) so they sit naturally in light and dark.
 */

type SketchProps = { className?: string; delay?: number };

const Wobble = ({ id }: { id: string }) => (
  <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
);

const base = 'sketch-svg';
const strokeProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** A drop of ink meeting water — Liquid */
export const SketchDrop = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M80 14 C80 14 62 40 62 52 a18 18 0 0 0 36 0 C98 40 80 14 80 14 Z" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.35s)` }} d="M28 92 q26 -10 52 0 t52 0" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.6s)` }} d="M40 102 q20 -7 40 0 t40 0" opacity="0.55" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.8s)` }} d="M60 84 q10 -4 20 0 t20 0" opacity="0.7" />
        <circle className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.9s)` }} cx="72" cy="46" r="2.2" fill="hsl(var(--primary))" stroke="none" />
      </g>
    </svg>
  );
};

/** A small rose — Deiza's mark */
export const SketchRose = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M80 58 c-6 -14 8 -22 14 -12 c10 -8 22 4 12 16 c10 4 6 20 -8 18 c-2 14 -22 14 -24 0 c-14 2 -18 -14 -6 -18 c-8 -6 -2 -18 12 -4 Z" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.5s)` }} d="M80 70 c4 -8 12 -10 18 -8" opacity="0.7" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.7s)` }} d="M84 92 q2 -12 -4 -22" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.9s)` }} d="M82 84 c-10 -2 -18 4 -22 12 c10 2 18 -2 22 -12 Z" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 1.05s)` }} d="M86 88 c10 -4 20 0 24 8 c-10 4 -20 0 -24 -8 Z" />
      </g>
    </svg>
  );
};

/** Three stacked layers — the multilayer architecture (Gas · Liquid · Solid) */
export const SketchLayers = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M80 26 l44 18 l-44 18 l-44 -18 Z" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.3s)` }} d="M36 60 l44 18 l44 -18" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.55s)` }} d="M36 76 l44 18 l44 -18" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.8s)` }} d="M80 34 l22 9 l-22 9 l-22 -9 Z" opacity="0.5" />
      </g>
    </svg>
  );
};

/** Angle brackets with a cursor — code */
export const SketchCode = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M56 36 l-24 24 l24 24" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.25s)` }} d="M104 36 l24 24 l-24 24" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.5s)` }} d="M90 30 l-20 60" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.8s)` }} d="M48 100 h64" opacity="0.5" />
        <rect className="sketch-blink" x="112" y="94" width="6" height="12" fill="hsl(var(--primary))" stroke="none" />
      </g>
    </svg>
  );
};

/** A picture frame with a sun and hills — images */
export const SketchImage = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <rect className="sketch-path" x="34" y="28" width="92" height="66" rx="6" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.4s)` }} d="M40 86 l26 -26 l18 16 l14 -12 l22 22" />
        <circle className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.7s)` }} cx="104" cy="48" r="8" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.95s)` }} d="M60 106 h40" opacity="0.4" />
      </g>
    </svg>
  );
};

/** A magnifier over wavy lines — search / research */
export const SketchSearch = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M30 44 h60" opacity="0.5" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.15s)` }} d="M30 60 h44" opacity="0.5" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.3s)` }} d="M30 76 h52" opacity="0.5" />
        <circle className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.45s)` }} cx="104" cy="62" r="20" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.8s)` }} d="M118 76 l16 16" strokeWidth={2.4} />
      </g>
    </svg>
  );
};

/** An eye with rays — Omniscient */
export const SketchEye = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M32 60 q48 -40 96 0 q-48 40 -96 0 Z" />
        <circle className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.4s)` }} cx="80" cy="60" r="12" />
        <circle cx="80" cy="60" r="4" fill="hsl(var(--primary))" stroke="none" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.7s)` }} d="M80 26 v-10 M52 34 l-6 -8 M108 34 l6 -8" opacity="0.6" />
      </g>
    </svg>
  );
};

/** Two hands / a handshake-ish loop — collaboration */
export const SketchLink = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M66 46 a16 16 0 0 0 0 32 h14" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.3s)` }} d="M94 78 a16 16 0 0 0 0 -32 h-14" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.6s)` }} d="M68 62 h24" strokeWidth={2.2} />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.85s)` }} d="M40 96 q40 12 80 0" opacity="0.4" />
      </g>
    </svg>
  );
};

/** A chat bubble with a spark — the assistant */
export const SketchChat = ({ className = '', delay = 0 }: SketchProps) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={`${base} ${className}`} style={{ ['--sketch-delay' as any]: `${delay}s` }} aria-hidden="true">
      <defs><Wobble id={`w${id}`} /></defs>
      <g filter={`url(#w${id})`} {...strokeProps}>
        <path className="sketch-path" d="M40 34 h80 a8 8 0 0 1 8 8 v34 a8 8 0 0 1 -8 8 h-46 l-20 16 v-16 h-14 a8 8 0 0 1 -8 -8 v-34 a8 8 0 0 1 8 -8 Z" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.5s)` }} d="M54 52 h44 M54 66 h28" opacity="0.6" />
        <path className="sketch-path" style={{ animationDelay: `calc(var(--sketch-delay) + 0.8s)` }} d="M124 24 v12 M118 30 h12" stroke="hsl(var(--primary))" />
      </g>
    </svg>
  );
};
