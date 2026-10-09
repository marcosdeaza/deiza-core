/** Audio input chosen by the user for dictation (same key as the desktop app's Code composer). */
export const INPUT_KEY = 'deiza:audio:input';
const NAME_KEY = 'deiza:audio:input:name';
export const BASE_AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export const readInput = (): string => { try { return localStorage.getItem(INPUT_KEY) || 'default'; } catch { return 'default'; } };
export const readInputName = (): string => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

export const writeInput = (id: string, name = ''): void => {
  try {
    if (id === 'default') localStorage.removeItem(INPUT_KEY); else localStorage.setItem(INPUT_KEY, id);
    if (name) localStorage.setItem(NAME_KEY, cleanMicName(name)); else localStorage.removeItem(NAME_KEY);
  } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('deiza:audio-input'));
};

/** Remember the real name of the mic that answered (the default one has no stored name). */
export const rememberInputName = (name: string): void => {
  if (!name) return;
  try { localStorage.setItem(NAME_KEY, cleanMicName(name)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('deiza:audio-input'));
};

/** "MacBook Pro Microphone (05ac:8103)" -> "MacBook Pro Microphone"; "Default - X" -> "X". */
export const cleanMicName = (name: string): string =>
  name.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').replace(/^(Default|Predeterminado|Communications)\s*-\s*/i, '').trim();

/** Microphones with their names. Browsers hide the names until the mic was allowed once, so ask
 * for it briefly when every label is empty. */
export async function listInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const inputs = async () => (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  let list = await inputs();
  if (list.length && !list.some(d => d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      list = await inputs();
    } catch { /* permission denied: keep the unnamed list */ }
  }
  const seen = new Set<string>();
  return list.filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications' && !seen.has(d.deviceId) && seen.add(d.deviceId));
}
