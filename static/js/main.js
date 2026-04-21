"use strict";

const APP_CONTEXT = window.APP_CONTEXT || { signedIn: false, version: "0.3.15" };

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
    cy.elements().remove();
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

    cy.layout({
        name: "breadthfirst",
        roots: root && root.length ? [root.id()] : undefined,
        directed: false,
        padding: 60,
        spacingFactor: 1.6,
        animate,
        animationDuration: animate ? 420 : 0,
        fit: true,
    }).run();
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
    runLayout(true);
    hydrateGraphPhotos(data.nodes || []);

    if (lastLoadedId) {
        const rootNode = cy.getElementById(lastLoadedId);
        if (rootNode && rootNode.length) {
            setActiveNode(lastLoadedId);
            renderDetailPanel(rootNode.data());
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
            showToast("Intune permissions vernieuwen...", "info");
            window.openEntraMapConsentPopup(data.reauth_url);
            renderSearchError("Bevestig permissies in het popupvenster en probeer daarna opnieuw.");
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
        pushRow("Description", escHtml(data.description));
        pushRow("Type", escHtml(groupTypes.join(", ")) || "—");
        pushRow("Object ID", escHtml(data.id), true);
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
}

function copyIdFromBtn(button) {
    const value = button?.dataset?.copyId;
    if (!value) return;
    navigator.clipboard.writeText(value)
        .then(() => showToast("Object ID copied", "info"))
        .catch(() => showToast("Clipboard copy failed", "error"));
}

window.copyIdFromBtn = copyIdFromBtn;

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
        if (cy && cy.nodes().length) cy.fit(undefined, 40);
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
            showToast("Deep refresh gestart (3 rondes)", "info");
            for (let index = 1; index <= 3; index += 1) {
                showToast(`Deep refresh ${index}/3`, "info");
                await loadMap(lastLoadedType, lastLoadedId);
                if (index < 3) await waitMs(1800);
            }
            showToast("Deep refresh voltooid", "info");
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
        if (cy && cy.nodes().length) cy.fit(undefined, 50);
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
    setupMicrosoftSignInPopup();
    bindDisconnectLightbox();
    bindToolbar();
    bindSearchUi();
    bindDetailAndRail();
    bindInsightButtons();

    if (APP_CONTEXT.signedIn) {
        enableSignedInMode();
    } else {
        enableSignedOutMode();
    }

    runHealthCheck();
});
