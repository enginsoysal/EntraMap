"""
User Map Engine
Build graph visualization for a user
Shows devices, groups, apps, CA policies

PERFORMANCE OPTIMIZATIONS:
- Concurrent Graph API calls with ThreadPoolExecutor
- Early stopping for pagination
- Selective field queries
"""

from typing import Tuple, List, Dict, Set
from services.graph_service import GraphService
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


class UserMapEngine:
    """User map graph building"""

    @staticmethod
    def _get_intune_app_index(token: str, group_ids: List[str], max_apps: int = 400) -> Dict:
        """Index Intune apps by group with concurrent fetching."""
        target_ids = set(group_ids)
        app_index = {}
        
        # Fetch apps once
        apps = GraphService.get_all(
            "/deviceAppManagement/mobileApps"
            "?$select=id,displayName,publisher,description,createdDateTime,lastModifiedDateTime"
            "&$top=100",
            token,
            max_items=max_apps,
        )

        # Fetch assignments concurrently (much faster than sequential)
        def fetch_app_assignments(app: Dict) -> Tuple[Dict, List]:
            """Fetch assignments for one app."""
            assignments = GraphService.get_all(
                f"/deviceAppManagement/mobileApps/{app['id']}/assignments?$top=50",
                token,
                max_items=50,
            )
            return app, assignments

        # Use ThreadPoolExecutor for concurrent requests
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(fetch_app_assignments, app) for app in apps]
            
            for future in as_completed(futures):
                try:
                    app, assignments = future.result()
                    
                    for assignment in assignments:
                        target = assignment.get("target", {})
                        target_type = target.get("@odata.type", "")
                        if "groupAssignmentTarget" not in target_type:
                            continue

                        group_id = target.get("groupId")
                        if not group_id or (target_ids and group_id not in target_ids):
                            continue

                        app_index.setdefault(group_id, []).append({
                            "app": {
                                "id": app["id"],
                                "displayName": app.get("displayName", "Intune app"),
                                "publisher": app.get("publisher", ""),
                                "description": app.get("description", ""),
                                "createdDateTime": app.get("createdDateTime", ""),
                                "lastModifiedDateTime": app.get("lastModifiedDateTime", ""),
                            },
                            "edge_label": "excluded from" if "exclusion" in target_type.lower() else "assigned to",
                        })
                except Exception:
                    # If one app fails, skip it and continue
                    pass

        return app_index

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        """Remove OData metadata keys"""
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def build(user_id: str, token: str) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        Build graph for user.
        Returns: (nodes, edges, error_dict or None)
        """
        nodes, edges, node_ids = [], [], set()

        def add_node(n):
            if n["id"] not in node_ids:
                node_ids.add(n["id"])
                nodes.append(n)

        # Get user
        user = GraphService.get(
            "/users/{}?$select=id,displayName,userPrincipalName,jobTitle,department,"
            "mail,accountEnabled,city,country,mobilePhone,officeLocation,companyName,"
            "createdDateTime,lastPasswordChangeDateTime".format(user_id),
            token,
        )
        if not user:
            return None, None, {"error": "User not found"}
        if "error" in user:
            status = 404 if str(user.get("error")).lower() == "itemnotfound" else 502
            return None, None, {"error": user.get("message", "Failed to load user"), "status": status}

        # Try to get sign-in activity (optional)
        sign_in_activity = GraphService.get(f"/users/{user_id}?$select=signInActivity", token)
        if sign_in_activity and "error" not in sign_in_activity and "signInActivity" in sign_in_activity:
            user["signInActivity"] = sign_in_activity.get("signInActivity")

        add_node({"id": user["id"], "label": user.get("displayName", "?"), "type": "user", "data": UserMapEngine._clean(user)})

        # User devices
        for rel_label, ep in [
            ("owned device", f"/users/{user_id}/ownedDevices"),
            ("registered device", f"/users/{user_id}/registeredDevices"),
        ]:
            for dev in GraphService.get_all(
                ep + "?$select=id,displayName,operatingSystem,operatingSystemVersion,isCompliant,isManaged,trustType,deviceId",
                token,
            ):
                if dev["id"] not in node_ids:
                    add_node({"id": dev["id"], "label": dev.get("displayName", "Device"), "type": "device", "data": UserMapEngine._clean(dev)})
                    edges.append({"source": user["id"], "target": dev["id"], "label": rel_label})

        # User groups
        group_ids = []
        for m in GraphService.get_all(
            f"/users/{user_id}/transitiveMemberOf?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
            token,
            max_items=400,
        ):
            odata_type = m.get("@odata.type", "")
            is_group = (
                "#microsoft.graph.group" in odata_type
                or "groupTypes" in m
                or "securityEnabled" in m
            )
            if not is_group:
                continue
            group_ids.append(m["id"])
            add_node({"id": m["id"], "label": m.get("displayName", "Group"), "type": "group", "data": UserMapEngine._clean(m)})
            edges.append({"source": user["id"], "target": m["id"], "label": "member of"})

        # Group Intune apps
        intune_app_index = UserMapEngine._get_intune_app_index(token, group_ids)
        for gid, app_links in intune_app_index.items():
            for app_link in app_links:
                app_obj = app_link["app"]
                if app_obj["id"] not in node_ids:
                    add_node({"id": app_obj["id"], "label": app_obj.get("displayName", "Intune app"), "type": "app", "data": UserMapEngine._clean(app_obj)})
                if not any(e["source"] == gid and e["target"] == app_obj["id"] and e["label"] == app_link["edge_label"] for e in edges):
                    edges.append({"source": gid, "target": app_obj["id"], "label": app_link["edge_label"]})

        # Service principals from group assignments (concurrent fetching)
        all_assignments = []
        for gid in group_ids:
            assignments = GraphService.get_all(f"/groups/{gid}/appRoleAssignments", token, max_items=100)
            for assignment in assignments:
                all_assignments.append((gid, assignment))

        def fetch_service_principal(sp_id: str):
            sp = GraphService.get(
                f"/servicePrincipals/{sp_id}?$select=id,displayName,appId,description,servicePrincipalType,publisherName",
                token,
            )
            return sp_id, sp

        # Collect unique SP IDs and fetch concurrently
        unique_sp_ids = set()
        for gid, assignment in all_assignments:
            sp_id = assignment.get("resourceId")
            if sp_id:
                unique_sp_ids.add(sp_id)

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(fetch_service_principal, sp_id) for sp_id in unique_sp_ids]
            sp_cache = {}
            
            for future in as_completed(futures):
                try:
                    sp_id, sp = future.result()
                    if sp and "error" not in sp:
                        sp_cache[sp_id] = sp
                except Exception:
                    pass

        # Add edges using cached SPs
        for gid, assignment in all_assignments:
            sp_id = assignment.get("resourceId")
            if sp_id and sp_id in sp_cache:
                sp = sp_cache[sp_id]
                if sp_id not in node_ids:
                    add_node({"id": sp["id"], "label": sp.get("displayName", "App"), "type": "app", "data": UserMapEngine._clean(sp)})
                if not any(e["source"] == gid and e["target"] == sp_id for e in edges):
                    edges.append({"source": gid, "target": sp_id, "label": "access to"})

        # CA policies
        for policy in GraphService.get_all(
            "/identity/conditionalAccessPolicies?$select=id,displayName,state,conditions,grantControls",
            token,
            max_items=200,
        ):
            cond = policy.get("conditions", {})
            u_cond = cond.get("users", {})
            inc_users = u_cond.get("includeUsers", [])
            inc_groups = u_cond.get("includeGroups", [])
            exc_users = u_cond.get("excludeUsers", [])
            exc_groups = u_cond.get("excludeGroups", [])
            included = "All" in inc_users or user["id"] in inc_users or any(g in inc_groups for g in group_ids)
            excluded = user["id"] in exc_users or any(g in exc_groups for g in group_ids)
            if included and not excluded:
                add_node({"id": policy["id"], "label": policy.get("displayName", "CA Policy"), "type": "ca_policy", "data": UserMapEngine._clean(policy)})
                edges.append({"source": user["id"], "target": policy["id"], "label": "affected by"})

        return nodes, edges, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
