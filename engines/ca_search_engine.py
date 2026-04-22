"""
CA Policy Search Engine
Search for Conditional Access policies
"""

from typing import List, Dict
from services.graph_service import GraphService


class CASearchEngine:
    """Conditional Access policy search functionality"""

    @staticmethod
    def search(query: str, token: str, max_results: int = 15) -> List[Dict]:
        """Search for CA policies"""
        if len(query) < 2:
            return []

        safe_q = query.replace("'", "''")
        data = GraphService.get(
            f"/identity/conditionalAccessPolicies?$filter=startswith(displayName,'{safe_q}')"
            f"&$select=id,displayName,state&$top={max_results}",
            token,
        )
        items = data.get("value", []) if data and "value" in data else []

        return [
            {
                "id": p["id"],
                "label": p.get("displayName", ""),
                "subtitle": p.get("state", ""),
                "type": "ca_policy",
            }
            for p in items
        ]

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
