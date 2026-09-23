import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import { Mic, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHaptics } from '@/hooks/useHaptics';
import { authHeaders } from '@/services/api';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

export interface AudioRecorderHandle {
  start: () => void;
  /** Stop and transcribe */
  stop: () => void;
  /** Stop and discard */
  cancel: () => void;
}

interface AudioRecorderProps {
  onTranscript: (text: string) => void;
  onStart?: () => void;
  onStateChange?: (state: VoiceState) => void;
  /** Live input level 0..1, ~30 fps while recording (drives the waveform in ChatInput) */
  onLevel?: (level: number) => void;
  disabled?: boolean;
  /** Bump to cancel an in-flight recording (parent sent the message) */
  stopSignal?: number;
  /** Render the idle mic button (false while the composer shows Send instead) */
  showIdle?: boolean;
  /** Visual size of the round buttons */
  size?: 'sm' | 'md';
}

const MAX_SECONDS = 600;

/*
 * Segmented dictation: while the user speaks, the recording is cut at natural pauses and each
 * piece is transcribed in the background. When they press "done" only the last piece (a few
 * seconds) is still pending, so the text appears almost at once however long they talked.
 */
const SEG_MIN_MS = 14_000;     // rotate at the first real pause after this
const SEG_SOFT_MS = 24_000;    // after this, a short pause is enough
const SEG_MAX_MS = 40_000;     // hard cut (no pause found)
const PAUSE_MS = 380;
const SOFT_PAUSE_MS = 160;
const QUIET_RMS = 0.012;       // raw RMS below this counts as silence
const SPEECH_PEAK_RMS = 0.02;  // a segment that never goes above this is not sent

interface Segment {
  mr: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  peak: number;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* noop */ }
  }
  return '';
}

function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Voice input — records with MediaRecorder on every platform (web, desktop, iOS/Android
 * Capacitor) and sends the audio to `/api/transcribe`. Long dictations are uploaded in pieces
 * cut at pauses while the user is still talking (see SEG_* above).
 *
 * Renders only the control buttons; the waveform/timer row lives in ChatInput.
 */
