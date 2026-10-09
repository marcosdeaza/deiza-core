"""
Web and image search for Deiza Code (CLI and desktop).

- POST /api/code/search   {"query": str, "type": "images"|"web", "num": int, "language": str}

Images come from the same verified pipeline as the chat (SearXNG image engines, stock filter,
Wikimedia thumbnails, every URL connectivity-checked). Web answers use the chat's grounded
search, with the plain SearXNG results as a fallback.
"""
import time
import logging
import threading
from collections import defaultdict, deque

from flask import request, jsonify, session

logger = logging.getLogger('deiza.code_search')

_RATE = 40            # searches per user per minute
_hits = defaultdict(deque)
_lock = threading.Lock()


def _allowed(uid):
    now = time.time()
    with _lock:
        q = _hits[uid]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= _RATE:
            return False
        q.append(now)
        return True


def register_code_search(app, auth_decorator):
    @app.route('/api/code/search', methods=['POST'])
    @app.route('/api/code/v1/search', methods=['POST'], endpoint='code_search_v1')
    @app.route('/api/v1/search', methods=['POST'], endpoint='code_search_api_v1')
    @auth_decorator
    def code_search():
        uid = session.get('user_id')
        data = request.get_json(silent=True) or {}
        query = str(data.get('query') or '').strip()[:300]
        kind = str(data.get('type') or 'images').strip().lower()
        language = str(data.get('language') or 'es').strip().lower()[:5] or 'es'
        try:
            num = max(1, min(int(data.get('num') or 6), 12))
        except (TypeError, ValueError):
            num = 6
        if not query:
            return jsonify({'error': 'query is required'}), 400
        if kind not in ('images', 'web'):
            return jsonify({'error': 'type must be images or web'}), 400
        if not _allowed(uid):
            return jsonify({'error': 'rate_limited', 'message': 'Demasiadas búsquedas seguidas. Espera un minuto.'}), 429

        started = time.time()
        if kind == 'images':
            from search_service import _search_images
            results = _search_images(query, num, language)
            logger.info('code image search uid=%s %r -> %d in %.1fs', uid, query, len(results), time.time() - started)
            return jsonify({'type': 'images', 'query': query, 'results': results})

        from search_service import _grounding_search, _text_search
        overview, sources = '', []
        try:
            overview, sources, _primary = _grounding_search(query, [], language, timeout=14)
        except Exception as e:
            logger.warning('code web search grounding failed for %r: %s', query, e)
        results = [{'title': s.get('title', ''), 'url': s.get('url', '')} for s in (sources or []) if s.get('url')]
        if not results:
            results = _text_search(query, num)
        logger.info('code web search uid=%s %r -> %d in %.1fs', uid, query, len(results), time.time() - started)
        return jsonify({'type': 'web', 'query': query, 'answer': overview or '', 'results': results[:num]})
