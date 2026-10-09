"""Shared chat/Work launch switch; Code and public API retain Liquid 5.1."""
import os
from datetime import datetime, timezone

LIQUID55_AT = '2026-10-12T00:00:00+02:00'

def liquid55_enabled(now=None):
    override = os.getenv('LIQUID55')
    if override is not None:
        return override.strip() == '1'
    try:
        at = datetime.fromisoformat(os.getenv('LIQUID55_AT', LIQUID55_AT))
        if at.tzinfo is None:
            return False
        current = now if now is not None else datetime.now(timezone.utc)
        return current >= at
    except (TypeError, ValueError):
        return False
