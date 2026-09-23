import logging
import time
import json
import base64
import threading
from flask import send_from_directory, Flask, request, jsonify, session, g, make_response
# CORS handled manually via after_request + provide_automatic_options
from datetime import datetime, timedelta
import os
import re
from dotenv import load_dotenv

from auth import auth_bp, login_required, get_secret_key
from ai_service import get_ai_service
from speech_service import get_speech_service
from skills_library import build_skills_context, MAX_SKILL_CHARS, MAX_SKILLS
from database import db, init_db
from legal_api import legal_bp, register_account_routes, require_withdrawal_waiver
from code_service import CodeAIService

# Load .env from the same directory as this file, regardless of cwd
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Last time we pruned stale usage rows (once/hour)
_last_usage_prune = 0.0

# Configure logging â always INFO so we can diagnose production issues
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('deiza')

_MIME_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/bmp': '.bmp', 'image/heic': '.heic',
}


_VIDEO_NOUNS = re.compile(r'(?i)\b(v[ií]deo|videoclip|clip|reel|reels|short|shorts|animaci[oó]n|anima|tiktok|stories?)\b')
_VIDEO_VERBS = re.compile(r'(?i)\b(genera|generar|generame|crea|crear|creame|haz|hazme|hacer|monta|montame|produce|'
                          r'anima|animar|graba|render(iza)?|make|create|generate|produce|animate)\b')
_VIDEO_NEGATIVE = re.compile(r'(?i)\b(resume|resumen|transcribe|transcripci[oó]n|analiza|explica|qu[eé] dice|'
                             r'descarga|download|busca|buscar|enlace|link|url|youtube|subt[ií]tulos?)\b')
_VIDEO_VERTICAL = re.compile(r'(?i)\b(vertical|reel|reels|tiktok|stories?|short|shorts|9:16)\b')


def _detect_video_intent(message: str) -> bool:
    """"hazme un video de X", "genera un reel..." -> True. Talking ABOUT a video is not."""
    m = message or ''
    if len(m) > 600 or not _VIDEO_NOUNS.search(m) or not _VIDEO_VERBS.search(m):
        return False
    if _VIDEO_NEGATIVE.search(m):
        return False
    return True


def _compile_pptx_artifact(art):
    """Safety net: a ```artifact block of type pptx that still carries `content` (a JSON plan or slide
    HTML the model wrote inline instead of going through the deck pipeline) is compiled into a real
    .pptx here, so the chat never shows a PowerPoint as a blob of text."""
    if not isinstance(art, dict) or (art.get('type') or '').lower() != 'pptx' or art.get('url'):
        return art
    content = art.get('content')
    if not content:
        return art
    try:
        import doc_render as _dr
        plan = None
        if isinstance(content, dict):
            plan = content
        elif isinstance(content, str) and content.lstrip().startswith('{'):
            try:
                plan = json.loads(content)
            except Exception:
                plan = None
        if isinstance(plan, dict) and plan.get('slides'):
            from ai_service import _search_image_urls, _fetch_img_bytes
            fid = _dr.build_pptx(plan, search_image_urls=_search_image_urls, fetch_img_bytes=_fetch_img_bytes)
        elif isinstance(content, str) and '<section' in content.lower():
            fid = _dr.build_pptx_from_html(content, title=(art.get('title') or None))
        else:
            return art
        out = _pptx_artifact('/api/files/' + fid)
        if art.get('name') and art['name'].lower().endswith('.pptx'):
            out['name'] = art['name']
        return out
    except Exception as e:
        logger.warning(f'inline pptx artifact could not be compiled: {e}')
        return art


def _pptx_artifact(url: str) -> dict:
    """Artifact spec for a compiled deck: download URL + per-slide PNG previews + plan title."""
    art = {'name': url.split('/')[-1], 'type': 'pptx', 'url': url}
    try:
        import doc_render as _dr
        art['slides'] = _dr.load_pptx_previews(url)
        plan = _dr.load_pptx_plan(url) or {}
        if plan.get('title'):
            art['title'] = plan['title'][:120]
            art['name'] = (re.sub(r'[^\w\- ]+', '', plan['title'])[:60].strip() or 'presentacion') + '.pptx'
        if plan.get('theme'):
            art['theme'] = plan['theme']
        _pp = _dr.deck_pdf_path(url)   # deiza_mapper integration: landscape PDF twin of the deck
        if _pp:
            art['pdf_url'] = '/api/files/' + os.path.basename(_pp)
    except Exception:
        pass
    return art


def _artifact_delivery_message(art_type: str, language: str = 'es') -> str:
    """Polite delivery message when an artifact is generated with little or no prose."""
    lang_es = (language or 'es').startswith('es')
    t = (art_type or '').lower()
    if t in ('pptx', 'presentation'):
        return 'Aquí tienes la presentación de diapositivas lista para descargar y editar.' if lang_es else 'Here is your presentation ready to download and edit.'
    if t == 'pdf':
        return 'Aquí tienes el documento PDF generado con el diseño solicitado.' if lang_es else 'Here is your generated PDF document.'
    if t in ('docx', 'word'):
        return 'Aquí tienes el documento Word generado con formato y fórmulas.' if lang_es else 'Here is your generated Word document.'
    if t in ('zip', 'bundle'):
        return 'Aquí tienes el proyecto completo empaquetado y listo para descargar.' if lang_es else 'Here is your complete project bundle ready to download.'
    return 'Aquí tienes el entregable generado listo para descargar.' if lang_es else 'Here is your generated deliverable.'


AI_CONTENT_MARK = 'AI-generated content. Generated with Deiza (deiza.org). Marked under Article 50(2) of Regulation (EU) 2024/1689.'


def _mark_ai_image(data: bytes, mime_type: str):
    """Machine-readable provenance mark for generated images (AI Act art. 50.2):
    a PNG tEXt/iTXt block or a JPEG EXIF UserComment. Returns (bytes, mime)."""
    try:
        from PIL import Image as _PIL, PngImagePlugin as _Png
        import io as _io
        im = _PIL.open(_io.BytesIO(data)); im.load()
        out = _io.BytesIO()
        if (im.format or '').upper() == 'JPEG' or mime_type == 'image/jpeg':
            exif = im.getexif()
            exif[0x9286] = AI_CONTENT_MARK            # UserComment
            exif[0x010E] = 'AI-generated (Deiza)'      # ImageDescription
            exif[0x0131] = 'Deiza AI'                  # Software
            im.convert('RGB').save(out, format='JPEG', quality=92, exif=exif.tobytes())
            return out.getvalue(), 'image/jpeg'
        info = _Png.PngInfo()
        info.add_text('Comment', AI_CONTENT_MARK)
        info.add_text('Software', 'Deiza AI')
        info.add_itxt('AIGeneratedContent', 'true')
        im.save(out, format='PNG', pnginfo=info, optimize=True)
        return out.getvalue(), 'image/png'
    except Exception as _me:
        logger.debug(f'AI mark skipped: {_me}')
        return data, mime_type


def _mark_ai_video(path: str):
    """Same mark for generated clips: mp4 comment/description tags via ffmpeg (stream copy)."""
    import subprocess as _sp, shutil as _sh
    tmp = path + '.marked.mp4'
    try:
        _sp.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-c', 'copy', '-movflags', '+faststart',
                 '-metadata', f'comment={AI_CONTENT_MARK}', '-metadata', 'description=AI-generated (Deiza)',
                 '-metadata', 'encoder=Deiza AI', tmp], check=True, timeout=120)
        _sh.move(tmp, path)
    except Exception as _me:
        logger.debug(f'AI video mark skipped: {_me}')
        try:
            os.remove(tmp)
        except Exception:
            pass


def _persist_chat_image(raw_bytes: str, mime_type: str, filename: str, generated: bool = False) -> str:
    """Save a base64 image payload to disk and return its /api/files/<fid> URL.
    `generated=True` (DZ-Image / Design output, never user uploads) embeds the AI-content mark."""
    try:
        import base64 as _b64
        import uuid as _uuid
        data = _b64.b64decode(raw_bytes)
        if not data or len(data) > 12 * 1024 * 1024:
            return ''
        if generated:
            data, mime_type = _mark_ai_image(data, mime_type)
    except Exception:
        return ''
    ext = _MIME_EXT.get(mime_type or '', '') or os.path.splitext(filename or '')[1].lower()
    if not ext or len(ext) > 8:
        ext = '.png'
    fid = _uuid.uuid4().hex + ext
    updir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')
    try:
        os.makedirs(updir, exist_ok=True)
        with open(os.path.join(updir, fid), 'wb') as fh:
            fh.write(data)
    except Exception:
        return ''
    return '/api/files/' + fid

app = Flask(__name__)
app.secret_key = get_secret_key()
app.url_map.strict_slashes = False

# Session config
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_DOMAIN'] = '.deiza.org'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Database config
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///deiza.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
_is_sqlite = app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite')
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    # SQLite under gunicorn threads: wait for locks instead of failing with
    # "database is locked" when several users write at once.
    **({'connect_args': {'timeout': 20, 'check_same_thread': False}} if _is_sqlite else {}),
}

# Max upload size: 10MB
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# CORS â allow all localhost ports in dev + configured production URL
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')

# Build origins list â include common local dev ports + production URL
_allowed_origins = [
    'capacitor://localhost',   # iOS app (Capacitor)
    'ionic://localhost',
    'http://localhost',        # Android app (Capacitor)
]
if os.getenv('FLASK_ENV', 'development') != 'production':
    _allowed_origins += [
        'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080', 'http://localhost:8081',
        'http://127.0.0.1:5173', 'http://127.0.0.1:8080',
    ]
if frontend_url and frontend_url not in _allowed_origins:
    _allowed_origins.append(frontend_url)
# Also allow www subdomain
if frontend_url and frontend_url.startswith('https://'):
    www_url = frontend_url.replace('https://', 'https://www.')
    if www_url not in _allowed_origins:
        _allowed_origins.append(www_url)

def _add_cors(resp):
    origin = request.headers.get('Origin', '')
    if origin in _allowed_origins:
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With,X-Auth-Token'
        resp.headers['Access-Control-Max-Age'] = '86400'
        resp.headers['Vary'] = 'Origin'
    return resp

@app.before_request
def handle_preflight():
    """Handle OPTIONS preflight before Flask routing kicks in."""
    if request.method == 'OPTIONS':
        from flask import send_from_directory, make_response
        resp = make_response('', 204)
        return _add_cors(resp)

@app.after_request
def apply_cors(response):
    return _add_cors(response)

# Initialize database
db.init_app(app)

if _is_sqlite:
    # WAL lets readers and one writer overlap (many concurrent chats), and a
    # busy timeout makes short lock waits transparent instead of exceptions.
    from sqlalchemy import event as _sa_event
    from sqlalchemy.engine import Engine as _SAEngine

    @_sa_event.listens_for(_SAEngine, 'connect')
    def _sqlite_pragmas(dbapi_conn, _rec):
        try:
            cur = dbapi_conn.cursor()
            cur.execute('PRAGMA journal_mode=WAL')
            cur.execute('PRAGMA synchronous=NORMAL')
            cur.execute('PRAGMA busy_timeout=20000')
            cur.execute('PRAGMA temp_store=MEMORY')
            cur.close()
        except Exception:
            pass
with app.app_context():
    init_db()

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(legal_bp, url_prefix='/api/legal')
register_account_routes(app)

# Initialize AI service
ai_service = get_ai_service()

# Rate limiting â Redis when available, in-memory fallback
_rate_limits: dict = {}
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 30  # requests per window

# Try to connect to Redis (graceful fallback if not available)
_redis_client = None
try:
    import redis as _redis_lib
    _rc = _redis_lib.Redis(host=os.getenv('REDIS_HOST', 'redis'), port=int(os.getenv('REDIS_PORT', 6379)), db=0, socket_connect_timeout=2)
    _rc.ping()
    _redis_client = _rc
    logger.info('Redis rate limiter connected')
except Exception as _redis_err:
    logger.info(f'Redis not available ({_redis_err}), using in-memory rate limiting')


def check_rate_limit(user_id: int) -> bool:
    now = time.time()
    key = f'rl:{user_id}'
    if _redis_client:
        try:
            pipe = _redis_client.pipeline()
            pipe.zadd(key, {str(now): now})
            pipe.zremrangebyscore(key, 0, now - RATE_LIMIT_WINDOW)
            pipe.zcard(key)
            pipe.expire(key, RATE_LIMIT_WINDOW + 10)
            results = pipe.execute()
            count = results[2]
            return count <= RATE_LIMIT_MAX
        except Exception as _re:
            logger.warning(f'Redis rate limit error: {_re}')
            # Fall through to in-memory
    str_key = str(user_id)
    if str_key not in _rate_limits:
        _rate_limits[str_key] = []
    _rate_limits[str_key] = [t for t in _rate_limits[str_key] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[str_key]) >= RATE_LIMIT_MAX:
        return False
    _rate_limits[str_key].append(now)
    return True




@app.before_request
def before_request():
    g.start_time = time.time()
    # Opportunistic cleanup: prune stale usage rows at most once an hour
    global _last_usage_prune
    if not _last_usage_prune or (time.time() - _last_usage_prune) > 3600:
        try:
            from models import prune_usage_windows
            prune_usage_windows()
        except Exception:
            pass
        _last_usage_prune = time.time()


@app.after_request
def after_request(response):
    if hasattr(g, 'start_time'):
        duration = (time.time() - g.start_time) * 1000
        if duration > 500:
            logger.warning(f'Slow request: {request.method} {request.path} took {duration:.0f}ms')
    # Security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


def _admin_ok() -> bool:
    """Constant-time check of the X-Admin-Secret header."""
    import hmac as _hm
    secret = os.environ.get('ADMIN_SECRET', '')
    given = request.headers.get('X-Admin-Secret', '')
    return bool(secret) and _hm.compare_digest(given, secret)


_MODEL_ALIASES = {'gas': 'fast', 'liquid': 'pro', 'solid': 'ultra', 'vainilla': 'vainilla'}


def _normalize_model(m):
    """Map UI tier names (gas/liquid/solid) to internal keys (fast/pro/ultra)."""
    m = _MODEL_ALIASES.get(m, m)
    return m if m in ('fast', 'pro', 'ultra', 'vainilla') else 'fast'


def _get_user_skills(user_id):
    """Get/create the skills row for a user."""
    from models import UserSkills
    row = UserSkills.query.filter_by(user_id=user_id).first()
    if not row:
        row = UserSkills(user_id=user_id)
        row.set_data({'custom': []})
        db.session.add(row)
        db.session.commit()
    return row


def _build_skills_context(user_id, language: str) -> str:
    try:
        row = _get_user_skills(user_id)
        d = row.get_data()
        return build_skills_context(d.get('custom') or [], language)
    except Exception as _se:
        logger.warning(f'skills context skipped: {_se}')
        return ''


def _build_memory_context(user_obj) -> str:
    """Return a compact memory block for the system prompt, or '' if none/disabled."""
    try:
        from models import UserMemory
        mem = UserMemory.query.filter_by(user_id=user_obj.id).first()
        if not mem or not mem.enabled:
            return ''
        items = mem.get_items()
        if not items:
            return ''
        facts = '\n'.join(f'- {it.get("text", "")}' for it in items[:20] if it.get("text"))
        return ('# MEMORIA DEL USUARIO (contexto entre chats — usa esto cuando sea relevante, '
                'pero no lo menciones si no aporta)\n' + facts)
    except Exception:
        return ''


def _get_user_memory_block(user_id) -> tuple:
    """Get/create the memory row for a user. Returns (memory, is_new)."""
    from models import UserMemory
    mem = UserMemory.query.filter_by(user_id=user_id).first()
    if not mem:
        mem = UserMemory(user_id=user_id, items='[]', enabled=True)
        db.session.add(mem)
        db.session.commit()
    return mem


@app.route('/api/chat/demo', methods=['POST'])
def demo_chat():
    """Public demo endpoint â no auth, fast model only, stateless (history in-browser)"""
    data = request.json or {}
    message = data.get('message', '').strip()
    files = data.get('files', [])
    history_raw = data.get('history', [])
    language = data.get('language', 'en')

    if not message:
        return jsonify({'error': 'Message is required'}), 400
    if len(message) > 4000:
        return jsonify({'error': 'Message too long'}), 400

    class _Msg:
        def __init__(self, role, content):
            self.role = role
            self.content = content

    history = [_Msg(m['role'], m['content']) for m in history_raw if 'role' in m and 'content' in m]

    try:
        ai_response = ai_service.send_message(
            message=message, history=history, model='fast', files=files, language=language,
        )
        return jsonify({
            'success': True,
            'message': {
                'id': int(time.time() * 1000),
                'role': 'assistant',
                'content': ai_response['content'],
                'artifact': ai_response.get('artifact'),
            },
        })
    except Exception as e:
        logger.error(f'Demo chat error: {e}', exc_info=True)
        return jsonify({'error': 'AI service unavailable. Please try again.'}), 500


@app.route('/api/chat/demo/stream', methods=['POST'])
def demo_chat_stream():
    """Streaming demo endpoint â SSE, no auth"""
    from flask import send_from_directory, Response, stream_with_context
    data = request.json or {}
    message = data.get('message', '').strip()
    history_raw = data.get('history', [])
    language = data.get('language', 'en')
    files_data = data.get('files', [])
    model = _normalize_model(data.get('model', 'liquid'))

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    class _Msg:
        def __init__(self, role, content):
            self.role = role
            self.content = content

    history = [_Msg(m['role'], m['content']) for m in history_raw if 'role' in m and 'content' in m]

    def generate():

        # Demo: image requests -> friendly upsell (image generation is for registered users)
        try:
            if ai_service.detect_image_intent(message, False):
                _up = ('La generacion y edicion de imagenes con DZ-Image es para usuarios registrados. '
                       'Crea tu cuenta gratis y tendras ~3 imagenes cada 4 horas (y muchas mas con los planes de pago). '
                       '[Registrate gratis](/login)')
                yield f"data: {json.dumps({'chunk': _up})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
                return
        except Exception:
            pass
        full_content = ''
        _tokens_recorded = False
        _stream_pptx = None
        try:
            for chunk in ai_service.stream_message(message=message, history=history, model=model, language=language, files=files_data):
                if chunk.startswith('\x00THINKING:') and chunk.endswith('\x00'):
                    continue
                elif chunk.startswith('\x00PPTX:') and chunk.endswith('\x00'):
                    _pptx_url = chunk[len('\x00PPTX:'):-1].strip()
                    if _pptx_url.startswith('/api/files/'):
                        _stream_pptx = _pptx_artifact(_pptx_url)
                    continue
                elif chunk.startswith('\x00SOURCES:') and chunk.endswith('\x00'):
                    try:
                        import json as _js
                        _src_raw = chunk[len('\x00SOURCES:'):-1]
                        _src_end = _src_raw.rfind(']')
                        if _src_end >= 0: _src_raw = _src_raw[:_src_end+1]
                        _sources = _js.loads(_src_raw)
                        if isinstance(_sources, list):
                            yield f"data: {json.dumps({'sources': _sources})}\n\n"
                    except Exception:
                        pass
                elif chunk.startswith('\x00IMAGES:') and chunk.endswith('\x00'):
                    try:
                        import json as _js2
                        _img_raw = chunk[len('\x00IMAGES:'):-1]
                        _img_end = _img_raw.rfind(']')
                        if _img_end >= 0: _img_raw = _img_raw[:_img_end+1]
                        _images = _js2.loads(_img_raw)
                        if isinstance(_images, list) and _images:
                            yield f"data: {json.dumps({'images': _images})}\n\n"
                    except Exception:
                        pass
                else:
                    full_content += chunk
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            import re as _re_demo_pptx
            full_content = _re_demo_pptx.sub(r'\x00PPTX:[^\x00]*\x00', '', full_content).strip()
            artifact = _stream_pptx if _stream_pptx else (ai_service._extract_artifact(full_content) or ai_service._extract_code_block(full_content))
            artifact = _compile_pptx_artifact(artifact)
            if not full_content.strip():
                if artifact:
                    full_content = _artifact_delivery_message(artifact.get('type'), language)
                else:
                    full_content = ('No he podido generar la respuesta esta vez. '
                                    'Vuelve a intentarlo, suele funcionar al reintentar.')
                yield f"data: {json.dumps({'chunk': full_content})}\n\n"
            yield f"data: {json.dumps({'done': True, 'artifact': artifact})}\n\n"
        except Exception as e:
            logger.error(f'Demo stream error: {e}', exc_info=True)
            _err_msg = 'Deiza no está disponible en este momento. Inténtalo de nuevo.'
            yield f"data: {json.dumps({'error': _err_msg})}\n\n"

    # CORS headers must be set directly on streaming responses
    origin = request.headers.get('Origin', '')
    cors_headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Content-Type': 'text/event-stream',
    }
    if origin in _allowed_origins:
        cors_headers['Access-Control-Allow-Origin'] = origin
        cors_headers['Access-Control-Allow-Credentials'] = 'true'
        cors_headers['Vary'] = 'Origin'

    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers=cors_headers)


