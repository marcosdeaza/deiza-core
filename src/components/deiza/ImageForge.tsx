import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import RoseMark from './RoseMark';

/**
 * image forge v1 — the frame of an image that Deiza Image is still making.
 *
 * It has the exact shape of the image that is coming (the backend fixes the aspect ratio before
 * generating) and paints it the way a diffusion model works: Deiza's pigments bloom like ink in
 * water, a pencil sketch draws itself, and the grain clears as the picture "develops". When the
 * image arrives, ChatMessage reveals it in the same box.
 */

const RATIOS: Record<string, number> = {
  '1:1': 1, '2:3': 2 / 3, '3:2': 3 / 2, '3:4': 3 / 4, '4:3': 4 / 3, '4:5': 4 / 5,
  '5:4': 5 / 4, '9:16': 9 / 16, '16:9': 16 / 9, '21:9': 21 / 9,
};
export const aspectValue = (aspect?: string) => RATIOS[aspect || ''] || 1;

/** The box a generated image takes in the chat: shared by the forge and the final image. */
export const imageBoxStyle = (aspect?: string): CSSProperties => {
  const r = aspectValue(aspect);
  return { aspectRatio: String(r), width: `min(100%, 28rem, calc(60vh * ${r.toFixed(4)}))` };
};

/** Static pigment ground, behind the final image while it comes into focus. */
export const pigmentGround = (dark: boolean) => dark
  ? 'radial-gradient(60% 55% at 28% 30%, hsl(354 52% 40% / .9), transparent 70%), radial-gradient(55% 60% at 75% 70%, hsl(30 45% 52% / .55), transparent 72%), radial-gradient(50% 50% at 60% 25%, hsl(354 48% 62% / .45), transparent 70%), hsl(20 12% 9%)'
  : 'radial-gradient(60% 55% at 28% 30%, hsl(354 50% 40% / .55), transparent 70%), radial-gradient(55% 60% at 75% 70%, hsl(30 50% 60% / .55), transparent 72%), radial-gradient(50% 50% at 60% 25%, hsl(354 48% 62% / .35), transparent 70%), hsl(35 28% 92%)';

const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

interface ImageForgeProps {
  aspect?: string;
  /** Epoch seconds when the server started (keeps the progress when you come back to the chat) */
  started?: number;
  /** Current step from the server ("Haciendo un boceto…", "Generando imagen…") */
  label?: string;
  language?: string;
  className?: string;
}

