"""Deiza Work: the user's own hands on the live browser of a Work chat (deiza work v1).

POST /api/work/browser/<chat_id>   {"action": "open"|"click"|"type"|"key"|"scroll"|"back"|"forward"|"reload"|"shot"|"status"|"close", ...}
Returns the browser state ({url, title, shot (JPEG base64), w, h}). Only the owner of a Work chat
can drive its browser; the session is the same one the agent uses, so both see the same page.
"""
import time
import re
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
    @app.route('/api/work/local/pending', methods=['GET'])
    @auth_decorator
    def work_local_pending():
        """Recover local browser requests independently of the active chat's SSE connection."""
        import json
        from models import Chat
        import work_agent
        uid = session.get('user_id')
        pending = []
        try:
            r = work_agent._redis()
            index = f'deiza:work:lbpending:{int(uid)}'
            for raw_id in list(r.smembers(index))[:100]:
                rid = raw_id.decode() if isinstance(raw_id, bytes) else str(raw_id)
                if not re.fullmatch(r'[a-f0-9]{32}', rid):
                    r.srem(index, raw_id)
                    continue
                raw = r.get(f'deiza:work:lbreq:{rid}')
                record = json.loads(raw) if raw else {}
                chat_id = record.get('chat_id')
                chat = Chat.query.filter_by(id=chat_id, user_id=uid).first() if chat_id else None
                if (record.get('user_id') != uid or float(record.get('expires_at', 0)) <= time.time()
                        or not chat or getattr(chat, 'mode', None) != 'work' or not work_agent.local_request_active(record)):
                    r.srem(index, rid)
                    continue
                pending.append({k: record[k] for k in ('id', 'chat_id', 'action', 'args', 'expires_at')})
        except Exception as exc:
            logger.warning('work pending lookup failed: %s', type(exc).__name__)
            return jsonify({'error': 'unavailable'}), 503
        return jsonify({'requests': pending})

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
        # The user's own actions only need the new picture: no element list, short settle.
        args['light'] = True
        vp = data.get('viewport') or {}
        try:
            if vp.get('w') and vp.get('h'):
                args['viewport'] = {'w': int(vp['w']), 'h': int(vp['h'])}
        except (TypeError, ValueError):
            pass
        try:
            st = work_agent.browser(work_agent.session_id(uid, chat_id), action, **args)
        except Exception as e:  # noqa: BLE001
            logger.warning('work browser action %s failed: %s', action, e)
            return jsonify({'error': 'browser_unavailable'}), 503
        return jsonify(st)

    @app.route('/api/work/steer/<int:chat_id>', methods=['POST'])
    @auth_decorator
    def work_steer(chat_id):
        """work continuity v1: a message written while the Work job of this chat runs; the agent reads it
        at its next step. {"idle": true} when nothing runs (the page sends it as a normal message)."""
        import json as _json
        from models import Chat, Message
        from database import db
        import work_agent
        uid = session.get('user_id')
        chat = Chat.query.filter_by(id=chat_id, user_id=uid).first()
        if not chat:
            return jsonify({'error': 'not_found'}), 404
        text = str((request.get_json(silent=True) or {}).get('text') or '').strip()[:8000]
        if not text:
            return jsonify({'error': 'empty'}), 400
        try:
            r = work_agent._redis()
            gen = r.get(f'deiza:gen:{chat_id}')
            if not gen or (_json.loads(gen) or {}).get('status') != 'generating':
                return jsonify({'idle': True})
            work_agent.steer_push(chat_id, text)
        except Exception as e:  # noqa: BLE001
            logger.warning('work steer failed: %s', e)
            return jsonify({'error': 'unavailable'}), 503
        msg = Message(chat_id=chat_id, role='user', content=text)
        db.session.add(msg)
        db.session.commit()
        return jsonify({'ok': True, 'id': msg.id})

    @app.route('/api/work/local/<int:chat_id>/<rid>', methods=['POST'])
    @auth_decorator
    def work_local_browser_result(chat_id, rid):
        """local browser v1: Deiza for desktop answers a browser request of this chat's agent."""
        import work_agent
        uid = session.get('user_id')
        if request.content_length and request.content_length > 8 * 1024 * 1024:
            return jsonify({'error': 'too_large'}), 413
        data = request.get_json(silent=True) or {}
        result = data.get('result')
        if not isinstance(result, dict):
            return jsonify({'error': 'bad_result'}), 400
        keep = {k: result[k] for k in ('url', 'title', 'shot', 'w', 'h', 'elements', 'text', 'links', 'imgs', 'error') if k in result}
        if isinstance(keep.get('shot'), str) and len(keep['shot']) > 6 * 1024 * 1024:
            keep.pop('shot')
        if not work_agent.local_browser_result(uid, chat_id, rid, keep):
            return jsonify({'error': 'unknown_request'}), 404
        return jsonify({'ok': True})
