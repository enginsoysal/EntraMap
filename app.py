"""
EntraMap - Modular Flask App
Clean entry point with minimal routing.
All business logic is in engines; all low-level utilities in services.

PERFORMANCE OPTIMIZATIONS:
- Gzip compression for JSON responses
- Connection pooling for Graph API
- Result caching with TTL
- Early-stopping pagination
"""

import os
import logging
from html import escape
from pathlib import Path
from datetime import timedelta
from functools import wraps
from urllib.parse import urlparse

from flask import Flask, render_template, jsonify, request, redirect, session, url_for, Response
from flask_session import Session
from flask_compress import Compress
import importlib
from markupsafe import Markup

from config.config import Config
from services.session_service import SessionService
from services.photo_service import PhotoService
from services.cache_service import CacheService

from engines.auth_engine import AuthEngine
from engines.user_search_engine import UserSearchEngine
from engines.device_search_engine import DeviceSearchEngine
from engines.group_search_engine import GroupSearchEngine
from engines.app_search_engine import AppSearchEngine
from engines.ca_search_engine import CASearchEngine
from engines.user_map_engine import UserMapEngine
from engines.device_map_engine import DeviceMapEngine
from engines.group_map_engine import GroupMapEngine
from engines.app_map_engine import AppMapEngine
from engines.ca_map_engine import CAMapEngine
from engines.group_impact_engine import GroupImpactEngine


def configure_telemetry(app: Flask) -> None:
    """Enable Azure Monitor telemetry when configured."""
    connection_string = Config.APPLICATIONINSIGHTS_CONNECTION_STRING
    instrumentation_key = Config.APPINSIGHTS_INSTRUMENTATIONKEY
    if not connection_string and not instrumentation_key:
        return

    if connection_string:
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor
        except ImportError:
            app.logger.warning(
                "Application Insights connection string is configured but azure-monitor-opentelemetry is not installed."
            )
            return

        options = {
            "connection_string": connection_string,
        }
        if Config.APPLICATIONINSIGHTS_ENABLE_LOGGING:
            options["logger_name"] = app.logger.name
            app.logger.setLevel(logging.INFO)

        configure_azure_monitor(**options)
        app.config["APPLICATIONINSIGHTS_PROVIDER"] = "azure-monitor-opentelemetry"
        app.logger.info("Azure Monitor telemetry enabled via connection string")
        return

    try:
        from opencensus.ext.azure.log_exporter import AzureLogHandler
        from opencensus.ext.azure.trace_exporter import AzureExporter
        from opencensus.ext.flask.flask_middleware import FlaskMiddleware
        from opencensus.trace import config_integration
        from opencensus.trace.samplers import ProbabilitySampler
    except ImportError:
        app.logger.warning(
            "Application Insights instrumentation key is configured but OpenCensus dependencies are not installed."
        )
        return

    config_integration.trace_integrations(["requests"])
    exporter = AzureExporter(instrumentation_key=instrumentation_key)
    middleware = FlaskMiddleware(
        app,
        exporter=exporter,
        sampler=ProbabilitySampler(rate=1.0),
        excludelist_paths=["/api/health"],
    )
    app.extensions["applicationinsights_middleware"] = middleware

    if Config.APPLICATIONINSIGHTS_ENABLE_LOGGING:
        app.logger.addHandler(AzureLogHandler(instrumentation_key=instrumentation_key))
        app.logger.setLevel(logging.INFO)

    app.config["APPLICATIONINSIGHTS_PROVIDER"] = "opencensus"
    app.logger.info("Application Insights telemetry enabled via instrumentation key")


# ────────────────────────────────────────────────────────────────────────────
# Flask App Setup
# ────────────────────────────────────────────────────────────────────────────

