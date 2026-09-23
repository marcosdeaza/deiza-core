import { useRef, useCallback } from 'react';

/**
 * Long-press gesture hook (mobile). Fires `onLongPress` after `ms` of sustained
 * touch without significant movement. Returns handlers to spread on the element.
 * Click/tap behaviour is preserved — only a real hold triggers the callback.
 */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startPos.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      try { navigator.vibrate?.(10); } catch { /* no-op */ }
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startPos.current.x);
    const dy = Math.abs(t.clientY - startPos.current.y);
    if (dx > 10 || dy > 10) clear(); // user is scrolling — cancel
  }, [clear]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    // If the long-press fired, swallow the synthetic click that follows
    if (firedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    clear();
  }, [clear]);

  // Suppress the native context menu on long-press (Android)
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) e.preventDefault();
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onContextMenu };
}

export default useLongPress;
