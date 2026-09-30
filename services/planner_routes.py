"""Planner HTTP boundary. Live scans require sign-in; synthetic labs are public."""
import json
from html import escape
from uuid import UUID
from flask import Blueprint, current_app, jsonify, render_template, request, session, Response
from engines.change_planner import compare, snapshot, seal, unseal, pseudonymize
from engines.group_impact_engine import GroupImpactEngine
from engines.planner_demo import lab
from services.graph_service import GraphService
from services.scan_service import capture


def create_planner(auth_engine, login_required):
    bp = Blueprint('planner', __name__)

    def owner():
        user = session.get('user') or {}
        return user.get('tid'), user.get('oid')

    def inputs():
        if request.headers.get('X-EntraMap-Request') != 'planner':
            raise ValueError('Planner request header is required.')
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise ValueError('Expected a JSON object.')
        return body

    def pair(body):
        tenant, user = owner()
        before = unseal(body.get('before'), current_app.secret_key, tenant, user)
        after = unseal(body.get('after'), current_app.secret_key, tenant, user)
        return compare(before, after, body.get('mode'))

    @bp.errorhandler(ValueError)
    def invalid(exc):
        return jsonify(error=str(exc)), 400

    @bp.get('/planner')
    def page():
        return render_template('planner.html', user=session.get('user'), version='0.6.0')

    @bp.get('/api/planner/demo/<name>')
    def demo(name):
        return jsonify({key: seal(value, current_app.secret_key) for key, value in lab(name).items()})

    @bp.post('/api/planner/scan')
    @login_required
    def scan():
        body = inputs()
        try:
            group_id = str(UUID(str(body.get('groupId', ''))))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError('Enter a valid group object ID or select a group from search.') from exc
        token = auth_engine.get_token(session)
        tenant, user = owner()
        if not tenant or not user:
            return jsonify(error='Sign in again to establish tenant context.'), 401
        with capture(fresh=True):
            result, error = GroupImpactEngine.build(group_id, token)
            if error:
                return jsonify(error), error.get('status', 502)
            with capture() as events:
                members = GraphService.get_all(f'/groups/{group_id}/members?$select=id&$top=999', token, max_items=10000)
            complete = not any(e['status'] in ('error', 'missing', 'truncated') for e in events)
            result['membership'] = {'status': 'ok' if complete else 'partial',
                                    'ids': sorted(m['id'] for m in members if m.get('id')),
                                    'limit': 10000, 'kind': 'direct'}
        return jsonify(seal(snapshot(result, tenant, user), current_app.secret_key))

    @bp.post('/api/planner/compare')
    def comparison():
        return jsonify(pair(inputs()))

    @bp.post('/api/planner/export')
    def export():
        body = inputs()
        report = pair(body)
        anonymous = body.get('pseudonymize') is True
        payload = pseudonymize(report) if anonymous else {'report': report, 'before': body['before'], 'after': body['after']}
        if body.get('format') == 'html':
            rows = payload['rows'] if anonymous else report['rows']
            rendered = ''.join('<tr><td>{}</td><td>{}</td><td>{}</td></tr>'.format(
                escape(r['domain']), escape(r.get('resource', r.get('name', ''))), escape(r['status'])) for r in rows)
            details = '' if anonymous else '<h2>Assignment evidence</h2>' + ''.join(
                '<details><summary>{}</summary><pre>{}</pre></details>'.format(escape(r['name']), escape(json.dumps({'before': r['before'], 'after': r['after']}, indent=2))) for r in rows)
            metadata = 'Pseudonymized report — original evidence omitted.' if anonymous else '<p>Source: {} — {}<br>Comparison: {} — {}</p>'.format(
                escape(body['before']['data']['result']['group']['displayName']), escape(body['before']['data']['capturedAt']),
                escape(body['after']['data']['result']['group']['displayName']), escape(body['after']['data']['capturedAt']))
            html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>EntraMap change dossier</title><style>body{{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#17233b}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #bbb;padding:10px;text-align:left}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}h1{{color:#154b79}}@media print{{details{{display:block}}}}</style><h1>EntraMap 0.6.0 · Change dossier</h1><p>{}</p>{}<p>{}</p><table><tr><th>Domain</th><th>Resource</th><th>Result</th></tr>{}</table><h2>Coverage limitations</h2><pre>{}</pre><h2>Direct membership comparison</h2><pre>{}</pre>{}</html>'.format(
                escape(report['mode']), metadata, escape(' '.join(report['notes'])), rendered,
                escape(json.dumps(report['limitations'], indent=2)),
                escape(json.dumps(payload.get('membership') if anonymous else report['membership'], indent=2)), details)
            return Response(html, mimetype='text/html', headers={'Content-Disposition': 'attachment; filename=entramap-change-dossier.html'})
        return Response(json.dumps(payload, indent=2), mimetype='application/json', headers={'Content-Disposition': 'attachment; filename=entramap-change-dossier.json'})

    return bp
