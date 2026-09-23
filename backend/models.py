from datetime import datetime, timedelta
from database import db
import json

# Plan definitions — single source of truth
#
# Model availability per plan:
#   free   → fast (full) + pro (very limited, high multiplier)
#   friend → fast (full) + pro (limited) + ultra (limited, high multiplier) + design
#   signet → fast + pro + ultra + design (all generous limits)
#
# "design" = Deiza Design studio (image generation/editing with presets).
# Only paid plans get it.
#
# The "models" list controls which models are allowed at the API level.
# Fine-grained limits are handled via per-model token limits below.

PLANS = {
    'free': {
        'name': 'Free',
        'price_eur': 0,
        'token_limit': 20000,      # 20k weighted tokens per 4h
        'models': ['fast', 'pro', 'ultra', 'vainilla', 'code'],
        'reset_hours': 5,
        'projects': 1,
        'project_files': 5,
        'model_token_limits': {
            'pro': 8000,           # ~1,600 raw pro tokens ≈ 2 pro messages
        },
    },
    'friend': {
        'name': 'Friend',
        'price_eur': 4.45,
        'token_limit': 100000,      # 100k weighted tokens per 4h
        'models': ['fast', 'pro', 'ultra', 'design', 'code', 'vainilla'],
        'reset_hours': 5,
        'projects': 5,
        'project_files': 20,
        'model_token_limits': {
            'ultra': 40000,        # ~8,000 raw ultra tokens ≈ 8 ultra messages per 4h
            'design': 42000,       # ~7 image designs per 4h on Friend
        },
    },
    'signet': {
        'name': 'Signet',
        'price_eur': 7.75,
        'token_limit': 300000,     # 300k weighted tokens per 4h
        'models': ['fast', 'pro', 'ultra', 'design', 'code', 'vainilla'],
        'reset_hours': 5,
        'projects': 25,
        'project_files': 50,
        'model_token_limits': {},   # no per-model sub-limits on signet
    },
}

# Token cost weights per model per plan
# Free plan charges extra for pro to naturally limit its use
MODEL_TOKEN_MULTIPLIER = {
    'fast':   {'free': 1,  'friend': 1,  'signet': 1},
    'pro':    {'free': 5,  'friend': 3,  'signet': 2},
    'ultra':  {'free': 12, 'friend': 5,  'signet': 4},
    'design': {'free': 0,  'friend': 1,  'signet': 1},
    'code':   {'free': 3,  'friend': 1,  'signet': 1},
    'vainilla': {'free': 0, 'friend': 0, 'signet': 0},
}

IMAGE_RAW_COST = 6000  # raw tokens charged per generated/edited image


def get_multiplier(model: str, plan: str) -> int:
    """Get token multiplier for a model on a given plan."""
    return MODEL_TOKEN_MULTIPLIER.get(model, {}).get(plan, 1)


def prune_usage_windows(max_hours: int = 24):
    """Delete usage records older than `max_hours` (rolling windows only ever
    need the most recent `reset_hours`, so anything older is junk)."""
    try:
        cutoff = datetime.utcnow() - timedelta(hours=max_hours)
        n = UsageWindow.query.filter(UsageWindow.created_at < cutoff).delete()
        if n:
            db.session.commit()
    except Exception:
        db.session.rollback()


