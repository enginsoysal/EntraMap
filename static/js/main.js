"use strict";

const APP_CONTEXT = window.APP_CONTEXT || { signedIn: false, version: "0.4.0" };

const TYPE_META = {
    user: { label: "User", icon: "fa-user" },
    group: { label: "Group", icon: "fa-users" },
    device: { label: "Device", icon: "fa-laptop" },
    app: { label: "Application", icon: "fa-cube" },
    ca_policy: { label: "CA Policy", icon: "fa-shield-halved" },
};

const SEARCH_PLACEHOLDERS = {
    user: "Name or UPN...",
    group: "Group name...",
    device: "Device name...",
    app: "Intune app name...",
    ca_policy: "Conditional Access policy name...",
};

const OS_ICONS = {
    windows: { icon: "fa-brands fa-windows", label: "Windows", color: "#0078d4" },
    android: { icon: "fa-brands fa-android", label: "Android", color: "#3ddc84" },
    ios: { icon: "fa-brands fa-apple", label: "iOS", color: "#aaaaaa" },
    macos: { icon: "fa-brands fa-apple", label: "macOS", color: "#aaaaaa" },
    linux: { icon: "fa-brands fa-linux", label: "Linux", color: "#ff6600" },
    chromeos: { icon: "fa-brands fa-chrome", label: "Chrome OS", color: "#4285f4" },
};

let cy = null;
let searchType = "user";
let searchTimer = null;
let activeNodeId = null;
let lastGraphData = null;
let lastLoadedType = null;
let lastLoadedId = null;
let deepRefreshBusy = false;
let lastTapNodeId = null;
let lastTapAt = 0;
let groupImpactRequestId = 0;
const groupImpactCache = new Map();

const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_WARNING_SECONDS = 60;
let sessionIdleTimer = null;
let sessionCountdownTimer = null;
let sessionSecondsLeft = SESSION_WARNING_SECONDS;
let sessionWarningActive = false;

function getElement(id) {
    return document.getElementById(id);
}

function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escHtml(value) {
    if (value == null) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
}

function truncate(value, max) {
    if (!value) return "";
    return value.length > max ? `${value.slice(0, max)}...` : value;
}

function showToast(message, type = "info") {
    const container = getElement("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast-msg ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
}

function setSearchSpinner(show) {
    const spinner = getElement("search-spinner");
    if (spinner) spinner.classList.toggle("d-none", !show);
}

function showGraphLoading(show) {
    const panel = getElement("graph-loading");
    if (panel) panel.classList.toggle("d-none", !show);
}

function showEmptyState(show) {
    const state = getElement("empty-state");
    if (state) state.style.display = show ? "" : "none";
}

function clearSearchResults() {
    const results = getElement("search-results");
    if (results) results.innerHTML = "";
}

function openAuthPopup(url, windowName, width = 560, height = 720) {
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));
    const features = [
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        "popup=yes",
        "resizable=yes",
        "scrollbars=yes",
        "toolbar=no",
        "menubar=no",
        "status=no",
        "location=yes",
    ].join(",");

    const popup = window.open("about:blank", windowName, features);
    if (!popup) {
        window.location.href = url;
        return null;
    }

    try {
        popup.document.title = "EntraMap Sign-in";
        popup.document.body.innerHTML = "<p style='font-family:Segoe UI,system-ui,sans-serif;padding:20px;background:#0f172a;color:#e5e7eb'>Opening Microsoft sign-in...</p>";
    } catch (_) {
    }

    popup.location.replace(url);
    popup.focus();
    return popup;
}

window.openEntraMapAuthPopup = function (url) {
    openAuthPopup(url || "/auth/signin?popup=1", "entramapSignIn");
    return false;
};

window.openEntraMapConsentPopup = function (url) {
    openAuthPopup(url, "entramapConsent");
    return false;
};

function setupAuthOverlayTabs() {
    const tabs = document.querySelectorAll(".auth-tab");
    const panes = document.querySelectorAll(".auth-pane");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const key = tab.dataset.authTab;
            tabs.forEach(item => item.classList.toggle("active", item === tab));
            panes.forEach(pane => pane.classList.toggle("d-none", pane.dataset.authPane !== key));
        });
    });
}

function setupAuthPermissionAccordion() {
    const toggles = document.querySelectorAll(".perm-toggle");
    const bodies = document.querySelectorAll(".perm-body");
    toggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
            const body = toggle.nextElementSibling;
            const isOpen = toggle.classList.contains("open");

            toggles.forEach(item => item.classList.remove("open"));
            bodies.forEach(item => {
                item.classList.remove("open");
            });

            if (!isOpen && body) {
                toggle.classList.add("open");
                body.classList.add("open");
            }
        });
    });
}

function setupMicrosoftSignInPopup() {
    document.querySelectorAll(".js-ms-signin").forEach(link => {
        if (link.dataset.popupInline === "1") return;
        link.addEventListener("click", event => {
            event.preventDefault();
            openAuthPopup(link.getAttribute("href") || "/auth/signin?popup=1", "entramapSignIn");
        });
    });
}

function setControlsDisabled(disabled) {
    document.querySelectorAll(".search-tab, #btn-fit, #btn-reset-layout, #btn-export-json, #insight-unmanaged, #insight-noncompliant, #insight-reset")
        .forEach(element => {
            element.disabled = disabled;
        });

    const refreshBtn = getElement("btn-refresh");
    const deepRefreshBtn = getElement("btn-deep-refresh");
    if (refreshBtn) refreshBtn.disabled = disabled || !lastLoadedId;
    if (deepRefreshBtn) deepRefreshBtn.disabled = disabled || !lastLoadedId;
}

function enableSignedOutMode() {
    const input = getElement("search-input");
    if (input) {
        input.disabled = true;
        input.placeholder = "Sign in to search...";
    }
    setControlsDisabled(true);

    const emptyState = getElement("empty-state");
    if (emptyState) {
        const title = emptyState.querySelector("h5");
        const text = emptyState.querySelector("p");
        if (title) title.textContent = "Sign in to start";
        if (text) text.textContent = "Use the Sign In popup to unlock graph, search, and insights.";
    }

    const openBtn = getElement("open-auth-modal");
    const overlay = getElement("auth-overlay");
    if (openBtn && overlay) {
        openBtn.addEventListener("click", () => overlay.classList.remove("d-none"));
    }
}

function enableSignedInMode() {
    const input = getElement("search-input");
    if (input) {
        input.disabled = false;
        input.placeholder = SEARCH_PLACEHOLDERS[searchType] || "Search...";
    }
    setControlsDisabled(false);
}

function getOSIcon(osName) {
    if (!osName) return null;
    const normalized = String(osName).toLowerCase();
    return Object.entries(OS_ICONS).find(([key]) => normalized.includes(key))?.[1] || null;
}

function getNodeGlyph(node) {
    if (node.type === "user") return "👤";
    if (node.type === "group") return "👥";
    if (node.type === "app") return "🧩";
    if (node.type === "ca_policy") return "🛡";
    if (node.type === "device") {
        const os = String(node.data?.operatingSystem || "").toLowerCase();
        if (os.includes("windows")) return "🪟";
        if (os.includes("android")) return "🤖";
        if (os.includes("ios") || os.includes("mac")) return "🍎";
        if (os.includes("linux")) return "🐧";
        return "💻";
    }
    return "•";
}

function buildCyStyle() {
    return [
        {
            selector: "node",
            style: {
                label: "data(label)",
                "text-valign": "bottom",
                "text-halign": "center",
                "font-family": "Segoe UI, system-ui, sans-serif",
                "font-size": "10px",
                color: "#94a3b8",
                "text-margin-y": 5,
                "text-max-width": "110px",
                "text-wrap": "ellipsis",
                width: 46,
                height: 46,
                "border-width": 2,
                "border-color": "#252a47",
                "background-color": "#13162a",
                "overlay-padding": 6,
            },
        },
        { selector: "node[type='user']", style: { "background-color": "#0f2040", "border-color": "#3b82f6", "border-width": 3, width: 60, height: 60, "font-size": "11px", color: "#93c5fd", "font-weight": 700 } },
        { selector: "node[type='group']", style: { "background-color": "#2a1800", "border-color": "#f59e0b", shape: "diamond", width: 54, height: 54 } },
        { selector: "node[type='device']", style: { "background-color": "#062620", "border-color": "#10b981", shape: "round-rectangle" } },
        { selector: "node[type='app']", style: { "background-color": "#1d0a40", "border-color": "#8b5cf6", shape: "hexagon" } },
        { selector: "node[type='ca_policy']", style: { "background-color": "#2a0a0a", "border-color": "#ef4444", shape: "tag", width: 54, height: 54 } },
        { selector: "node[hasPhoto = 1]", style: { "background-image": "data(photo)", "background-fit": "cover", "background-clip": "node", "background-opacity": 1, "text-outline-width": 2, "text-outline-color": "#0b0d16" } },
        { selector: "node[type='group'][hasPhoto = 1]", style: { shape: "ellipse", width: 58, height: 58, "border-width": 3 } },
        { selector: "node.highlighted", style: { "border-width": 4, "overlay-color": "#fff", "overlay-padding": 4, "overlay-opacity": 0.06 } },
        { selector: "edge", style: { width: 1.5, "line-color": "#252a47", "target-arrow-color": "#252a47", "target-arrow-shape": "triangle", "curve-style": "bezier", label: "data(label)", "font-size": "8px", color: "#3a4268", "text-rotation": "autorotate", "text-margin-y": -6, "font-family": "Segoe UI, system-ui, sans-serif", opacity: 0.7 } },
        { selector: "edge.highlighted", style: { "line-color": "#3d4a7a", "target-arrow-color": "#3d4a7a", opacity: 1 } },
        { selector: ".faded", style: { opacity: 0.12 } },
    ];
}

