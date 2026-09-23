import logging
import time
import secrets
import hashlib
import hmac as _hmac
import random
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session
from functools import wraps
import os
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import db
from models import User, MagicToken

logger = logging.getLogger('deiza.auth')

auth_bp = Blueprint('auth', __name__)

# Disable Flask's automatic OPTIONS so app-level after_request CORS handler fires
auth_bp.provide_automatic_options = False

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')

def get_secret_key() -> str:
    """The one signing secret for sessions and stateless tokens. In production the
    process refuses to start without it (a guessable default would let anyone forge
    a session for any user id)."""
    secret = os.getenv('FLASK_SECRET_KEY') or os.getenv('SECRET_KEY') or ''
    if len(secret) < 16:
        if os.getenv('FLASK_ENV', 'development') == 'production':
            raise RuntimeError('FLASK_SECRET_KEY / SECRET_KEY must be set (>= 16 chars) in production')
        secret = 'dev-secret-key-change-in-production'
    return secret


AUTH_TOKEN_TTL_SECONDS = 180 * 24 * 3600   # native app / ITP fallback: 6 months, then re-login


# Stateless auth token for mobile (bypasses WebKit ITP cookie restrictions).
# Format v2: "<uid>.<expires_unix>.<hmac>" — expiring, tamper-proof, secret-bound.
def _create_auth_token(user_id, ttl: int = AUTH_TOKEN_TTL_SECONDS):
    secret = get_secret_key().encode()
    exp = int(time.time()) + int(ttl)
    msg = f'{user_id}.{exp}'
    sig = _hmac.new(secret, msg.encode(), hashlib.sha256).hexdigest()
    return f'{msg}.{sig}'


def _verify_auth_token(token):
    try:
        uid_str, exp_str, sig = token.strip().split('.', 2)
        uid = int(uid_str)
        exp = int(exp_str)
        if exp < time.time():
            return None
        secret = get_secret_key().encode()
        expected = _hmac.new(secret, f'{uid_str}.{exp_str}'.encode(), hashlib.sha256).hexdigest()
        if _hmac.compare_digest(sig, expected):
            return uid
    except Exception:
        pass
    return None



# Login rate limiting
_login_attempts: dict = {}
LOGIN_RATE_WINDOW = 300  # 5 minutes
LOGIN_RATE_MAX = 10  # attempts per window


def check_login_rate(ip: str) -> bool:
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = []
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_attempts[ip]) >= LOGIN_RATE_MAX:
        return False
    _login_attempts[ip].append(now)
    return True


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' in session:
            return f(*args, **kwargs)
        tok = request.headers.get('X-Auth-Token', '').strip()
        if tok:
            uid = _verify_auth_token(tok)
            if uid:
                session['user_id'] = uid
                return f(*args, **kwargs)
        return jsonify({'error': 'Authentication required'}), 401
    return decorated_function


@auth_bp.route('/google', methods=['POST'])
def google_auth():
    client_ip = request.remote_addr or '0.0.0.0'
    if not check_login_rate(client_ip):
        return jsonify({'error': 'Too many login attempts. Please wait.'}), 429

    data = request.json
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    token = data.get('credential', '').strip()
    if not token:
        return jsonify({'error': 'No credential provided'}), 400

    if not GOOGLE_CLIENT_ID:
        logger.error('GOOGLE_CLIENT_ID not configured')
        return jsonify({'error': 'OAuth not configured on server'}), 500

    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID,
        )

        email = idinfo.get('email', '')
        google_id = idinfo.get('sub', '')
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')

        if not email or not google_id:
            return jsonify({'error': 'Invalid token data'}), 401

        user = User.query.filter_by(google_id=google_id).first()

        _is_new_google = False
        if not user:
            user = User(
                google_id=google_id,
                email=email,
                name=name,
                picture=picture,
            )
            db.session.add(user)
            db.session.commit()
            _is_new_google = True
            logger.info(f'New user registered: {email}')
        else:
            user.name = name
            user.picture = picture
            user.last_login = db.func.now()
            db.session.commit()

        session.permanent = True
        session['user_id'] = user.id
        session['user_email'] = user.email
        session['user_name'] = user.name
        session['user_picture'] = user.picture

        logger.info(f'User logged in: {email}')

        if _is_new_google:
            import threading
            threading.Thread(target=_send_welcome_email, args=(user.email, user.name), daemon=True).start()

        return jsonify({
            'success': True,
            'token': _create_auth_token(user.id),
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name,
                'picture': user.picture,
            },
        })

    except ValueError as e:
        logger.warning(f'Token verification failed: {e}')
        return jsonify({'error': 'Invalid or expired token'}), 401
    except Exception as e:
        logger.error(f'Auth error: {e}', exc_info=True)
        db.session.rollback()
        return jsonify({'error': 'Authentication failed'}), 500