class User(db.Model):
    """User model for authentication"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(255), unique=True, nullable=True)  # nullable for magic-link users
    apple_id = db.Column(db.String(255), unique=True, nullable=True)   # Sign in with Apple (iOS app)
    email = db.Column(db.String(255), unique=True, nullable=False)
    name = db.Column(db.String(255))
    picture = db.Column(db.String(512))
    avatar_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    chats = db.relationship('Chat', backref='user', lazy=True, cascade='all, delete-orphan')
    plan = db.relationship('UserPlan', backref='user', uselist=False, cascade='all, delete-orphan')
    usage_windows = db.relationship('UsageWindow', backref='user', lazy=True, cascade='all, delete-orphan')
    memory = db.relationship('UserMemory', backref='user', uselist=False, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<User {self.email}>'
    
    def get_plan(self) -> str:
        """Returns the user's current plan key (free/friend/signet). Auto-expires if past expires_at."""
        if self.plan:
            # Auto-expire one-time plans
            if self.plan.expires_at and self.plan.expires_at < datetime.utcnow():
                self.plan.plan_key = 'free'
                self.plan.expires_at = None
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()
            return self.plan.plan_key
        return 'free'
    
    def get_active_usage_window(self) -> tuple:
        """
        Returns (window_start: Optional[datetime], windows: List[UsageWindow], next_reset: Optional[datetime]).

        Like a rolling window:
        - The usage credit window only starts when the user sends a message.
        - If the user has not sent any message within an active window, tokens_used is 0,
          no countdown timer runs, and 100% of the credit is available.
        - When a message is sent, a 5-hour (reset_hours) window begins at that message's created_at timestamp.
        - Once reset_hours pass since the start of that window, the window expires and usage resets to 0%
          until the user sends their next message.
        """
        now = datetime.utcnow()
        plan_key = self.get_plan()
        plan_info = PLANS.get(plan_key, PLANS['free'])
        reset_hours = plan_info.get('reset_hours', 5)
        period_delta = timedelta(hours=reset_hours)

        # Look for usage records in recent history (up to 48 hours)
        cutoff = now - timedelta(hours=max(48, reset_hours * 2))
        records = UsageWindow.query.filter(
            UsageWindow.user_id == self.id,
            UsageWindow.created_at >= cutoff
        ).order_by(UsageWindow.created_at.asc()).all()

        if not records:
            return None, [], None

        # Partition records into tumbling windows anchored to the first message of each window
        cur_start = None
        cur_records = []

        for r in records:
            if cur_start is None or r.created_at >= cur_start + period_delta:
                # Start of a new window
                cur_start = r.created_at
                cur_records = [r]
            else:
                cur_records.append(r)

        # Check if the latest window is still active
        if cur_start and now < cur_start + period_delta:
            next_reset = cur_start + period_delta
            return cur_start, cur_records, next_reset

        # All previous windows have expired
        return None, [], None

    def get_current_usage(self) -> dict:
        """Returns the current usage stats for the user (starts only when user talks)."""
        now = datetime.utcnow()
        plan_key = self.get_plan()
        plan_info = PLANS.get(plan_key, PLANS['free'])
        token_limit = plan_info['token_limit']

        window_start, windows, next_reset = self.get_active_usage_window()

        if window_start and next_reset:
            tokens_used = sum(w.weighted_tokens for w in windows)
            reset_in_seconds = max(0, int((next_reset - now).total_seconds()))
            return {
                'tokens_used': tokens_used,
                'token_limit': token_limit,
                'tokens_remaining': max(0, token_limit - tokens_used),
                'next_reset': next_reset.isoformat() + 'Z',
                'reset_in_seconds': reset_in_seconds,
                'exhausted': tokens_used >= token_limit,
                'active_window': True,
            }
        else:
            return {
                'tokens_used': 0,
                'token_limit': token_limit,
                'tokens_remaining': token_limit,
                'next_reset': None,
                'reset_in_seconds': None,
                'exhausted': False,
                'active_window': False,
            }

    def can_use_model(self, model_key: str) -> bool:
        """Check if user's plan allows this model."""
        plan_key = self.get_plan()
        plan_info = PLANS.get(plan_key, PLANS['free'])
        return model_key in plan_info['models']

    def record_usage(self, tokens: int, model: str):
        """Record token usage with plan-aware model multiplier."""
        plan_key = self.get_plan()
        multiplier = get_multiplier(model, plan_key)
        weighted = tokens * multiplier
        window = UsageWindow(user_id=self.id, raw_tokens=tokens, weighted_tokens=weighted, model=model)
        db.session.add(window)

    def can_use_model_with_sublimit(self, model_key: str) -> tuple:
        """
        Returns (can_use: bool, reason: str).
        Checks both plan model access AND per-model sub-limits within active window.
        """
        plan_key = self.get_plan()
        plan_info = PLANS.get(plan_key, PLANS['free'])

        # Check model is in plan
        if model_key not in plan_info['models']:
            return False, 'plan_required'

        # Check per-model sub-limit within the current active window
        model_limits = plan_info.get('model_token_limits', {})
        if model_key in model_limits:
            sub_limit = model_limits[model_key]
            window_start, windows, next_reset = self.get_active_usage_window()
            if window_start and windows:
                model_tokens_used = sum(w.weighted_tokens for w in windows if w.model == model_key)
                if model_tokens_used >= sub_limit:
                    return False, 'model_sublimit'

        return True, 'ok'


