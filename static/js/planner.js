"use strict";
(() => {
    const $ = id => document.getElementById(id);
    const signedIn = document.body.dataset.signedIn === "true";
    const state = { before: null, after: null, report: null, demo: null, busy: false };
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    function status(message, error = false) { $("planner-status").textContent = message; $("planner-status").classList.toggle("error", error); }
    async function api(path, body) {
        const response = await fetch(path, body === undefined ? {} : {method:"POST", headers:{"Content-Type":"application/json","X-EntraMap-Request":"planner"}, body:JSON.stringify(body)});
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed (${response.status})`); }
        return response;
    }
    function summary(which) {
        const item = state[which]?.data;
        const target = $(`${which}-summary`);
        if (!item) { target.textContent = "No scan captured."; return; }
        const domains = item.result.domains;
        target.innerHTML = `<strong>${esc(item.result.group.displayName)}</strong><small>${esc(item.demo ? "SYNTHETIC LAB" : "LIVE TENANT SCAN")} · ${esc(item.capturedAt)}</small><small>${esc(item.id)}</small><p>${domains.filter(d => d.status === "ok").length}/${domains.length} domains read without recorded collection issues.</p>`;
        $(`save-${which}`).disabled = false;
    }
    function invalidate() { state.report = null; $("report").hidden = true; $("run-compare").disabled = !(state.before && state.after); }
    async function action(fn) {
        if (state.busy) return;
        state.busy = true;
        document.querySelectorAll("button,input,select").forEach(el => { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; });
        try { await fn(); } catch (error) { status(error.message, true); }
        finally { state.busy = false; document.querySelectorAll("button,input,select").forEach(el => {el.disabled = el.dataset.wasDisabled === "true";}); $("run-compare").disabled = !(state.before && state.after); $("save-before").disabled = !state.before; $("save-after").disabled = !state.after; }
    }
    function payload() { return {before:state.before, after:state.after, mode:$("compare-mode").value}; }
    function renderRows() {
        const filter = $("row-filter").value;
        const rows = state.report.rows.filter(r => filter === "all" || (filter === "unknown" ? r.status === "unknown" : !["equivalent","removed"].includes(r.status)));
        $("report-rows").innerHTML = rows.map(r => `<details class="finding ${esc(r.status)}"><summary><span class="badge">${esc(r.status.replaceAll("_", " "))}</span>${esc(r.name)}</summary><div class="path">${esc(state.before.data.result.group.displayName)} → ${esc(r.domain.replaceAll("_", " "))} → ${esc(r.resourceId)}</div><div class="evidence"><div><strong>Baseline evidence</strong><pre>${esc(JSON.stringify(r.before, null, 2))}</pre></div><div><strong>Comparison evidence</strong><pre>${esc(JSON.stringify(r.after, null, 2))}</pre></div></div></details>`).join("") || "<p>No findings in this view. Check coverage limitations before drawing conclusions.</p>";
    }
    async function compareNow() {
        status("Comparing signed scan evidence…");
        const report = await (await api("/api/planner/compare", payload())).json();
        state.report = report;
        $("report").hidden = false;
        $("report-title").textContent = report.mode === "replacement" ? "Replacement readiness" : "Changes since the baseline";
        $("report-counts").innerHTML = Object.entries(report.counts).map(([k,v]) => `<span><b>${v}</b>${esc(k.replaceAll("_", " "))}</span>`).join("");
        $("report-notes").innerHTML = report.notes.map(n => `<p>${esc(n)}</p>`).join("");
        $("coverage-issues").innerHTML = report.limitations.length ? `<div class="warning"><strong>Incomplete comparison: ${report.limitations.length} domain(s)</strong>${report.limitations.map(l => `<p>${esc(l.domain)}: ${esc(l.before)} → ${esc(l.after)}</p>`).join("")}</div>` : "<p>Both scans completed their configured domain collections. This is not an effective-access guarantee.</p>";
        const m = report.membership;
        $("member-diff").innerHTML = m ? `<p>Direct members: <strong>${m.shared}</strong> shared · <strong>${m.onlyBefore.length}</strong> only in baseline · <strong>${m.onlyAfter.length}</strong> only in comparison.</p><details><summary>Inspect membership differences</summary><pre>${esc(JSON.stringify(m, null, 2))}</pre></details>` : "";
        renderRows(); status("Comparison ready. Review differences and collection limitations before planning any change.");
    }
    async function search(which) {
        if (!signedIn) throw new Error("Sign in from the relationship map to search your tenant, or choose a synthetic lab.");
        const q = $(`${which}-query`).value.trim();
        if (q.length < 2) throw new Error("Enter at least two characters.");
        const items = await (await api(`/api/search?type=group&q=${encodeURIComponent(q)}`)).json();
        const results = $(`${which}-results`); results.replaceChildren();
        items.forEach(item => {const b = document.createElement("button"); b.textContent = `${item.label} · ${item.id}`; b.onclick = () => {$(`${which}-query`).value = item.id; results.replaceChildren();}; results.appendChild(b);});
        status(items.length ? "Select a group from the results." : "No matching groups returned.");
    }
    async function scan(which, source) {
        if (!signedIn) throw new Error("Sign in from the relationship map to capture a live scan.");
        let groupId = source ? state.before?.data.result.group.id : $(which === "before" ? "source-query" : "target-query").value.trim();
        if (source && state.before?.data.demo) throw new Error("Use the demo verification buttons for synthetic scans.");
        if (!groupId) throw new Error("Choose a group first.");
        if (which === "before") {state.after = null; summary("after");}
        state[which] = null; summary(which); state.demo = null; $("demo-actions").hidden = true; invalidate();
        status("Capturing fresh Graph evidence across all configured domains. Large tenants may take several minutes; keep this page open.");
        const value = await (await api("/api/planner/scan", {groupId})).json();
        state[which] = value; summary(which); invalidate();
        $("compare-mode").value = source ? "verification" : "replacement";
        status("Fresh scan captured. Save this snapshot to retain it outside this page.");
    }
    function download(blob, name) {const a=document.createElement("a");const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    document.querySelectorAll("[data-lab]").forEach(button => button.onclick = () => action(async () => {
        state.demo = await (await api(`/api/planner/demo/${button.dataset.lab}`)).json();
        state.before = state.demo.before; state.after = state.demo.replacement;
        summary("before"); summary("after"); invalidate(); $("compare-mode").value = "replacement"; $("demo-actions").hidden = false; await compareNow();
    }));
    $("search-source").onclick = () => action(() => search("source"));
    $("search-target").onclick = () => action(() => search("target"));
    $("capture-before").onclick = () => action(() => scan("before",false));
    $("capture-target").onclick = () => action(() => scan("after",false));
    $("capture-after").onclick = () => action(() => scan("after",true));
    $("run-compare").onclick = () => action(compareNow);
    $("compare-mode").onchange = invalidate;
    $("row-filter").onchange = renderRows;
    for (const [id,key] of [["demo-verify","after"],["demo-unavailable","unavailable"]]) $(id).onclick = () => action(async () => {state.after=state.demo[key];summary("after");$("compare-mode").value="verification";await compareNow();});
    for (const which of ["before","after"]) {
        $(`save-${which}`).onclick = () => download(new Blob([JSON.stringify(state[which],null,2)],{type:"application/json"}),`entramap-${which}-snapshot.json`);
        $(`import-${which}`).onchange = event => action(async () => {
            const file=event.target.files[0]; event.target.value=""; if(!file)return;if(file.size>4*1024*1024)throw new Error("Snapshot exceeds 4 MB.");
            const value=JSON.parse(await file.text());
            if(!value?.signature || !Array.isArray(value?.data?.result?.domains) || !value?.data?.result?.group?.id)throw new Error("Choose an original snapshot, not a dossier or pseudonymized export.");
            state[which]=value;state.demo=null;$("demo-actions").hidden=true;summary(which);invalidate();status("Snapshot loaded. Signature and account ownership will be verified when comparing.");
        });
    }
    for (const format of ["json","html"]) $(`export-${format}`).onclick = () => action(async () => {
        const response=await api("/api/planner/export",{...payload(),format,pseudonymize:$("pseudonymize").checked});
        download(await response.blob(),`entramap-change-dossier.${format}`);status("Dossier exported from the selected snapshots.");
    });
})();
