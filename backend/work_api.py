"""Deiza Work: the user's own hands on the live browser of a Work chat (deiza work v1).

POST /api/work/browser/<chat_id>   {"action": "open"|"click"|"type"|"key"|"scroll"|"back"|"forward"|"reload"|"shot"|"status"|"close", ...}
Returns the browser state ({url, title, shot (JPEG base64), w, h}). Only the owner of a Work chat
can drive its browser; the session is the same one the agent uses, so both see the same page.
"""
import time
import logging
import threading
from collections import defaultdict, deque

from flask import request, jsonify, session

logger = logging.getLogger('deiza.work_api')

_RATE = 150           # actions per user per minute
_hits = defaultdict(deque)
_lock = threading.Lock()
_ACTIONS = {'open', 'click', 'type', 'key', 'scroll', 'back', 'forward', 'reload', 'shot', 'status', 'close'}


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


def register_work(app, auth_decorator):
    @app.route('/api/work/browser/<int:chat_id>', methods=['POST'])
    @auth_decorator
    def work_browser_action(chat_id):
        from models import Chat
        import work_agent
        uid = session.get('user_id')
        chat = Chat.query.filter_by(id=chat_id, user_id=uid).first()
        if not chat or (getattr(chat, 'mode', None) or 'chat') != 'work':
            return jsonify({'error': 'not_found'}), 404
        data = request.get_json(silent=True) or {}
        action = str(data.get('action') or 'status')
        if action not in _ACTIONS:
            return jsonify({'error': 'bad_action'}), 400
        if not _allowed(uid):
            return jsonify({'error': 'rate_limited'}), 429
        args = {}
        if action == 'open':
            args['url'] = str(data.get('url') or '')[:2000]
        elif action == 'click':
            args.update(x=float(data.get('x') or 0), y=float(data.get('y') or 0))
        elif action == 'type':
            args.update(text=str(data.get('text') or '')[:2000], submit=bool(data.get('submit')))
        elif action == 'key':
            args['key'] = str(data.get('key') or '')[:20]
        elif action == 'scroll':
            args['dy'] = int(data.get('dy') or 600)
        elif action == 'status':
            args['shot'] = True
        try:
            st = work_agent.browser(work_agent.session_id(uid, chat_id), action, **args)
        except Exception as e:  # noqa: BLE001
            logger.warning('work browser action %s failed: %s', action, e)
            return jsonify({'error': 'browser_unavailable'}), 503
        return jsonify(st)