@app.route('/api/chat/stream', methods=['POST'])
@login_required
def send_message_stream():
    """Streaming chat endpoint â SSE, requires auth"""
    from flask import send_from_directory, Response, stream_with_context
    user_id = session.get('user_id')
    data = request.json or {}
    message = data.get('message', '').strip()
    chat_id = data.get('chat_id')
    model = _normalize_model(data.get('model', 'liquid'))
    language = data.get('language', 'en')
    files_data = data.get('files', [])
    mode = data.get('mode', 'chat')
    agent_type = data.get('agent_type', 'coder')
    # Model variant (e.g. 'liquid45' = Liquid 4.5) and "respaldo por cadena" toggle
    model_variant = (data.get('model_variant') or '').strip()[:24] or None
    chain_fallback = data.get('chain_fallback', True) is not False
    custom_instructions = (data.get('custom_instructions') or '').strip()[:2000] or None
    # Agent mode always uses at least pro
    if mode == 'agent' and model == 'fast':
        model = 'pro'

    if not message:
        return jsonify({'error': 'Message is required'}), 400
    if len(message) > 32000:
        return jsonify({'error': 'Message too long'}), 400
    if not check_rate_limit(user_id):
        return jsonify({'error': 'Rate limit exceeded. Please wait a moment.'}), 429

    if model not in ('fast', 'pro', 'ultra', 'vainilla'):
        model = 'pro' if mode == 'agent' else 'fast'

    # Plan + sub-limit check before setting up stream
    from models import User as UserModel
    user_obj = UserModel.query.get(user_id)
    if user_obj:
        can_use, reason = user_obj.can_use_model_with_sublimit(model)
        usage = user_obj.get_current_usage()
        if not can_use:
            if reason == 'model_sublimit':
                return jsonify({'error': 'model_sublimit', 'model': model, 'plan': user_obj.get_plan(), 'usage': usage}), 429
            return jsonify({'error': 'plan_required', 'model': model, 'plan': user_obj.get_plan()}), 403
        if usage['exhausted'] and model != 'vainilla':
            return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    try:
        from models import Chat, Message as DBMessage
        if chat_id:
            chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
            if not chat:
                _pid = data.get('project_id')
                if _pid:
                    from models import Project as _Proj
                    _p = _Proj.query.filter_by(id=_pid, user_id=user_id).first()
                    _pid = _p.id if _p else None
                chat = Chat(user_id=user_id, title=message[:80], project_id=_pid)
                db.session.add(chat)
                db.session.commit()
        else:
            _pid = data.get('project_id')
            if _pid:
                from models import Project as _Proj
                _p = _Proj.query.filter_by(id=_pid, user_id=user_id).first()
                _pid = _p.id if _p else None
            chat = Chat(user_id=user_id, title=message[:80], project_id=_pid)
            db.session.add(chat)
            db.session.commit()

        # Build lightweight attachment metadata for persistence
        attachments_to_save = []
        for f in files_data:
            att = {
                'name': f.get('name', 'file'),
                'mime_type': f.get('mime_type', ''),
                'is_image': bool(f.get('is_image') or (f.get('mime_type') or '').startswith('image/')),
            }
            raw = f.get('raw_bytes', '')
            if att['is_image'] and raw:
                url = _persist_chat_image(raw, f.get('mime_type', ''), f.get('name', ''))
                if url:
                    att['url'] = url
                    f['url'] = url  # the model gets this URL to embed the photo in deliverables
                elif len(raw) < 2 * 1024 * 1024:
                    att['raw_bytes'] = raw
            attachments_to_save.append(att)

        user_message = DBMessage(chat_id=chat.id, role='user', content=message)
        if attachments_to_save:
            user_message.attachments_data = attachments_to_save
        db.session.add(user_message)
        db.session.commit()

        history = DBMessage.query.filter_by(chat_id=chat.id).order_by(DBMessage.created_at).all()
        new_chat_id = chat.id
        if _redis_client:
            try:
                _init_gen_key = f'deiza:gen:{new_chat_id}'
                _init_payload = {
                    'status': 'generating', 'chat_id': new_chat_id, 'ts': time.time(),
                    'content': '', 'thinking': 'Pensando...' if language == 'es' else 'Thinking...',
                    'sources': [], 'images': [],
                }
                _redis_client.setex(_init_gen_key, 3600, json.dumps(_init_payload))
            except Exception:
                pass
        chat_project_id = chat.project_id

    except Exception as e:
        logger.error(f'Stream setup error: {e}', exc_info=True)
        db.session.rollback()
        return jsonify({'error': 'Failed to setup stream'}), 500

    # Project context: instructions + extracted file contents (context stuffing —
    # long-context models handle whole files with precision)
    project_context = None
    if chat_project_id:
        try:
            from models import Project as _ProjCtx
            _proj = _ProjCtx.query.filter_by(id=chat_project_id, user_id=user_id).first()
            if _proj:
                _parts = []
                if (_proj.instructions or '').strip():
                    _parts.append('## Instrucciones del proyecto (definidas por el usuario, siguelas con maxima prioridad):\n'
                                  + _proj.instructions.strip())
                _total, _MAX_TOTAL, _MAX_FILE = 0, 200000, 60000
                for _pf in _proj.files:
                    if _pf.is_image:
                        continue
                    _txt = (_pf.content or '')[:_MAX_FILE]
                    if not _txt.strip() or _total + len(_txt) > _MAX_TOTAL:
                        continue
                    _total += len(_txt)
                    _parts.append(f'### Archivo del proyecto: {_pf.name}\n```\n{_txt}\n```')
                if _parts:
                    project_context = ('# CONTEXTO DEL PROYECTO: ' + _proj.name + '\n'
                                       'El usuario trabaja dentro de este proyecto. Usa estos recursos como '
                                       'fuente de verdad y cita su contenido con precision cuando sea relevante.\n\n'
                                       + '\n\n'.join(_parts))
        except Exception as _pe:
            logger.warning(f'Project context build failed: {_pe}')

    # Video generation intent (formerly Deiza Design): keyword-only, checked first
    wants_video = False
    if mode == 'chat':
        try:
            wants_video = _detect_video_intent(message)
        except Exception:
            wants_video = False

    # Image generation intent: cheap keyword prefilter + tiny LLM check
    wants_image = False
    if mode == 'chat' and not wants_video:
        try:
            _has_img = any(f.get('is_image') or (f.get('mime_type', '') or '').startswith('image/') for f in files_data)
            wants_image = ai_service.detect_image_intent(message, _has_img)
        except Exception:
            wants_image = False

    _mem_extract = bool(data.get('memory_extract'))
    _stream_memory_ctx = '' if _mem_extract else _build_memory_context(user_obj)
    _skills_ctx = _build_skills_context(user_id, language)

    def generate():
        full_content = ''
        _tokens_recorded = False
        _stream_sources = []
        _stream_images = []
        _stream_pptx = None
        _stream_thinking = ('Pensando...' if language == 'es' else 'Thinking...')
        client_gone = False
        _completed_normally = False

        # keepalive pump v1: the AI generator runs in a helper thread and hands chunks over a
        # queue, so this generator can emit ": ping" while the model is silent (deck authoring,
        # PDF render, slow research) instead of letting the connection look dead.
        import threading as _thr
        import queue as _q
        _PING_EVERY = 12.0
        _pq = _q.Queue()
        _pstop = _thr.Event()
        _pump_started = False

        def _pump_start(_g):
            nonlocal _pump_started
            if _pump_started:
                return
            _pump_started = True

            def _run():
                with app.app_context():
                    try:
                        for _it in _g:
                            _pq.put(('item', _it))
                            if _pstop.is_set():
                                break
                        _pq.put(('end', None))
                    except BaseException as _pe:
                        _pq.put(('exc', _pe))
                    finally:
                        try:
                            _g.close()
                        except Exception:
                            pass
            _thr.Thread(target=_run, daemon=True, name=f'deiza-stream-{new_chat_id}').start()

        def _pump_next(timeout=None):
            """('item', chunk) | ('ping', None) | ('end', None); re-raises the generator's error."""
            try:
                _kind, _val = _pq.get(timeout=timeout)
            except _q.Empty:
                return ('ping', None)
            if _kind == 'exc':
                raise _val
            return (_kind, _val)

        def _pump_stop():
            _pstop.set()

        def _run_with_pings(_box, _fn, *_a, **_kw):
            """Run a blocking call in a thread, yielding pings meanwhile; returns its result.
            `_box` (caller-owned) exposes the thread and result if the client disconnects."""

            def _w():
                try:
                    _box['r'] = _fn(*_a, **_kw)
                except BaseException as _e:
                    _box['e'] = _e
            _t = _thr.Thread(target=_w, daemon=True)
            _box['thread'] = _t
            _t.start()
            while True:
                _t.join(_PING_EVERY)
                if not _t.is_alive():
                    break
                if _gen_key:
                    _gen_save()
                yield ': ping\n\n'
            if 'e' in _box:
                raise _box['e']
            return _box.get('r')

        _gen_key = f'deiza:gen:{new_chat_id}' if _redis_client else None

        def _gen_save(**extra):
            if not _gen_key:
                return
            try:
                _p = {
                    'status': 'generating', 'chat_id': new_chat_id, 'ts': time.time(),
                    'content': full_content[-120000:] if full_content else '',
                    'thinking': _stream_thinking if _stream_thinking else '',
                    'sources': _stream_sources or [], 'images': (_stream_images or [])[:4],
                }
                _p.update(extra)
                _redis_client.setex(_gen_key, 3600, json.dumps(_p))
            except Exception:
                pass

        def _gen_clear():
            if _gen_key:
                try:
                    _redis_client.delete(_gen_key)
                except Exception:
                    pass

        def _gen_cancelled():
            if not _gen_key:
                return False
            try:
                _v = _redis_client.get(_gen_key)
                return bool(_v) and (json.loads(_v) or {}).get('status') == 'cancelled'
            except Exception:
                return False

        def _strip_artifact_block(_text):
            # the prose around the block; the block's real end is found string-aware by the mapper
            from deiza_mapper.artifacts import strip_artifact_blocks
            return strip_artifact_blocks(_text)

        import re as _re_sse
        _sse = _re_sse.compile(r'\x00PPTX:[^\x00]*\x00')

        def _step(chunk):
            nonlocal full_content, _stream_thinking
            if chunk.startswith('\x00THINKING:') and chunk.endswith('\x00'):
                _stream_thinking = chunk[len('\x00THINKING:'):-1]
                return [{'thinking': _stream_thinking}]
            if chunk.startswith('\x00SOURCES:') and chunk.endswith('\x00'):
                try:
                    _src_raw = chunk[len('\x00SOURCES:'):-1]
                    _src_end = _src_raw.rfind(']')
                    if _src_end >= 0:
                        _src_raw = _src_raw[:_src_end + 1]
                    _sources = json.loads(_src_raw)
                    if isinstance(_sources, list):
                        _stream_sources[:] = _sources
                        return [{'sources': _sources}]
                except Exception as _se:
                    logger.debug(f'Sources parse error: {_se}')
                return []
            if chunk.startswith('\x00IMAGES:') and chunk.endswith('\x00'):
                try:
                    _img_raw = chunk[len('\x00IMAGES:'):-1]
                    _img_end = _img_raw.rfind(']')
                    if _img_end >= 0:
                        _img_raw = _img_raw[:_img_end + 1]
                    _images = json.loads(_img_raw)
                    if isinstance(_images, list) and _images:
                        _stream_images[:] = _images
                        return [{'images': _images}]
                except Exception as _ie:
                    logger.debug(f'Images parse error: {_ie}')
                return []
            if chunk.startswith('\x00PPTX:') and chunk.endswith('\x00'):
                nonlocal _stream_pptx
                _pptx_url = chunk[len('\x00PPTX:'):-1].strip()
                if _pptx_url.startswith('/api/files/'):
                    _stream_pptx = _pptx_artifact(_pptx_url)
                return []
            full_content += chunk
            return [{'chunk': chunk}]

        def _persist(partial=False, artifact=None):
            nonlocal _tokens_recorded, full_content
            from models import Message as _DBM, User as _DBU
            _raw_content_len = len(full_content)
            _text = _sse.sub('', full_content).strip()
            _artifact = _stream_pptx if _stream_pptx else (ai_service._extract_artifact(_text) or _tolerant_artifact(_text))
            if _artifact:
                _text = _strip_artifact_block(_text)
                # the connected path already compiled it (with keepalive pings); never compile twice
                _artifact = artifact if artifact else _compile_pptx_artifact(_artifact)
            else:
                _artifact = artifact if artifact else ai_service._extract_code_block(_text)
            if not _text.strip():
                if partial:
                    return None, None
                if _artifact:
                    _text = _artifact_delivery_message(_artifact.get('type'), language)
                else:
                    _text = ('No he podido generar la respuesta esta vez. '
                             'Vuelve a intentarlo, suele funcionar al reintentar.')
            _msg = _DBM(chat_id=new_chat_id, role='assistant', content=_text, artifact_data=_artifact)
            if _stream_sources or _stream_images:
                _msg.meta_data = {'sources': _stream_sources, 'images': _stream_images}
            db.session.add(_msg)
            try:
                from models import Chat as _ChatP
                _cp = _ChatP.query.get(new_chat_id)
                if _cp:
                    _cp.updated_at = datetime.utcnow()
            except Exception:
                pass
            _estimated_tokens = max(_raw_content_len // 4, 1)
            db.session.commit()
            _up = _DBU.query.get(user_id)
            if _up and not _mem_extract:
                _up.record_usage(_estimated_tokens, model)
            _tokens_recorded = True
            db.session.commit()
            return _msg.id, _artifact

        # ── Image generation path (DZ-Image) ──
        if wants_video:
            # Same engine as the former Deiza Design page, now inline: the job runs in a
            # background thread and we relay its progress as thinking steps.
            try:
                yield f"data: {json.dumps({'chat_id': new_chat_id})}\n\n"
                from models import Message as DBMessageVid, User as UserModelVid
                _uv = UserModelVid.query.get(user_id)
                _can, _reason = (_uv.can_use_model_with_sublimit('design') if _uv else (False, 'auth'))
                if not _can:
                    _txt = ('La generacion de video esta disponible en los planes de pago. Puedes verlos en Planes.'
                            if language == 'es' else 'Video generation is available on paid plans. See Plans.')
                    if _reason == 'model_sublimit':
                        _txt = ('Has alcanzado el limite de generacion de video de tu plan por ahora.'
                                if language == 'es' else 'You have reached your plan\'s video generation limit for now.')
                    vm = DBMessageVid(chat_id=new_chat_id, role='assistant', content=_txt)
                    db.session.add(vm); db.session.commit(); _gen_clear()
                    yield f"data: {json.dumps({'chunk': _txt})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'artifact': None, 'msg_id': vm.id})}\n\n"
                    return
                _aspect = '9:16' if _VIDEO_VERTICAL.search(message or '') else '16:9'
                _dur = 8
                _md = re.search(r'(\d{1,2})\s*(s|seg|segundos|sec|seconds)\b', message or '', re.I)
                if _md:
                    _dur = 4 if int(_md.group(1)) <= 4 else (6 if int(_md.group(1)) <= 6 else 8)
                _vfiles = [f for f in files_data if (f.get('mime_type') or '').startswith(('image/', 'video/')) and f.get('raw_bytes')]
                _spec = {'mode': 'video', 'scenes': [{'prompt': message, 'duration': _dur}],
                         'aspect_ratio': _aspect, 'files': _vfiles}
                _job = _start_design_video_job(user_id, _spec, language)
                _step1 = 'Haciendo un boceto del vídeo...' if language == 'es' else 'Creating video sketch...'
                try:
                    yield f"data: {json.dumps({'thinking': _step1})}\n\n"
                except GeneratorExit:
                    client_gone = True
                _stream_thinking = _step1
                _gen_save()
                time.sleep(0.8)

                _step2 = 'Generando vídeo con Deiza Motion...' if language == 'es' else 'Generating video with Deiza Motion...'
                if not client_gone:
                    try:
                        yield f"data: {json.dumps({'thinking': _step2})}\n\n"
                    except GeneratorExit:
                        client_gone = True
                _stream_thinking = _step2
                _gen_save()

                _t0 = time.time(); _job_data = None
                _step3_shown = False
                while time.time() - _t0 < 540:
                    if _gen_cancelled():
                        _gen_clear()
                        return
                    _job_data = _design_job_get(_job) or {}
                    if _job_data.get('status') in ('done', 'error'):
                        break
                    _el = int(time.time() - _t0)
                    if _el >= 20 and not _step3_shown:
                        _step3 = 'Renderizando y poniendo los últimos detalles...' if language == 'es' else 'Rendering and applying finishing touches...'
                        _step3_shown = True
                        _stream_thinking = _step3
                        _gen_save()
                        if not client_gone:
                            try:
                                yield f"data: {json.dumps({'thinking': _step3})}\n\n"
                            except GeneratorExit:
                                client_gone = True
                    elif _el and _el % 20 == 0 and not client_gone:
                        try:
                            yield f"data: {json.dumps({'thinking': _stream_thinking + f' {_el}s'})}\n\n"
                        except GeneratorExit:
                            client_gone = True
                    time.sleep(2)
                if not _job_data or _job_data.get('status') != 'done' or not _job_data.get('video_url'):
                    _detail = (_job_data or {}).get('detail') or (_job_data or {}).get('error') or ''
                    _txt = ('No he podido generar el video esta vez. Prueba a describir la escena de otra forma.'
                            if language == 'es' else 'I could not generate the video this time. Try describing the scene differently.')
                    if _detail:
                        _txt += f' ({str(_detail)[:120]})'
                    vm = DBMessageVid(chat_id=new_chat_id, role='assistant', content=_txt)
                    db.session.add(vm); db.session.commit(); _gen_clear()
                    yield f"data: {json.dumps({'chunk': _txt})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'artifact': None, 'msg_id': vm.id})}\n\n"
                    return
                _ts = int(datetime.utcnow().timestamp())
                _note = (_job_data.get('text') or '').strip() or ('Aqui tienes tu video.' if language == 'es' else 'Here is your video.')
                _vid_art = {'name': f'video_{_ts}.mp4', 'type': 'video', 'url': _job_data['video_url'],
                            'aspect': _aspect, 'duration': _job_data.get('duration')}
                vm = DBMessageVid(chat_id=new_chat_id, role='assistant', content=_note, artifact_data=_vid_art)
                db.session.add(vm)
                try:
                    from models import Chat as _ChatVid
                    _cv = _ChatVid.query.get(new_chat_id)
                    if _cv:
                        _cv.updated_at = datetime.utcnow()
                except Exception:
                    pass
                db.session.commit(); _gen_clear()
                yield f"data: {json.dumps({'chunk': _note})}\n\n"
                yield f"data: {json.dumps({'done': True, 'artifact': _vid_art, 'msg_id': vm.id})}\n\n"
            except GeneratorExit:
                _gen_clear()
            except Exception as _ve:
                logger.error(f'Video generation stream error: {_ve}', exc_info=True)
                _gen_clear()
                yield f"data: {json.dumps({'error': 'video_failed'})}\n\n"
            return

        if wants_image:
            try:
                yield f"data: {json.dumps({'chat_id': new_chat_id})}\n\n"
                _step1 = 'Haciendo un boceto...' if language == 'es' else 'Creating sketch...'
                try:
                    yield f"data: {json.dumps({'thinking': _step1})}\n\n"
                except GeneratorExit:
                    client_gone = True
                _stream_thinking = _step1
                _gen_save()
                time.sleep(0.4)
                _step2 = 'Generando imagen con Deiza Image...' if language == 'es' else 'Generating image with Deiza Image...'
                if not client_gone:
                    try:
                        yield f"data: {json.dumps({'thinking': _step2})}\n\n"
                    except GeneratorExit:
                        client_gone = True
                        client_gone = True
                _stream_thinking = _step2
                _gen_save()
                result = ai_service.generate_image(message, files_data, language)
                if result and result.get('data_url'):
                    _step3 = 'Poniendo los últimos detalles...' if language == 'es' else 'Applying finishing touches...'
                    if not client_gone:
                        try:
                            yield f"data: {json.dumps({'thinking': _step3})}\n\n"
                        except GeneratorExit:
                            client_gone = True
                            client_gone = True
                    _stream_thinking = _step3
                    _gen_save()
                    time.sleep(0.3)
                from models import Message as DBMessageImg, User as UserModelImg, IMAGE_RAW_COST
                if result and not result.get('data_url') and result.get('text'):
                    # The model answered with words (a clarifying question / refusal) — show them, no charge
                    _txt = result['text'].strip()
                    img_msg = DBMessageImg(chat_id=new_chat_id, role='assistant', content=_txt)
                    db.session.add(img_msg)
                    db.session.commit()
                    _gen_clear()
                    yield f"data: {json.dumps({'chunk': _txt})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'artifact': None, 'msg_id': img_msg.id})}\n\n"
                    return
                if not result:
                    _err = ('No he podido generar la imagen esta vez. Vuelve a intentarlo.'
                            if language == 'es' else 'I could not generate the image this time. Please try again.')
                    img_msg = DBMessageImg(chat_id=new_chat_id, role='assistant', content=_err)
                    db.session.add(img_msg)
                    db.session.commit()
                    _gen_clear()
                    yield f"data: {json.dumps({'chunk': _err})}\n\n"
                    yield f"data: {json.dumps({'done': True, 'artifact': None, 'msg_id': img_msg.id})}\n\n"
                    return
                _note = (result.get('text') or '').strip()
                if not _note:
                    _note = 'Aqui tienes tu imagen.' if language == 'es' else 'Here is your image.'
                _ts = int(datetime.utcnow().timestamp())
                # Store the image as a file and reference it by URL: base64 in the message row
                # made chat restores multi-megabyte and slow.
                _img_content = result['data_url']
                try:
                    _head, _b64 = result['data_url'].split(',', 1)
                    _img_mime = result.get('mime') or _head.replace('data:', '').split(';')[0] or 'image/png'
                    _img_url = _persist_chat_image(_b64, _img_mime, f'imagen_{_ts}.png', generated=True)
                    if _img_url:
                        _img_content = _img_url
                except Exception:
                    pass
                _img_artifact = {'name': f'imagen_{_ts}.png', 'type': 'image', 'content': _img_content}
                img_msg = DBMessageImg(chat_id=new_chat_id, role='assistant', content=_note, artifact_data=_img_artifact)
                db.session.add(img_msg)
                _u = UserModelImg.query.get(user_id)
                if _u:
                    _u.record_usage(IMAGE_RAW_COST, 'image')
                try:
                    from models import Chat as _ChatImg
                    _ci = _ChatImg.query.get(new_chat_id)
                    if _ci:
                        _ci.updated_at = datetime.utcnow()
                except Exception:
                    pass
                db.session.commit()
                _gen_clear()
                if not client_gone:
                    try:
                        yield f"data: {json.dumps({'chunk': _note})}\n\n"
                        yield f"data: {json.dumps({'done': True, 'artifact': _img_artifact, 'msg_id': img_msg.id})}\n\n"
                    except GeneratorExit:
                        client_gone = True
            except GeneratorExit:
                _gen_clear()
                pass
            except Exception as _ie:
                logger.error(f'Image generation stream error: {_ie}', exc_info=True)
                db.session.rollback()
                _gen_clear()
                _err = ('No he podido generar la imagen esta vez. Vuelve a intentarlo.'
                        if language == 'es' else 'I could not generate the image this time. Please try again.')
                yield f"data: {json.dumps({'error': _err})}\n\n"
            return

        try:
            yield f"data: {json.dumps({'chat_id': new_chat_id})}\n\n"
            _last_redis = time.time()
            _gen = ai_service.stream_message(message=message, history=history, model=model, language=language,
                                             files=files_data, mode=mode, agent_type=agent_type,
                                             project_context=project_context, memory_context=_stream_memory_ctx,
                                             variant=model_variant, fallback=chain_fallback,
                                             custom_instructions=custom_instructions,
                                             skills_context=_skills_ctx)
            _pump_start(_gen)
            if _gen_key:
                _gen_save()
            _gen_start = time.time()
            _last_content = time.time()
            _MAX_SILENCE = 90  # seconds without any content
            _MAX_TOTAL = 600   # 10 min max generation
            while True:
                _kind, _chunk = _pump_next(_PING_EVERY)
                if _kind == 'end':
                    break
                if _kind == 'ping':
                    if time.time() - _last_content > _MAX_SILENCE:
                        logger.warning(f'Generation watchdog: {_MAX_SILENCE}s silence, stopping: chat={new_chat_id}')
                        _pump_stop()
                        break
                    if time.time() - _gen_start > _MAX_TOTAL:
                        logger.warning(f'Generation watchdog: {_MAX_TOTAL}s total, stopping: chat={new_chat_id}')
                        _pump_stop()
                        break
                    # Nothing from the model for a while (deck authoring, PDF render, slow search):
                    # keep bytes flowing so browsers and proxies do not give the stream up for dead.
                    yield ': ping\n\n'
                    if _gen_key:
                        _gen_save()
                    continue
                if _kind == 'item':
                    _last_content = time.time()
                for _ev in _step(_chunk):
                    yield f"data: {json.dumps(_ev)}\n\n"
                if _gen_key and (time.time() - _last_redis) > 0.7:
                    _gen_save()
                    _last_redis = time.time()
            _completed_normally = True
        except GeneratorExit:
            # Client closed the connection (stop button / page close / device sleep) --
            # do NOT kill the task: keep consuming server-side and publish live progress
            # to Redis so any device can resume watching. The stop button now works via
            # POST /api/chats/<id>/cancel, which sets status=cancelled in Redis.
            client_gone = True
            logger.info(f'Client disconnected, continuing in background: chat={new_chat_id}')
        except Exception as e:
            import traceback as _tb, sys as _sys
            print(f'[STREAM ERROR] type={type(e).__name__} msg={str(e)[:400]}', file=_sys.stderr, flush=True)
            _tb.print_exc(file=_sys.stderr)
            _sys.stderr.flush()
            logger.error(f'Stream error: {e}', exc_info=True)
            _pump_stop()
            if full_content:
                try:
                    _persist(partial=True)
                except Exception:
                    db.session.rollback()
            else:
                try:
                    db.session.rollback()
                except Exception:
                    pass
            friendly = ('Deiza no esta disponible en este momento. Intentelo de nuevo en unos segundos.'
                        if language == 'es' else 'Deiza is temporarily unavailable. Please try again in a few seconds.')
            try:
                yield f"data: {json.dumps({'error': friendly})}\n\n"
            except GeneratorExit:
                client_gone = True
        finally:
            # Record tokens for aborted/cancelled streams (only while the client is still here).
            # Normal completions are charged once, in _persist() below.
            if not client_gone and not _completed_normally and not _tokens_recorded and full_content and not _mem_extract:
                _abort_tokens = max(len(full_content) // 4, 1)
                try:
                    from models import User as _AbortUser
                    _au = _AbortUser.query.get(user_id)
                    if _au:
                        _au.record_usage(_abort_tokens, model)
                        db.session.commit()
                    logger.info(f'Abort tokens: {_abort_tokens} for user {user_id}')
                except Exception as _fe:
                    logger.warning(f'Failed abort token record: {_fe}')

        # ── Background continuation (client disconnected) ──────────────────────────
        # The generator already received GeneratorExit, so NO yields are allowed here.
        if client_gone:
            _bg_error = None
            _last_redis = time.time()
            while True:
                if (time.time() - _last_redis) > 0.7:
                    _gen_save()
                    _last_redis = time.time()
                if _gen_cancelled():
                    logger.info(f'Generation cancelled by user: chat={new_chat_id}')
                    _pump_stop()
                    break
                if _bg_error is not None:
                    break
                try:
                    if not _pump_started:
                        _pump_start(_gen)
                    _kind, _chunk = _pump_next(2.0)
                    if _kind == 'end':
                        break
                    if _kind == 'ping':
                        continue
                except Exception as _ge:
                    _bg_error = _ge
                    logger.error(f'Background stream error chat={new_chat_id}: {_ge}', exc_info=True)
                    break
                try:
                    _step(_chunk)
                except GeneratorExit:
                    # Worker shutting down / stream fully torn down -- persist what we have
                    _bg_error = _bg_error or 'shutdown'
                    break
                except Exception as _ste:
                    _bg_error = _ste
                    logger.error(f'Background step error chat={new_chat_id}: {_ste}', exc_info=True)
                    break
            _gen_clear()
            try:
                if _bg_error or _gen_cancelled():
                    if full_content.strip():
                        from models import Message as _DBMGX
                        part_art = ai_service._extract_artifact(full_content) or _tolerant_artifact(full_content) or ai_service._extract_code_block(full_content)
                        gx_msg = _DBMGX(chat_id=new_chat_id, role='assistant', content=full_content, artifact_data=part_art)
                        db.session.add(gx_msg)
                        try:
                            from models import Chat as _ChatGX
                            _cgx = _ChatGX.query.get(new_chat_id)
                            if _cgx:
                                _cgx.updated_at = datetime.utcnow()
                        except Exception:
                            pass
                        db.session.commit()
                        _tokens_recorded = True
                        logger.info(f'Partial response saved on bg stop: chat={new_chat_id} len={len(full_content)}')
                    else:
                        db.session.rollback()
                else:
                    _msg_id, _art = _persist(partial=False)
                    logger.info(f'Background generation finished: chat={new_chat_id} msg={_msg_id} len={len(full_content)}')
            except Exception as _pe:
                logger.error(f'Background persist failed: {_pe}', exc_info=True)
                db.session.rollback()
            return

        # ── Connected path — stream finished normally, finalize and send `done` ──
        _candidate_art = _stream_pptx if _stream_pptx else (ai_service._extract_artifact(full_content) or _tolerant_artifact(full_content) or ai_service._extract_code_block(full_content))
        if _candidate_art:
            _cbox = {}
            try:
                _is_deck = (_candidate_art.get('type') == 'pptx' or str(_candidate_art.get('name', '')).endswith('.pptx'))
                _stream_thinking = (('Compilando presentación PowerPoint...' if language == 'es' else 'Compiling PowerPoint presentation...')
                                    if _is_deck else ('Compilando documento...' if language == 'es' else 'Compiling document...'))
                if _gen_key:
                    _gen_save()
                _candidate_art = yield from _run_with_pings(_cbox, _compile_pptx_artifact, _candidate_art)
            except GeneratorExit:
                # The client left while the deck was compiling: finish silently and persist,
                # the poller / next visit will show the message. No more yields allowed.
                client_gone = True
                try:
                    _cbox['thread'].join()
                except Exception:
                    pass
                if 'r' in _cbox:
                    _candidate_art = _cbox['r']
            except Exception as _cpe:
                logger.warning(f'pptx compile failed: {_cpe}')
        if not full_content.strip():
            if _candidate_art:
                full_content = _artifact_delivery_message(_candidate_art.get('type'), language)
            else:
                full_content = ('No he podido generar la respuesta esta vez. '
                                'Vuelve a intentarlo, suele funcionar al reintentar.')
            if not client_gone:
                yield f"data: {json.dumps({'chunk': full_content})}\n\n"
        _msg_id, _artifact = _persist(partial=False, artifact=_candidate_art)
        if client_gone:
            _gen_clear()
            logger.info(f'Persisted after client left during compile: chat={new_chat_id} msg={_msg_id}')
            return
        _gen_clear()
        _art_info = f"name={_artifact.get('name','?')} content_len={len(_artifact.get('content',''))}" if _artifact else 'NONE'
        logger.info(f'DONE event: artifact={_art_info} full_content_len={len(full_content)} tokens={max(len(full_content) // 4, 1)}')
        yield f"data: {json.dumps({'done': True, 'artifact': _artifact, 'msg_id': _msg_id})}\n\n"

    origin = request.headers.get('Origin', '')
    cors_headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Content-Type': 'text/event-stream',
    }
    if origin in _allowed_origins:
        cors_headers['Access-Control-Allow-Origin'] = origin
        cors_headers['Access-Control-Allow-Credentials'] = 'true'
        cors_headers['Vary'] = 'Origin'

    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers=cors_headers)


