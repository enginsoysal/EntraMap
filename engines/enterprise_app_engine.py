"""Enterprise application navigation uses service principals, never Intune IDs."""
from services.graph_service import GraphService


class EnterpriseAppEngine:
    @staticmethod
    def build(app_id, token):
        sp = GraphService.get(f'/servicePrincipals/{app_id}?$select=id,displayName,appId,publisherName,appRoleAssignmentRequired,appRoles', token)
        if not sp or 'error' in sp:
            return None, None, {'error': 'Enterprise application could not be read', 'status': 502 if sp else 404}
        nodes = [{'id': sp['id'], 'label': sp.get('displayName', 'Enterprise application'), 'type': 'enterprise_app', 'data': sp}]
        edges, seen = [], {sp['id']}
        for a in GraphService.get_all(f'/servicePrincipals/{app_id}/appRoleAssignedTo?$top=100', token, max_items=1000):
            kind = {'User': 'user', 'Group': 'group', 'ServicePrincipal': 'enterprise_app'}.get(a.get('principalType'))
            pid = a.get('principalId')
            if not kind or not pid:
                continue
            if pid not in seen:
                nodes.append({'id': pid, 'label': a.get('principalDisplayName') or pid, 'type': kind, 'data': {'id': pid, 'displayName': a.get('principalDisplayName')}})
                seen.add(pid)
            role = next((r.get('displayName') for r in sp.get('appRoles', []) if r['id'] == a.get('appRoleId')), 'Default access')
            edges.append({'source': pid, 'target': sp['id'], 'label': f'Assigned: {role}'})
        return nodes, edges, None
