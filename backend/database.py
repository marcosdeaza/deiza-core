from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def init_db():
    """Initialize the database"""
    try:
        db.create_all()
    except Exception as e:
        # Several gunicorn workers boot at once; the losers of the CREATE TABLE race
        # see "already exists" — the schema is there, carry on.
        if 'already exists' not in str(e).lower():
            raise
        db.session.rollback()
    # Lightweight migration: add chats.project_id if the table predates it
    try:
        from sqlalchemy import text
        db.session.execute(text('ALTER TABLE chats ADD COLUMN project_id INTEGER'))
        db.session.commit()
    except Exception:
        db.session.rollback()  # column already exists
    try:
        from sqlalchemy import text
        db.session.execute(text('ALTER TABLE messages ADD COLUMN meta_json TEXT'))
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Sign in with Apple (iOS app): stable Apple user id
    try:
        from sqlalchemy import text
        db.session.execute(text('ALTER TABLE users ADD COLUMN apple_id VARCHAR(255)'))
        db.session.commit()
    except Exception:
        db.session.rollback()
    # Indexes SQLAlchemy does not create for plain foreign keys (SQLite): the hot
    # paths are "messages of a chat", "chats of a user by recency" and usage windows.
    try:
        from sqlalchemy import text
        for stmt in (
            'CREATE INDEX IF NOT EXISTS ix_messages_chat_created ON messages (chat_id, created_at)',
            'CREATE INDEX IF NOT EXISTS ix_chats_user_updated ON chats (user_id, updated_at)',
            'CREATE INDEX IF NOT EXISTS ix_usage_user_created ON usage_windows (user_id, created_at)',
            'CREATE INDEX IF NOT EXISTS ix_usage_user_model_created ON usage_windows (user_id, model, created_at)',
            'CREATE INDEX IF NOT EXISTS ix_magic_user_used ON magic_tokens (user_id, used)',
            'CREATE UNIQUE INDEX IF NOT EXISTS ix_users_apple_id ON users (apple_id)',
        ):
            db.session.execute(text(stmt))
        db.session.commit()
    except Exception:
        db.session.rollback()