# ───────────────────── Background generation live status ─────────────────────
# When the client's SSE connection drops, generate() keeps running server-side
# (continues consuming the AI stream, persists the message at the end) and
# publishes live progress to Redis under `deiza:gen:{chat_id}`. These endpoints
# let any device resume watching ("cargando" + partial content) and let the
# stop button actually abort the background task.

_GEN_PREFIX = 'deiza:gen:'


def _gen_redis_payload(chat_id):
    if not _redis_client:
        return None
    try:
        _v = _redis_client.get(f'{_GEN_PREFIX}{chat_id}')
        if not _v:
            return None
        return json.loads(_v)
    except Exception as _gre:
        logger.debug(f'gen payload error: {_gre}')
        return None


@app.route('/api/chats/generations', methods=['GET'])
@login_required
def list_generations():
    """Chats of this user that have an in-flight background generation."""
    if not _redis_client:
        return jsonify({'generations': {}})
    user_id_s = session.get('user_id')
    try:
        from models import Chat as _GChat
        out = {}
        _keys = list(_redis_client.scan_iter(match=_GEN_PREFIX + '*', count=200))
        if not _keys:
            return jsonify({'generations': {}})
        _mine = set(cid for (cid,) in db.session.query(_GChat.id).filter_by(user_id=user_id_s).all())
        for _k in _keys:
            try:
                _cid = int(_k.split(':')[-1])
                if _cid not in _mine:
                    continue
                _p = _gen_redis_payload(_cid)
                if not _p or _p.get('status') != 'generating':
                    continue
                if time.time() - float(_p.get('ts', 0)) > 3600:
                    continue
                out[str(_cid)] = {
                    'status': 'generating',
                    'content': _p.get('content', ''),
                    'thinking': _p.get('thinking', ''),
                    'ts': _p.get('ts', 0),
                }
            except Exception:
                continue
        return jsonify({'generations': out})
    except Exception as _le:
        logger.warning(f'list_generations error: {_le}')
        return jsonify({'generations': {}})


@app.route('/api/chats/<int:chat_id>/gen', methods=['GET'])
@login_required
def get_generation(chat_id):
    """Live progress of a specific background generation (for polling)."""
    if not _redis_client:
        return jsonify({'status': 'none', 'error': 'none'}), 200
    from models import Chat as _G2
    if not _G2.query.filter_by(id=chat_id, user_id=session.get('user_id')).first():
        return jsonify({'error': 'not found'}), 404
    _p = _gen_redis_payload(chat_id)
    if not _p:
        return jsonify({'status': 'none', 'error': 'none'}), 200
    return jsonify({
        'chat_id': chat_id,
        'status': _p.get('status', 'generating'),
        'content': _p.get('content', ''),
        'thinking': _p.get('thinking', ''),
        'sources': _p.get('sources', []),
        'images': _p.get('images', []),
        'ts': _p.get('ts', 0),
    })


@app.route('/api/chats/<int:chat_id>/cancel', methods=['POST'])
@login_required
def cancel_generation(chat_id):
    """Abort an in-flight (possibly background) generation. The background loop
    checks this flag between chunks and stops, persisting a partial response."""
    if not _redis_client:
        return jsonify({'cancelled': False})
    from models import Chat as _G3
    if not _G3.query.filter_by(id=chat_id, user_id=session.get('user_id')).first():
        return jsonify({'error': 'not found'}), 404
    try:
        _v = _redis_client.get(f'{_GEN_PREFIX}{chat_id}')
        if not _v:
            return jsonify({'cancelled': False})
        _p = json.loads(_v)
        _p['status'] = 'cancelled'
        _redis_client.setex(f'{_GEN_PREFIX}{chat_id}', 120, json.dumps(_p))
        return jsonify({'cancelled': True})
    except Exception as _ce:
        logger.warning(f'cancel_generation error: {_ce}')
        return jsonify({'cancelled': False})


# ──────────────────────────── Projects ────────────────────────────

@app.route('/api/projects', methods=['GET'])
@login_required
def list_projects():
    from models import Project
    uid = session.get('user_id')
    projects = Project.query.filter_by(user_id=uid).order_by(Project.updated_at.desc()).all()
    return jsonify({'projects': [p.to_dict() for p in projects]})


@app.route('/api/projects', methods=['POST'])
@login_required
def create_project():
    from models import Project, User as _PU, PLANS
    uid = session.get('user_id')
    data = request.json or {}
    name = (data.get('name') or '').strip()[:120]
    if not name:
        return jsonify({'error': 'Nombre requerido'}), 400
    user = _PU.query.get(uid)
    plan_info = PLANS.get(user.get_plan(), PLANS['free'])
    limit = plan_info.get('projects', 1)
    if Project.query.filter_by(user_id=uid).count() >= limit:
        return jsonify({'error': 'project_limit', 'limit': limit, 'plan': user.get_plan()}), 403
    p = Project(user_id=uid, name=name, instructions=(data.get('instructions') or '')[:8000])
    db.session.add(p)
    db.session.commit()
    return jsonify({'project': p.to_dict()})


@app.route('/api/projects/<int:pid>', methods=['GET'])
@login_required
def get_project(pid):
    from models import Project
    uid = session.get('user_id')
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({'error': 'Proyecto no encontrado'}), 404
    chats = [{'id': c.id, 'title': c.title, 'updated_at': c.updated_at.isoformat(),
              'message_count': len(c.messages)} for c in sorted(p.chats, key=lambda c: c.updated_at, reverse=True)]
    return jsonify({'project': p.to_dict(with_files=True), 'chats': chats})


@app.route('/api/projects/<int:pid>', methods=['PATCH'])
@login_required
def update_project(pid):
    from models import Project
    uid = session.get('user_id')
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({'error': 'Proyecto no encontrado'}), 404
    data = request.json or {}
    if 'name' in data and (data['name'] or '').strip():
        p.name = data['name'].strip()[:120]
    if 'instructions' in data:
        p.instructions = (data['instructions'] or '')[:8000]
    p.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'project': p.to_dict()})


@app.route('/api/projects/<int:pid>', methods=['DELETE'])
@login_required
def delete_project(pid):
    from models import Project, Chat as _PChat
    uid = session.get('user_id')
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({'error': 'Proyecto no encontrado'}), 404
    # Chats survive — they just lose the project link
    _PChat.query.filter_by(project_id=pid).update({'project_id': None})
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/projects/<int:pid>/files', methods=['POST'])
@login_required
def add_project_file(pid):
    from models import Project, ProjectFile, User as _PFU, PLANS
    uid = session.get('user_id')
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({'error': 'Proyecto no encontrado'}), 404
    user = _PFU.query.get(uid)
    plan_info = PLANS.get(user.get_plan(), PLANS['free'])
    limit = plan_info.get('project_files', 5)
    if len(p.files) >= limit:
        return jsonify({'error': 'file_limit', 'limit': limit, 'plan': user.get_plan()}), 403
    data = request.json or {}
    name = (data.get('name') or '').strip()[:255]
    if not name:
        return jsonify({'error': 'Nombre de archivo requerido'}), 400
    is_image = bool(data.get('is_image'))
    raw = data.get('raw_bytes') or None
    if raw and len(raw) > 3 * 1024 * 1024:
        return jsonify({'error': 'Imagen demasiado grande (max 2MB)'}), 400
    content = (data.get('content') or '')[:300000]
    f = ProjectFile(project_id=pid, name=name, mime_type=(data.get('mime_type') or '')[:100],
                    content=content, raw_bytes=raw if is_image else None, is_image=is_image)
    p.updated_at = datetime.utcnow()
    db.session.add(f)
    db.session.commit()
    return jsonify({'file': f.to_dict()})


@app.route('/api/projects/<int:pid>/files/<int:fid>', methods=['DELETE'])
@login_required
def delete_project_file(pid, fid):
    from models import Project, ProjectFile
    uid = session.get('user_id')
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({'error': 'Proyecto no encontrado'}), 404
    f = ProjectFile.query.filter_by(id=fid, project_id=pid).first()
    if not f:
        return jsonify({'error': 'Archivo no encontrado'}), 404
    db.session.delete(f)
    p.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True})


@app.route("/api/projects/<int:pid>/files/<int:fid>", methods=["PATCH"])
@login_required
def update_project_file(pid, fid):
    """Update file name or pinned status."""
    from models import Project, ProjectFile
    uid = session.get("user_id")
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    f = ProjectFile.query.filter_by(id=fid, project_id=pid).first()
    if not f:
        return jsonify({"error": "Archivo no encontrado"}), 404
    data = request.get_json() or {}
    if "name" in data and data["name"].strip():
        f.name = data["name"].strip()
    if "pinned" in data:
        f.pinned = bool(data["pinned"])
    p.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"success": True, "file": f.to_dict()})


@app.route("/api/projects/<int:pid>/files/<int:fid>/rename", methods=["POST"])
@login_required
def rename_project_file(pid, fid):
    """Rename a project file."""
    from models import Project, ProjectFile
    uid = session.get("user_id")
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    f = ProjectFile.query.filter_by(id=fid, project_id=pid).first()
    if not f:
        return jsonify({"error": "Archivo no encontrado"}), 404
    data = request.get_json() or {}
    new_name = data.get("name", "").strip()
    if not new_name:
        return jsonify({"error": "Nombre no valido"}), 400
    f.name = new_name
    p.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"success": True, "file": f.to_dict()})


@app.route("/api/projects/<int:pid>/files/<int:fid>/pin", methods=["POST"])
@login_required
def pin_project_file(pid, fid):
    """Toggle pinned status of a project file."""
    from models import Project, ProjectFile
    uid = session.get("user_id")
    p = Project.query.filter_by(id=pid, user_id=uid).first()
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    f = ProjectFile.query.filter_by(id=fid, project_id=pid).first()
    if not f:
        return jsonify({"error": "Archivo no encontrado"}), 404
    data = request.get_json() or {}
    f.pinned = bool(data.get("pinned", not f.pinned))
    p.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"success": True, "pinned": f.pinned, "file": f.to_dict()})





def _tolerant_artifact(text):
    """Last-resort artifact extraction for broken/unterminated ```artifact blocks
    (aborted streams, unescaped JSON). Delegates to deiza_mapper, whose fence finder is
    string-aware: fences inside the artifact content (```chart, ```mermaid, code) never cut it."""
    try:
        from deiza_mapper.artifacts import first_artifact
        return first_artifact(text)
    except Exception:
        return None

@app.route('/api/health', methods=['GET'])
def health():
    status = {
        'status': 'ok',
        'service': 'Deiza API',
        'version': '1.0.0',
    }
    # Check database
    try:
        db.session.execute(db.text('SELECT 1'))
        status['database'] = 'connected'
    except Exception:
        status['database'] = 'error'
        status['status'] = 'degraded'

    # Check AI service
    status['ai_service'] = 'configured' if getattr(ai_service, 'MODEL_ID', None) or getattr(ai_service, 'project_id', None) else 'not_configured'

    return jsonify(status)


# ── Pragmathic Code API ─────────────────────────────────────────────────

import hashlib as _h
import secrets as _secrets

_code_service = None

def _get_code_service():
    global _code_service
    if _code_service is None:
        _code_service = CodeAIService()
    return _code_service

def _verify_api_key(raw_key: str) -> int or None:
    """Check a raw API key against stored hashes. Returns user_id or None."""
    from models import ApiKey as _AK
    key_hash = _h.sha256(raw_key.encode()).hexdigest()
    ak = _AK.query.filter_by(key_hash=key_hash, revoked=False).first()
    if ak:
        ak.last_used_at = datetime.utcnow()
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        return ak.user_id
    return None

def _gen_api_key() -> tuple:
    """Generate a new API key. Returns (raw_key, key_hash, key_prefix)."""
    raw = 'dz_' + _secrets.token_urlsafe(32)  # deiza-code v1.3 integration
    key_hash = _h.sha256(raw.encode()).hexdigest()
    key_prefix = raw[:10] + '...'
    return raw, key_hash, key_prefix