function initCytoscape() {
    cy = cytoscape({
        container: getElement("graph"),
        style: buildCyStyle(),
        layout: { name: "preset" },
        minZoom: 0.08,
        maxZoom: 3.5,
        wheelSensitivity: 0.3,
    });

    cy.on("tap", "node", event => {
        const node = event.target;
        const now = Date.now();
        const isDoubleTap = lastTapNodeId === node.id() && now - lastTapAt < 340;
        lastTapNodeId = node.id();
        lastTapAt = now;

        if (isDoubleTap) {
            handleNodeDoubleTap(node);
            return;
        }

        setActiveNode(node.id());
        renderDetailPanel(node.data());
    });

    cy.on("tap", event => {
        if (event.target === cy) clearHighlight();
    });

    cy.on("mouseover", "node", () => {
        const graph = getElement("graph");
        if (graph) graph.style.cursor = "pointer";
    });
    cy.on("mouseout", "node", () => {
        const graph = getElement("graph");
        if (graph) graph.style.cursor = "default";
    });
}

function clearGraph() {
    if (!cy) return;
    cy.stop();
    cy.elements().remove();
    cy.zoom(1);
    cy.pan({ x: 0, y: 0 });
    activeNodeId = null;
    lastGraphData = null;
    renderRelationshipRail(null);
    hideDetailPanel();
}

function runLayout(animate = true) {
    if (!cy || !cy.nodes().length) return;

    let root = null;
    if (lastLoadedId) {
        const loaded = cy.getElementById(lastLoadedId);
        if (loaded && loaded.length) root = loaded;
    }
    if (!root || !root.length) {
        root = cy.nodes().first();
    }

    const layout = cy.layout({
        name: "breadthfirst",
        roots: root && root.length ? [root.id()] : undefined,
        directed: false,
        padding: 96,
        spacingFactor: 1.35,
        animate,
        animationDuration: animate ? 420 : 0,
        fit: false,
    });

    layout.on("layoutstop", () => {
        fitGraphInView();
    });
    layout.run();
}

function fitGraphInView() {
    if (!cy || !cy.nodes().length) return;

    const graph = getElement("graph");
    const relationshipRail = getElement("relationship-rail");
    const detailPanel = getElement("detail-panel");

    const nodeCount = cy.nodes().length;
    const graphWidth = graph?.clientWidth || cy.width();
    const graphHeight = graph?.clientHeight || cy.height();
    const detailInset = detailPanel && !detailPanel.classList.contains("d-none")
        ? Math.min(420, (detailPanel.offsetWidth || 320) + 24)
        : 0;
    const railLift = relationshipRail && !relationshipRail.classList.contains("d-none")
        ? Math.min(70, (relationshipRail.offsetHeight || 150) * 0.35)
        : 0;
    const visibleWidth = Math.max(260, graphWidth - detailInset);
    const targetCenterX = (visibleWidth / 2);
    const targetCenterY = (graphHeight / 2) - railLift;

    const bbox = cy.elements().boundingBox();
    const bboxWidth = Math.max(120, bbox.w || 0);
    const bboxHeight = Math.max(120, bbox.h || 0);
    const usableWidth = Math.max(240, visibleWidth - 48);
    const usableHeight = Math.max(220, graphHeight - 120 - railLift);
    const rawZoom = Math.min(usableWidth / bboxWidth, usableHeight / bboxHeight) * 0.9;

    const maxComfortZoom = nodeCount <= 8 ? 0.72 : nodeCount <= 20 ? 0.9 : 1.02;
    const minZoom = typeof cy.minZoom === "function" ? cy.minZoom() : 0.08;
    const maxZoom = typeof cy.maxZoom === "function" ? cy.maxZoom() : 3.5;
    const zoom = Math.max(minZoom, Math.min(rawZoom, maxComfortZoom, maxZoom));

    const bboxCenterX = (bbox.x1 + bbox.x2) / 2;
    const bboxCenterY = (bbox.y1 + bbox.y2) / 2;

    cy.zoom(zoom);
    cy.pan({
        x: targetCenterX - (bboxCenterX * zoom),
        y: targetCenterY - (bboxCenterY * zoom),
    });
}

function setActiveNode(nodeId) {
    if (!cy) return;
    clearHighlight();
    activeNodeId = nodeId;
    const node = cy.getElementById(nodeId);
    if (!node || !node.length) return;
    node.addClass("highlighted");
    node.connectedEdges().addClass("highlighted");
    node.neighborhood("node").addClass("highlighted");
    renderRelationshipRail(nodeId);
}

function clearHighlight() {
    if (!cy) return;
    cy.elements().removeClass("highlighted");
}

function clearFocusFilter() {
    if (!cy) return;
    cy.elements().removeClass("faded");
}

function applyFocusFilterByIds(nodeIds) {
    if (!cy || !nodeIds?.length) {
        showToast("No matching nodes visible in the current graph", "error");
        return;
    }

    let keep = cy.collection();
    nodeIds.forEach(id => {
        const node = cy.getElementById(id);
        if (node && node.length) keep = keep.union(node);
    });

    if (!keep.length) {
        showToast("No matching nodes visible in the current graph", "error");
        return;
    }

    keep = keep.union(keep.incomers("node")).union(keep.outgoers("node"));
    const keepEdges = keep.connectedEdges();
    cy.nodes().addClass("faded");
    cy.edges().addClass("faded");
    keep.removeClass("faded");
    keepEdges.removeClass("faded");
    cy.fit(keep, 60);
}

function getPhotoEndpointForType(type, id) {
    if (type === "user") return `/api/photo/user/${id}`;
    if (type === "group") return `/api/photo/group/${id}`;
    return null;
}

function hydrateGraphPhotos(nodes) {
    nodes
        .filter(node => node.type === "user" || node.type === "group")
        .slice(0, 24)
        .forEach(node => {
            const endpoint = getPhotoEndpointForType(node.type, node.id);
            if (!endpoint) return;

            fetch(endpoint)
                .then(response => response.json())
                .then(data => {
                    if (!data?.photo || !cy) return;
                    const current = cy.getElementById(node.id);
                    if (!current || !current.length) return;
                    current.data("photo", data.photo);
                    current.data("hasPhoto", 1);
                })
                .catch(() => {
                });
        });
}

function updateInsights(data) {
    const panel = getElement("insights-panel");
    const kpiWrap = getElement("insight-kpis");
    const osWrap = getElement("insight-os");
    if (!panel || !kpiWrap || !osWrap) return;

    const nodes = data?.nodes || [];
    const devices = nodes.filter(node => node.type === "device");
    const unmanaged = devices.filter(node => node.data?.isManaged === false).length;
    const nonCompliant = devices.filter(node => node.data?.isCompliant === false).length;

    const kpis = [
        ["Nodes", nodes.length],
        ["Devices", devices.length],
        ["Unmanaged", unmanaged],
        ["Non-compliant", nonCompliant],
        ["CA policies", nodes.filter(node => node.type === "ca_policy").length],
        ["Apps", nodes.filter(node => node.type === "app").length],
    ];

    kpiWrap.innerHTML = kpis.map(([label, value]) => `
        <div class="insight-kpi">
            <div class="insight-kpi-label">${label}</div>
            <div class="insight-kpi-value">${value}</div>
        </div>
    `).join("");

    const osStats = {};
    devices.forEach(device => {
        const meta = getOSIcon(device.data?.operatingSystem) || { icon: "fa-solid fa-desktop", label: "Other", color: "#7a8ab0" };
        osStats[meta.label] = osStats[meta.label] || { count: 0, icon: meta.icon, color: meta.color };
        osStats[meta.label].count += 1;
    });

    osWrap.innerHTML = Object.entries(osStats)
        .sort((left, right) => right[1].count - left[1].count)
        .map(([label, meta]) => `<span class="os-chip"><i class="${meta.icon}" style="color:${meta.color}"></i> ${escHtml(label)}: ${meta.count}</span>`)
        .join("") || `<span class="os-chip"><i class="fa-solid fa-desktop"></i> No device data</span>`;

    panel.classList.remove("d-none");
}

