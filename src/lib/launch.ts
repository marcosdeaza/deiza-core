import { useEffect, useState } from 'react';

/**
 * Launch window for Liquid 5. After this date the one-time announcement stops
 * showing to new accounts and the "Nuevo" badge disappears from the model list.
 * Everything else (news page, docs) stays.
 */
export const LIQUID5_LAUNCH_UNTIL = '2026-09-25T23:59:59';

export const liquid5LaunchActive = (): boolean => Date.now() < new Date(LIQUID5_LAUNCH_UNTIL).getTime();

/**
 * Launch window for Solid 5: one-time announcement for accounts opening the workspace
 * and the "Nuevo" badge in the model list.
 */
export const SOLID5_LAUNCH_UNTIL = '2026-10-26T23:59:59';

export const solid5LaunchActive = (): boolean => Date.now() < new Date(SOLID5_LAUNCH_UNTIL).getTime();

/** Launch window for Deiza for desktop: one-time announcement and the sidebar card. */
export const DESKTOP_LAUNCH_UNTIL = '2026-11-15T23:59:59';

export const desktopLaunchActive = (): boolean => Date.now() < new Date(DESKTOP_LAUNCH_UNTIL).getTime();

/** Midnight in Madrid, explicitly offset so every locale launches together. */
export const LIQUID55_AT = '2026-10-12T00:00:00+02:00';
export const LIQUID55_LAUNCH_UNTIL = '2026-10-31T23:59:59+01:00';
export const liquid55Live = (now = Date.now()): boolean => now >= Date.parse(LIQUID55_AT);
export const liquid55LaunchActive = (): boolean => Date.now() <= Date.parse(LIQUID55_LAUNCH_UNTIL);
export const liquidName = (): string => liquid55Live() ? 'Liquid 5.5' : 'Liquid 5.1';

/** Refresh mounted pages at the boundary and after a suspended browser resumes. */
export function useLiquid55Live(): boolean {
  const [live, setLive] = useState(liquid55Live);
  useEffect(() => {
    const refresh = () => setLive(liquid55Live());
    const remaining = Date.parse(LIQUID55_AT) - Date.now();
    const timer = remaining > 0 && remaining <= 2147483647 ? window.setTimeout(refresh, remaining + 10) : undefined;
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return live;
}
