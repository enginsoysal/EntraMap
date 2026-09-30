"""Immutable scan envelopes and conservative, semantic group comparisons."""
import hashlib
import json
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from itsdangerous import URLSafeTimedSerializer, BadSignature

SCHEMA = 1
MAX_AGE = 86400
COMPARABLE = {'conditional_access', 'enterprise_apps', 'intune_apps',
              'intune_device_configurations', 'intune_settings_catalog',
              'intune_admin_templates', 'intune_compliance', 'intune_app_protection',
              'intune_app_configuration', 'intune_scripts_bundle', 'intune_enrollment_bundle',
              'cloud_pc_bundle', 'group_licensing', 'iam_roles'}
SEMANTIC_FIELDS = ('impact', 'appRoleId', 'assignment', 'disabledPlans',
                   'directoryScopeId', 'appScopeId', 'state')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def snapshot(result, tenant, owner, demo=False):
    return {'schemaVersion': SCHEMA, 'scanVersion': '0.6.0', 'id': str(uuid4()),
            'tenantId': tenant, 'ownerId': owner, 'demo': demo,
            'capturedAt': datetime.now(timezone.utc).isoformat(),
            'scope': 'group-direct-dependencies-v1', 'result': deepcopy(result)}


def seal(data, secret):
    digest = hashlib.sha256(canonical(data).encode()).hexdigest()
    return {'data': data, 'signature': URLSafeTimedSerializer(secret, salt='planner-v1').dumps(digest)}


def unseal(envelope, secret, tenant, owner):
    if not isinstance(envelope, dict) or not isinstance(envelope.get('data'), dict):
        raise ValueError('Choose an original EntraMap snapshot file.')
    data = envelope['data']
    if not isinstance(envelope.get('signature'), str):
        raise ValueError('Snapshot signature is missing or invalid.')
    try:
        digest = URLSafeTimedSerializer(secret, salt='planner-v1').loads(envelope.get('signature', ''), max_age=MAX_AGE)
    except BadSignature as exc:
        raise ValueError('Snapshot signature is invalid or older than 24 hours. Capture a fresh scan.') from exc
    if digest != hashlib.sha256(canonical(data).encode()).hexdigest():
        raise ValueError('Snapshot was modified. Capture a fresh scan.')
    if data.get('schemaVersion') != SCHEMA or data.get('scope') != 'group-direct-dependencies-v1':
        raise ValueError('Snapshot schema or scope is not supported.')
    if not data.get('demo') and (data.get('tenantId') != tenant or data.get('ownerId') != owner):
        raise ValueError('Snapshot belongs to another tenant or account.')
    return data


def _resources(domain):
    resources = defaultdict(list)
    for f in domain.get('findings', []):
        resources[str(f.get('resourceId') or f.get('id') or 'unknown')].append(f)
    return resources


def _semantics(findings):
    return sorted(canonical({k: f[k] for k in SEMANTIC_FIELDS if k in f}) for f in findings)