@auth_bp.route('/status', methods=['GET'])
def auth_status():
    uid = session.get('user_id')
    if not uid:
        tok = request.headers.get('X-Auth-Token', '').strip()
        if tok:
            uid = _verify_auth_token(tok)
    if uid:
        u = User.query.get(uid)
        if u:
            return jsonify({
                'authenticated': True,
                'user': {
                    'id': u.id,
                    'email': u.email,
                    'name': u.name,
                    'picture': u.picture or '',
                    'plan': u.get_plan(),
                }
            })
    return jsonify({'authenticated': False})


@auth_bp.route('/logout', methods=['POST'])
def logout():
    user_email = session.get('user_email', 'unknown')
    session.clear()
    logger.info(f'User logged out: {user_email}')
    return jsonify({'success': True})


BYPASS_EMAILS = {e.strip().lower() for e in os.getenv('BYPASS_EMAILS', '').split(',') if e.strip()}


@auth_bp.route('/magic-link', methods=['POST'])
def request_magic_link():
    """Generate a 6-digit OTP code for login. No email needed."""
    client_ip = request.remote_addr or '0.0.0.0'
    if not check_login_rate(client_ip):
        return jsonify({'error': 'Too many attempts. Please wait.'}), 429

    data = request.json or {}
    email = data.get('email', '').strip().lower()

    if not email or '@' not in email or '.' not in email:
        return jsonify({'error': 'Valid email is required'}), 400

    # Find or create user
    user = User.query.filter_by(email=email).first()
    _is_new_otp_user = False
    if not user:
        name = email.split('@')[0].capitalize()
        user = User(email=email, name=name, google_id=None, picture=None)
        db.session.add(user)
        db.session.commit()
        _is_new_otp_user = True
        logger.info(f'New user via OTP: {email}')

    # ── Bypass directo para emails autorizados ──
    if email in BYPASS_EMAILS:
        session.permanent = True
        session['user_id'] = user.id
        session['user_email'] = user.email
        session['user_name'] = user.name
        session['user_picture'] = user.picture or ''
        logger.info(f'Bypass login for authorized email: {email}')
        return jsonify({
            'success': True,
            'bypass': True,
            'token': _create_auth_token(user.id),
            'user': {'id': user.id, 'email': user.email, 'name': user.name, 'picture': user.picture},
        })

    # Generate 6-digit OTP — store hash (HMAC-bound to SECRET_KEY)
    otp = f"{random.randint(0, 999999):06d}"
    secret = get_secret_key().encode()
    token_hash = _hmac.new(secret, otp.encode(), hashlib.sha256).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    # Invalidate old tokens
    MagicToken.query.filter_by(user_id=user.id, used=False).delete()

    magic = MagicToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    db.session.add(magic)
    db.session.commit()

    # Try to send via Resend — works in both dev and prod if API key is set
    resend_key = os.getenv('RESEND_API_KEY', '')
    env = os.getenv('FLASK_ENV', 'development')

    if resend_key:
        try:
            _send_otp_email(email, otp, user.name)
            logger.info(f'OTP sent via Resend to {email}')
            return jsonify({'success': True, 'message': 'Código enviado a tu email.'})
        except Exception as e:
            error_msg = str(e)
            logger.error(f'RESEND FAILED for {email}: {error_msg}', exc_info=True)
            # In dev or prod, fall through to console log if email fails, so we don't lock the user out.
            if env == 'production':
                # Detailed logging for common Resend errors
                if 'not verified' in error_msg.lower() or 'domain' in error_msg.lower():
                    logger.error('ACTION REQUIRED: Resend domain not verified — verify deiza.org at https://resend.com/domains')
                elif '401' in error_msg or 'unauthorized' in error_msg.lower():
                    logger.error('ACTION REQUIRED: Resend API key invalid — regenerate at https://resend.com/api-keys')
                elif '403' in error_msg or 'forbidden' in error_msg.lower():
                    logger.error('ACTION REQUIRED: Resend API key lacks permissions or domain not verified')
                elif 'timeout' in error_msg.lower() or 'connect' in error_msg.lower():
                    logger.error('ACTION REQUIRED: Cannot reach api.resend.com — check DNS/firewall in Docker')
                
                # ── EMERGENCY FALLBACK: log to server console only — NEVER expose OTP in response ──
                logger.warning('=' * 60)
                logger.warning(f'  EMERGENCY FALLBACK — OTP for {email}: {otp}')
                logger.warning(f'  (Resend API failed: {error_msg[:100]})')
                logger.warning('=' * 60)

                return jsonify({
                    'success': False,
                    'error': 'No se pudo enviar el código. Inténtalo de nuevo en unos minutos o contacta a soporte.',
                }), 503
            # Dev fallback below

    if env != 'production':
        # ── DEV MODE: log OTP to console (no email needed for local testing) ──
        logger.warning('=' * 60)
        logger.warning(f'  DEV MODE — OTP for {email}: {otp}')
        logger.warning(f'  (Set RESEND_API_KEY in .env for email delivery)')
        logger.warning('=' * 60)
        print(f'\n{"="*60}')
        print(f'  DEV OTP for {email}: {otp}')
        print(f'{"="*60}\n')
        return jsonify({
            'success': True,
            'message': f'DEV MODE: código {otp} mostrado en consola del servidor.',
            'dev_otp': otp,  # Also returned in response for easy testing
        })

    # Production without Resend key — error
    return jsonify({'error': 'Sistema de verificación no configurado. Contacta al administrador.'}), 503


