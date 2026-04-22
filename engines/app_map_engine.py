"""
App Map Engine
Build graph visualization for an Intune app
Shows group assignments and virtual targets
"""

from typing import Tuple, List, Dict
from services.graph_service import GraphService


class AppMapEngine:
    """App map graph building"""

    @staticmethod
    def _get_intune_app(app_id: str, token: str) -> Dict:
        """Fetch Intune app from v1.0 first, then beta as fallback."""
        app_item = GraphService.get(
            f"/deviceAppManagement/mobileApps/{app_id}?$select=id,displayName,publisher,description,createdDateTime,lastModifiedDateTime",
            token,
        )
        if app_item and "error" not in app_item:
            return app_item

        beta_item = GraphService.get(
            f"https://graph.microsoft.com/beta/deviceAppManagement/mobileApps/{app_id}?$select=id,displayName,publisher,description,createdDateTime,lastModifiedDateTime",
            token,
        )
        if beta_item and "error" not in beta_item:
            return beta_item

        return None

    @staticmethod
    def _get_assignments(app_id: str, token: str) -> List[Dict]:
        """Fetch Intune app assignments from v1.0 first, then beta fallback."""
        assignments = GraphService.get_all(
            f"/deviceAppManagement/mobileApps/{app_id}/assignments?$top=200",
            token,
            max_items=200,
        )
        if assignments:
            return assignments

        beta_assignments = GraphService.get_all(
            f"https://graph.microsoft.com/beta/deviceAppManagement/mobileApps/{app_id}/assignments?$top=200",
            token,
            max_items=200,
        )
        return beta_assignments

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        """Remove OData metadata keys"""
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def build(app_id: str, token: str) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        Build graph for Intune app.
        Returns: (nodes, edges, error_dict or None)
        """
        nodes, edges, node_ids = [], [], set()

        def add_node(n):
            if n["id"] not in node_ids:
                node_ids.add(n["id"])
                nodes.append(n)

        # Get app
        app_item = AppMapEngine._get_intune_app(app_id, token)
        if not app_item or "error" in app_item:
            return None, None, {"error": "Intune app not found"}

        add_node({"id": app_item["id"], "label": app_item.get("displayName", "?"), "type": "app", "data": AppMapEngine._clean(app_item)})

        # App assignments
        assignments = AppMapEngine._get_assignments(app_id, token)

        for assignment in assignments:
            target = assignment.get("target", {})
            target_type = target.get("@odata.type", "")

            if "groupAssignmentTarget" in target_type:
                group_id = target.get("groupId")
                if not group_id:
                    continue
                grp = GraphService.get(
                    f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
                    token,
                )
                if grp and "error" not in grp:
                    add_node({"id": grp["id"], "label": grp.get("displayName", "Group"), "type": "group", "data": AppMapEngine._clean(grp)})
                    edge_label = "excluded from" if "exclusion" in target_type.lower() else "assigned to"
                    edges.append({"source": grp["id"], "target": app_item["id"], "label": edge_label})
                continue

            if "allLicensedUsersAssignmentTarget" in target_type:
                v_id = f"virtual_all_users::{app_item['id']}"
                add_node({"id": v_id, "label": "All licensed users", "type": "user", "data": {"id": v_id, "displayName": "All licensed users"}})
                edges.append({"source": v_id, "target": app_item["id"], "label": "assigned to"})
                continue

            if "allDevicesAssignmentTarget" in target_type:
                v_id = f"virtual_all_devices::{app_item['id']}"
                add_node({"id": v_id, "label": "All devices", "type": "device", "data": {"id": v_id, "displayName": "All devices"}})
                edges.append({"source": v_id, "target": app_item["id"], "label": "assigned to"})
                continue

        return nodes, edges, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
