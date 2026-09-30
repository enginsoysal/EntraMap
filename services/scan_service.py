"""Request-local evidence, including work submitted to thread pools."""
from concurrent.futures import ThreadPoolExecutor as BaseExecutor
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
from datetime import datetime, timezone
from functools import wraps

_traces = ContextVar('scan_traces', default=())
_fresh = ContextVar('scan_fresh', default=False)


class ThreadPoolExecutor(BaseExecutor):
    def submit(self, fn, /, *args, **kwargs):
        return super().submit(copy_context().run, fn, *args, **kwargs)


@contextmanager
def capture(fresh=False):
    events = []
    trace_token = _traces.set((*_traces.get(), events))
    fresh_token = _fresh.set(fresh or _fresh.get())
    try:
        yield events
    finally:
        _traces.reset(trace_token)
        _fresh.reset(fresh_token)


def is_fresh():
    return _fresh.get()


def record(endpoint, status, **kwargs):
    event = dict(endpoint=endpoint, status=status,
                 observedAt=datetime.now(timezone.utc).isoformat(), **kwargs)
    for events in _traces.get():
        events.append(event)


def traced_domain(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        with capture() as events:
            result = fn(*args, **kwargs)
        issues = [e for e in events if e['status'] in ('error', 'truncated', 'missing')]
        # A 404 for a resource lookup can legitimately mean no backing workload;
        # a failed collection is recorded as an issue by get_all.
        if issues and result.get('status') == 'ok':
            result['status'] = 'partial'
            result['details'] = 'Some requests failed or reached a scan limit. Absence is not verified.'
        result['coverage'] = {
            'state': 'complete' if result.get('status') == 'ok' else 'partial',
            'requests': len(events), 'issueCount': len(issues), 'issues': issues[:100],
            'sources': sorted({e['endpoint'].split('?')[0] for e in events})[:50],
        }
        for finding in result.get('findings', []):
            rid = str(finding.get('resourceId') or finding.get('id') or '')
            sources = sorted({e['endpoint'].split('?')[0] for e in events if rid and rid in e['endpoint']})
            finding.setdefault('evidence', {'sources': (sources or result['coverage']['sources'][:3])[:6],
                                          'observedAt': events[-1]['observedAt'] if events else None,
                                          'relationship': finding.get('impact', 'reference')})
        return result
    return wrapped
