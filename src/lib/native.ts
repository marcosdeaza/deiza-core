/**
 * Native bridge — everything that behaves differently inside the iOS/Android shell
 * (Capacitor) lives here so the rest of the app can stay platform-agnostic.
 *
 * Every helper degrades gracefully on the web: haptics fall back to the Vibration
 * API where it exists, file saving falls back to a normal download, external links
 * open in a new tab.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export const isIOS = (): boolean => {
  try { return Capacitor.getPlatform() === 'ios'; } catch { return false; }
};

/* ── Haptics ──────────────────────────────────────────────────────────────── */
export type HapticKind = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' | 'selection' | 'success' | 'warning' | 'error';

let hapticsMod: typeof import('@capacitor/haptics') | null = null;
let hapticsLoading: Promise<void> | null = null;

async function loadHaptics() {
  if (hapticsMod || !isNative()) return;
  if (!hapticsLoading) {
    hapticsLoading = import('@capacitor/haptics').then(m => { hapticsMod = m; }).catch(() => { hapticsMod = null; });
  }
  await hapticsLoading;
}

// Warm the plugin up once so the very first tap already vibrates
if (isNative()) void loadHaptics();

const WEB_VIBRATE: Record<HapticKind, number | number[]> = {
  light: 8, medium: 14, heavy: 22, soft: 6, rigid: 12,
  selection: 5, success: [10, 40, 12], warning: [14, 40, 14], error: [18, 40, 18, 40, 18],
};

let lastSelectionTs = 0;

/** Fire a haptic. Safe to call anywhere; never throws, never blocks. */
export function haptic(kind: HapticKind = 'light'): void {
  if (!isNative()) {
    try { navigator.vibrate?.(WEB_VIBRATE[kind]); } catch { /* unsupported */ }
    return;
  }
  // Selection ticks can fire dozens of times a second while scrolling a picker;
  // throttle so the Taptic engine is not saturated.
  if (kind === 'selection') {
    const now = performance.now();
    if (now - lastSelectionTs < 35) return;
    lastSelectionTs = now;
  }
  void (async () => {
    await loadHaptics();
    const H = hapticsMod;
    if (!H) return;
    try {
      switch (kind) {
        case 'selection': await H.Haptics.selectionChanged(); break;
        case 'success': await H.Haptics.notification({ type: H.NotificationType.Success }); break;
        case 'warning': await H.Haptics.notification({ type: H.NotificationType.Warning }); break;
        case 'error': await H.Haptics.notification({ type: H.NotificationType.Error }); break;
        case 'medium': await H.Haptics.impact({ style: H.ImpactStyle.Medium }); break;
        case 'heavy': await H.Haptics.impact({ style: H.ImpactStyle.Heavy }); break;
        case 'soft': await H.Haptics.impact({ style: H.ImpactStyle.Light }); break;
        case 'rigid': await H.Haptics.impact({ style: H.ImpactStyle.Medium }); break;
        default: await H.Haptics.impact({ style: H.ImpactStyle.Light });
      }
    } catch { /* engine busy or unavailable */ }
  })();
}

/* ── Files: save / share ──────────────────────────────────────────────────── */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Hand a file to the user. On the web this is a normal download; inside the app
 * the file is written to the app cache and the iOS share sheet opens (Save to
 * Files, AirDrop, Mail, WhatsApp...), which is how native apps "download".
 */
export async function saveOrShareFile(blob: Blob, filename: string, title?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (!isNative()) {
    webDownload(blob, filename);
    return 'downloaded';
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const safe = filename.replace(/[^\w.\-() ]+/g, '_').slice(-120) || 'archivo';
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: `deiza/${safe}`, data, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: title || safe, url: written.uri, dialogTitle: title || safe });
      return 'shared';
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
      throw e;
    }
  } catch {
    // Last resort: let WebKit try a plain download
    webDownload(blob, filename);
    return 'downloaded';
  }
}

/** Fetch a URL (same-origin or absolute) and save/share it as a file. */
export async function saveOrShareUrl(url: string, filename: string, title?: string) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return saveOrShareFile(await res.blob(), filename, title);
}

/** Share plain text or a link through the native share sheet (clipboard on the web). */
export async function shareText(text: string, url?: string, title?: string): Promise<boolean> {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch { return false; }
  }
  try {
    if ((navigator as any).share && (url || text)) {
      await (navigator as any).share({ title, text, url });
      return true;
    }
  } catch { /* user cancelled or unsupported */ }
  try { await navigator.clipboard.writeText(url || text); return true; } catch { return false; }
}

/* ── External links ───────────────────────────────────────────────────────── */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, presentationStyle: 'popover' });
      return;
    } catch { /* fall through */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Inside the app every <a target="_blank"> would leave to Safari. Intercept the
 * click and open an in-app browser sheet instead (SFSafariViewController), like
 * native apps do.
 */
export function installExternalLinkHandler(): () => void {
  if (!isNative()) return () => {};
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    try {
      const u = new URL(href);
      if (u.hostname === location.hostname) return; // internal absolute link
    } catch { return; }
    if (a.hasAttribute('download')) return;
    e.preventDefault();
    void openExternal(href);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

/* ── App shell setup (status bar, keyboard, lifecycle) ───────────────────── */
export async function setupNativeShell(): Promise<void> {
  if (!isNative()) return;
  document.documentElement.classList.add('native', isIOS() ? 'ios' : 'android');
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (!isIOS()) await StatusBar.setBackgroundColor({ color: '#1c1714' });
  } catch { /* plugin missing */ }
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
    // Keep the layout in sync with the keyboard on the CSS side too
    Keyboard.addListener('keyboardWillShow', info => {
      document.documentElement.style.setProperty('--kb', `${info.keyboardHeight}px`);
      document.documentElement.classList.add('kb-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--kb', '0px');
      document.documentElement.classList.remove('kb-open');
    });
  } catch { /* plugin missing */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // The web view is painted by now; fade the splash out ourselves for a seamless hand-off
    await SplashScreen.hide({ fadeOutDuration: 220 });
  } catch { /* plugin missing */ }
}

/** Subscribe to app resume (foreground) — returns an unsubscribe. */
export function onAppResume(cb: () => void): () => void {
  if (!isNative()) {
    const h = () => { if (document.visibilityState === 'visible') cb(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }
  let remove: (() => void) | null = null;
  void import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', s => { if (s.isActive) cb(); }).then(l => { remove = () => l.remove(); });
  }).catch(() => {});
  return () => { remove?.(); };
}

/** Deep links (deiza.org/c/xxx, /s/xxx, /redeem/CODE) opened from outside the app. */
export function onAppUrlOpen(cb: (path: string) => void): () => void {
  if (!isNative()) return () => {};
  let remove: (() => void) | null = null;
  void import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', ev => {
      try {
        const u = new URL(ev.url);
        cb(u.pathname + u.search);
      } catch { /* ignore */ }
    }).then(l => { remove = () => l.remove(); });
  }).catch(() => {});
  return () => { remove?.(); };
}

/** Hardware back button (Android) → history back, or minimise on the root. */
export function installBackButton(): () => void {
  if (!isNative() || isIOS()) return () => {};
  let remove: (() => void) | null = null;
  void import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back(); else App.minimizeApp();
    }).then(l => { remove = () => l.remove(); });
  }).catch(() => {});
  return () => { remove?.(); };
}
