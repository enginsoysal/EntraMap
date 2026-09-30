import os
import unittest
from copy import deepcopy
from unittest.mock import Mock, patch

os.environ.setdefault('CLIENT_ID', 'test-client')
os.environ.setdefault('CLIENT_SECRET', 'test-secret')
os.environ.setdefault('FLASK_SECRET_KEY', 'test-session-key')

from engines.change_planner import compare, snapshot, seal, unseal, pseudonymize
from engines.planner_demo import lab
from engines.group_impact_engine import GroupImpactEngine
from engines.group_map_engine import GroupMapEngine
from engines.app_map_engine import AppMapEngine
from engines.user_map_engine import UserMapEngine
from engines.auth_engine import AuthEngine
from services.graph_service import GraphService
from services.scan_service import capture, ThreadPoolExecutor
from config.config import Config
from app import app, create_app


class ComparisonTests(unittest.TestCase):
    def test_each_lab_detects_semantic_change(self):
        for name in ('application', 'conditional-access', 'intune'):
            with self.subTest(name=name):
                fixture = lab(name)
                r = compare(fixture['before'], fixture['replacement'], 'replacement')
                self.assertEqual(r['counts'], {'changed': 1})

    def test_verification_detects_removed(self):
        f = lab('application')
        self.assertEqual(compare(f['before'], f['after'], 'verification')['counts'], {'removed': 1})

    def test_lost_visibility_is_unknown_not_removed(self):
        f = lab('intune')
        r = compare(f['before'], f['unavailable'], 'verification')
        self.assertEqual(r['counts'], {'unknown': 1})
        self.assertEqual(len(r['limitations']), 1)

    def test_incomplete_baseline_is_also_unknown(self):
        f = lab('application')
        f['before']['result']['domains'][0]['status'] = 'partial'
        self.assertEqual(compare(f['before'], f['after'], 'verification')['counts'], {'unknown': 1})

    def test_same_scan_rejected(self):
        f = lab('application')['before']
        with self.assertRaises(ValueError): compare(f, f, 'verification')

    def test_cross_tenant_rejected(self):
        f = lab('application'); f['replacement']['tenantId'] = 'other'
        with self.assertRaises(ValueError): compare(f['before'], f['replacement'], 'replacement')

    def test_cross_group_verification_rejected(self):
        f = lab('application')
        with self.assertRaises(ValueError): compare(f['before'], f['replacement'], 'verification')

    def test_same_group_replacement_rejected(self):
        f = lab('application')
        with self.assertRaises(ValueError): compare(f['before'], f['after'], 'replacement')

    def test_older_scan_rejected(self):
        f = lab('application'); f['after']['capturedAt'] = '2000-01-01T00:00:00+00:00'
        with self.assertRaises(ValueError): compare(f['before'], f['after'], 'verification')

    def test_different_scope_rejected(self):
        f = lab('application'); f['after']['scope'] = 'other'
        with self.assertRaises(ValueError): compare(f['before'], f['after'], 'verification')

    def test_assignment_ids_do_not_create_false_deltas(self):
        f = lab('application'); right = f['replacement']['result']['domains'][0]['findings'][0]
        right['id'] = 'different-assignment-id'; right['appRoleId'] = 'reader'
        right['name'] = 'Renamed application'
        self.assertEqual(compare(f['before'], f['replacement'], 'replacement')['counts'], {'equivalent': 1})

    def test_all_assignment_settings_matter(self):
        for prop, value in [('intent', 'uninstall'), ('filterId', 'another-filter'), ('settings', {'notifications': 'hideAll'})]:
            f = lab('intune'); right = f['replacement']['result']['domains'][0]['findings'][0]
            right['assignment'] = deepcopy(f['before']['result']['domains'][0]['findings'][0]['assignment'])
            right['assignment'][prop] = value
            self.assertEqual(compare(f['before'], f['replacement'], 'replacement')['counts'], {'changed': 1})

    def test_licensing_disabled_plans_matter(self):
        f = lab('application')
        for key in ('before', 'replacement'):
            d = f[key]['result']['domains'][0]; d['key'] = 'group_licensing'; d['findings'][0] = {'id': 'sku', 'disabledPlans': [key], 'impact': 'group_license_assignment'}
        self.assertEqual(compare(f['before'], f['replacement'], 'replacement')['counts'], {'changed': 1})

    def test_workloads_require_manual_review(self):
        f = lab('application')
        for key in ('before', 'replacement'): f[key]['result']['domains'][0]['key'] = 'm365_workloads'
        self.assertEqual(compare(f['before'], f['replacement'], 'replacement')['counts'], {'manual_review': 1})

    def test_member_deltas(self):
        f = lab('application'); r = compare(f['before'], f['replacement'], 'replacement')
        self.assertEqual(r['membership']['onlyBefore'], ['demo-user-2'])
        self.assertEqual(r['membership']['onlyAfter'], ['demo-user-3'])

    def test_pseudonymization_removes_raw_data(self):
        f = lab('intune'); r = pseudonymize(compare(f['before'], f['replacement'], 'replacement'))
        text = str(r)
        for value in ('demo-resource', 'demo-user', 'Managed browser', 'corporate-devices', 'signature'):
            self.assertNotIn(value, text)