def create_app() -> Flask:
    """Create and configure Flask application"""
    app = Flask(__name__)
    app.secret_key = Config.SECRET_KEY
    configure_telemetry(app)
    
    # Enable Gzip compression for JSON responses (reduces size by ~70%)
    Compress(app)
    
    # Session configuration
    app.config["SESSION_TYPE"] = Config.SESSION_TYPE
    app.config["SESSION_PERMANENT"] = True
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(minutes=Config.SESSION_TTL_MINUTES)
    app.config["SESSION_REFRESH_EACH_REQUEST"] = False
    app.config["SESSION_USE_SIGNER"] = True
    app.config["SESSION_COOKIE_NAME"] = Config.SESSION_COOKIE_NAME
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SECURE"] = Config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    # Redis session support
    if Config.SESSION_TYPE == "redis":
        redis_url = Config.REDIS_URL
        if not redis_url:
            raise RuntimeError("SESSION_TYPE=redis requires REDIS_URL to be configured")
        try:
            redis_lib = importlib.import_module("redis")
            app.config["SESSION_REDIS"] = redis_lib.from_url(redis_url)
        except Exception as exc:
            raise RuntimeError("SESSION_TYPE=redis requires redis package")
    else:
        # Filesystem session
        os.makedirs(Config.SESSION_FILE_DIR, exist_ok=True)
        app.config["SESSION_FILE_DIR"] = Config.SESSION_FILE_DIR

    Session(app)

    # Keep local host consistent with REDIRECT_URI to preserve session cookies.
    parsed_redirect = urlparse(Config.REDIRECT_URI) if Config.REDIRECT_URI else None
    redirect_host = parsed_redirect.hostname if parsed_redirect else None
    redirect_port = parsed_redirect.port if parsed_redirect else None
    redirect_scheme = parsed_redirect.scheme if parsed_redirect else None

    @app.before_request
    def enforce_local_canonical_host():
        if not redirect_host:
            return None

        request_host = request.host.split(":", 1)[0].lower()
        localhost_aliases = {"localhost", "127.0.0.1"}

        if request_host == redirect_host.lower():
            return None

        if {request_host, redirect_host.lower()}.issubset(localhost_aliases):
            scheme = redirect_scheme or request.scheme
            target = f"{scheme}://{redirect_host}"
            if redirect_port:
                target += f":{redirect_port}"
            target += request.path
            if request.query_string:
                target += f"?{request.query_string.decode('utf-8', errors='ignore')}"
            return redirect(target, code=302)

        return None

    # Security headers
    @app.after_request
    def set_security_headers(resp):
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        
        if not request.path.startswith("/static/"):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        return resp

    return app


app = create_app()


