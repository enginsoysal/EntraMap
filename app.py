"""
EntraMap — Flask app
Multi-tenant, delegated OAuth2 flow via MSAL.
"""

import os
import uuid
import base64
import requests
from functools import wraps
from flask import (
    Flask, render_template, jsonify, request,
    redirect, session, url_for,
)
from flask_session import Session
from msal import ConfidentialClientApplication, SerializableTokenCache
from dotenv import load_dotenv

load_dotenv()

# ── App setup ─────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32))
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_FILE_DIR"] = os.path.join(os.getcwd(), "flask_session")
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_USE_SIGNER"] = True
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
Session(app)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
APP_VERSION = "0.1.0"

CLIENT_ID     = os.getenv("CLIENT_ID", "")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "")
REDIRECT_PATH = "/auth/callback"
REDIRECT_URI  = os.getenv("REDIRECT_URI", "").strip()

SCOPES = [
    "User.Read",
    "User.ReadBasic.All",
    "Group.Read.All",
    "Device.Read.All",
    "Application.Read.All",
    "Policy.Read.All",
    "Directory.Read.All",
]


def _msal_app(cache=None):
    return ConfidentialClientApplication(
        CLIENT_ID,
        authority="https://login.microsoftonline.com/organizations",
        client_credential=CLIENT_SECRET,
        token_cache=cache,
    )


def _load_cache():
    cache = SerializableTokenCache()
    if session.get("token_cache"):
        cache.deserialize(session["token_cache"])
    return cache


def _save_cache(cache):
    if cache.has_state_changed:
        session["token_cache"] = cache.serialize()


def _get_token_from_cache():
    cache = _load_cache()
    msal = _msal_app(cache)
    accounts = msal.get_accounts()
    if not accounts:
        return None
    result = msal.acquire_token_silent(SCOPES, account=accounts[0])
    _save_cache(cache)
    if result and "access_token" in result:
        return result["access_token"]
    return None


def _redirect_uri():
    # Prefer an explicit configured callback in hosted environments.
    return REDIRECT_URI or url_for("auth_callback", _external=True)


# ── Auth decorator ────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("login"))
        token = _get_token_from_cache()
        if not token:
            session.clear()
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


# ── Graph helpers ─────────────────────────────────────────────────────────────

def graph_get(endpoint, token, extra_headers=None):
    headers = {"Authorization": f"Bearer {token}"}
    if extra_headers:
        headers.update(extra_headers)
    url = endpoint if endpoint.startswith("http") else f"{GRAPH_BASE}{endpoint}"
    try:
        resp = requests.get(url, headers=headers, timeout=30)
    except requests.RequestException as exc:
        return {"error": "network", "message": str(exc)}
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code == 404:
        return None
    return {"error": resp.status_code, "message": resp.text[:500]}


def graph_get_all(endpoint, token, extra_headers=None, max_items=100):
    results = []
    url = endpoint if endpoint.startswith("http") else f"{GRAPH_BASE}{endpoint}"
    while url and len(results) < max_items:
        data = graph_get(url, token, extra_headers)
        if not data or "value" not in data:
            break
        results.extend(data["value"])
        url = data.get("@odata.nextLink")
    return results[:max_items]


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route("/login")
def login():
    if session.get("user"):
        return redirect(url_for("index"))
    error = request.args.get("error")
    return render_template("login.html", error=error, version=APP_VERSION)


@app.route("/auth/signin")
def auth_signin():
    session["state"] = str(uuid.uuid4())
    session.modified = True  # Explicitly mark session as modified
    redirect_uri = _redirect_uri()
    auth_url = _msal_app().get_authorization_request_url(
        SCOPES,
        state=session["state"],
        redirect_uri=redirect_uri,
        prompt="select_account",
    )
    return redirect(auth_url)