class SignatureTests(unittest.TestCase):
    def setUp(self):
        self.data = snapshot(lab('application')['before']['result'], 'tenant-a', 'owner-a')

    def test_valid_owner(self):
        env = seal(self.data, 'secret')
        self.assertEqual(unseal(env, 'secret', 'tenant-a', 'owner-a'), self.data)

    def test_tampering_rejected(self):
        env = seal(self.data, 'secret'); env['data']['result']['domains'] = []
        with self.assertRaises(ValueError): unseal(env, 'secret', 'tenant-a', 'owner-a')

    def test_other_owner_or_tenant_rejected(self):
        for tenant, owner in [('tenant-b', 'owner-a'), ('tenant-a', 'owner-b'), (None, None)]:
            with self.assertRaises(ValueError): unseal(seal(self.data, 'secret'), 'secret', tenant, owner)

    def test_wrong_key_rejected(self):
        with self.assertRaises(ValueError): unseal(seal(self.data, 'secret'), 'wrong', 'tenant-a', 'owner-a')

    def test_expired_signature(self):
        with patch('itsdangerous.timed.time.time', return_value=1): env = seal(self.data, 'secret')
        with self.assertRaises(ValueError): unseal(env, 'secret', 'tenant-a', 'owner-a')


class GraphTests(unittest.TestCase):
    def setUp(self): GraphService.clear_cache()

    def response(self, value=None, code=200):
        return Mock(status_code=code, json=Mock(return_value=value), text='failure')

    def test_error_after_probe_is_partial(self):
        http = Mock(); http.get.side_effect = [self.response({'value': [{'id':'p'}]}), self.response(code=503)]
        with patch('services.graph_service._get_session', return_value=http):
            r = GroupImpactEngine._collect_ca_impact('g', 'token')
        self.assertEqual(r['status'], 'partial')
        self.assertTrue(r['coverage']['issues'])

    def test_page_failure_keeps_results_but_marks_incomplete(self):
        http = Mock(); http.get.side_effect = [self.response({'value':[{'id':'a'}], '@odata.nextLink':'https://graph.microsoft.com/v1.0/next'}), self.response(code=403)]
        with patch('services.graph_service._get_session', return_value=http), capture() as events:
            items = GraphService.get_all('/groups', 'token')
        self.assertEqual(items, [{'id':'a'}]); self.assertTrue(any(e['status']=='error' for e in events))

    def test_limit_detected(self):
        http = Mock(); http.get.return_value = self.response({'value':[{'id':'a'}], '@odata.nextLink':'https://graph.microsoft.com/v1.0/next'})
        with patch('services.graph_service._get_session', return_value=http), capture() as events:
            GraphService.get_all('/groups', 'token', max_items=1)
        self.assertTrue(any(e['status']=='truncated' for e in events))

    def test_exact_limit_without_next_page_is_complete(self):
        http = Mock(); http.get.return_value = self.response({'value':[{'id':'a'}]})
        with patch('services.graph_service._get_session', return_value=http), capture() as events:
            GraphService.get_all('/groups', 'token', max_items=1)
        self.assertFalse(any(e['status']=='truncated' for e in events))

    def test_fresh_bypasses_cache_and_context_reaches_workers(self):
        http = Mock(); http.get.side_effect = [self.response({'id':'old'}), self.response({'id':'new'})]
        with patch('services.graph_service._get_session', return_value=http):
            self.assertEqual(GraphService.get('/groups/g','token')['id'], 'old')
            with capture(fresh=True) as events, ThreadPoolExecutor(max_workers=1) as pool:
                self.assertEqual(pool.submit(GraphService.get,'/groups/g','token').result()['id'], 'new')
            self.assertEqual(len(events), 1)

    def test_cache_returns_isolated_copies(self):
        http = Mock(); http.get.return_value = self.response({'value':[]})
        with patch('services.graph_service._get_session', return_value=http):
            GraphService.get('/groups','token')['value'].append('mutated')
            self.assertEqual(GraphService.get('/groups','token')['value'], [])

    def test_untrusted_nextlink_never_receives_token(self):
        http=Mock(); http.get.return_value=self.response({'value':[], '@odata.nextLink':'https://attacker.invalid/collect'})
        with patch('services.graph_service._get_session', return_value=http): GraphService.get_all('/groups','secret-token')
        self.assertEqual(http.get.call_count,1)

    def test_cache_uses_full_token_hash(self):
        self.assertEqual(len(GraphService._cache_key('/groups','token').split(':')[-1]),64)


