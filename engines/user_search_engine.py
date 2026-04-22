"""
User Search Engine
Search for users in Microsoft Entra ID
"""

from typing import List, Dict
from services.graph_service import GraphService


class UserSearchEngine:
    """User search functionality"""

    @staticmethod
    def search(query: str, token: str, max_results: int = 15) -> List[Dict]:
        """Search for users"""
        if len(query) < 2:
            return []

        # Try search endpoint first (requires ConsistencyLevel header)
        endpoint = (
            f'/users?$search="displayName:{query}" OR "userPrincipalName:{query}"'
            f"&$select=id,displayName,userPrincipalName,jobTitle,department"
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
                f"/users?$filter=startswith(displayName,'{safe_q}')"
                f" or startswith(userPrincipalName,'{safe_q}')"
                f"&$select=id,displayName,userPrincipalName,jobTitle,department&$top={max_results}",
                token,
            )
            items = data.get("value", []) if data and "value" in data else []

        return [
            {
                "id": u["id"],
                "label": u.get("displayName", ""),
                "subtitle": u.get("userPrincipalName", ""),
                "type": "user",
            }
            for u in items
        ]

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