def code_auth_required(f):
    """Decorator that accepts X-Auth-Token, Authorization: Bearer, or X-Api-Key."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        # Check session cookie first
        if 'user_id' in session:
            return f(*args, **kwargs)
        # Check X-Auth-Token (HMAC session token)
        tok = request.headers.get('X-Auth-Token', '').strip()
        if tok:
            from auth import _verify_auth_token
            uid = _verify_auth_token(tok)
            if uid:
                session['user_id'] = uid
                return f(*args, **kwargs)
        # Check Authorization: Bearer or X-Api-Key (long-lived API key)
        auth_header = request.headers.get('Authorization', '').strip()
        api_key = ''
        if auth_header.startswith('Bearer '):
            api_key = auth_header[7:]
        if not api_key:
            api_key = request.headers.get('X-Api-Key', '').strip()
        if api_key:
            uid = _verify_api_key(api_key)
            if uid:
                session['user_id'] = uid
                return f(*args, **kwargs)
        return jsonify({'error': 'Authentication required'}), 401
    return decorated


# Public API model ids → (internal tier, variant). Same accounting as the chat UI.
DEIZA_API_MODELS = {
    'deiza-omniscient': ('pro', None),
    'omniscient': ('pro', None),
    'deiza-gas-4.1': ('fast', None),
    'deiza-liquid-5': ('pro', None),
    'deiza-liquid-4.5': ('pro', 'liquid45'),
    'deiza-solid-4.5': ('ultra', None),
    # short aliases
    'gas': ('fast', None), 'liquid': ('pro', None), 'solid': ('ultra', None),
}


@app.route('/api/code/models', methods=['GET'])
@code_auth_required
def code_models():
    return jsonify({
        'object': 'list',
        'models': [
            {
                'id': 'deiza-liquid',
                'name': 'Deiza Liquid 5',
                'tag': 'Liquid 5',
                'badge': '1M tokens · Equilibrado',
                'tier': 'code',
                'default': True,
                'provider': 'deizalab',
                'description': 'Motor principal autónomo. Ventana de 1M tokens, alta velocidad, diffs precisos y equilibrio óptimo para cualquier proyecto.',
                'features': ['autonomous_coding', '1M_context', 'surgical_diffs', 'tools', 'streaming']
            },
            {
                'id': 'deiza-solid',
                'name': 'Deiza Solid 4.6',
                'tag': 'Solid 4.6',
                'badge': 'Razonamiento profundo',
                'tier': 'ultra',
                'default': False,
                'provider': 'deizalab',
                'description': 'Máximo razonamiento y lógica profunda. Ideal para arquitectura, seguridad, refactorizaciones masivas y depuración compleja.',
                'features': ['deep_reasoning', 'architecture', 'surgical_diffs', 'tools', 'streaming']
            },
            {
                'id': 'deiza-gas',
                'name': 'Deiza Gas 4.5',
                'tag': 'Gas 4.5',
                'badge': 'Ultra-rápido y visión',
                'tier': 'fast',
                'default': False,
                'provider': 'deizalab',
                'description': 'Velocidad ultra-rápida y soporte multimodal nativo. Para iteraciones ágiles, prototipado y tareas directas.',
                'features': ['ultra_fast', 'multimodal_vision', 'tools', 'streaming']
            },
            {
                'id': 'deiza-vainilla',
                'name': 'Deiza Vainilla',
                'tag': 'Vainilla',
                'badge': 'Ligero & Ilimitado',
                'tier': 'vainilla',
                'default': False,
                'provider': 'deizalab',
                'description': 'Modelo suave, ultra-rápido y conversacional. Siempre disponible y sin consumo de cuota de tokens.',
                'features': ['conversational', 'zero_cost', 'unlimited', 'streaming']
            },
            {
                'id': 'deiza-omniscient',
                'name': 'Deiza Omniscient',
                'tag': 'Liquid 5',
                'alias_of': 'deiza-liquid',
                'default': False,
                'provider': 'deizalab',
                'description': 'Alias de compatibilidad para Deiza Liquid 5.',
                'features': ['autonomous_coding', 'surgical_diffs', 'tools', 'streaming']
            }
        ]
    })


@app.route('/api/code/usage', methods=['GET'])
@code_auth_required
def code_usage():
    user_id = session.get('user_id')
    from models import User as _User
    user_obj = _User.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'User not found'}), 404
    # Free users have general access to Deiza Code with token quota
    usage = user_obj.get_current_usage()
    plan = user_obj.get_plan()
    return jsonify({
        'plan': plan,
        'email': user_obj.email,
        'name': user_obj.name or '',
        'tokens_used': usage['tokens_used'],
        'token_limit': usage['token_limit'],
        'tokens_remaining': usage['tokens_remaining'],
        'next_reset': usage['next_reset'],
        'reset_in_seconds': usage['reset_in_seconds'],
        'exhausted': usage['exhausted'],
    })


@app.route('/api/code/chat/stream', methods=['POST'])
@code_auth_required
def code_chat_stream():
    from flask import send_from_directory, Response, stream_with_context
    user_id = session.get('user_id')
    data = request.json or {}
    message = data.get('message', '').strip()
    history = data.get('history', [])
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    from models import User as _User
    user_obj = _User.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'User not found'}), 404

    can_use, reason = user_obj.can_use_model_with_sublimit('code')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'model_sublimit', 'model': 'code', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'code', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    def generate():
        full_content = ''
        try:
            yield f"data: {json.dumps({'chat_id': 0})}\n\n"
            svc = _get_code_service()
            for chunk in svc.stream_chat(message=message, history=history):
                full_content += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error(f'Code stream error: {e}', exc_info=True)
            yield f"data: {json.dumps({'error': 'Deiza Code is temporarily unavailable. Please try again.'})}\n\n"
        finally:
            if full_content:
                try:
                    _tokens = max(len(full_content) // 4, 1)
                    _u = _User.query.get(user_id)
                    if _u:
                        _u.record_usage(_tokens, 'code')
                        db.session.commit()
                except Exception as _fe:
                    logger.warning(f'Code token record failed: {_fe}')
            yield f"data: {json.dumps({'done': True})}\n\n"

    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization, X-Api-Key',
    }
    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers=cors_headers)


def _extract_openai_messages(data: dict) -> tuple:
    """Convert OpenAI-style messages into (message, history) for the code chat service."""
    messages = data.get('messages', []) or []
    history = []
    for m in messages[:-1]:
        role = m.get('role', 'user')
        content = m.get('content', '')
        if isinstance(content, list):
            text_parts = [p.get('text', '') for p in content if isinstance(p, dict) and 'text' in p]
            content = ''.join(text_parts)
        if isinstance(content, str) and content.strip():
            history.append({'role': role, 'content': content})
    last = messages[-1] if messages else {}
    message = ''
    lc = last.get('content', '')
    if isinstance(lc, list):
        text_parts = [p.get('text', '') for p in lc if isinstance(p, dict) and 'text' in p]
        lc = ''.join(text_parts)
    if isinstance(lc, str):
        message = lc.strip()
    return message, history


# ── Deiza Code: model routing to the OpenAI-compatible endpoint ──────────────────────
CODE_API_URL = os.getenv("CODE_API_URL", "")
CODE_API_KEY = os.getenv("CODE_API_KEY", "")
CODE_MODEL_GAS = os.getenv("CODE_MODEL_GAS", "")
CODE_MODEL_LIQUID = os.getenv("CODE_MODEL_LIQUID", "")
CODE_MODEL_SOLID = os.getenv("CODE_MODEL_SOLID", "")
CODE_MODEL_VAINILLA = os.getenv("CODE_MODEL_VAINILLA", "")
CODE_MODEL_DEFAULT = os.getenv("CODE_MODEL_DEFAULT", "") or CODE_MODEL_LIQUID

DEIZA_CODE_MODEL_MAP = {
    'deiza-liquid': (CODE_MODEL_LIQUID, 'code'),
    'liquid': (CODE_MODEL_LIQUID, 'code'),
    'deiza-liquid-5': (CODE_MODEL_LIQUID, 'code'),
    'liquid-5': (CODE_MODEL_LIQUID, 'code'),
    'deiza-omniscient': (CODE_MODEL_LIQUID, 'code'),
    'omniscient': (CODE_MODEL_LIQUID, 'code'),
    'deiza-solid': (CODE_MODEL_SOLID, 'ultra'),
    'solid': (CODE_MODEL_SOLID, 'ultra'),
    'deiza-solid-4.5': (CODE_MODEL_SOLID, 'ultra'),
    'solid-4.5': (CODE_MODEL_SOLID, 'ultra'),
    'deiza-solid-4.6': (CODE_MODEL_SOLID, 'ultra'),
    'solid-4.6': (CODE_MODEL_SOLID, 'ultra'),
    'deiza-gas': (CODE_MODEL_GAS, 'fast'),
    'gas': (CODE_MODEL_GAS, 'fast'),
    'deiza-gas-4.1': (CODE_MODEL_GAS, 'fast'),
    'gas-4.1': (CODE_MODEL_GAS, 'fast'),
    'deiza-gas-4.5': (CODE_MODEL_GAS, 'fast'),
    'gas-4.5': (CODE_MODEL_GAS, 'fast'),
    'deiza-vainilla': (CODE_MODEL_VAINILLA, 'vainilla'),
    'vainilla': (CODE_MODEL_VAINILLA, 'vainilla'),
    'vanilla': (CODE_MODEL_VAINILLA, 'vainilla'),
}

def _stream_code_upstream(messages, max_tokens=4096, temperature=0.2):
    import requests
    headers = {
        "Authorization": f"Bearer {CODE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": CODE_MODEL_DEFAULT,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True}
    }
    resp = requests.post(CODE_API_URL, headers=headers, json=payload, stream=True, timeout=60)
    if resp.status_code != 200:
        logger.error(f"Code endpoint error ({resp.status_code}): {resp.text[:300]}")
        raise Exception(f"Code endpoint returned status {resp.status_code}")
    for line in resp.iter_lines():
        if line:
            decoded = line.decode('utf-8')
            if decoded.startswith('data: '):
                data_str = decoded[6:].strip()
                if data_str == '[DONE]':
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk['choices'][0]['delta'].get('content', '')
                    if delta:
                        yield delta
                except Exception:
                    pass


def _omniscient_tool_calls(raw) -> list:
    """Assistant tool_calls as sent by the CLI, reduced to the OpenAI shape."""
    out = []
    for tc in (raw or []):
        if not isinstance(tc, dict):
            continue
        fn = tc.get('function') if isinstance(tc.get('function'), dict) else {}
        name = str(fn.get('name') or tc.get('name') or '')[:120]
        if not name:
            continue
        args = fn.get('arguments')
        if not isinstance(args, str):
            try:
                args = json.dumps(args if args is not None else {})
            except Exception:
                args = '{}'
        out.append({'id': str(tc.get('id') or f'call_{len(out)}')[:120], 'type': 'function',
                    'function': {'name': name, 'arguments': args}})
    return out


def _omniscient_messages(data: dict) -> list:
    """OpenAI messages as sent by the CLI, sanitized for the upstream cluster."""
    out = []
    for m in (data.get('messages') or []):
        if not isinstance(m, dict):
            continue
        # deiza-code v1.5 native tools
        if m.get('role') == 'tool':
            _c = m.get('content')
            if not isinstance(_c, str):
                try:
                    _c = json.dumps(_c)
                except Exception:
                    _c = str(_c)
            out.append({'role': 'tool', 'tool_call_id': str(m.get('tool_call_id') or '')[:120], 'content': _c})
            continue
        if m.get('role') == 'assistant' and m.get('tool_calls'):
            _tcs = _omniscient_tool_calls(m.get('tool_calls'))
            if _tcs:
                _c = m.get('content')
                out.append({'role': 'assistant', 'content': _c if isinstance(_c, str) and _c.strip() else None,
                            'tool_calls': _tcs})
                continue
        role = m.get('role') if m.get('role') in ('system', 'user', 'assistant') else 'user'
        content = m.get('content')
        if isinstance(content, list):
            parts = []
            for p in content:
                if not isinstance(p, dict):
                    continue
                if p.get('type') == 'text' and isinstance(p.get('text'), str):
                    parts.append({'type': 'text', 'text': p['text']})
                elif p.get('type') == 'image_url':
                    url = (p.get('image_url') or {}).get('url') if isinstance(p.get('image_url'), dict) else p.get('image_url')
                    if isinstance(url, str) and (url.startswith('data:image/') or url.startswith('http')):
                        parts.append({'type': 'image_url', 'image_url': {'url': url}})
            if parts:
                out.append({'role': role, 'content': parts})
        elif isinstance(content, str) and content.strip():
            out.append({'role': role, 'content': content})
    return out


def _code_msg_tokens(m):
    """Conservative token estimate for one chat message (about 2.5 characters per token, which is what
    JSON-escaped source code measures on these engines; images ~1.5k)."""
    n = 0
    c = m.get('content')
    if isinstance(c, str):
        n += len(c)
    elif isinstance(c, list):
        for part in c:
            if isinstance(part, dict) and part.get('type') == 'image_url':
                n += 4500
            elif isinstance(part, dict):
                n += len(str(part.get('text') or ''))
    for tc in (m.get('tool_calls') or []):
        try:
            n += len(json.dumps(tc))
        except Exception:
            pass
    return n * 2 // 5 + 8


def _vainilla_code_messages(messages):
    """Vainilla (a small model) only takes strictly alternating user/assistant turns and no tool roles.
    Code conversations carry tool calls and results, so they are flattened into plain turns."""
    out = []
    for m in messages:
        role = m.get('role')
        c = m.get('content')
        if isinstance(c, list):
            text = '\n'.join(str(p.get('text') or '') for p in c if isinstance(p, dict) and p.get('type') == 'text')
        else:
            text = str(c or '')
        if role == 'system':
            if out and out[0]['role'] == 'system':
                out[0]['content'] += '\n\n' + text
            else:
                out.insert(0, {'role': 'system', 'content': text})
            continue
        if role == 'tool':
            role, text = 'user', '[Resultado de una herramienta]\n' + text[:4000]
        elif role == 'assistant' and m.get('tool_calls'):
            names = ', '.join(((tc.get('function') or {}).get('name') or 'herramienta') for tc in m['tool_calls'])
            text = (text + '\n' if text.strip() else '') + f'[Usé: {names}]'
        if role not in ('user', 'assistant'):
            role = 'user'
        if not text.strip():
            continue
        if out and out[-1]['role'] == role:
            out[-1]['content'] += '\n\n' + text
        else:
            out.append({'role': role, 'content': text})
    start = 1 if out and out[0]['role'] == 'system' else 0
    while len(out) > start and out[start]['role'] != 'user':
        del out[start]
    if len(out) == start:
        out.append({'role': 'user', 'content': 'Hola'})
    if out[-1]['role'] == 'assistant':
        out.append({'role': 'user', 'content': 'Continúa.'})
    return out


def _fit_code_context(messages, budget):
    """Make a Code conversation fit `budget` tokens without breaking tool call / result pairs."""
    total = lambda: sum(_code_msg_tokens(m) for m in messages)
    if not messages or total() <= budget:
        return messages
    before = total()
    head = 1 if messages[0].get('role') == 'system' else 0
    last_user = max((i for i, m in enumerate(messages) if m.get('role') == 'user'), default=head)
    # 1) shorten big tool results, oldest first (never the most recent one)
    for m in messages[head:-1]:
        if total() <= budget:
            break
        c = m.get('content')
        if m.get('role') == 'tool' and isinstance(c, str) and len(c) > 12000:
            m['content'] = c[:7000] + '\n\n[... salida recortada por el límite de contexto ...]\n\n' + c[-3000:]
    # 2) drop earlier exchanges (everything before the current request)
    while total() > budget and last_user > head:
        del messages[head]
        last_user -= 1
    # 3) drop the oldest steps of the current task, whole (assistant + its tool results), keep the last 3
    dropped = 0
    def groups():
        out, i = [], last_user + 1
        while i < len(messages):
            j = i + 1
            while j < len(messages) and messages[j].get('role') == 'tool':
                j += 1
            out.append((i, j))
            i = j
        return out
    while total() > budget:
        g = groups()
        if len(g) <= 3:
            break
        a, b = g[0]
        del messages[a:b]
        dropped += b - a
    if dropped and last_user < len(messages) and messages[last_user].get('role') == 'user':
        note = ('\n\n[Nota del sistema: por el límite de contexto se han omitido los primeros pasos de esta tarea. '
                'Si necesitas algo de ellos, vuelve a leer los archivos.]')
        c = messages[last_user].get('content')
        if isinstance(c, str):
            messages[last_user]['content'] = c + note
        elif isinstance(c, list):
            messages[last_user]['content'] = c + [{'type': 'text', 'text': note}]
    # 4) still too big (one enormous message): shorten the largest texts
    guard = 0
    while total() > budget and guard < 40:
        guard += 1
        big = max(range(head, len(messages)), key=lambda i: len(messages[i].get('content') or '') if isinstance(messages[i].get('content'), str) else 0)
        c = messages[big].get('content')
        if not isinstance(c, str) or len(c) < 4000:
            break
        keep = max(2000, int(len(c) * 0.6))
        messages[big]['content'] = c[:keep // 2] + '\n\n[... recortado por el límite de contexto ...]\n\n' + c[-keep // 2:]
    # never start with an orphan tool result
    while len(messages) > head + 1 and messages[head].get('role') == 'tool':
        del messages[head]
    logger.info(f'Code context fit: ~{before} -> ~{total()} tokens (budget {budget}), dropped {dropped} step messages')
    return messages


def _omniscient_completions(user_id, data, stream, model_id, created, upstream_model=None, tier='code'):
    """deiza-code v1.3 integration: OpenAI-compatible proxy to the Deiza Omniscient cluster."""
    import requests as _rq
    from flask import send_from_directory, Response, stream_with_context
    from models import User as _User
    messages = _omniscient_messages(data)
    if not messages or messages[-1]['role'] == 'system':
        return jsonify({'error': {'message': 'Messages are required', 'type': 'invalid_request'}}), 400
    # code context fit v1: every request must fit the engine's real window (Liquid and Gas 262,144
    # tokens, Solid 202,752, Vainilla 131,072). Clients built for "1M tokens" sent more and every
    # request of a long session failed. Here: shorten huge tool results, then drop the oldest steps,
    # always keeping the system prompt, the user's current request and the latest steps whole.
    _ctx_limit = {CODE_MODEL_SOLID: 202752, CODE_MODEL_VAINILLA: 131072}.get(upstream_model or CODE_MODEL_LIQUID, 262144)
    try:
        _req_max = max(256, min(int(data.get('max_tokens') or 16384), 32768))
    except Exception:
        _req_max = 16384
    # Gas's tokenizer counts about 15 % more tokens for the same code, so it gets a wider margin.
    _ctx_budget = int((_ctx_limit - _req_max - 8000) * (0.82 if (upstream_model or '') == CODE_MODEL_GAS else 1.0))
    messages = _fit_code_context(messages, _ctx_budget)
    if (upstream_model or '') == CODE_MODEL_VAINILLA:
        messages = _vainilla_code_messages(messages)
    try:
        max_tokens = int(data.get('max_tokens') or 16384)
    except Exception:
        max_tokens = 16384
    max_tokens = max(256, min(max_tokens, 32768))
    try:
        temperature = float(data.get('temperature', 0.2))
    except Exception:
        temperature = 0.2
    payload = {
        'model': upstream_model or CODE_MODEL_LIQUID,
        'messages': messages,
        'max_tokens': max_tokens,
        'temperature': max(0.0, min(temperature, 1.5)),
        'stream': bool(stream),
    }
    if stream:
        payload['stream_options'] = {'include_usage': True}
    # reasoning effort (desktop Code picker): the Gas and Vainilla models time out with it
    _effort = str(data.get('reasoning_effort') or '').strip().lower()
    if _effort in ('low', 'medium', 'high') and payload['model'] not in (CODE_MODEL_GAS, CODE_MODEL_VAINILLA):
        payload['reasoning_effort'] = _effort
    # native function calling (the CLI's tools); passed through untouched
    _tools = data.get('tools')
    if isinstance(_tools, list) and _tools and (upstream_model or '') != CODE_MODEL_VAINILLA:
        payload['tools'] = [t for t in _tools if isinstance(t, dict) and t.get('type') == 'function'][:64]
        if data.get('tool_choice') in ('auto', 'none', 'required') or isinstance(data.get('tool_choice'), dict):
            payload['tool_choice'] = data['tool_choice']
        if isinstance(data.get('parallel_tool_calls'), bool):
            payload['parallel_tool_calls'] = data['parallel_tool_calls']
    headers = {'Authorization': f'Bearer {CODE_API_KEY}', 'Content-Type': 'application/json'}

    def _charge(prompt_tokens, completion_tokens, text_len):
        # The upstream caches prompts, so prompt tokens cost far less than completion tokens.
        # Scale prompt token deduction so users have generous capacity for multi-turn coding sessions.
        if tier == 'vainilla':
            return
        try:
            comp = int(completion_tokens or 0) or max(text_len // 4, 1)
            prompt_share = int(prompt_tokens or 0) // 250
            billed = max(1, comp + prompt_share)
            _u = _User.query.get(user_id)
            if _u:
                _u.record_usage(billed, tier or 'code')
                db.session.commit()
        except Exception as _fe:
            db.session.rollback()
            logger.warning(f'Omniscient token record failed: {_fe}')

    # code proxy resilience v1: transient upstream failures (connection drops, 429/5xx, an error event
    # or an empty answer before anything useful was streamed) are retried here, so clients (CLI and
    # desktop) do not see them. Upstream error text is logged, never forwarded: it can name the provider.
    _t0 = time.time()
    _prompt_chars = sum(len(json.dumps(m)) for m in messages) if isinstance(messages, list) else 0

    def _open_upstream():
        last = None
        for _attempt in range(3):
            if _attempt:
                time.sleep(1.2 * _attempt)
            try:
                r = _rq.post(CODE_API_URL, headers=headers, json=payload, stream=bool(stream), timeout=(30, 300))
            except Exception as e:
                last = ('unreachable', str(e)[:200])
                logger.warning(f'Code upstream unreachable (attempt {_attempt + 1}) user={user_id} model={model_id}: {e}')
                continue
            if r.status_code == 200:
                return r, None
            body = ''
            try:
                body = r.text[:300]
            except Exception:
                pass
            last = (r.status_code, body)
            logger.warning(f'Code upstream HTTP {r.status_code} (attempt {_attempt + 1}) user={user_id} model={model_id} prompt_chars={_prompt_chars}: {body}')
            if r.status_code == 400 and 'context length' in body:
                payload['messages'] = _fit_code_context(payload['messages'], int(_ctx_budget * (0.7 if _attempt == 0 else 0.5)))
                continue
            if r.status_code not in (408, 409, 429, 500, 502, 503, 504, 529):
                break
        return None, last

    resp, _fail = _open_upstream()
    if resp is None:
        # Always 503: clients read 429 as "your quota is used up", which this is not.
        status = 503
        msg = ('Respuesta interrumpida: Deiza Code está muy solicitado ahora mismo (503). Se reintentará la conexión.'
               if _fail and _fail[0] == 429 else
               'Respuesta interrumpida: no se pudo completar la conexión con Deiza Code (503). Se reintentará.')
        logger.error(f'Code upstream failed after retries user={user_id} model={model_id}: {_fail}')
        return jsonify({'error': {'message': msg, 'type': 'server_error'}}), status

    if not stream:
        try:
            up = resp.json()
        except Exception:
            return jsonify({'error': {'message': 'Invalid upstream response', 'type': 'server_error'}}), 502
        text = ''
        _msg = {}
        _finish = 'stop'
        try:
            _msg = up['choices'][0]['message'] or {}
            text = _msg.get('content') or ''
            _finish = up['choices'][0].get('finish_reason') or 'stop'
        except Exception:
            pass
        usage = up.get('usage') or {}
        _charge(usage.get('prompt_tokens'), usage.get('completion_tokens'), len(text))
        _out_msg = {'role': 'assistant', 'content': text}
        if _msg.get('tool_calls'):
            _out_msg['tool_calls'] = _msg['tool_calls']
            _out_msg['content'] = text or None
        return jsonify({
            'id': up.get('id') or f'chatcmpl-{created}', 'object': 'chat.completion', 'created': created, 'model': model_id,
            'choices': [{'index': 0, 'message': _out_msg, 'finish_reason': _finish}],
            'usage': {'prompt_tokens': usage.get('prompt_tokens', 0), 'completion_tokens': usage.get('completion_tokens', 0),
                      'total_tokens': usage.get('total_tokens', 0)},
        })

    def _generate():
        text_len = 0
        usage = {}
        useful = False          # content, reasoning or a tool call already reached the client
        finish = None
        attempts = 1
        up = resp
        while True:
          upstream_error = None
          up.encoding = 'utf-8'   # text/event-stream has no charset: requests would decode as latin-1
          try:
            for raw in up.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                line = raw.strip()
                if not line:
                    continue
                if line.startswith(':'):
                    yield f"{line}\n\n"
                    continue
                if not line.startswith('data:'):
                    continue
                data_str = line[5:].strip()
                if data_str == '[DONE]':
                    break
                try:
                    chunk = json.loads(data_str)
                except Exception:
                    continue
                if chunk.get('error'):
                    upstream_error = chunk.get('error')
                    break
                if chunk.get('usage'):
                    usage = chunk['usage']
                chunk['model'] = model_id
                try:
                    _ch = (chunk.get('choices') or [{}])[0]
                    _d = _ch.get('delta', {}) or {}
                    if _ch.get('finish_reason'):
                        finish = _ch.get('finish_reason')
                    _c = len(_d.get('content') or '')
                    text_len += _c
                    if _c or _d.get('reasoning') or _d.get('reasoning_content') or _d.get('tool_calls'):
                        useful = True
                    for _tc in (_d.get('tool_calls') or []):
                        text_len += len(((_tc.get('function') or {}).get('arguments')) or '')
                except Exception:
                    pass
                yield f"data: {json.dumps(chunk)}\n\n"
          except GeneratorExit:
            try:
                up.close()
            except Exception:
                pass
            return
          except Exception as e:
            upstream_error = {'message': f'stream: {e}'}
          finally:
            try:
                up.close()
            except Exception:
                pass
          if upstream_error is None and (useful or finish == 'length'):
              break
          _why = f'error {str(upstream_error)[:300]}' if upstream_error is not None else f'empty answer (finish={finish})'
          if not useful and attempts < 3:
              if upstream_error is not None and 'context length' in str(upstream_error):
                  payload['messages'] = _fit_code_context(payload['messages'], int(_ctx_budget * (0.7 if attempts == 1 else 0.5)))
              logger.warning(f'Code upstream {_why} - retrying (attempt {attempts + 1}) user={user_id} model={model_id} prompt_chars={_prompt_chars}')
              time.sleep(1.0 * attempts)
              attempts += 1
              nxt = None
              try:
                  nxt = _rq.post(CODE_API_URL, headers=headers, json=payload, stream=True, timeout=(30, 300))
              except Exception as e:
                  logger.warning(f'Code upstream unreachable on retry user={user_id}: {e}')
              if nxt is not None and nxt.status_code == 200:
                  up = nxt
                  continue
              if nxt is not None:
                  logger.warning(f'Code upstream HTTP {nxt.status_code} on retry user={user_id}: {nxt.text[:200] if hasattr(nxt, "text") else ""}')
                  continue
              continue
          logger.error(f'Code upstream {_why} - giving up after {attempts} attempt(s) user={user_id} model={model_id} useful={useful}')
          if upstream_error is not None or not useful:
              # Worded so installed clients treat it as transient and retry on their own.
              yield f"data: {json.dumps({'error': {'message': 'Respuesta interrumpida: se perdió la conexión con Deiza Code (503). Reintentando.', 'type': 'server_error'}})}\n\n"
          break
        if text_len or usage:
            _charge(usage.get('prompt_tokens'), usage.get('completion_tokens'), text_len)
        logger.info(f'Code completion user={user_id} model={model_id} attempts={attempts} useful={useful} finish={finish} '
                    f'prompt_tokens={usage.get("prompt_tokens")} completion_tokens={usage.get("completion_tokens")} secs={time.time() - _t0:.1f}')
        yield 'data: [DONE]\n\n'

    return Response(stream_with_context(_generate()), mimetype='text/event-stream', headers={
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, Authorization, X-Api-Key',
        'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no',
    })


@app.route('/api/code/chat/completions', methods=['POST'])
@code_auth_required
def code_chat_completions():
    """OpenAI-compatible endpoint for the Deiza Code CLI and desktop app."""
    from flask import Response, stream_with_context
    user_id = session.get('user_id')
    data = request.json or {}

    from models import User as _User
    user_obj = _User.query.get(user_id)
    if not user_obj:
        return jsonify({'error': {'message': 'User not found', 'type': 'invalid_request'}}), 404
    # All plans have access to Deiza Code

    raw_model = (data.get('model') or 'deiza-liquid').strip().lower()
    mapping = DEIZA_CODE_MODEL_MAP.get(raw_model)
    if mapping:
        upstream_model, tier = mapping
    else:
        raw_model = 'deiza-liquid'
        upstream_model = CODE_MODEL_LIQUID
        tier = 'code'

    can_use, reason = user_obj.can_use_model_with_sublimit(tier)
    usage = user_obj.get_current_usage()
    if tier != 'vainilla' and not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'model_sublimit', 'model': raw_model, 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': raw_model, 'plan': user_obj.get_plan()}), 403
    if tier != 'vainilla' and usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    stream = bool(data.get('stream', False))
    created = int(time.time())
    return _omniscient_completions(user_id, data, stream, raw_model, created, upstream_model=upstream_model, tier=tier)



@app.route('/api/code/chat/send', methods=['POST'])
@code_auth_required
def code_chat_send():
    user_id = session.get('user_id')
    data = request.json or {}
    message = data.get('message', '').strip()
    history = data.get('history', [])
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    from models import User as _User
    user_obj = _User.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'User not found'}), 404

    can_use, reason = user_obj.can_use_model_with_sublimit('code')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'model_sublimit', 'model': 'code', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'code', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    try:
        svc = _get_code_service()
        result = svc.send_chat(message=message, history=history)
        user_obj.record_usage(result.get('tokens_out', 0), 'code')
        db.session.commit()
        return jsonify(result)
    except Exception as e:
        logger.error(f'Code send error: {e}', exc_info=True)
        return jsonify({'error': f'Deiza Code error: {str(e)[:200]}'}), 500


@app.route('/api/cli/authorize', methods=['POST'])
@login_required
def cli_authorize():
    """Generates an API key for the Deiza Code CLI when authorized from web browser."""
    user_id = session.get('user_id')
    from models import User as UserModel, ApiKey as _AK
    user = UserModel.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    plan = user.get_plan()
    if plan == 'free':
        return jsonify({
            'ok': False,
            'error': 'Deiza Code está reservado exclusivamente para cuentas con planes de pago (Friend o Signet). Por favor actualiza tu suscripción en deiza.org/plans.',
            'requires_upgrade': True,
            'plan': 'free'
        }), 403
    raw, key_hash, key_prefix = _gen_api_key()
    ak = _AK(user_id=user_id, name='Deiza Code CLI', key_hash=key_hash, key_prefix=key_prefix)
    db.session.add(ak)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create key: {str(e)}'}), 500
    return jsonify({
        'ok': True,
        'key': raw,
        'email': user.email,
        'plan': user.get_plan(),
    })


@app.route('/api/code/keys', methods=['GET'])
@code_auth_required
def code_list_keys():
    user_id = session.get('user_id')
    from models import ApiKey as _AK
    keys = _AK.query.filter_by(user_id=user_id, revoked=False).all()
    return jsonify({'keys': [k.to_dict() for k in keys]})


@app.route('/api/code/keys', methods=['POST'])
@code_auth_required
def code_create_key():
    user_id = session.get('user_id')
    data = request.json or {}
    key_name = data.get('name', 'pragmathic').strip()[:120]
    raw, key_hash, key_prefix = _gen_api_key()
    from models import ApiKey as _AK
    ak = _AK(user_id=user_id, name=key_name, key_hash=key_hash, key_prefix=key_prefix)
    db.session.add(ak)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to create key'}), 500
    return jsonify({'key': ak.to_dict(), 'raw_key': raw}), 201


@app.route('/api/code/keys/<int:kid>', methods=['DELETE'])
@code_auth_required
def code_revoke_key(kid):
    user_id = session.get('user_id')
    from models import ApiKey as _AK
    ak = _AK.query.filter_by(id=kid, user_id=user_id).first()
    if not ak:
        return jsonify({'error': 'Key not found'}), 404
    ak.revoked = True
    db.session.commit()
    return jsonify({'ok': True})


# ── Deiza Code Cloud Sessions Persistence ────────────────────────────────────
_CODE_SESSION_MAX_BYTES = 800 * 1024


@app.route('/api/code/sessions', methods=['GET'])
@code_auth_required
def code_list_sessions():
    """List cloud-synced sessions for the authenticated user."""
    user_id = session.get('user_id')
    from models import UserConversation
    rows = (UserConversation.query.filter_by(user_id=user_id, kind='code')
            .order_by(UserConversation.updated_at.desc()).limit(100).all())
    out = []
    for r in rows:
        data = r.get_data()
        out.append({
            'id': r.client_id,
            'title': r.title or 'Conversación sin título',
            'mode': data.get('mode', 'build'),
            'cwd': data.get('cwd', ''),
            'updated_at': r.updated_at.isoformat() if r.updated_at else None,
            'created_at': r.created_at.isoformat() if r.created_at else None,
            'tokens': data.get('tokens', {'prompt': 0, 'completion': 0, 'total': 0}),
            'contextTokens': data.get('contextTokens', 0),
            'messageCount': len(data.get('messages', [])) if isinstance(data.get('messages'), list) else data.get('messageCount', 0),
        })
    return jsonify({'sessions': out}), 200


@app.route('/api/code/sessions/<session_id>', methods=['GET', 'PUT', 'DELETE'])
@code_auth_required
def code_manage_session(session_id):
    """Retrieve, upsert, or delete a cloud-synced session."""
    import re as _re
    if not _re.match(r'^[A-Za-z0-9_-]{1,64}$', session_id):
        return jsonify({'error': 'invalid session id'}), 400
    user_id = session.get('user_id')
    from models import UserConversation
    row = UserConversation.query.filter_by(user_id=user_id, kind='code', client_id=session_id).first()

    if request.method == 'DELETE':
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify({'ok': True}), 200

    if request.method == 'GET':
        if not row:
            return jsonify({'error': 'Session not found'}), 404
        data = row.get_data()
        data['id'] = row.client_id
        if not data.get('title'):
            data['title'] = row.title
        data['updatedAt'] = row.updated_at.isoformat() if row.updated_at else None
        data['createdAt'] = row.created_at.isoformat() if row.created_at else None
        return jsonify({'session': data}), 200

    # PUT (upsert session)
    body = request.json or {}
    sess_obj = body.get('session') if isinstance(body.get('session'), dict) else body
    raw = json.dumps(sess_obj, ensure_ascii=False)
    if len(raw.encode('utf-8')) > _CODE_SESSION_MAX_BYTES:
        return jsonify({'error': 'session payload too large'}), 413
    if not row:
        row = UserConversation(user_id=user_id, kind='code', client_id=session_id)
        db.session.add(row)
    row.title = str(sess_obj.get('title') or 'Conversación')[:200]
    row.data = raw
    try:
        db.session.commit()
        return jsonify({'ok': True, 'id': row.client_id, 'updatedAt': row.updated_at.isoformat() if row.updated_at else None}), 200
    except Exception as e:
        db.session.rollback()
        row = UserConversation.query.filter_by(user_id=user_id, kind='code', client_id=session_id).first()
        if row:
            row.title = str(sess_obj.get('title') or 'Conversación')[:200]
            row.data = raw
            try:
                db.session.commit()
                return jsonify({'ok': True, 'id': row.client_id, 'updatedAt': row.updated_at.isoformat() if row.updated_at else None}), 200
            except Exception:
                db.session.rollback()
        logger.error(f'Error saving cloud session {session_id}: {e}')
        return jsonify({'error': 'Failed to save session'}), 500


@app.route('/api/diag', methods=['GET'])
def diagnostics():
    """Extended diagnostics (external dependencies). Admin secret required."""
    if not _admin_ok():
        return jsonify({'error': 'Unauthorized'}), 401
    diag = {
        'service': 'Deiza API',
        'env': os.getenv('FLASK_ENV', 'development'),
        'checks': {},
    }

    # 1. Database
    try:
        db.session.execute(db.text('SELECT 1'))
        diag['checks']['database'] = 'ok'
    except Exception as e:
        diag['checks']['database'] = f'error: {str(e)[:100]}'

    # 2. Resend (email)
    resend_key = os.getenv('RESEND_API_KEY', '')
    if resend_key:
        try:
            import requests as req_lib
            r = req_lib.get(
                'https://api.resend.com/domains',
                headers={'Authorization': f'Bearer {resend_key}'},
                timeout=10,
            )
            if r.status_code == 200:
                domains = r.json().get('data', [])
                verified = [d['name'] for d in domains if d.get('status') == 'verified']
                diag['checks']['resend'] = f'ok â verified domains: {verified}'
            else:
                diag['checks']['resend'] = f'error {r.status_code}: {r.text[:150]}'
        except Exception as e:
            diag['checks']['resend'] = f'error: {str(e)[:100]}'
    else:
        diag['checks']['resend'] = 'not_configured (RESEND_API_KEY missing)'

    # 3. Stripe
    stripe_key = os.getenv('STRIPE_SECRET_KEY', '')
    if stripe_key:
        try:
            import stripe as stripe_lib
            stripe_lib.api_key = stripe_key
            bal = stripe_lib.Balance.retrieve()
            mode = 'live' if stripe_key.startswith('sk_live') else 'test'
            diag['checks']['stripe'] = f'ok â mode={mode}'
        except Exception as e:
            diag['checks']['stripe'] = f'error: {str(e)[:100]}'
    else:
        diag['checks']['stripe'] = 'not_configured (STRIPE_SECRET_KEY missing)'

    # 4. AI endpoint
    diag['checks']['ai_endpoint'] = ('ok' if os.getenv('MODEL_API_URL') and os.getenv('MODEL_API_KEY')
                                     else 'not_configured (MODEL_API_URL / MODEL_API_KEY missing)')

    # 5. CORS origins
    diag['checks']['cors_origins'] = _allowed_origins

    all_ok = all('ok' in str(v) or v == 'file_exists' for k, v in diag['checks'].items() if k != 'cors_origins' and k != 'ai_project')
    diag['status'] = 'ok' if all_ok else 'degraded'

    return jsonify(diag)


@app.route('/api/chat/send', methods=['POST'])
@login_required
def send_message():
    user_id = session.get('user_id')

    if not check_rate_limit(user_id):
        return jsonify({'error': 'Rate limit exceeded. Please wait a moment.'}), 429

    data = request.json
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    message = data.get('message', '').strip()
    chat_id = data.get('chat_id')
    model = _normalize_model(data.get('model', 'liquid'))
    files = data.get('files', [])

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    if len(message) > 32000:
        return jsonify({'error': 'Message too long (max 32000 characters)'}), 400

    if model not in ('fast', 'pro', 'ultra', 'vainilla'):
        return jsonify({'error': 'Invalid model. Use "fast", "pro" or "ultra".'}), 400

    # Plan + sub-limit check
    from models import User as UserModel
    user_obj = UserModel.query.get(user_id)
    if user_obj:
        can_use, reason = user_obj.can_use_model_with_sublimit(model)
        usage = user_obj.get_current_usage()
        if not can_use:
            if reason == 'model_sublimit':
                return jsonify({'error': 'model_sublimit', 'model': model, 'plan': user_obj.get_plan(), 'usage': usage}), 429
            return jsonify({'error': 'plan_required', 'model': model, 'plan': user_obj.get_plan()}), 403
        if usage['exhausted'] and model != 'vainilla':
            return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    try:
        from models import Chat, Message

        if chat_id:
            chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
            if not chat:
                _pid = data.get('project_id')
                if _pid:
                    from models import Project as _Proj
                    _p = _Proj.query.filter_by(id=_pid, user_id=user_id).first()
                    _pid = _p.id if _p else None
                chat = Chat(user_id=user_id, title=message[:80], project_id=_pid)
                db.session.add(chat)
                db.session.commit()
        else:
            _pid = data.get('project_id')
            if _pid:
                from models import Project as _Proj
                _p = _Proj.query.filter_by(id=_pid, user_id=user_id).first()
                _pid = _p.id if _p else None
            chat = Chat(user_id=user_id, title=message[:80], project_id=_pid)
            db.session.add(chat)
            db.session.commit()

        # Build lightweight attachment metadata for persistence
        attachments_to_save_2 = []
        for f in files:
            att = {
                'name': f.get('name', 'file'),
                'mime_type': f.get('mime_type', ''),
                'is_image': bool(f.get('is_image') or (f.get('mime_type') or '').startswith('image/')),
            }
            raw = f.get('raw_bytes', '')
            if att['is_image'] and raw:
                url = _persist_chat_image(raw, f.get('mime_type', ''), f.get('name', ''))
                if url:
                    att['url'] = url
                    f['url'] = url  # the model gets this URL to embed the photo in deliverables
                elif len(raw) < 2 * 1024 * 1024:
                    att['raw_bytes'] = raw
            attachments_to_save_2.append(att)

        user_message = Message(chat_id=chat.id, role='user', content=message)
        if attachments_to_save_2:
            user_message.attachments_data = attachments_to_save_2
        db.session.add(user_message)
        chat.updated_at = datetime.utcnow()
        db.session.commit()

        history = Message.query.filter_by(chat_id=chat.id).order_by(Message.created_at).all()

        language = data.get('language', 'en')
        ai_response = ai_service.send_message(
            message=message, history=history, model=model, files=files, language=language,
            memory_context=_build_memory_context(user_obj),
        )

        ai_message = Message(
            chat_id=chat.id, role='assistant',
            content=ai_response['content'],
            artifact_data=ai_response.get('artifact'),
        )
        db.session.add(ai_message)
        # Bump chat.updated_at so the sidebar reorders this chat to the top
        chat.updated_at = datetime.utcnow()
        db.session.commit()

        tokens_used = ai_response.get('tokens_used', 0)
        logger.info(f'Chat {chat.id}: user={user_id}, model={model}, tokens={tokens_used}')

        # Record usage
        if user_obj and tokens_used > 0:
            user_obj.record_usage(tokens_used, model)
            db.session.commit()

        return jsonify({
            'success': True,
            'chat_id': chat.id,
            'message': {
                'id': ai_message.id,
                'role': 'assistant',
                'content': ai_response['content'],
                'artifact': ai_response.get('artifact'),
                'created_at': ai_message.created_at.isoformat(),
            },
            'tokens_used': tokens_used,
        })

    except Exception as e:
        logger.error(f'Error sending message: {e}', exc_info=True)
        db.session.rollback()
        return jsonify({'error': 'Failed to process message. Please try again.'}), 500


@app.route('/api/chat/history', methods=['GET'])
@login_required
def get_chat_history():
    user_id = session.get('user_id')
    from models import Chat

    from models import Message as _MsgCount
    from sqlalchemy import func as _func
    chats = Chat.query.filter_by(user_id=user_id).order_by(Chat.pinned.desc(), Chat.updated_at.desc()).limit(50).all()
    ids = [c.id for c in chats]
    counts = dict(db.session.query(_MsgCount.chat_id, _func.count(_MsgCount.id))
                  .filter(_MsgCount.chat_id.in_(ids)).group_by(_MsgCount.chat_id).all()) if ids else {}

    return jsonify({
        'chats': [{
            'id': chat.id,
            'title': chat.title,
            'project_id': chat.project_id,
            'pinned': chat.pinned,
            'created_at': chat.created_at.isoformat(),
            'updated_at': chat.updated_at.isoformat(),
            'message_count': counts.get(chat.id, 0),
        } for chat in chats]
    })


@app.route('/api/chat/<int:chat_id>/messages', methods=['GET'])
@login_required
def get_chat_messages(chat_id):
    user_id = session.get('user_id')
    from models import Chat, Message

    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at).all()

    return jsonify({
        'chat': {
            'id': chat.id,
            'title': chat.title,
            'created_at': chat.created_at.isoformat(),
        },
        'messages': [{
            'id': msg.id,
            'role': msg.role,
            'content': msg.content,
            'artifact': msg.artifact_data,
            'attachments': msg.attachments_data,
            'meta': msg.meta_data,
            'created_at': msg.created_at.isoformat(),
        } for msg in messages]
    })


@app.route('/api/chat/<int:chat_id>/title', methods=['POST'])
@login_required
def generate_chat_title(chat_id):
    """Generate a short AI title for a chat based on its first message."""
    from models import Chat, Message as DBMessage
    user_id = session.get('user_id')
    data = request.json or {}
    language = data.get('language', 'es')

    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    first_msg = DBMessage.query.filter_by(chat_id=chat_id, role='user').order_by(DBMessage.created_at).first()
    if not first_msg:
        return jsonify({'title': chat.title}), 200

    try:
        from ai_service import LANGUAGE_NAMES
        prompt = (
            f'Generate a short, descriptive title (max 5 words, no quotes) for a conversation that starts with: "{first_msg.content[:200]}". '
            f'Reply with ONLY the title, nothing else. Language: {LANGUAGE_NAMES.get(language, "English")}.'
        )
        result = ai_service.send_message(prompt, model='fast', language=language)
        title = result['content'].strip().strip('"\'').strip()[:60]
        if title:
            chat.title = title
            db.session.commit()
        return jsonify({'title': chat.title})
    except Exception as e:
        logger.error(f'Title generation error: {e}')
        return jsonify({'title': chat.title}), 200


@app.route('/api/chat/<int:chat_id>', methods=['DELETE', 'PATCH'])
@login_required
def manage_chat(chat_id):
    user_id = session.get('user_id')
    from models import Chat

    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    if request.method == 'DELETE':
        try:
            db.session.delete(chat)
            db.session.commit()
            if _redis_client:
                try:
                    _redis_client.delete(f'{_GEN_PREFIX}{chat_id}')
                except Exception:
                    pass
            return jsonify({'success': True})
        except Exception as e:
            logger.error(f'Error deleting chat {chat_id}: {e}')
            db.session.rollback()
            return jsonify({'error': 'Failed to delete chat'}), 500

    if request.method == 'PATCH':
        data = request.json or {}
        if 'pinned' in data:
            try:
                chat.pinned = bool(data.get('pinned'))
                db.session.commit()
                return jsonify({'success': True, 'pinned': chat.pinned})
            except Exception as e:
                logger.error(f'Error pinning chat {chat_id}: {e}')
                db.session.rollback()
                return jsonify({'error': 'Failed to pin chat'}), 500
        new_title = data.get('title', '').strip()
        if not new_title:
            return jsonify({'error': 'Title is required'}), 400
        if len(new_title) > 200:
            return jsonify({'error': 'Title too long'}), 400
        try:
            chat.title = new_title
            db.session.commit()
            return jsonify({'success': True, 'title': chat.title})
        except Exception as e:
            logger.error(f'Error renaming chat {chat_id}: {e}')
            db.session.rollback()
            return jsonify({'error': 'Failed to rename chat'}), 500


ALLOWED_EXTENSIONS = {
    '.pdf', '.txt', '.md', '.py', '.js', '.jsx', '.ts', '.tsx',
    '.css', '.html', '.png', '.jpg', '.jpeg', '.gif', '.webp',
}
ALLOWED_MIMETYPES = {
    'application/pdf', 'text/plain', 'text/markdown', 'text/html', 'text/css',
    'application/json', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/javascript', 'text/javascript',
}


@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'File type {ext} not supported'}), 400

    try:
        file_content = ai_service.process_file(file)
        # Detect if it's an image payload (JSON with __image__ key)
        try:
            import json as _json
            parsed = json.loads(file_content)
            if parsed.get('__image__'):
                return jsonify({
                    'success': True,
                    'filename': file.filename,
                    'content': '',
                    'mime_type': parsed['mime_type'],
                    'raw_bytes': parsed['raw_bytes'],
                    'is_image': True,
                })
        except (ValueError, AttributeError):
            pass
        return jsonify({
            'success': True,
            'filename': file.filename,
            'content': file_content,
        })
    except Exception as e:
        logger.error(f'Error uploading file: {e}', exc_info=True)
        return jsonify({'error': 'Failed to process file'}), 500


@app.route('/api/stripe/checkout', methods=['POST'])
@login_required
def stripe_checkout():
    """Create a Stripe Checkout session for upgrading plan (one-time payment)."""
    user_id = session.get('user_id')
    data = request.get_json() or {}
    plan_key = data.get('plan_key', '')

    if plan_key not in ('friend', 'signet'):
        return jsonify({'error': 'Invalid plan'}), 400

    from models import User as UserModel
    user_obj = UserModel.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'User not found'}), 404

    # Digital service that starts at once: the express waiver of the 14-day withdrawal
    # right must be on record before money changes hands (art. 103.m TRLGDCU).
    _blocked = require_withdrawal_waiver(user_id, plan_key, gift=False)
    if _blocked:
        return _blocked

    try:
        from stripe_service import create_checkout_session
        url = create_checkout_session(user_obj.email, plan_key, user_obj.id)
        return jsonify({'url': url})
    except Exception as e:
        logger.error(f'Stripe checkout error: {e}', exc_info=True)
        return jsonify({'error': 'Could not create checkout session'}), 500


@app.route('/api/gifts/checkout', methods=['POST'])
@login_required
def gift_checkout():
    """Create Stripe checkout for a gift subscription."""
    from flask import send_from_directory, session as flask_session
    user_id = flask_session.get('user_id')
    data = request.json or {}
    plan_key = data.get('plan_key', '')
    if plan_key not in ('friend', 'signet'):
        return jsonify({'error': 'Invalid plan'}), 400
    _blocked = require_withdrawal_waiver(user_id, plan_key, gift=True)
    if _blocked:
        return _blocked
    try:
        from models import User as UserModel
        user_obj = UserModel.query.get(user_id)
        from stripe_service import create_gift_checkout_session
        url = create_gift_checkout_session(user_obj.email, plan_key, user_id)
        return jsonify({'url': url})
    except Exception as e:
        logger.error(f'Gift checkout error: {e}', exc_info=True)
        return jsonify({'error': 'Could not create gift checkout'}), 500


@app.route('/api/gifts/check/<code>', methods=['GET'])
def gift_check(code):
    """Check if a gift code is valid and available (no auth required)."""
    from models import GiftCode
    gc = GiftCode.query.filter_by(code=code.upper()).first()
    if not gc:
        return jsonify({'valid': False, 'error': 'CÃ³digo no encontrado'}), 404
    if gc.status != 'available':
        return jsonify({'valid': False, 'error': 'Este cÃ³digo ya ha sido canjeado'}), 410
    return jsonify({'valid': True, 'plan': gc.plan_key, 'code': gc.code})


@app.route('/api/gifts/redeem', methods=['POST'])
@login_required
def gift_redeem():
    """Redeem a gift code â activates the plan for the current user."""
    from flask import send_from_directory, session as flask_session
    from datetime import datetime, timedelta
    user_id = flask_session.get('user_id')
    data = request.json or {}
    code = (data.get('code', '') or '').upper().strip()
    if not code:
        return jsonify({'error': 'CÃ³digo requerido'}), 400
    from models import GiftCode, User as UserModel, UserPlan
    gc = GiftCode.query.filter_by(code=code).with_for_update().first()
    if not gc:
        return jsonify({'error': 'CÃ³digo no encontrado'}), 404
    if gc.status != 'available':
        return jsonify({'error': 'Este cÃ³digo ya ha sido canjeado'}), 410
    user_obj = UserModel.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    from stripe_service import PLAN_DURATION_DAYS
    expires = datetime.utcnow() + timedelta(days=PLAN_DURATION_DAYS)
    if user_obj.plan:
        user_obj.plan.plan_key = gc.plan_key
        user_obj.plan.expires_at = expires
        user_obj.plan.activated_at = datetime.utcnow()
    else:
        new_plan = UserPlan(user_id=user_id, plan_key=gc.plan_key, expires_at=expires)
        db.session.add(new_plan)
    gc.status = 'redeemed'
    gc.redeemed_by_user_id = user_id
    gc.redeemed_at = datetime.utcnow()
    db.session.commit()
    logger.info(f'Gift code {code} redeemed by user {user_id} for plan {gc.plan_key}')
    return jsonify({'success': True, 'plan': gc.plan_key})


@app.route('/api/admin/gifts/generate', methods=['POST'])
def admin_gift_generate():
    """Admin endpoint to generate gift codes (requires admin secret header)."""
    from models import GiftCode
    import secrets, string
    if not _admin_ok():
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json or {}
    plan_key = data.get('plan_key', 'friend')
    count = min(int(data.get('count', 1)), 100)
    if plan_key not in ('friend', 'signet'):
        return jsonify({'error': 'Invalid plan'}), 400

    def gen_code():
        chars = string.ascii_uppercase + string.digits
        part = lambda n: ''.join(secrets.choice(chars) for _ in range(n))
        return f'DEIZA-{part(4)}-{part(4)}'

    codes = []
    for _ in range(count):
        code = gen_code()
        while GiftCode.query.filter_by(code=code).first():
            code = gen_code()
        gc = GiftCode(code=code, plan_key=plan_key, is_admin_issued=True)
        db.session.add(gc)
        codes.append(code)
    db.session.commit()
    return jsonify({'codes': codes, 'plan': plan_key, 'count': len(codes)})




@app.route('/api/gifts/by-session/<session_id>', methods=['GET'])
def gift_by_session(session_id):
    from models import GiftCode
    gc = GiftCode.query.filter_by(stripe_session_id=session_id).first()
    if not gc:
        return jsonify({'found': False}), 404
    frontend_url = os.getenv('FRONTEND_URL', 'https://deiza.org')
    return jsonify({
        'found': True,
        'code': gc.code,
        'plan': gc.plan_key,
        'redeem_url': frontend_url + '/redeem/' + gc.code,
        'status': gc.status,
    })


@app.route('/api/stripe/webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhook events (one-time payment completed)."""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')

    try:
        from stripe_service import handle_webhook
        event = handle_webhook(payload, sig_header)
    except Exception as e:
        logger.error(f'Stripe webhook verification failed: {e}')
        return jsonify({'error': 'Invalid signature'}), 400

    event_type = event['type']
    logger.info(f'Stripe webhook: {event_type}')

    if event_type == 'checkout.session.completed':
        cs = event['data']['object']
        # Only handle paid sessions (payment_status = paid)
        if cs.get('payment_status') == 'paid':
            user_id = cs.get('metadata', {}).get('user_id')
            plan_key = cs.get('metadata', {}).get('plan_key')
            duration_days = int(cs.get('metadata', {}).get('duration_days', '30'))
            customer_id = cs.get('customer')
            customer_email = cs.get('customer_email', '')
            is_gift = cs.get('metadata', {}).get('is_gift') == 'true'

            # SAFETY: cross-verify plan_key against actual Stripe price_id charged
            # This prevents any metadata tampering or mismatch activating wrong plan
            try:
                from stripe_service import PRICE_TO_PLAN
                import stripe as _stripe
                _stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
                li = _stripe.checkout.Session.list_line_items(cs['id'], limit=1)
                line_items = li.get('data', [])
                if line_items:
                    charged_price_id = line_items[0].get('price', {}).get('id', '')
                    expected_plan = PRICE_TO_PLAN.get(charged_price_id, '')
                    if expected_plan and expected_plan != plan_key:
                        logger.error(
                            'PLAN MISMATCH: metadata=%s charged=%s expected=%s. Correcting.',
                            plan_key, charged_price_id, expected_plan
                        )
                        plan_key = expected_plan
            except Exception as _ve:
                logger.warning('Could not verify plan vs price_id: %s', _ve)
            if is_gift and plan_key:
                # Generate a gift code instead of upgrading buyer's plan
                import secrets as _secrets, string as _string
                from models import GiftCode
                def _gen_code():
                    chars = _string.ascii_uppercase + _string.digits
                    part = lambda n: ''.join(_secrets.choice(chars) for _ in range(n))
                    return f'DEIZA-{part(4)}-{part(4)}'
                code = _gen_code()
                while GiftCode.query.filter_by(code=code).first():
                    code = _gen_code()
                gc = GiftCode(
                    code=code, plan_key=plan_key, status='available',
                    purchased_by_email=customer_email,
                    stripe_session_id=cs.get('id')
                )
                db.session.add(gc)
                db.session.commit()
                logger.info(f'Gift code {code} created for plan {plan_key}, purchased by {customer_email}')
                # Send gift code email to buyer
                if customer_email:
                    try:
                        _send_gift_email(customer_email, code, plan_key)
                        logger.info(f'Gift email sent to {customer_email} with code {code}')
                    except Exception as mail_err:
                        logger.error(f'Failed to send gift email: {mail_err}')
            elif user_id and plan_key:
                _activate_one_time_plan(int(user_id), plan_key, duration_days, customer_id)

    return jsonify({'received': True})




