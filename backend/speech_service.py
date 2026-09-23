"""
Deiza speech services: dictation (STT) and read-aloud (TTS) through the same
model endpoint as the chat (see MODEL_API_URL in .env.example).

  STT  a fast audio-capable model transcribes the recording; if it is slow a
       duplicate request races it, and if it fails a larger model takes over.
  TTS  an audio-output model reads the text in chunks, in parallel.

Every path produces raw PCM 16-bit / 24 kHz / mono which is encoded once with
ffmpeg to MP3 so the browser gets a small, universally playable payload.

Configuration (backend/.env):
  STT_MODEL            fast transcription model
  STT_FALLBACK_MODEL   larger model used when the fast one fails or hears nothing
  TTS_MODEL            speech-output model
  TTS_VOICES           comma-separated voice names the client may pick
  TTS_DEFAULT_VOICE    voice used when the client sends none (empty = model default)
"""

import base64
import io
import logging
import os
import re
import subprocess
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor

import requests

from ai_service import _model_request

logger = logging.getLogger('deiza.speech')

STT_FAST_MODEL = os.getenv('STT_MODEL', '').strip()
STT_FALLBACK_MODEL = os.getenv('STT_FALLBACK_MODEL', '').strip() or STT_FAST_MODEL
# Browser recordings (webm/opus, mp4/aac, ogg) go to the model untouched up to this length:
# re-encoding with ffmpeg cost 1.5-3 s per clip on a small server, more than the model itself.
STT_DIRECT_MAX_SECONDS = 50
STT_MODEL_CHUNK_SECONDS = 25   # longer clips are cut at silences and transcribed in parallel
STT_DIRECT_MIMES = {'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/flac'}
TTS_MODEL = os.getenv('TTS_MODEL', '').strip()

STT_SAMPLE_RATE = 16000
TTS_SAMPLE_RATE = 24000
TTS_MAX_CHARS = 6000          # hard cap per request (≈ 6-7 min of speech)
TTS_CHUNK_CHARS = 1800        # per-request size

TTS_LANGUAGES = {'es', 'en', 'pt', 'fr', 'de', 'it', 'hi', 'ja', 'ko', 'zh', 'nl', 'pl', 'ru',
                 'ar', 'tr', 'ca', 'sv', 'da', 'nb', 'fi'}
ALLOWED_VOICES = {v.strip() for v in os.getenv('TTS_VOICES', '').split(',') if v.strip()}
DEFAULT_VOICE = os.getenv('TTS_DEFAULT_VOICE', '').strip()

# A leading style instruction that the speech model follows and does not read aloud.
# Keeps the voice warm and conversational instead of a flat "news reader" default.
TTS_STYLE = {
    'es': ('Lee el siguiente texto con una voz cálida, natural y cercana, como una asistente que '
           'conversa contigo, en español de España, a un ritmo normal y con buena entonación: ' + chr(10) + chr(10)),
    'en': ('Read the following text in a warm, natural, conversational voice, like an assistant '
           'talking with you, at a normal pace with natural intonation: ' + chr(10) + chr(10)),
}



# ── Audio helpers (ffmpeg lives in the backend image) ─────────────────────────

def _ffmpeg(args: list, data: bytes, timeout: int = 60) -> bytes:
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin'] + args
    proc = subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if proc.returncode != 0 or not proc.stdout:
        raise RuntimeError(f'ffmpeg failed ({proc.returncode}): {proc.stderr.decode(errors="ignore")[:300]}')
    return proc.stdout