@app.route(REDIRECT_PATH)
def auth_callback():
    if request.args.get("state") != session.get("state"):
        return redirect(url_for("login", error="State mismatch. Please try again."))

    if "error" in request.args:
        desc = request.args.get("error_description", request.args.get("error"))
        return redirect(url_for("login", error=desc))

    code = request.args.get("code")
    if not code:
        return redirect(url_for("login", error="No authorization code was received."))

    redirect_uri = _redirect_uri()
    cache = _load_cache()
    msal = _msal_app(cache)
    result = msal.acquire_token_by_authorization_code(
        code, scopes=SCOPES, redirect_uri=redirect_uri,
    )
    _save_cache(cache)

    if "error" in result:
        return redirect(url_for("login", error=result.get("error_description", result["error"])))

    claims = result.get("id_token_claims", {})
    session["user"] = {
        "name": claims.get("name", "Unknown"),
        "upn":  claims.get("preferred_username", ""),
        "tid":  claims.get("tid", ""),
        "oid":  claims.get("oid", ""),
    }
    return redirect(url_for("index"))


@app.route("/auth/signout")
def auth_signout():
    session.clear()
    logout_url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={url_for('login', _external=True)}"
    )
    return redirect(logout_url)


# ── Main page ─────────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template("index.html", user=session["user"], version=APP_VERSION)


@app.route("/api/health")
def health():
    config_ok = bool(CLIENT_ID and CLIENT_SECRET and app.secret_key)
    return jsonify(
        {
            "status": "ok" if config_ok else "warning",
            "version": APP_VERSION,
            "signed_in": bool(session.get("user")),
            "message": "Configuration loaded" if config_ok else "Missing application configuration",
        }
    )


# ── API: search ───────────────────────────────────────────────────────────────

@app.route("/api/search")
@login_required
def search():
    query = request.args.get("q", "").strip()
    search_type = request.args.get("type", "user")
    if len(query) < 2:
        return jsonify([])

    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401

    if search_type == "user":
        endpoint = (
            f'/users?$search="displayName:{query}" OR "userPrincipalName:{query}"'
            f"&$select=id,displayName,userPrincipalName,jobTitle,department"
            f"&$top=15&$count=true"
        )
        data = graph_get(endpoint, token, extra_headers={"ConsistencyLevel": "eventual"})
        items = data.get("value", []) if data and "value" in data else []
        if not items:
            safe_q = query.replace("'", "''")
            data = graph_get(
                f"/users?$filter=startswith(displayName,'{safe_q}')"
                f" or startswith(userPrincipalName,'{safe_q}')"
                f"&$select=id,displayName,userPrincipalName,jobTitle,department&$top=15",
                token,
            )
            items = data.get("value", []) if data and "value" in data else []
        return jsonify([
            {"id": u["id"], "label": u.get("displayName", ""), "subtitle": u.get("userPrincipalName", ""), "type": "user"}
            for u in items
        ])

    if search_type == "group":
        endpoint = (
            f'/groups?$search="displayName:{query}"'
            f"&$select=id,displayName,description,groupTypes&$top=15&$count=true"
        )
        data = graph_get(endpoint, token, extra_headers={"ConsistencyLevel": "eventual"})
        items = data.get("value", []) if data and "value" in data else []
        if not items:
            safe_q = query.replace("'", "''")
            data = graph_get(
                f"/groups?$filter=startswith(displayName,'{safe_q}')"
                f"&$select=id,displayName,description,groupTypes&$top=15",
                token,
            )
            items = data.get("value", []) if data and "value" in data else []
        return jsonify([
            {"id": g["id"], "label": g.get("displayName", ""), "subtitle": g.get("description", ""), "type": "group"}
            for g in items
        ])

    return jsonify([])


# ── API: user map ─────────────────────────────────────────────────────────────

