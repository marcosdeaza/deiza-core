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

export type DesktopOS = 'mac' | 'windows' | 'linux' | 'mobile' | 'other';

export function detectDesktopOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const platform = ((navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (/iphone|ipad|ipod|android/i.test(ua)) return 'mobile';
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if ((platform.includes('mac') || /macintosh/i.test(ua)) && navigator.maxTouchPoints > 1) return 'mobile';
  if (platform.includes('mac') || /macintosh|mac os x/i.test(ua)) return 'mac';
  if (platform.includes('win') || /windows/i.test(ua)) return 'windows';
  if (platform.includes('linux') || /linux|x11/i.test(ua)) return 'linux';
  return 'other';
}

/** Apple Silicon or Intel, when the browser can tell (Chromium can; Safari usually cannot). */
export async function detectMacArch(): Promise<'arm64' | 'x64' | 'unknown'> {
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
    if (/apple (m\d|gpu)/i.test(renderer)) return 'arm64';
    if (/intel|amd|radeon/i.test(renderer)) return 'x64';
  } catch { /* no WebGL */ }
  return 'unknown';
}

export interface DesktopRelease {
  version: string;
  date?: string;
  notes?: string;
  files: Record<'mac-arm64' | 'mac-x64' | 'win-x64', string>;
  sizes?: Partial<Record<'mac-arm64' | 'mac-x64' | 'win-x64', number>>;
}

export const DESKTOP_BASE = '/downloads/desktop/';

// Only used if latest.json can't be read. Keep it on the release that is on the server (older
// installers are removed), or the download buttons point at missing files.
export const FALLBACK_RELEASE: DesktopRelease = {
  version: '1.1.6',
  files: {
    'mac-arm64': 'Deiza-1.1.6-mac-arm64.dmg',
    'mac-x64': 'Deiza-1.1.6-mac-x64.dmg',
    'win-x64': 'Deiza-1.1.6-win-x64.exe',
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

export const desktopFileUrl = (rel: DesktopRelease, key: keyof DesktopRelease['files']) => `${DESKTOP_BASE}${rel.files[key]}`;

export const DESKTOP_INSTALL = {
  mac: 'curl -fsSL https://deiza.org/downloads/desktop/install.sh | bash',
  windows: 'irm https://deiza.org/downloads/desktop/install.ps1 | iex',
};