# Wrong-code counter per user (a 6-digit code must never be brute-forceable in 10 min)
_otp_failures: dict = {}
OTP_MAX_FAILURES = 5


@auth_bp.route('/magic-link/verify', methods=['POST'])
def verify_magic_link():
    """Verify a 6-digit OTP and log the user in."""
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '0.0.0.0').split(',')[0].strip()
    if not check_login_rate('verify:' + client_ip):
        return jsonify({'error': 'rate'}), 429

    data = request.json or {}
    otp = (data.get('token', '') or '').strip()
    email = (data.get('email', '') or '').strip().lower()

    if not otp or not email or not otp.isdigit():
        return jsonify({'error': 'Código y email requeridos'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'Código incorrecto'}), 401

    fails, first_ts = _otp_failures.get(user.id, (0, time.time()))
    if time.time() - first_ts > 900:
        fails, first_ts = 0, time.time()
    if fails >= OTP_MAX_FAILURES:
        # Burn every open code for this user: the attacker has to trigger a new email
        MagicToken.query.filter_by(user_id=user.id, used=False).update({'used': True})
        db.session.commit()
        return jsonify({'error': 'otp_locked'}), 429

    secret = get_secret_key().encode()
    token_hash = _hmac.new(secret, otp.encode(), hashlib.sha256).hexdigest()
    magic = MagicToken.query.filter_by(user_id=user.id, token_hash=token_hash, used=False).first()

    if not magic:
        _otp_failures[user.id] = (fails + 1, first_ts)
        if len(_otp_failures) > 5000:
            _otp_failures.clear()
        return jsonify({'error': 'Código incorrecto'}), 401
    if magic.expires_at < datetime.utcnow():
        return jsonify({'error': 'Código caducado. Solicita uno nuevo.'}), 401

    magic.used = True
    db.session.commit()
    _otp_failures.pop(user.id, None)

    session.permanent = True
    session['user_id'] = user.id
    session['user_email'] = user.email
    session['user_name'] = user.name
    session['user_picture'] = user.picture or ''

    logger.info(f'User logged in via OTP: {user.email}')

    # Send welcome email for first-ever login (token_count <= 1 = just registered)
    try:
        token_count = MagicToken.query.filter_by(user_id=user.id).count()
        if token_count <= 1:
            import threading
            threading.Thread(target=_send_welcome_email, args=(user.email, user.name), daemon=True).start()
    except Exception as _we:
        logger.warning(f'Welcome email trigger error: {_we}')

    return jsonify({
        'success': True,
        'token': _create_auth_token(user.id),
        'user': {'id': user.id, 'email': user.email, 'name': user.name, 'picture': user.picture},
    })