// Small deterministic random so a frame keeps its strokes across re-renders.
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const ImageForge = ({ aspect = '1:1', started, label, language = 'es', className = '' }: ImageForgeProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<number>(started ? started * 1000 : Date.now());
  const [elapsed, setElapsed] = useState(0);
  const es = !language || language.startsWith('es');

  useEffect(() => { if (started) startRef.current = started * 1000; }, [started]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - startRef.current) / 1000))), 1000);
    setElapsed(Math.max(0, Math.round((Date.now() - startRef.current) / 1000)));
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rand = rng(Math.floor(startRef.current / 1000) % 100000 + 7);
    let W = 0, H = 0, dpr = 1;

    // Film grain, made once and slid around every frame.
    const grain = document.createElement('canvas');
    grain.width = grain.height = 160;
    const g = grain.getContext('2d')!;
    const gd = g.createImageData(160, 160);
    for (let i = 0; i < gd.data.length; i += 4) {
      const v = Math.random() * 255;
      gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v;
      gd.data[i + 3] = 255;
    }
    g.putImageData(gd, 0, 0);

    const dark = isDark();
    const palette = dark
      ? ['hsla(354,56%,46%,A)', 'hsla(354,48%,62%,A)', 'hsla(30,48%,58%,A)', 'hsla(30,32%,86%,A)', 'hsla(352,60%,30%,A)', 'hsla(18,40%,44%,A)', 'hsla(340,30%,52%,A)']
      : ['hsla(354,52%,40%,A)', 'hsla(354,46%,58%,A)', 'hsla(30,52%,60%,A)', 'hsla(28,40%,74%,A)', 'hsla(352,58%,30%,A)', 'hsla(18,44%,48%,A)', 'hsla(340,30%,60%,A)'];
    const blobs = palette.map((color, i) => ({
      color, r: 0.32 + rand() * 0.32, fx: 0.05 + rand() * 0.09, fy: 0.04 + rand() * 0.08,
      px: rand() * Math.PI * 2, py: rand() * Math.PI * 2, cx: 0.2 + rand() * 0.6, cy: 0.2 + rand() * 0.6, k: i,
    }));
    // A loose pencil sketch: a few long curves that draw themselves during the first seconds.
    const strokes = Array.from({ length: 6 }, () => {
      const p = [0, 1, 2, 3].map(() => [0.1 + rand() * 0.8, 0.1 + rand() * 0.8]);
      return { p, delay: rand() * 3.5, dur: 2.2 + rand() * 2.5, w: 0.8 + rand() * 1.3 };
    });
    const bez = (p: number[][], t: number) => {
      const u = 1 - t;
      return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W; canvas.height = H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(wrap);

    let raf = 0, last = 0;
    const draw = (now: number) => {
      const t = (Date.now() - startRef.current) / 1000;
      // Typical generation takes 15-30 s: the picture "develops" quickly at first, then slowly.
      const p = 1 - Math.exp(-Math.max(0, t) / 13);
      const m = Math.min(W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = dark ? 'hsl(20,12%,8%)' : 'hsl(35,28%,92%)';
      ctx.fillRect(0, 0, W, H);

      // Pigments: soft fields that drift on slow, never-repeating paths and grow denser.
      ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
      for (const b of blobs) {
        const x = (b.cx + 0.28 * Math.sin(t * b.fx * 2 + b.px) + 0.12 * Math.sin(t * b.fy * 3.1 + b.k)) * W;
        const y = (b.cy + 0.26 * Math.cos(t * b.fy * 2 + b.py) + 0.1 * Math.sin(t * b.fx * 2.7 + b.k * 1.7)) * H;
        const r = (b.r * (0.75 + 0.35 * p) + 0.05 * Math.sin(t * 0.6 + b.k)) * Math.max(W, H);
        const a = (dark ? 0.26 : 0.22) + 0.42 * p;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, b.color.replace('A', a.toFixed(3)));
        grad.addColorStop(0.55, b.color.replace('A', (a * 0.45).toFixed(3)));
        grad.addColorStop(1, b.color.replace('A', '0'));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // The sketch: cream (or ink, on paper) lines drawn along their curve, fading as colour takes over.
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      for (const s of strokes) {
        const k = Math.min(1, Math.max(0, (t - s.delay) / s.dur));
        if (k <= 0) continue;
        const fade = 0.55 * (1 - 0.7 * p);
        ctx.strokeStyle = dark ? `rgba(251,243,234,${fade.toFixed(3)})` : `rgba(80,30,36,${(fade * 0.8).toFixed(3)})`;
        ctx.lineWidth = s.w * dpr;
        ctx.beginPath();
        const steps = 48;
        for (let i = 0; i <= steps * k; i++) {
          const [px, py] = bez(s.p, i / steps);
          if (i === 0) ctx.moveTo(px * W, py * H); else ctx.lineTo(px * W, py * H);
        }
        ctx.stroke();
      }

      // A band of light sweeping down, like a denoising pass over the canvas.
      const sweep = ((t * 0.18) % 1.4) - 0.2;
      const band = ctx.createLinearGradient(0, (sweep - 0.18) * H, 0, (sweep + 0.18) * H);
      band.addColorStop(0, 'rgba(255,240,228,0)');
      band.addColorStop(0.5, `rgba(255,240,228,${(dark ? 0.1 : 0.16).toFixed(3)})`);
      band.addColorStop(1, 'rgba(255,240,228,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, W, H);

      // Grain that clears as the image develops.
      ctx.globalCompositeOperation = dark ? 'overlay' : 'soft-light';
      ctx.globalAlpha = 0.55 * (1 - 0.65 * p);
      const pat = ctx.createPattern(grain, 'repeat');
      if (pat) {
        const ox = Math.floor(Math.random() * 160), oy = Math.floor(Math.random() * 160);
        ctx.translate(-ox, -oy);
        ctx.fillStyle = pat;
        ctx.fillRect(ox, oy, W, H);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // Vignette.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H / 2, m * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, dark ? 'rgba(0,0,0,0.42)' : 'rgba(60,30,30,0.16)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      last = now;
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 33) return;   // ~30 fps is plenty for pigment
      draw(now);
    };
    draw(performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  const step = label || (es ? 'Creando tu imagen…' : 'Creating your image…');
  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-2xl deiza-border deiza-shadow-lg select-none ${className}`}
      style={imageBoxStyle(aspect)}
      role="img"
      aria-label={es ? `Generando una imagen ${aspect}` : `Generating a ${aspect} image`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden="true">
        <RoseMark size={56} mode="bloom" className="opacity-40 mix-blend-soft-light text-[hsl(30_30%_96%)]" />
      </div>
      <span className="absolute top-3 right-3 font-body text-[10px] tracking-[0.18em] tabular-nums text-[hsl(30_30%_96%/.72)] mix-blend-difference" aria-hidden="true">
        {aspect}
      </span>
      <div className="absolute left-3 right-3 bottom-3 flex items-center gap-2" aria-live="polite">
        <span className="inline-flex items-center gap-2 max-w-full min-w-0 pl-2.5 pr-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md text-white/90 font-body text-[11.5px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(354_60%_66%)] animate-pulse shrink-0" />
          <span className="truncate">{step}</span>
        </span>
        <span className="ml-auto shrink-0 px-2 py-1 rounded-full bg-black/35 backdrop-blur-md text-white/75 font-body text-[10.5px] tabular-nums">
          {elapsed}s
        </span>
      </div>
    </div>
  );
};

export default ImageForge;
