/* EntraMap — main.js
   Cytoscape graph + search + detail panel logic
   ------------------------------------------------------------------ */

"use strict";

// ── Constants ──────────────────────────────────────────────────────────────

const TYPE_META = {
    user:      { label: "User",      icon: "fa-user",       color: "#3b82f6", bg: "#0f2040", shape: "ellipse"         },
    device:    { label: "Device",    icon: "fa-laptop",     color: "#10b981", bg: "#062620", shape: "round-rectangle" },
    group:     { label: "Group",     icon: "fa-users",      color: "#f59e0b", bg: "#2a1800", shape: "diamond"         },
    app:       { label: "Application",icon: "fa-cube",      color: "#8b5cf6", bg: "#1d0a40", shape: "hexagon"         },
    ca_policy: { label: "CA Policy", icon: "fa-shield-alt", color: "#ef4444", bg: "#2a0a0a", shape: "tag"             },
};

// ── State ──────────────────────────────────────────────────────────────────

let cy          = null;
let searchType  = "user";
let searchTimer = null;
let activeNodeId = null;

// ── Cytoscape initialisation ──────────────────────────────────────────────

function buildCyStyle() {
    return [
        {
            selector: "node",
            style: {
                "label":           "data(label)",
                "text-valign":     "bottom",
                "text-halign":     "center",
                "font-family":     "Segoe UI, system-ui, sans-serif",
                "font-size":       "10px",
                "color":           "#94a3b8",
                "text-margin-y":   5,
                "text-max-width":  "110px",
                "text-wrap":       "ellipsis",
                "width":           46,
                "height":          46,
                "border-width":    2,
                "border-color":    "#252a47",
                "background-color":"#13162a",
                "overlay-padding": 6,
                "transition-property":  "border-color, border-width, background-color",
                "transition-duration":  "0.15s",
            },
        },
        // per-type overrides
        {
            selector: "node[type='user']",
            style: {
                "background-color": "#0f2040",
                "border-color":     "#3b82f6",
                "border-width":     3,
                "width":  60, "height": 60,
                "font-size": "11px",
                "color":   "#93c5fd",
                "font-weight": 700,
            },
        },
        {
            selector: "node[type='device']",
            style: {
                "background-color": "#062620",
                "border-color":     "#10b981",
                "shape":            "round-rectangle",
            },
        },
        {
            selector: "node[type='group']",
            style: {
                "background-color": "#2a1800",
                "border-color":     "#f59e0b",
                "shape":            "diamond",
                "width":  54, "height": 54,
            },
        },
        {
            selector: "node[type='app']",
            style: {
                "background-color": "#1d0a40",
                "border-color":     "#8b5cf6",
                "shape":            "hexagon",
            },
        },
        {
            selector: "node[type='ca_policy']",
            style: {
                "background-color": "#2a0a0a",
                "border-color":     "#ef4444",
                "shape":            "tag",
                "width":  54, "height": 54,
            },
        },
        // selected
        {
            selector: "node:selected",
            style: {
                "border-width":    4,
                "overlay-color":   "#fff",
                "overlay-padding": 5,
                "overlay-opacity": 0.08,
            },
        },
        // active (mouse hover)
        {
            selector: "node.highlighted",
            style: {
                "border-width":  4,
                "overlay-color": "#fff",
                "overlay-padding": 4,
                "overlay-opacity": 0.06,
            },
        },
        // edges
        {
            selector: "edge",
            style: {
                "width":               1.5,
                "line-color":          "#252a47",
                "target-arrow-color":  "#252a47",
                "target-arrow-shape":  "triangle",
                "curve-style":         "bezier",
                "label":               "data(label)",
                "font-size":           "8px",
                "color":               "#3a4268",
                "text-rotation":       "autorotate",
                "text-margin-y":       -6,
                "font-family":         "Segoe UI, system-ui, sans-serif",
                "opacity":             0.7,
            },
        },
        {
            selector: "edge.highlighted",
            style: { "line-color": "#3d4a7a", "target-arrow-color": "#3d4a7a", "opacity": 1 },
        },
    ];
}

