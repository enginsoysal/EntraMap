"""
Auth Engine - All authentication logic
Handles login, signin, callback, signout, disconnect.
Independent from other engines.
"""

import os
import uuid
from typing import Optional, Dict, Tuple
from msal import ConfidentialClientApplication, SerializableTokenCache
from functools import wraps

from services.cache_service import CacheService
from services.session_service import SessionService
from config.config import Config


class AuthEngine:
    """Authentication engine"""

    def __init__(self, config: Config):
        self.config = config
        self.client_id = config.CLIENT_ID
        self.client_secret = config.CLIENT_SECRET
        self.redirect_uri = config.REDIRECT_URI
        self.scopes = config.SCOPES

    def _load_cache(self, session) -> SerializableTokenCache:
        """Load and decrypt token cache from session"""
        cache = SerializableTokenCache()
        raw_cache_blob = SessionService.get_token_cache(session)
        if raw_cache_blob:
            try:
                decrypted = CacheService.decrypt(raw_cache_blob)
                cache.deserialize(decrypted)
            except Exception:
                SessionService.set_token_cache(session, None)
        return cache

    def _save_cache(self, session, cache: SerializableTokenCache):
        """Encrypt and save token cache to session"""
        if cache.has_state_changed:
            encrypted = CacheService.encrypt(cache.serialize())
            SessionService.set_token_cache(session, encrypted)

    def _msal_app(self, cache: Optional[SerializableTokenCache] = None) -> ConfidentialClientApplication:
        """Create MSAL app instance"""
        return ConfidentialClientApplication(
            self.client_id,
            authority="https://login.microsoftonline.com/organizations",
            client_credential=self.client_secret,
            token_cache=cache,
        )

    def get_authorization_url(self, session, use_popup: bool = False, 
                              force_consent: bool = False) -> str:
        """Generate Microsoft authorization URL"""
        state = str(uuid.uuid4())
        SessionService.add_state(session, state)
        SessionService.set_auth_popup(session, use_popup)
        
        if force_consent or SessionService.get_require_consent(session):
            SessionService.set_require_consent(session, False)
            prompt = "consent"
        else:
            prompt = "select_account"

        auth_url = self._msal_app().get_authorization_request_url(
            self.scopes,
            state=state,
            redirect_uri=self.redirect_uri,
            prompt=prompt,
        )
        return auth_url

    def handle_callback(self, session, code: str, state: str) -> Tuple[bool, str, Optional[Dict]]:
        """
        Process OAuth callback.
        Returns: (success, message, user_info)
        """
        if not SessionService.consume_state(session, state):
            pending = SessionService.get_states(session)
            print(f"[AuthEngine] State mismatch: received={state!r}, pending_count={len(pending)}")
            return False, "State mismatch. Please try again.", None

        cache = self._load_cache(session)
        msal = self._msal_app(cache)
        
        result = msal.acquire_token_by_authorization_code(
            code, scopes=self.scopes, redirect_uri=self.redirect_uri
        )
        self._save_cache(session, cache)

        if "error" in result:
            message = result.get("error_description", result["error"])
            return False, message, None

        claims = result.get("id_token_claims", {})
        user_info = {
            "name": claims.get("name", "Unknown"),
            "upn": claims.get("preferred_username", ""),
            "tid": claims.get("tid", ""),
            "oid": claims.get("oid", ""),
        }
        return True, "Sign-in successful", user_info

    def get_token(self, session) -> Optional[str]:
        """Get valid access token from session cache"""
        cache = self._load_cache(session)
        msal = self._msal_app(cache)
        accounts = msal.get_accounts()
        
        if not accounts:
            return None
        
        result = msal.acquire_token_silent(self.scopes, account=accounts[0])
        self._save_cache(session, cache)
        
        if result and "access_token" in result:
            return result["access_token"]
        return None

    def signout(self, session):
        """Sign out - clear session"""
        SessionService.clear(session)

    def disconnect(self, session):
        """Hard disconnect - clear session and force re-consent"""
        SessionService.clear(session)
        SessionService.set_require_consent(session, True)

    def init(self, app):
        """Initialize auth engine"""
        pass

    def health_check(self) -> bool:
        """Check if auth is properly configured"""
        return bool(self.client_id and self.client_secret)