def _send_gift_email(to_email, code, plan_key):
    import requests as req_lib
    api_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM", "noreply@deiza.org")
    frontend_url = os.getenv("FRONTEND_URL", "https://deiza.org")
    if not api_key:
        raise ValueError("RESEND_API_KEY not configured")
    plan_names = {"friend": "Friend", "signet": "Signet"}
    plan_name = plan_names.get(plan_key, plan_key.capitalize())
    redeem_url = f"{frontend_url}/redeem/{code}"
    html = (
        "<!DOCTYPE html><html lang=es><head><meta charset=UTF-8></head>"
        "<body style=margin:0;padding:0;background:#F7F4F0;font-family:Georgia,serif>"
        "<table width=100% cellpadding=0 cellspacing=0 style=background:#F7F4F0;padding:40px_0>"
        "<tr><td align=center>"
        "<table width=480 cellpadding=0 cellspacing=0 style=background:#FDFBF7;border-radius:16px;border:1px_solid_#E8E4DE;overflow:hidden>"
        "<tr><td style=background:#8C2F39;padding:28px_40px;text-align:center>"
        "<span style=font-family:Georgia,serif;font-size:28px;color:#FDFBF7>Deiza</span></td></tr>"
        "<tr><td style=padding:40px_40px_32px>"
        "<p style=margin:0_0_8px;font-size:18px;color:#1a1a18;font-weight:bold>Tu regalo esta listo</p>"
        f"<p style=margin:0_0_24px;color:#5a5a55;font-size:15px;line-height:1.6>Has comprado Plan {plan_name}. Aqui tienes el codigo para regalar.</p>"
        "<div style=background:#fff;border:1.5px_solid_#E8E4DE;border-radius:14px;padding:24px;text-align:center;margin-bottom:24px>"
        "<p style=margin:0_0_8px;font-size:12px;color:#aaa;letter-spacing:2px;text-transform:uppercase>Codigo de regalo</p>"
        f"<span style=font-size:28px;letter-spacing:6px;font-weight:bold;color:#8C2F39;font-family:Georgia,serif>{code}</span>"
        "</div>"
        f"<div style=text-align:center;margin-bottom:28px><a href={redeem_url} style=display:inline-block;background:#1a1a18;color:#FDFBF7;text-decoration:none;padding:14px_32px;border-radius:50px;font-size:15px;font-weight:bold>Canjear regalo</a></div>"
        f"<p style=margin:0;color:#aaa;font-size:11px;word-break:break-all>{redeem_url}</p>"
        "</td></tr>"
        "<tr><td style=padding:20px_40px;border-top:1px_solid_#E8E4DE;text-align:center>"
        "<p style=margin:0;color:#bbb;font-size:11px>2026 Deiza - deiza.org</p>"
        "</td></tr></table></td></tr></table></body></html>"
    )
    html = html.replace("_", " ")
    resp = req_lib.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "from": f"Deiza <{from_email}>",
            "to": [to_email.strip().lower()],
            "subject": f"Tu regalo Deiza {plan_name} - codigo {code}",
            "html": html,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise Exception(f"Resend error {resp.status_code}: {resp.text[:200]}")
    logger.info(f"Gift email sent, resend_id={resp.json().get(chr(105)+chr(100))}")