class IdentityTests(unittest.TestCase):
    def test_token_matches_current_account_and_tenant(self):
        engine=AuthEngine(Config); client=Mock()
        correct={'local_account_id':'current','realm':'tenant'}
        client.get_accounts.return_value=[{'local_account_id':'old','realm':'tenant'},correct]
        client.acquire_token_silent.return_value={'access_token':'selected'}
        with patch.object(engine,'_load_cache'),patch.object(engine,'_msal_app',return_value=client),patch.object(engine,'_save_cache'):
            self.assertEqual(engine.get_token({'user':{'oid':'current','tid':'tenant'}}),'selected')
        self.assertEqual(client.acquire_token_silent.call_args.kwargs['account'],correct)

    def test_wrong_tenant_never_falls_back_to_first_account(self):
        engine=AuthEngine(Config); client=Mock();client.get_accounts.return_value=[{'local_account_id':'current','realm':'other'}]
        with patch.object(engine,'_load_cache'),patch.object(engine,'_msal_app',return_value=client):
            self.assertIsNone(engine.get_token({'user':{'oid':'current','tid':'tenant'}}))
        client.acquire_token_silent.assert_not_called()

    def test_intune_exclusion_is_visible(self):
        with patch.object(AppMapEngine,'_get_intune_app',return_value={'id':'a'}),patch.object(AppMapEngine,'_get_assignments',return_value=[{'target':{'@odata.type':'#microsoft.graph.exclusionGroupAssignmentTarget','groupId':'g'}}]),patch.object(GraphService,'get',return_value={'id':'g'}):
            _,edges,_=AppMapEngine.build('a','token')
        self.assertEqual(edges[0]['label'],'excluded from')

    def test_impact_uses_resource_id_and_enterprise_type(self):
        result=lab('application')['before']['result']
        with patch.object(GroupImpactEngine,'build',return_value=(result,None)):
            nodes,_,_=GroupMapEngine.build_impact_graph('demo-source','token')
        self.assertEqual(nodes[1]['id'],'demo-resource');self.assertEqual(nodes[1]['type'],'enterprise_app')

    def test_transitive_membership_does_not_infer_enterprise_assignment(self):
        calls=[]
        def get(ep,token,*args):
            if ep.startswith('/users/u?') and 'signInActivity' not in ep:return {'id':'u'}
            return None
        def all_items(ep,token,**kwargs):
            calls.append(ep)
            if '/transitiveMemberOf?' in ep:return [{'id':'parent','@odata.type':'#microsoft.graph.group'}]
            return []
        with patch.object(GraphService,'get',side_effect=get),patch.object(GraphService,'get_all',side_effect=all_items):
            _,edges,_=UserMapEngine.build('u','token')
        self.assertFalse(any('/groups/parent/appRoleAssignments' in c for c in calls))
        self.assertTrue(any('/users/u/appRoleAssignments' in c for c in calls))
        self.assertEqual(edges[0]['label'],'indirect member of')


