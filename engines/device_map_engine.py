"""
Device Map Engine
Build graph visualization for a device
Shows owners and registered users
"""

from typing import Tuple, List, Dict
from services.graph_service import GraphService


class DeviceMapEngine:
    """Device map graph building"""

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        """Remove OData metadata keys"""
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def build(device_id: str, token: str) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        Build graph for device.
        Returns: (nodes, edges, error_dict or None)
        """
        nodes, edges, node_ids = [], [], set()

        def add_node(n):
            if n["id"] not in node_ids:
                node_ids.add(n["id"])
                nodes.append(n)

        # Get device
        device = GraphService.get(
            f"/devices/{device_id}?$select=id,displayName,operatingSystem,operatingSystemVersion,isManaged,isCompliant,trustType,deviceId",
            token,
        )
        if not device or "error" in device:
            return None, None, {"error": "Device not found"}

        add_node({"id": device["id"], "label": device.get("displayName", "?"), "type": "device", "data": DeviceMapEngine._clean(device)})

        # Device owners
        for owner in GraphService.get_all(
            f"/devices/{device_id}/registeredOwners?$select=id,displayName,userPrincipalName,jobTitle",
            token,
            max_items=50,
        ):
            if "#microsoft.graph.user" not in owner.get("@odata.type", "") and "userPrincipalName" not in owner:
                continue
            add_node({"id": owner["id"], "label": owner.get("displayName", "?"), "type": "user", "data": DeviceMapEngine._clean(owner)})
            edges.append({"source": owner["id"], "target": device["id"], "label": "owns"})

        # Device registered users
        for user in GraphService.get_all(
            f"/devices/{device_id}/registeredUsers?$select=id,displayName,userPrincipalName,jobTitle",
            token,
            max_items=50,
        ):
            if "#microsoft.graph.user" not in user.get("@odata.type", "") and "userPrincipalName" not in user:
                continue
            add_node({"id": user["id"], "label": user.get("displayName", "?"), "type": "user", "data": DeviceMapEngine._clean(user)})
            edges.append({"source": user["id"], "target": device["id"], "label": "registered"})

        return nodes, edges, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
