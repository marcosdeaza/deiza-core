import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, Plus, X, Square, FileText, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import ModelSelector, { type ModelKey } from './ModelSelector';
import AudioRecorder, { type AudioRecorderHandle, type VoiceState } from './AudioRecorder';
import VoiceWave from './VoiceWave';
import { api, apiErrorMessage } from '@/services/api';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import { isNative } from '@/lib/native';

interface ChatInputProps {
  onSend: (message: string, files?: any[]) => void;
  onStop?: () => void;
  model: ModelKey;
  onModelChange: (model: ModelKey) => void;
  /** Hard lock (e.g. a mandatory dialog is open): nothing can be typed */
  disabled?: boolean;
  /** Deiza is answering: typing stays possible, sending is replaced by Stop */
  busy?: boolean;
  restoredValue?: string;
  isDemo?: boolean;
  userPlan?: string;
  onUpgradeClick?: () => void;
  status?: string;
  /** Hero = centered empty-state variant (slightly taller, softer) */
  variant?: 'hero' | 'dock';
  /** Notified whenever the draft goes from empty → non-empty or back */
  onDraftChange?: (hasDraft: boolean) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = '.pdf,.txt,.md,.py,.js,.jsx,.ts,.tsx,.css,.html,.json,.png,.jpg,.jpeg,.gif,.webp,.heic';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ChatInput = ({
  onSend, onStop, model, onModelChange,
  disabled, busy, restoredValue, isDemo, userPlan = 'free', onUpgradeClick,
  variant = 'dock', onDraftChange,
}: ChatInputProps) => {
  const { t } = useLanguage();
  const { trigger: haptic } = useHaptics();
  const [value, setValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  // Dictation on top of an existing draft: provisional (grey) text until confirmed
  const [dictPreview, setDictPreview] = useState<string | null>(null);
  const hadDraftAtStartRef = useRef(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const levelRef = useRef(0);
  const transcriptionBaseRef = useRef('');
  const submittedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const [micStopSig, setMicStopSig] = useState(0);
  const [initialHistory] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('deiza_prompt_history') || '[]');
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    }
    catch { return []; }
  });
  const promptHistoryRef = useRef<string[]>(initialHistory);
  const promptHistoryIdxRef = useRef(-1);
  const draftRef = useRef('');
  const valueRef = useRef('');
  const native = isNative();

  const restoreHistory = useCallback((valueNow: string, dir: 1 | -1) => {
    const h = promptHistoryRef.current;
    const len = Array.isArray(h) ? h.length : 0;
    if (len === 0) return;
    if (dir === -1) {
      if (promptHistoryIdxRef.current === -1) draftRef.current = valueNow;
      promptHistoryIdxRef.current = promptHistoryIdxRef.current === -1
        ? len - 1
        : Math.max(0, promptHistoryIdxRef.current - 1);
      setValue(h[promptHistoryIdxRef.current] ?? '');
    } else {
      const next = promptHistoryIdxRef.current + 1;
      if (next >= len) {
        promptHistoryIdxRef.current = -1;
        setValue(draftRef.current);
      } else {
        promptHistoryIdxRef.current = next;
        setValue(h[next] ?? '');
      }
    }
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const hasDraft = value.trim().length > 0 || uploadedFiles.length > 0;
  useEffect(() => { onDraftChange?.(hasDraft); }, [hasDraft, onDraftChange]);

  // Global ArrowUp/ArrowDown — works even when the textarea lost focus
  // (e.g. right after sending) as long as no other text field is focused.
  useEffect(() => {
    if (native) return;
    const onWinKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
      if (e.key === 'ArrowUp' && promptHistoryRef.current.length > 0) {
        e.preventDefault();
        restoreHistory(valueRef.current, -1);
      } else if (e.key === 'ArrowDown' && promptHistoryIdxRef.current !== -1) {
        e.preventDefault();
        restoreHistory(valueRef.current, 1);
      }
    };
    window.addEventListener('keydown', onWinKey, true);
    return () => window.removeEventListener('keydown', onWinKey, true);
  }, [restoreHistory, native]);

  // Auto-grow textarea. Empty → let CSS min-height rule (measuring an empty
  // textarea during the mount/layout animation can read a bogus scrollHeight).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!value) { ta.style.height = ''; return; }
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
  }, [value, voiceState]);

  useEffect(() => {
    if (restoredValue) {
      setValue(restoredValue);
      if (!native) setTimeout(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 120);
    }
  }, [restoredValue, native]);

  // Recording timer
  useEffect(() => {
    if (voiceState !== 'recording') { setRecSeconds(0); return; }
    const started = Date.now();
    const id = setInterval(() => setRecSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [voiceState]);

  // Keyboard shortcut: "/" focuses the composer when nothing else is focused
  useEffect(() => {
    if (native) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
      e.preventDefault();
      textareaRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [native]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      // On phones Enter inserts a newline (the arrow button sends); on desktop it sends.
      if (window.matchMedia?.('(pointer: coarse)').matches) return;
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'ArrowUp' && promptHistoryRef.current.length > 0 && !value.includes('\n')) {
      e.preventDefault();
      restoreHistory(value, -1);
      return;
    }
    if (e.key === 'ArrowDown' && promptHistoryIdxRef.current !== -1) {
      e.preventDefault();
      restoreHistory(value, 1);
    }
  };

  const processFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      haptic('warning');
      toast.error(t('ci.err.size'));
      return;
    }
    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);
      if (isImage) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          mime_type: file.type || 'image/jpeg',
          raw_bytes: b64,
          is_image: true,
          content: `[Imagen adjunta: ${file.name}]`,
        }]);
      } else {
        // Text-like files are parsed server-side (PDF text extraction, encoding)
        const res = await api.uploadFile(file);
        if (res.is_image && res.raw_bytes) {
          setUploadedFiles(prev => [...prev, {
            name: res.filename || file.name, mime_type: res.mime_type || file.type,
            raw_bytes: res.raw_bytes, is_image: true, content: `[Imagen adjunta: ${file.name}]`,
          }]);
        } else {
          setUploadedFiles(prev => [...prev, {
            name: res.filename || file.name,
            mime_type: file.type || 'text/plain',
            content: typeof res.content === 'string' ? res.content : '',
          }]);
        }
      }
      haptic('light');
    } catch (err) {
      haptic('error');
      toast.error(apiErrorMessage(err, t, t('ci.err.upload')));
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).slice(0, 6).forEach(processFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileClick = () => {
    haptic('light');
    fileInputRef.current?.click();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) processFile(f);
        return;
      }
    }
  };

  // Drag & drop files onto the composer
  const onDragEnter = (e: React.DragEvent) => {
    if (isDemo || disabled) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    Array.from(e.dataTransfer.files || []).slice(0, 6).forEach(processFile);
  };

  const removeFile = (index: number) => {
    haptic('light');
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && uploadedFiles.length === 0) || disabled || busy || uploading || voiceState !== 'idle') return;
    haptic('medium');
    // Record prompt in history for ArrowUp recall (guarded: storage may be corrupt)
    try {
      if (trimmed && promptHistoryRef.current[promptHistoryRef.current.length - 1] !== trimmed) {
        promptHistoryRef.current.push(trimmed);
        if (promptHistoryRef.current.length > 50) {
          promptHistoryRef.current = promptHistoryRef.current.slice(-50);
        }
        localStorage.setItem('deiza_prompt_history', JSON.stringify(promptHistoryRef.current));
      }
    } catch { /* never block sending */ }
    promptHistoryIdxRef.current = -1;
    draftRef.current = '';
    // Ignore any late transcription once the message is sent
    submittedRef.current = true;
    setDictPreview(null);
    transcriptionBaseRef.current = '';
    setMicStopSig(s => s + 1);
    onSend(trimmed, uploadedFiles.length > 0 ? uploadedFiles : undefined);
    setValue('');
    setUploadedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Keep the keyboard open on desktop for rapid follow-ups
    if (!native && window.matchMedia?.('(pointer: fine)').matches) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const getPlaceholder = () => {
    if (busy) return t('ci.thinking');
    if (isDemo) return t('ci.demo');
    return t('ci.placeholder');
  };

  const canSend = (value.trim().length > 0 || uploadedFiles.length > 0) && voiceState === 'idle' && !uploading && !busy;
  const isHero = variant === 'hero';
  const isVoice = voiceState !== 'idle';

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Attached files */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            className="flex flex-wrap gap-2 mb-2 px-2"
          >
            {uploadedFiles.map((file, index) => {
              const isImage = file.is_image || file.mime_type?.startsWith('image/');
              return (
                <motion.div
                  key={`${file.name}-${index}`}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative group flex-shrink-0"
                >
                  {isImage && file.raw_bytes ? (
                    <div className="relative rounded-2xl overflow-hidden border border-border/30 bg-muted/30 shadow-sm" style={{ width: 72, height: 72 }}>
                      <img
                        src={`data:${file.mime_type || 'image/png'};base64,${file.raw_bytes}`}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-black transition-colors focus-ring"
                        aria-label={t('ws.delete')}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-card/80 rounded-2xl pl-2.5 pr-2 py-1.5 text-xs border border-border/30 shadow-sm">
                      <span className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="w-3 h-3 text-primary" />
                      </span>
                      <span className="font-body text-foreground truncate max-w-[150px] font-medium">{file.name}</span>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-muted-foreground hover:text-foreground transition-colors focus-ring rounded-full p-0.5"
                        aria-label={t('ws.delete')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer card */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`deiza-composer relative bg-card/90 backdrop-blur-xl border rounded-[26px] transition-[box-shadow,border-color,background-color] duration-300 ${
          isDragging
            ? 'border-primary/60 ring-2 ring-primary/25 bg-primary/5'
            : focused || isVoice
              ? 'border-primary/35 deiza-composer-glow'
              : 'border-border/40 deiza-shadow-lg hover:border-border/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          multiple
          accept={ALLOWED_TYPES}
          className="hidden"
          tabIndex={-1}
        />

        {/* Drop overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              className="absolute inset-0 z-20 rounded-[26px] flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <span className="font-body text-sm text-primary">{t('ci.drop')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text / voice row */}
        <div className={`px-4 ${isHero ? 'pt-4' : 'pt-3.5'} pb-1.5`}>
          {isVoice && !hadDraftAtStartRef.current ? (
            <div
              key="voice"
              className="flex items-center gap-3 min-h-[44px] animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                {voiceState === 'recording' && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 animate-ping [animation-duration:1.6s]" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${voiceState === 'recording' ? 'bg-primary' : 'bg-primary/40'}`} />
              </span>
              <VoiceWave levelRef={levelRef} active={voiceState === 'recording'} className="flex-1 min-w-0" />
              <span className="font-body text-xs tabular-nums text-muted-foreground shrink-0 min-w-[64px] text-right" aria-live="polite">
                {voiceState === 'recording' ? fmtTime(recSeconds) : t('aud.transcribing')}
              </span>
            </div>
          ) : (
            <div key="text" className="animate-in fade-in duration-150">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={getPlaceholder()}
                disabled={disabled}
                rows={1}
                inputMode="text"
                enterKeyHint={native ? 'enter' : 'send'}
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck
                className={`w-full bg-transparent font-body text-foreground placeholder:text-muted-foreground/55 outline-none disabled:opacity-50 resize-none max-h-[240px] leading-relaxed ${isHero ? 'min-h-[52px]' : 'min-h-[44px]'}`}
                style={{ fontSize: '16px' }}
              />
              {/* Dictating on top of a draft: slim live row under the text */}
              {isVoice && hadDraftAtStartRef.current && (
                <div className="flex items-center gap-3 h-8 mt-1 animate-in fade-in duration-150">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${voiceState === 'recording' ? 'bg-primary animate-pulse' : 'bg-primary/40'}`} aria-hidden="true" />
                  <VoiceWave levelRef={levelRef} active={voiceState === 'recording'} bars={28} className="flex-1 min-w-0 !h-6" />
                  <span className="font-body text-[11px] tabular-nums text-muted-foreground shrink-0">
                    {voiceState === 'recording' ? fmtTime(recSeconds) : t('aud.transcribing')}
                  </span>
                </div>
              )}
              {/* Provisional dictation (grey) — ✓ makes it part of the message, ✕ discards it */}
              {dictPreview && !isVoice && (
                <div className="flex items-start gap-2 mt-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="flex-1 min-w-0 font-body text-[15px] leading-relaxed text-muted-foreground/60 italic whitespace-pre-wrap break-words">{dictPreview}</p>
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { haptic('light'); setDictPreview(null); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 focus-ring"
                      aria-label={t('aud.cancel')}
                      title={t('aud.cancel')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        const base = value.trimEnd();
                        setValue(base ? `${base} ${dictPreview}` : dictPreview);
                        setDictPreview(null);
                        if (!native) setTimeout(() => textareaRef.current?.focus(), 30);
                      }}
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 focus-ring"
                      aria-label={t('aud.done')}
                      title={t('aud.done')}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-0.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <motion.button
              onClick={handleFileClick}
              disabled={uploading || disabled || isDemo || isVoice}
              className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40 focus-ring shrink-0"
              title={t('ci.attach')}
              aria-label={t('ci.attach')}
              whileTap={{ scale: 0.9 }}
            >
              {uploading
                ? <span className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-hidden="true" />
                : <Plus className="w-5 h-5" strokeWidth={1.75} />}
            </motion.button>

            <ModelSelector
              model={model}
              onModelChange={onModelChange}
              userPlan={userPlan}
              onUpgradeClick={onUpgradeClick}
            />
          </div>

          {/* Action slot: mic when empty → send when there's a draft → stop while generating */}
          <div className="flex items-center gap-1.5">
            {busy ? (
              <motion.button
                onClick={() => { haptic('medium'); onStop?.(); }}
                className="w-9 h-9 rounded-full text-foreground bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors focus-ring shrink-0 animate-in fade-in zoom-in-75 duration-150"
                whileTap={{ scale: 0.9 }}
                title={t('ci.stop')}
                aria-label={t('ci.stop')}
              >
                <Square className="w-3 h-3" fill="currentColor" />
              </motion.button>
            ) : (
              <>
                {!isDemo && (
                  <AudioRecorder
                    ref={recorderRef}
                    onStart={() => {
                      submittedRef.current = false;
                      transcriptionBaseRef.current = value;
                      hadDraftAtStartRef.current = value.trim().length > 0;
                      setDictPreview(null);
                    }}
                    onTranscript={(text) => {
                      if (submittedRef.current) return;
                      if (hadDraftAtStartRef.current) {
                        // Existing draft: show the dictation in grey until the user confirms it
                        setDictPreview(text);
                        return;
                      }
                      setValue(text);
                      if (!native) setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    onStateChange={setVoiceState}
                    onLevel={(v) => { levelRef.current = v; }}
                    disabled={disabled}
                    stopSignal={micStopSig}
                    size={hasDraft ? 'sm' : 'md'}
                  />
                )}
                {(hasDraft || isDemo) && voiceState === 'idle' && (
                  <motion.button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-200 focus-ring shrink-0 animate-in fade-in zoom-in-75 duration-150 ${
                      canSend
                        ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.7)] hover:brightness-110'
                        : 'bg-muted/60 text-muted-foreground/40'
                    }`}
                    whileTap={canSend ? { scale: 0.9 } : undefined}
                    title={t('ci.send')}
                    aria-label={t('ci.send')}
                  >
                    <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.4} />
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