function renderRelationshipRail(nodeId) {
    const rail = getElement("relationship-rail");
    const title = getElement("rr-title");
    const groupsWrap = getElement("rr-groups");
    if (!rail || !title || !groupsWrap || !cy || !nodeId) {
        if (rail) rail.classList.add("d-none");
        return;
    }

    const node = cy.getElementById(nodeId);
    if (!node || !node.length) {
        rail.classList.add("d-none");
        return;
    }

    const grouped = { user: [], group: [], device: [], app: [], ca_policy: [] };
    node.connectedEdges().forEach(edge => {
        const other = edge.source().id() === node.id() ? edge.target() : edge.source();
        if (!other || !other.length) return;
        const type = other.data("type");
        if (!grouped[type]) return;
        grouped[type].push({
            id: other.id(),
            label: other.data("fullLabel") || other.data("label") || other.id(),
            edgeLabel: edge.data("label") || "linked",
        });
    });

    const order = ["user", "group", "device", "app", "ca_policy"];
    groupsWrap.innerHTML = order
        .filter(type => grouped[type].length)
        .map(type => {
            const meta = TYPE_META[type];
            const chips = grouped[type].map(item => `
                <button class="rr-chip" type="button" data-node-id="${escHtml(item.id)}">
                    <span class="rr-chip-main"><i class="fas ${meta.icon}"></i> ${escHtml(item.label)}</span>
                    <span class="rr-chip-sub">${escHtml(item.edgeLabel)}</span>
                </button>
            `).join("");

            return `
                <section class="rr-group">
                    <div class="rr-group-title">${meta.label}s <span>${grouped[type].length}</span></div>
                    <div class="rr-chip-list">${chips}</div>
                </section>
            `;
        }).join("") || `<div class="rr-empty">No direct links visible in the current graph.</div>`;

    title.textContent = node.data("fullLabel") || node.data("label") || "Linked objects";
    rail.classList.remove("d-none");

    groupsWrap.querySelectorAll(".rr-chip").forEach(button => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.nodeId;
            const targetNode = cy.getElementById(targetId);
            if (!targetNode || !targetNode.length) return;
            setActiveNode(targetId);
            renderDetailPanel(targetNode.data());
            cy.animate({ fit: { eles: targetNode.closedNeighborhood(), padding: 80 }, duration: 260 });
        });
    });
}

function renderGraph(data) {
    if (!cy) return;

    const elements = [];
    (data.nodes || []).forEach(node => {
        elements.push({
            group: "nodes",
            data: {
                id: node.id,
                label: `${getNodeGlyph(node)} ${truncate(node.label, 22)}`,
                fullLabel: node.label,
                type: node.type,
                hasPhoto: 0,
                ...node.data,
            },
        });
    });

    (data.edges || []).forEach(edge => {
        elements.push({
            group: "edges",
            data: {
                id: `${edge.source}__${edge.target}__${edge.label || "link"}`,
                source: edge.source,
                target: edge.target,
                label: edge.label,
            },
        });
    });

    cy.add(elements);
    lastGraphData = data;
    updateInsights(data);
    runLayout(false);
    hydrateGraphPhotos(data.nodes || []);

    if (lastLoadedId) {
        const rootNode = cy.getElementById(lastLoadedId);
        if (rootNode && rootNode.length) {
            setActiveNode(lastLoadedId);
            renderDetailPanel(rootNode.data());
            requestAnimationFrame(() => fitGraphInView());
        }
    }
}

async function loadMap(objectType, objectId) {
    if (!APP_CONTEXT.signedIn) {
        showToast("Sign in required", "error");
        return;
    }

    lastLoadedType = objectType;
    lastLoadedId = objectId;
    setControlsDisabled(false);
    showGraphLoading(true);
    clearGraph();
    showEmptyState(false);

    try {
        const response = await fetch(`/api/map/${objectType}/${objectId}`);
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || "Failed to load data", "error");
            showEmptyState(true);
            return;
        }
        renderGraph(data);

        // App exists, but Intune returned no assignment links for this object.
        if (objectType === "app" && Array.isArray(data.nodes) && data.nodes.length > 0 && (!data.edges || data.edges.length === 0)) {
            showToast("App found, but no assignments were returned from Intune.", "info");
        }
    } catch (error) {
        showToast(`Network error: ${error.message}`, "error");
        showEmptyState(true);
    } finally {
        showGraphLoading(false);
        setControlsDisabled(false);
    }
}

function handleNodeDoubleTap(node) {
    const type = node.data("type");
    const id = node.id();
    if (["user", "group", "device", "app", "ca_policy"].includes(type)) {
        showToast(`Drill-down: loading ${type} structure`, "info");
        loadMap(type, id);
        return;
    }
    applyFocusFilterByIds([id]);
}

function renderSearchError(message) {
    const container = getElement("search-results");
    if (!container) return;
    container.innerHTML = `<div class="sr-empty" style="color:#f87171">${escHtml(message)}</div>`;
}

function renderSearchResults(items) {
    const container = getElement("search-results");
    if (!container) return;
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = '<div class="sr-empty">No results found</div>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement("div");
        row.className = `sr-item type-${item.type}`;
        row.innerHTML = `
            <div class="sr-icon"><i class="fas ${TYPE_META[item.type]?.icon || "fa-circle"}"></i></div>
            <div class="sr-info">
                <div class="sr-label">${escHtml(item.label)}</div>
                <div class="sr-sub">${escHtml(item.subtitle || "")}</div>
            </div>
        `;
        row.addEventListener("click", () => {
            const input = getElement("search-input");
            if (input) input.value = item.label;
            clearSearchResults();
            loadMap(item.type, item.id);
        });
        container.appendChild(row);
    });
}

async function performSearch(query) {
    if (!APP_CONTEXT.signedIn) {
        renderSearchError("Sign in required");
        return;
    }

    if (!query || query.length < 2) {
        clearSearchResults();
        return;
    }

    setSearchSpinner(true);
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${searchType}`);
        const data = await response.json();

        if (response.status === 428 && data?.reauth_url) {
            showToast("Refreshing Intune permissions...", "info");
            window.openEntraMapConsentPopup(data.reauth_url);
            renderSearchError("Confirm permissions in the popup window and try again.");
            return;
        }

        if (!response.ok || data.error) {
            renderSearchError(data.details || data.error || "Search request failed");
            return;
        }

        renderSearchResults(data);
    } catch (error) {
        renderSearchError(`Network error: ${error.message}`);
    } finally {
        setSearchSpinner(false);
    }
}

function hideDetailPanel() {
    const panel = getElement("detail-panel");
    const divider = getElement("detail-divider");
    const tip = getElement("left-tip");
    if (panel) panel.classList.add("d-none");
    if (divider) divider.classList.add("d-none");
    if (tip) tip.style.display = "";
    activeNodeId = null;
    clearHighlight();
}

function getPortalUrl(type, id) {
    if (!id) return "";
    const urls = {
        user: `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${id}`,
        group: `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`,
        device: `https://entra.microsoft.com/#view/Microsoft_AAD_Devices/DeviceDetailsMenuBlade/~/Overview/objectId/${id}`,
        app: "https://intune.microsoft.com/#view/Microsoft_Intune_Apps/AppsMenu/~/allApps",
        ca_policy: `https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies/policyId/${id}`,
    };
    return urls[type] || "";
}

function loadUserPhoto(userId) {
    fetch(`/api/photo/user/${userId}`)
        .then(response => response.json())
        .then(data => {
            const photo = getElement("detail-photo");
            if (data?.photo && photo) {
                photo.innerHTML = `<img src="${data.photo}" alt="User photo" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
                photo.classList.remove("dp-photo-placeholder");
            }
        })
        .catch(() => {
        });
}

function loadGroupPhoto(groupId) {
    fetch(`/api/photo/group/${groupId}`)
        .then(response => response.json())
        .then(data => {
            const photo = getElement("detail-photo");
            if (data?.photo && photo) {
                photo.innerHTML = `<img src="${data.photo}" alt="Group photo" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
                photo.classList.remove("dp-photo-placeholder");
            }
        })
        .catch(() => {
        });
}

