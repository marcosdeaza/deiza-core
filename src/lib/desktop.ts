/**
 * Deiza for desktop: the app exposes `window.deizaDesktop` to deiza.org (see the desktop repo,
 * src/preload/chat.js). The web uses it to hide download promos inside the app and to switch
 * the app to Code mode; the download page uses the release manifest below.
 */
export interface DeizaDesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  openCode: () => void;
  notify?: (title: string, body: string) => void;
  checkUpdate?: () => Promise<{available: boolean; version: string; notes?: string}>;
  installUpdate?: () => void;
  /** App updates (desktop 1.1.5+): the same state the app shows in its titlebar and Code sidebar. */
  update?: {
    state: () => Promise<DesktopUpdateState | null>;
    start: () => void;
    restart: () => void;
    openPage: () => void;
    onChange: (cb: (s: DesktopUpdateState) => void) => () => void;
  };
}

export interface DesktopUpdateState {
  state: 'idle' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
  version?: string;
  pct?: number;
  method?: string;
  notes?: string;
  error?: string;
}

export const desktopBridge = (): DeizaDesktopBridge | null => {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as { deizaDesktop?: DeizaDesktopBridge }).deizaDesktop;
  return b && b.isDesktop ? b : null;
};

export const isDesktopApp = (): boolean => desktopBridge() !== null;

export type DesktopOS = 'mac' | 'windows' | 'chromeos' | 'linux' | 'mobile' | 'other';

export function detectDesktopOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const platform = ((navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '').toLowerCase();
  // Chromebooks: "X11; CrOS x86_64 …" in the user agent (frozen to x86_64 even on ARM models)
  // and "Chrome OS" in userAgentData. Checked before Linux, which the same string also matches.
  if (/\bCrOS\b/.test(ua) || platform.includes('chrome os') || platform.includes('chromeos')) return 'chromeos';
  if (/iphone|ipad|ipod|android/i.test(ua)) return 'mobile';
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if ((platform.includes('mac') || /macintosh/i.test(ua)) && navigator.maxTouchPoints > 1) return 'mobile';
  if (platform.includes('mac') || /macintosh|mac os x/i.test(ua)) return 'mac';
  if (platform.includes('win') || /windows/i.test(ua)) return 'windows';
  if (platform.includes('linux') || /linux|x11/i.test(ua)) return 'linux';
  return 'other';
}

/** ARM or Intel/AMD, when the browser can tell (Chromium can; Safari usually cannot). */
export async function detectCpuArch(): Promise<'arm64' | 'x64' | 'unknown'> {
  try {
    const uad = (navigator as unknown as { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } }).userAgentData;
    if (uad?.getHighEntropyValues) {
      const v = await uad.getHighEntropyValues(['architecture']);
      if (v.architecture === 'arm') return 'arm64';
      if (v.architecture === 'x86') return 'x64';
    }
  } catch { /* not exposed */ }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/apple (m\d|gpu)|mali|adreno|powervr|mediatek|qualcomm/i.test(renderer)) return 'arm64';
    if (/intel|amd|radeon/i.test(renderer)) return 'x64';
  } catch { /* no WebGL */ }
  return 'unknown';
}

export const detectMacArch = detectCpuArch;

/** Keys of latest.json "files": .deb for Debian/Ubuntu and Chromebooks, AppImage for other Linux. */
export type DesktopFileKey = 'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-deb' | 'linux-deb-arm64' | 'linux-x64' | 'linux-arm64';

export interface DesktopRelease {
  version: string;
  date?: string;
  notes?: string;
  files: Record<'mac-arm64' | 'mac-x64' | 'win-x64', string> & Partial<Record<DesktopFileKey, string>>;
  sizes?: Partial<Record<DesktopFileKey, number>>;
}

export const DESKTOP_BASE = '/downloads/desktop/';

// Only used if latest.json can't be read. Keep it on the release that is on the server (older
// installers are removed), or the download buttons point at missing files.
export const FALLBACK_RELEASE: DesktopRelease = {
  version: '1.1.16',
  files: {
    'mac-arm64': 'Deiza-1.1.16-mac-arm64.dmg',
    'mac-x64': 'Deiza-1.1.16-mac-x64.dmg',
    'win-x64': 'Deiza-1.1.16-win-x64.exe',
    'linux-deb': 'Deiza-1.1.16-linux-amd64.deb',
    'linux-deb-arm64': 'Deiza-1.1.16-linux-arm64.deb',
    'linux-x64': 'Deiza-1.1.16-linux-x86_64.AppImage',
    'linux-arm64': 'Deiza-1.1.16-linux-arm64.AppImage',
  },
};

export async function fetchDesktopRelease(): Promise<DesktopRelease> {
  try {
    const res = await fetch(`${DESKTOP_BASE}latest.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (data && data.version && data.files) return data as DesktopRelease;
  } catch { /* manifest unavailable: fallback */ }
  return FALLBACK_RELEASE;
}

export const desktopFileUrl = (rel: DesktopRelease, key: DesktopFileKey) => (rel.files[key] ? `${DESKTOP_BASE}${rel.files[key]}` : '');

// install.sh detects macOS or Linux (Chromebooks included) by itself.
export const DESKTOP_INSTALL = {
  mac: 'curl -fsSL https://deiza.org/downloads/desktop/install.sh | bash',
  linux: 'curl -fsSL https://deiza.org/downloads/desktop/install.sh | bash',
  windows: 'irm https://deiza.org/downloads/desktop/install.ps1 | iex',
};

/**
 * Install deiza.org as an app from Chrome (Chromebooks without Linux, or anyone who only wants the
 * chat in its own window). Chrome fires `beforeinstallprompt` once per page load when the site can
 * be installed; this module loads with the app shell, so the event is kept for the button.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach(fn => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Desktop Chrome only shows its address-bar icon either way; deferring keeps the event usable
    // from the button. On phones the browser keeps its own banner.
    if (detectDesktopOS() !== 'mobile') e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; installedNow = true; notifyInstall(); });
}

export const webAppInstallable = () => installPrompt !== null;

/** Running as the installed app, or installed from this tab a moment ago. */
export const isInstalledWebApp = () =>
  installedNow || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);

export function onWebAppInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => { installListeners.delete(fn); };
}

export async function installWebApp(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = installPrompt;
  if (!ev) return 'unavailable';
  installPrompt = null;
  notifyInstall();
  try {
    await ev.prompt();
    return (await ev.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}
