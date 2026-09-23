import { stripArtifactBlocks } from '@/lib/artifactBlock';
/**
 * Read-aloud player — speech from `/api/tts`.
 *
 * Long answers are split client-side into short segments (first one tiny so the
 * voice starts within ~1-3 s), fetched with a 2-segment look-ahead and played back
 * to back through a single <audio> element. Only one message plays at a time.
 */
import { authHeaders } from '@/services/api';

export type TtsStatus = 'idle' | 'loading' | 'playing';
type Listener = (status: TtsStatus) => void;

// Growing segment sizes: the first clip is tiny so the voice starts fast, the
// next ones grow while earlier clips play (generation runs ~1.5-2x realtime).
const SEGMENT_SCHEDULE = [80, 200, 360, 420];
const SEGMENT_CHARS = 420;
const MAX_TOTAL_CHARS = 6000;
const CACHE_LIMIT = 24;

// Tiny silent WAV so iOS lets us call play() inside the user gesture and swap src later.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/** Strip markdown so segments split on real sentences (server does the full clean). */
export function speakableText(markdown: string): string {
  let t = markdown.replace(/\r/g, '');
  t = stripArtifactBlocks(t);
  t = t.replace(/```[\w-]*\n[\s\S]*?```/g, ' ');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '');
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/`([^`\n]+)`/g, '$1');
  t = t.replace(/\|/g, ', ');
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim().slice(0, MAX_TOTAL_CHARS);
}

function splitSegments(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?…:;])\s+|\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const limit = SEGMENT_SCHEDULE[Math.min(out.length, SEGMENT_SCHEDULE.length - 1)];
    if (cur && cur.length + s.length + 1 > limit) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
    // A single monster sentence — hard split so no request exceeds the limit.
    while (cur.length > SEGMENT_CHARS * 2) {
      out.push(cur.slice(0, SEGMENT_CHARS * 2));
      cur = cur.slice(SEGMENT_CHARS * 2);
    }
  }
  if (cur) out.push(cur);
  return out;
}

class TtsPlayer {
  private audio: HTMLAudioElement | null = null;
  private activeKey: string | null = null;
  private status: TtsStatus = 'idle';
  private listeners = new Map<string, Set<Listener>>();
  private cache = new Map<string, string[]>(); // key → object URLs per segment
  private runId = 0;
  private controller: AbortController | null = null;
  private rejectCurrent: ((err: Error) => void) | null = null;

  subscribe(key: string, fn: Listener): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    fn(this.activeKey === key ? this.status : 'idle');
    return () => { this.listeners.get(key)?.delete(fn); };
  }

  statusFor(key: string): TtsStatus {
    return this.activeKey === key ? this.status : 'idle';
  }

  private emit(key: string | null, status: TtsStatus) {
    if (!key) return;
    this.listeners.get(key)?.forEach(fn => fn(status));
  }

  private setStatus(status: TtsStatus) {
    this.status = status;
    this.emit(this.activeKey, status);
  }

  stop() {
    this.runId += 1;
    const prev = this.activeKey;
    this.controller?.abort();
    this.controller = null;
    this.rejectCurrent?.(new Error('abort'));
    this.rejectCurrent = null;
    if (this.audio) {
      try { this.audio.pause(); } catch { /* noop */ }
      this.audio.onended = null;
      this.audio.onerror = null;
    }
    this.activeKey = null;
    this.status = 'idle';
    this.emit(prev, 'idle');
  }

  toggle(key: string, markdown: string, language: string): void {
    if (this.activeKey === key) { this.stop(); return; }
    void this.play(key, markdown, language);
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      (this.audio as any).playsInline = true;
    }
    return this.audio;
  }

  private async fetchSegment(text: string, language: string, signal: AbortSignal): Promise<string> {
    const res = await fetch('/api/tts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text, language }),
      signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error || ''; } catch { /* ignore */ }
      throw new Error(detail || `tts_${res.status}`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  private async play(key: string, markdown: string, language: string): Promise<void> {
    this.stop();
    const run = ++this.runId;
    this.activeKey = key;
    this.setStatus('loading');

    const audio = this.ensureAudio();
    // Unlock playback on iOS/Safari inside the click gesture.
    try { audio.src = SILENT_WAV; await audio.play().catch(() => undefined); } catch { /* noop */ }

    const text = speakableText(markdown);
    if (!text) { this.stop(); return; }
    const segments = splitSegments(text);
    const controller = new AbortController();
    this.controller = controller;

    let urls = this.cache.get(key);
    const pending: Array<Promise<string> | undefined> = [];
    if (!urls) {
      urls = new Array(segments.length);
    }
    const ensureFetched = (i: number) => {
      if (i >= segments.length || urls![i] || pending[i]) return;
      pending[i] = this.fetchSegment(segments[i], language, controller.signal)
        .then(u => { urls![i] = u; return u; });
    };

    try {
      for (let i = 0; i < segments.length; i++) {
        if (run !== this.runId) { controller.abort(); return; }
        ensureFetched(i);
        ensureFetched(i + 1);
        ensureFetched(i + 2);
        const url = urls[i] || (await pending[i]!);
        if (run !== this.runId) { controller.abort(); return; }
        await new Promise<void>((resolve, reject) => {
          this.rejectCurrent = reject;
          audio.onended = () => { this.rejectCurrent = null; resolve(); };
          audio.onerror = () => { this.rejectCurrent = null; reject(new Error('audio_error')); };
          audio.src = url;
          audio.play().then(() => {
            if (run === this.runId) this.setStatus('playing');
          }).catch(reject);
        });
      }
      if (urls.every(Boolean)) this.remember(key, urls);
    } catch (err) {
      if (run === this.runId) {
        this.emitError(err);
      }
    } finally {
      if (run === this.runId) this.stop();
    }
  }

  private remember(key: string, urls: string[]) {
    this.cache.set(key, urls);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.get(oldest)?.forEach(u => URL.revokeObjectURL(u));
      this.cache.delete(oldest);
    }
  }

  onError: ((message: string) => void) | null = null;
  private emitError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort')) return;
    this.onError?.(msg);
  }
}

export const ttsPlayer = new TtsPlayer();

/** Stable key for a message — content hash keeps cache hits across re-renders. */
export function ttsKey(id: string | number, content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  return `${id}:${content.length}:${h}`;
}
