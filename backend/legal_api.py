"""
Legal / privacy endpoints for Deiza.

- POST /api/legal/consent        record a consent (withdrawal waiver, terms) with version, IP, UA
- GET  /api/legal/consents       the caller's own consent records
- GET  /api/account/export       everything we hold about the user, as JSON (RGPD art. 15/20)
- DELETE /api/account            erase the account and all its data (RGPD art. 17)

`require_withdrawal_waiver(user_id)` is used by the Stripe checkout routes: no recent,
recorded waiver → no checkout (art. 103.m TRLGDCU).
"""
import os
import json
import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, session, Response
from database import db
from auth import login_required

logger = logging.getLogger('deiza.legal')
legal_bp = Blueprint('legal', __name__)

WAIVER_MAX_AGE = timedelta(hours=2)   # the checkout must follow the confirmation closely
VALID_KINDS = ('withdrawal_waiver', 'terms', 'privacy')


class LegalConsent(db.Model):
    __tablename__ = 'legal_consents'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    kind = db.Column(db.String(40), nullable=False)
    version = db.Column(db.String(20), nullable=False)
    plan = db.Column(db.String(20))
    gift = db.Column(db.Boolean, default=False)
    language = db.Column(db.String(8))
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {'id': self.id, 'kind': self.kind, 'version': self.version, 'plan': self.plan,
                'gift': bool(self.gift), 'language': self.language, 'ip': self.ip,
                'created_at': self.created_at.isoformat() if self.created_at else None}


def _client_ip() -> str:
    return (request.headers.get('X-Forwarded-For', request.remote_addr or '0.0.0.0').split(',')[0].strip())[:64]


@legal_bp.route('/consent', methods=['POST'])
@login_required
def record_consent():
    data = request.get_json(silent=True) or {}
    kind = (data.get('kind') or '').strip()
    version = (data.get('version') or '').strip()[:20]
    if kind not in VALID_KINDS or not version:
        return jsonify({'error': 'invalid consent'}), 400
    row = LegalConsent(user_id=session['user_id'], kind=kind, version=version,
                       plan=(data.get('plan') or '')[:20] or None, gift=bool(data.get('gift')),
                       language=(data.get('language') or '')[:8] or None,
                       ip=_client_ip(), user_agent=(request.headers.get('User-Agent') or '')[:300])
    db.session.add(row)
    db.session.commit()
    return jsonify({'ok': True, 'id': row.id, 'at': row.created_at.isoformat()})


@legal_bp.route('/consents', methods=['GET'])
@login_required
def list_consents():
    rows = LegalConsent.query.filter_by(user_id=session['user_id']).order_by(LegalConsent.created_at.desc()).limit(50).all()
    return jsonify({'consents': [r.to_dict() for r in rows]})


def require_withdrawal_waiver(user_id: int, plan_key: str = None, gift: bool = False):
    """Return None when a fresh waiver exists, else a (json, status) tuple to return."""
    cutoff = datetime.utcnow() - WAIVER_MAX_AGE
    q = LegalConsent.query.filter(LegalConsent.user_id == user_id,
                                  LegalConsent.kind == 'withdrawal_waiver',
                                  LegalConsent.created_at >= cutoff)
    if plan_key:
        q = q.filter(LegalConsent.plan == plan_key)
    q = q.filter(LegalConsent.gift == bool(gift))
    if q.first() is None:
        return jsonify({'error': 'consent_required', 'detail': 'withdrawal_waiver'}), 428
    return None


