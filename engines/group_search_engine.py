"""
Group Search Engine
Search for groups in Microsoft Entra ID
"""

from typing import List, Dict
from services.graph_service import GraphService


class GroupSearchEngine:
    """Group search functionality"""

    @staticmethod
    def search(query: str, token: str, max_results: int = 15) -> List[Dict]:
        """Search for groups"""
        if len(query) < 2:
            return []

        # Try search endpoint first
        endpoint = (
            f'/groups?$search="displayName:{query}"'
            f"&$select=id,displayName,description,groupTypes&$top={max_results}&$count=true"
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
                f"/groups?$filter=startswith(displayName,'{safe_q}')"
                f"&$select=id,displayName,description,groupTypes&$top={max_results}",
                token,
            )
            items = data.get("value", []) if data and "value" in data else []

        return [
            {
                "id": g["id"],
                "label": g.get("displayName", ""),
                "subtitle": g.get("description", ""),
                "type": "group",
            }
            for g in items
        ]

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