def _send_otp_email(to_email: str, otp: str, name: str):
    """Send OTP code via Resend API."""
    import requests as req_lib
    import json

    api_key = os.getenv('RESEND_API_KEY', '')
    from_email = os.getenv('RESEND_FROM', 'noreply@deiza.org')

    # Sanitize email — strip whitespace, ensure plain format (no "Name <email>")
    to_email = to_email.strip().lower()
    if '<' in to_email:
        # Extract just the email part from "Name <email@example.com>"
        to_email = to_email.split('<')[-1].strip().rstrip('>')
    # Sanitize name — remove any characters that could break email headers
    name = (name or '').strip().replace('<', '').replace('>', '').replace('"', '')[:50]

    if not api_key:
        raise ValueError('RESEND_API_KEY not configured')

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F4F0;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4F0;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#FDFBF7;border-radius:16px;border:1px solid #E8E4DE;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#8C2F39;padding:28px 40px;text-align:center;">
            <span style="font-family:Georgia,serif;font-size:28px;color:#FDFBF7;letter-spacing:-0.5px;">Deiza</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:18px;color:#1a1a18;font-weight:bold;">Hola{', ' + name if name else ''}</p>
            <p style="margin:0 0 32px;color:#5a5a55;font-size:15px;line-height:1.6;">
              Aquí está tu código de acceso a Deiza. Introdúcelo en la pantalla de verificación.
            </p>
            <!-- OTP box -->
            <div style="background:#fff;border:1.5px solid #E8E4DE;border-radius:14px;padding:28px;text-align:center;margin-bottom:28px;">
              <span style="font-size:52px;letter-spacing:16px;font-weight:bold;color:#8C2F39;font-family:Georgia,serif;">{otp}</span>
            </div>
            <p style="margin:0 0 8px;color:#5a5a55;font-size:13px;line-height:1.6;">
              Válido durante <strong>10 minutos</strong>.
            </p>
            <p style="margin:0;color:#aaa;font-size:12px;">
              Si no solicitaste este código, puedes ignorar este correo con total seguridad.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #E8E4DE;text-align:center;">
            <p style="margin:0;color:#bbb;font-size:11px;">
              2026 Deiza · <a href="https://deiza.org" style="color:#8C2F39;text-decoration:none;">deiza.org</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    resp = req_lib.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'from': f'Deiza <{from_email}>',
            'to': [to_email],
            'subject': f'{otp} — tu código de acceso a Deiza',
            'html': html,
        },
        timeout=30,
    )

    if resp.status_code >= 400:
        logger.error(f'Resend API error {resp.status_code}: {resp.text}')
        raise Exception(f'Resend error {resp.status_code}: {resp.text[:200]}')

    result = resp.json()
    logger.info(f'Resend email sent, id={result.get("id")}')


