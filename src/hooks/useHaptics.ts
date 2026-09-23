import { useCallback } from 'react';
import { haptic, type HapticKind } from '@/lib/native';

export type HapticStyle = HapticKind;

/**
 * Haptic feedback for interactions. On iOS/Android this drives the Taptic engine
 * through Capacitor; on the web it falls back to the Vibration API when present
 * and is otherwise a no-op. Never awaits, never throws.
 */
export function useHaptics() {
  const trigger = useCallback((style: HapticStyle = 'light') => { haptic(style); }, []);
  return { trigger };
}

export default useHaptics;