class UserPlan(db.Model):
    """User subscription plan"""
    __tablename__ = 'user_plans'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    plan_key = db.Column(db.String(20), nullable=False, default='free')  # free/friend/signet
    stripe_customer_id = db.Column(db.String(255), nullable=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True)
    activated_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)  # None = lifetime/manual

    def __repr__(self):
        return f'<UserPlan user={self.user_id} plan={self.plan_key}>'


class UsageWindow(db.Model):
    """Token usage records per message (used for rolling 4h window)"""
    __tablename__ = 'usage_windows'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    raw_tokens = db.Column(db.Integer, default=0)
    weighted_tokens = db.Column(db.Integer, default=0)  # raw * model_multiplier
    model = db.Column(db.String(20), default='fast')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<UsageWindow user={self.user_id} tokens={self.weighted_tokens}>'


class UserMemory(db.Model):
    """Persistent cross-chat memory per user (server-side source of truth)."""
    __tablename__ = 'user_memory'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    items = db.Column(db.Text, default='[]')   # JSON list of facts {id, text, ts}
    enabled = db.Column(db.Boolean, default=True, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_items(self) -> list:
        try:
            val = json.loads(self.items) if self.items else []
            return val if isinstance(val, list) else []
        except Exception:
            return []

    def set_items(self, value: list):
        self.items = json.dumps(value)

    def __repr__(self):
        return f'<UserMemory user={self.user_id} items={len(self.get_items())}>'

class UserSkills(db.Model):
    """Per-user Skills configuration: enabled built-ins + custom instruction packs."""
    __tablename__ = 'user_skills'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    data = db.Column(db.Text, default='{}')   # {"enabled": [keys], "custom": [{id,name,description,instructions,enabled}]}
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_data(self) -> dict:
        try:
            val = json.loads(self.data) if self.data else {}
            return val if isinstance(val, dict) else {}
        except Exception:
            return {}

    def set_data(self, value: dict):
        self.data = json.dumps(value, ensure_ascii=False)


class UserConversation(db.Model):
    """Server copy of the Design studio / Search conversations (they used to live only
    in localStorage, where one base64 photo could blow the quota and wipe everything).
    `data` holds the page's own message/turn list; media are stored as /api/files URLs."""
    __tablename__ = 'user_conversations'
    __table_args__ = (db.UniqueConstraint('user_id', 'kind', 'client_id', name='uq_user_conv'),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False)          # 'design' | 'search'
    client_id = db.Column(db.String(48), nullable=False)
    title = db.Column(db.String(200), default='')
    pinned = db.Column(db.Boolean, default=False, nullable=False)
    data = db.Column(db.Text, default='{}')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_data(self) -> dict:
        try:
            val = json.loads(self.data) if self.data else {}
            return val if isinstance(val, dict) else {}
        except Exception:
            return {}

    def set_data(self, value: dict):
        self.data = json.dumps(value, ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            'id': self.client_id,
            'title': self.title or '',
            'pinned': bool(self.pinned),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'data': self.get_data(),
        }


class Chat(db.Model):
    """Chat/Conversation model"""
    __tablename__ = 'chats'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    pinned = db.Column(db.Boolean, default=False, nullable=False)
    
    # Relationships
    messages = db.relationship('Message', backref='chat', lazy=True, cascade='all, delete-orphan', order_by='Message.created_at')
    
    def __repr__(self):
        return f'<Chat {self.id}: {self.title}>'

class Message(db.Model):
    """Message model for chat messages"""
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chats.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    artifact_json = db.Column(db.Text)  # JSON string for artifact data
    attachments_json = db.Column(db.Text)  # JSON: list of {name, mime_type, is_image, raw_bytes}
    meta_json = db.Column(db.Text)  # JSON: {sources: [...], images: [...]} from web grounding
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def artifact_data(self):
        """Get artifact data as dictionary"""
        if self.artifact_json:
            try:
                return json.loads(self.artifact_json)
            except:
                return None
        return None

    @artifact_data.setter
    def artifact_data(self, value):
        """Set artifact data from dictionary"""
        if value:
            self.artifact_json = json.dumps(value)
        else:
            self.artifact_json = None

    @property
    def attachments_data(self):
        if self.attachments_json:
            try:
                return json.loads(self.attachments_json)
            except:
                return None
        return None

    @attachments_data.setter
    def attachments_data(self, value):
        if value:
            self.attachments_json = json.dumps(value)
        else:
            self.attachments_json = None

    @property
    def meta_data(self):
        if self.meta_json:
            try:
                return json.loads(self.meta_json)
            except Exception:
                return None
        return None

    @meta_data.setter
    def meta_data(self, value):
        self.meta_json = json.dumps(value) if value else None

    def __repr__(self):
        return f'<Message {self.id} ({self.role})>'


class MagicToken(db.Model):
    """One-time magic login tokens"""
    __tablename__ = 'magic_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<MagicToken user={self.user_id} used={self.used}>'


class GiftCode(db.Model):
    """Gift codes — pre-paid plan activations that can be redeemed by any user."""
    __tablename__ = 'gift_codes'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(16), unique=True, nullable=False)  # e.g. DEIZA-XXXX-XXXX
    plan_key = db.Column(db.String(20), nullable=False)  # friend / signet
    status = db.Column(db.String(20), nullable=False, default='available')  # available / redeemed
    is_admin_issued = db.Column(db.Boolean, default=False, nullable=False)
    purchased_by_email = db.Column(db.String(255), nullable=True)
    redeemed_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    redeemed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    stripe_session_id = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<GiftCode {self.code} plan={self.plan_key} status={self.status}>'