function getImpactStatusMeta(summary) {
    if (!summary) {
        return { label: "Loading", className: "pending" };
    }
    if (summary.riskLevel === "blocked") {
        return { label: summary.riskLabel || "Blocked", className: "blocked" };
    }
    if (summary.riskLevel === "caution") {
        return { label: summary.riskLabel || "Caution", className: "partial" };
    }
    if (summary.partialDomains > 0) {
        return { label: "Partial", className: "partial" };
    }
    return { label: summary.riskLabel || "Safe", className: "safe" };
}

function renderGroupImpactLoading() {
    const panel = getElement("group-impact-panel");
    if (!panel) return;
    panel.innerHTML = `
        <div class="gi-head">
            <div>
                <div class="gi-kicker">Deletion Impact</div>
                <div class="gi-title">Checking group dependencies...</div>
            </div>
            <span class="gi-state pending">Loading</span>
        </div>
        <div class="gi-note">Scanning Conditional Access, Intune, IAM, enterprise apps, and nested groups.</div>
    `;
}

function renderGroupImpactError(message) {
    const panel = getElement("group-impact-panel");
    if (!panel) return;
    panel.innerHTML = `
        <div class="gi-head">
            <div>
                <div class="gi-kicker">Deletion Impact</div>
                <div class="gi-title">Impact check unavailable</div>
            </div>
            <span class="gi-state partial">Error</span>
        </div>
        <div class="gi-note">${escHtml(message || "Unable to load impact details.")}</div>
    `;
}

function setDetailTab(activeTab) {
    const tabButtons = document.querySelectorAll(".dp-tab");
    const panes = document.querySelectorAll(".dp-pane");
    tabButtons.forEach(button => button.classList.toggle("active", button.dataset.dpTab === activeTab));
    panes.forEach(pane => pane.classList.toggle("d-none", pane.dataset.dpPane !== activeTab));
}

function bindDetailTabs() {
    document.querySelectorAll(".dp-tab").forEach(button => {
        button.addEventListener("click", () => setDetailTab(button.dataset.dpTab || "details"));
    });
}

function formatImpactLabel(value) {
    const raw = String(value || "linked").trim();
    if (!raw) return "Linked";

    const normalized = raw.replace(/[_-]+/g, " ").toLowerCase();
    if (normalized === "included scope") return "Included scope";
    if (normalized === "excluded scope") return "Excluded scope";
    if (normalized === "app role assignment") return "App role assignment";
    if (normalized === "role assignment") return "Directory role assignment";
    if (normalized === "eligible role assignment") return "PIM eligibility";
    if (normalized === "active pim assignment") return "Active PIM assignment";
    if (normalized === "administrative unit member") return "Administrative Unit member";
    if (normalized === "member of group") return "Nested in parent group";
    if (normalized === "contains group") return "Contains nested group";
    if (normalized === "group license assignment") return "Group-based license";
    if (normalized === "entitlement policy scope") return "Entitlement policy scope";
    if (normalized === "m365 workspace backing group") return "M365 workspace backing group";
    if (normalized === "teams backed group") return "Teams-connected group";
    if (normalized === "sharepoint site backing group") return "SharePoint-connected group";
    if (normalized === "planner plan backing group") return "Planner-connected group";
    if (normalized === "exchange group mailbox") return "Exchange group mailbox";
    if (normalized === "exchange conversation history") return "Exchange conversations";
    if (normalized === "exchange group calendar") return "Exchange group calendar";

    return normalized.replace(/\b\w/g, char => char.toUpperCase());
}

function getPermissionHintForDomain(domain) {
    const key = String(domain?.key || "");
    if (key === "intune_apps") return "Needs DeviceManagementApps.Read.All consent and Intune read visibility";
    if (key === "conditional_access") return "Needs Policy.Read.All consent and a role that can read CA policies";
    if (key === "enterprise_apps") return "Needs Application.Read.All consent and directory app read visibility";
    if (key === "iam_roles" || key === "pim_roles") return "Needs RoleManagement.Read.Directory consent and directory role visibility";
    if (key === "administrative_units") return "Needs AdministrativeUnit.Read.All consent and AU read visibility";
    if (key === "group_nesting") return "Needs Group.Read.All consent and group read visibility";
    if (key === "group_licensing") return "Needs Group.Read.All and Organization.Read.All visibility for license resolution";
    if (key === "entitlement_management") return "Needs EntitlementManagement.Read.All consent and governance read visibility";
    if (key === "m365_workloads") return "Needs Team.ReadBasic.All, Sites.Read.All, Tasks.Read and workload visibility";
    if (key === "exchange_workloads") return "Needs group mailbox/calendar visibility in Exchange workloads";
    return "Check Graph consent and signed-in role visibility";
}

function getDomainAccessReason(domain) {
    const rawDetails = String(domain?.details || "").trim();
    const fallback = getPermissionHintForDomain(domain);
    if (!rawDetails) return fallback;

    let detailText = rawDetails;
    if (rawDetails.startsWith("{")) {
        try {
            const parsed = JSON.parse(rawDetails);
            const graphMessage = parsed?.error?.message;
            if (graphMessage) detailText = String(graphMessage);
        } catch (_) {
            // keep original raw text
        }
    }

    // Keep UI compact while still exposing the concrete Graph failure reason.
    const concise = detailText.length > 180 ? `${detailText.slice(0, 177)}...` : detailText;
    return `${concise} | ${fallback}`;
}

function getDomainRemediation(domainKey) {
    const key = String(domainKey || "");
    const map = {
        conditional_access: "Review include/exclude scopes and replace this group in CA policies before deletion.",
        intune_apps: "Reassign Intune app targets to a replacement group and verify assignment intent.",
        enterprise_apps: "Move enterprise app role assignments to a successor group or service principal mapping.",
        iam_roles: "Remove directory role assignments from this group or transfer them to a least-privileged replacement.",
        pim_roles: "Migrate PIM eligibility/active role assignments to a replacement identity path.",
        administrative_units: "Remove this group from Administrative Units or update AU scope design.",
        group_nesting: "Flatten or rewire nested group chains to avoid inherited dependency breakage.",
        group_licensing: "Reassign group-based licenses before deletion to prevent license loss.",
        entitlement_management: "Update access package assignment policies to remove references to this group.",
        m365_workloads: "Validate Teams/SharePoint/Planner ownership and move workload ownership first.",
        exchange_workloads: "Validate mailbox, conversations, and calendar dependencies in Exchange workloads.",
    };
    return map[key] || "Review this domain and replace or remove references before deleting the group.";
}

function getDomainOwnerSuggestion(domainKey) {
    const key = String(domainKey || "");
    const map = {
        conditional_access: "Identity Security Team",
        intune_apps: "Endpoint Management Team",
        enterprise_apps: "Application Owners + IAM Team",
        iam_roles: "Privileged Access / IAM Team",
        pim_roles: "Privileged Access / IAM Team",
        administrative_units: "Directory Governance Team",
        group_nesting: "Identity Governance Team",
        group_licensing: "Licensing Operations Team",
        entitlement_management: "Identity Governance Team",
        m365_workloads: "M365 Collaboration Team",
        exchange_workloads: "Exchange Admin Team",
    };
    return map[key] || "Identity Operations Team";
}

function getChecklistStorageKey(groupId) {
    return `entramap_impact_checklist_${groupId}`;
}