class CanonicalHostTests(unittest.TestCase):
    def test_public_entries_use_callback_origin_before_creating_state(self):
        with patch.object(Config, 'REDIRECT_URI', 'https://entramap.com/auth/callback'):
            client = create_app().test_client()
        for path in ('/', '/planner', '/auth/signin?popup=1'):
            response = client.get(path, base_url='https://example.azurewebsites.net')
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.location, 'https://entramap.com' + path)
            self.assertNotIn('Set-Cookie', response.headers)

    def test_canonical_host_and_nonentry_requests_are_not_redirected(self):
        with patch.object(Config, 'REDIRECT_URI', 'https://entramap.com/auth/callback'):
            client = create_app().test_client()
        for path, base in (('/', 'https://entramap.com'), ('/api/health', 'https://example.azurewebsites.net'), ('/auth/callback?code=private', 'https://example.azurewebsites.net')):
            self.assertNotIn(client.get(path, base_url=base).status_code, (301, 302, 307, 308))

    def test_local_alias_keeps_port_and_query(self):
        with patch.object(Config, 'REDIRECT_URI', 'http://localhost:5016/auth/callback'):
            client = create_app().test_client()
        response = client.get('/auth/signin?popup=1', base_url='http://127.0.0.1:5016')
        self.assertEqual(response.location, 'http://localhost:5016/auth/signin?popup=1')


class RouteTests(unittest.TestCase):
    def setUp(self):
        app.config['TESTING']=True;self.client=app.test_client()
        self.headers={'X-EntraMap-Request':'planner'}

    def test_page_and_assets(self):
        for path in ('/','/planner','/static/js/planner.js','/static/css/planner.css','/api/health'):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code,200,path)

    def test_live_scan_requires_auth(self):
        self.assertEqual(self.client.post('/api/planner/scan',json={},headers=self.headers).status_code,401)

    def test_header_required(self):
        self.assertEqual(self.client.post('/api/planner/compare',json={}).status_code,400)

    def test_demo_comparison_and_exports(self):
        f=self.client.get('/api/planner/demo/application').get_json()
        body={'before':f['before'],'after':f['replacement'],'mode':'replacement'}
        self.assertEqual(self.client.post('/api/planner/compare',json=body,headers=self.headers).get_json()['counts'],{'changed':1})
        for fmt in ('json','html'):
            for anonymous in (True,False):
                r=self.client.post('/api/planner/export',json={**body,'format':fmt,'pseudonymize':anonymous},headers=self.headers)
                self.assertEqual(r.status_code,200);self.assertIn('attachment',r.headers['Content-Disposition'])
                if anonymous:self.assertNotIn('Finance reporting',r.get_data(as_text=True))

    def test_live_scan_is_fresh_and_signed(self):
        from services.scan_service import is_fresh
        with self.client.session_transaction() as sess:sess['user']={'oid':'owner','tid':'tenant'}
        def build(group,token):
            self.assertTrue(is_fresh())
            return lab('application')['before']['result'],None
        with patch('app.auth_engine.get_token',return_value='token'),patch.object(GroupImpactEngine,'build',side_effect=build),patch.object(GraphService,'get_all',return_value=[]):
            r=self.client.post('/api/planner/scan',json={'groupId':'11111111-1111-1111-1111-111111111111'},headers=self.headers)
        self.assertEqual(r.status_code,200)
        self.assertFalse(unseal(r.get_json(),app.secret_key,'tenant','owner')['demo'])

    def test_invalid_group_id_rejected(self):
        with self.client.session_transaction() as sess:sess['user']={'oid':'owner','tid':'tenant'}
        with patch('app.auth_engine.get_token',return_value='token'):
            r=self.client.post('/api/planner/scan',json={'groupId':'../users'},headers=self.headers)
        self.assertEqual(r.status_code,400)

    def test_tampered_import_rejected(self):
        f=self.client.get('/api/planner/demo/application').get_json();f['before']['data']['result']['domains']=[]
        r=self.client.post('/api/planner/compare',json={'before':f['before'],'after':f['after'],'mode':'verification'},headers=self.headers)
        self.assertEqual(r.status_code,400)

    def test_invalid_demo_rejected(self):
        self.assertEqual(self.client.get('/api/planner/demo/unknown').status_code,400)


if __name__=='__main__':unittest.main()
