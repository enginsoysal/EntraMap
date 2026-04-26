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
    def _collect_intune_app_links(group_id: str, token: str, base_url: str = "https://graph.microsoft.com/v1.0") -> List[Dict]:
        """Collect Intune app assignments for a single group from v1.0 or beta."""
        apps = GraphService.get_all(
            f"{base_url}/deviceAppManagement/mobileApps?$select=id,displayName,publisher,description,lastModifiedDateTime&$top=100",
            token,
            max_items=1200,
        )

        findings = []

        def collect_for_app(app: Dict) -> List[Dict]:
            app_id = app.get("id")
            if not app_id:
                return []

            assignments = GraphService.get_all(
                f"{base_url}/deviceAppManagement/mobileApps/{app_id}/assignments?$top=100",
                token,
                max_items=100,
            )

            hits = []
            for assignment in assignments:
                target = assignment.get("target", {})
                target_type = (target.get("@odata.type") or "").lower()
                if target.get("groupId") != group_id:
                    continue

                hits.append(
                    {
                        "app": {
                            "id": app_id,
                            "displayName": app.get("displayName", "Intune app"),
                            "publisher": app.get("publisher", ""),
                            "description": app.get("description", ""),
                            "lastModifiedDateTime": app.get("lastModifiedDateTime", ""),
                        },
                        "edge_label": "excluded from" if "exclusion" in target_type else "assigned to",
                    }
                )
            return hits

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(collect_for_app, app) for app in apps]
            for future in as_completed(futures):
                try:
                    findings.extend(future.result())
                except Exception:
                    pass

        return findings

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
            f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled,membershipRule,membershipRuleProcessingState",
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

        # Intune app assignments
        intune_links = GroupMapEngine._collect_intune_app_links(group_id, token)
        if not intune_links:
            intune_links = GroupMapEngine._collect_intune_app_links(group_id, token, "https://graph.microsoft.com/beta")

        for link in intune_links:
            app_obj = link.get("app", {})
            app_id = app_obj.get("id")
            if not app_id:
                continue
            add_node({"id": app_id, "label": app_obj.get("displayName", "Intune app"), "type": "app", "data": GroupMapEngine._clean(app_obj)})
            if not any(e["source"] == group["id"] and e["target"] == app_id and e["label"] == link.get("edge_label") for e in edges):
                edges.append({"source": group["id"], "target": app_id, "label": link.get("edge_label", "assigned to")})

        # CA policies
        for policy in GraphService.get_all(
            "/identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls",
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