def _activate_one_time_plan(user_id: int, plan_key: str, duration_days: int = 30, customer_id: str = None):
    """Activate a paid plan for a user for duration_days after a one-time payment."""
    from models import User as UserModel, UserPlan
    from datetime import datetime, timedelta

    user_obj = UserModel.query.get(user_id)
    if not user_obj:
        logger.warning(f'Stripe webhook: user {user_id} not found')
        return

    expires_at = datetime.utcnow() + timedelta(days=duration_days)

    if user_obj.plan:
        user_obj.plan.plan_key = plan_key
        user_obj.plan.activated_at = datetime.utcnow()
        user_obj.plan.expires_at = expires_at
        if customer_id:
            user_obj.plan.stripe_customer_id = customer_id
    else:
        new_plan = UserPlan(
            user_id=user_obj.id,
            plan_key=plan_key,
            stripe_customer_id=customer_id,
            activated_at=datetime.utcnow(),
            expires_at=expires_at,
        )
        db.session.add(new_plan)

    db.session.commit()
    logger.info(f'User {user_id} activated plan={plan_key} until {expires_at.date()}')


@app.route('/api/transcribe', methods=['POST'])
@login_required
def transcribe_audio():
    """Speech-to-text through the speech service (automatic language detection).
    Accepts audio/webm, audio/mp4, audio/ogg, audio/wav from MediaRecorder."""
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    user_id = session.get('user_id')
    if not check_rate_limit(user_id):
        return jsonify({'error': 'Too many requests'}), 429

    audio_file = request.files['audio']
    language = (request.form.get('language') or 'es')[:5]

    filename = audio_file.filename or 'recording.webm'
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    ext_to_mime = {'webm': 'audio/webm', 'mp4': 'audio/mp4', 'm4a': 'audio/mp4', 'aac': 'audio/aac',
                   'ogg': 'audio/ogg', 'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'flac': 'audio/flac'}
    mime_type = ext_to_mime.get(ext, audio_file.mimetype or 'audio/webm')
    if ';' in mime_type:
        mime_type = mime_type.split(';')[0].strip()

    audio_bytes = audio_file.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        return jsonify({'error': 'Audio file too large (max 25MB)'}), 400
    if len(audio_bytes) < 100:
        return jsonify({'error': 'Audio too short or empty'}), 400

    try:
        duration_ms = int(float(request.form.get('duration_ms') or 0))
    except (TypeError, ValueError):
        duration_ms = 0
    partial = (request.form.get('segment') or '') == '1'
    context = (request.form.get('context') or '')[-400:]

    t0 = time.time()
    try:
        out = get_speech_service().transcribe(audio_bytes, mime_type=mime_type, language=language,
                                              duration_ms=duration_ms, context=context, partial=partial)
        logger.info(f'Transcribe user={user_id} engine={out.get("engine")} lang={out.get("language")} '
                    f'bytes={len(audio_bytes)} audio={duration_ms / 1000:.1f}s seg={int(partial)} '
                    f'chars={len(out.get("transcript", ""))} {time.time() - t0:.1f}s')
        return jsonify({'success': True, 'transcript': out.get('transcript', ''),
                        'language': out.get('language'), 'engine': out.get('engine')})
    except Exception as e:
        logger.error(f'Transcription error (speech service): {e}', exc_info=True)
        # Last resort: direct transcription in ai_service
        try:
            transcript = ai_service.transcribe_audio(audio_bytes, mime_type=mime_type, language=language)
            return jsonify({'success': True, 'transcript': transcript, 'engine': 'legacy'})
        except Exception as e2:
            logger.error(f'Transcription error (legacy): {e2}')
            return jsonify({'error': 'Transcription failed', 'detail': str(e)}), 500


# Daily TTS character budget per plan (chars/day).
TTS_DAILY_CHARS = {'free': 40_000, 'friend': 200_000, 'signet': 800_000}
_tts_usage_mem: dict = {}


def _tts_budget_take(user_id: int, plan_key: str, chars: int) -> bool:
    """Reserve `chars` from today's TTS budget. Returns False when exhausted."""
    limit = TTS_DAILY_CHARS.get(plan_key, TTS_DAILY_CHARS['free'])
    day = datetime.utcnow().strftime('%Y%m%d')
    key = f'tts:{user_id}:{day}'
    if _redis_client:
        try:
            pipe = _redis_client.pipeline()
            pipe.incrby(key, chars)
            pipe.expire(key, 26 * 3600)
            used = pipe.execute()[0]
            if used > limit:
                _redis_client.decrby(key, chars)
                return False
            return True
        except Exception as _re:
            logger.warning(f'Redis TTS budget error: {_re}')
    used = _tts_usage_mem.get(key, 0)
    if used + chars > limit:
        return False
    _tts_usage_mem[key] = used + chars
    if len(_tts_usage_mem) > 5000:
        for k in [k for k in _tts_usage_mem if not k.endswith(day)]:
            _tts_usage_mem.pop(k, None)
    return True


@app.route('/api/tts', methods=['POST'])
@login_required
def text_to_speech():
    """Text-to-speech through the speech service. Returns audio/mpeg."""
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400
    user_id = session.get('user_id')
    if not check_rate_limit(user_id):
        return jsonify({'error': 'Too many requests'}), 429

    from models import User as _UserTTS
    user_obj = _UserTTS.query.get(user_id)
    plan_key = user_obj.get_plan() if user_obj else 'free'

    from speech_service import markdown_to_speech, TTS_MAX_CHARS
    spoken = markdown_to_speech(text)[:TTS_MAX_CHARS]
    if not spoken:
        return jsonify({'error': 'Nothing readable in this message'}), 400
    if not _tts_budget_take(user_id, plan_key, len(spoken)):
        return jsonify({'error': 'tts_budget_exhausted',
                        'detail': 'Daily read-aloud limit reached for your plan'}), 429

    t0 = time.time()
    try:
        out = get_speech_service().synthesize(
            spoken,
            language=(data.get('language') or 'es')[:5],
            voice=(data.get('voice') or '')[:24],
            speed=float(data.get('speed') or 1.0),
        )
    except Exception as e:
        logger.error(f'TTS error: {e}', exc_info=True)
        return jsonify({'error': 'Speech synthesis failed', 'detail': str(e)[:200]}), 500

    logger.info(f'TTS user={user_id} plan={plan_key} engine={out["engine"]} lang={out["language"]} '
                f'chars={out["chars"]} bytes={len(out["audio"])} {time.time() - t0:.1f}s')
    resp = make_response(out['audio'])
    resp.headers['Content-Type'] = 'audio/mpeg'
    resp.headers['Cache-Control'] = 'private, max-age=3600'
    resp.headers['X-TTS-Engine'] = out['engine']
    resp.headers['X-TTS-Language'] = out['language']
    return resp


@app.route('/api/speech/status', methods=['GET'])
@login_required
def speech_status():
    """Which speech models are configured — handy for ops."""
    return jsonify(get_speech_service().status())


@app.route('/api/plan', methods=['GET'])
@login_required
def get_plan():
    """Get current user's plan and usage."""
    user_id = session.get('user_id')
    from models import User as UserModel, PLANS
    from datetime import datetime
    user_obj = UserModel.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'User not found'}), 404

    plan_key = user_obj.get_plan()
    plan_info = PLANS.get(plan_key, PLANS['free'])
    usage = user_obj.get_current_usage()

    # Days remaining for one-time paid plans
    days_remaining = None
    expires_at = None
    if user_obj.plan and user_obj.plan.expires_at and plan_key != 'free':
        delta = user_obj.plan.expires_at - datetime.utcnow()
        days_remaining = max(0, delta.days)
        expires_at = user_obj.plan.expires_at.isoformat()

    return jsonify({
        'plan': plan_key,
        'plan_info': plan_info,
        'usage': usage,
        'has_stripe_customer': bool(user_obj.plan and user_obj.plan.stripe_customer_id),
        'days_remaining': days_remaining,
        'expires_at': expires_at,
    })


@app.route('/api/plan/all', methods=['GET'])
def get_all_plans():
    """Get all available plans (public endpoint)."""
    from models import PLANS
    return jsonify({'plans': PLANS})


@app.route('/api/memory', methods=['GET'])
@login_required
def get_memory():
    """Return the user's persistent cross-chat memory."""
    user_id = session.get('user_id')
    mem = _get_user_memory_block(user_id)
    return jsonify({'enabled': mem.enabled, 'items': mem.get_items()})


@app.route('/api/skills', methods=['GET'])
@login_required
def get_skills():
    """The user's Skills (imported Markdown instruction packs)."""
    user_id = session.get('user_id')
    d = _get_user_skills(user_id).get_data()
    return jsonify({'custom': d.get('custom') or [], 'limits': {'max_skills': MAX_SKILLS, 'max_chars': MAX_SKILL_CHARS}})


@app.route('/api/skills', methods=['POST'])
@login_required
def update_skills():
    """Replace the user's skills list: [{id, name, description, instructions, enabled}]."""
    user_id = session.get('user_id')
    data = request.json or {}
    row = _get_user_skills(user_id)
    d = row.get_data()
    if 'custom' in data:
        custom = data['custom']
        if not isinstance(custom, list):
            return jsonify({'error': 'Invalid skills list'}), 400
        cleaned = []
        for i, sk in enumerate(custom[:MAX_SKILLS]):
            if not isinstance(sk, dict):
                continue
            name = str(sk.get('name', '')).strip()[:80]
            instr = str(sk.get('instructions', '')).strip()[:MAX_SKILL_CHARS]
            if not name or not instr:
                continue
            cleaned.append({
                'id': str(sk.get('id') or f'skill-{int(time.time() * 1000)}-{i}')[:48],
                'name': name,
                'description': str(sk.get('description', '')).strip()[:200],
                'instructions': instr,
                'enabled': sk.get('enabled', True) is not False,
                'chars': len(instr),
            })
        d['custom'] = cleaned
    d.pop('enabled', None)
    row.set_data(d)
    db.session.commit()
    return jsonify({'ok': True, 'custom': d.get('custom') or []})


@app.route('/api/memory', methods=['POST'])
@login_required
def update_memory():
    """Update memory enable flag and/or fact items (max 20, each ~280 chars)."""
    user_id = session.get('user_id')
    data = request.json or {}
    mem = _get_user_memory_block(user_id)

    if 'enabled' in data:
        mem.enabled = bool(data['enabled'])

    if 'items' in data:
        items = data['items']
        if not isinstance(items, list):
            return jsonify({'error': 'Invalid items'}), 400
        cleaned = []
        for it in items[:20]:
            if isinstance(it, dict):
                text = str(it.get('text', '')).strip()[:280]
                if text:
                    cleaned.append({'id': it.get('id') or text[:16], 'text': text})
            elif isinstance(it, str):
                text = it.strip()[:280]
                if text:
                    cleaned.append({'id': text[:16], 'text': text})
        mem.set_items(cleaned)

    db.session.commit()
    return jsonify({'ok': True, 'enabled': mem.enabled, 'items': mem.get_items()})