def compare(before, after, mode):
    if mode not in ('replacement', 'verification'):
        raise ValueError('Choose replacement or verification.')
    if before['id'] == after['id']:
        raise ValueError('Choose two different snapshots.')
    if before['tenantId'] != after['tenantId'] or before['demo'] != after['demo']:
        raise ValueError('Both scans must belong to the same tenant and data mode.')
    if before['scope'] != after['scope'] or before['scanVersion'] != after['scanVersion']:
        raise ValueError('Scans must use the same scope and scan version.')
    bgroup, agroup = before['result']['group'], after['result']['group']
    same_group = bgroup['id'] == agroup['id']
    if mode == 'verification' and not same_group:
        raise ValueError('Verification requires two scans of the same source group.')
    if mode == 'replacement' and same_group:
        raise ValueError('Select a different replacement group.')
    if mode == 'verification' and after['capturedAt'] <= before['capturedAt']:
        raise ValueError('Verification requires a later scan.')
    bdomains = {d['key']: d for d in before['result']['domains']}
    adomains = {d['key']: d for d in after['result']['domains']}
    rows, limitations = [], []
    for key in sorted(bdomains.keys() | adomains.keys()):
        bd, ad = bdomains.get(key, {}), adomains.get(key, {})
        readable = bd.get('status') == 'ok' and ad.get('status') == 'ok'
        if not readable:
            limitations.append({'domain': key, 'before': bd.get('status', 'not_scanned'), 'after': ad.get('status', 'not_scanned')})
        br, ar = _resources(bd), _resources(ad)
        for rid in sorted(br.keys() | ar.keys()):
            left, right = br.get(rid, []), ar.get(rid, [])
            if not readable:
                status = 'unknown'
            elif mode == 'replacement' and key not in COMPARABLE:
                status = 'manual_review'
            elif not right:
                status = 'missing' if mode == 'replacement' else 'removed'
            elif not left:
                status = 'additional' if mode == 'replacement' else 'added'
            elif _semantics(left) != _semantics(right):
                status = 'changed'
            else:
                status = 'equivalent' if mode == 'replacement' else 'unchanged'
            rows.append({'domain': key, 'resourceId': rid,
                         'name': (left or right)[0].get('name', rid), 'status': status,
                         'before': left, 'after': right})
    notes = ['Comparison covers observed references, not effective access or approval to delete.',
             'A missing permission, failed request or scan limit is never treated as a resolved dependency.']
    if mode == 'replacement':
        notes += ['Equivalent means matching collected assignment settings; validate runtime behavior separately.',
                  'Microsoft 365 workspaces, PIM, governance and nested-group changes require manual review.']
        if 'Unified' in bgroup.get('groupTypes', []) or 'Unified' in agroup.get('groupTypes', []):
            notes.append('Replacing a Microsoft 365 group does not migrate Teams, SharePoint, mailbox or Planner content.')
        if agroup.get('onPremisesSyncEnabled') or 'DynamicMembership' in agroup.get('groupTypes', []):
            notes.append('Replacement membership is managed by synchronization or a dynamic rule; review its source.')
    members = None
    bm, am = before['result'].get('membership', {}), after['result'].get('membership', {})
    if bm.get('status') == 'ok' and am.get('status') == 'ok':
        bs, ats = set(bm.get('ids', [])), set(am.get('ids', []))
        members = {'onlyBefore': sorted(bs - ats), 'onlyAfter': sorted(ats - bs), 'shared': len(bs & ats),
                   'meaning': 'Direct members only; matching membership does not prove effective access.'}
    else:
        notes.append('Direct member comparison is unavailable or incomplete.')
    counts = {status: sum(r['status'] == status for r in rows) for status in sorted({r['status'] for r in rows})}
    return {'mode': mode, 'beforeScanId': before['id'], 'afterScanId': after['id'],
            'counts': counts, 'rows': rows, 'limitations': limitations, 'membership': members,
            'notes': notes, 'decision': 'Review required' if limitations or any(r['status'] not in ('equivalent', 'removed') for r in rows) else 'Collected references reviewed',
            'verifiedAt': datetime.now(timezone.utc).isoformat()}


def pseudonymize(value):
    """Allowlisted projection: raw findings, endpoints, free text and signatures never leave it."""
    mapping = {}
    def alias(raw):
        if raw not in mapping:
            mapping[raw] = f'Object {len(mapping) + 1}'
        return mapping[raw]
    return {'pseudonymized': True, 'mode': value['mode'], 'counts': value['counts'],
            'limitations': value['limitations'], 'notes': value['notes'],
            'rows': [{'domain': r['domain'], 'resource': alias(r['resourceId']), 'status': r['status']} for r in value['rows']],
            'membership': {k: len(v) if isinstance(v, list) else v for k, v in (value.get('membership') or {}).items() if k != 'meaning'}}