def render_changelog_html() -> Markup:
    """Render LOG.md into lightweight HTML for the signed-out auth modal."""
    log_path = Path(app.root_path) / "LOG.md"
    if not log_path.exists():
        return Markup("<p class=\"changelog-empty\">Changelog unavailable.</p>")

    lines = log_path.read_text(encoding="utf-8").splitlines()
    parts = []
    in_list = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue

        if line.startswith("# "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h3>{escape(line[2:].strip())}</h3>")
            continue

        if line.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h4>{escape(line[3:].strip())}</h4>")
            continue

        if line.startswith("- "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{escape(line[2:].strip())}</li>")
            continue

        if in_list:
            parts.append("</ul>")
            in_list = False
        parts.append(f"<p>{escape(line)}</p>")

    if in_list:
        parts.append("</ul>")

    return Markup("".join(parts))


def render_group_impact_txt(result: dict) -> str:
    """Render group impact payload to a compact text handover format."""
    summary = result.get("summary", {}) or {}
    group = result.get("group", {}) or {}

    lines = []
    lines.append(f"Group: {group.get('displayName', '')}")
    lines.append(f"Group ID: {group.get('id', '')}")
    risk_label = summary.get("riskLabel") or summary.get("riskLevel") or "Unknown"
    lines.append(f"Risk: {risk_label} ({summary.get('riskScore', '')})")
    lines.append(f"Coverage: {summary.get('coverageScore', '')}% ({summary.get('confidence', '')})")
    lines.append("")
    lines.append("Findings:")

    domains = result.get("domains", []) if isinstance(result.get("domains"), list) else []
    found = False
    for domain in domains:
        label = domain.get("label") or domain.get("key") or "Domain"
        findings = domain.get("findings", []) if isinstance(domain.get("findings"), list) else []
        for item in findings:
            found = True
            severity = str(item.get("severity", "info")).upper()
            impact = item.get("impact", "impact")
            name = item.get("name") or "(unnamed)"
            finding_id = item.get("id", "")
            suffix = f" | {finding_id}" if finding_id else ""
            lines.append(f"[{severity}] {label} | {impact} | {name}{suffix}")

    if not found:
        lines.append("No linked resources found in currently readable domains.")

    return "\n".join(lines)


# ────────────────────────────────────────────────────────────────────────────
# Engine Initialization
# ────────────────────────────────────────────────────────────────────────────

auth_engine = AuthEngine(Config)


# ────────────────────────────────────────────────────────────────────────────
# Decorators
# ────────────────────────────────────────────────────────────────────────────

def login_required(f):
    """Decorator: require authenticated session and valid token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not SessionService.is_authenticated(session):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Session expired"}), 401
            return redirect(url_for("index", login_error="Sign in required"))
        
        token = auth_engine.get_token(session)
        if not token:
            SessionService.clear(session)
            if request.path.startswith("/api/"):
                return jsonify({"error": "Session expired"}), 401
            return redirect(url_for("index", login_error="Session expired. Please sign in again."))
        
        return f(*args, **kwargs)
    return decorated


# ────────────────────────────────────────────────────────────────────────────
# Routes: Main Page
# ────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    user = SessionService.get_user(session)
    base_url = request.url_root.rstrip("/")
    page_url = f"{base_url}{request.path}"
    preview_image_url = f"{base_url}/static/brand/social-preview.png"
    return render_template(
        "index.html",
        changelog_html=render_changelog_html(),
        page_url=page_url,
        preview_image_url=preview_image_url,
        user=user,
        signed_in=bool(user),
        login_error=request.args.get("login_error", ""),
        version=Config.VERSION,
    )


@app.route("/api/health")
def health():
    is_valid, err = Config.validate()
    return jsonify({
        "status": "ok" if is_valid else "warning",
        "version": Config.VERSION,
        "signed_in": bool(SessionService.is_authenticated(session)),
        "message": "Configuration loaded" if is_valid else err,
    })


@app.route("/api/me")
@login_required
def me():
    return jsonify(SessionService.get_user(session) or {})


# ────────────────────────────────────────────────────────────────────────────
# Routes: Authentication
# ────────────────────────────────────────────────────────────────────────────

@app.route("/login")
def login():
    error = request.args.get("error")
    if error:
        return redirect(url_for("index", login_error=error))
    return redirect(url_for("index"))


@app.route("/auth/signin")
def auth_signin():
    use_popup = request.args.get("popup") == "1"
    force_consent = request.args.get("force_consent") == "1"
    auth_url = auth_engine.get_authorization_url(session, use_popup, force_consent)
    return redirect(auth_url)


@app.route(Config.REDIRECT_PATH)
def auth_callback():
    use_popup = SessionService.get_auth_popup(session)
    code = request.args.get("code")
    state = request.args.get("state")

    success, message, user_info = auth_engine.handle_callback(session, code, state)

    if success:
        SessionService.set_user(session, user_info)
        if use_popup:
            return render_template("auth_popup_done.html", success=True, message="Sign-in completed. You can close this window.")
        return redirect(url_for("index"))
    else:
        if use_popup:
            return render_template("auth_popup_done.html", success=False, message=message)
        return redirect(url_for("index", login_error=message))


@app.route("/auth/signout")
def auth_signout():
    auth_engine.signout(session)
    return redirect(url_for("index"))


@app.route("/auth/disconnect")
def auth_disconnect():
    """Hard disconnect: clear session and force re-consent on next sign-in"""
    auth_engine.disconnect(session)
    return redirect(url_for("index"))


# ────────────────────────────────────────────────────────────────────────────
# Routes: Search
# ────────────────────────────────────────────────────────────────────────────

@app.route("/api/search")
@login_required
def search():
    query = request.args.get("q", "").strip()
    search_type = request.args.get("type", "user")
    token = auth_engine.get_token(session)

    if search_type == "user":
        return jsonify(UserSearchEngine.search(query, token))
    
    if search_type == "device":
        return jsonify(DeviceSearchEngine.search(query, token))
    
    if search_type == "group":
        return jsonify(GroupSearchEngine.search(query, token))
    
    if search_type == "app":
        results, error = AppSearchEngine.search(query, token)
        if error:
            if "reauth_url" in error:
                SessionService.set_require_consent(session, True)
                return jsonify(error), 428
            return jsonify(error), 502
        return jsonify(results)
    
    if search_type == "ca_policy":
        return jsonify(CASearchEngine.search(query, token))
    
    return jsonify([])


# ────────────────────────────────────────────────────────────────────────────
# Routes: Graph Maps (Mindmap)
# ────────────────────────────────────────────────────────────────────────────

@app.route("/api/map/user/<user_id>")
@login_required
def user_map(user_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = UserMapEngine.build(user_id, token)
    
    if error:
        status = error.get("status", 502)
        return jsonify(error), status
    
    return jsonify({"nodes": nodes, "edges": edges})


@app.route("/api/map/device/<device_id>")
@login_required
def device_map(device_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = DeviceMapEngine.build(device_id, token)
    
    if error:
        return jsonify(error), 404
    
    return jsonify({"nodes": nodes, "edges": edges})


@app.route("/api/map/group/<group_id>")
@login_required
def group_map(group_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = GroupMapEngine.build(group_id, token)
    
    if error:
        return jsonify(error), 404
    
    return jsonify({"nodes": nodes, "edges": edges})


@app.route("/api/map/group/<group_id>/impact")
@login_required
def group_impact_map(group_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = GroupMapEngine.build_impact_graph(group_id, token)

    if error:
        return jsonify(error), error.get("status", 404)

    return jsonify({"nodes": nodes, "edges": edges})


@app.route("/api/map/group/<group_id>/compare")
@login_required
def group_compare_map(group_id):
    token = auth_engine.get_token(session)

    standard_nodes, standard_edges, standard_error = GroupMapEngine.build(group_id, token)
    if standard_error:
        return jsonify({
            "error": standard_error.get("error", "Unable to build standard group map"),
            "source": "standard",
            "status": standard_error.get("status", 404),
        }), standard_error.get("status", 404)

    impact_nodes, impact_edges, impact_error = GroupMapEngine.build_impact_graph(group_id, token)
    if impact_error:
        return jsonify({
            "error": impact_error.get("error", "Unable to build impact group map"),
            "source": "impact",
            "status": impact_error.get("status", 404),
        }), impact_error.get("status", 404)

    return jsonify(
        {
            "groupId": group_id,
            "standard": {"nodes": standard_nodes, "edges": standard_edges},
            "impact": {"nodes": impact_nodes, "edges": impact_edges},
        }
    )


@app.route("/api/map/app/<app_id>")
@login_required
def app_map(app_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = AppMapEngine.build(app_id, token)
    
    if error:
        return jsonify(error), 404
    
    return jsonify({"nodes": nodes, "edges": edges})


@app.route("/api/map/ca_policy/<policy_id>")
@login_required
def ca_policy_map(policy_id):
    token = auth_engine.get_token(session)
    nodes, edges, error = CAMapEngine.build(policy_id, token)
    
    if error:
        return jsonify(error), 404
    
    return jsonify({"nodes": nodes, "edges": edges})


# ────────────────────────────────────────────────────────────────────────────
# Routes: Impact Analysis
# ────────────────────────────────────────────────────────────────────────────

@app.route("/api/impact/group/<group_id>")
@login_required
def group_impact(group_id):
    token = auth_engine.get_token(session)
    result, error = GroupImpactEngine.build(group_id, token)

    if error:
        return jsonify(error), error.get("status", 404)

    return jsonify(result)


@app.route("/api/impact/group/<group_id>/txt")
@login_required
def group_impact_txt(group_id):
    token = auth_engine.get_token(session)
    result, error = GroupImpactEngine.build(group_id, token)

    if error:
        return jsonify(error), error.get("status", 404)

    payload = render_group_impact_txt(result)
    return Response(payload, mimetype="text/plain; charset=utf-8")


@app.route("/api/debug/group-impact/<group_id>")
@login_required
def debug_group_impact(group_id):
    token = auth_engine.get_token(session)
    result, error = GroupImpactEngine.build(group_id, token)

    if error:
        return jsonify(error), error.get("status", 404)

    compact = {
        "group": {
            "id": result.get("group", {}).get("id", ""),
            "displayName": result.get("group", {}).get("displayName", ""),
        },
        "summary": result.get("summary", {}),
        "domains": [
            {
                "key": domain.get("key", ""),
                "label": domain.get("label", ""),
                "status": domain.get("status", ""),
                "count": domain.get("count", 0),
                "details": domain.get("details", ""),
                "findings": domain.get("findings", []),
            }
            for domain in result.get("domains", [])
        ],
    }
    return jsonify(compact)


# ────────────────────────────────────────────────────────────────────────────
# Routes: Details & Photos
# ────────────────────────────────────────────────────────────────────────────

@app.route("/api/details/<object_type>/<object_id>")
@login_required
def get_details(object_type, object_id):
    token = auth_engine.get_token(session)
    
    endpoints = {
        "user": f"/users/{object_id}",
        "group": f"/groups/{object_id}",
        "device": f"/devices/{object_id}",
        "app": f"/deviceAppManagement/mobileApps/{object_id}",
        "ca_policy": f"/identity/conditionalAccessPolicies/{object_id}",
    }
    
    if object_type not in endpoints:
        return jsonify({"error": "Invalid object type"}), 400
    
    from services.graph_service import GraphService
    result = GraphService.get(endpoints[object_type], token)
    
    if not result:
        return jsonify({"error": "Object not found"}), 404
    if "error" in result:
        return jsonify(result), 502
    
    return jsonify(result)


@app.route("/api/photo/user/<user_id>")
@login_required
def get_user_photo(user_id):
    token = auth_engine.get_token(session)
    photo = PhotoService.get_user_photo(user_id, token)
    return jsonify({"photo": photo})


@app.route("/api/photo/group/<group_id>")
@login_required
def get_group_photo(group_id):
    token = auth_engine.get_token(session)
    photo = PhotoService.get_group_photo(group_id, token)
    return jsonify({"photo": photo})


# ────────────────────────────────────────────────────────────────────────────
# Entry Point
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=Config.DEBUG, port=Config.PORT)