function getChecklistState(groupId) {
    if (!groupId) return {};
    try {
        const raw = localStorage.getItem(getChecklistStorageKey(groupId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

function setChecklistState(groupId, state) {
    if (!groupId) return;
    try {
        localStorage.setItem(getChecklistStorageKey(groupId), JSON.stringify(state || {}));
    } catch (_) {
    }
}

function setChecklistItem(groupId, key, checked) {
    const state = getChecklistState(groupId);
    state[key] = checked === true;
    setChecklistState(groupId, state);
}

function getDomainChecklist(domainKey, domain) {
    const key = String(domainKey || "");
    const count = Number(domain?.count || 0);
    const map = {
        conditional_access: [
            "Validate include/exclude scope for this group",
            "Move policy targeting to replacement group",
            "Run CA impact simulation before delete",
        ],
        intune_apps: [
            `Reassign ${count} Intune app target(s)`,
            "Confirm include/exclude assignment intent",
            "Verify app deployment status after reassignment",
        ],
        enterprise_apps: [
            "Move app role assignments to replacement group",
            "Validate app sign-in paths after migration",
        ],
        iam_roles: [
            "Remove direct directory role assignments",
            "Grant replacement group least-privileged roles",
            "Validate privileged access break-glass path",
        ],
        pim_roles: [
            "Migrate PIM eligibility assignments",
            "Review active PIM schedule instances",
        ],
        administrative_units: [
            "Remove group from Administrative Units",
            "Re-check AU scoped administration behavior",
        ],
        group_nesting: [
            "Replace nested parent references",
            "Replace nested child references",
            "Validate inheritance chain after update",
        ],
        group_licensing: [
            "Move group-based license assignments",
            "Validate user license continuity",
        ],
        entitlement_management: [
            "Update access package assignment policies",
            "Retest access package request flow",
        ],
        m365_workloads: [
            "Reassign Teams/SharePoint/Planner ownership",
            "Validate collaboration workloads after migration",
        ],
        exchange_workloads: [
            "Verify mailbox and conversation retention path",
            "Validate calendar dependencies and delegates",
        ],
    };
    return map[key] || ["Validate and remove this dependency before deleting the group"];
}

function getExecutiveDecision(summary) {
    const level = String(summary?.riskLevel || "safe");
    if (level === "blocked") {
        return {
            title: "No-Go: Block Delete",
            className: "blocked",
            detail: "Blocking dependencies exist. Resolve blockers before deletion.",
        };
    }
    if (level === "caution") {
        return {
            title: "Conditional Go",
            className: "partial",
            detail: "Proceed only after remediating warnings and validating constrained domains.",
        };
    }
    return {
        title: "Go",
        className: "safe",
        detail: "No direct blockers detected in checked domains.",
    };
}

function getTopEvidence(domains, limit = 5) {
    const evidence = [];
    domains.forEach(domain => {
        (domain.findings || []).forEach(item => {
            evidence.push({
                domainLabel: domain.label || domain.key || "Domain",
                severity: item.severity || "warning",
                impact: formatImpactLabel(item.impact),
                name: item.name || "Unknown",
                id: item.id || "",
            });
        });
    });

    evidence.sort((a, b) => {
        const rank = value => (value === "blocker" ? 0 : 1);
        return rank(a.severity) - rank(b.severity);
    });
    return evidence.slice(0, limit);
}

function toCsvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function focusImpactFinding(targetId, targetName) {
    if (!cy || !cy.nodes().length) {
        showToast("No graph loaded", "error");
        return;
    }

    let node = null;
    const rawId = String(targetId || "").trim();
    const rawName = String(targetName || "").trim().toLowerCase();

    if (rawId) {
        const byId = cy.getElementById(rawId);
        if (byId && byId.length) {
            node = byId;
        }
    }

    if (!node && rawName) {
        const candidates = cy.nodes().filter(n => {
            const label = String(n.data("fullLabel") || n.data("label") || "").trim().toLowerCase();
            if (!label) return false;
            return label === rawName || label.includes(rawName) || rawName.includes(label);
        });
        if (candidates && candidates.length) {
            node = candidates.first();
        }
    }

    if (!node || !node.length) {
        showToast("Object not visible in the current graph", "info");
        return;
    }

    setActiveNode(node.id());
    renderDetailPanel(node.data());
    cy.animate({ fit: { eles: node.closedNeighborhood(), padding: 90 }, duration: 240 });
}

function renderGroupImpact(result) {
    const panel = getElement("group-impact-panel");
    if (!panel) return;

    const summary = result?.summary || {};
    const groupId = String(result?.group?.id || "");
    const status = getImpactStatusMeta(summary);
    const domains = Array.isArray(result?.domains) ? result.domains : [];
    const completeness = summary?.completeness || {};
    const executive = getExecutiveDecision(summary);
    const sortedDomains = [...domains].sort((left, right) => (right.count || 0) - (left.count || 0));
    const topDomains = sortedDomains.filter(domain => (domain.count || 0) > 0).slice(0, 10);
    const partialDomains = sortedDomains.filter(domain => domain.status && domain.status !== "ok");
    const topEvidence = getTopEvidence(sortedDomains, 5);
    const checklistState = getChecklistState(groupId);

    const summaryHtml = `
        <div class="gi-kpis">
            <div class="gi-kpi"><span>Blockers</span><strong>${summary.blockers || 0}</strong></div>
            <div class="gi-kpi"><span>Warnings</span><strong>${summary.warnings || 0}</strong></div>
            <div class="gi-kpi"><span>Domains hit</span><strong>${summary.domainsWithHits || 0}/${summary.domainsChecked || 0}</strong></div>
            <div class="gi-kpi"><span>Risk score</span><strong>${summary.riskScore || 0}</strong></div>
            <div class="gi-kpi"><span>Coverage</span><strong>${summary.coverageScore || 0}%</strong></div>
            <div class="gi-kpi"><span>Confidence</span><strong>${escHtml(summary.confidence || "low")}</strong></div>
        </div>
    `;

    const scorePercent = Math.max(0, Math.min(100, Number(summary.riskScore || 0)));
    const scoreHtml = `
        <div class="gi-score-wrap">
            <div class="gi-score-meta">
                <span>Delete recommendation</span>
                <strong>${escHtml(summary.riskLabel || "Safe")}</strong>
            </div>
            <div class="gi-score-bar"><span style="width:${scorePercent}%"></span></div>
            <div class="gi-note">${escHtml(summary.recommendation || "No recommendation available.")}</div>
        </div>
    `;

    const executiveHtml = `
        <section class="gi-exec gi-exec-${escHtml(executive.className)}">
            <div class="gi-exec-head">
                <span>Executive Decision</span>
                <strong>${escHtml(executive.title)}</strong>
            </div>
            <div class="gi-note">${escHtml(executive.detail)}</div>
            ${topEvidence.length ? `
                <ul class="gi-findings gi-exec-list">
                    ${topEvidence.map(item => `
                        <li class="gi-finding ${escHtml(item.severity)}">
                            <span>${escHtml(item.name)}</span>
                            <small>${escHtml(item.domainLabel)} • ${escHtml(item.impact)}</small>
                        </li>
                    `).join("")}
                </ul>
            ` : ""}
        </section>
    `;

    const domainHtml = topDomains.length
        ? topDomains.map(domain => {
            const firstFindings = (domain.findings || []).slice(0, 3).map(item => `
                <li class="gi-finding clickable ${escHtml(item.severity || "warning")}" data-target-id="${escHtml(item.id || "")}" data-target-name="${escHtml(item.name || "")}">
                    <span>${escHtml(item.name || "Unknown")}</span>
                    <small>${escHtml(formatImpactLabel(item.impact))}</small>
                </li>
            `).join("");
            const checklistSteps = getDomainChecklist(domain.key, domain);
            const domainCheckedCount = checklistSteps.filter((_, index) => checklistState[`${domain.key}:${index}`]).length;
            const domainAllDone = checklistSteps.length > 0 && domainCheckedCount === checklistSteps.length;
            const checklistHtml = checklistSteps.map((step, index) => {
                const itemKey = `${domain.key}:${index}`;
                const checked = checklistState[itemKey] ? "checked" : "";
                return `<label class="gi-check-item"><input type="checkbox" data-check-key="${escHtml(itemKey)}" ${checked}> <span>${escHtml(step)}</span></label>`;
            }).join("");

            return `
                <section class="gi-domain${domainAllDone ? " gi-domain--complete" : ""}" data-domain-key="${escHtml(domain.key || "")}">
                    <div class="gi-domain-head">
                        <span class="gi-domain-label">${escHtml(domain.label || domain.key || "Domain")}</span>
                        <div class="gi-domain-head-right">
                            <span class="gi-domain-badge" data-domain-badge="${escHtml(domain.key || "")}">${domainCheckedCount}/${checklistSteps.length}</span>
                            <span class="gi-domain-count">${domain.count || 0}</span>
                        </div>
                    </div>
                    <ul class="gi-findings">${firstFindings}</ul>
                    <div class="gi-remedy">${escHtml(getDomainRemediation(domain.key))}</div>
                    <div class="gi-owner">Owner to contact: ${escHtml(getDomainOwnerSuggestion(domain.key))}</div>
                    <div class="gi-checklist">${checklistHtml}</div>
                </section>
            `;
        }).join("")
        : `<div class="gi-note">No direct blockers or warnings were detected for this group in the checked domains.</div>`;

    const partialNote = summary.partialDomains > 0
        ? `<div class="gi-note">Impact is partial. The domains below could not be fully read.</div>`
        : "";

    const partialDetails = partialDomains.length
        ? `
            <section class="gi-domain gi-domain-partial">
                <div class="gi-domain-head">
                    <span class="gi-domain-label">Access limitations detected</span>
                    <span class="gi-domain-count">${partialDomains.length}</span>
                </div>
                <ul class="gi-findings">
                    ${partialDomains.map(domain => `
                        <li class="gi-finding warning">
                            <span>${escHtml(domain.label || domain.key || "Domain")}</span>
                            <small>${escHtml(getDomainAccessReason(domain))}</small>
                        </li>
                    `).join("")}
                </ul>
            </section>
        `
        : "";

    const constrained = Array.isArray(completeness.constrainedDomains) ? completeness.constrainedDomains : [];
    const checklistKeys = Object.keys(checklistState);
    const checklistDone = checklistKeys.filter(key => checklistState[key]).length;
    const checklistTotal = topDomains.reduce((total, domain) => total + getDomainChecklist(domain.key, domain).length, 0);
    const completenessHtml = `
        <section class="gi-score-wrap">
            <div class="gi-score-meta">
                <span>Coverage Detail</span>
                <strong>${completeness.domainsOk || 0}/${completeness.domainsTotal || summary.domainsChecked || 0} domains readable</strong>
            </div>
            <div class="gi-note">Constrained domains: ${constrained.length}</div>
            ${constrained.length ? `<div class="gi-note">${escHtml(constrained.map(item => item.label).join(", "))}</div>` : ""}
            <div class="gi-note gi-check-progress">Checklist progress: ${Math.min(checklistDone, checklistTotal)}/${checklistTotal}</div>
        </section>
    `;

    panel.innerHTML = `
        <div class="gi-head">
            <div>
                <div class="gi-kicker">Deletion Impact</div>
                <div class="gi-title">${summary.riskLevel === "blocked" ? "Dependencies found before delete" : summary.riskLevel === "caution" ? "Review dependencies before delete" : "No blocking dependencies found"}</div>
            </div>
            <span class="gi-state ${status.className}">${status.label}</span>
        </div>
        ${executiveHtml}
        ${summaryHtml}
        ${scoreHtml}
        ${completenessHtml}
        ${partialNote}
        ${partialDetails}
        ${topDomains.length ? `
        <div class="gi-domains-toolbar">
            <button class="gi-toolbar-btn" id="gi-reset-btn" type="button">Reset checklist</button>
            <label class="gi-filter-toggle"><input type="checkbox" id="gi-open-filter"> <span>Only open actions</span></label>
        </div>
        ` : ""}
        <div class="gi-ready-banner" hidden>
            <span>All remediation steps complete</span>
            <strong>Ready to Delete</strong>
        </div>
        <div class="gi-domains">${domainHtml}</div>
    `;

    panel.querySelectorAll(".gi-finding.clickable").forEach(item => {
        item.addEventListener("click", () => {
            focusImpactFinding(item.getAttribute("data-target-id"), item.getAttribute("data-target-name"));
        });
    });

    function updateChecklistState() {
        const allBoxes = panel.querySelectorAll(".gi-check-item input[type='checkbox']");
        const checkedBoxes = panel.querySelectorAll(".gi-check-item input[type='checkbox']:checked");
        const progressEl = panel.querySelector(".gi-check-progress");
        if (progressEl) progressEl.textContent = `Checklist progress: ${checkedBoxes.length}/${allBoxes.length}`;

        // Per-domain badge + complete state
        panel.querySelectorAll(".gi-domain[data-domain-key]").forEach(domainEl => {
            const dKey = domainEl.getAttribute("data-domain-key");
            const dAll = domainEl.querySelectorAll(".gi-check-item input[type='checkbox']").length;
            const dChecked = domainEl.querySelectorAll(".gi-check-item input[type='checkbox']:checked").length;
            const badge = domainEl.querySelector(`[data-domain-badge="${dKey}"]`);
            if (badge) badge.textContent = `${dChecked}/${dAll}`;
            if (dAll > 0 && dChecked === dAll) {
                domainEl.classList.add("gi-domain--complete");
            } else {
                domainEl.classList.remove("gi-domain--complete");
            }
        });

        // Global Ready to Delete banner
        const readyBanner = panel.querySelector(".gi-ready-banner");
        const allDone = allBoxes.length > 0 && checkedBoxes.length === allBoxes.length;
        if (readyBanner) readyBanner.hidden = !allDone;
    }

    panel.querySelectorAll(".gi-check-item input[type='checkbox']").forEach(input => {
        input.addEventListener("change", () => {
            const key = input.getAttribute("data-check-key") || "";
            if (!key || !groupId) return;
            setChecklistItem(groupId, key, input.checked);
            updateChecklistState();
        });
    });

    const resetBtn = panel.querySelector("#gi-reset-btn");
    if (resetBtn && groupId) {
        resetBtn.addEventListener("click", () => {
            setChecklistState(groupId, {});
            panel.querySelectorAll(".gi-check-item input[type='checkbox']").forEach(cb => {
                cb.checked = false;
            });
            updateChecklistState();
            showToast("Checklist reset", "info");
        });
    }

    const openFilter = panel.querySelector("#gi-open-filter");
    const domainsEl = panel.querySelector(".gi-domains");
    if (openFilter && domainsEl) {
        openFilter.addEventListener("change", () => {
            if (openFilter.checked) {
                domainsEl.classList.add("gi-domains--open-only");
            } else {
                domainsEl.classList.remove("gi-domains--open-only");
            }
        });
    }
}

async function loadGroupImpact(groupId) {
    const panel = getElement("group-impact-panel");
    if (!panel || !groupId) return;

    const requestId = ++groupImpactRequestId;
    renderGroupImpactLoading();

    if (groupImpactCache.has(groupId)) {
        if (requestId === groupImpactRequestId) {
            renderGroupImpact(groupImpactCache.get(groupId));
        }
        return;
    }

    try {
        const response = await fetch(`/api/impact/group/${groupId}`);
        const data = await response.json();
        if (requestId !== groupImpactRequestId) return;

        if (!response.ok) {
            renderGroupImpactError(data.error || "Impact check failed");
            return;
        }

        groupImpactCache.set(groupId, data);
        renderGroupImpact(data);
    } catch (error) {
        if (requestId !== groupImpactRequestId) return;
        renderGroupImpactError(`Network error: ${error.message}`);
    }
}

async function exportGroupImpactReport(groupId) {
    if (!groupId) return;
    try {
        const response = await fetch(`/api/impact/group/${groupId}`);
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || "Impact export failed", "error");
            return;
        }

        const safeName = String(data?.group?.displayName || groupId)
            .replace(/[^a-z0-9\-_]+/gi, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) || "group";
        const fileName = `entramap-impact-${safeName}-${Date.now()}.json`;

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Impact report exported", "info");
    } catch (error) {
        showToast(`Impact export failed: ${error.message}`, "error");
    }
}

async function exportGroupImpactCsv(groupId) {
    if (!groupId) return;
    try {
        const response = await fetch(`/api/impact/group/${groupId}`);
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || "CSV export failed", "error");
            return;
        }

        const summary = data?.summary || {};
        const group = data?.group || {};
        const rows = [];
        rows.push([
            "groupDisplayName",
            "groupId",
            "riskLevel",
            "riskScore",
            "coverageScore",
            "confidence",
            "domainKey",
            "domainLabel",
            "domainStatus",
            "findingSeverity",
            "findingImpact",
            "findingName",
            "findingId",
            "domainDetails",
        ]);

        (data?.domains || []).forEach(domain => {
            const findings = Array.isArray(domain?.findings) ? domain.findings : [];
            if (!findings.length) {
                rows.push([
                    group.displayName || "",
                    group.id || "",
                    summary.riskLevel || "",
                    summary.riskScore || "",
                    summary.coverageScore || "",
                    summary.confidence || "",
                    domain.key || "",
                    domain.label || "",
                    domain.status || "",
                    "",
                    "",
                    "",
                    "",
                    domain.details || "",
                ]);
                return;
            }

            findings.forEach(item => {
                rows.push([
                    group.displayName || "",
                    group.id || "",
                    summary.riskLevel || "",
                    summary.riskScore || "",
                    summary.coverageScore || "",
                    summary.confidence || "",
                    domain.key || "",
                    domain.label || "",
                    domain.status || "",
                    item.severity || "",
                    formatImpactLabel(item.impact),
                    item.name || "",
                    item.id || "",
                    domain.details || "",
                ]);
            });
        });

        const csv = rows
            .map(line => line.map(toCsvCell).join(","))
            .join("\n");
        const safeName = String(group.displayName || groupId)
            .replace(/[^a-z0-9\-_]+/gi, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) || "group";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `entramap-impact-${safeName}-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Impact CSV exported", "info");
    } catch (error) {
        showToast(`CSV export failed: ${error.message}`, "error");
    }
}

function buildDetailRows(type, data) {
    const rows = [];
    const pushRow = (label, value, mono = false) => {
        if (value == null || value === "") return;
        rows.push(`
            <div class="dp-row">
                <div class="dp-label">${label}</div>
                <div class="dp-value${mono ? " mono" : ""}">${value}</div>
            </div>
        `);
    };
    const formatDate = value => {
        if (!value) return "—";
        try {
            return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } catch (_) {
            return value;
        }
    };
    const yesNo = value => value ? '<span class="sb yes">Yes</span>' : '<span class="sb no">No</span>';
    const enabledBadge = value => value !== false ? '<span class="sb on"><i class="fas fa-check-circle"></i> Enabled</span>' : '<span class="sb off"><i class="fas fa-times-circle"></i> Disabled</span>';

    if (type === "user") {
        rows.push('<div class="dp-photo-container"><div id="detail-photo" class="dp-photo-placeholder"><i class="fas fa-user"></i></div></div>');
        pushRow("UPN", escHtml(data.userPrincipalName));
        pushRow("Email", escHtml(data.mail));
        pushRow("Job title", escHtml(data.jobTitle));
        pushRow("Department", escHtml(data.department));
        pushRow("Company", escHtml(data.companyName));
        pushRow("Office", escHtml(data.officeLocation));
        pushRow("City", escHtml(data.city));
        pushRow("Country", escHtml(data.country));
        pushRow("Mobile", escHtml(data.mobilePhone));
        pushRow("Account", enabledBadge(data.accountEnabled));
        pushRow("Created", formatDate(data.createdDateTime));
        pushRow("Last pwd chg", formatDate(data.lastPasswordChangeDateTime));
        if (data.signInActivity?.lastSignInDateTime) pushRow("Last sign-in", formatDate(data.signInActivity.lastSignInDateTime));
        pushRow("Object ID", escHtml(data.id), true);
        window.setTimeout(() => loadUserPhoto(data.id), 60);
    }

    if (type === "group") {
        rows.push('<div class="dp-photo-container"><div id="detail-photo" class="dp-photo-placeholder"><i class="fas fa-users"></i></div></div>');
        const groupTypes = [];
        if (data.groupTypes?.includes("Unified")) groupTypes.push("Microsoft 365");
        if (data.securityEnabled) groupTypes.push("Security");
        if (data.mailEnabled) groupTypes.push("Mail");
        if (data.groupTypes?.includes("DynamicMembership")) groupTypes.push("Dynamic");
        const groupRows = [];
        const pushGroupRow = (label, value, mono = false) => {
            if (value == null || value === "") return;
            groupRows.push(`
                <div class="dp-row">
                    <div class="dp-label">${label}</div>
                    <div class="dp-value${mono ? " mono" : ""}">${value}</div>
                </div>
            `);
        };
        pushGroupRow("Description", escHtml(data.description));
        pushGroupRow("Type", escHtml(groupTypes.join(", ")) || "—");
        pushGroupRow("Object ID", escHtml(data.id), true);

        rows.push(`
            <div class="dp-tabs">
                <button class="dp-tab active" type="button" data-dp-tab="details">Details</button>
                <button class="dp-tab" type="button" data-dp-tab="impact">Impact</button>
            </div>
            <div class="dp-pane" data-dp-pane="details">
                ${groupRows.join("")}
            </div>
            <div class="dp-pane d-none" data-dp-pane="impact">
                <div id="group-impact-panel" class="gi-card"></div>
            </div>
        `);
        rows.push(`
            <div class="dp-actions">
                <button class="dp-action-btn" type="button" onclick="exportGroupImpactReport('${escHtml(data.id)}')"><i class="fas fa-file-arrow-down"></i> Export impact report</button>
                <button class="dp-action-btn" type="button" onclick="exportGroupImpactCsv('${escHtml(data.id)}')"><i class="fas fa-file-csv"></i> Export impact CSV</button>
            </div>
        `);
        window.setTimeout(() => loadGroupPhoto(data.id), 60);
    }

    if (type === "device") {
        const osMeta = getOSIcon(data.operatingSystem);
        const osLabel = osMeta ? `<i class="${osMeta.icon}" style="color:${osMeta.color};margin-right:6px"></i>${escHtml(data.operatingSystem || "Unknown")}` : escHtml(data.operatingSystem || "Unknown");
        pushRow("Operating system", osLabel);
        pushRow("Version", escHtml(data.operatingSystemVersion));
        pushRow("Display name", escHtml(data.displayName));
        pushRow("Trust type", escHtml(data.trustType));
        pushRow("Compliant", yesNo(data.isCompliant));
        pushRow("Managed", yesNo(data.isManaged));
        pushRow("Device ID", escHtml(data.deviceId), true);
        pushRow("Object ID", escHtml(data.id), true);
    }

    if (type === "app") {
        pushRow("Publisher", escHtml(data.publisher || data.publisherName));
        pushRow("App type", escHtml(data["@odata.type"] || data.servicePrincipalType));
        pushRow("Description", escHtml(data.description));
        pushRow("App ID", escHtml(data.appId), true);
        pushRow("Object ID", escHtml(data.id), true);
    }

    if (type === "ca_policy") {
        const stateMap = {
            enabled: '<span class="sb on">Enabled</span>',
            disabled: '<span class="sb off">Disabled</span>',
            enabledForReportingButNotEnforced: '<span class="sb report">Report-only</span>',
        };
        const conditions = data.conditions || {};
        const apps = conditions.applications?.includeApplications || [];
        const platforms = conditions.platforms?.includePlatforms || [];
        const controls = data.grantControls?.builtInControls || [];
        pushRow("Status", stateMap[data.state] || escHtml(data.state));
        if (apps.length) pushRow("Apps", apps.includes("All") ? "All apps" : `${apps.length} app(s)`);
        if (platforms.length) pushRow("Platforms", escHtml(platforms.join(", ")));
        if (controls.length) pushRow("Required controls", escHtml(controls.join(", ")));
        if (data.grantControls?.operator) pushRow("Operator", escHtml(data.grantControls.operator));
        pushRow("Object ID", escHtml(data.id), true);
    }

    const portalUrl = getPortalUrl(type, data.id);
    if (data.id) {
        rows.push(`
            <div class="dp-actions">
                ${portalUrl ? `<a class="dp-action-btn" href="${portalUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square"></i> Open in Entra portal</a>` : ""}
                <button class="dp-action-btn" type="button" data-copy-id="${escHtml(data.id)}" onclick="copyIdFromBtn(this)"><i class="fas fa-copy"></i> Copy object ID</button>
            </div>
        `);
    }

    return rows.join("") || '<p style="color:var(--text-muted);font-size:.82rem;">No details available</p>';
}

function renderDetailPanel(data) {
    const panel = getElement("detail-panel");
    const divider = getElement("detail-divider");
    const badgeWrap = getElement("detail-badge-wrap");
    const name = getElement("detail-name");
    const body = getElement("detail-body");
    const tip = getElement("left-tip");
    if (!panel || !divider || !badgeWrap || !name || !body) return;

    const type = data.type;
    const meta = TYPE_META[type] || { label: type, icon: "fa-circle" };
    badgeWrap.innerHTML = `<span class="type-badge ${type}"><i class="fas ${meta.icon}"></i> ${meta.label}</span>`;
    name.textContent = data.fullLabel || data.label || "";
    body.innerHTML = buildDetailRows(type, data);
    panel.classList.remove("d-none");
    divider.classList.remove("d-none");
    if (tip) tip.style.display = "none";

    if (type === "group" && data.id) {
        bindDetailTabs();
        loadGroupImpact(data.id);
    }
}

function copyIdFromBtn(button) {
    const value = button?.dataset?.copyId;
    if (!value) return;
    navigator.clipboard.writeText(value)
        .then(() => showToast("Object ID copied", "info"))
        .catch(() => showToast("Clipboard copy failed", "error"));
}

window.copyIdFromBtn = copyIdFromBtn;
window.exportGroupImpactReport = exportGroupImpactReport;
window.exportGroupImpactCsv = exportGroupImpactCsv;

function exportCurrentGraph() {
    if (!lastGraphData) {
        showToast("No graph data to export yet", "error");
        return;
    }

    const payload = {
        exportedAt: new Date().toISOString(),
        summary: {
            nodes: lastGraphData.nodes?.length || 0,
            edges: lastGraphData.edges?.length || 0,
        },
        graph: lastGraphData,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `entramap-export-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Graph exported as JSON", "info");
}

function bindToolbar() {
    getElement("btn-fit")?.addEventListener("click", () => {
        fitGraphInView();
    });

    getElement("btn-reset-layout")?.addEventListener("click", () => runLayout(true));
    getElement("btn-export-json")?.addEventListener("click", exportCurrentGraph);
    getElement("btn-refresh")?.addEventListener("click", () => {
        if (!lastLoadedType || !lastLoadedId) return;
        showToast("Reloading from Microsoft Graph...", "info");
        loadMap(lastLoadedType, lastLoadedId);
    });

    getElement("btn-deep-refresh")?.addEventListener("click", async () => {
        if (!lastLoadedType || !lastLoadedId || deepRefreshBusy) return;
        deepRefreshBusy = true;
        const refreshBtn = getElement("btn-refresh");
        const deepBtn = getElement("btn-deep-refresh");
        if (refreshBtn) refreshBtn.disabled = true;
        if (deepBtn) deepBtn.disabled = true;
        try {
            showToast("Deep refresh started (3 rounds)", "info");
            for (let index = 1; index <= 3; index += 1) {
                showToast(`Deep refresh ${index}/3`, "info");
                await loadMap(lastLoadedType, lastLoadedId);
                if (index < 3) await waitMs(1800);
            }
            showToast("Deep refresh completed", "info");
        } finally {
            deepRefreshBusy = false;
            setControlsDisabled(false);
        }
    });
}

function bindDisconnectLightbox() {
    const disconnectBtn = getElement("disconnect-btn");
    const lightbox = getElement("disconnect-lightbox");
    const cancelBtn = getElement("lb-cancel");
    const confirmBtn = getElement("lb-confirm");
    if (!disconnectBtn || !lightbox || !cancelBtn || !confirmBtn) return;

    disconnectBtn.addEventListener("click", () => {
        lightbox.classList.remove("d-none");
        confirmBtn.focus();
    });

    cancelBtn.addEventListener("click", () => lightbox.classList.add("d-none"));
    lightbox.addEventListener("click", event => {
        if (event.target === lightbox) lightbox.classList.add("d-none");
    });
    confirmBtn.addEventListener("click", () => {
        try { localStorage.clear(); } catch (_) {}
        try { sessionStorage.clear(); } catch (_) {}
        window.location.href = "/auth/disconnect";
    });
}

function renderSessionCountdown() {
    const counter = getElement("st-countdown");
    if (!counter) return;
    counter.textContent = String(Math.max(0, sessionSecondsLeft));
    counter.classList.toggle("danger", sessionSecondsLeft <= 10);
}

function forceSessionSignOut() {
    window.location.href = "/auth/signout";
}

function ensureSessionTimeoutLightbox() {
    let lightbox = getElement("session-timeout-lightbox");
    if (lightbox) return lightbox;

    lightbox = document.createElement("div");
    lightbox.id = "session-timeout-lightbox";
    lightbox.className = "st-backdrop";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-labelledby", "st-title");
    lightbox.innerHTML = `
        <div class="st-card">
            <div class="st-icon"><i class="fas fa-hourglass-half"></i></div>
            <h3 id="st-title">Session timeout</h3>
            <p>No activity detected. You will be signed out automatically.</p>
            <div id="st-countdown" class="st-countdown" aria-live="assertive">60</div>
            <div class="st-caption">seconds remaining</div>
        </div>
    `;
    document.body.appendChild(lightbox);
    return lightbox;
}

function clearSessionWarning(resetTimer = true) {
    const app = getElement("app");
    const lightbox = getElement("session-timeout-lightbox");

    sessionWarningActive = false;
    sessionSecondsLeft = SESSION_WARNING_SECONDS;

    if (sessionCountdownTimer) {
        window.clearInterval(sessionCountdownTimer);
        sessionCountdownTimer = null;
    }

    if (app) app.classList.remove("session-timeout-dim");
    if (lightbox) {
        lightbox.classList.add("d-none");
        lightbox.style.display = "";
    }

    renderSessionCountdown();
    if (resetTimer) scheduleSessionTimeoutWarning();
}

function beginSessionWarning() {
    if (!APP_CONTEXT.signedIn || sessionWarningActive) return;

    sessionWarningActive = true;
    sessionSecondsLeft = SESSION_WARNING_SECONDS;

    const app = getElement("app");
    const lightbox = ensureSessionTimeoutLightbox();
    if (app) app.classList.add("session-timeout-dim");
    if (lightbox) {
        lightbox.classList.remove("d-none");
        lightbox.style.display = "flex";
        lightbox.style.zIndex = "2200";
    }

    renderSessionCountdown();
    if (sessionCountdownTimer) window.clearInterval(sessionCountdownTimer);
    sessionCountdownTimer = window.setInterval(() => {
        sessionSecondsLeft -= 1;
        renderSessionCountdown();
        if (sessionSecondsLeft <= 0) {
            if (sessionCountdownTimer) {
                window.clearInterval(sessionCountdownTimer);
                sessionCountdownTimer = null;
            }
            forceSessionSignOut();
        }
    }, 1000);
}

function scheduleSessionTimeoutWarning() {
    if (!APP_CONTEXT.signedIn) return;
    if (sessionIdleTimer) window.clearTimeout(sessionIdleTimer);

    const warnAtMs = SESSION_IDLE_TIMEOUT_MS - (SESSION_WARNING_SECONDS * 1000);
    sessionIdleTimer = window.setTimeout(beginSessionWarning, warnAtMs);
}

function registerSessionActivity() {
    if (!APP_CONTEXT.signedIn) return;
    if (sessionWarningActive) {
        clearSessionWarning(true);
        return;
    }
    scheduleSessionTimeoutWarning();
}

function setupSessionTimeout() {
    if (!APP_CONTEXT.signedIn) return;

    ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(eventName => {
        document.addEventListener(eventName, registerSessionActivity, { passive: true });
    });

    window.addEventListener("beforeunload", () => {
        if (sessionIdleTimer) window.clearTimeout(sessionIdleTimer);
        if (sessionCountdownTimer) window.clearInterval(sessionCountdownTimer);
    });

    scheduleSessionTimeoutWarning();
}

function bindSearchUi() {
    document.querySelectorAll(".search-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (tab.disabled) return;
            document.querySelectorAll(".search-tab").forEach(item => item.classList.remove("active"));
            tab.classList.add("active");
            searchType = tab.dataset.type || "user";
            clearSearchResults();
            const input = getElement("search-input");
            if (input) {
                input.value = "";
                input.placeholder = SEARCH_PLACEHOLDERS[searchType] || "Search...";
                input.focus();
            }
        });
    });

    const input = getElement("search-input");
    if (!input) return;

    input.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => performSearch(input.value.trim()), 320);
    });

    input.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            clearSearchResults();
            input.blur();
        }
    });
}

