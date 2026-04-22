"""
Engines Layer
Each engine handles one feature independently.
Engines use services but don't know about other engines.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any


class BaseEngine(ABC):
    """Base interface for all engines"""

    @abstractmethod
    def init(self, app):
        """Initialize engine with Flask app"""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Return True if engine is operational"""
        pass