@app.route('/api/memory/extract', methods=['POST'])
@login_required
def extract_memory():
    """Silently derive up to 6 cross-chat memory facts from an existing chat's own
    messages. Runs a bare model call — no Chat/Message row is ever created, so this
    can never show up as a stray conversation in the sidebar."""
    user_id = session.get('user_id')
    data = request.json or {}
    chat_id = data.get('chat_id')
    language = data.get('language', 'en')

    mem = _get_user_memory_block(user_id)
    if not mem.enabled:
        return jsonify({'ok': True, 'items': mem.get_items()})

    from models import Chat, Message as DBMessage
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    msgs = DBMessage.query.filter_by(chat_id=chat.id).order_by(DBMessage.created_at).all()
    if sum(1 for m in msgs if m.role == 'user') < 3:
        return jsonify({'ok': True, 'items': mem.get_items()})

    convo = '\n'.join(
        f"{'USER' if m.role == 'user' else 'AI'}: {(m.content or '').replace('```', '')[:250]}"
        for m in msgs[-14:]
    )

    try:
        new_facts = ai_service.extract_memory_facts(convo, language)
    except Exception as e:
        logger.warning(f'Memory extraction failed: {e}')
        new_facts = []

    if new_facts:
        # memory quality v2: task-like lines never enter memory, and a fact with the same
        # category as an existing one replaces it (no "Idioma preferido" twice).
        _TASK_RE = re.compile(r'(?i)^(proyecto actual|tarea|solicitud|petici[oó]n|quiere (un|una|hacer|que)|busca|'
                              r'necesita (un|una)|resolver|resumen|pide|current project|task|request|wants (a|to)|'
                              r'needs (a|to)|looking for|solve|summary)')
        def _split(f):
            f = (f or '').strip().strip('-•').strip()
            if ':' in f:
                c, v = f.split(':', 1)
                return c.strip().lower(), v.strip(), f
            return '', f, f
        existing = mem.get_items()
        merged = list(existing)
        for f in new_facts:
            cat, val, text = _split(f)
            if not val or len(val) < 2 or _TASK_RE.search(text) or _TASK_RE.search(val):
                continue
            item = {'id': text[:16], 'text': text[:280]}
            replaced = False
            for i, it in enumerate(merged):
                ecat, eval_, etext = _split(it.get('text') or '')
                if etext.strip().lower() == text.strip().lower():
                    replaced = True
                    break
                if cat and ecat == cat:
                    merged[i] = item
                    replaced = True
                    break
            if not replaced:
                merged.append(item)
        mem.set_items(merged[:20])
        db.session.commit()

    return jsonify({'ok': True, 'items': mem.get_items(), 'enabled': mem.enabled})


@app.route('/api/stripe/config', methods=['GET'])
def stripe_config():
    """Return Stripe public key for frontend (safe to expose)."""
    from stripe_service import STRIPE_PUBLIC_KEY
    return jsonify({'public_key': STRIPE_PUBLIC_KEY})



@app.route('/api/admin/cron/expiry-emails', methods=['POST'])
def admin_cron_expiry_emails():
    """Cron endpoint: sends plan expiry warning emails. Protected by X-Admin-Secret."""
    if not _admin_ok():
        return jsonify({'error': 'Unauthorized'}), 401

    from models import User as UserModel, UserPlan
    from datetime import datetime, timedelta
    import requests as req_lib

    resend_key = os.getenv('RESEND_API_KEY', '')
    from_email = os.getenv('RESEND_FROM', 'noreply@deiza.org')
    frontend_url = os.getenv('FRONTEND_URL', 'https://deiza.org')
    now = datetime.utcnow()

    sent_warning = 0
    sent_expired = 0
    errors = 0

    def _send_expiry_email(email, name, plan_name, days_left, expired=False):
        if not resend_key:
            return
        subject = f'Tu plan {plan_name} ha expirado' if expired else f'Tu plan {plan_name} expira en {days_left} dia(s)'
        if expired:
            body_line = f'Tu plan <strong>{plan_name}</strong> ha expirado. Has sido cambiado al plan gratuito.'
            action_text = 'Renovar plan'
        else:
            body_line = f'Tu plan <strong>{plan_name}</strong> expira en <strong>{days_left} dia(s)</strong>. Renuevalo para no perder el acceso.'
            action_text = 'Renovar ahora'
        html_content = (
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>'
            '<body style="margin:0;padding:0;background:#F7F4F0;font-family:Georgia,serif;">'
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4F0;padding:40px 0;">'
            '<tr><td align="center">'
            '<table width="480" cellpadding="0" cellspacing="0" style="background:#FDFBF7;border-radius:16px;border:1px solid #E8E4DE;overflow:hidden;">'
            '<tr><td style="background:#8C2F39;padding:28px 40px;text-align:center;">'
            '<span style="font-family:Georgia,serif;font-size:28px;color:#FDFBF7;">Deiza</span></td></tr>'
            '<tr><td style="padding:40px;">'
            f'<p style="margin:0 0 12px;font-size:18px;color:#1a1a18;font-weight:bold;">Hola{", " + name if name else ""}</p>'
            f'<p style="margin:0 0 28px;color:#5a5a55;font-size:15px;line-height:1.7;">{body_line}</p>'
            '<div style="text-align:center;margin-bottom:28px;">'
            f'<a href="{frontend_url}/plans" style="display:inline-block;background:#8C2F39;color:#FDFBF7;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:15px;">{action_text} &rarr;</a>'
            '</div>'
            '<p style="margin:0;color:#aaa;font-size:12px;">Si tienes preguntas, responde a este email.</p>'
            '</td></tr>'
            '<tr><td style="padding:20px 40px;border-top:1px solid #E8E4DE;text-align:center;">'
            f'<p style="margin:0;color:#bbb;font-size:11px;">2026 Deiza &middot; <a href="{frontend_url}" style="color:#8C2F39;text-decoration:none;">deiza.org</a></p>'
            '</td></tr></table></td></tr></table></body></html>'
        )
        try:
            resp = req_lib.post(
                'https://api.resend.com/emails',
                headers={'Authorization': f'Bearer {resend_key}', 'Content-Type': 'application/json'},
                json={'from': f'Deiza <{from_email}>', 'to': [email], 'subject': subject, 'html': html_content},
                timeout=30,
            )
            if resp.status_code >= 400:
                logger.error(f'Expiry email failed {resp.status_code}: {resp.text[:200]}')
                return False
            return True
        except Exception as e:
            logger.error(f'Expiry email exception: {e}')
            return False

    # Expiring in next 3 days (warn)
    warn_cutoff = now + timedelta(days=3)
    expiring_plans = UserPlan.query.filter(
        UserPlan.expires_at > now,
        UserPlan.expires_at <= warn_cutoff,
        UserPlan.plan_key != 'free',
    ).all()
    for plan in expiring_plans:
        user = UserModel.query.get(plan.user_id)
        if not user:
            continue
        delta = plan.expires_at - now
        days_left = max(1, delta.days)
        plan_name = plan.plan_key.capitalize()
        logger.info(f'Sending expiry warning to {user.email} ({days_left} days, plan={plan_name})')
        ok = _send_expiry_email(user.email, user.name or '', plan_name, days_left, expired=False)
        if ok:
            sent_warning += 1
        else:
            errors += 1

    # Already expired but plan not downgraded yet
    expired_plans = UserPlan.query.filter(
        UserPlan.expires_at < now,
        UserPlan.plan_key != 'free',
    ).all()
    for plan in expired_plans:
        user = UserModel.query.get(plan.user_id)
        if not user:
            continue
        plan_name = plan.plan_key.capitalize()
        logger.info(f'Sending expired notice to {user.email} (plan={plan_name})')
        ok = _send_expiry_email(user.email, user.name or '', plan_name, 0, expired=True)
        if ok:
            sent_expired += 1
        else:
            errors += 1

    return jsonify({
        'success': True,
        'sent_warning': sent_warning,
        'sent_expired': sent_expired,
        'errors': errors,
    })


# âââ Artifact Sharing âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.route('/api/artifacts/share', methods=['POST'])
@login_required
def create_shared_artifact():
    """Create a publicly shareable artifact. Returns slug."""
    import secrets as _secrets
    from models import SharedArtifact
    user_id = session.get('user_id')
    data = request.json or {}
    title = (data.get('title') or 'Sin tÃ­tulo')[:255]
    content = data.get('content', '')
    artifact_type = (data.get('artifact_type') or 'html')[:20]
    if not content or not isinstance(content, str):
        return jsonify({'error': 'Content is required'}), 400
    if len(content) > 2_000_000:
        return jsonify({'error': 'too_large'}), 413

    # Generate unique slug
    for _ in range(10):
        slug = _secrets.token_urlsafe(6)[:8]
        if not SharedArtifact.query.filter_by(slug=slug).first():
            break

    sa = SharedArtifact(
        slug=slug, title=title, content=content,
        artifact_type=artifact_type, created_by_user_id=user_id,
    )
    db.session.add(sa)
    db.session.commit()
    frontend_url = os.getenv('FRONTEND_URL', 'https://deiza.org')
    return jsonify({
        'success': True,
        'slug': slug,
        'url': f'{frontend_url}/s/{slug}',
    })


@app.route('/api/artifacts/share/<slug>/pdf', methods=['GET'])
def shared_artifact_pdf(slug):
    """Public: render a shared artifact as PDF (content is already public via the share)."""
    from models import SharedArtifact
    sa = SharedArtifact.query.filter_by(slug=slug).first()
    if not sa:
        return jsonify({'error': 'Not found'}), 404
    try:
        from ai_service import _markdown_to_pdf
        from flask import send_from_directory, send_file
        from io import BytesIO
        pdf_bytes = _markdown_to_pdf(sa.content or '', sa.title or 'documento.pdf')
        name = sa.title if (sa.title or '').lower().endswith('.pdf') else 'documento.pdf'
        return send_file(BytesIO(pdf_bytes), mimetype='application/pdf', download_name=name)
    except Exception as e:
        logger.error(f'Shared artifact PDF failed: {e}')
        return jsonify({'error': 'pdf_failed'}), 500


@app.route('/api/artifacts/share/<slug>', methods=['GET'])
def get_shared_artifact(slug):
    """Public endpoint - returns shared artifact data."""
    from models import SharedArtifact
    sa = SharedArtifact.query.filter_by(slug=slug).first()
    if not sa:
        return jsonify({'error': 'Not found'}), 404
    sa.view_count += 1
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({
        'slug': sa.slug,
        'title': sa.title,
        'content': sa.content,
        'artifact_type': sa.artifact_type,
        'created_at': sa.created_at.isoformat(),
        'view_count': sa.view_count,
    })


# ── Read-only Conversation Sharing ───────────────────────────────────────────
# Snapshots are frozen at share time, so recipients always see
# the exact conversation even if it's later edited or deleted.


@app.route('/api/shares', methods=['POST'])
@login_required
def create_shared_conversation():
    """Create a public read-only snapshot of a chat, a single message, or an
    ad-hoc thread (e.g. Search). Returns a shareable /c/<slug> URL."""
    import json as _js
    from models import Chat, Message as ShareMsg, SharedConversation
    user_id = session.get('user_id')
    data = request.json or {}
    chat_id = data.get('chat_id')
    message_id = data.get('message_id')

    messages = []
    title = ''
    kind = 'chat'

    if chat_id:
        chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
        if not chat:
            return jsonify({'error': 'Chat not found'}), 404
        msgs = ShareMsg.query.filter_by(chat_id=chat.id).order_by(ShareMsg.created_at).all()
        for m in msgs:
            messages.append({
                'role': m.role,
                'content': m.content,
                'artifact': m.artifact_data,
                'meta': m.meta_data,
                'attachments': m.attachments_data,
            })
        title = (chat.title or 'Conversación')[:255]
        kind = 'chat'
    elif message_id:
        m = ShareMsg.query.get(message_id)
        if not m or not Chat.query.filter_by(id=m.chat_id, user_id=user_id).first():
            return jsonify({'error': 'Message not found'}), 404
        messages = [{
            'role': m.role,
            'content': m.content,
            'artifact': m.artifact_data,
            'meta': m.meta_data,
            'attachments': m.attachments_data,
        }]
        title = (data.get('title') or 'Mensaje compartido')[:255]
        kind = 'message'
    else:
        messages = [
            {
                'role': m.get('role') or 'assistant',
                'content': m.get('content') or '',
                'meta': m.get('meta'),
                'attachments': m.get('attachments'),
            }
            for m in (data.get('messages') or []) if m.get('content')
        ]
        if not messages:
            return jsonify({'error': 'Nothing to share'}), 400
        title = (data.get('title') or 'Búsqueda compartida')[:255]
        kind = 'thread'

    if not messages:
        return jsonify({'error': 'Nothing to share'}), 400

    import secrets as _sec
    slug = None
    for _ in range(10):
        cand = _sec.token_urlsafe(6)[:8]
        if not SharedConversation.query.filter_by(slug=cand).first():
            slug = cand
            break
    if not slug:
        return jsonify({'error': 'Try again'}), 500

    sc = SharedConversation(
        slug=slug, title=title, kind=kind,
        payload=_js.dumps({'messages': messages}, ensure_ascii=False)[:600000],
        created_by_user_id=user_id,
    )
    db.session.add(sc)
    db.session.commit()
    frontend_url = os.getenv('FRONTEND_URL', 'https://deiza.org')
    return jsonify({'success': True, 'slug': slug, 'url': f'{frontend_url}/c/{slug}'})


@app.route('/api/shared/<slug>', methods=['GET'])
def get_shared_conversation(slug):
    """Public endpoint — returns the read-only conversation snapshot."""
    from models import SharedConversation
    sc = SharedConversation.query.filter_by(slug=slug).first()
    if not sc:
        return jsonify({'error': 'Not found'}), 404
    sc.view_count += 1
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    try:
        payload = json.loads(sc.payload)
    except Exception:
        payload = {'messages': []}
    return jsonify({
        'slug': sc.slug,
        'title': sc.title,
        'kind': sc.kind,
        'payload': payload,
        'created_at': sc.created_at.isoformat() if sc.created_at else None,
        'view_count': sc.view_count,
    })




# ââ PDF Generation âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
@app.route('/api/files/<fid>', methods=['GET'])
def serve_uploaded_file(fid):
    """Serve a user-uploaded image so it can be embedded in PDFs/docs/web artifacts."""
    from flask import send_from_directory, send_file
    import re as _re
    if not _re.match(r'^[A-Za-z0-9_.-]+$', fid) or '..' in fid:
        return jsonify({'error': 'invalid file id'}), 400
    updir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')
    path = os.path.join(updir, fid)
    if not os.path.isfile(path):
        return jsonify({'error': 'file not found'}), 404
    # conditional=True → Range requests, so <video> can seek instead of downloading everything
    resp = send_file(path, max_age=604800, conditional=True)
    resp.headers['Cache-Control'] = 'public, max-age=604800, immutable'
    return resp


@app.route('/api/generate/pdf', methods=['POST'])
@login_required
def generate_pdf():
    from flask import send_from_directory, send_file
    import io as _io
    from ai_service import _markdown_to_pdf
    if not check_rate_limit(f"gen:{session.get('user_id')}"):
        return jsonify({'error': 'Rate limit exceeded. Please wait a moment.'}), 429
    data = request.json or {}
    content = (data.get('content') or '').strip()
    language = (data.get('language') or 'es')[:5]
    # Strip JSON artifact spec wrapper if AI passed the whole artifact JSON
    if isinstance(content, str) and content.startswith('{"name":'):
        try:
            import json as _pj
            _parsed = _pj.loads(content)
            if isinstance(_parsed, dict) and 'content' in _parsed:
                content = _parsed['content'].strip()
        except Exception:
            pass
    filename = data.get('filename', 'document.pdf')
    if not content:
        return jsonify({'error': 'Content required'}), 400
    if not filename.endswith('.pdf'):
        filename += '.pdf'
    try:
        pdf_bytes = _markdown_to_pdf(content, filename, language=language)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        response.headers['Cache-Control'] = 'private, max-age=600'
        return response
    except Exception as e:
        logger.error(f'PDF generation failed: {e}', exc_info=True)
        return jsonify({'error': f'PDF generation failed: {str(e)[:200]}'}), 500


# ââ DOCX Generation ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
@app.route('/api/generate/docx', methods=['POST'])
@login_required
def generate_docx():
    from flask import send_from_directory, send_file
    import io as _io
    from ai_service import _markdown_to_docx
    if not check_rate_limit(f"gen:{session.get('user_id')}"):
        return jsonify({'error': 'Rate limit exceeded. Please wait a moment.'}), 429
    data = request.json or {}
    content = (data.get('content') or '').strip()
    filename = data.get('filename', 'document.docx')
    if not content:
        return jsonify({'error': 'Content required'}), 400
    if not filename.endswith('.docx'):
        filename += '.docx'
    try:
        docx_bytes = _markdown_to_docx(content)
        return send_file(
            _io.BytesIO(docx_bytes),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        logger.error(f'DOCX generation failed: {e}', exc_info=True)
        return jsonify({'error': f'DOCX generation failed: {str(e)[:200]}'}), 500

# ââ ZIP Generation âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
@app.route('/api/generate/pptx', methods=['POST'])
@login_required
def generate_pptx():
    """Deck HTML (<section class="slide"> per slide) or a JSON plan -> editable .pptx with
    PNG previews and a PDF twin. Returns the same artifact spec the chat uses."""
    import doc_render as _dr
    data = request.json or {}
    content = data.get('content') or data.get('plan')
    if not content:
        return jsonify({'error': 'content (deck html or json plan) required'}), 400
    if isinstance(content, str) and len(content) > 600_000:
        return jsonify({'error': 'content too large'}), 413
    try:
        if isinstance(content, dict) or (isinstance(content, str) and content.lstrip().startswith('{')):
            _plan = content if isinstance(content, dict) else json.loads(content)
            fid = _dr.build_pptx(_plan)
        else:
            # model-written HTML is sanitized into the recipe system; pass sanitize=false for hand-made decks
            fid = _dr.build_pptx_from_html(content, title=data.get('title'), sanitize=bool(data.get('sanitize', True)))
    except Exception as e:
        logger.error(f'PPTX generation failed: {e}', exc_info=True)
        return jsonify({'error': f'PPTX generation failed: {str(e)[:200]}'}), 500
    art = _pptx_artifact('/api/files/' + fid)
    if data.get('filename'):
        art['name'] = data['filename'] if data['filename'].endswith('.pptx') else data['filename'] + '.pptx'
    return jsonify(art)


@app.route('/api/generate/zip', methods=['POST'])
@login_required
def generate_zip():
    import zipfile
    import io as _io
    data = request.json or {}
    files = data.get('files', [])
    if not files:
        return jsonify({'error': 'No files provided'}), 400
    if not check_rate_limit(f"gen:{session.get('user_id')}"):
        return jsonify({'error': 'Rate limit exceeded. Please wait a moment.'}), 429
    import posixpath as _pp
    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files[:400]:
            if not isinstance(f, dict):
                continue
            raw_name = str(f.get('name') or 'file.txt').replace('\\', '/')
            parts = [p for p in _pp.normpath(raw_name).split('/') if p not in ('', '.', '..')]
            fname = '/'.join(parts) or 'file.txt'
            content = f.get('content', '')
            if not isinstance(content, (str, bytes)):
                content = str(content)
            zf.writestr(fname, content.encode('utf-8') if isinstance(content, str) else content)
    buf.seek(0)
    zip_name = data.get('filename', 'project.zip')
    if not zip_name.endswith('.zip'):
        zip_name += '.zip'
    response = make_response(buf.read())
    response.headers['Content-Type'] = 'application/zip'
    response.headers['Content-Disposition'] = f'attachment; filename="{zip_name}"'
    return response



@app.route('/api/search', methods=['POST'])
def search_api():
    """Deiza Search - real grounding web search + direct links + realtime cards."""
    # Public endpoint: throttle per user (or per IP when anonymous) so one client
    # cannot exhaust the shared model quota for everyone else.
    _who = session.get('user_id') or f"ip:{request.headers.get('X-Forwarded-For', request.remote_addr or '0.0.0.0').split(',')[0].strip()}"
    if not check_rate_limit(f'search:{_who}'):
        return jsonify({'error': 'Demasiadas busquedas seguidas. Espera un momento.', 'ai_overview': '', 'sources': [], 'direct_link': None, 'data': None}), 429
    try:
        data = request.json or {}
        query = data.get('query', '').strip()
        files = data.get('files') or []
        if not query and not files:
            return jsonify({'error': 'La b' + '\u00fa' + 'squeda no puede estar vac' + '\u00ed' + 'a'}), 400

        from search_service import run_search
        result = run_search(
            query,
            custom_urls=data.get('custom_urls') or [],
            language=data.get('language') or 'es',
            history=data.get('history') or [],
            files=data.get('files') or [],
        )
        if result.get('error'):
            return jsonify({
                'query': query,
                'error': result['error'],
                'ai_overview': '',
                'sources': [],
                'direct_link': result.get('direct_link'),
                'data': result.get('data'),
                'primary_site': result.get('primary_site'),
                'images': [],
            }), 200

        return jsonify({
            'query': query,
            'ai_overview': result.get('ai_overview', ''),
            'sources': result.get('sources', []),
            'direct_link': result.get('direct_link'),
            'data': result.get('data'),
            'primary_site': result.get('primary_site'),
            'images': result.get('images', []),
            'model': 'Deiza Search',
        })
    except Exception as e:
        logger.error(f'Search API error: {e}', exc_info=True)
        return jsonify({'error': 'Error de b' + '\u00fa' + 'squeda', 'ai_overview': '', 'sources': [], 'direct_link': None, 'data': None}), 500


@app.route('/api/design/presets', methods=['GET'])
def design_presets():
    """Deiza Design — list available style presets with labels + descriptions."""
    presets = []
    for pid, cfg in ai_service.DESIGN_PRESETS.items():
        presets.append({
            'id': pid,
            'label': cfg['label'],
            'desc': cfg.get('desc', {}),
        })
    return jsonify({'presets': presets, 'ratios': ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9', '9:21']})


@app.route('/api/design/generate', methods=['POST'])
@login_required
def design_generate():
    """Deiza Design — generate an image following a curated style preset.
    Paid plans only (design model gated in models.PLANS)."""
    from models import User as _DesignUser
    from models import IMAGE_RAW_COST as _DesignCost
    user_id = session.get('user_id')
    data = request.json or {}
    prompt = (data.get('prompt') or '').strip()
    preset = (data.get('preset') or 'auto').strip()
    language = data.get('language', 'es')
    aspect_ratio = data.get('aspect_ratio', '1:1')
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    user_obj = _DesignUser.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'Authentication required'}), 401
    can_use, reason = user_obj.can_use_model_with_sublimit('design')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'design_sublimit', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'design', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    result = ai_service.generate_design(prompt, preset=preset, language=language, aspect_ratio=aspect_ratio)
    if not result:
        return jsonify({'error': 'image_failed'}), 502

    try:
        user_obj.record_usage(_DesignCost, 'design')
        db.session.commit()
    except Exception as _de:
        logger.warning(f'Design usage record failed: {_de}')
    return jsonify({'data_url': result['data_url'], 'mime': result['mime'], 'text': result.get('text', '')})


@app.route('/api/design/edit', methods=['POST'])
@login_required
def design_edit():
    """Deiza Design — edit an attached photo following a curated style preset."""
    from models import User as _DesignUser2
    from models import IMAGE_RAW_COST as _DesignCost2
    user_id = session.get('user_id')
    data = request.json or {}
    prompt = (data.get('prompt') or '').strip()
    preset = (data.get('preset') or 'auto').strip()
    language = data.get('language', 'es')
    aspect_ratio = data.get('aspect_ratio', '1:1')
    files_data = data.get('files', []) or []
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    if not any((f.get('raw_bytes') or '') and (f.get('mime_type') or '').startswith('image/') for f in files_data):
        return jsonify({'error': 'An image is required'}), 400

    user_obj = _DesignUser2.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'Authentication required'}), 401
    can_use, reason = user_obj.can_use_model_with_sublimit('design')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'design_sublimit', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'design', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    result = ai_service.generate_design(prompt, preset=preset, files=files_data, language=language, aspect_ratio=aspect_ratio)
    if not result:
        return jsonify({'error': 'image_failed'}), 502

    try:
        user_obj.record_usage(_DesignCost2, 'design')
        db.session.commit()
    except Exception as _de2:
        logger.warning(f'Design usage record failed: {_de2}')
    return jsonify({'data_url': result['data_url'], 'mime': result['mime'], 'text': result.get('text', '')})


