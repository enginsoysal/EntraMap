"""
Cache Service - Token cache management with optional encryption.
Handles serialization, deserialization, and encryption of MSAL token cache.
"""

import os
from typing import Optional

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:
    Fernet = None
    InvalidToken = Exception


class CacheService:
    """Token cache management"""

    @staticmethod
    def get_cipher() -> Optional[Fernet]:
        """Get encryption cipher if configured."""
        key = os.getenv("TOKEN_CACHE_ENCRYPTION_KEY", "").strip()
        if not key:
            return None
        if Fernet is None:
            raise RuntimeError(
                "TOKEN_CACHE_ENCRYPTION_KEY is set but cryptography package is not installed"
            )
        return Fernet(key.encode("utf-8"))

    @staticmethod
    def encrypt(serialized_cache: str) -> str:
        """Encrypt cache blob."""
        cipher = CacheService.get_cipher()
        if not cipher:
            return serialized_cache
        token = cipher.encrypt(serialized_cache.encode("utf-8"))
        return token.decode("utf-8")

    @staticmethod
    def decrypt(raw_cache_blob: str) -> str:
        """Decrypt cache blob."""
        cipher = CacheService.get_cipher()
        if not cipher:
            return raw_cache_blob
        try:
            plain = cipher.decrypt(raw_cache_blob.encode("utf-8"))
            return plain.decode("utf-8")
        except (InvalidToken, Exception):
            return None
