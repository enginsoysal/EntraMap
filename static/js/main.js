"use strict";

const APP_CONTEXT = window.APP_CONTEXT || { signedIn: false, version: "0.4.14" };

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
let lastGroupMapMode = "standard";
const IMPACT_FILTER_STORAGE_KEY = "entramap_impact_filter_profile_v1";
let impactFilterState = {
    domain: "all",
    severities: {
        blocker: true,
        warning: true,
    },
    explainMode: true,
};
let groupImpactRequestId = 0;
const groupImpactCache = new Map();
let lastGroupCompareState = null;

const TUTORIAL_STORAGE_KEY = "entramap_tutorial_progress_v1";
let tutorialState = {
    active: false,
    phaseKey: "",
    stepIndex: 0,
    coachEl: null,
    highlightedEl: null,
    cleanupHandlers: [],
    waitTimer: null,
    lastRenderedStepKey: "",
    lastCopiedId: "",
    progress: {},
};

const TUTORIAL_PHASES = {
    basic: {
        title: "Basic",
        steps: [
            {
                title: "Select User",
                body: "Start in User view so you can learn the default identity-to-relationship workflow first.",
                selector: ".search-tab[data-type='user']",
                action: "click",
            },
            {
                title: "Search by name",
                body: "Type engin to simulate a user lookup and see how search results feed the graph drilldown flow.",
                selector: "#search-input",
                action: "input",
                contains: "engin",
            },
            {
                title: "Open identity",
                body: "Open the demo user result so the graph and detail pane can show direct relationships for one identity.",
                selector: ".sr-item[data-tutorial-result='user']",
                action: "click",
                completeBy: { loadedType: "user", loadedId: "tutorial-user-1" },
            },
            {
                title: "Inspect linked objects",
                body: "Open the linked group so you can pivot from one object to a connected object without running a new search.",
                selector: ".rr-chip[data-node-id='tutorial-group-1']",
                action: "click",
                completeBy: { activeNodeId: "tutorial-group-1" },
            },
            {
                title: "Copy object ID",
                body: "Copy the object ID so you know where to grab stable identifiers for audits, scripts, or handover notes.",
                selector: ".dp-action-btn[data-copy-id='tutorial-group-1']",
                action: "click",
            },
            {
                title: "Return to root",
                body: "Reset the linked-object focus so you can return to the original graph anchor after a pivot.",
                selector: "#rr-reset",
                action: "click",
                completeBy: { activeNodeId: "tutorial-user-1" },
            },
            {
                title: "Fit your view",
                body: "Fit the graph so you can reframe the whole relationship set after navigation or filtering.",
                selector: "#btn-fit",
                action: "click",
            },
            {
                title: "Export graph JSON",
                body: "Export the visible graph as JSON so you can capture the current relationship context for reporting or reuse.",
                selector: "#btn-export-json",
                action: "click",
            },
        ],
    },
    advanced: {
        title: "Advanced",
        steps: [
            {
                title: "Switch to Group",
                body: "Switch to Group view because delete-impact and governance analysis starts from group objects, not individual users.",
                selector: ".search-tab[data-type='group']",
                action: "click",
            },
            {
                title: "Search Tier-0 group",
                body: "Search for tier0 to load a high-risk demo group and practice impact analysis on a realistic critical object.",
                selector: "#search-input",
                action: "input",
                containsAny: ["tier0", "tier-0"],
            },
            {
                title: "Open group context",
                body: "Open the group result so the detail pane can expose delete-risk controls, exports, and map actions.",
                selector: ".sr-item[data-tutorial-result='group']",
                action: "click",
                completeBy: { loadedType: "group", loadedId: "tutorial-group-1" },
            },
            {
                title: "Open Impact tab",
                body: "Open the Impact tab to move from object metadata into dependency, risk, and remediation analysis.",
                selector: ".dp-tab[data-dp-tab='impact']",
                action: "click",
                completeBy: { activeDetailTab: "impact" },
            },
            {
                title: "Export impact report",
                body: "Export the impact report to capture the current delete-risk evidence as a handover or CAB-ready artifact.",
                selector: ".dp-action-btn[onclick*='exportGroupImpactReport']",
                action: "click",
            },
            {
                title: "Load impact graph",
                body: "Load the impact graph so you can see the same delete-risk findings as connected visual dependencies.",
                selector: "#btn-load-impact-map",
                action: "click",
                completeBy: { loadedType: "group", loadedId: "tutorial-group-1", groupMapMode: "impact" },
            },
            {
                title: "Run map compare",
                body: "Compare maps so you can spot what changes when you move from the standard relationship view to the impact projection.",
                selector: ".dp-action-btn[onclick*='compareGroupMaps']",
                action: "click",
            },
            {
                title: "Open impact from compare",
                body: "Open the impact side from compare so you can jump from summary deltas back into the actionable graph view.",
                selector: "#gi-compare-open-impact",
                action: "click",
            },
            {
                title: "Export compare",
                body: "Export the compare result as JSON so the exact standard-vs-impact delta can be reused outside the app.",
                selector: "#gi-compare-export-json",
                action: "click",
            },
            {
                title: "Export compare CSV",
                body: "Export the compare result as CSV to finish the workflow with a spreadsheet-friendly governance output.",
                selector: "#gi-compare-export-csv",
                action: "click",
            },
        ],
    },
    expert: {
        title: "Expert",
        steps: [
            {
                title: "Switch to Group",
                body: "Start from Group view again so this Expert track can focus on high-impact operator actions from a clean state.",
                selector: ".search-tab[data-type='group']",
                action: "click",
            },
            {
                title: "Search Tier-0 group",
                body: "Search tier0 or tier-0 to load the demo critical group used for advanced risk and remediation exercises.",
                selector: "#search-input",
                action: "input",
                containsAny: ["tier0", "tier-0"],
            },
            {
                title: "Open group context",
                body: "Open the group result so you can move between metadata, impact analysis, filters, and compare actions.",
                selector: ".sr-item[data-tutorial-result='group']",
                action: "click",
                completeBy: { loadedType: "group", loadedId: "tutorial-group-1" },
            },
            {
                title: "Back to Details",
                body: "Return to Details so you can see the split between plain object metadata and the impact-specific analysis area.",
                selector: ".dp-tab[data-dp-tab='details']",
                action: "click",
                completeBy: { activeDetailTab: "details" },
            },
            {
                title: "Open Impact tab",
                body: "Switch back to Impact because the next actions use risk projection and remediation-focused data rather than metadata.",
                selector: ".dp-tab[data-dp-tab='impact']",
                action: "click",
                completeBy: { activeDetailTab: "impact" },
            },
            {
                title: "Load impact map",
                body: "Load the impact graph to convert the delete analysis into a dependency map you can visually inspect and filter.",
                selector: "#btn-load-impact-map",
                action: "click",
                completeBy: { loadedType: "group", loadedId: "tutorial-group-1", groupMapMode: "impact" },
            },
            {
                title: "Focus unmanaged",
                body: "Focus unmanaged devices so you can isolate one operational risk slice instead of reading the whole graph at once.",
                selector: "#insight-unmanaged",
                action: "click",
            },
            {
                title: "Focus non-compliant",
                body: "Switch to non-compliant devices to compare another risk lens without leaving the current investigation flow.",
                selector: "#insight-noncompliant",
                action: "click",
            },
            {
                title: "Reset focus",
                body: "Reset focus so the full graph comes back before you export or compare the current view.",
                selector: "#insight-reset",
                action: "click",
            },
            {
                title: "Export filtered view",
                body: "Export the visible graph view so you can share exactly what is on screen after filtering and investigation.",
                selector: "#btn-export-view-json",
                action: "click",
            },
            {
                title: "Run map compare",
                body: "Run compare to quantify the delta between the operational graph and the impact-driven graph.",
                selector: ".dp-action-btn[onclick*='compareGroupMaps']",
                action: "click",
            },
            {
                title: "Fit graph",
                body: "Fit the graph to close the Expert scenario with a clean, full-context visual reset.",
                selector: "#btn-fit",
                action: "click",
            },
        ],
    },
    god_mode: {
        title: "God Mode",
        steps: [
            {
                title: "Device investigation",
                body: "Start in Device view so you can investigate endpoint posture before pivoting into apps and policies.",
                selector: ".search-tab[data-type='device']",
                action: "click",
            },
            {
                title: "Search endpoint",
                body: "Search win11 to load a demo endpoint and practice device-centric investigation with safe tutorial data.",
                selector: "#search-input",
                action: "input",
                contains: "win11",
            },
            {
                title: "Open endpoint",
                body: "Open the endpoint so you can inspect how device posture connects to the rest of the relationship graph.",
                selector: ".sr-item[data-tutorial-result='device']",
                action: "click",
                completeBy: { loadedType: "device", loadedId: "tutorial-device-1" },
            },
            {
                title: "Copy device ID",
                body: "Copy the device object ID so you know where to grab a stable endpoint identifier for automation or tickets.",
                selector: ".dp-action-btn[data-copy-id='tutorial-device-1']",
                action: "click",
                completeBy: { copiedId: "tutorial-device-1" },
            },
            {
                title: "Reset layout",
                body: "Recalculate the layout so you can recover a readable graph after pivots, filters, or dense node clusters.",
                selector: "#btn-reset-layout",
                action: "click",
            },
            {
                title: "App-pivot",
                body: "Pivot to App view so you can move from endpoint context into application exposure and assignment context.",
                selector: ".search-tab[data-type='app']",
                action: "click",
            },
            {
                title: "Type app query",
                body: "Search portal to load the demo enterprise app and continue the cross-object investigation flow.",
                selector: "#search-input",
                action: "input",
                containsAny: ["portal", "app query", "app"],
            },
            {
                title: "Open app context",
                body: "Open the app result so you can inspect how enterprise applications connect to users, groups, and policies.",
                selector: ".sr-item[data-tutorial-result='app']",
                action: "click",
                completeBy: { loadedType: "app", loadedId: "tutorial-app-1" },
            },
            {
                title: "Copy app ID",
                body: "Copy the app object ID so you can capture a stable application identifier for follow-up work.",
                selector: ".dp-action-btn[data-copy-id='tutorial-app-1']",
                action: "click",
                completeBy: { copiedId: "tutorial-app-1" },
            },
            {
                title: "CA policy pivot",
                body: "Switch to CA Policy view so the final part of the walkthrough covers conditional access enforcement paths.",
                selector: ".search-tab[data-type='ca_policy']",
                action: "click",
            },
            {
                title: "Type policy query",
                body: "Search mfa to load a demo policy and see how access controls fit into the same investigation workflow.",
                selector: "#search-input",
                action: "input",
                contains: "mfa",
            },
            {
                title: "Open policy context",
                body: "Open the policy result to finish the drilldown with a policy object and its relationship context.",
                selector: ".sr-item[data-tutorial-result='ca_policy']",
                action: "click",
                completeBy: { loadedType: "ca_policy", loadedId: "tutorial-cap-1" },
            },
            {
                title: "Final fit",
                body: "Fit the graph to finish God Mode with the full final context visible on one screen.",
                selector: "#btn-fit",
                action: "click",
            },
        ],
    },
};

const TUTORIAL_IMPACT_RESULT = {
    group: {
        id: "tutorial-group-1",
        displayName: "Tier0-Identity-Operators (Tutorial)",
    },
    summary: {
        blockers: 1,
        warnings: 2,
        domainsWithHits: 3,
        domainsChecked: 8,
        riskScore: 72,
        riskLevel: "blocked",
        riskLabel: "Blocked",
        recommendation: "Do not delete this group until CA scope, app access, and nested dependency findings are remediated.",
        coverageScore: 88,
        confidence: "high",
        partialDomains: 1,
        completeness: {
            domainsOk: 7,
            domainsTotal: 8,
            constrainedDomains: [
                { key: "exchange_workloads", label: "Exchange Workloads" },
            ],
        },
    },
    domains: [
        {
            key: "conditional_access",
            label: "Conditional Access",
            status: "ok",
            count: 1,
            details: "One admin MFA policy includes this group in scope.",
            findings: [
                {
                    severity: "blocker",
                    impact: "included scope",
                    name: "Require MFA for Admins",
                    id: "tutorial-cap-1",
                },
            ],
        },
        {
            key: "enterprise_apps",
            label: "Enterprise Applications",
            status: "ok",
            count: 1,
            details: "The group is used for app access assignment.",
            findings: [
                {
                    severity: "warning",
                    impact: "app role assignment",
                    name: "Privileged Access Portal",
                    id: "tutorial-app-1",
                },
            ],
        },
        {
            key: "group_nesting",
            label: "Group Nesting",
            status: "ok",
            count: 1,
            details: "This group is linked to another administrative path.",
            findings: [
                {
                    severity: "warning",
                    impact: "member of group",
                    name: "Identity Admin Breakglass Chain",
                    id: "tutorial-nested-group-1",
                },
            ],
        },
        {
            key: "exchange_workloads",
            label: "Exchange Workloads",
            status: "partial",
            count: 0,
            details: "Tutorial mode simulates a partially readable workload domain.",
            findings: [],
        },
    ],
};

const TUTORIAL_DUMMY_RESULTS = {
    user: { id: "tutorial-user-1", type: "user", label: "Engin Soysal (Tutorial)", subtitle: "engin.soysal@tutorial.local", tutorialKey: "user" },
    group: { id: "tutorial-group-1", type: "group", label: "Tier0-Identity-Operators (Tutorial)", subtitle: "High-impact governance group", tutorialKey: "group" },
    device: { id: "tutorial-device-1", type: "device", label: "WIN11-OPS-001 (Tutorial)", subtitle: "Unmanaged + non-compliant", tutorialKey: "device" },
    app: { id: "tutorial-app-1", type: "app", label: "Privileged Access Portal (Tutorial)", subtitle: "Enterprise app pivot", tutorialKey: "app" },
    ca_policy: { id: "tutorial-cap-1", type: "ca_policy", label: "Require MFA for Admins (Tutorial)", subtitle: "Conditional Access policy", tutorialKey: "ca_policy" },
};