def _send_welcome_email(to_email: str, name: str):
    """Send a warm welcome email to new users via Resend."""
    import requests as req_lib
    api_key = os.getenv('RESEND_API_KEY', '')
    from_email = os.getenv('RESEND_FROM', 'noreply@deiza.org')
    frontend_url = os.getenv('FRONTEND_URL', 'https://deiza.org')
    to_email = to_email.strip().lower()
    if '<' in to_email:
        to_email = to_email.split('<')[-1].strip().rstrip('>')
    name = (name or '').strip().replace('<', '').replace('>', '')[:50]
    display_name = name or 'amigo'
    if not api_key:
        logger.warning('RESEND_API_KEY not set - skipping welcome email')
        return
    html_parts = [
        '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>',
        '<body style="margin:0;padding:0;background:#F7F4F0;font-family:Georgia,serif;">',
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4F0;padding:40px 0;">',
        '<tr><td align="center">',
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#FDFBF7;border-radius:16px;border:1px solid #E8E4DE;overflow:hidden;">',
        '<tr><td style="background:#8C2F39;padding:32px 40px;text-align:center;">',
        '<span style="font-family:Georgia,serif;font-size:32px;color:#FDFBF7;letter-spacing:-0.5px;">Deiza</span>',
        '</td></tr>',
        '<tr><td style="padding:40px 40px 32px;">',
        f'<p style="margin:0 0 16px;font-size:22px;color:#1a1a18;font-weight:bold;">Bienvenido, {display_name} &#127801;</p>',
        '<p style="margin:0 0 20px;color:#5a5a55;font-size:15px;line-height:1.7;">',
        'Nos alegra mucho que estes aqui. Deiza es tu asistente de inteligencia artificial personal: ',
        'escribe, aprende, crea codigo, genera presentaciones o simplemente conversa.</p>',
        '<p style="margin:0 0 28px;color:#5a5a55;font-size:15px;line-height:1.7;">',
        'Todo empieza con una pregunta. La tuya, cual es?</p>',
        '<div style="text-align:center;margin-bottom:32px;">',
        f'<a href="{frontend_url}/workspace" style="display:inline-block;background:#8C2F39;color:#FDFBF7;',
        'text-decoration:none;padding:14px 36px;border-radius:50px;font-size:15px;font-family:Georgia,serif;">',
        'Empezar a usar Deiza &rarr;</a></div>',
        '</td></tr>',
        '<tr><td style="padding:20px 40px;border-top:1px solid #E8E4DE;text-align:center;">',
        f'<p style="margin:0;color:#bbb;font-size:11px;">2026 Deiza &middot; <a href="{frontend_url}" style="color:#8C2F39;text-decoration:none;">deiza.org</a></p>',
        '</td></tr></table></td></tr></table></body></html>',
    ]
    html = ''.join(html_parts)
    try:
        resp = req_lib.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'from': f'Deiza <{from_email}>', 'to': [to_email],
                  'subject': f'Bienvenido a Deiza, {display_name}',
                  'html': html},
            timeout=30,
        )
        if resp.status_code >= 400:
            logger.error(f'Welcome email failed {resp.status_code}: {resp.text[:200]}')
        else:
            logger.info(f'Welcome email sent to {to_email}, id={resp.json().get("id")}')
    except Exception as e:
        logger.error(f'Welcome email exception: {e}')



def _send_magic_email(to_email: str, magic_url: str, name: str):
    """Send magic link email. Uses SMTP if configured, otherwise raises."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    smtp_host = os.getenv('SMTP_HOST', '')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_pass = os.getenv('SMTP_PASS', '')
    from_email = os.getenv('SMTP_FROM', smtp_user)

    if not smtp_host:
        raise ValueError('SMTP not configured')

    html = f"""
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#FDFBF7;">
      <img src="https://deiza.app/deiza-favicon.svg" width="48" style="margin-bottom:24px;" />
      <h1 style="font-size:24px;color:#1a1a18;margin-bottom:8px;">Hola, {name} 🌹</h1>
      <p style="color:#5a5a55;font-size:15px;line-height:1.7;">
        Aquí está tu enlace de acceso a Deiza. Válido 15 minutos.
      </p>
      <a href="{magic_url}"
         style="display:inline-block;margin:24px 0;padding:14px 32px;background:#8C2F39;color:#fff;border-radius:9999px;text-decoration:none;font-size:15px;">
        Entrar a Deiza →
      </a>
      <p style="color:#aaa;font-size:12px;">Si no lo pediste, ignora este correo.</p>
    </div>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Tu acceso a Deiza 🌹'
    msg['From'] = f'Deiza <{from_email}>'
    msg['To'] = to_email
    msg.attach(MIMEText(html, 'html'))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_email, to_email, msg.as_string())