const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(function AudioRecorder(
  { onTranscript, onStart, onStateChange, onLevel, disabled, stopSignal, showIdle = true, size = 'md' }, ref,
) {
  const { language, t } = useLanguage();
  const { trigger: haptic } = useHaptics();
  const [state, setStateRaw] = useState<VoiceState>('idle');
  const stateRef = useRef<VoiceState>('idle');

  const segRef = useRef<Segment | null>(null);
  const pendingRef = useRef<Promise<string>[]>([]);
  const textsRef = useRef<string[]>([]);
  const segCountRef = useRef(0);
  const quietSinceRef = useRef(0);
  const segmentingRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const setState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setStateRaw(s);
    onStateChange?.(s);
  }, [onStateChange]);

  const releaseMedia = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    analyserRef.current = null;
    onLevel?.(0);
  }, [onLevel]);

  useEffect(() => () => {
    cancelledRef.current = true;
    try { segRef.current?.mr.stop(); } catch { /* noop */ }
    abortRef.current?.abort();
    releaseMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Raw RMS of the current mic buffer (0..~0.5 for speech). */
  const readRms = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  const meter = useCallback((stream: MediaStream) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      void ctx.resume?.();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyserRef.current = analyser;
      let last = 0;
      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (now - last < 33) return; // ~30 fps
        last = now;
        onLevel?.(Math.min(1, readRms() * 5.5));
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* AudioContext unavailable — waveform stays flat, no segmentation */ }
  }, [onLevel, readRms]);

  /** Upload one piece; one retry for network hiccups and rate limits. */
  const upload = useCallback(async (blob: Blob, durationMs: number, partial: boolean, index: number): Promise<string> => {
    const controller = abortRef.current;
    const send = async () => {
      const form = new FormData();
      form.append('audio', blob, `recording.${extFor(blob.type || mimeRef.current)}`);
      form.append('language', language);
      form.append('duration_ms', String(Math.round(durationMs)));
      if (partial) form.append('segment', '1');
      const prev = index > 0 ? textsRef.current[index - 1] : '';
      if (prev) form.append('context', prev.slice(-300));
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: form,
        signal: controller?.signal,
      });
      if (res.status === 429) throw new Error('rate');
      if (!res.ok) throw new Error('transcription failed');
      const data = await res.json();
      return String(data.transcript || '').trim();
    };
    let text: string;
    try {
      text = await send();
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      await new Promise(r => setTimeout(r, err?.message === 'rate' ? 1500 : 600));
      text = await send();
    }
    textsRef.current[index] = text;
    return text;
  }, [language]);

  const newSegment = useCallback((stream: MediaStream): Segment => {
    const mime = mimeRef.current;
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const seg: Segment = { mr, chunks: [], startedAt: Date.now(), peak: 0 };
    mr.ondataavailable = e => { if (e.data && e.data.size > 0) seg.chunks.push(e.data); };
    mr.start(1000);
    quietSinceRef.current = 0;
    return seg;
  }, []);

  /** Stop a segment and queue its transcription (kept in recording order). */
  const closeSegment = useCallback((seg: Segment, final: boolean, onStopped?: () => void) => {
    const index = segCountRef.current++;
    const partial = !(final && index === 0);
    const p = new Promise<string>((resolve, reject) => {
      seg.mr.onstop = () => {
        const duration = Date.now() - seg.startedAt;
        const blob = new Blob(seg.chunks, { type: seg.mr.mimeType || mimeRef.current || 'audio/webm' });
        // No level reading (AudioContext blocked) → peak stays 0: send it anyway.
        const silent = analyserRef.current !== null && seg.peak > 0 && seg.peak < SPEECH_PEAK_RMS;
        onStopped?.();
        if (cancelledRef.current || blob.size < 1500 || duration < 400 || silent) {
          textsRef.current[index] = '';
          resolve('');
          return;
        }
        upload(blob, duration, partial, index).then(resolve, reject);
      };
      seg.mr.onerror = () => { onStopped?.(); resolve(''); };
    });
    pendingRef.current.push(p);
    try { seg.mr.stop(); } catch { onStopped?.(); }
    return p;
  }, [upload]);

  /** Runs every 100 ms while recording: tracks the level and cuts a segment at a pause. */
  const segmentTick = useCallback(() => {
    const seg = segRef.current;
    const stream = streamRef.current;
    if (!seg || !stream || stateRef.current !== 'recording') return;
    const rms = readRms();
    if (rms > seg.peak) seg.peak = rms;
    const now = Date.now();
    if (rms < QUIET_RMS) { if (!quietSinceRef.current) quietSinceRef.current = now; }
    else quietSinceRef.current = 0;
    if (!segmentingRef.current) return;
    const age = now - seg.startedAt;
    const quietFor = quietSinceRef.current ? now - quietSinceRef.current : 0;
    const cut = (age >= SEG_MIN_MS && quietFor >= PAUSE_MS)
      || (age >= SEG_SOFT_MS && quietFor >= SOFT_PAUSE_MS)
      || age >= SEG_MAX_MS;
    if (!cut) return;
    try {
      const next = newSegment(stream);
      segRef.current = next;
      void closeSegment(seg, false).catch(() => { /* reported when the dictation ends */ });
    } catch {
      segmentingRef.current = false; // this browser cannot run two recorders back to back
    }
  }, [readRms, newSegment, closeSegment]);

  const start = useCallback(async () => {
    if (disabled || stateRef.current !== 'idle') return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t('aud.err.unsupported'));
      return;
    }
    try {
      onStart?.();
      cancelledRef.current = false;
      runRef.current += 1;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeRef.current = pickMimeType();
      pendingRef.current = [];
      textsRef.current = [];
      segCountRef.current = 0;
      segmentingRef.current = true;
      abortRef.current = new AbortController();
      segRef.current = newSegment(stream);
      meter(stream);
      tickRef.current = setInterval(segmentTick, 100);
      setState('recording');
      haptic('medium');
      maxTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'recording') stopRef.current();
      }, MAX_SECONDS * 1000);
    } catch (err: any) {
      releaseMedia();
      setState('idle');
      const name = err?.name || '';
      const msg = err?.message || '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|denied/i.test(msg)) {
        toast.error((window as any).Capacitor?.isNativePlatform?.() ? t('aud.err.permission.settings') : t('aud.err.permission.browser'));
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        toast.error(t('aud.err.nomic'));
      } else {
        toast.error(t('aud.err.mic'));
      }
    }
  }, [disabled, onStart, releaseMedia, setState, meter, newSegment, segmentTick, haptic, t]);

  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording') return;
    const seg = segRef.current;
    segRef.current = null;
    cancelledRef.current = false;
    haptic('light');
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    const run = runRef.current;
    setState('transcribing');
    if (seg) void closeSegment(seg, true, releaseMedia).catch(() => { /* handled below */ });
    else releaseMedia();
    const results = await Promise.allSettled(pendingRef.current);
    if (run !== runRef.current || cancelledRef.current) return; // cancelled meanwhile
    const aborted = results.some(r => r.status === 'rejected' && (r.reason as any)?.name === 'AbortError');
    if (aborted) return;
    const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    const text = results
      .map(r => (r.status === 'fulfilled' ? r.value : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    abortRef.current = null;
    setState('idle');
    if (text) {
      onTranscript(text);
      haptic('light');
    }
    if (failed.length) {
      toast.error(failed[0].reason?.message === 'rate' ? t('aud.err.rate') : t('aud.err.transcribe'));
    } else if (!text) {
      toast.info(t('aud.nospeech'));
    }
  }, [haptic, releaseMedia, setState, closeSegment, onTranscript, t]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    if (stateRef.current === 'idle') return;
    cancelledRef.current = true;
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const seg = segRef.current;
    segRef.current = null;
    pendingRef.current = [];
    if (seg) { try { seg.mr.stop(); } catch { /* noop */ } }
    releaseMedia();
    haptic('light');
    setState('idle');
  }, [haptic, releaseMedia, setState]);

  useImperativeHandle(ref, () => ({ start, stop: () => { void stop(); }, cancel }), [start, stop, cancel]);

  // Parent sent the message while recording → discard silently
  const prevStopRef = useRef(0);
  useEffect(() => {
    if (stopSignal && stopSignal !== prevStopRef.current) {
      prevStopRef.current = stopSignal;
      if (stateRef.current !== 'idle') cancel();
    }
  }, [stopSignal, cancel]);

  const dim = size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  const iconBtn = `relative flex items-center justify-center ${dim} rounded-full transition-colors focus-ring shrink-0`;
  const pop = 'animate-in fade-in zoom-in-75 duration-150';

  return (
    <>
      {state === 'idle' && showIdle && (
        <motion.button
          key="mic"
          type="button"
          onClick={start}
          disabled={disabled}
          className={`${iconBtn} ${pop} ${size === 'md' ? 'bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground shadow-sm' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/70'} disabled:opacity-40`}
          aria-label={t('aud.dictate')}
          title={t('aud.dictate')}
          whileTap={{ scale: 0.88 }}
        >
          <Mic className="w-[18px] h-[18px]" strokeWidth={1.9} />
        </motion.button>
      )}
      {state === 'recording' && (
        <div key="rec" className={`flex items-center gap-1 ${pop}`}>
          <motion.button
            type="button"
            onClick={cancel}
            className={`${iconBtn} text-muted-foreground/70 hover:text-foreground hover:bg-muted/70`}
            aria-label={t('aud.cancel')}
            title={t('aud.cancel')}
            whileTap={{ scale: 0.88 }}
          >
            <X className="w-4 h-4" />
          </motion.button>
          <motion.button
            type="button"
            onClick={stop}
            className={`${iconBtn} bg-primary text-primary-foreground hover:opacity-90 shadow-sm`}
            aria-label={t('aud.done')}
            title={t('aud.done')}
            whileTap={{ scale: 0.88 }}
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
          </motion.button>
        </div>
      )}
      {state === 'transcribing' && (
        <button
          key="busy"
          type="button"
          onClick={cancel}
          className={`${iconBtn} ${pop} text-primary bg-primary/10`}
          aria-label={t('aud.cancel')}
          title={t('aud.transcribing')}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
        </button>
      )}
    </>
  );
});

export default AudioRecorder;