const TUTORIAL_DUMMY_GRAPHS = {
    user: {
        nodes: [
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: { upn: "engin.soysal@tutorial.local" } },
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
            { id: "tutorial-device-1", label: "WIN11-OPS-001", type: "device", data: { operatingSystem: "Windows", isManaged: false, isCompliant: false } },
            { id: "tutorial-app-1", label: "Privileged Access Portal", type: "app", data: {} },
            { id: "tutorial-cap-1", label: "Require MFA for Admins", type: "ca_policy", data: {} },
        ],
        edges: [
            { source: "tutorial-user-1", target: "tutorial-group-1", label: "Member of" },
            { source: "tutorial-user-1", target: "tutorial-device-1", label: "Primary device" },
            { source: "tutorial-group-1", target: "tutorial-app-1", label: "App assignment" },
            { source: "tutorial-group-1", target: "tutorial-cap-1", label: "Included scope", scopeKind: "include" },
        ],
    },
    group_standard: {
        nodes: [
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: {} },
            { id: "tutorial-app-1", label: "Privileged Access Portal", type: "app", data: {} },
            { id: "tutorial-cap-1", label: "Require MFA for Admins", type: "ca_policy", data: {} },
        ],
        edges: [
            { source: "tutorial-user-1", target: "tutorial-group-1", label: "Member of" },
            { source: "tutorial-group-1", target: "tutorial-app-1", label: "App role assignment" },
            { source: "tutorial-group-1", target: "tutorial-cap-1", label: "Included scope", scopeKind: "include" },
        ],
    },
    group_impact: {
        nodes: [
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: {} },
            { id: "tutorial-cap-1", label: "Require MFA for Admins", type: "ca_policy", data: { impactNode: 1, impactSeverity: "blocker", impactDomainKey: "conditional_access" } },
            { id: "tutorial-app-1", label: "Privileged Access Portal", type: "app", data: { impactNode: 1, impactSeverity: "warning", impactDomainKey: "enterprise_apps" } },
            { id: "tutorial-device-1", label: "WIN11-OPS-001", type: "device", data: { operatingSystem: "Windows", isManaged: false, isCompliant: false } },
        ],
        edges: [
            { source: "tutorial-group-1", target: "tutorial-cap-1", label: "Included scope", scopeKind: "include", impactEdge: 1, impactSeverity: "blocker", impactDomainKey: "conditional_access" },
            { source: "tutorial-group-1", target: "tutorial-app-1", label: "App role assignment", impactEdge: 1, impactSeverity: "warning", impactDomainKey: "enterprise_apps" },
            { source: "tutorial-user-1", target: "tutorial-device-1", label: "Primary device" },
        ],
    },
    device: {
        nodes: [
            { id: "tutorial-device-1", label: "WIN11-OPS-001", type: "device", data: { operatingSystem: "Windows", isManaged: false, isCompliant: false } },
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: {} },
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
        ],
        edges: [
            { source: "tutorial-user-1", target: "tutorial-device-1", label: "Primary device" },
            { source: "tutorial-user-1", target: "tutorial-group-1", label: "Member of" },
        ],
    },
    app: {
        nodes: [
            { id: "tutorial-app-1", label: "Privileged Access Portal", type: "app", data: {} },
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: {} },
        ],
        edges: [
            { source: "tutorial-group-1", target: "tutorial-app-1", label: "App role assignment" },
            { source: "tutorial-user-1", target: "tutorial-group-1", label: "Member of" },
        ],
    },
    ca_policy: {
        nodes: [
            { id: "tutorial-cap-1", label: "Require MFA for Admins", type: "ca_policy", data: {} },
            { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", data: {} },
            { id: "tutorial-user-1", label: "Engin Soysal", type: "user", data: {} },
        ],
        edges: [
            { source: "tutorial-group-1", target: "tutorial-cap-1", label: "Included scope", scopeKind: "include" },
            { source: "tutorial-user-1", target: "tutorial-group-1", label: "Member of" },
        ],
    },
};

const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_WARNING_SECONDS = 60;
let sessionIdleTimer = null;
let sessionCountdownTimer = null;
let sessionSecondsLeft = SESSION_WARNING_SECONDS;
let sessionWarningActive = false;

const KONAMI_SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konamiProgress = 0;
let konamiResetTimer = null;

let asteroidsActive = false;
let asteroidsKeys = {};
let asteroidsRaf = null;
let asteroidsUi = null;
let asteroidsState = null;

function getElement(id) {
    return document.getElementById(id);
}

function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