# ── Data export (RGPD art. 15 & 20) and erasure (art. 17) ────────────────────
def register_account_routes(app):
    from models import (User, UserPlan, UsageWindow, UserMemory, UserSkills, UserConversation,
                        Chat, Message, MagicToken, GiftCode, SharedArtifact, SharedConversation,
                        Project, ProjectFile, ApiKey)

    def _uploads_dir():
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')

    def _file_refs_from(obj) -> set:
        """Collect /api/files/<fid> references inside JSON-ish data (artifacts, attachments)."""
        refs = set()
        try:
            txt = json.dumps(obj) if not isinstance(obj, str) else obj
        except Exception:
            return refs
        import re
        for m in re.finditer(r'/api/files/([A-Za-z0-9_.-]+)', txt):
            refs.add(m.group(1))
        return refs

    @app.route('/api/account/export', methods=['GET'])
    @login_required
    def account_export():
        uid = session['user_id']
        user = User.query.get(uid)
        if not user:
            return jsonify({'error': 'not found'}), 404
        chats = Chat.query.filter_by(user_id=uid).order_by(Chat.created_at).all()
        chat_dump = []
        for c in chats:
            msgs = Message.query.filter_by(chat_id=c.id).order_by(Message.created_at).all()
            chat_dump.append({
                'id': c.id, 'title': getattr(c, 'title', None),
                'created_at': c.created_at.isoformat() if getattr(c, 'created_at', None) else None,
                'project_id': getattr(c, 'project_id', None),
                'messages': [{
                    'role': m.role, 'content': m.content,
                    'artifact': m.artifact_data, 'attachments': m.attachments_data,
                    'created_at': m.created_at.isoformat() if m.created_at else None,
                } for m in msgs],
            })
        projects = [p.to_dict(with_files=True) for p in Project.query.filter_by(user_id=uid).all()]
        plan = UserPlan.query.filter_by(user_id=uid).first()
        memory = UserMemory.query.filter_by(user_id=uid).first()
        skills = UserSkills.query.filter_by(user_id=uid).first()
        convos = UserConversation.query.filter_by(user_id=uid).all()
        consents = LegalConsent.query.filter_by(user_id=uid).order_by(LegalConsent.created_at).all()
        shares = {
            'artifacts': [{'slug': s.slug, 'title': getattr(s, 'title', None), 'created_at': s.created_at.isoformat() if getattr(s, 'created_at', None) else None}
                          for s in SharedArtifact.query.filter_by(created_by_user_id=uid).all()],
            'conversations': [{'slug': s.slug, 'created_at': s.created_at.isoformat() if getattr(s, 'created_at', None) else None}
                              for s in SharedConversation.query.filter_by(created_by_user_id=uid).all()],
        }
        payload = {
            'exported_at': datetime.utcnow().isoformat() + 'Z',
            'account': {'id': user.id, 'email': user.email, 'name': user.name, 'picture': user.picture,
                        'created_at': user.created_at.isoformat() if user.created_at else None,
                        'last_login': user.last_login.isoformat() if user.last_login else None,
                        'plan': (plan.to_dict() if plan and hasattr(plan, 'to_dict') else (getattr(plan, 'plan', None) if plan else 'free'))},
            'chats': chat_dump,
            'projects': projects,
            'memory': (memory.to_dict() if memory and hasattr(memory, 'to_dict') else (json.loads(memory.facts_json) if memory and getattr(memory, 'facts_json', None) else None)),
            'skills': (skills.to_dict() if skills and hasattr(skills, 'to_dict') else None),
            'saved_conversations': [c.to_dict() for c in convos],
            'shares': shares,
            'consents': [c.to_dict() for c in consents],
        }
        body = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
        fname = f'deiza-datos-{datetime.utcnow().strftime("%Y%m%d")}.json'
        return Response(body, mimetype='application/json',
                        headers={'Content-Disposition': f'attachment; filename="{fname}"'})

    @app.route('/api/account', methods=['DELETE'])
    @login_required
    def account_delete():
        uid = session['user_id']
        data = request.get_json(silent=True) or {}
        user = User.query.get(uid)
        if not user:
            return jsonify({'error': 'not found'}), 404
        # The client must echo the account email: a deliberate act, not a stray click
        if (data.get('confirm_email') or '').strip().lower() != (user.email or '').lower():
            return jsonify({'error': 'confirm_email_mismatch'}), 400
        try:
            file_refs = set()
            chat_ids = [c.id for c in Chat.query.filter_by(user_id=uid).all()]
            if chat_ids:
                for m in Message.query.filter(Message.chat_id.in_(chat_ids)).all():
                    file_refs |= _file_refs_from(m.artifact_json or '')
                    file_refs |= _file_refs_from(m.attachments_json or '')
                Message.query.filter(Message.chat_id.in_(chat_ids)).delete(synchronize_session=False)
                Chat.query.filter(Chat.id.in_(chat_ids)).delete(synchronize_session=False)
            proj_ids = [p.id for p in Project.query.filter_by(user_id=uid).all()]
            if proj_ids:
                ProjectFile.query.filter(ProjectFile.project_id.in_(proj_ids)).delete(synchronize_session=False)
                Project.query.filter(Project.id.in_(proj_ids)).delete(synchronize_session=False)
            for model in (UserPlan, UsageWindow, UserMemory, UserSkills, UserConversation, MagicToken, ApiKey):
                model.query.filter_by(user_id=uid).delete(synchronize_session=False)
            SharedArtifact.query.filter_by(created_by_user_id=uid).delete(synchronize_session=False)
            SharedConversation.query.filter_by(created_by_user_id=uid).delete(synchronize_session=False)
            GiftCode.query.filter_by(redeemed_by_user_id=uid).update({'redeemed_by_user_id': None}, synchronize_session=False)
            # Consent records are kept 6 years without the user link? No: the user asked to be
            # forgotten; keep only an anonymised trace of the waiver for our own billing defence.
            LegalConsent.query.filter_by(user_id=uid).update({'ip': None, 'user_agent': None}, synchronize_session=False)
            email = user.email
            db.session.delete(user)
            db.session.commit()
            # uploads referenced only by this user's messages
            updir = _uploads_dir()
            for fid in file_refs:
                for name in (fid, fid + '.json', fid + '.previews.json'):
                    p = os.path.join(updir, name)
                    if os.path.isfile(p):
                        try:
                            os.remove(p)
                        except Exception:
                            pass
            session.clear()
            logger.info(f'Account deleted: {email} (user {uid}), {len(file_refs)} files removed')
            return jsonify({'ok': True})
        except Exception as e:
            db.session.rollback()
            logger.error(f'Account deletion failed for user {uid}: {e}', exc_info=True)
            return jsonify({'error': 'delete_failed'}), 500
