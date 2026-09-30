"""Synthetic community labs; never call Graph or use tenant data."""
from copy import deepcopy
from engines.change_planner import snapshot


def lab(name):
    choices = {
        'application': ('enterprise_apps', 'Finance reporting', {'appRoleId': 'reader', 'impact': 'app_role_assignment'}, {'appRoleId': 'writer', 'impact': 'app_role_assignment'}),
        'conditional-access': ('conditional_access', 'Require strong authentication', {'impact': 'excluded_scope', 'state': 'enabled'}, {'impact': 'included_scope', 'state': 'enabled'}),
        'intune': ('intune_apps', 'Managed browser', {'impact': 'included_scope', 'assignment': {'intent': 'required', 'filterId': 'corporate-devices'}}, {'impact': 'included_scope', 'assignment': {'intent': 'available', 'filterId': None}}),
    }
    if name not in choices:
        raise ValueError('Unknown demo lab.')
    key, label, old, new = choices[name]
    finding = {'id': 'demo-assignment', 'resourceId': 'demo-resource', 'name': label,
               'severity': 'warning', 'evidence': {'sources': ['Synthetic training fixture'], 'relationship': old['impact']}, **old}
    result = {'group': {'id': 'demo-source', 'displayName': 'Legacy workforce', 'groupTypes': [], 'securityEnabled': True},
              'summary': {'partialDomains': 0},
              'membership': {'status': 'ok', 'ids': ['demo-user-1', 'demo-user-2']},
              'domains': [{'key': key, 'label': label, 'status': 'ok', 'count': 1, 'findings': [finding]}]}
    before = snapshot(result, 'demo', 'demo', True)
    replacement = deepcopy(result)
    replacement['group'] = {'id': 'demo-target', 'displayName': 'New workforce', 'groupTypes': [], 'securityEnabled': True}
    replacement['domains'][0]['findings'][0].update(new)
    replacement['domains'][0]['findings'][0]['evidence']['relationship'] = new['impact']
    replacement['membership']['ids'] = ['demo-user-1', 'demo-user-3']
    after = deepcopy(result)
    after['domains'][0]['findings'] = []
    after['domains'][0]['count'] = 0
    verified = snapshot(after, 'demo', 'demo', True)
    from datetime import datetime, timedelta, timezone
    verified['capturedAt'] = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    unavailable = deepcopy(after)
    unavailable['domains'][0]['status'] = 'no_permission'
    unavailable['domains'][0]['details'] = 'Synthetic missing-permission scenario.'
    unknown = snapshot(unavailable, 'demo', 'demo', True)
    unknown['capturedAt'] = verified['capturedAt']
    return {'before': before, 'replacement': snapshot(replacement, 'demo', 'demo', True),
            'after': verified, 'unavailable': unknown}