function loadTutorialProgress() {
    try {
        const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveTutorialProgress() {
    try {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(tutorialState.progress || {}));
    } catch (_) {
    }
}

function clearTutorialBindings() {
    if (tutorialState.waitTimer) {
        window.clearInterval(tutorialState.waitTimer);
        tutorialState.waitTimer = null;
    }
    tutorialState.cleanupHandlers.forEach(fn => {
        try { fn(); } catch (_) {}
    });
    tutorialState.cleanupHandlers = [];
}

function clearTutorialHighlight() {
    if (tutorialState.highlightedEl) {
        tutorialState.highlightedEl.classList.remove("tutorial-highlight");
    }
    tutorialState.highlightedEl = null;
}

function getCurrentTutorialPhase() {
    return TUTORIAL_PHASES[tutorialState.phaseKey] || null;
}

function getCurrentTutorialStep() {
    const phase = getCurrentTutorialPhase();
    if (!phase) return null;
    return phase.steps[tutorialState.stepIndex] || null;
}

function updateTutorialLauncherBadge() {
    const badge = getElement("tutorial-launch-status");
    if (!badge) return;

    if (tutorialState.active) {
        const phase = getCurrentTutorialPhase();
        const totalSteps = phase?.steps?.length || 1;
        const currentStep = Math.min(tutorialState.stepIndex + 1, totalSteps);
        badge.textContent = `${phase?.title || "Tutorial"}: ${currentStep}/${totalSteps}`;
        badge.classList.add("is-active");
        return;
    }

    badge.textContent = "No tutorial running";
    badge.classList.remove("is-active");
}

function updateSignedOutTutorialBanner() {
    const banner = getElement("tutorial-signedout-banner");
    if (!banner) return;
    const show = !APP_CONTEXT.signedIn && tutorialState.active;
    banner.classList.toggle("d-none", !show);
}

function syncTutorialProgressFromState() {
    if (!tutorialState.active) return;
    const step = getCurrentTutorialStep();
    if (!step || !isTutorialStepAlreadySatisfied(step)) return;
    advanceTutorialStep();
}

function getTutorialStepNarrative(step) {
    const explicitWhat = String(step?.what || "").trim();
    const explicitWhy = String(step?.why || "").trim();
    if (explicitWhat || explicitWhy) {
        return {
            what: explicitWhat || String(step?.body || "").trim() || "Perform the requested action.",
            why: explicitWhy || "This step moves you to the next part of the workflow.",
        };
    }

    const raw = String(step?.body || "").trim();
    if (!raw) {
        return {
            what: "Perform the requested action.",
            why: "This step moves you to the next part of the workflow.",
        };
    }

    const lower = raw.toLowerCase();
    const splitHints = [" so that ", " so you can ", " because "];
    for (const hint of splitHints) {
        const idx = lower.indexOf(hint);
        if (idx > 0) {
            const left = raw.slice(0, idx).trim().replace(/[.,;:]$/, "");
            const right = raw.slice(idx + hint.length).trim();
            if (left && right) {
                return {
                    what: left,
                    why: right.charAt(0).toUpperCase() + right.slice(1),
                };
            }
        }
    }

    const sentenceSplit = raw.split(/\.\s+/).map(value => value.trim()).filter(Boolean);
    if (sentenceSplit.length >= 2) {
        return {
            what: sentenceSplit[0],
            why: sentenceSplit.slice(1).join(". "),
        };
    }

    return {
        what: raw,
        why: "This step moves you to the next part of the workflow.",
    };
}

function ensureTutorialCoach() {
    if (tutorialState.coachEl) return tutorialState.coachEl;

    const coach = document.createElement("div");
    coach.id = "tutorial-coach";
    coach.className = "tutorial-coach d-none";
    coach.innerHTML = `
        <div class="tutorial-head">
            <div class="tutorial-phase" id="tutorial-phase-label">Tutorial</div>
            <div class="tutorial-progress" id="tutorial-progress-label">1/1</div>
        </div>
        <div class="tutorial-step-title" id="tutorial-step-title">Step</div>
        <div class="tutorial-step-sections">
            <div class="tutorial-step-block">
                <div class="tutorial-step-label">What this does</div>
                <div class="tutorial-step-body" id="tutorial-step-what">Do this action.</div>
            </div>
            <div class="tutorial-step-block">
                <div class="tutorial-step-label">Why it matters</div>
                <div class="tutorial-step-body" id="tutorial-step-why">This step moves you forward in the workflow.</div>
            </div>
        </div>
        <div class="tutorial-scroll-hint d-none" id="tutorial-scroll-hint">
            <i class="fas fa-arrow-down"></i>
            <span id="tutorial-scroll-hint-text">Scroll to find the target.</span>
        </div>
        <div class="tutorial-actions">
            <button class="tutorial-btn" id="tutorial-back" type="button">Back</button>
            <button class="tutorial-btn accent" id="tutorial-find-target" type="button">Find it ✨</button>
            <button class="tutorial-btn" id="tutorial-skip" type="button">Stop</button>
            <button class="tutorial-btn primary" id="tutorial-next" type="button">Next</button>
        </div>
    `;

    document.body.appendChild(coach);
    tutorialState.coachEl = coach;

    const backButton = coach.querySelector("#tutorial-back");
    const findButton = coach.querySelector("#tutorial-find-target");
    const skipButton = coach.querySelector("#tutorial-skip");
    const nextButton = coach.querySelector("#tutorial-next");

    backButton?.addEventListener("click", () => {
        if (!tutorialState.active || tutorialState.stepIndex <= 0) return;
        tutorialState.stepIndex -= 1;
        renderTutorialStep();
    });

    skipButton?.addEventListener("click", () => {
        stopTutorial("Tutorial stopped.", { fromUserStop: true });
    });

    findButton?.addEventListener("click", () => {
        const step = getCurrentTutorialStep();
        if (!step?.selector) return;
        const target = document.querySelector(step.selector);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        positionTutorialCoach();
    });

    nextButton?.addEventListener("click", () => {
        const step = getCurrentTutorialStep();
        if (!step) return;
        if (step.action !== "manual") return;
        advanceTutorialStep();
    });

    const reposition = () => {
        if (tutorialState.active) positionTutorialCoach();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return coach;
}

function positionTutorialCoach() {
    const coach = tutorialState.coachEl;
    if (!coach) return;

    const target = tutorialState.highlightedEl;
    if (!target) {
        coach.style.width = "min(360px, calc(100vw - 20px))";
        coach.style.maxHeight = "min(370px, calc(100vh - 20px))";
        coach.style.top = "88px";
        coach.style.left = "50%";
        coach.style.transform = "translateX(-50%)";
        coach.classList.remove("arrow-up", "arrow-down");
        return;
    }

    const rect = target.getBoundingClientRect();
    const gap = 12;
    const panePadding = 10;

    const leftPanel = getElement("left-panel");
    const detailPanel = getElement("detail-panel");
    const leftPanelRect = leftPanel?.getBoundingClientRect();
    const detailPanelRect = detailPanel && !detailPanel.classList.contains("d-none")
        ? detailPanel.getBoundingClientRect()
        : null;

    const insideLeftPanel = !!target.closest("#left-panel") && !!leftPanelRect;
    const insideDetailPanel = !!target.closest("#detail-panel") && !!detailPanelRect;
    const activePaneRect = insideLeftPanel ? leftPanelRect : insideDetailPanel ? detailPanelRect : null;
    const prefersAboveTarget = !!target.closest(".dp-actions, .gi-compare-actions");

    if (insideLeftPanel && leftPanelRect) {
        coach.style.width = `${Math.max(250, Math.min(360, Math.floor(leftPanelRect.width - (panePadding * 2))))}px`;
        coach.style.maxHeight = `${Math.max(180, Math.floor(leftPanelRect.height - (panePadding * 2)))}px`;
    } else if (insideDetailPanel && detailPanelRect) {
        coach.style.width = `${Math.max(240, Math.min(340, Math.floor(detailPanelRect.width - (panePadding * 2))))}px`;
        coach.style.maxHeight = `${Math.max(180, Math.floor(detailPanelRect.height - (panePadding * 2)))}px`;
    } else {
        coach.style.width = "min(360px, calc(100vw - 20px))";
        coach.style.maxHeight = "min(370px, calc(100vh - 20px))";
    }

    const sizedCoachRect = coach.getBoundingClientRect();
    const bounds = activePaneRect || {
        left: 10,
        right: window.innerWidth - 10,
        top: 10,
        bottom: window.innerHeight - 10,
        width: window.innerWidth - 20,
        height: window.innerHeight - 20,
    };

    const minLeft = Math.round(bounds.left + panePadding);
    const maxLeft = Math.round(Math.max(minLeft, bounds.right - sizedCoachRect.width - panePadding));
    const centeredLeft = Math.round(rect.left + (rect.width / 2) - (sizedCoachRect.width / 2));
    const left = clamp(centeredLeft, minLeft, maxLeft);

    const availableBelow = bounds.bottom - rect.bottom - gap - panePadding;
    const availableAbove = rect.top - bounds.top - gap - panePadding;
    let arrow;
    if (prefersAboveTarget && availableAbove > 120) {
        arrow = "arrow-down";
    } else {
        arrow = availableBelow >= sizedCoachRect.height || availableBelow >= availableAbove ? "arrow-up" : "arrow-down";
    }
    let top = arrow === "arrow-up"
        ? rect.bottom + gap
        : rect.top - sizedCoachRect.height - gap;

    if (arrow === "arrow-up" && top + sizedCoachRect.height > bounds.bottom - panePadding) {
        top = rect.top - sizedCoachRect.height - gap;
        arrow = "arrow-down";
    }

    if (arrow === "arrow-down" && top < bounds.top + panePadding) {
        top = rect.bottom + gap;
        arrow = "arrow-up";
    }

    top = clamp(Math.round(top), Math.round(bounds.top + panePadding), Math.round(bounds.bottom - sizedCoachRect.height - panePadding));

    coach.style.top = `${Math.round(top)}px`;
    coach.style.left = `${Math.round(left)}px`;
    coach.style.transform = "none";
    coach.classList.toggle("arrow-up", arrow === "arrow-up");
    coach.classList.toggle("arrow-down", arrow === "arrow-down");
}

function isTutorialStepAlreadySatisfied(step) {
    if (!step?.completeBy) return false;
    const rule = step.completeBy;

    if (rule.loadedType && lastLoadedType !== rule.loadedType) return false;
    if (rule.loadedId && lastLoadedId !== rule.loadedId) return false;
    if (rule.groupMapMode && lastGroupMapMode !== rule.groupMapMode) return false;
    if (rule.activeNodeId && activeNodeId !== rule.activeNodeId) return false;
    if (rule.copiedId && tutorialState.lastCopiedId !== rule.copiedId) return false;

    if (rule.activeDetailTab) {
        const active = document.querySelector(`.dp-tab.active[data-dp-tab='${rule.activeDetailTab}']`);
        if (!active) return false;
    }

    return true;
}

function isElementInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
}

function setTutorialScrollHint(coach, show, message = "") {
    const hint = coach?.querySelector("#tutorial-scroll-hint");
    const hintText = coach?.querySelector("#tutorial-scroll-hint-text");
    const findButton = coach?.querySelector("#tutorial-find-target");
    if (!hint || !hintText || !findButton) return;

    hint.classList.toggle("d-none", !show);
    if (show && message) hintText.textContent = message;
    findButton.classList.toggle("d-none", !show);
}

function setTutorialTarget(step) {
    clearTutorialHighlight();
    if (!step?.selector) return null;
    const target = document.querySelector(step.selector);
    if (!target) return null;
    target.classList.add("tutorial-highlight");
    tutorialState.highlightedEl = target;
    return target;
}

function registerTutorialAction(step, target) {
    if (!step || !target) return;

    if (step.action === "click") {
        const handler = () => {
            advanceTutorialStep();
        };
        target.addEventListener("click", handler, { once: true });
        tutorialState.cleanupHandlers.push(() => target.removeEventListener("click", handler));
        return;
    }

    if (step.action === "input") {
        const expected = String(step.contains || "").toLowerCase();
        const expectedAny = Array.isArray(step.containsAny)
            ? step.containsAny.map(value => String(value).toLowerCase()).filter(Boolean)
            : [];
        const handler = () => {
            const value = String(target.value || "").toLowerCase();
            if (
                (expectedAny.length > 0 && expectedAny.some(fragment => value.includes(fragment))) ||
                (expectedAny.length === 0 && (!expected || value.includes(expected)))
            ) {
                advanceTutorialStep();
            }
        };
        target.addEventListener("input", handler);
        tutorialState.cleanupHandlers.push(() => target.removeEventListener("input", handler));
    }
}

function waitForTutorialTarget(step) {
    if (!tutorialState.active || !step?.selector) return;
    if (tutorialState.waitTimer) {
        window.clearInterval(tutorialState.waitTimer);
        tutorialState.waitTimer = null;
    }

    tutorialState.waitTimer = window.setInterval(() => {
        if (!tutorialState.active) return;
        const currentStep = getCurrentTutorialStep();
        if (!currentStep || currentStep !== step) {
            window.clearInterval(tutorialState.waitTimer);
            tutorialState.waitTimer = null;
            return;
        }

        if (isTutorialStepAlreadySatisfied(step)) {
            window.clearInterval(tutorialState.waitTimer);
            tutorialState.waitTimer = null;
            advanceTutorialStep();
            return;
        }

        const target = setTutorialTarget(step);
        if (!target) return;

        registerTutorialAction(step, target);
        positionTutorialCoach();
        window.clearInterval(tutorialState.waitTimer);
        tutorialState.waitTimer = null;
    }, 180);
}

function renderTutorialStep() {
    if (!tutorialState.active) return;

    const phase = getCurrentTutorialPhase();
    const step = getCurrentTutorialStep();
    if (!phase || !step) {
        completeTutorialPhase();
        return;
    }

    if (isTutorialStepAlreadySatisfied(step)) {
        advanceTutorialStep();
        return;
    }

    const coach = ensureTutorialCoach();
    coach.classList.remove("d-none");
    clearTutorialBindings();

    const phaseLabel = coach.querySelector("#tutorial-phase-label");
    const progressLabel = coach.querySelector("#tutorial-progress-label");
    const stepTitle = coach.querySelector("#tutorial-step-title");
    const stepWhat = coach.querySelector("#tutorial-step-what");
    const stepWhy = coach.querySelector("#tutorial-step-why");
    const backButton = coach.querySelector("#tutorial-back");
    const nextButton = coach.querySelector("#tutorial-next");
    const stepKey = `${tutorialState.phaseKey}:${tutorialState.stepIndex}`;
    const isNewStep = tutorialState.lastRenderedStepKey !== stepKey;
    tutorialState.lastRenderedStepKey = stepKey;
    const narrative = getTutorialStepNarrative(step);

    if (phaseLabel) phaseLabel.textContent = `${phase.title} Tutorial`;
    if (progressLabel) progressLabel.textContent = `${tutorialState.stepIndex + 1}/${phase.steps.length}`;
    if (stepTitle) stepTitle.textContent = step.title;
    if (stepWhat) stepWhat.textContent = narrative.what;
    if (stepWhy) stepWhy.textContent = narrative.why;
    updateTutorialLauncherBadge();

    if (backButton) backButton.disabled = tutorialState.stepIndex === 0;
    if (nextButton) {
        nextButton.disabled = step.action !== "manual";
        nextButton.textContent = step.action === "manual" ? "Next" : "Waiting for action";
    }

    const target = setTutorialTarget(step);
    registerTutorialAction(step, target);
    if (!target && step.selector) {
        setTutorialScrollHint(coach, true, "Target is loading. Wait a moment or click Find it ✨.");
        waitForTutorialTarget(step);
    } else if (target && !isElementInViewport(target)) {
        setTutorialScrollHint(coach, true, "Target is outside view. Scroll or click Find it ✨.");
        if (isNewStep) {
            target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
    } else {
        setTutorialScrollHint(coach, false);
    }
    positionTutorialCoach();
}

function advanceTutorialStep() {
    if (!tutorialState.active) return;
    tutorialState.stepIndex += 1;
    renderTutorialStep();
}

function completeTutorialPhase() {
    const phase = getCurrentTutorialPhase();
    if (phase) {
        tutorialState.progress[tutorialState.phaseKey] = {
            done: true,
            completedAt: new Date().toISOString(),
        };
        saveTutorialProgress();
    }

    stopTutorial(`${phase?.title || "Tutorial"} completed.`);

    const picker = getElement("tutorial-level-picker");
    if (picker) picker.classList.remove("d-none");
}

function stopTutorial(message, options = {}) {
    const fromUserStop = !!options.fromUserStop;
    tutorialState.active = false;
    tutorialState.phaseKey = "";
    tutorialState.stepIndex = 0;
    tutorialState.lastRenderedStepKey = "";

    clearTutorialBindings();
    clearTutorialHighlight();
    updateTutorialLauncherBadge();
    updateSignedOutTutorialBanner();

    if (tutorialState.coachEl) {
        tutorialState.coachEl.classList.add("d-none");
    }

    if (message) {
        showToast(message, "info");
    }

    if (fromUserStop && !APP_CONTEXT.signedIn) {
        window.location.href = "/";
    }
}

function startTutorialPhase(phaseKey) {
    const phase = TUTORIAL_PHASES[phaseKey];
    if (!phase) return;

    clearTutorialBindings();
    clearTutorialHighlight();

    tutorialState.active = true;
    tutorialState.phaseKey = phaseKey;
    tutorialState.stepIndex = 0;
    updateTutorialLauncherBadge();
    updateSignedOutTutorialBanner();

    const picker = getElement("tutorial-level-picker");
    if (picker) picker.classList.add("d-none");

    const input = getElement("search-input");
    if (input) {
        input.disabled = false;
        input.value = "";
    }
    setControlsDisabled(false);

    showToast(`${phase.title} tutorial started`, "info");
    renderTutorialStep();
}

function getTutorialSearchResults(query) {
    const normalized = String(query || "").toLowerCase();
    if (normalized.length < 2) return [];

    if (searchType === "user" && normalized.includes("engin")) return [TUTORIAL_DUMMY_RESULTS.user];
    if (searchType === "group" && (normalized.includes("tier0") || normalized.includes("tier"))) return [TUTORIAL_DUMMY_RESULTS.group];
    if (searchType === "device" && (normalized.includes("win11") || normalized.includes("device"))) return [TUTORIAL_DUMMY_RESULTS.device];
    if (searchType === "app" && normalized.includes("portal")) return [TUTORIAL_DUMMY_RESULTS.app];
    if (searchType === "ca_policy" && normalized.includes("mfa")) return [TUTORIAL_DUMMY_RESULTS.ca_policy];
    return [];
}

function getTutorialGraph(type, objectId, mode = "standard") {
    if (type === "group" && mode === "impact") return TUTORIAL_DUMMY_GRAPHS.group_impact;
    if (type === "group") return TUTORIAL_DUMMY_GRAPHS.group_standard;
    if (type === "user") return TUTORIAL_DUMMY_GRAPHS.user;
    if (type === "device") return TUTORIAL_DUMMY_GRAPHS.device;
    if (type === "app") return TUTORIAL_DUMMY_GRAPHS.app;
    if (type === "ca_policy") return TUTORIAL_DUMMY_GRAPHS.ca_policy;
    return TUTORIAL_DUMMY_GRAPHS.user;
}

function getTutorialImpactResult(groupId) {
    if (String(groupId || "") !== "tutorial-group-1") return null;
    return {
        ...TUTORIAL_IMPACT_RESULT,
        group: {
            ...TUTORIAL_IMPACT_RESULT.group,
            id: groupId,
        },
        domains: TUTORIAL_IMPACT_RESULT.domains.map(domain => ({
            ...domain,
            findings: (domain.findings || []).map(finding => ({ ...finding })),
        })),
        summary: {
            ...TUTORIAL_IMPACT_RESULT.summary,
            completeness: {
                ...(TUTORIAL_IMPACT_RESULT.summary?.completeness || {}),
                constrainedDomains: (TUTORIAL_IMPACT_RESULT.summary?.completeness?.constrainedDomains || []).map(item => ({ ...item })),
            },
        },
    };
}

function buildTutorialImpactTxt(data) {
    const summary = data?.summary || {};
    const domains = Array.isArray(data?.domains) ? data.domains : [];
    const findings = domains.flatMap(domain => (domain.findings || []).map(item => ({
        domain: domain.label || domain.key || "Domain",
        severity: item.severity || "warning",
        impact: formatImpactLabel(item.impact),
        name: item.name || "Unknown",
    })));

    return [
        `Tutorial Group Impact Report`,
        `Group: ${data?.group?.displayName || data?.group?.id || "Unknown"}`,
        `Risk Level: ${summary.riskLevel || "unknown"}`,
        `Risk Score: ${summary.riskScore || 0}`,
        `Coverage Score: ${summary.coverageScore || 0}%`,
        `Confidence: ${summary.confidence || "low"}`,
        ``,
        `Recommendation: ${summary.recommendation || "No recommendation available."}`,
        ``,
        `Findings:`,
        ...findings.map(item => `- [${String(item.severity).toUpperCase()}] ${item.domain}: ${item.name} (${item.impact})`),
    ].join("\n");
}

function downloadTutorialFile(content, fileName, mimeType, successMessage) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(successMessage, "info");
}

function loadTutorialMap(type, objectId, mode = "standard") {
    lastLoadedType = type;
    lastLoadedId = objectId;
    if (type === "group") {
        lastGroupMapMode = mode === "impact" ? "impact" : "standard";
    }

    setControlsDisabled(false);
    showGraphLoading(true);
    clearGraph();
    showEmptyState(false);

    const graph = getTutorialGraph(type, objectId, mode);
    renderGraph(graph);
    showGraphLoading(false);

    if (type === "group") {
        groupImpactCache.delete(objectId);
    }

    showToast(`Tutorial ${type} map loaded`, "info");
    syncTutorialProgressFromState();
}

function renderTutorialComparePanel(panel, groupId) {
    setDetailTab("impact");
    const standardOnlyNodes = [
        { id: "tutorial-user-1", label: "Engin Soysal", type: "user", severity: "", score: 0 },
        { id: "tutorial-device-1", label: "WIN11-OPS-001", type: "device", severity: "warning", score: 1 },
    ];
    const impactOnlyNodes = [
        { id: "tutorial-cap-1", label: "Require MFA for Admins", type: "ca_policy", severity: "blocker", score: 2 },
    ];
    const overlapNodes = [
        { id: "tutorial-group-1", label: "Tier0-Identity-Operators", type: "group", severity: "warning", score: 1 },
        { id: "tutorial-app-1", label: "Privileged Access Portal", type: "app", severity: "warning", score: 1 },
    ];

    const edgeRowsA = [
        { sourceType: "group", targetType: "app", relation: "App role assignment", count: 1 },
    ];
    const edgeRowsB = [
        { sourceType: "group", targetType: "ca_policy", relation: "Included scope", count: 1 },
    ];

    const listMarkup = items => `
        <ul class="gi-compare-list">
            ${items.map(item => `
                <li class="gi-compare-item">
                    <div class="gi-compare-main-row">
                        <div class="gi-compare-main">${escHtml(item.label)}</div>
                        ${item.score > 0 ? `<span class="gi-compare-pill ${item.severity === "blocker" ? "blocker" : "warning"}">${escHtml(item.severity)}</span>` : ""}
                    </div>
                    <div class="gi-compare-sub">${escHtml(item.type)} • ${escHtml(item.id)}</div>
                </li>
            `).join("")}
        </ul>
    `;

    const edgeMarkup = rows => `
        <ul class="gi-edge-list">
            ${rows.map(item => `
                <li class="gi-edge-item">
                    <div class="gi-edge-main">${escHtml(item.sourceType)} -> ${escHtml(item.targetType)} (${escHtml(item.relation)})</div>
                    <div class="gi-edge-sub">${item.count} link${item.count === 1 ? "" : "s"}</div>
                </li>
            `).join("")}
        </ul>
    `;

    panel.innerHTML = `
        <div class="gi-head">
            <div>
                <div class="gi-kicker">Map Compare</div>
                <div class="gi-title">Tutorial compare walkthrough</div>
            </div>
            <span class="gi-state safe">Dummy Data</span>
        </div>
        <div class="gi-note">This is a full demo compare with dummy data for training and onboarding.</div>
        <div class="gi-compare-grid">
            <section class="gi-compare-card">
                <div class="gi-compare-head"><span>Standard-only nodes</span><strong>${standardOnlyNodes.length}</strong></div>
                ${listMarkup(standardOnlyNodes)}
            </section>
            <section class="gi-compare-card">
                <div class="gi-compare-head"><span>Impact-only nodes</span><strong>${impactOnlyNodes.length}</strong></div>
                ${listMarkup(impactOnlyNodes)}
            </section>
            <section class="gi-compare-card">
                <div class="gi-compare-head"><span>Overlap nodes</span><strong>${overlapNodes.length}</strong></div>
                ${listMarkup(overlapNodes)}
            </section>
        </div>
        <div class="gi-edge-grid">
            <section class="gi-edge-card">
                <div class="gi-compare-head"><span>Top standard-only relations</span><strong>1</strong></div>
                ${edgeMarkup(edgeRowsA)}
            </section>
            <section class="gi-edge-card">
                <div class="gi-compare-head"><span>Top impact-only relations</span><strong>1</strong></div>
                ${edgeMarkup(edgeRowsB)}
            </section>
        </div>
        <div class="dp-actions gi-compare-actions">
            <button class="dp-action-btn" type="button" id="gi-compare-open-standard"><i class="fas fa-sitemap"></i> Open standard graph</button>
            <button class="dp-action-btn" type="button" id="gi-compare-open-impact"><i class="fas fa-project-diagram"></i> Open impact graph</button>
            <button class="dp-action-btn" id="gi-compare-export-json" type="button"><i class="fas fa-file-code"></i> Export compare JSON</button>
            <button class="dp-action-btn" id="gi-compare-export-csv" type="button"><i class="fas fa-file-csv"></i> Export compare CSV</button>
        </div>
    `;

    panel.querySelector("#gi-compare-open-standard")?.addEventListener("click", () => loadTutorialMap("group", groupId, "standard"));
    panel.querySelector("#gi-compare-open-impact")?.addEventListener("click", () => loadTutorialMap("group", groupId, "impact"));
    panel.querySelector("#gi-compare-export-json")?.addEventListener("click", () => showToast("Tutorial compare JSON export complete", "info"));
    panel.querySelector("#gi-compare-export-csv")?.addEventListener("click", () => showToast("Tutorial compare CSV export complete", "info"));

    lastGroupCompareState = {
        groupId,
        generatedAt: new Date().toISOString(),
        metrics: {
            standardNodes: 4,
            standardEdges: 3,
            impactNodes: 4,
            impactEdges: 2,
            overlapNodes: overlapNodes.length,
        },
        nodes: {
            standardOnly: standardOnlyNodes,
            impactOnly: impactOnlyNodes,
            overlap: overlapNodes,
        },
    };
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

function saveImpactFilterState() {
    try {
        localStorage.setItem(IMPACT_FILTER_STORAGE_KEY, JSON.stringify(impactFilterState));
    } catch (_) {
    }
}

function loadImpactFilterState() {
    try {
        const raw = localStorage.getItem(IMPACT_FILTER_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;

        impactFilterState = {
            domain: typeof parsed.domain === "string" ? parsed.domain : "all",
            severities: {
                blocker: parsed?.severities?.blocker !== false,
                warning: parsed?.severities?.warning !== false,
            },
            explainMode: parsed?.explainMode !== false,
        };
    } catch (_) {
    }
}

function updateScopeLegend(data) {
    const scopeLegend = getElement("scope-legend");
    if (!scopeLegend) return;

    const edges = data?.edges || [];
    const hasScopedEdges = edges.some(edge => edge?.scopeKind === "include" || edge?.scopeKind === "exclude");
    scopeLegend.classList.toggle("d-none", !hasScopedEdges);
}

function isImpactGraphData(data) {
    const nodes = data?.nodes || [];
    const edges = data?.edges || [];
    return nodes.some(node => node?.data?.impactNode === 1) || edges.some(edge => edge?.impactEdge === 1);
}

function getImpactDomainsFromData(data) {
    const keys = new Set();
    (data?.nodes || []).forEach(node => {
        const key = String(node?.data?.impactDomainKey || "").trim();
        if (key) keys.add(key);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
}

function formatDomainKeyLabel(key) {
    return String(key || "")
        .split("_")
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function renderImpactGraphControls(data) {
    const controls = getElement("impact-graph-controls");
    if (!controls) return;

    if (!isImpactGraphData(data)) {
        controls.classList.add("d-none");
        controls.innerHTML = "";
        return;
    }

    const domains = getImpactDomainsFromData(data);

    // Normalize stale domain filters when current graph domains differ.
    if (impactFilterState.domain !== "all" && !domains.includes(impactFilterState.domain)) {
        impactFilterState.domain = "all";
        saveImpactFilterState();
    }

    const severityChips = [
        `<button class="igc-chip ${impactFilterState.severities.blocker ? "active" : ""}" data-igc-severity="blocker" type="button">Blocker</button>`,
        `<button class="igc-chip ${impactFilterState.severities.warning ? "active" : ""}" data-igc-severity="warning" type="button">Warning</button>`,
    ].join("");

    const domainChips = [
        `<button class="igc-chip ${impactFilterState.domain === "all" ? "active" : ""}" data-igc-domain="all" type="button">All</button>`,
        ...domains.map(key => `<button class="igc-chip ${impactFilterState.domain === key ? "active" : ""}" data-igc-domain="${escHtml(key)}" type="button">${escHtml(formatDomainKeyLabel(key))}</button>`),
    ].join("");

    const explainChip = `<button class="igc-chip ${impactFilterState.explainMode ? "active" : ""}" data-igc-explain="1" type="button">Explain</button>`;
    const presetChips = [
        `<button class="igc-chip" data-igc-preset="cab" type="button">CAB</button>`,
        `<button class="igc-chip" data-igc-preset="security" type="button">Security</button>`,
        `<button class="igc-chip" data-igc-preset="reset" type="button">Reset</button>`,
    ].join("");

    controls.innerHTML = `
        <div class="igc-section">
            <span class="igc-label">Severity</span>
            <div class="igc-chip-list">${severityChips}</div>
        </div>
        <div class="igc-section">
            <span class="igc-label">Domain</span>
            <div class="igc-chip-list">${domainChips}</div>
        </div>
        <div class="igc-section">
            <span class="igc-label">Explain</span>
            <div class="igc-chip-list">${explainChip}</div>
        </div>
        <div class="igc-section">
            <span class="igc-label">Preset</span>
            <div class="igc-chip-list">${presetChips}</div>
        </div>
    `;
    controls.classList.remove("d-none");

    controls.querySelectorAll("[data-igc-severity]").forEach(button => {
        button.addEventListener("click", () => {
            const key = button.getAttribute("data-igc-severity");
            if (!key) return;
            impactFilterState.severities[key] = !impactFilterState.severities[key];

            // Keep at least one severity active.
            if (!impactFilterState.severities.blocker && !impactFilterState.severities.warning) {
                impactFilterState.severities[key] = true;
            }

            saveImpactFilterState();
            renderImpactGraphControls(lastGraphData);
            applyImpactGraphFilters();
            refreshActiveDetailPanel();
        });
    });

    controls.querySelectorAll("[data-igc-domain]").forEach(button => {
        button.addEventListener("click", () => {
            const key = button.getAttribute("data-igc-domain") || "all";
            impactFilterState.domain = key;
            saveImpactFilterState();
            renderImpactGraphControls(lastGraphData);
            applyImpactGraphFilters();
            refreshActiveDetailPanel();
        });
    });

    controls.querySelectorAll("[data-igc-explain]").forEach(button => {
        button.addEventListener("click", () => {
            impactFilterState.explainMode = !impactFilterState.explainMode;
            saveImpactFilterState();
            renderImpactGraphControls(lastGraphData);
            applyImpactGraphFilters();
            refreshActiveDetailPanel();
        });
    });

    controls.querySelectorAll("[data-igc-preset]").forEach(button => {
        button.addEventListener("click", () => {
            const preset = button.getAttribute("data-igc-preset") || "";
            if (preset === "cab") {
                impactFilterState = {
                    ...impactFilterState,
                    domain: "all",
                    severities: { blocker: true, warning: true },
                    explainMode: true,
                };
            } else if (preset === "security") {
                const securityDomain = domains.includes("conditional_access")
                    ? "conditional_access"
                    : domains.includes("iam_roles")
                        ? "iam_roles"
                        : "all";
                impactFilterState = {
                    ...impactFilterState,
                    domain: securityDomain,
                    severities: { blocker: true, warning: false },
                    explainMode: true,
                };
            } else {
                impactFilterState = {
                    ...impactFilterState,
                    domain: "all",
                    severities: { blocker: true, warning: true },
                    explainMode: true,
                };
            }

            saveImpactFilterState();
            renderImpactGraphControls(lastGraphData);
            applyImpactGraphFilters();
            refreshActiveDetailPanel();
        });
    });
}

function applyImpactGraphFilters() {
    if (!cy || !cy.nodes().length) return;

    const hasImpact = cy.nodes().some(node => Number(node.data("impactNode") || 0) === 1);
    cy.nodes().removeClass("impact-hidden");
    cy.edges().removeClass("impact-hidden");
    if (!hasImpact) return;

    cy.nodes().forEach(node => {
        if (Number(node.data("impactNode") || 0) !== 1) return;

        const severity = String(node.data("impactSeverity") || "").toLowerCase();
        const domainKey = String(node.data("impactDomainKey") || "");
        const severityAllowed = !!impactFilterState.severities[severity];
        const domainAllowed = impactFilterState.domain === "all" || domainKey === impactFilterState.domain;

        if (!severityAllowed || !domainAllowed) {
            node.addClass("impact-hidden");
        }
    });

    cy.edges().forEach(edge => {
        if (Number(edge.data("impactEdge") || 0) !== 1) return;

        const severity = String(edge.data("impactSeverity") || "").toLowerCase();
        const domainKey = String(edge.data("impactDomainKey") || "");
        const severityAllowed = !!impactFilterState.severities[severity];
        const domainAllowed = impactFilterState.domain === "all" || domainKey === impactFilterState.domain;
        const sourceHidden = edge.source().hasClass("impact-hidden");
        const targetHidden = edge.target().hasClass("impact-hidden");

        if (!severityAllowed || !domainAllowed || sourceHidden || targetHidden) {
            edge.addClass("impact-hidden");
        }
    });
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

function bindSignedOutTutorialLaunch() {
    const launch = getElement("auth-start-tutorial");
    if (!launch) return;

    launch.addEventListener("click", () => {
        const overlay = getElement("auth-overlay");
        if (overlay) overlay.classList.add("d-none");

        const input = getElement("search-input");
        if (input) {
            input.disabled = false;
            input.placeholder = SEARCH_PLACEHOLDERS[searchType] || "Search...";
            input.focus();
        }

        setControlsDisabled(false);
        startTutorialPhase("basic");
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
    document.querySelectorAll(".search-tab, #btn-fit, #btn-reset-layout, #btn-export-json, #btn-export-view-json, #insight-unmanaged, #insight-noncompliant, #insight-reset")
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
        { selector: "node[impactNode = 1]", style: { "border-width": 3, "text-outline-width": 2, "text-outline-color": "#0b0d16", "font-size": "10px" } },
        { selector: "node[impactSeverity='blocker']", style: { "border-color": "#ef4444", "background-color": "#2f0c12", color: "#fecaca" } },
        { selector: "node[impactSeverity='warning']", style: { "border-color": "#f59e0b", "background-color": "#2d2109", color: "#fde68a" } },
        { selector: "node[impactDomainKey='conditional_access']", style: { "background-color": "#2a0a0a", "border-color": "#ef4444", shape: "tag" } },
        { selector: "node[impactDomainKey='iam_roles'], node[impactDomainKey='pim_roles']", style: { "background-color": "#26113a", "border-color": "#a78bfa", shape: "hexagon" } },
        { selector: "node[impactDomainKey='administrative_units'], node[impactDomainKey='entitlement_management'], node[impactDomainKey='group_nesting'], node[impactDomainKey='group_licensing']", style: { "background-color": "#2a1800", "border-color": "#fbbf24", shape: "diamond" } },
        { selector: "node[impactDomainKey='m365_workloads'], node[impactDomainKey='exchange_workloads']", style: { "background-color": "#062620", "border-color": "#10b981", shape: "round-rectangle" } },
        { selector: "node[impactDomainKey='intune_apps'], node[impactDomainKey='intune_device_configurations'], node[impactDomainKey='intune_settings_catalog'], node[impactDomainKey='intune_admin_templates'], node[impactDomainKey='intune_compliance'], node[impactDomainKey='intune_app_protection'], node[impactDomainKey='intune_app_configuration'], node[impactDomainKey='intune_scripts_bundle'], node[impactDomainKey='intune_enrollment_bundle'], node[impactDomainKey='cloud_pc_bundle']", style: { "background-color": "#0a1f2f", "border-color": "#38bdf8", shape: "hexagon" } },
        { selector: "node[hasPhoto = 1]", style: { "background-image": "data(photo)", "background-fit": "cover", "background-clip": "node", "background-opacity": 1, "text-outline-width": 2, "text-outline-color": "#0b0d16" } },
        { selector: "node[type='group'][hasPhoto = 1]", style: { shape: "ellipse", width: 58, height: 58, "border-width": 3 } },
        { selector: "node.highlighted", style: { "border-width": 4, "overlay-color": "#fff", "overlay-padding": 4, "overlay-opacity": 0.06 } },
        { selector: "edge", style: { width: 1.5, "line-color": "#252a47", "target-arrow-color": "#252a47", "target-arrow-shape": "triangle", "curve-style": "bezier", label: "data(label)", "font-size": "8px", color: "#3a4268", "text-rotation": "autorotate", "text-margin-y": -6, "font-family": "Segoe UI, system-ui, sans-serif", opacity: 0.7 } },
        { selector: "edge[impactEdge = 1]", style: { width: 2.4, opacity: 0.95, "line-style": "dashed" } },
        { selector: "edge[impactSeverity='blocker']", style: { "line-color": "#ef4444", "target-arrow-color": "#ef4444", color: "#fca5a5" } },
        { selector: "edge[impactSeverity='warning']", style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", color: "#fcd34d" } },
        { selector: "edge[scopeKind='include']", style: { "line-color": "#22c55e", "target-arrow-color": "#22c55e", color: "#16a34a", width: 2.2, opacity: 0.9 } },
        { selector: "edge[scopeKind='exclude']", style: { "line-color": "#ef4444", "target-arrow-color": "#ef4444", color: "#dc2626", width: 2.2, opacity: 0.95 } },
        { selector: "edge.highlighted", style: { "line-color": "#3d4a7a", "target-arrow-color": "#3d4a7a", opacity: 1 } },
        { selector: ".impact-hidden", style: { display: "none" } },
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
    updateScopeLegend(null);
    renderImpactGraphControls(null);
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
            edgeSeverity: edge.data("impactSeverity") || "",
            edgeDomain: edge.data("impactDomainKey") || "",
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
                    <span class="rr-chip-sub">${escHtml(item.edgeLabel)}${impactFilterState.explainMode && item.edgeDomain ? ` • ${escHtml(formatDomainKeyLabel(item.edgeDomain))}${item.edgeSeverity ? ` • ${escHtml(String(item.edgeSeverity).toUpperCase())}` : ""}` : ""}</span>
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
                impactNode: node.data?.impactNode || 0,
                impactSeverity: node.data?.impactSeverity || "",
                impactDomainKey: node.data?.impactDomainKey || "",
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
                scopeKind: edge.scopeKind || "",
                impactEdge: edge.impactEdge || 0,
                impactSeverity: edge.impactSeverity || "",
                impactDomainKey: edge.impactDomainKey || "",
            },
        });
    });

    cy.add(elements);
    lastGraphData = data;
    updateScopeLegend(data);
    renderImpactGraphControls(data);
    applyImpactGraphFilters();
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
    if (tutorialState.active && String(objectId || "").startsWith("tutorial-")) {
        loadTutorialMap(objectType, objectId, "standard");
        return;
    }

    if (!APP_CONTEXT.signedIn) {
        showToast("Sign in required", "error");
        return;
    }

    lastLoadedType = objectType;
    lastLoadedId = objectId;
    if (objectType === "group") {
        lastGroupMapMode = "standard";
    }
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

function setGroupMapModeButtons(mode) {
    const standardBtn = getElement("btn-load-standard-map");
    const impactBtn = getElement("btn-load-impact-map");
    if (standardBtn) standardBtn.disabled = mode === "standard";
    if (impactBtn) impactBtn.disabled = mode === "impact";
}

function loadStandardGroupMap(groupId) {
    if (!groupId) return;
    lastGroupMapMode = "standard";
    setGroupMapModeButtons("standard");
    loadMap("group", groupId);
}

async function loadGroupImpactMap(groupId) {
    if (tutorialState.active && String(groupId || "").startsWith("tutorial-")) {
        loadTutorialMap("group", groupId, "impact");
        return;
    }

    if (!APP_CONTEXT.signedIn) {
        showToast("Sign in required", "error");
        return;
    }

    if (!groupId) return;

    lastGroupMapMode = "impact";
    setGroupMapModeButtons("impact");
    lastLoadedType = "group";
    lastLoadedId = groupId;
    setControlsDisabled(false);
    showGraphLoading(true);
    clearGraph();
    showEmptyState(false);

    try {
        const response = await fetch(`/api/map/group/${groupId}/impact`);
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || "Failed to load impact graph", "error");
            showEmptyState(true);
            return;
        }
        renderGraph(data);
        showToast("Impact graph loaded", "info");
    } catch (error) {
        showToast(`Network error: ${error.message}`, "error");
        showEmptyState(true);
    } finally {
        showGraphLoading(false);
        setControlsDisabled(false);
    }
}

async function compareGroupMaps(groupId) {
    if (!APP_CONTEXT.signedIn) {
        showToast("Sign in required", "error");
        return;
    }
    if (!groupId) return;

    const panel = getElement("group-impact-panel");
    if (!panel) return;

    if (tutorialState.active && String(groupId || "").startsWith("tutorial-")) {
        renderTutorialComparePanel(panel, groupId);
        return;
    }

    setDetailTab("impact");
    panel.innerHTML = `
        <div class="gi-head">
            <div>
                <div class="gi-kicker">Map Compare</div>
                <div class="gi-title">Building side-by-side compare...</div>
            </div>
            <span class="gi-state pending">Loading</span>
        </div>
    `;

    try {
        const safeFileName = (value, fallback = "group") => {
            return String(value || fallback)
                .replace(/[^a-z0-9\-_]+/gi, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 80) || fallback;
        };
        const severityScore = severity => {
            if (severity === "blocker") return 2;
            if (severity === "warning") return 1;
            return 0;
        };
        const edgeKey = edge => `${String(edge?.source || "")}::${String(edge?.target || "")}::${String(edge?.label || "")}`;
        const nodeRecord = node => {
            const id = String(node?.id || "");
            const type = String(node?.type || node?.data?.type || "object");
            const severity = String(node?.impactSeverity || node?.data?.impactSeverity || "");
            const label = String(
                node?.label
                || node?.data?.fullLabel
                || node?.data?.displayName
                || node?.data?.label
                || id
                || "(unknown)"
            );
            return { id, type, label, severity, score: severityScore(severity) };
        };
        const listMarkup = (items, emptyText) => {
            if (!items.length) {
                return `<div class="gi-compare-empty">${escHtml(emptyText)}</div>`;
            }

            const visible = items.slice(0, 12);
            const overflow = Math.max(0, items.length - visible.length);
            const rows = visible.map(item => `
                <li class="gi-compare-item">
                    <div class="gi-compare-main-row">
                        <div class="gi-compare-main">${escHtml(item.label)}</div>
                        ${item.score > 0 ? `<span class="gi-compare-pill ${item.severity === "blocker" ? "blocker" : "warning"}">${escHtml(item.severity)}</span>` : ""}
                    </div>
                    <div class="gi-compare-sub">${escHtml(item.type)}${item.id ? ` • ${escHtml(item.id)}` : ""}</div>
                </li>
            `).join("");

            return `
                <ul class="gi-compare-list">${rows}</ul>
                ${overflow ? `<div class="gi-compare-more">+${overflow} more</div>` : ""}
            `;
        };
        const summarizeEdgeRelations = (edges, sourceMap) => {
            const counter = new Map();
            edges.forEach(edge => {
                const sourceId = String(edge?.source || "");
                const targetId = String(edge?.target || "");
                const sourceType = sourceMap.get(sourceId)?.type || "object";
                const targetType = sourceMap.get(targetId)?.type || "object";
                const relation = String(edge?.label || "link");
                const key = `${sourceType}->${targetType}::${relation}`;
                const current = counter.get(key) || {
                    sourceType,
                    targetType,
                    relation,
                    count: 0,
                };
                current.count += 1;
                counter.set(key, current);
            });
            return [...counter.values()]
                .sort((left, right) => {
                    if (right.count !== left.count) return right.count - left.count;
                    return `${left.sourceType}${left.targetType}${left.relation}`
                        .localeCompare(`${right.sourceType}${right.targetType}${right.relation}`);
                })
                .slice(0, 8);
        };
        const edgeDeltaMarkup = (rows, emptyText) => {
            if (!rows.length) {
                return `<div class="gi-compare-empty">${escHtml(emptyText)}</div>`;
            }
            const items = rows.map(item => `
                <li class="gi-edge-item">
                    <div class="gi-edge-main">${escHtml(item.sourceType)} -> ${escHtml(item.targetType)} (${escHtml(item.relation)})</div>
                    <div class="gi-edge-sub">${item.count} link${item.count === 1 ? "" : "s"}</div>
                </li>
            `).join("");
            return `<ul class="gi-edge-list">${items}</ul>`;
        };

        const response = await fetch(`/api/map/group/${groupId}/compare`);
        const data = await response.json();
        if (!response.ok) {
            panel.innerHTML = `
                <div class="gi-head">
                    <div>
                        <div class="gi-kicker">Map Compare</div>
                        <div class="gi-title">Compare unavailable</div>
                    </div>
                    <span class="gi-state partial">Error</span>
                </div>
                <div class="gi-note">${escHtml(data.error || "Unable to compare maps")}</div>
            `;
            return;
        }

        const standardNodes = data?.standard?.nodes || [];
        const standardEdges = data?.standard?.edges || [];
        const impactNodes = data?.impact?.nodes || [];
        const impactEdges = data?.impact?.edges || [];

        const standardNodeMap = new Map(standardNodes.map(node => {
            const record = nodeRecord(node);
            return [record.id, record];
        }));
        const impactNodeMap = new Map(impactNodes.map(node => {
            const record = nodeRecord(node);
            return [record.id, record];
        }));

        const standardIds = new Set(standardNodeMap.keys());
        const impactIds = new Set(impactNodeMap.keys());

        const overlapNodeIds = [...standardIds].filter(id => impactIds.has(id));
        const standardOnlyNodes = [...standardIds]
            .filter(id => !impactIds.has(id))
            .map(id => standardNodeMap.get(id))
            .filter(Boolean)
            .sort((left, right) => left.label.localeCompare(right.label));
        const impactOnlyNodes = [...impactIds]
            .filter(id => !standardIds.has(id))
            .map(id => impactNodeMap.get(id))
            .filter(Boolean)
            .sort((left, right) => left.label.localeCompare(right.label));
        const overlapNodes = overlapNodeIds
            .map(id => impactNodeMap.get(id) || standardNodeMap.get(id))
            .filter(Boolean)
            .sort((left, right) => left.label.localeCompare(right.label));

        const standardEdgeSet = new Set(standardEdges.map(edgeKey));
        const impactEdgeSet = new Set(impactEdges.map(edgeKey));
        const overlapEdges = [...standardEdgeSet].filter(key => impactEdgeSet.has(key)).length;
        const standardOnlyEdges = [...standardEdgeSet].filter(key => !impactEdgeSet.has(key)).length;
        const impactOnlyEdges = [...impactEdgeSet].filter(key => !standardEdgeSet.has(key)).length;
        const standardOnlyEdgeRows = standardEdges.filter(edge => !impactEdgeSet.has(edgeKey(edge)));
        const impactOnlyEdgeRows = impactEdges.filter(edge => !standardEdgeSet.has(edgeKey(edge)));
        const topStandardOnlyRelations = summarizeEdgeRelations(standardOnlyEdgeRows, standardNodeMap);
        const topImpactOnlyRelations = summarizeEdgeRelations(impactOnlyEdgeRows, impactNodeMap);

        const allTypes = [...new Set([
            ...standardOnlyNodes.map(item => item.type),
            ...impactOnlyNodes.map(item => item.type),
            ...overlapNodes.map(item => item.type),
        ])].sort((left, right) => left.localeCompare(right));

        const compareUiState = {
            type: "all",
            query: "",
            sort: "impact_desc",
        };

        const applyNodeFilters = source => {
            const normalizedQuery = compareUiState.query.trim().toLowerCase();
            const filtered = source.filter(item => {
                if (compareUiState.type !== "all" && item.type !== compareUiState.type) return false;
                if (!normalizedQuery) return true;
                const haystack = `${item.label} ${item.id} ${item.type}`.toLowerCase();
                return haystack.includes(normalizedQuery);
            });

            filtered.sort((left, right) => {
                if (compareUiState.sort === "impact_desc") {
                    if (right.score !== left.score) return right.score - left.score;
                }
                return left.label.localeCompare(right.label);
            });
            return filtered;
        };

        const buildCompareSnapshot = () => {
            const visibleStandardOnlyNodes = applyNodeFilters(standardOnlyNodes);
            const visibleImpactOnlyNodes = applyNodeFilters(impactOnlyNodes);
            const visibleOverlapNodes = applyNodeFilters(overlapNodes);
            return {
                groupId,
                generatedAt: new Date().toISOString(),
                filters: {
                    type: compareUiState.type,
                    query: compareUiState.query,
                    sort: compareUiState.sort,
                },
                metrics: {
                    standardNodes: standardNodes.length,
                    standardEdges: standardEdges.length,
                    impactNodes: impactNodes.length,
                    impactEdges: impactEdges.length,
                    overlapNodes: overlapNodes.length,
                    overlapEdges,
                    standardOnlyEdges,
                    impactOnlyEdges,
                },
                nodes: {
                    standardOnly: standardOnlyNodes,
                    impactOnly: impactOnlyNodes,
                    overlap: overlapNodes,
                },
                visibleNodes: {
                    standardOnly: visibleStandardOnlyNodes,
                    impactOnly: visibleImpactOnlyNodes,
                    overlap: visibleOverlapNodes,
                },
                edgeDeltas: {
                    topStandardOnlyRelations,
                    topImpactOnlyRelations,
                },
            };
        };

        panel.innerHTML = `
            <div class="gi-head">
                <div>
                    <div class="gi-kicker">Map Compare</div>
                    <div class="gi-title">Side-by-side group map comparison</div>
                </div>
                <span class="gi-state safe">Ready</span>
            </div>
            <div class="gi-kpis">
                <div class="gi-kpi"><span>Standard nodes</span><strong>${standardNodes.length}</strong></div>
                <div class="gi-kpi"><span>Standard edges</span><strong>${standardEdges.length}</strong></div>
                <div class="gi-kpi"><span>Impact nodes</span><strong>${impactNodes.length}</strong></div>
                <div class="gi-kpi"><span>Impact edges</span><strong>${impactEdges.length}</strong></div>
                <div class="gi-kpi"><span>Overlap nodes</span><strong>${overlapNodes.length}</strong></div>
                <div class="gi-kpi"><span>Overlap edges</span><strong>${overlapEdges}</strong></div>
                <div class="gi-kpi"><span>Standard-only edges</span><strong>${standardOnlyEdges}</strong></div>
                <div class="gi-kpi"><span>Impact-only edges</span><strong>${impactOnlyEdges}</strong></div>
            </div>
            <div class="gi-note">Delta view below shows what appears only in Standard, only in Impact, and in both maps. Use controls to filter by type, search quickly, and sort by impact-score.</div>
            <div class="gi-compare-controls">
                <label class="gi-compare-control">
                    <span>Type</span>
                    <select id="gi-compare-type">
                        <option value="all">All</option>
                        ${allTypes.map(type => `<option value="${escHtml(type)}">${escHtml(type)}</option>`).join("")}
                    </select>
                </label>
                <label class="gi-compare-control">
                    <span>Search</span>
                    <input id="gi-compare-search" type="text" placeholder="Search label, id, type" />
                </label>
                <label class="gi-compare-control">
                    <span>Sort</span>
                    <select id="gi-compare-sort">
                        <option value="impact_desc">Impact score</option>
                        <option value="label_asc">Label A-Z</option>
                    </select>
                </label>
            </div>
            <div class="gi-compare-grid" id="gi-compare-grid"></div>
            <div class="gi-edge-grid" id="gi-edge-grid"></div>
            <div class="dp-actions gi-compare-actions">
                <button class="dp-action-btn" type="button" onclick="loadStandardGroupMap('${escHtml(groupId)}')"><i class="fas fa-sitemap"></i> Open standard graph</button>
                <button class="dp-action-btn" type="button" onclick="loadGroupImpactMap('${escHtml(groupId)}')"><i class="fas fa-project-diagram"></i> Open impact graph</button>
                <button class="dp-action-btn" id="gi-compare-export-json" type="button"><i class="fas fa-file-code"></i> Export compare JSON</button>
                <button class="dp-action-btn" id="gi-compare-export-csv" type="button"><i class="fas fa-file-csv"></i> Export compare CSV</button>
            </div>
        `;

        const compareGrid = panel.querySelector("#gi-compare-grid");
        const edgeGrid = panel.querySelector("#gi-edge-grid");
        const typeFilter = panel.querySelector("#gi-compare-type");
        const searchFilter = panel.querySelector("#gi-compare-search");
        const sortFilter = panel.querySelector("#gi-compare-sort");
        const exportJsonButton = panel.querySelector("#gi-compare-export-json");
        const exportCsvButton = panel.querySelector("#gi-compare-export-csv");

        const renderCompareView = () => {
            if (!compareGrid || !edgeGrid) return;

            const visibleStandardOnlyNodes = applyNodeFilters(standardOnlyNodes);
            const visibleImpactOnlyNodes = applyNodeFilters(impactOnlyNodes);
            const visibleOverlapNodes = applyNodeFilters(overlapNodes);

            compareGrid.innerHTML = `
                <section class="gi-compare-card">
                    <div class="gi-compare-head">
                        <span>Standard-only nodes</span>
                        <strong>${visibleStandardOnlyNodes.length}</strong>
                    </div>
                    ${listMarkup(visibleStandardOnlyNodes, "No Standard-only nodes")}
                </section>
                <section class="gi-compare-card">
                    <div class="gi-compare-head">
                        <span>Impact-only nodes</span>
                        <strong>${visibleImpactOnlyNodes.length}</strong>
                    </div>
                    ${listMarkup(visibleImpactOnlyNodes, "No Impact-only nodes")}
                </section>
                <section class="gi-compare-card">
                    <div class="gi-compare-head">
                        <span>Overlap nodes</span>
                        <strong>${visibleOverlapNodes.length}</strong>
                    </div>
                    ${listMarkup(visibleOverlapNodes, "No overlap nodes")}
                </section>
            `;

            edgeGrid.innerHTML = `
                <section class="gi-edge-card">
                    <div class="gi-compare-head">
                        <span>Top standard-only relations</span>
                        <strong>${standardOnlyEdges}</strong>
                    </div>
                    ${edgeDeltaMarkup(topStandardOnlyRelations, "No Standard-only relations")}
                </section>
                <section class="gi-edge-card">
                    <div class="gi-compare-head">
                        <span>Top impact-only relations</span>
                        <strong>${impactOnlyEdges}</strong>
                    </div>
                    ${edgeDeltaMarkup(topImpactOnlyRelations, "No Impact-only relations")}
                </section>
            `;

            lastGroupCompareState = buildCompareSnapshot();
        };

        typeFilter?.addEventListener("change", () => {
            compareUiState.type = typeFilter.value || "all";
            renderCompareView();
        });

        searchFilter?.addEventListener("input", () => {
            compareUiState.query = searchFilter.value || "";
            renderCompareView();
        });

        sortFilter?.addEventListener("change", () => {
            compareUiState.sort = sortFilter.value || "impact_desc";
            renderCompareView();
        });

        exportJsonButton?.addEventListener("click", () => {
            if (!lastGroupCompareState) return;
            const safeName = safeFileName(data?.group?.displayName || groupId, "group");
            const fileName = `entramap-compare-${safeName}-${Date.now()}.json`;
            const blob = new Blob([JSON.stringify(lastGroupCompareState, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showToast("Compare JSON exported", "info");
        });

        exportCsvButton?.addEventListener("click", () => {
            if (!lastGroupCompareState) return;
            const safeName = safeFileName(data?.group?.displayName || groupId, "group");
            const rows = [[
                "section",
                "label",
                "id",
                "type",
                "severity",
                "score",
                "sourceType",
                "targetType",
                "relation",
                "count",
            ]];

            const pushNodes = (section, items) => {
                items.forEach(item => {
                    rows.push([
                        section,
                        item.label || "",
                        item.id || "",
                        item.type || "",
                        item.severity || "",
                        item.score || 0,
                        "",
                        "",
                        "",
                        "",
                    ]);
                });
            };

            pushNodes("standard_only_visible", lastGroupCompareState.visibleNodes.standardOnly || []);
            pushNodes("impact_only_visible", lastGroupCompareState.visibleNodes.impactOnly || []);
            pushNodes("overlap_visible", lastGroupCompareState.visibleNodes.overlap || []);

            (lastGroupCompareState.edgeDeltas.topStandardOnlyRelations || []).forEach(item => {
                rows.push([
                    "standard_only_edge_relations",
                    "",
                    "",
                    "",
                    "",
                    "",
                    item.sourceType || "",
                    item.targetType || "",
                    item.relation || "",
                    item.count || 0,
                ]);
            });

            (lastGroupCompareState.edgeDeltas.topImpactOnlyRelations || []).forEach(item => {
                rows.push([
                    "impact_only_edge_relations",
                    "",
                    "",
                    "",
                    "",
                    "",
                    item.sourceType || "",
                    item.targetType || "",
                    item.relation || "",
                    item.count || 0,
                ]);
            });

            const csv = rows.map(line => line.map(toCsvCell).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `entramap-compare-${safeName}-${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showToast("Compare CSV exported", "info");
        });

        renderCompareView();
        showToast("Group map comparison ready", "info");
    } catch (error) {
        lastGroupCompareState = null;
        panel.innerHTML = `
            <div class="gi-head">
                <div>
                    <div class="gi-kicker">Map Compare</div>
                    <div class="gi-title">Compare unavailable</div>
                </div>
                <span class="gi-state partial">Error</span>
            </div>
            <div class="gi-note">Network error: ${escHtml(error.message)}</div>
        `;
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
        if (item.tutorialKey) {
            row.dataset.tutorialResult = item.tutorialKey;
        }
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
    if (tutorialState.active) {
        const items = getTutorialSearchResults(query);
        renderSearchResults(items);
        return;
    }

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

function refreshActiveDetailPanel() {
    if (!cy || !activeNodeId) return;
    const node = cy.getElementById(activeNodeId);
    if (!node || !node.length) return;
    renderDetailPanel(node.data());
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
    syncTutorialProgressFromState();
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

    if (String(groupId || "").startsWith("tutorial-")) {
        const data = getTutorialImpactResult(groupId);
        if (data && requestId === groupImpactRequestId) {
            groupImpactCache.set(groupId, data);
            renderGroupImpact(data);
        }
        return;
    }

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
    if (String(groupId || "").startsWith("tutorial-")) {
        const data = getTutorialImpactResult(groupId);
        if (!data) return;
        const safeName = String(data?.group?.displayName || groupId)
            .replace(/[^a-z0-9\-_]+/gi, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) || "group";
        downloadTutorialFile(JSON.stringify(data, null, 2), `entramap-impact-${safeName}-${Date.now()}.json`, "application/json", "Tutorial impact report exported");
        return;
    }
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
        let data;
        if (String(groupId || "").startsWith("tutorial-")) {
            data = getTutorialImpactResult(groupId);
            if (!data) return;
        } else {
            const response = await fetch(`/api/impact/group/${groupId}`);
            data = await response.json();
            if (!response.ok) {
                showToast(data.error || "CSV export failed", "error");
                return;
            }
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
        downloadTutorialFile(csv, `entramap-impact-${safeName}-${Date.now()}.csv`, "text/csv;charset=utf-8;", String(groupId || "").startsWith("tutorial-") ? "Tutorial impact CSV exported" : "Impact CSV exported");
    } catch (error) {
        showToast(`CSV export failed: ${error.message}`, "error");
    }
}

async function exportGroupImpactTxt(groupId) {
    if (!groupId) return;
    if (String(groupId || "").startsWith("tutorial-")) {
        const data = getTutorialImpactResult(groupId);
        if (!data) return;
        const safeName = String(data?.group?.displayName || groupId)
            .replace(/[^a-z0-9\-_]+/gi, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) || "group";
        downloadTutorialFile(buildTutorialImpactTxt(data), `entramap-impact-${safeName}-${Date.now()}.txt`, "text/plain;charset=utf-8;", "Tutorial impact TXT exported");
        return;
    }
    try {
        const response = await fetch(`/api/impact/group/${groupId}/txt`);
        if (!response.ok) {
            let errorText = "TXT export failed";
            try {
                const data = await response.json();
                errorText = data?.error || errorText;
            } catch (_) {
            }
            showToast(errorText, "error");
            return;
        }

        const content = await response.text();
        const metaResponse = await fetch(`/api/impact/group/${groupId}`);
        const meta = await metaResponse.json();
        const groupName = String(meta?.group?.displayName || groupId);

        const safeName = groupName
            .replace(/[^a-z0-9\-_]+/gi, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) || "group";

        const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `entramap-impact-${safeName}-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Impact TXT exported", "info");
    } catch (error) {
        showToast(`TXT export failed: ${error.message}`, "error");
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
        const isDynamicGroup = data.groupTypes?.includes("DynamicMembership");
        if (data.groupTypes?.includes("Unified")) groupTypes.push("Microsoft 365");
        if (data.securityEnabled) groupTypes.push("Security");
        if (data.mailEnabled) groupTypes.push("Mail");
        if (isDynamicGroup) groupTypes.push("Dynamic");
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
        if (isDynamicGroup) {
            pushGroupRow("Membership", "Dynamic membership rule");
            pushGroupRow("Rule state", escHtml(data.membershipRuleProcessingState || "On"));
            pushGroupRow("Rule", escHtml(data.membershipRule || "—"), true);
        }
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
                <button class="dp-action-btn" type="button" onclick="exportGroupImpactTxt('${escHtml(data.id)}')"><i class="fas fa-file-lines"></i> Export impact TXT</button>
                <button id="btn-load-standard-map" class="dp-action-btn" type="button" onclick="loadStandardGroupMap('${escHtml(data.id)}')"><i class="fas fa-sitemap"></i> Load standard graph</button>
                <button id="btn-load-impact-map" class="dp-action-btn" type="button" onclick="loadGroupImpactMap('${escHtml(data.id)}')"><i class="fas fa-project-diagram"></i> Load impact graph</button>
                <button class="dp-action-btn" type="button" onclick="compareGroupMaps('${escHtml(data.id)}')"><i class="fas fa-code-compare"></i> Compare maps</button>
            </div>
        `);
        setGroupMapModeButtons(lastGroupMapMode);
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
        const userScope = conditions.users || {};
        const apps = conditions.applications?.includeApplications || [];
        const platforms = conditions.platforms?.includePlatforms || [];
        const controls = data.grantControls?.builtInControls || [];
        const includeGroups = userScope.includeGroups || [];
        const excludeGroups = userScope.excludeGroups || [];
        pushRow("Status", stateMap[data.state] || escHtml(data.state));
        if (includeGroups.length) pushRow("Included groups", includeGroups.includes("All") ? "All groups" : `${includeGroups.length} group(s)`);
        if (excludeGroups.length) pushRow("Excluded groups", `${excludeGroups.length} group(s)`);
        if (apps.length) pushRow("Apps", apps.includes("All") ? "All apps" : `${apps.length} app(s)`);
        if (platforms.length) pushRow("Platforms", escHtml(platforms.join(", ")));
        if (controls.length) pushRow("Required controls", escHtml(controls.join(", ")));
        if (data.grantControls?.operator) pushRow("Operator", escHtml(data.grantControls.operator));
        pushRow("Object ID", escHtml(data.id), true);
    }

    if (Number(data.impactNode || 0) === 1 && impactFilterState.explainMode) {
        pushRow("Impact domain", escHtml(formatDomainKeyLabel(data.impactDomainKey || data.impactDomain || "unknown")));
        pushRow("Impact severity", escHtml(String(data.impactSeverity || "warning").toUpperCase()));
        pushRow("Impact type", escHtml(formatImpactLabel(data.impactType || "linked")));
        pushRow("Explain", escHtml("Node is projected from Group Impact findings, not discovered from direct map traversal."));
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

    syncTutorialProgressFromState();
}

function copyIdFromBtn(button) {
    const value = button?.dataset?.copyId;
    if (!value) return;
    navigator.clipboard.writeText(value)
        .then(() => {
            tutorialState.lastCopiedId = value;
            const step = getCurrentTutorialStep();
            if (tutorialState.active && step?.completeBy?.copiedId === value) {
                advanceTutorialStep();
                return;
            }
            showToast("Object ID copied", "info");
        })
        .catch(() => showToast("Clipboard copy failed", "error"));
}

window.copyIdFromBtn = copyIdFromBtn;
window.loadStandardGroupMap = loadStandardGroupMap;
window.loadGroupImpactMap = loadGroupImpactMap;
window.compareGroupMaps = compareGroupMaps;
window.exportGroupImpactReport = exportGroupImpactReport;
window.exportGroupImpactCsv = exportGroupImpactCsv;
window.exportGroupImpactTxt = exportGroupImpactTxt;

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

function exportCurrentGraphView() {
    if (!cy || !cy.nodes().length) {
        showToast("No graph data to export yet", "error");
        return;
    }

    const visibleNodes = cy.nodes(":visible").map(node => ({
        id: node.id(),
        label: node.data("fullLabel") || node.data("label") || node.id(),
        type: node.data("type") || "",
        data: node.data(),
    }));
    const visibleEdges = cy.edges(":visible").map(edge => ({
        source: edge.source().id(),
        target: edge.target().id(),
        label: edge.data("label") || "",
        scopeKind: edge.data("scopeKind") || "",
        impactEdge: edge.data("impactEdge") || 0,
        impactSeverity: edge.data("impactSeverity") || "",
        impactDomainKey: edge.data("impactDomainKey") || "",
    }));

    const payload = {
        exportedAt: new Date().toISOString(),
        exportMode: "visible-view",
        context: {
            lastLoadedType,
            lastLoadedId,
            groupMapMode: lastGroupMapMode,
            impactFilters: impactFilterState,
        },
        summary: {
            nodes: visibleNodes.length,
            edges: visibleEdges.length,
        },
        graph: {
            nodes: visibleNodes,
            edges: visibleEdges,
        },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `entramap-export-view-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Filtered graph view exported", "info");
}

async function reloadCurrentContext() {
    if (!lastLoadedType || !lastLoadedId) return;
    if (lastLoadedType === "group" && lastGroupMapMode === "impact") {
        await loadGroupImpactMap(lastLoadedId);
        return;
    }
    await loadMap(lastLoadedType, lastLoadedId);
}

function bindToolbar() {
    getElement("btn-fit")?.addEventListener("click", () => {
        fitGraphInView();
    });

    getElement("btn-reset-layout")?.addEventListener("click", () => runLayout(true));
    getElement("btn-export-json")?.addEventListener("click", exportCurrentGraph);
    getElement("btn-export-view-json")?.addEventListener("click", exportCurrentGraphView);
    getElement("btn-refresh")?.addEventListener("click", () => {
        if (!lastLoadedType || !lastLoadedId) return;
        showToast("Reloading from Microsoft Graph...", "info");
        reloadCurrentContext();
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
                await reloadCurrentContext();
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

function normalizeKonamiKey(key) {
    if (!key) return "";
    if (key === "Spacebar" || key === "Space") return " ";
    if (key.length === 1) return key.toLowerCase();
    return key;
}

function showSignedOutNope() {
    let card = getElement("konami-nope");
    if (card) card.remove();

    card = document.createElement("div");
    card.id = "konami-nope";
    card.className = "konami-nope";
    card.innerHTML = `
        <div class="nope-figure" aria-hidden="true">
            <div class="nope-head">
                <span class="nope-eye"></span>
                <span class="nope-eye"></span>
            </div>
            <div class="nope-body"></div>
        </div>
        <div class="nope-bubble">Nope... you're not logged in.</div>
    `;
    document.body.appendChild(card);

    window.setTimeout(() => {
        card.classList.add("bye");
        window.setTimeout(() => card.remove(), 360);
    }, 2600);
}

function createAsteroidsRock(width, height, radiusMin = 18, radiusMax = 44) {
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;

    if (edge === 0) {
        x = Math.random() * width;
        y = -radius;
    } else if (edge === 1) {
        x = width + radius;
        y = Math.random() * height;
    } else if (edge === 2) {
        x = Math.random() * width;
        y = height + radius;
    } else {
        x = -radius;
        y = Math.random() * height;
    }

    const speed = 22 + Math.random() * 48;
    const angle = Math.random() * Math.PI * 2;
    const vertexCount = 8;
    const shape = [];
    for (let index = 0; index < vertexCount; index += 1) {
        shape.push(0.72 + Math.random() * 0.45);
    }

    return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        rot: (Math.random() - 0.5) * 0.9,
        angle: Math.random() * Math.PI * 2,
        shape,
    };
}

function closeMiniAsteroids() {
    asteroidsActive = false;
    asteroidsKeys = {};
    if (asteroidsRaf) {
        window.cancelAnimationFrame(asteroidsRaf);
        asteroidsRaf = null;
    }
    if (asteroidsUi?.root?.parentNode) {
        asteroidsUi.root.parentNode.removeChild(asteroidsUi.root);
    }
    asteroidsUi = null;
    asteroidsState = null;
}

function startMiniAsteroids() {
    if (asteroidsActive) {
        closeMiniAsteroids();
        return;
    }

    const rightPanel = getElement("right-panel");
    if (!rightPanel) return;

    const wrapper = document.createElement("div");
    wrapper.id = "asteroids-mini";
    wrapper.className = "asteroids-mini";
    wrapper.innerHTML = `
        <div class="asteroids-head">
            <div class="asteroids-title"><i class="fas fa-meteor"></i> Asteroids</div>
            <div class="asteroids-meta">
                <span id="asteroids-score">Score: 0</span>
                <span id="asteroids-lives">Lives: 3</span>
                <span id="asteroids-boss" class="d-none">Boss: 0%</span>
                <button id="asteroids-close" type="button" title="Close">Close</button>
            </div>
        </div>
        <div class="asteroids-stage">
            <canvas id="asteroids-canvas" width="520" height="300" aria-label="Mini Asteroids"></canvas>
            <div class="asteroids-scanlines" aria-hidden="true"></div>
        </div>
        <div class="asteroids-help">Controls: Left/Right rotate, Up thrust, Space shoot</div>
    `;
    rightPanel.appendChild(wrapper);

    const canvas = getElement("asteroids-canvas");
    const scoreLabel = getElement("asteroids-score");
    const livesLabel = getElement("asteroids-lives");
    const bossLabel = getElement("asteroids-boss");
    const closeBtn = getElement("asteroids-close");
    if (!canvas || !scoreLabel || !livesLabel || !bossLabel || !closeBtn) {
        closeMiniAsteroids();
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        closeMiniAsteroids();
        return;
    }

    closeBtn.addEventListener("click", closeMiniAsteroids);

    asteroidsActive = true;
    asteroidsUi = { root: wrapper, canvas, ctx, scoreLabel, livesLabel, bossLabel };

    const width = canvas.width;
    const height = canvas.height;
    asteroidsState = {
        lastTs: performance.now(),
        score: 0,
        lives: 3,
        invuln: 1.2,
        spawnTimer: 0,
        ship: {
            x: width / 2,
            y: height / 2,
            vx: 0,
            vy: 0,
            angle: -Math.PI / 2,
            radius: 10,
            cooldown: 0,
        },
        bullets: [],
        enemyShots: [],
        rocks: [createAsteroidsRock(width, height), createAsteroidsRock(width, height)],
        boss: null,
        bossSpawned: false,
        stars: Array.from({ length: 70 }, () => ({ x: Math.random() * width, y: Math.random() * height, a: 0.2 + Math.random() * 0.6 })),
    };

    const wrapPos = value => {
        if (value < 0) return value + width;
        if (value > width) return value - width;
        return value;
    };

    const wrapPosY = value => {
        if (value < 0) return value + height;
        if (value > height) return value - height;
        return value;
    };

    const drawShip = ship => {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 10);
        ctx.lineTo(0, 6);
        ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.strokeStyle = "#dbeafe";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (asteroidsKeys.ArrowUp) {
            ctx.beginPath();
            ctx.moveTo(-4, 10);
            ctx.lineTo(0, 16 + Math.random() * 5);
            ctx.lineTo(4, 10);
            ctx.strokeStyle = "#f59e0b";
            ctx.stroke();
        }
        ctx.restore();
    };

    const drawRock = rock => {
        ctx.save();
        ctx.translate(rock.x, rock.y);
        ctx.rotate(rock.angle);
        ctx.beginPath();
        rock.shape.forEach((scale, index) => {
            const theta = (Math.PI * 2 * index) / rock.shape.length;
            const px = Math.cos(theta) * rock.radius * scale;
            const py = Math.sin(theta) * rock.radius * scale;
            if (index === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
    };

    const drawBoss = boss => {
        const isEnraged = !!boss.enraged;
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.rotate(boss.angle);

        if (isEnraged) {
            ctx.beginPath();
            ctx.arc(0, 0, 28 + (Math.sin(performance.now() / 95) * 1.8), 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(251,113,133,.55)";
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isEnraged ? "#fb7185" : "#fca5a5";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-20, 8);
        ctx.lineTo(0, 16);
        ctx.lineTo(20, 8);
        ctx.strokeStyle = isEnraged ? "#f43f5e" : "#fb7185";
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -1, 4.2, 0, Math.PI * 2);
        ctx.strokeStyle = isEnraged ? "#fef08a" : "#fde68a";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
    };

    const spawnBoss = () => {
        asteroidsState.bossSpawned = true;
        // Give the player a small buffer when the boss phase starts.
        asteroidsState.lives = Math.min(5, asteroidsState.lives + 1);
        asteroidsState.boss = {
            x: width + 30,
            y: 70 + Math.random() * (height - 140),
            vx: -38,
            vy: 34,
            radius: 20,
            hp: 14,
            maxHp: 14,
            angle: 0,
            shotCooldown: 0.5,
            enraged: false,
            volley: 0,
        };
        showToast("Boss incoming!", "info");
    };

    const fireBossShot = (boss, directionAngle, speed) => {
        if (!asteroidsState) return;
        asteroidsState.enemyShots.push({
            x: boss.x,
            y: boss.y,
            vx: Math.cos(directionAngle) * speed,
            vy: Math.sin(directionAngle) * speed,
            life: 2.0,
        });
    };

    const triggerStageFlash = () => {
        const root = asteroidsUi?.root;
        if (!root) return;
        root.classList.remove("enrage-flash");
        // Force reflow to restart animation for future enrages.
        void root.offsetWidth;
        root.classList.add("enrage-flash");
    };

    const respawnShip = () => {
        const ship = asteroidsState.ship;
        ship.x = width / 2;
        ship.y = height / 2;
        ship.vx = 0;
        ship.vy = 0;
        ship.angle = -Math.PI / 2;
        asteroidsState.invuln = 1.5;
    };

    const splitRock = rock => {
        const nextRadius = rock.radius * 0.62;
        if (nextRadius < 14) return [];
        return [
            createAsteroidsRock(width, height, nextRadius, nextRadius + 2),
            createAsteroidsRock(width, height, nextRadius, nextRadius + 2),
        ].map(child => ({ ...child, x: rock.x, y: rock.y }));
    };

    const tick = ts => {
        if (!asteroidsActive || !asteroidsUi || !asteroidsState) return;

        const dt = clamp((ts - asteroidsState.lastTs) / 1000, 0, 0.04);
        asteroidsState.lastTs = ts;

        const state = asteroidsState;
        const ship = state.ship;
        ship.cooldown = Math.max(0, ship.cooldown - dt);
        state.invuln = Math.max(0, state.invuln - dt);
        state.spawnTimer = Math.max(0, state.spawnTimer - dt);

        if (asteroidsKeys.ArrowLeft) ship.angle -= 3.8 * dt;
        if (asteroidsKeys.ArrowRight) ship.angle += 3.8 * dt;
        if (asteroidsKeys.ArrowUp) {
            ship.vx += Math.cos(ship.angle) * 110 * dt;
            ship.vy += Math.sin(ship.angle) * 110 * dt;
        }

        ship.vx *= 0.994;
        ship.vy *= 0.994;
        ship.x = wrapPos(ship.x + ship.vx * dt);
        ship.y = wrapPosY(ship.y + ship.vy * dt);

        if (asteroidsKeys[" "] && ship.cooldown <= 0) {
            ship.cooldown = 0.19;
            state.bullets.push({
                x: ship.x,
                y: ship.y,
                vx: Math.cos(ship.angle) * 240 + ship.vx,
                vy: Math.sin(ship.angle) * 240 + ship.vy,
                life: 1.1,
            });
        }

        state.bullets = state.bullets
            .map(bullet => ({
                ...bullet,
                x: wrapPos(bullet.x + bullet.vx * dt),
                y: wrapPosY(bullet.y + bullet.vy * dt),
                life: bullet.life - dt,
            }))
            .filter(bullet => bullet.life > 0);

        state.enemyShots = state.enemyShots
            .map(shot => ({
                ...shot,
                x: wrapPos(shot.x + shot.vx * dt),
                y: wrapPosY(shot.y + shot.vy * dt),
                life: shot.life - dt,
            }))
            .filter(shot => shot.life > 0);

        state.rocks = state.rocks.map(rock => ({
            ...rock,
            x: wrapPos(rock.x + rock.vx * dt),
            y: wrapPosY(rock.y + rock.vy * dt),
            angle: rock.angle + rock.rot * dt,
        }));

        const newRocks = [];
        const hitBullets = new Set();
        const hitRocks = new Set();

        state.rocks.forEach((rock, rockIndex) => {
            state.bullets.forEach((bullet, bulletIndex) => {
                const dx = bullet.x - rock.x;
                const dy = bullet.y - rock.y;
                if ((dx * dx + dy * dy) <= (rock.radius * rock.radius)) {
                    hitBullets.add(bulletIndex);
                    hitRocks.add(rockIndex);
                }
            });
        });

        if (hitBullets.size || hitRocks.size) {
            state.bullets = state.bullets.filter((_, index) => !hitBullets.has(index));
            state.rocks = state.rocks.filter((rock, index) => {
                if (!hitRocks.has(index)) return true;
                state.score += Math.round(22 + rock.radius);
                if (!state.boss) {
                    splitRock(rock).forEach(child => newRocks.push(child));
                }
                return false;
            });
            state.rocks.push(...newRocks);
        }

        if (!state.bossSpawned && state.score >= 500) {
            spawnBoss();
        }

        if (state.boss) {
            const boss = state.boss;
            const hpRatio = boss.hp / boss.maxHp;
            if (!boss.enraged && hpRatio <= 0.3) {
                boss.enraged = true;
                triggerStageFlash();
                showToast("Boss enraged!", "error");
            }

            const targetSpeedX = boss.enraged ? 30 : 22;
            const targetSpeedY = boss.enraged ? 24 : 18;
            const signX = boss.vx >= 0 ? 1 : -1;
            const signY = boss.vy >= 0 ? 1 : -1;
            boss.vx = signX * targetSpeedX;
            boss.vy = signY * targetSpeedY;

            boss.x += boss.vx * dt;
            boss.y += boss.vy * dt;
            boss.angle += (boss.enraged ? 0.9 : 0.45) * dt;
            boss.shotCooldown = Math.max(0, boss.shotCooldown - dt);

            if (boss.y < 30 || boss.y > height - 30) {
                boss.vy *= -1;
            }

            if (boss.x < width * 0.58) {
                boss.vx = Math.abs(boss.vx);
            }
            if (boss.x > width - 22) {
                boss.vx = -Math.abs(boss.vx);
            }

            if (boss.shotCooldown <= 0) {
                boss.volley += 1;
                const dx = ship.x - boss.x;
                const dy = ship.y - boss.y;
                const dist = Math.hypot(dx, dy) || 1;
                const baseAngle = Math.atan2(dy / dist, dx / dist);
                const shotSpeed = boss.enraged ? 140 : 110;
                fireBossShot(boss, baseAngle, shotSpeed);
                if (boss.enraged && boss.volley % 3 === 0) {
                    const offset = Math.random() < 0.5 ? -0.18 : 0.18;
                    fireBossShot(boss, baseAngle + offset, shotSpeed * 0.86);
                }
                boss.shotCooldown = boss.enraged ? (1.0 + Math.random() * 0.32) : (1.6 + Math.random() * 0.35);
            }

            const bossHitBullets = new Set();
            state.bullets.forEach((bullet, bulletIndex) => {
                const dx = bullet.x - boss.x;
                const dy = bullet.y - boss.y;
                if ((dx * dx + dy * dy) <= (boss.radius * boss.radius)) {
                    bossHitBullets.add(bulletIndex);
                    boss.hp -= 1;
                    state.score += 15;
                }
            });
            if (bossHitBullets.size) {
                state.bullets = state.bullets.filter((_, index) => !bossHitBullets.has(index));
            }

            if (boss.hp <= 0) {
                state.score += 350;
                state.boss = null;
                showToast("Boss defeated!", "info");
            }
        }

        if (state.invuln <= 0) {
            for (let index = 0; index < state.rocks.length; index += 1) {
                const rock = state.rocks[index];
                const dx = ship.x - rock.x;
                const dy = ship.y - rock.y;
                const r = ship.radius + (rock.radius * 0.88);
                if ((dx * dx + dy * dy) <= (r * r)) {
                    state.lives -= 1;
                    if (state.lives <= 0) {
                        closeMiniAsteroids();
                        showToast("Asteroids over. Try Konami again.", "info");
                        return;
                    }
                    respawnShip();
                    break;
                }
            }

            if (state.boss) {
                const dx = ship.x - state.boss.x;
                const dy = ship.y - state.boss.y;
                const r = ship.radius + state.boss.radius;
                if ((dx * dx + dy * dy) <= (r * r)) {
                    state.lives -= 1;
                    if (state.lives <= 0) {
                        closeMiniAsteroids();
                        showToast("Asteroids over. Try Konami again.", "info");
                        return;
                    }
                    respawnShip();
                }
            }

            for (let index = 0; index < state.enemyShots.length; index += 1) {
                const shot = state.enemyShots[index];
                const dx = ship.x - shot.x;
                const dy = ship.y - shot.y;
                const r = ship.radius + 2;
                if ((dx * dx + dy * dy) <= (r * r)) {
                    state.enemyShots.splice(index, 1);
                    state.lives -= 1;
                    if (state.lives <= 0) {
                        closeMiniAsteroids();
                        showToast("Asteroids over. Try Konami again.", "info");
                        return;
                    }
                    respawnShip();
                    break;
                }
            }
        }

        // During boss phase, keep ambient asteroid pressure low.
        const maxRocks = state.boss ? 2 : 6;
        if (state.rocks.length > maxRocks) {
            state.rocks = state.rocks
                .slice()
                .sort((a, b) => (a.radius - b.radius))
                .slice(0, maxRocks);
        }

        if (state.rocks.length < maxRocks && state.spawnTimer <= 0) {
            state.spawnTimer = state.boss ? 2.7 : 1.2;
            state.rocks.push(createAsteroidsRock(width, height));
        }

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#070a14";
        ctx.fillRect(0, 0, width, height);

        state.stars.forEach(star => {
            ctx.fillStyle = `rgba(165,180,252,${star.a})`;
            ctx.fillRect(star.x, star.y, 1.5, 1.5);
        });

        state.rocks.forEach(drawRock);

        if (state.boss) {
            drawBoss(state.boss);
        }

        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 1.5;
        state.bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
            ctx.stroke();
        });

        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1.4;
        state.enemyShots.forEach(shot => {
            ctx.beginPath();
            ctx.arc(shot.x, shot.y, 2.2, 0, Math.PI * 2);
            ctx.stroke();
        });

        if (state.invuln > 0 && Math.floor(ts / 120) % 2 === 0) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            drawShip(ship);
            ctx.restore();
        } else {
            drawShip(ship);
        }

        asteroidsUi.scoreLabel.textContent = `Score: ${state.score}`;
        asteroidsUi.livesLabel.textContent = `Lives: ${state.lives}`;
        if (state.boss) {
            const pct = Math.max(0, Math.round((state.boss.hp / state.boss.maxHp) * 100));
            asteroidsUi.bossLabel.classList.remove("d-none");
            asteroidsUi.bossLabel.classList.toggle("enraged", !!state.boss.enraged);
            asteroidsUi.bossLabel.textContent = state.boss.enraged ? `Boss: ${pct}% ENRAGED` : `Boss: ${pct}%`;
        } else {
            asteroidsUi.bossLabel.classList.add("d-none");
            asteroidsUi.bossLabel.classList.remove("enraged");
            asteroidsUi.bossLabel.textContent = "Boss: 0%";
        }
        asteroidsRaf = window.requestAnimationFrame(tick);
    };

    asteroidsRaf = window.requestAnimationFrame(tick);
}

function triggerKonamiEasterEgg() {
    if (!APP_CONTEXT.signedIn) {
        showSignedOutNope();
        return;
    }
    startMiniAsteroids();
}

function bindKonamiEasterEgg() {
    document.addEventListener("keydown", event => {
        if (asteroidsActive) {
            const key = normalizeKonamiKey(event.key);
            if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(key)) {
                event.preventDefault();
            }
            asteroidsKeys[key] = true;
            return;
        }

        const key = normalizeKonamiKey(event.key);
        const expected = KONAMI_SEQUENCE[konamiProgress];

        if (key === expected) {
            konamiProgress += 1;
            if (konamiResetTimer) window.clearTimeout(konamiResetTimer);
            konamiResetTimer = window.setTimeout(() => {
                konamiProgress = 0;
            }, 2600);

            if (konamiProgress >= KONAMI_SEQUENCE.length) {
                konamiProgress = 0;
                if (konamiResetTimer) {
                    window.clearTimeout(konamiResetTimer);
                    konamiResetTimer = null;
                }
                triggerKonamiEasterEgg();
            }
            return;
        }

        if (key === KONAMI_SEQUENCE[0]) {
            konamiProgress = 1;
            return;
        }
        konamiProgress = 0;
    });

    document.addEventListener("keyup", event => {
        if (!asteroidsActive) return;
        const key = normalizeKonamiKey(event.key);
        delete asteroidsKeys[key];
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

function bindTutorialUi() {
    tutorialState.progress = loadTutorialProgress();

    const launchButton = getElement("btn-start-tutorial");
    const picker = getElement("tutorial-level-picker");
    const inlineStopButton = getElement("tutorial-stop-inline");
    if (!launchButton || !picker) return;

    launchButton.innerHTML = '<i class="fas fa-route"></i> Start Interactive Tutorial';
    const levelTitle = picker.querySelector(".tutorial-level-title");
    if (levelTitle) levelTitle.textContent = "Choose your tutorial level";
    const basicButton = picker.querySelector(".tutorial-level-btn[data-tutorial-phase='basic']");
    if (basicButton) basicButton.textContent = "1. Basic";

    const refreshPickerLabels = () => {
        picker.querySelectorAll(".tutorial-level-btn").forEach(button => {
            const phaseKey = button.getAttribute("data-tutorial-phase") || "";
            const isDone = !!tutorialState.progress?.[phaseKey]?.done;
            button.textContent = button.textContent.replace(" ✓", "");
            if (isDone) button.textContent = `${button.textContent} ✓`;
        });
    };

    updateTutorialLauncherBadge();
    updateSignedOutTutorialBanner();
    refreshPickerLabels();

    inlineStopButton?.addEventListener("click", () => {
        if (!tutorialState.active) return;
        stopTutorial("Tutorial stopped.", { fromUserStop: true });
    });

    launchButton.addEventListener("click", () => {
        const isHidden = picker.classList.contains("d-none");
        picker.classList.toggle("d-none", !isHidden);
        if (isHidden) refreshPickerLabels();
    });

    picker.querySelectorAll(".tutorial-level-btn").forEach(button => {
        button.addEventListener("click", () => {
            const phaseKey = button.getAttribute("data-tutorial-phase") || "";
            startTutorialPhase(phaseKey);
        });
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
    loadImpactFilterState();
    initCytoscape();
    setupAuthOverlayTabs();
    setupAuthPermissionAccordion();
    setupMicrosoftSignInPopup();
    bindSignedOutTutorialLaunch();
    bindDisconnectLightbox();
    bindToolbar();
    bindSearchUi();
    bindTutorialUi();
    bindDetailAndRail();
    bindInsightButtons();
    bindKonamiEasterEgg();
    setupSessionTimeout();

    if (APP_CONTEXT.signedIn) {
        enableSignedInMode();
    } else {
        enableSignedOutMode();
    }

    runHealthCheck();
});