function initCytoscape() {
    cy = cytoscape({
        container:     document.getElementById("graph"),
        style:         buildCyStyle(),
        layout:        { name: "preset" },
        minZoom:       0.08,
        maxZoom:       3.5,
        wheelSensitivity: 0.3,
    });

    // Node click → detail panel
    cy.on("tap", "node", function (evt) {
        const n = evt.target;
        setActiveNode(n.id());
        renderDetailPanel(n.data());
    });

    // Background click → clear highlight (keep panel open)
    cy.on("tap", function (evt) {
        if (evt.target === cy) clearHighlight();
    });

    // Cursor
    cy.on("mouseover", "node", () => { document.getElementById("graph").style.cursor = "pointer"; });
    cy.on("mouseout",  "node", () => { document.getElementById("graph").style.cursor = "default";  });
}

// ── Graph data loading ─────────────────────────────────────────────────────

async function loadMap(objectType, objectId) {
    showGraphLoading(true);
    clearGraph();
    hideEmptyState();

    try {
        const resp = await fetch(`/api/map/${objectType}/${objectId}`);
        const data = await resp.json();
        if (!resp.ok) { showToast(data.error || "Failed to load data", "error"); return; }
        renderGraph(data);
    } catch (err) {
        showToast("Network error: " + err.message, "error");
    } finally {
        showGraphLoading(false);
    }
}

function renderGraph(data) {
    const elements = [];

    data.nodes.forEach(node => {
        const meta = TYPE_META[node.type] || {};
        elements.push({
            group: "nodes",
            data: {
                id:        node.id,
                label:     truncate(node.label, 22),
                fullLabel: node.label,
                type:      node.type,
                // spread all detail fields for the detail panel
                ...node.data,
            },
        });
    });

    data.edges.forEach(edge => {
        elements.push({
            group: "edges",
            data: {
                id:     `${edge.source}__${edge.target}`,
                source: edge.source,
                target: edge.target,
                label:  edge.label,
            },
        });
    });

    cy.add(elements);
    runLayout(true);
}

function runLayout(animate = true) {
    // Find the root (user or group node that was searched)
    const root = cy.nodes('[type="user"]').first().length
        ? cy.nodes('[type="user"]').first()
        : cy.nodes('[type="group"]').first();

    const layout = cy.layout({
        name:           "breadthfirst",
        roots:          root.length ? [root.id()] : undefined,
        directed:       false,
        padding:        60,
        spacingFactor:  1.6,
        animate:        animate,
        animationDuration: animate ? 450 : 0,
        fit:            true,
    });
    layout.run();
}

function clearGraph() {
    cy.elements().remove();
    activeNodeId = null;
}

// ── Highlight helpers ──────────────────────────────────────────────────────

function setActiveNode(nodeId) {
    clearHighlight();
    activeNodeId = nodeId;
    const node = cy.getElementById(nodeId);
    node.addClass("highlighted");
    node.connectedEdges().addClass("highlighted");
    node.neighborhood("node").addClass("highlighted");
}

function clearHighlight() {
    cy.elements().removeClass("highlighted");
}

// ── Search ────────────────────────────────────────────────────────────────

