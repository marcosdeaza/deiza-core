import { useId } from 'react';
import { ROSE_D, SPIRAL_D } from '@/lib/roseGeometry';

interface RoseMarkProps {
  size?: number;
  /**
   * draw   the rose draws itself once, from the centre outwards (then stays)
   * bloom  draws in and out in a loop — "Deiza is working"
   * still  static mark
   */
  mode?: 'draw' | 'bloom' | 'still';
  /** Slow breathing after the draw (hero marks, page loader) */
  breathe?: boolean;
  className?: string;
  /** Accessible name; omit for decorative use */
  label?: string;
}

/**
 * The Deiza rose as an animated SVG. Colour comes from `currentColor`
 * (defaults to the brand burgundy through the .rose-mark class).
 */
const RoseMark = ({ size = 48, mode = 'draw', breathe = false, className = '', label }: RoseMarkProps) => {
  const id = `rm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <span
      className={`rose-mark rose-${mode}${breathe ? ' rose-breathe' : ''} ${className}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} focusable="false">
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
            <path className="rose-reveal" d={SPIRAL_D} pathLength={1} fill="none" stroke="#fff" strokeWidth={15.5} strokeLinecap="round" />
          </mask>
        </defs>
        <path d={ROSE_D} fill="currentColor" fillRule="evenodd" mask={mode === 'still' ? undefined : `url(#${id})`} />
      </svg>
    </span>
  );
};

export default RoseMark;
