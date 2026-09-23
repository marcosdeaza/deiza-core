import { useEffect, useRef, type MutableRefObject } from 'react';

interface VoiceWaveProps {
  /** Live mic level 0..1 written by AudioRecorder (no React re-renders) */
  levelRef: MutableRefObject<number>;
  bars?: number;
  /** When false the bars settle into a calm idle shimmer (transcribing state) */
  active?: boolean;
  className?: string;
}

/**
 * Scrolling waveform for the voice input row — new samples enter from the right,
 * like a voice memo. Pure DOM transforms in a rAF loop, zero React state churn.
 */
const VoiceWave = ({ levelRef, bars = 36, active = true, className = '' }: VoiceWaveProps) => {
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const historyRef = useRef<number[]>(new Array(bars).fill(0.08));

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let smooth = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 45) return; // ~22 samples / s
      last = now;
      const target = active ? Math.max(0.08, Math.min(1, levelRef.current)) : 0.12 + 0.05 * Math.sin(now / 260);
      smooth += (target - smooth) * 0.55;
      const h = historyRef.current;
      h.push(smooth);
      if (h.length > bars) h.shift();
      for (let i = 0; i < bars; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const v = h[i] ?? 0.08;
        el.style.transform = `scaleY(${Math.max(0.12, v)})`;
        el.style.opacity = String(0.35 + v * 0.65);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, bars, levelRef]);

  return (
    <div className={`flex items-center justify-between gap-[3px] h-9 w-full ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={el => { if (el) barsRef.current[i] = el; }}
          className="block flex-1 h-full rounded-full bg-primary origin-center will-change-transform"
          style={{ transform: 'scaleY(0.12)', opacity: 0.35, transition: 'transform 60ms linear, opacity 120ms linear' }}
        />
      ))}
    </div>
  );
};

export default VoiceWave;
