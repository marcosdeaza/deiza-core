import { useEffect, useState } from 'react';

interface KeyboardState {
  keyboardHeight: number;
  isKeyboardVisible: boolean;
}

let Keyboard: any = null;

async function loadKeyboard() {
  if (Keyboard) return;
  try {
    // The Keyboard plugin only exists inside the native shell — on the web it
    // throws UNIMPLEMENTED on every listener, so don't even load it there.
    const native = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!native) return;
    const mod = await import('@capacitor/keyboard');
    Keyboard = mod.Keyboard;
  } catch {
    // Running in browser
  }
}

export function useKeyboardAvoid(): KeyboardState {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    let showListener: any = null;
    let hideListener: any = null;

    const setup = async () => {
      await loadKeyboard();
      if (!Keyboard) return;

      try {
        showListener = await Keyboard.addListener('keyboardWillShow', (info: { keyboardHeight: number }) => {
          setKeyboardHeight(info.keyboardHeight);
          setIsKeyboardVisible(true);
        });

        hideListener = await Keyboard.addListener('keyboardWillHide', () => {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
        });
      } catch {
        Keyboard = null; // fall back to the visualViewport path below
      }
    };

    setup();

    // ── Mobile WEB fallback via visualViewport (no Capacitor) ──
    // When the on-screen keyboard opens, visualViewport shrinks; the gap between
    // it and the layout viewport is the keyboard height. Lets the input rise on
    // mobile browsers too, not just the native iOS app.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const onViewport = () => {
      if (Keyboard) return; // native path already handles it
      if (!vv) return;
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const h = gap > 120 ? gap : 0; // ignore tiny browser-chrome shifts
      setKeyboardHeight(h);
      setIsKeyboardVisible(h > 0);
    };
    if (vv && isCoarse) {
      vv.addEventListener('resize', onViewport);
      vv.addEventListener('scroll', onViewport);
    }

    return () => {
      showListener?.remove();
      hideListener?.remove();
      if (vv && isCoarse) {
        vv.removeEventListener('resize', onViewport);
        vv.removeEventListener('scroll', onViewport);
      }
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}
