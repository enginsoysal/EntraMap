"""
Config Module
Centralized environment and configuration management
"""

import os
import tempfile
from typing import Tuple
from dotenv import load_dotenv


load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    """Parse boolean environment variable"""
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    """Parse integer environment variable"""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class Config:
    """Application configuration from environment"""

    # OAuth / MSAL
    CLIENT_ID = os.getenv("CLIENT_ID", "")
    CLIENT_SECRET = os.getenv("CLIENT_SECRET", "")
    REDIRECT_URI = os.getenv("REDIRECT_URI", "").strip()
    REDIRECT_PATH = "/auth/callback"

    # Flask
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", os.urandom(32))
    DEBUG = _env_bool("FLASK_DEBUG", False)
    PORT = _env_int("PORT", 5000)

    # Azure Monitor / Application Insights
    APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "").strip()
    APPINSIGHTS_INSTRUMENTATIONKEY = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY", "").strip()
    APPLICATIONINSIGHTS_ENABLE_LOGGING = _env_bool("APPLICATIONINSIGHTS_ENABLE_LOGGING", True)

    # Session
    SESSION_TYPE = os.getenv("SESSION_TYPE", "filesystem").strip().lower()
    REDIS_URL = os.getenv("REDIS_URL", "").strip() if SESSION_TYPE == "redis" else None
    SESSION_TTL_MINUTES = _env_int("SESSION_TTL_MINUTES", 60)
    SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", REDIRECT_URI.startswith("https://"))
    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "entramap_session")
    SESSION_FILE_DIR = os.getenv(
        "SESSION_FILE_DIR",
        os.path.join(tempfile.gettempdir(), "entramap_flask_session")
    )

    # Graph API
    GRAPH_BASE = "https://graph.microsoft.com/v1.0"
    SCOPES = [
        "User.Read",
        "User.ReadBasic.All",
        "Group.Read.All",
        "Device.Read.All",
        "Application.Read.All",
        "DeviceManagementApps.Read.All",
        "Policy.Read.All",
        "RoleManagement.Read.Directory",
        "Organization.Read.All",
        "EntitlementManagement.Read.All",
        "Team.ReadBasic.All",
        "Sites.Read.All",
        "Tasks.Read",
        "Directory.Read.All",
    ]

    # App
    VERSION = "0.4.1"

    @classmethod
    def validate(cls) -> Tuple[bool, str]:
        """Check if config is valid. Returns (is_valid, error_message)"""
        if not cls.CLIENT_ID or not cls.CLIENT_SECRET:
            return False, "CLIENT_ID and CLIENT_SECRET must be set"
        return True, ""
