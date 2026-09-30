import json
import os
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('CLIENT_ID', 'test-client')
os.environ.setdefault('CLIENT_SECRET', 'test-secret')
os.environ.setdefault('FLASK_SECRET_KEY', 'test-session-key')
from app import app
from config.config import Config

ROOT = Path(__file__).resolve().parents[1]
GUIDE = json.loads((ROOT / 'docs/guide.json').read_text(encoding='utf-8'))


class Tags(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class DocumentationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_public_without_graph_or_identity(self):
        with patch('services.graph_service.GraphService.get', side_effect=AssertionError('Docs must not read Graph')):
            for path in ('/docs', '/docs/'):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(b'Understand every click.', response.data)
                self.assertNotIn(b'Sign in required', response.data.split(b'<main')[0])

    def test_all_links_and_assets_resolve(self):
        response = self.client.get('/docs')
        tags = Tags(response.get_data(as_text=True)).tags
        ids = [a['id'] for _, a in tags if 'id' in a]
        self.assertEqual(len(ids), len(set(ids)), 'Duplicate anchors')
        for tag, attrs in tags:
            target = attrs.get('href', attrs.get('src', ''))
            if target.startswith('#'):
                self.assertIn(target[1:], ids, target)
            elif target.startswith('/static/'):
                with self.client.get(target) as asset:
                    self.assertEqual(asset.status_code, 200, target)
        self.assertEqual(sum(tag == 'img' and a.get('src', '').startswith('/static/docs/') for tag, a in tags),
                         sum(len(s['screenshots']) for s in GUIDE['sections']))

    def test_every_static_and_generated_button_id_documented(self):
        selectors = ' '.join(selector for s in GUIDE['sections'] for c in s['controls'] for selector in c['selectors'])
        for file in ('templates/index.html', 'templates/planner.html', 'templates/docs.html', 'static/js/main.js'):
            source = (ROOT / file).read_text(encoding='utf-8')
            for tag in re.findall(r'<button\b[^>]*>', source):
                match = re.search(r'\bid="([\w-]+)"', tag)
                if match:
                    self.assertIn('#' + match[1], selectors, f'Undocumented button in {file}: {match[1]}')

    def test_all_variant_buttons_and_exports_documented(self):
        selectors = ' '.join(selector for s in GUIDE['sections'] for c in s['controls'] for selector in c['selectors'])
        for attr, values in {'data-type': ['user','group','device','app','ca_policy'],
                             'data-auth-tab': ['signin','features','howto','permissions','changelog'],
                             'data-tutorial-phase': ['basic','advanced','expert','god_mode'],
                             'data-lab': ['application','conditional-access','intune'],
                             'data-igc-preset': ['cab','security','reset']}.items():
            for value in values:
                self.assertIn(f'[{attr}="{value}"]', selectors)
        for fn in re.findall(r'<button[^>]+onclick="(\w+)\(', (ROOT/'static/js/main.js').read_text(encoding='utf-8')):
            self.assertTrue(fn in selectors or fn == 'copyIdFromBtn', fn)

    def test_permission_and_domain_catalogue_matches_implementation(self):
        sections = {s['id']: s for s in GUIDE['sections']}
        self.assertEqual({r[0] for r in sections['permissions']['table']['rows']}, set(Config.SCOPES))
        source = (ROOT/'engines/group_impact_engine.py').read_text(encoding='utf-8')
        block = source.split('domain_modes = {', 1)[1].split('}',1)[0]
        domains = set(re.findall(r'"(\w+)": "enumerated"', block))
        self.assertEqual({r[0].split(' / ')[1] for r in sections['domains']['table']['rows']}, domains)

    def test_screenshots_are_real_jpegs_with_correct_dimensions(self):
        for name, shot in GUIDE['screenshots'].items():
            raw = (ROOT/'static/docs'/shot['file']).read_bytes()
            self.assertTrue(raw.startswith(b'\xff\xd8'), name)
            pos = 2
            while pos < len(raw):
                marker = raw[pos + 1]
                length = struct.unpack('>H', raw[pos + 2:pos + 4])[0]
                if marker in (0xc0, 0xc1, 0xc2):
                    height, width = struct.unpack('>HH', raw[pos + 5:pos + 9])
                    break
                pos += 2 + length
            else:
                self.fail('No JPEG dimensions: ' + name)
            self.assertEqual((width,height),(shot['width'],shot['height']),name)
            self.assertGreater(len(raw), 10000, name)

    def test_product_entry_points_link_to_docs(self):
        for path in ('/', '/planner'):
            self.assertIn(b'href="/docs"', self.client.get(path).data)

    def test_source_contains_no_live_tenant_fixture(self):
        text = json.dumps(GUIDE)
        self.assertNotIn('prosystech', text.lower())
        self.assertNotRegex(text, r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')


if __name__ == '__main__':
    unittest.main()