def _to_pcm16k(audio_bytes: bytes) -> bytes:
    """Decode any browser recording (webm/opus, mp4/aac, ogg, wav…) to raw PCM s16le 16 kHz mono."""
    return _ffmpeg(['-i', 'pipe:0', '-vn', '-ac', '1', '-ar', str(STT_SAMPLE_RATE),
                    '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], audio_bytes)


def _pcm_to_wav(pcm: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def _wav_to_pcm(data: bytes) -> bytes:
    """Strip the RIFF header from a LINEAR16 WAV payload."""
    if data[:4] == b'RIFF':
        try:
            with wave.open(io.BytesIO(data), 'rb') as w:
                return w.readframes(w.getnframes())
        except Exception:
            return data[44:]
    return data


def _pcm_to_mp3(pcm: bytes, rate: int = TTS_SAMPLE_RATE) -> bytes:
    return _ffmpeg(['-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', 'pipe:0',
                    '-codec:a', 'libmp3lame', '-b:a', '80k', '-f', 'mp3', 'pipe:1'], pcm)


def _split_pcm_on_silence(pcm: bytes, rate: int, chunk_seconds: int) -> list:
    """Split PCM into ≤ chunk_seconds pieces, cutting at the quietest 20 ms frame
    in the last 8 seconds of each window so words are not sliced in half."""
    bytes_per_sec = rate * 2
    max_len = chunk_seconds * bytes_per_sec
    if len(pcm) <= max_len:
        return [pcm]
    try:
        import audioop  # Python ≤ 3.12 (backend image is 3.11)
        rms = lambda frag: audioop.rms(frag, 2)
    except Exception:  # pragma: no cover
        import array
        def rms(frag):
            a = array.array('h', frag)
            return int((sum(x * x for x in a) / max(1, len(a))) ** 0.5)
    frame = int(rate * 0.02) * 2  # 20 ms
    chunks, pos = [], 0
    while len(pcm) - pos > max_len:
        search_start = pos + max_len - 8 * bytes_per_sec
        best, best_rms = pos + max_len, None
        for p in range(search_start, pos + max_len, frame):
            r = rms(pcm[p:p + frame])
            if best_rms is None or r < best_rms:
                best, best_rms = p, r
        best -= best % 2
        chunks.append(pcm[pos:best])
        pos = best
    chunks.append(pcm[pos:])
    return [c for c in chunks if len(c) > frame * 5]


# ── Text helpers ──────────────────────────────────────────────────────────────

_EMOJI_RE = re.compile(
    '[' + chr(0x1F000) + '-' + chr(0x1FAFF) + chr(0x2600) + '-' + chr(0x27BF)
    + chr(0x2B00) + '-' + chr(0x2BFF) + chr(0x2300) + '-' + chr(0x23FF)
    + chr(0xFE0F) + chr(0x200D) + ']+')


def markdown_to_speech(text: str) -> str:
    """Turn a chat answer (markdown) into plain, readable prose for TTS."""
    if not text:
        return ''
    t = text.replace('\r', '')
    t = re.sub(r'\x00[A-Z]+:.*', '', t)                       # stream control markers
    t = re.sub(r'```artifact[\s\S]*?(```|$)', ' ', t)          # artifact JSON
    t = re.sub(r'```[\w-]*\n[\s\S]*?```', ' ', t)               # fenced code → skipped
    t = re.sub(r'<[^>\n]{1,200}>', ' ', t)                      # html tags
    t = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', t)                 # images
    t = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', t)              # links → label
    t = re.sub(r'\[\d+\]', '', t)                               # [1] citations
    t = re.sub(r'^\s{0,3}#{1,6}\s*', '', t, flags=re.M)         # headings
    t = re.sub(r'^\s*[-*+]\s+\[[ xX]\]\s*', '', t, flags=re.M)  # task boxes
    t = re.sub(r'^\s*[-*+]\s+', '', t, flags=re.M)              # bullets
    t = re.sub(r'^\s*\d+[.)]\s+', '', t, flags=re.M)            # numbered lists (keep text)
    t = re.sub(r'^\s*>\s?', '', t, flags=re.M)                  # blockquotes
    t = re.sub(r'^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$', '', t, flags=re.M)  # table rules
    t = t.replace('|', ', ')                                    # table cells
    t = re.sub(r'^\s*,\s*', '', t, flags=re.M)
    t = re.sub(r'\s*,\s*$', '.', t, flags=re.M)
    t = re.sub(r'(\*\*|__)(.*?)\1', r'\2', t)                   # bold
    t = re.sub(r'(?<!\w)([*_])(?!\s)(.*?)(?<!\s)\1(?!\w)', r'\2', t)  # italics
    t = re.sub(r'~~(.*?)~~', r'\1', t)                          # strike
    t = re.sub(r'`([^`\n]+)`', r'\1', t)                        # inline code
    t = re.sub(r'\$\$[\s\S]*?\$\$', ' ', t)                     # display math
    t = re.sub(r'(?<!\\)\$[^$\n]{1,80}\$', ' ', t)              # inline math
    t = re.sub(r'^\s*[-*_]{3,}\s*$', '', t, flags=re.M)         # hr
    t = _EMOJI_RE.sub('', t)
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    t = re.sub(r'\s*,\s*,+', ',', t)
    return t.strip()


_STOPWORDS = {
    'es': {'el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'para', 'con', 'por', 'del', 'se', 'no', 'lo', 'como', 'más', 'pero', 'sus', 'este', 'esta', 'puedes', 'también', 'aquí', 'sí'},
    'en': {'the', 'and', 'of', 'to', 'in', 'is', 'you', 'that', 'it', 'for', 'with', 'on', 'are', 'this', 'be', 'can', 'your', 'have', 'not', 'from', 'here', 'also', 'will', 'which'},
    'pt': {'o', 'a', 'os', 'as', 'de', 'que', 'e', 'em', 'um', 'uma', 'é', 'para', 'com', 'por', 'do', 'da', 'não', 'você', 'mais', 'também', 'isso', 'aqui', 'são', 'está'},
    'fr': {'le', 'la', 'les', 'de', 'des', 'et', 'en', 'un', 'une', 'est', 'pour', 'avec', 'que', 'qui', 'vous', 'pas', 'ce', 'dans', 'sur', 'aussi', 'sont', 'ici', 'plus'},
    'de': {'der', 'die', 'das', 'und', 'ist', 'in', 'ein', 'eine', 'nicht', 'mit', 'für', 'auf', 'sie', 'ich', 'auch', 'es', 'zu', 'den', 'dem', 'sind', 'hier', 'oder'},
    'it': {'il', 'la', 'di', 'che', 'e', 'un', 'una', 'è', 'per', 'con', 'non', 'sono', 'del', 'della', 'anche', 'gli', 'le', 'questo', 'qui', 'più', 'come'},
}


def detect_language(text: str, fallback: str = 'es') -> str:
    """Cheap stop-word language guess so the voice matches the answer."""
    words = re.findall(r"[a-záéíóúüñàèìòùâêîôûäöëïçãõ']+", text.lower())
    if len(words) < 4:
        return fallback
    sample = words[:400]
    scores = {lang: sum(1 for w in sample if w in sw) for lang, sw in _STOPWORDS.items()}
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return fallback
    # Require a clear margin before overriding the UI language
    if fallback in scores and scores[best] < scores[fallback] * 1.5 + 1:
        return fallback
    return best


def _chunk_text(text: str, limit: int) -> list:
    """Split on paragraph / sentence boundaries so chunks end on natural pauses."""
    if len(text) <= limit:
        return [text]
    chunks, cur = [], ''
    for para in re.split(r'\n{2,}', text):
        para = para.strip()
        if not para:
            continue
        if len(cur) + len(para) + 2 <= limit:
            cur = f'{cur}\n\n{para}' if cur else para
            continue
        if cur:
            chunks.append(cur)
            cur = ''
        if len(para) <= limit:
            cur = para
            continue
        for sent in re.split(r'(?<=[.!?…])\s+', para):
            if len(cur) + len(sent) + 1 <= limit:
                cur = f'{cur} {sent}' if cur else sent
            else:
                if cur:
                    chunks.append(cur)
                cur = sent[:limit]
    if cur:
        chunks.append(cur)
    return chunks


# ── Service ───────────────────────────────────────────────────────────────────

class SpeechService:
    def __init__(self):
        self._pool = ThreadPoolExecutor(max_workers=3)
        # STT requests (and their hedged duplicates) get their own pool so a long TTS job never
        # makes a dictation wait for a free thread.
        self._stt_pool = ThreadPoolExecutor(max_workers=16)
        if not STT_FAST_MODEL:
            logger.warning('Speech: STT_MODEL is not set — dictation is disabled')
        if not TTS_MODEL:
            logger.warning('Speech: TTS_MODEL is not set — read-aloud is disabled')

    def status(self) -> dict:
        return {
            'stt': STT_FAST_MODEL or 'not_configured',
            'stt_fallback': STT_FALLBACK_MODEL or 'not_configured',
            'tts': TTS_MODEL or 'not_configured',
        }

    # ── STT ───────────────────────────────────────────────────────────────────
    def transcribe(self, audio_bytes: bytes, mime_type: str = 'audio/webm', language: str = 'es',
                   duration_ms: int = 0, context: str = '', partial: bool = False) -> dict:
        """Returns {'transcript': str, 'language': str|None, 'engine': str}.

        duration_ms comes from the recorder; partial/context are sent by the segmented recorder
        (a long dictation is uploaded in ~20 s pieces while the user is still speaking)."""
        if not STT_FAST_MODEL:
            raise RuntimeError('STT_MODEL is not configured')
        mime = (mime_type or '').split(';')[0].strip().lower()
        secs = max(0.0, float(duration_ms or 0) / 1000.0)
        if 0 < secs < 0.3:
            return {'transcript': '', 'language': None, 'engine': 'none'}

        # Fast path: the recorder's own file, no ffmpeg round trip.
        known_short = 0 < secs <= STT_DIRECT_MAX_SECONDS
        unknown_small = not secs and len(audio_bytes) <= 400_000
        if mime in STT_DIRECT_MIMES and (known_short or unknown_small):
            text = self._model_hedged(audio_bytes, mime, language, secs or 30.0, context, partial)
            return {'transcript': text, 'language': None, 'engine': STT_FAST_MODEL}

        # Long recording (or an unusual container): decode once, cut at silences, run in parallel.
        try:
            pcm = _to_pcm16k(audio_bytes)
        except Exception as e:
            logger.warning(f'STT: ffmpeg decode failed ({e}) — sending original bytes')
            text = self._model_hedged(audio_bytes, mime or 'audio/webm', language, secs or 60.0, context, partial)
            return {'transcript': text, 'language': None, 'engine': STT_FAST_MODEL}
        if len(pcm) < STT_SAMPLE_RATE * 2 * 0.3:
            return {'transcript': '', 'language': None, 'engine': 'none'}
        chunks = _split_pcm_on_silence(pcm, STT_SAMPLE_RATE, STT_MODEL_CHUNK_SECONDS)
        if len(chunks) == 1:
            text = self._model_hedged(_pcm_to_wav(chunks[0], STT_SAMPLE_RATE), 'audio/wav', language,
                                      len(chunks[0]) / (STT_SAMPLE_RATE * 2), context, partial)
            return {'transcript': text, 'language': None, 'engine': STT_FAST_MODEL}

        def one(chunk: bytes) -> str:
            return self._model_hedged(_pcm_to_wav(chunk, STT_SAMPLE_RATE), 'audio/wav', language,
                                      len(chunk) / (STT_SAMPLE_RATE * 2), '', True)
        with ThreadPoolExecutor(max_workers=min(8, len(chunks))) as fan:
            texts = list(fan.map(one, chunks))
        text = re.sub(r'\s+', ' ', ' '.join(t for t in texts if t)).strip()
        logger.info(f'STT: parallel chunks={len(chunks)} chars={len(text)}')
        return {'transcript': text, 'language': None, 'engine': STT_FAST_MODEL}

    def _model_hedged(self, data: bytes, mime: str, language: str, secs: float,
                      context: str = '', partial: bool = False) -> str:
        """One request to the fast model; if it is slow, a duplicate races it (the tail latency
        of a single call can reach 15 s); if it fails, the larger model takes over."""
        from concurrent.futures import wait, FIRST_COMPLETED
        hedge_after = 2.2 + 0.06 * min(secs, 60.0)
        started = time.time()
        submit = lambda model: self._stt_pool.submit(self._model_transcribe, data, mime, language, model, context, partial)
        futures = [submit(STT_FAST_MODEL)]
        hedged = fallback = got_empty = False
        last_err = None
        while True:
            elapsed = time.time() - started
            if elapsed > 90:
                raise TimeoutError('transcription timed out')
            timeout = max(0.05, hedge_after - elapsed) if not hedged else 90 - elapsed
            done, _ = wait(futures, timeout=timeout, return_when=FIRST_COMPLETED)
            for f in done:
                futures.remove(f)
                try:
                    text = f.result()
                    if not text and secs >= 4:
                        # The recorder only sends clips with sound in them: an empty answer for several
                        # seconds of audio is usually a miss of the small model, not silence.
                        got_empty = True
                        if not fallback:
                            fallback = True
                            futures.append(submit(STT_FALLBACK_MODEL))
                            logger.info('STT: empty result from the fast model, asking the fallback model')
                        if futures:
                            continue
                    if hedged:
                        logger.info(f'STT: hedged request answered after {time.time() - started:.1f}s')
                    return text
                except Exception as e:
                    last_err = e
                    logger.warning(f'STT: request failed ({str(e)[:160]})')
                    if not fallback:
                        fallback = True
                        futures.append(submit(STT_FALLBACK_MODEL))
            if not futures:
                if got_empty:
                    return ''
                raise last_err or RuntimeError('transcription failed')
            if not hedged and time.time() - started >= hedge_after:
                hedged = True
                futures.append(submit(STT_FAST_MODEL))

    def _model_transcribe(self, audio_bytes: bytes, mime_type: str, language: str,
                          model: str = STT_FAST_MODEL, context: str = '', partial: bool = False) -> str:
        lang_names = {'es': 'Spanish', 'en': 'English', 'hi': 'Hindi', 'pt': 'Portuguese', 'fr': 'French',
                      'de': 'German', 'it': 'Italian', 'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean'}
        ui_lang = lang_names.get(language, 'Spanish')
        extra = ''
        if partial:
            extra += ('- This clip is one segment of a longer dictation, so it may start or end mid-sentence. '
                      'Transcribe exactly what is heard; if it starts in the middle of a sentence begin with a '
                      'lowercase letter, and do not add a final period when the speech is cut mid-sentence.\n')
        if context:
            extra += ('- Context only (already transcribed, do not include it in your output): the previous clip '
                      'ended with "' + context[-240:].replace('"', "'") + '". Use it just to keep names and spelling '
                      'consistent. Transcribe every word spoken in THIS clip, even if the speaker repeats earlier sentences.\n')
        prompt = (
            'You are a professional speech transcriber. Transcribe this recording VERBATIM.\n'
            '- Detect the spoken language automatically (the UI language is '
            f'{ui_lang}, but the speaker may use any language or mix languages) and keep it — never translate.\n'
            '- Add natural punctuation, capitalization and accents. Keep numbers, names and proper nouns as spoken.\n'
            '- Drop filler sounds ("eh", "mmm") and false starts, but keep every meaningful word.\n'
            + extra +
            '- If there is no intelligible speech, output nothing.\n'
            'Output ONLY the transcript — no quotes, labels or commentary.'
        )
        url, headers = _model_request(model, 'generateContent')
        payload = {
            'contents': [{'role': 'user', 'parts': [
                {'inline_data': {'mime_type': mime_type, 'data': base64.b64encode(audio_bytes).decode('ascii')}},
                {'text': prompt},
            ]}],
            'generationConfig': {'temperature': 0.0, 'maxOutputTokens': 8192,
                                 'thinkingConfig': {'thinkingLevel': 'minimal'}},
        }
        r = requests.post(url, json=payload, headers=headers, timeout=60)
        if r.status_code == 400:
            # Models without thinking levels reject the config
            payload['generationConfig'].pop('thinkingConfig', None)
            r = requests.post(url, json=payload, headers=headers, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f'Transcription {r.status_code}: {r.text[:300]}')
        cands = r.json().get('candidates') or []
        if not cands:
            return ''
        parts = cands[0].get('content', {}).get('parts', [])
        text = ''.join(p.get('text', '') for p in parts if not p.get('thought')).strip()
        text = text.strip('"“” ').strip()
        # "...", "[silencio]", "(no speech)" → nothing was said
        if re.fullmatch(r'\W*', text) or re.fullmatch(
                r'[\[(]\s*(silenc\w*|no speech|sin voz|inaudible|music|música|ruido|noise)\s*[\])]\.?', text, flags=re.I):
            text = ''
        logger.info(f'STT: {model} ok chars={len(text)}')
        return text

    # ── TTS ───────────────────────────────────────────────────────────────────
    def synthesize(self, text: str, language: str = 'es', voice: str = '', speed: float = 1.0) -> dict:
        """Returns {'audio': mp3 bytes, 'engine': str, 'chars': int, 'language': str}."""
        if not TTS_MODEL:
            raise RuntimeError('TTS_MODEL is not configured')
        clean = markdown_to_speech(text)[:TTS_MAX_CHARS]
        if not clean:
            raise ValueError('Nothing to read')
        voice = voice if voice in ALLOWED_VOICES else DEFAULT_VOICE
        speed = min(1.5, max(0.7, float(speed or 1.0)))
        lang = detect_language(clean, fallback=language if language in TTS_LANGUAGES else 'es')
        chunks = _chunk_text(clean, TTS_CHUNK_CHARS)

        style = TTS_STYLE.get(lang, TTS_STYLE['en'])
        pcm = b''.join(self._pool.map(lambda c: self._model_tts(style + c, voice), chunks))
        if speed != 1.0:
            pcm = _ffmpeg(['-f', 's16le', '-ar', str(TTS_SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
                           '-filter:a', f'atempo={speed}', '-f', 's16le', 'pipe:1'], pcm)
        return {'audio': _pcm_to_mp3(pcm), 'engine': TTS_MODEL, 'chars': len(clean), 'language': lang}

    def _model_tts(self, text: str, voice: str) -> bytes:
        url, headers = _model_request(TTS_MODEL, 'generateContent')
        config = {'responseModalities': ['AUDIO']}
        if voice:
            config['speechConfig'] = {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}
        payload = {'contents': [{'role': 'user', 'parts': [{'text': text}]}], 'generationConfig': config}
        r = requests.post(url, json=payload, headers=headers, timeout=120)
        if r.status_code != 200:
            raise RuntimeError(f'TTS {r.status_code}: {r.text[:300]}')
        cands = r.json().get('candidates') or []
        for p in (cands[0].get('content', {}).get('parts', []) if cands else []):
            inline = p.get('inlineData') or p.get('inline_data')
            if inline and inline.get('data'):
                mime = (inline.get('mimeType') or inline.get('mime_type') or '').lower()
                raw = base64.b64decode(inline['data'])
                m = re.search(r'rate=(\d+)', mime)
                rate = int(m.group(1)) if m else TTS_SAMPLE_RATE
                if rate != TTS_SAMPLE_RATE:
                    raw = _ffmpeg(['-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', 'pipe:0',
                                   '-ar', str(TTS_SAMPLE_RATE), '-f', 's16le', 'pipe:1'], raw)
                return raw
        raise RuntimeError('TTS returned no audio')


_speech_service = None
_speech_lock = threading.Lock()


def get_speech_service() -> SpeechService:
    global _speech_service
    with _speech_lock:
        if _speech_service is None:
            _speech_service = SpeechService()
        return _speech_service