APPLE_AUDIENCES = {a.strip() for a in os.getenv('APPLE_CLIENT_IDS', 'org.deiza.app').split(',') if a.strip()}


@auth_bp.route('/apple', methods=['POST'])
def apple_auth():
    """Sign in with Apple (iOS app): verify the identity token against Apple's public
    keys, then create/link the account by the stable Apple user id (`sub`)."""
    client_ip = request.remote_addr or '0.0.0.0'
    if not check_login_rate(client_ip):
        return jsonify({'error': 'Too many login attempts. Please wait.'}), 429
    data = request.json or {}
    token = (data.get('identity_token') or '').strip()
    display_name = (data.get('name') or '').strip()[:100]
    if not token:
        return jsonify({'error': 'No credential provided'}), 400
    try:
        import jwt as _jwt
        from jwt import PyJWKClient as _JWKClient
        jwks = _JWKClient('https://appleid.apple.com/auth/keys', cache_keys=True)
        signing_key = jwks.get_signing_key_from_jwt(token)
        claims = _jwt.decode(token, signing_key.key, algorithms=['RS256'], audience=list(APPLE_AUDIENCES),
                             issuer='https://appleid.apple.com')
    except Exception as e:
        logger.warning(f'Apple token verification failed: {e}')
        return jsonify({'error': 'Invalid or expired token'}), 401

    apple_id = claims.get('sub') or ''
    email = (claims.get('email') or '').strip().lower()
    if not apple_id:
        return jsonify({'error': 'Invalid token data'}), 401

    user = User.query.filter_by(apple_id=apple_id).first()
    _is_new = False
    if not user and email:
        user = User.query.filter_by(email=email).first()   # same person who used the email code before
        if user:
            user.apple_id = apple_id
    if not user:
        if not email:
            # Apple only sends the email the first time; without it we cannot create an account
            return jsonify({'error': 'apple_email_required'}), 400
        name = display_name or email.split('@')[0].capitalize()
        user = User(apple_id=apple_id, email=email, name=name, google_id=None, picture=None)
        db.session.add(user)
        _is_new = True
    elif display_name and (not user.name or user.name == user.email.split('@')[0].capitalize()):
        user.name = display_name
    user.last_login = db.func.now()
    db.session.commit()

    session.permanent = True
    session['user_id'] = user.id
    session['user_email'] = user.email
    session['user_name'] = user.name
    session['user_picture'] = user.picture or ''
    logger.info(f'User logged in via Apple: {user.email}')
    if _is_new:
        import threading
        threading.Thread(target=_send_welcome_email, args=(user.email, user.name), daemon=True).start()
    return jsonify({
        'success': True,
        'token': _create_auth_token(user.id),
        'user': {'id': user.id, 'email': user.email, 'name': user.name, 'picture': user.picture},
    })


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    user = db.session.get(User, session['user_id'])
    if not user:
        session.clear()
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'picture': user.picture,
        'avatar_url': user.avatar_url,
        'created_at': user.created_at.isoformat(),
        'total_chats': len(user.chats),
        'plan': user.get_plan(),
    })


@auth_bp.route('/me', methods=['PATCH'])
@login_required
def update_current_user():
    """Update the authenticated user's display name."""
    data = request.json or {}
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if len(name) > 100:
        return jsonify({'error': 'Name too long (max 100 characters)'}), 400

    user = db.session.get(User, session['user_id'])
    if not user:
        session.clear()
        return jsonify({'error': 'User not found'}), 404

    user.name = name
    session['user_name'] = name
    db.session.commit()

    logger.info(f'User {user.email} updated display name to: {name}')
    return jsonify({'success': True, 'name': name})
