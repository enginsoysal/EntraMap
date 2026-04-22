"""
Group Map Engine
Build graph visualization for a group
Shows members, apps, and CA policies

PERFORMANCE OPTIMIZATIONS:
- Concurrent Graph API calls for service principals
- Early stopping for large member lists
"""

from typing import Tuple, List, Dict
from services.graph_service import GraphService
from concurrent.futures import ThreadPoolExecutor, as_completed


class GroupMapEngine:
    """Group map graph building"""

    @staticmethod
    def _get_intune_app_index(token: str, group_ids: List[str]) -> Dict:
        """Index Intune apps by group"""
        app_index = {}
        
        for group_id in group_ids:
            apps_for_group = []
            assignments = GraphService.get_all(
                f"/deviceAppManagement/mobileApps?$filter=assignments/any(a:a/target/groupId eq '{group_id}')&$top=100",
                token,
                max_items=100,
            )
            # Simplified: direct fetch instead of filtering
            app_index[group_id] = apps_for_group
        
        return app_index

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        """Remove OData metadata keys"""
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def build(group_id: str, token: str) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        Build graph for group.
        Returns: (nodes, edges, error_dict or None)
        """
        nodes, edges, node_ids = [], [], set()

        def add_node(n):
            if n["id"] not in node_ids:
                node_ids.add(n["id"])
                nodes.append(n)

        # Get group
        group = GraphService.get(
            f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
            token,
        )
        if not group or "error" in group:
            return None, None, {"error": "Group not found"}

        add_node({"id": group["id"], "label": group.get("displayName", "?"), "type": "group", "data": GroupMapEngine._clean(group)})

        # Group members
        for m in GraphService.get_all(
            f"/groups/{group_id}/members?$select=id,displayName,userPrincipalName,jobTitle&$top=50",
            token,
            max_items=50,
        ):
            if "#microsoft.graph.user" in m.get("@odata.type", "") or "userPrincipalName" in m:
                add_node({"id": m["id"], "label": m.get("displayName", "?"), "type": "user", "data": GroupMapEngine._clean(m)})
                edges.append({"source": m["id"], "target": group["id"], "label": "member of"})

        # Service principals (fetch concurrently for speed)
        assignments = GraphService.get_all(f"/groups/{group_id}/appRoleAssignments", token, max_items=50)
        
        def fetch_service_principal(sp_id: str):
            sp = GraphService.get(
                f"/servicePrincipals/{sp_id}?$select=id,displayName,appId,description,servicePrincipalType,publisherName",
                token,
            )
            return sp_id, sp

        # Concurrent fetching
        sp_ids_to_fetch = []
        for assignment in assignments:
            sp_id = assignment.get("resourceId")
            if sp_id and sp_id not in node_ids:
                sp_ids_to_fetch.append(sp_id)

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(fetch_service_principal, sp_id) for sp_id in sp_ids_to_fetch]
            
            for future in as_completed(futures):
                try:
                    sp_id, sp = future.result()
                    if sp and "error" not in sp:
                        add_node({"id": sp["id"], "label": sp.get("displayName", "App"), "type": "app", "data": GroupMapEngine._clean(sp)})
                        if sp_id in node_ids:
                            edges.append({"source": group["id"], "target": sp["id"], "label": "access to"})
                except Exception:
                    pass

        # CA policies
        for policy in GraphService.get_all(
            "/identity/conditionalAccessPolicies?$select=id,displayName,state,conditions,grantControls",
            token,
            max_items=200,
        ):
            cond = policy.get("conditions", {})
            u_cond = cond.get("users", {})
            inc_groups = u_cond.get("includeGroups", [])
            exc_groups = u_cond.get("excludeGroups", [])
            if group_id in inc_groups and group_id not in exc_groups:
                add_node({"id": policy["id"], "label": policy.get("displayName", "CA Policy"), "type": "ca_policy", "data": GroupMapEngine._clean(policy)})
                edges.append({"source": group["id"], "target": policy["id"], "label": "affected by"})

        return nodes, edges, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
