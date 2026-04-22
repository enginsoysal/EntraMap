"""
Device Search Engine
Search for devices in Microsoft Entra ID
"""

from typing import List, Dict
from services.graph_service import GraphService


class DeviceSearchEngine:
    """Device search functionality"""

    @staticmethod
    def search(query: str, token: str, max_results: int = 15) -> List[Dict]:
        """Search for devices"""
        if len(query) < 2:
            return []

        # Try search endpoint first
        endpoint = (
            f'/devices?$search="displayName:{query}"'
            f"&$select=id,displayName,operatingSystem,deviceId,isManaged,isCompliant"
            f"&$top={max_results}&$count=true"
        )
        data = GraphService.get(
            endpoint,
            token,
            extra_headers={"ConsistencyLevel": "eventual"}
        )
        items = data.get("value", []) if data and "value" in data else []

        # Fallback to startswith filter
        if not items:
            safe_q = query.replace("'", "''")
            data = GraphService.get(
                f"/devices?$filter=startswith(displayName,'{safe_q}')"
                f"&$select=id,displayName,operatingSystem,deviceId,isManaged,isCompliant&$top={max_results}",
                token,
            )
            items = data.get("value", []) if data and "value" in data else []

        return [
            {
                "id": d["id"],
                "label": d.get("displayName", ""),
                "subtitle": d.get("operatingSystem", ""),
                "type": "device",
            }
            for d in items
        ]

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
