"""
Session Service - Flask session management utilities.
Handles session storage, user info, tokens, etc.
"""

from typing import Optional, Dict, List


class SessionService:
    """Flask session helpers"""

    @staticmethod
    def get_user(session) -> Optional[Dict]:
        """Get current user from session"""
        return session.get("user")

    @staticmethod
    def set_user(session, user_info: Dict):
        """Store user in session"""
        session["user"] = user_info
        session.modified = True

    @staticmethod
    def is_authenticated(session) -> bool:
        """Check if user is authenticated"""
        return bool(session.get("user"))

    @staticmethod
    def get_token_cache(session) -> Optional[str]:
        """Get token cache blob from session"""
        return session.get("token_cache")

    @staticmethod
    def set_token_cache(session, cache_blob: str):
        """Store token cache blob in session"""
        session["token_cache"] = cache_blob
        session.modified = True

    @staticmethod
    def clear(session):
        """Clear session"""
        session.clear()

    @staticmethod
    def get_state(session) -> Optional[str]:
        """Get OAuth state from session"""
        return session.get("state")

    @staticmethod
    def set_state(session, state: str):
        """Store OAuth state in session"""
        session["state"] = state
        session.modified = True

    @staticmethod
    def get_states(session) -> List[str]:
        """Get all pending OAuth states for concurrent popup/login attempts"""
        values = session.get("states")
        if isinstance(values, list):
            return [str(v) for v in values if v]
        legacy = session.get("state")
        return [legacy] if legacy else []

    @staticmethod
    def add_state(session, state: str, max_states: int = 8):
        """Append OAuth state and cap list size to avoid unbounded session growth"""
        states = SessionService.get_states(session)
        states.append(state)
        session["states"] = states[-max_states:]
        # Keep legacy key in sync for backward compatibility.
        session["state"] = state
        session.modified = True

    @staticmethod
    def consume_state(session, state: Optional[str]) -> bool:
        """Validate and remove a pending OAuth state"""
        if not state:
            return False
        states = SessionService.get_states(session)
        if state not in states:
            return False
        states.remove(state)
        session["states"] = states
        session["state"] = states[-1] if states else None
        session.modified = True
        return True

    @staticmethod
    def get_auth_popup(session) -> bool:
        """Check if auth was via popup"""
        return bool(session.get("auth_popup"))

    @staticmethod
    def set_auth_popup(session, is_popup: bool):
        """Mark auth as popup"""
        session["auth_popup"] = is_popup
        session.modified = True

    @staticmethod
    def get_require_consent(session) -> bool:
        """Check if consent is required"""
        return bool(session.get("require_consent"))

    @staticmethod
    def set_require_consent(session, require: bool):
        """Mark consent as required"""
        session["require_consent"] = require
        session.modified = True