class SharedArtifact(db.Model):
    """Publicly shareable artifacts (deiza.org/s/XXXX)"""
    __tablename__ = 'shared_artifacts'

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(12), unique=True, nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False, default='Untitled')
    content = db.Column(db.Text, nullable=False)
    artifact_type = db.Column(db.String(20), nullable=False, default='html')  # html/md/code
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    view_count = db.Column(db.Integer, default=0, nullable=False)

    def __repr__(self):
        return f'<SharedArtifact slug={self.slug} type={self.artifact_type}>'


class SharedConversation(db.Model):
    """Publicly shareable read-only conversation snapshots (deiza.org/c/XXXX)"""
    __tablename__ = 'shared_conversations'

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(12), unique=True, nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False, default='Conversación compartida')
    kind = db.Column(db.String(10), nullable=False, default='chat')  # chat | message | thread
    payload = db.Column(db.Text, nullable=False)  # JSON: {"messages": [...]}
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    view_count = db.Column(db.Integer, default=0, nullable=False)

    def __repr__(self):
        return f'<SharedConversation slug={self.slug} kind={self.kind}>'


class Project(db.Model):
    """User project: a folder of files + custom instructions that chats can be linked to."""
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    instructions = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    files = db.relationship('ProjectFile', backref='project', lazy=True, cascade='all, delete-orphan')
    chats = db.relationship('Chat', backref='project', lazy=True)

    def to_dict(self, with_files=False):
        d = {
            'id': self.id,
            'name': self.name,
            'instructions': self.instructions or '',
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'file_count': len(self.files),
            'chat_count': len(self.chats),
        }
        if with_files:
            d['files'] = [f.to_dict() for f in self.files]
        return d


class ProjectFile(db.Model):
    """A file inside a project. Text content is the extracted text; images keep raw bytes."""
    __tablename__ = 'project_files'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), default='')
    content = db.Column(db.Text, default='')          # extracted text
    raw_bytes = db.Column(db.Text, nullable=True)     # base64, images only
    is_image = db.Column(db.Boolean, default=False)
    pinned = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'mime_type': self.mime_type or '',
            'is_image': bool(self.is_image),
            'pinned': bool(self.pinned) if hasattr(self, 'pinned') else False,
            'size_chars': len(self.content or '') if not self.is_image else len(self.raw_bytes or ''),
            'created_at': self.created_at.isoformat(),
        }


class ApiKey(db.Model):
    """Long-lived API key for Pragmathic Code CLI access."""
    __tablename__ = 'api_keys'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(120), nullable=False, default='pragmathic')
    key_hash = db.Column(db.String(128), unique=True, nullable=False)  # sha256 of raw key
    key_prefix = db.Column(db.String(12), nullable=False)              # e.g. pm_abc123
    last_used_at = db.Column(db.DateTime, nullable=True)
    last_ip = db.Column(db.String(64), nullable=True)
    revoked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='api_keys', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'key_prefix': self.key_prefix,
            'revoked': bool(self.revoked),
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'last_ip': self.last_ip,
            'created_at': self.created_at.isoformat(),
        }
