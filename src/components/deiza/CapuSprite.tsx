import { useEffect, useRef } from 'react';
import Capu from '@/lib/capu';

interface CapuSpriteProps {
  /** Scene to loop (idle, typing, coffee, can, duck, reading, waiting, focus, fine, bloom, wilt, sleep…). */
  scene?: string;
  /** Scenes to rotate through, one after the other. */
  cycle?: string[];
  /** CSS pixels per sprite pixel. Capu's body is 16 sprite pixels wide. */
  px?: number;
  /** Keep Capu centred in the box (true) or anchored left with room for props on the right. */
  centered?: boolean;
  className?: string;
  label?: string;
}

/**
 * Capu, the Deiza Code mascot, animated in place. Pixel art rendered as crisp SVG rects by the
 * same engine the desktop app uses (src/lib/capu.js). Respects prefers-reduced-motion.
 */
export default function CapuSprite({ scene = 'idle', cycle, px = 4, centered = true, className, label = 'Capu' }: CapuSpriteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const key = cycle && cycle.length ? cycle.join(',') : scene;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names: string[] = cycle && cycle.length ? cycle : [scene];
    const crop = centered ? Capu.centeredBox(names, 1) : Capu.sceneBox(names, 1);
    const player = new Capu.Player(el, { px, crop, scene: names[0] });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    if (names.length > 1) {
      const hold = (s: string) => (Capu.SCENES[s]?.loop ? Math.max(4200, Capu.sceneDuration(s)) : Capu.sceneDuration(s) + 500);
      const next = () => {
        i = (i + 1) % names.length;
        player.play(names[i]);
        timer = setTimeout(next, hold(names[i]));
      };
      timer = setTimeout(next, hold(names[0]));
    }
    return () => { if (timer) clearTimeout(timer); player.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, px, centered]);

  return <div ref={ref} role="img" aria-label={label} className={className} style={{ lineHeight: 0 }} />;
}
