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
