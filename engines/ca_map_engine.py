"""
CA Policy Map Engine
Build graph visualization for a Conditional Access policy
Shows affected groups and applications

PERFORMANCE OPTIMIZATIONS:
- Concurrent Graph API calls for groups and apps
- Early stopping for large inclusion lists
"""

from typing import Tuple, List, Dict
from services.graph_service import GraphService
from concurrent.futures import ThreadPoolExecutor, as_completed


class CAMapEngine:
    """CA policy map graph building"""

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        """Remove OData metadata keys"""
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def build(policy_id: str, token: str) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        Build graph for CA policy with concurrent fetching.
        Returns: (nodes, edges, error_dict or None)
        """
        nodes, edges, node_ids = [], [], set()

        def add_node(n):
            if n["id"] not in node_ids:
                node_ids.add(n["id"])
                nodes.append(n)

        # Get policy
        policy = GraphService.get(
            f"/identity/conditionalAccessPolicies/{policy_id}?$select=id,displayName,state,conditions,grantControls,sessionControls",
            token,
        )
        if not policy or "error" in policy:
            return None, None, {"error": "CA policy not found"}

        add_node({"id": policy["id"], "label": policy.get("displayName", "CA Policy"), "type": "ca_policy", "data": CAMapEngine._clean(policy)})

        users_cond = policy.get("conditions", {}).get("users", {})
        apps_cond = policy.get("conditions", {}).get("applications", {})

        # Fetch groups and apps concurrently (60+ items might take long sequentially)
        group_ids = users_cond.get("includeGroups", [])[:120]
        app_client_ids = apps_cond.get("includeApplications", [])[:120]

        # Concurrent fetching with ThreadPoolExecutor
        def fetch_group(group_id: str):
            group = GraphService.get(
                f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
                token,
            )
            return ("group", group_id, group)

        def fetch_app(app_client_id: str):
            sp = GraphService.get(
                f"/servicePrincipals?$filter=appId eq '{app_client_id}'&$select=id,displayName,appId,publisherName,servicePrincipalType&$top=1",
                token,
            )
            candidates = sp.get("value", []) if sp and "value" in sp else []
            return ("app", app_client_id, candidates[0] if candidates else None)

        with ThreadPoolExecutor(max_workers=10) as executor:
            # Submit all fetches
            futures = []
            for gid in group_ids:
                futures.append(executor.submit(fetch_group, gid))
            for acid in app_client_ids:
                futures.append(executor.submit(fetch_app, acid))

            # Process results as they complete
            for future in as_completed(futures):
                try:
                    obj_type, obj_id, obj_data = future.result()
                    
                    if obj_type == "group" and obj_data and "error" not in obj_data:
                        add_node({"id": obj_data["id"], "label": obj_data.get("displayName", "Group"), "type": "group", "data": CAMapEngine._clean(obj_data)})
                        edges.append({"source": obj_data["id"], "target": policy["id"], "label": "included in"})
                    
                    elif obj_type == "app" and obj_data:
                        add_node({"id": obj_data["id"], "label": obj_data.get("displayName", "App"), "type": "app", "data": CAMapEngine._clean(obj_data)})
                        edges.append({"source": obj_data["id"], "target": policy["id"], "label": "included in"})
                except Exception:
                    # If one fetch fails, skip it and continue
                    pass

        return nodes, edges, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