function bindDetailAndRail() {
    getElement("detail-close")?.addEventListener("click", hideDetailPanel);
    getElement("rr-reset")?.addEventListener("click", () => {
        if (!cy || !lastLoadedId) return;
        const node = cy.getElementById(lastLoadedId);
        if (!node || !node.length) return;
        setActiveNode(lastLoadedId);
        renderDetailPanel(node.data());
        cy.fit(node.closedNeighborhood(), 80);
    });
}

function bindInsightButtons() {
    getElement("insight-unmanaged")?.addEventListener("click", () => {
        if (!lastGraphData) return;
        applyFocusFilterByIds((lastGraphData.nodes || []).filter(node => node.type === "device" && node.data?.isManaged === false).map(node => node.id));
    });

    getElement("insight-noncompliant")?.addEventListener("click", () => {
        if (!lastGraphData) return;
        applyFocusFilterByIds((lastGraphData.nodes || []).filter(node => node.type === "device" && node.data?.isCompliant === false).map(node => node.id));
    });

    getElement("insight-reset")?.addEventListener("click", () => {
        clearFocusFilter();
        fitGraphInView();
    });
}

function runHealthCheck() {
    fetch("/api/health")
        .then(response => response.json())
        .then(data => {
            if (data?.status && data.status !== "ok") showToast(data.message || "Backend not healthy", "error");
        })
        .catch(() => {
        });
}

document.addEventListener("DOMContentLoaded", () => {
    initCytoscape();
    setupAuthOverlayTabs();
    setupAuthPermissionAccordion();
    setupMicrosoftSignInPopup();
    bindDisconnectLightbox();
    bindToolbar();
    bindSearchUi();
    bindDetailAndRail();
    bindInsightButtons();
    setupSessionTimeout();

    if (APP_CONTEXT.signedIn) {
        enableSignedInMode();
    } else {
        enableSignedOutMode();
    }

    runHealthCheck();
});