@app.route("/api/map/user/<user_id>")
@login_required
def user_map(user_id):
    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401

    nodes, edges, node_ids = [], [], set()

    def add_node(n):
        if n["id"] not in node_ids:
            node_ids.add(n["id"])
            nodes.append(n)

    def clean(obj):
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    user = graph_get(
        "/users/{}?$select=id,displayName,userPrincipalName,jobTitle,department,"
        "mail,accountEnabled,city,country,mobilePhone,officeLocation,companyName,"
        "createdDateTime,lastPasswordChangeDateTime,signInActivity".format(user_id),
        token,
    )
    if not user or "error" in user:
        return jsonify({"error": "User not found"}), 404

    add_node({"id": user["id"], "label": user.get("displayName", "?"), "type": "user", "data": clean(user)})

    for rel_label, ep in [
        ("owned device", f"/users/{user_id}/ownedDevices"),
        ("registered device", f"/users/{user_id}/registeredDevices"),
    ]:
        for dev in graph_get_all(
            ep + "?$select=id,displayName,operatingSystem,operatingSystemVersion,isCompliant,isManaged,trustType,deviceId",
            token,
        ):
            if dev["id"] not in node_ids:
                add_node({"id": dev["id"], "label": dev.get("displayName", "Device"), "type": "device", "data": clean(dev)})
                edges.append({"source": user["id"], "target": dev["id"], "label": rel_label})

    group_ids = []
    for m in graph_get_all(
        f"/users/{user_id}/memberOf?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
        token,
    ):
        odata_type = m.get("@odata.type", "")
        if "#microsoft.graph.group" in odata_type or (not odata_type and "groupTypes" in m):
            group_ids.append(m["id"])
            add_node({"id": m["id"], "label": m.get("displayName", "Group"), "type": "group", "data": clean(m)})
            edges.append({"source": user["id"], "target": m["id"], "label": "member of"})

    seen_apps = set()
    for gid in group_ids[:25]:
        for assignment in graph_get_all(f"/groups/{gid}/appRoleAssignments", token, max_items=30):
            sp_id = assignment.get("resourceId")
            if not sp_id:
                continue
            if sp_id not in seen_apps:
                seen_apps.add(sp_id)
                sp = graph_get(
                    f"/servicePrincipals/{sp_id}?$select=id,displayName,appId,description,servicePrincipalType,publisherName",
                    token,
                )
                if sp and "error" not in sp:
                    add_node({"id": sp["id"], "label": sp.get("displayName", "App"), "type": "app", "data": clean(sp)})
            if sp_id in node_ids and not any(e["source"] == gid and e["target"] == sp_id for e in edges):
                edges.append({"source": gid, "target": sp_id, "label": "access to"})

    for policy in graph_get_all(
        "/identity/conditionalAccessPolicies?$select=id,displayName,state,conditions,grantControls",
        token, max_items=200,
    ):
        cond = policy.get("conditions", {})
        u_cond = cond.get("users", {})
        inc_users  = u_cond.get("includeUsers", [])
        inc_groups = u_cond.get("includeGroups", [])
        exc_users  = u_cond.get("excludeUsers", [])
        exc_groups = u_cond.get("excludeGroups", [])
        included = "All" in inc_users or user["id"] in inc_users or any(g in inc_groups for g in group_ids)
        excluded  = user["id"] in exc_users or any(g in exc_groups for g in group_ids)
        if included and not excluded:
            add_node({"id": policy["id"], "label": policy.get("displayName", "CA Policy"), "type": "ca_policy", "data": clean(policy)})
            edges.append({"source": user["id"], "target": policy["id"], "label": "affected by"})

    return jsonify({"nodes": nodes, "edges": edges})


# ── API: group map ────────────────────────────────────────────────────────────

