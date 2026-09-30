"""Public, server-rendered product documentation; no tenant reads required."""
import json
from pathlib import Path
from flask import Blueprint, render_template


def create_docs(version):
    bp = Blueprint('docs', __name__)
    content = json.loads((Path(__file__).resolve().parents[1] / 'docs' / 'guide.json').read_text(encoding='utf-8'))

    @bp.get('/docs')
    @bp.get('/docs/')
    def page():
        return render_template('docs.html', guide=content, version=version,
                               control_count=sum(len(s.get('controls', [])) for s in content['sections']))

    return bp
