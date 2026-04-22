"""
Photo Service - User and group photo retrieval.
Handles fetching and encoding photos to data URIs.
"""

import base64
import requests
from typing import Optional


class PhotoService:
    """Photo retrieval and encoding"""

    GRAPH_BASE = "https://graph.microsoft.com/v1.0"

    @staticmethod
    def get_user_photo(user_id: str, token: str) -> Optional[str]:
        """Fetch user photo as data URL."""
        try:
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(
                f"{PhotoService.GRAPH_BASE}/users/{user_id}/photo/$value",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                data_b64 = base64.b64encode(resp.content).decode("utf-8")
                return f"data:image/jpeg;base64,{data_b64}"
        except Exception:
            pass
        return None

    @staticmethod
    def get_group_photo(group_id: str, token: str) -> Optional[str]:
        """Fetch group photo as data URL."""
        try:
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(
                f"{PhotoService.GRAPH_BASE}/groups/{group_id}/photo/$value",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                data_b64 = base64.b64encode(resp.content).decode("utf-8")
                return f"data:image/jpeg;base64,{data_b64}"
        except Exception:
            pass
        return None