@app.route("/api/map/group/<group_id>")
@login_required
def group_map(group_id):
    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401

    nodes, edges, node_ids = [], [], set()

    def add_node(n):
        if n["id"] not in node_ids:
            node_ids.add(n["id"])
            nodes.append(n)

    def clean(obj):
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    group = graph_get(
        f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
        token,
    )
    if not group or "error" in group:
        return jsonify({"error": "Group not found"}), 404

    add_node({"id": group["id"], "label": group.get("displayName", "?"), "type": "group", "data": clean(group)})

    for m in graph_get_all(
        f"/groups/{group_id}/members?$select=id,displayName,userPrincipalName,jobTitle&$top=50",
        token, max_items=50,
    ):
        if "#microsoft.graph.user" in m.get("@odata.type", "") or "userPrincipalName" in m:
            add_node({"id": m["id"], "label": m.get("displayName", "?"), "type": "user", "data": clean(m)})
            edges.append({"source": m["id"], "target": group["id"], "label": "member of"})

    for assignment in graph_get_all(f"/groups/{group_id}/appRoleAssignments", token, max_items=50):
        sp_id = assignment.get("resourceId")
        if not sp_id or sp_id in node_ids:
            continue
        sp = graph_get(
            f"/servicePrincipals/{sp_id}?$select=id,displayName,appId,description,servicePrincipalType,publisherName",
            token,
        )
        if sp and "error" not in sp:
            add_node({"id": sp["id"], "label": sp.get("displayName", "App"), "type": "app", "data": clean(sp)})
            edges.append({"source": group["id"], "target": sp["id"], "label": "access to"})

    for policy in graph_get_all(
        "/identity/conditionalAccessPolicies?$select=id,displayName,state,conditions,grantControls",
        token, max_items=200,
    ):
        cond = policy.get("conditions", {})
        u_cond = cond.get("users", {})
        inc_groups = u_cond.get("includeGroups", [])
        exc_groups = u_cond.get("excludeGroups", [])
        if group_id in inc_groups and group_id not in exc_groups:
            add_node({"id": policy["id"], "label": policy.get("displayName", "CA Policy"), "type": "ca_policy", "data": clean(policy)})
            edges.append({"source": group["id"], "target": policy["id"], "label": "affected by"})

    return jsonify({"nodes": nodes, "edges": edges})


# ── API: object details ────────────────────────────────────────────────────────

@app.route("/api/details/<object_type>/<object_id>")
@login_required
def get_details(object_type, object_id):
    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401

    endpoints = {
        "user":      f"/users/{object_id}",
        "group":     f"/groups/{object_id}",
        "device":    f"/devices/{object_id}",
        "app":       f"/servicePrincipals/{object_id}",
        "ca_policy": f"/identity/conditionalAccessPolicies/{object_id}",
    }
    ep = endpoints.get(object_type)
    if not ep:
        return jsonify({"error": "Invalid object type"}), 400

    result = graph_get(ep, token)
    if not result:
        return jsonify({"error": "Object not found"}), 404
    if "error" in result:
        return jsonify(result), 502
    return jsonify(result)


@app.route("/api/photo/user/<user_id>")
@login_required
def get_user_photo(user_id):
    """Fetch user profile photo as base64-encoded data URL"""
    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{GRAPH_BASE}/users/{user_id}/photo/$value",
            headers=headers,
            timeout=10
        )
        if resp.status_code == 200:
            data_b64 = base64.b64encode(resp.content).decode("utf-8")
            return jsonify({"photo": f"data:image/jpeg;base64,{data_b64}"})
        else:
            return jsonify({"photo": None})
    except Exception as e:
        return jsonify({"photo": None, "error": str(e)})


@app.route("/api/photo/group/<group_id>")
@login_required
def get_group_photo(group_id):
    """Fetch group photo as base64-encoded data URL"""
    token = _get_token_from_cache()
    if not token:
        return jsonify({"error": "Session expired"}), 401
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{GRAPH_BASE}/groups/{group_id}/photo/$value",
            headers=headers,
            timeout=10
        )
        if resp.status_code == 200:
            data_b64 = base64.b64encode(resp.content).decode("utf-8")
            return jsonify({"photo": f"data:image/jpeg;base64,{data_b64}"})
        else:
            return jsonify({"photo": None})
    except Exception as e:
        return jsonify({"photo": None, "error": str(e)})


@app.route("/api/me")
@login_required
def me():
    return jsonify(session.get("user", {}))


if __name__ == "__main__":
    app.run(debug=True, port=5000)