async function performSearch(query) {
    const resultsDiv = document.getElementById("search-results");
    if (!query || query.length < 2) { resultsDiv.innerHTML = ""; return; }

    setSearchSpinner(true);
    try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${searchType}`);
        const data = await resp.json();
        if (!resp.ok || data.error) { renderSearchError(data.error || "Search request failed"); return; }
        renderSearchResults(data);
    } catch (err) {
        renderSearchError("Network error: " + err.message);
    } finally {
        setSearchSpinner(false);
    }
}

function renderSearchResults(items) {
    const container = document.getElementById("search-results");
    container.innerHTML = "";

    if (!items.length) {
        const el = document.createElement("div");
        el.className = "sr-empty";
        el.textContent = "No results found";
        container.appendChild(el);
        return;
    }

    const iconMap = { user: "fa-user", group: "fa-users" };

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = `sr-item type-${item.type}`;

        const icon = document.createElement("div");
        icon.className = "sr-icon";
        icon.innerHTML = `<i class="fas ${iconMap[item.type] || "fa-cube"}"></i>`;

        const info = document.createElement("div");
        info.className = "sr-info";

        const label = document.createElement("div");
        label.className = "sr-label";
        label.textContent = item.label;

        const sub = document.createElement("div");
        sub.className = "sr-sub";
        sub.textContent = item.subtitle || "";

        info.append(label, sub);
        div.append(icon, info);

        div.addEventListener("click", () => {
            document.getElementById("search-input").value = item.label;
            document.getElementById("search-results").innerHTML = "";
            loadMap(item.type, item.id);
        });

        container.appendChild(div);
    });
}

function renderSearchError(msg) {
    const container = document.getElementById("search-results");
    const el = document.createElement("div");
    el.className = "sr-empty";
    el.style.color = "#f87171";
    el.textContent = msg;
    container.innerHTML = "";
    container.appendChild(el);
}

// ── Detail panel ──────────────────────────────────────────────────────────

function renderDetailPanel(data) {
    const panel    = document.getElementById("detail-panel");
    const divider  = document.getElementById("detail-divider");
    const tip      = document.getElementById("left-tip");
    const badgeWrap = document.getElementById("detail-badge-wrap");
    const nameEl   = document.getElementById("detail-name");
    const body     = document.getElementById("detail-body");

    const type = data.type;
    const meta = TYPE_META[type] || { label: type, icon: "fa-circle" };

    badgeWrap.innerHTML = `<span class="type-badge ${type}"><i class="fas ${meta.icon}"></i> ${meta.label}</span>`;
    nameEl.textContent  = data.fullLabel || data.label || "";
    body.innerHTML      = buildDetailRows(type, data);

    panel.classList.remove("d-none");
    divider.classList.remove("d-none");
    tip.style.display = "none";
}

function hideDetailPanel() {
    document.getElementById("detail-panel").classList.add("d-none");
    document.getElementById("detail-divider").classList.add("d-none");
    document.getElementById("left-tip").style.display = "";
    clearHighlight();
    activeNodeId = null;
}

function buildDetailRows(type, d) {
    const rows = [];

    const row = (label, value) => {
        if (value == null || value === "") return;
        rows.push(`<div class="dp-row">
            <div class="dp-label">${label}</div>
            <div class="dp-value">${value}</div>
        </div>`);
    };

    const rowMono = (label, value) => {
        if (!value) return;
        rows.push(`<div class="dp-row">
            <div class="dp-label">${label}</div>
            <div class="dp-value mono">${escHtml(value)}</div>
        </div>`);
    };

    const statusBadge = (enabled) =>
        enabled !== false
            ? `<span class="sb on"><i class="fas fa-check-circle"></i> Enabled</span>`
            : `<span class="sb off"><i class="fas fa-times-circle"></i> Disabled</span>`;

    const yesNo = (val) =>
        val
            ? `<span class="sb yes">Yes</span>`
            : `<span class="sb no">No</span>`;

    switch (type) {
        case "user":
            row("UPN",        escHtml(d.userPrincipalName));
            row("Email",      escHtml(d.mail));
            row("Job title",  escHtml(d.jobTitle));
            row("Department", escHtml(d.department));
            row("City",       escHtml(d.city));
            row("Country",    escHtml(d.country));
            row("Mobile",     escHtml(d.mobilePhone));
            row("Account",    statusBadge(d.accountEnabled));
            rowMono("Object ID", d.id);
            break;

        case "device":
            row("Operating system",  escHtml(d.operatingSystem));
            row("Version",           escHtml(d.operatingSystemVersion));
            row("Trust type",        escHtml(d.trustType));
            row("Compliant",         yesNo(d.isCompliant));
            row("Managed",           yesNo(d.isManaged));
            rowMono("Device ID", d.deviceId);
            rowMono("Object ID", d.id);
            break;

        case "group": {
            row("Description", escHtml(d.description));
            const gtypes = [];
            if (d.groupTypes?.includes("Unified"))          gtypes.push("Microsoft 365");
            if (d.securityEnabled)                          gtypes.push("Security");
            if (d.mailEnabled)                              gtypes.push("Mail");
            if (d.groupTypes?.includes("DynamicMembership"))gtypes.push("Dynamic");
            row("Type", gtypes.length ? escHtml(gtypes.join(", ")) : "—");
            rowMono("Object ID", d.id);
            break;
        }

        case "app":
            row("Publisher",   escHtml(d.publisherName));
            row("SP type",     escHtml(d.servicePrincipalType));
            row("Description", escHtml(d.description));
            rowMono("App ID",    d.appId);
            rowMono("Object ID", d.id);
            break;

        case "ca_policy": {
            const stateMap = {
                "enabled":                           `<span class="sb on">Enabled</span>`,
                "disabled":                          `<span class="sb off">Disabled</span>`,
                "enabledForReportingButNotEnforced": `<span class="sb report">Report-only</span>`,
            };
            row("Status", stateMap[d.state] || escHtml(d.state));

            const cond = d.conditions || {};
            const appsCond = cond.applications?.includeApplications || [];
            if (appsCond.length) {
                row("Apps", appsCond.includes("All") ? "All apps" : `${appsCond.length} app(s)`);
            }
            const platforms = cond.platforms?.includePlatforms || [];
            if (platforms.length) row("Platforms", escHtml(platforms.join(", ")));

            const grant = d.grantControls;
            if (grant?.builtInControls?.length) {
                row("Required controls", escHtml(grant.builtInControls.join(", ")));
            }
            if (grant?.operator) {
                row("Operator", escHtml(grant.operator));
            }
            rowMono("Object ID", d.id);
            break;
        }
    }

    return rows.length ? rows.join("") : `<p style="color:var(--text-muted);font-size:.82rem;">No details available</p>`;
}

// ── UI helpers ────────────────────────────────────────────────────────────

function showGraphLoading(show) {
    document.getElementById("graph-loading").classList.toggle("d-none", !show);
}

function hideEmptyState() {
    document.getElementById("empty-state").style.display = "none";
}

function showEmptyState() {
    document.getElementById("empty-state").style.display = "";
}

function setSearchSpinner(show) {
    document.getElementById("search-spinner").classList.toggle("d-none", !show);
}

function showToast(msg, type = "info") {
    const c = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast-msg ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 4500);
}

function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    initCytoscape();

    // Toolbar
    document.getElementById("btn-fit").addEventListener("click", () => cy.fit(undefined, 40));
    document.getElementById("btn-reset-layout").addEventListener("click", () => runLayout(true));

    // Detail close
    document.getElementById("detail-close").addEventListener("click", hideDetailPanel);

    // Search tabs
    document.querySelectorAll(".search-tab").forEach(tab => {
        tab.addEventListener("click", function () {
            document.querySelectorAll(".search-tab").forEach(t => t.classList.remove("active"));
            this.classList.add("active");
            searchType = this.dataset.type;
            document.getElementById("search-results").innerHTML = "";
            document.getElementById("search-input").value = "";
            document.getElementById("search-input").focus();
        });
    });

    // Search input
    const input = document.getElementById("search-input");
    input.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => performSearch(this.value.trim()), 320);
    });

    // Close results on Escape
    input.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            document.getElementById("search-results").innerHTML = "";
            this.blur();
        }
    });

    // Health check on startup
    fetch("/api/health")
        .then(r => r.json())
        .then(d => {
            if (d.status !== "ok") showToast(d.message, "error");
        })
        .catch(() => {}); // ignore if backend is starting up
});