@app.route('/api/design/video', methods=['POST'])
@login_required
def design_video():
    """Deiza Design — generate or edit a short video clip (omni model).
    Paid plans only; video consumes a lot of quota, so the frontend warns first."""
    from models import User as _VideoUser
    from models import IMAGE_RAW_COST as _VideoCost
    user_id = session.get('user_id')
    data = request.json or {}
    prompt = (data.get('prompt') or '').strip()
    language = data.get('language', 'es')
    files_data = data.get('files', []) or []
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    user_obj = _VideoUser.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'Authentication required'}), 401
    can_use, reason = user_obj.can_use_model_with_sublimit('design')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'design_sublimit', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'design', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    result = ai_service.generate_video(prompt, files=files_data, language=language)
    if not result or result.get('error'):
        return jsonify({'error': 'video_' + (result or {}).get('error', 'failed'), 'detail': (result or {}).get('detail', '')}), 502

    try:
        user_obj.record_usage(_VideoCost, 'design')
        db.session.commit()
    except Exception as _ve:
        logger.warning(f'Design video usage record failed: {_ve}')
    return jsonify({'data_url': result['data_url'], 'mime': result['mime'], 'text': result.get('text', '')})


# ── Design video jobs ────────────────────────────────────────────────────────
# A reel is 2-6 video clips generated one after another (≈1 min each) plus ffmpeg
# assembly, so it runs in a background thread; the client polls the job and the
# finished MP4 is served from instance/uploads like any other persisted file.
_DESIGN_JOB_PREFIX = 'deiza:design:job:'
_DESIGN_JOB_TTL = 6 * 3600
_design_jobs_mem = {}
_design_jobs_lock = threading.Lock()


def _design_job_get(job_id):
    if _redis_client:
        try:
            raw = _redis_client.get(_DESIGN_JOB_PREFIX + job_id)
            return json.loads(raw) if raw else None
        except Exception:
            pass
    with _design_jobs_lock:
        return _design_jobs_mem.get(job_id)


def _design_job_set(job_id, payload):
    payload['ts'] = time.time()
    if _redis_client:
        try:
            _redis_client.setex(_DESIGN_JOB_PREFIX + job_id, _DESIGN_JOB_TTL, json.dumps(payload))
            return
        except Exception:
            pass
    with _design_jobs_lock:
        _design_jobs_mem[job_id] = payload


def _design_job_patch(job_id, **fields):
    cur = _design_job_get(job_id) or {}
    cur.update(fields)
    _design_job_set(job_id, cur)


def _uploads_dir():
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')
    os.makedirs(d, exist_ok=True)
    return d


def _load_upload_b64(url_or_fid):
    """Read a persisted /api/files/<fid> back as (base64, mime) for the models."""
    import re as _re
    fid = (url_or_fid or '').rsplit('/', 1)[-1]
    if not _re.match(r'^[A-Za-z0-9_.-]+$', fid) or '..' in fid:
        return None, None
    path = os.path.join(_uploads_dir(), fid)
    if not os.path.isfile(path) or os.path.getsize(path) > 12 * 1024 * 1024:
        return None, None
    ext = os.path.splitext(fid)[1].lower()
    mime = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
            '.gif': 'image/gif', '.mp4': 'video/mp4'}.get(ext, 'application/octet-stream')
    with open(path, 'rb') as fh:
        return base64.b64encode(fh.read()).decode(), mime


def _resolve_studio_images(items):
    """Normalise the studio's reference images: inline base64 or {url} refs → [{data, mime}]."""
    out = []
    for im in (items or []):
        if not isinstance(im, dict):
            continue
        if im.get('data'):
            mime = im.get('mime') or 'image/png'
            if mime.startswith('image/'):
                out.append({'data': im['data'], 'mime': mime})
        elif im.get('url'):
            data, mime = _load_upload_b64(im['url'])
            if data and mime and mime.startswith('image/'):
                out.append({'data': data, 'mime': mime})
    return out[:4]


def _run_design_video_job(job_id, user_id, spec, language):
    """Background worker: generate the image or clip(s), assemble, persist, charge usage."""
    from models import User as _JobUser, IMAGE_RAW_COST as _ClipCost
    scenes = spec.get('scenes') or []
    n = len(scenes)

    def _progress(done, total, stage):
        _design_job_patch(job_id, status='running', stage=stage, scene=min(done + 1, total), total=total)

    with app.app_context():
        if spec.get('mode') == 'image':
            try:
                _design_job_patch(job_id, status='running', stage='generating', scene=1, total=1)
                res = ai_service.generate_design(spec.get('prompt', ''), preset=spec.get('preset') or 'auto',
                                                 files=spec.get('files') or [], language=language,
                                                 aspect_ratio=spec.get('aspect_ratio') or '1:1')
                if not res or not res.get('data_url'):
                    _design_job_patch(job_id, status='error', error='failed', detail=(res or {}).get('text', '')[:200])
                    return
                head, b64 = res['data_url'].split(',', 1)
                mime = res.get('mime') or head.replace('data:', '').split(';')[0] or 'image/png'
                url = _persist_chat_image(b64, mime, job_id + '.png', generated=True)
                if not url:
                    _design_job_patch(job_id, status='error', error='failed', detail='persist')
                    return
                try:
                    u = _JobUser.query.get(user_id)
                    if u:
                        u.record_usage(_ClipCost, 'design')
                        db.session.commit()
                except Exception as _ue:
                    logger.warning(f'Design image usage record failed: {_ue}')
                    db.session.rollback()
                _design_job_patch(job_id, status='done', stage='done', scene=1, total=1,
                                  media_url=url, mime=mime, text=res.get('text', ''))
            except Exception as e:
                logger.error(f'Design image job {job_id} crashed: {e}', exc_info=True)
                _design_job_patch(job_id, status='error', error='failed', detail=str(e)[:200])
            return

        try:
            _progress(0, n, 'generating')
            if spec.get('mode') == 'reel':
                res = ai_service.generate_reel(scenes, subtitles=spec.get('subtitles') or [],
                                               aspect_ratio=spec.get('aspect_ratio') or '9:16',
                                               files=spec.get('files') or [],
                                               consistency=spec.get('consistency') or '',
                                               on_progress=_progress)
            else:
                sc = scenes[0] if scenes else {'prompt': '', 'duration': 8}
                res = ai_service.generate_video(sc.get('prompt', ''), files=spec.get('files') or [],
                                                language=language, aspect_ratio=spec.get('aspect_ratio') or '16:9',
                                                duration=sc.get('duration') or 8)
            if not res or res.get('error'):
                reason = (res or {}).get('error', 'failed')
                _design_job_patch(job_id, status='error', error=reason, detail=(res or {}).get('detail', ''),
                                  scene=(res or {}).get('scene'), total=n)
                return

            raw = res.get('bytes')
            if raw is None:
                raw = base64.b64decode(res['data_url'].split(',', 1)[-1])
            updir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')
            os.makedirs(updir, exist_ok=True)
            fid = job_id + '.mp4'
            with open(os.path.join(updir, fid), 'wb') as fh:
                fh.write(raw)
            _mark_ai_video(os.path.join(updir, fid))

            done_clips = n if spec.get('mode') == 'reel' else 1
            try:
                u = _JobUser.query.get(user_id)
                if u:
                    u.record_usage(_ClipCost * max(1, done_clips), 'design')
                    db.session.commit()
            except Exception as _ue:
                logger.warning(f'Design video usage record failed: {_ue}')
                db.session.rollback()

            _design_job_patch(job_id, status='done', stage='done', scene=n, total=n,
                              video_url='/api/files/' + fid, media_url='/api/files/' + fid, mime='video/mp4',
                              duration=res.get('duration'), text=res.get('text', ''))
        except Exception as e:
            logger.error(f'Design video job {job_id} crashed: {e}', exc_info=True)
            _design_job_patch(job_id, status='error', error='failed', detail=str(e)[:200])


def _start_design_video_job(user_id, spec, language):
    job_id = _secrets.token_hex(16)
    _design_job_set(job_id, {'status': 'queued', 'stage': 'queued', 'scene': 0,
                             'total': len(spec.get('scenes') or []), 'user_id': user_id,
                             'mode': spec.get('mode')})
    t = threading.Thread(target=_run_design_video_job, args=(job_id, user_id, spec, language), daemon=True)
    t.start()
    return job_id


@app.route('/api/design/job/<job_id>', methods=['GET'])
@login_required
def design_job_status(job_id):
    import re as _re
    if not _re.match(r'^[a-f0-9]{32}$', job_id):
        return jsonify({'error': 'invalid job'}), 400
    job = _design_job_get(job_id)
    if not job or job.get('user_id') != session.get('user_id'):
        return jsonify({'error': 'not found'}), 404
    public = {k: job.get(k) for k in ('status', 'stage', 'scene', 'total', 'error', 'detail', 'video_url', 'media_url', 'mime', 'duration', 'text', 'mode')}
    return jsonify(public)


# ── Persisted Design / Search conversations ──────────────────────────────────
_CONVO_KINDS = ('design', 'search')
_CONVO_MAX_BYTES = 400 * 1024


@app.route('/api/convos/<kind>', methods=['GET'])
@login_required
def list_convos(kind):
    if kind not in _CONVO_KINDS:
        return jsonify({'error': 'invalid kind'}), 400
    from models import UserConversation
    rows = (UserConversation.query.filter_by(user_id=session.get('user_id'), kind=kind)
            .order_by(UserConversation.updated_at.desc()).limit(80).all())
    return jsonify({'convos': [r.to_dict() for r in rows]})


@app.route('/api/convos/<kind>/<client_id>', methods=['PUT', 'DELETE'])
@login_required
def upsert_convo(kind, client_id):
    import re as _re
    if kind not in _CONVO_KINDS or not _re.match(r'^[A-Za-z0-9_-]{1,48}$', client_id):
        return jsonify({'error': 'invalid'}), 400
    from models import UserConversation
    user_id = session.get('user_id')
    row = UserConversation.query.filter_by(user_id=user_id, kind=kind, client_id=client_id).first()
    if request.method == 'DELETE':
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify({'ok': True})
    body = request.json or {}
    data = body.get('data')
    if not isinstance(data, dict):
        return jsonify({'error': 'data must be an object'}), 400
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw.encode('utf-8')) > _CONVO_MAX_BYTES:
        return jsonify({'error': 'too_large'}), 413
    if not row:
        row = UserConversation(user_id=user_id, kind=kind, client_id=client_id)
        db.session.add(row)
    row.title = str(body.get('title') or '')[:200]
    row.pinned = bool(body.get('pinned'))
    row.data = raw
    db.session.commit()
    return jsonify({'ok': True, 'updated_at': row.updated_at.isoformat() if row.updated_at else None})


@app.route('/api/uploads', methods=['POST'])
@login_required
def upload_media():
    """Persist user photos (base64) so pages can reference them by URL instead of
    carrying megabytes of base64 in every message and in localStorage."""
    data = request.json or {}
    out = []
    for f in (data.get('files') or [])[:6]:
        if not isinstance(f, dict):
            continue
        mime = (f.get('mime_type') or f.get('mime') or '').lower()
        raw = f.get('raw_bytes') or f.get('data') or ''
        if not mime.startswith('image/') or not raw:
            out.append(None)
            continue
        url = _persist_chat_image(raw, mime, f.get('name') or 'photo')
        out.append({'url': url, 'mime': mime, 'name': f.get('name') or 'photo'} if url else None)
    return jsonify({'files': out})


@app.route('/api/design/studio', methods=['POST'])
@login_required
def design_studio():
    """Deiza Design Studio — conversational creative director agent.
    The agent asks questions, builds the brief and generates the image/video.
    Paid plans only."""
    from models import User as _StudioUser
    from models import IMAGE_RAW_COST as _StudioCost
    user_id = session.get('user_id')
    data = request.json or {}
    message = (data.get('message') or '').strip()
    history = data.get('history') or []
    language = data.get('language', 'es')
    last_image = data.get('last_image') or None
    last_image_mime = data.get('last_image_mime') or None
    last_images = data.get('last_images') or None
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    user_obj = _StudioUser.query.get(user_id)
    if not user_obj:
        return jsonify({'error': 'Authentication required'}), 401
    can_use, reason = user_obj.can_use_model_with_sublimit('design')
    usage = user_obj.get_current_usage()
    if not can_use:
        if reason == 'model_sublimit':
            return jsonify({'error': 'design_sublimit', 'plan': user_obj.get_plan(), 'usage': usage}), 429
        return jsonify({'error': 'plan_required', 'model': 'design', 'plan': user_obj.get_plan()}), 403
    if usage['exhausted']:
        return jsonify({'error': 'usage_limit', 'usage': usage}), 429

    # Reference images arrive inline (base64) or as {url} refs to persisted uploads;
    # generated videos are never fed back to the model as an "image".
    last_images = _resolve_studio_images(last_images)
    if last_image_mime and not last_image_mime.startswith('image/'):
        last_image, last_image_mime = None, None

    result = ai_service.studio_chat(message, history=history, language=language,
                                    last_image=last_image, last_image_mime=last_image_mime,
                                    last_images=last_images)
    if not result or result.get('error'):
        return jsonify({'error': 'studio_failed', 'reason': (result or {}).get('error', '')}), 502

    # Every generation runs as a background job (images ≈15 s, reels minutes): the client
    # polls, and a refresh mid-way no longer loses the result.
    spec = result.get('video_spec') or result.get('image_spec')
    if spec:
        job_id = _start_design_video_job(user_id, spec, language)
        return jsonify({'reply': result.get('reply', ''), 'gen': True, 'mode': spec.get('mode', 'image'),
                        'options': [], 'job_id': job_id,
                        'total': len(spec.get('scenes') or []) or 1})

    payload = {'reply': result.get('reply', ''), 'gen': False,
               'mode': result.get('mode', 'image'), 'options': result.get('options', [])}
    return jsonify(payload)


@app.route('/api/img-proxy')
def img_proxy():
    """Fetch a remote image server-side and serve it with a long cache.

    Solves hotlink protection, referrer policies and mixed-content blocks so
    internet photos always render in the chat and in search results."""
    import hashlib
    import re as _re
    import socket as _socket
    import urllib.request as _urlreq
    from urllib.parse import urlparse as _urlparse

    import ipaddress as _ipa

    def _is_public_host(host: str) -> bool:
        """Every resolved address must be public (no loopback, LAN, link-local, metadata)."""
        if not host or host.lower() == 'localhost' or host.endswith('.local') or host.endswith('.internal'):
            return False
        try:
            infos = _socket.getaddrinfo(host, None)
        except Exception:
            return False
        if not infos:
            return False
        for _info in infos:
            try:
                ip = _ipa.ip_address(_info[4][0])
            except ValueError:
                return False
            if not ip.is_global or ip.is_multicast:
                return False
        return True

    _url = (request.args.get('u') or '').strip()
    if not _url.startswith(('http://', 'https://')) or len(_url) > 4096:
        return '', 400
    _orig_url = _url
    try:
        # Commons originals are often 5-20 MB (over the proxy limit): serve the 1280px thumbnail instead
        from deiza_mapper.images import wikimedia_thumb as _wthumb
        _url = _wthumb(_url)
    except Exception:
        pass
    try:
        _parsed = _urlparse(_url)
        if _parsed.username or _parsed.password or _parsed.port not in (None, 80, 443):
            return '', 400
        if not _is_public_host(_parsed.hostname or ''):
            return '', 400
    except Exception:
        return '', 400

    class _NoRedirect(_urlreq.HTTPRedirectHandler):
        # A public host answering with a redirect to an internal one is the classic SSRF hop
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            try:
                _nh = _urlparse(newurl).hostname or ''
                if newurl.startswith(('http://', 'https://')) and _is_public_host(_nh):
                    return _urlreq.HTTPRedirectHandler.redirect_request(self, req, fp, code, msg, headers, newurl)
            except Exception:
                pass
            return None
    _opener = _urlreq.build_opener(_NoRedirect())
    _dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'img_cache')
    _key = hashlib.md5(_url.encode()).hexdigest()
    _bin = os.path.join(_dir, _key + '.bin')
    _meta_f = os.path.join(_dir, _key + '.json')
    try:
        os.makedirs(_dir, exist_ok=True)
        if os.path.exists(_bin) and os.path.exists(_meta_f):
            try:
                with open(_meta_f) as _mf:
                    _meta = json.loads(_mf.read())
                _age = time.time() - _meta.get('ts', 0)
                if 0 < _age < 604800 and _meta.get('url') == _url:
                    with open(_bin, 'rb') as _bf:
                        _body = _bf.read()
                    _resp = make_response(_body)
                    _resp.headers['Content-Type'] = _meta.get('mime', 'application/octet-stream')
                    _resp.headers['Cache-Control'] = 'public, max-age=604800'
                    _resp.headers['Access-Control-Allow-Origin'] = '*'
                    return _resp
            except Exception:
                pass
        _req = _urlreq.Request(_url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/gif,*/*;q=0.8',
            'Referer': 'https://deiza.org/',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        })
        try:
            with _opener.open(_req, timeout=20) as _r:
                _body = _r.read(10 * 1024 * 1024 + 1)
                _mime = (_r.headers.get('Content-Type', '') or 'application/octet-stream').split(';')[0].strip()
        except Exception as _thumb_err:
            if _url == _orig_url:
                raise
            # Commons refuses a thumbnail wider than the original: retry the original file
            logger.debug(f'img-proxy thumb failed ({_thumb_err}); retrying original')
            _req.full_url = _orig_url
            with _opener.open(_req, timeout=20) as _r:
                _body = _r.read(10 * 1024 * 1024 + 1)
                _mime = (_r.headers.get('Content-Type', '') or 'application/octet-stream').split(';')[0].strip()
        if len(_body) > 10 * 1024 * 1024 or not _mime.lower().startswith('image/'):
            return '', 502
        with open(_bin, 'wb') as _bf:
            _bf.write(_body)
        with open(_meta_f, 'w') as _mf:
            _mf.write(json.dumps({'url': _url, 'mime': _mime, 'ts': time.time()}))
        try:
            _entries = os.listdir(_dir)
            if len(_entries) > 6000:
                import random as _rnd
                for _old in _rnd.sample(_entries, min(100, len(_entries))):
                    try:
                        os.remove(os.path.join(_dir, _old))
                    except Exception:
                        pass
        except Exception:
            pass
        _resp = make_response(_body)
        _resp.headers['Content-Type'] = _mime
        _resp.headers['Content-Disposition'] = 'inline'
        _resp.headers['Cache-Control'] = 'public, max-age=604800'
        _resp.headers['Access-Control-Allow-Origin'] = '*'
        return _resp
    except Exception as _e:
        logger.debug(f'img-proxy failed for {_url[:120]}: {_e}')
        return '', 502


@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """Update user name and/or avatar."""
    from models import User as _ProfileUser
    user = _ProfileUser.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    # Handle name update
    name = request.form.get('name') or (request.json or {}).get('name') if request.content_type != 'multipart/form-data' else request.form.get('name')
    if name and name.strip():
        user.name = name.strip()[:100]
    
    # Handle avatar upload
    avatar_file = request.files.get('avatar') if request.content_type and 'multipart' in request.content_type else None
    avatar_b64 = None
    if not avatar_file:
        # Try base64 from JSON
        json_data = request.form.get('avatar_base64') or (request.json or {}).get('avatar_base64')
        if json_data:
            avatar_b64 = json_data
    
    if avatar_file or avatar_b64:
        try:
            from PIL import Image
            from io import BytesIO
            import base64
            
            if avatar_file:
                img = Image.open(avatar_file.stream)
            else:
                img_data = base64.b64decode(avatar_b64.split(',')[-1] if ',' in avatar_b64 else avatar_b64)
                img = Image.open(BytesIO(img_data))
            
            # Resize to 256x256, center crop
            img = img.convert('RGB')
            w, h = img.size
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
            img = img.resize((256, 256), Image.LANCZOS)
            
            # Save as WebP
            import os
            avatar_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
            os.makedirs(avatar_dir, exist_ok=True)
            avatar_path = os.path.join(avatar_dir, f'{user.id}.webp')
            img.save(avatar_path, 'WEBP', quality=85)
            
            user.avatar_url = f'/api/files/avatar/{user.id}.webp'
        except Exception as e:
            logger.error(f'Avatar upload error: {e}')
            return jsonify({'error': 'avatar_upload_failed'}), 400
    
    db.session.commit()
    return jsonify({
        'name': user.name,
        'avatar_url': user.avatar_url,
    })


@app.route('/api/files/avatar/<path:filename>')
def serve_avatar(filename):
    """Serve avatar images."""
    import os
    avatar_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
    return send_from_directory(avatar_dir, filename, max_age=3600)
