"""Deiza Work browser service: one Chromium shared by every gunicorn worker.

Runs as its own process inside the backend container (started on demand by work_client.py):
  - API on 127.0.0.1:5077 (container only): POST /s/<session>/<action> with a JSON body.
  - Filtering proxy on 127.0.0.1:5078. Chromium sends every request through it (loopback
    included), and the proxy resolves DNS itself and only connects to public addresses, so a
    page can never reach the backend, redis, searxng or any other container of the server
    (no SSRF, DNS rebinding included because the checked IP is the one it connects to).

Playwright's sync API is not thread-safe, so a single thread owns the browser and the HTTP
threads hand it jobs through a queue.
"""
import base64
import ipaddress
import json
import logging
import os
import queue
import select
import socket
import socketserver
import threading
import time
from concurrent.futures import Future
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

API_PORT = int(os.getenv('WORK_BROWSER_PORT', '5077'))
PROXY_PORT = int(os.getenv('WORK_PROXY_PORT', '5078'))
MAX_SESSIONS = int(os.getenv('WORK_BROWSER_SESSIONS', '3'))
IDLE_SESSION = 600        # seconds before an unused session is closed
IDLE_BROWSER = 900        # seconds without sessions before Chromium itself is closed
VIEW_W, VIEW_H = 1280, 800
ALLOWED_PORTS = {80, 443, 8080, 8443}
KEYS = {'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'PageUp', 'PageDown', 'Home', 'End', 'Space'}

logging.basicConfig(level=logging.INFO, format='%(asctime)s [work-browser] %(message)s')
log = logging.getLogger('work_browser')


# ── Filtering proxy ──────────────────────────────────────────────────────────

def public_address(host: str, port: int):
    """(ip, port) for host only if every address it resolves to is public."""
    if not host or port not in ALLOWED_PORTS:
        raise PermissionError('port not allowed')
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not infos:
        raise PermissionError('no address')
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if getattr(ip, 'ipv4_mapped', None):
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            raise PermissionError(f'blocked address {ip}')
    fam, _, _, _, sockaddr = infos[0]
    return fam, sockaddr


def _pipe(a, b, idle=60):
    socks = [a, b]
    last = time.time()
    try:
        while time.time() - last < idle:
            r, _, x = select.select(socks, [], socks, 5)
            if x:
                break
            for s in r:
                data = s.recv(65536)
                if not data:
                    return
                (b if s is a else a).sendall(data)
                last = time.time()
    except OSError:
        pass


class ProxyHandler(socketserver.BaseRequestHandler):
    def handle(self):
        client = self.request
        client.settimeout(20)
        try:
            head = b''
            while b'\r\n\r\n' not in head and len(head) < 65536:
                chunk = client.recv(4096)
                if not chunk:
                    return
                head += chunk
            header, _, rest = head.partition(b'\r\n\r\n')
            lines = header.decode('latin-1').split('\r\n')
            method, target, version = lines[0].split(' ', 2)
            if method.upper() == 'CONNECT':
                host, _, port = target.rpartition(':')
                host = host.strip('[]')
                fam, addr = public_address(host, int(port or 443))
                upstream = socket.socket(fam, socket.SOCK_STREAM)
                upstream.settimeout(15)
                upstream.connect(addr)
                upstream.settimeout(None)
                client.sendall(b'HTTP/1.1 200 Connection established\r\n\r\n')
                client.settimeout(None)
                if rest:
                    upstream.sendall(rest)
                _pipe(client, upstream)
                upstream.close()
                return
            u = urlsplit(target)
            if u.scheme != 'http' or not u.hostname:
                raise PermissionError('bad request')
            fam, addr = public_address(u.hostname, u.port or 80)
            upstream = socket.socket(fam, socket.SOCK_STREAM)
            upstream.settimeout(15)
            upstream.connect(addr)
            upstream.settimeout(None)
            path = (u.path or '/') + (('?' + u.query) if u.query else '')
            out = [f'{method} {path} {version}']
            for line in lines[1:]:
                k = line.split(':', 1)[0].strip().lower()
                if k in ('proxy-connection', 'proxy-authorization', 'connection', 'keep-alive'):
                    continue
                out.append(line)
            out.append('Connection: close')  # one upstream per request: never reuse it for another host
            upstream.sendall(('\r\n'.join(out) + '\r\n\r\n').encode('latin-1') + rest)
            client.settimeout(None)
            _pipe(client, upstream)
            upstream.close()
        except PermissionError as e:
            log.info('proxy refused: %s', e)
            try:
                client.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            except OSError:
                pass
        except Exception as e:  # noqa: BLE001
            try:
                client.sendall(b'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            except OSError:
                pass
            log.debug('proxy error: %s', e)


class ThreadingProxy(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


# ── Browser owner thread ─────────────────────────────────────────────────────

class BrowserOwner(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.jobs = queue.Queue()
        self.sessions = {}      # sid -> {'ctx', 'page', 'last'}
        self.browser = None
        self.pw = None
        self.idle_since = time.time()

    def submit(self, sid, action, args):
        f = Future()
        self.jobs.put((sid, action, args, f))
        return f

    # Chromium lifecycle
    def _ensure_browser(self):
        if self.browser and self.browser.is_connected():
            return
        if self.pw is None:
            from playwright.sync_api import sync_playwright
            self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(args=[
            '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
            f'--proxy-server=http://127.0.0.1:{PROXY_PORT}', '--proxy-bypass-list=<-loopback>',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            '--disable-features=MediaRouter,DialMediaRouteProvider', '--no-first-run', '--mute-audio',
        ])
        log.info('chromium started')

    def _session(self, sid, create=True):
        s = self.sessions.get(sid)
        if s:
            s['last'] = time.time()
            try:
                if s['page'].is_closed():
                    s['page'] = s['ctx'].new_page()
            except Exception:
                pass
            return s
        if not create:
            return None
        self._ensure_browser()
        while len(self.sessions) >= MAX_SESSIONS:
            oldest = min(self.sessions, key=lambda k: self.sessions[k]['last'])
            self._close(oldest)
        ctx = self.browser.new_context(viewport={'width': VIEW_W, 'height': VIEW_H}, locale='es-ES',
                                       accept_downloads=False, service_workers='block',
                                       timezone_id='Europe/Madrid')
        ctx.set_default_timeout(25000)
        page = ctx.new_page()
        s = {'ctx': ctx, 'page': page, 'last': time.time()}

        def on_page(p):
            s['page'] = p          # links that open a new tab continue in that tab
        ctx.on('page', on_page)
        self.sessions[sid] = s
        return s

    def _close(self, sid):
        s = self.sessions.pop(sid, None)
        if s:
            try:
                s['ctx'].close()
            except Exception:
                pass

    def _housekeeping(self):
        now = time.time()
        for sid in [k for k, v in self.sessions.items() if now - v['last'] > IDLE_SESSION]:
            self._close(sid)
        if self.sessions:
            self.idle_since = now
        elif self.browser and now - self.idle_since > IDLE_BROWSER:
            try:
                self.browser.close()
            except Exception:
                pass
            self.browser = None
            log.info('chromium closed (idle)')

    def run(self):
        while True:
            try:
                sid, action, args, f = self.jobs.get(timeout=30)
            except queue.Empty:
                self._housekeeping()
                continue
            try:
                f.set_result(self._do(sid, action, args or {}))
            except Exception as e:  # noqa: BLE001
                log.info('action %s failed: %s', action, e)
                try:
                    shot = self._state(self.sessions[sid]['page'], True) if sid in self.sessions else {}
                except Exception:
                    shot = {}
                f.set_result(dict(shot, error=str(e)[:300]))
            self._housekeeping()

    @staticmethod
    def _settle(page, ms=700):
        try:
            page.wait_for_load_state('domcontentloaded', timeout=6000)
        except Exception:
            pass
        page.wait_for_timeout(ms)

    @staticmethod
    def _state(page, shot=True):
        out = {'url': page.url, 'title': ''}
        try:
            out['title'] = page.title()[:200]
        except Exception:
            pass
        if shot:
            img = page.screenshot(type='jpeg', quality=62)
            out['shot'] = base64.b64encode(img).decode()
            out['w'], out['h'] = VIEW_W, VIEW_H
        return out

    def _do(self, sid, action, a):
        if action == 'close':
            self._close(sid)
            return {'closed': True}
        if action == 'status':
            s = self.sessions.get(sid)
            return {'open': bool(s), **(self._state(s['page'], bool(a.get('shot'))) if s else {})}
        s = self._session(sid, create=(action not in ('shot',)))
        if s is None:
            return {'open': False}
        page = s['page']
        if action == 'open':
            url = str(a.get('url') or '').strip()
            if url and '://' not in url:
                url = 'https://' + url
            if urlsplit(url).scheme not in ('http', 'https'):
                raise ValueError('only http and https pages can be opened')
            try:
                page.goto(url, wait_until='domcontentloaded', timeout=25000)
            except Exception as e:  # noqa: BLE001
                if 'ERR_' in str(e) or 'Timeout' in str(e):
                    raise ValueError(f'page did not load: {str(e)[:160]}')
                raise
            self._settle(page, 900)
        elif action == 'click':
            x, y = float(a.get('x', 0)), float(a.get('y', 0))
            if not (0 <= x <= VIEW_W and 0 <= y <= VIEW_H):
                raise ValueError('click outside the page')
            page.mouse.click(x, y)
            self._settle(page)
        elif action == 'type':
            text = str(a.get('text') or '')[:2000]
            if a.get('clear'):
                page.keyboard.press('Control+A')
                page.keyboard.press('Backspace')
            page.keyboard.type(text, delay=8)
            if a.get('submit'):
                page.keyboard.press('Enter')
                self._settle(page, 1200)
            else:
                page.wait_for_timeout(250)
        elif action == 'key':
            key = str(a.get('key') or '')
            if key not in KEYS:
                raise ValueError('key not allowed')
            page.keyboard.press(' ' if key == 'Space' else key)
            self._settle(page, 400)
        elif action == 'scroll':
            dy = max(-4000, min(4000, int(a.get('dy') or 600)))
            page.mouse.wheel(0, dy)
            page.wait_for_timeout(450)
        elif action == 'back':
            page.go_back(wait_until='domcontentloaded', timeout=15000)
            self._settle(page, 500)
        elif action == 'forward':
            page.go_forward(wait_until='domcontentloaded', timeout=15000)
            self._settle(page, 500)
        elif action == 'reload':
            page.reload(wait_until='domcontentloaded', timeout=20000)
            self._settle(page, 600)
        elif action == 'read':
            data = page.evaluate("""() => {
                const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n');
                const links = [...document.querySelectorAll('a[href]')].slice(0, 400)
                  .map(a => ({t: (a.innerText || a.title || '').trim().slice(0, 80), u: a.href}))
                  .filter(l => l.t && /^https?:/.test(l.u)).slice(0, 60);
                const imgs = [...document.images].filter(i => i.naturalWidth >= 300 && i.naturalHeight >= 200)
                  .slice(0, 24).map(i => ({u: i.currentSrc || i.src, alt: (i.alt || '').slice(0, 100), w: i.naturalWidth, h: i.naturalHeight}))
                  .filter(i => /^https?:/.test(i.u));
                return {text: text.slice(0, 16000), links, imgs};
            }""")
            out = self._state(page, bool(a.get('shot')))
            out.update(data)
            return out
        elif action == 'shot':
            pass
        else:
            raise ValueError('unknown action')
        return self._state(page, True)


OWNER = BrowserOwner()


class Api(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, {'ok': True, 'sessions': len(OWNER.sessions), 'browser': bool(OWNER.browser)})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        parts = self.path.strip('/').split('/')
        if len(parts) != 3 or parts[0] != 's':
            return self._send(404, {'error': 'not found'})
        sid, action = parts[1][:80], parts[2][:20]
        n = int(self.headers.get('Content-Length') or 0)
        try:
            args = json.loads(self.rfile.read(min(n, 100000)) or b'{}') if n else {}
        except ValueError:
            args = {}
        f = OWNER.submit(sid, action, args)
        try:
            self._send(200, f.result(timeout=60))
        except Exception as e:  # noqa: BLE001
            self._send(504, {'error': f'browser busy: {e}'})


def main():
    proxy = ThreadingProxy(('127.0.0.1', PROXY_PORT), ProxyHandler)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    OWNER.start()
    api = ThreadingHTTPServer(('127.0.0.1', API_PORT), Api)
    api.daemon_threads = True
    log.info('listening on %s (proxy %s)', API_PORT, PROXY_PORT)
    api.serve_forever()


if __name__ == '__main__':
    main()
