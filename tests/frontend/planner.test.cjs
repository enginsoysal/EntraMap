const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {JSDOM} = require('jsdom');
const root = join(__dirname, '../..');
const html = readFileSync(join(root, 'templates/planner.html'), 'utf8');
const script = readFileSync(join(root, 'static/js/planner.js'), 'utf8');
const envelope = (id) => ({signature: 'signed', data: {id, demo: true, capturedAt: '2026-09-30T12:00:00Z', result: {group: {id, displayName: '<img src=x onerror=alert(1)>'}, domains: [{key: 'enterprise_apps', status: 'ok'}]}}});
const labs = {before: envelope('source'), replacement: envelope('target'), after: envelope('later'), unavailable: envelope('unknown')};
function report(body) {
  const status = body.after.data.id === 'unknown' ? 'unknown' : 'changed';
  return {mode: body.mode, counts: {[status]: 1}, notes: ['Review required'], limitations: status === 'unknown' ? [{domain: 'enterprise_apps', before: 'ok', after: 'partial'}] : [], membership: null, rows: [{status, name: '<script>bad()</script>', domain: 'enterprise_apps', resourceId: 'app', before: [], after: []}]};
}
function setup(t, signedIn = false, override) {
  const dom = new JSDOM(html, {url: 'https://entramap.test/planner', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window; w.document.body.dataset.signedIn = String(signedIn);
  const calls = [], downloads = [];
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function() {downloads.push({name: this.download, attached: this.isConnected});};
  w.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined; calls.push({url, body, options});
    const response = override?.(url, body);
    if (response) return response;
    return {ok: true, json: async () => url.includes('/demo/') ? structuredClone(labs) : url.includes('/compare') ? report(body) : [], blob: async () => new w.Blob(['dossier'])};
  };
  w.eval(script);
  const $ = id => w.document.getElementById(id);
  const settle = async () => {for (let i=0; i<6; i++) await new Promise(resolve => setImmediate(resolve));};
  const click = async id => {$(id).click(); await settle();};
  const lab = async () => {w.document.querySelector('[data-lab]').click(); await settle();};
  return {w, $, calls, downloads, click, lab, settle};
}
test('lab shows evidence, escapes tenant text and enables comparison', async t => {
  const x = setup(t); await x.lab();
  assert.equal(x.$('report').hidden, false); assert.equal(x.$('run-compare').disabled, false);
  assert.match(x.$('report-rows').textContent, /<script>bad/);
  assert.equal(x.$('report-rows').querySelector('script'), null);
  assert.equal(x.$('before-summary').querySelector('img'), null);
});
test('visibility loss remains unknown with a coverage warning', async t => {
  const x = setup(t); await x.lab(); await x.click('demo-unavailable');
  assert.match(x.$('coverage-issues').textContent, /Incomplete comparison/);
  assert.match(x.$('report-counts').textContent, /unknown/);
  assert.equal(x.calls.at(-1).body.mode, 'verification');
});
test('changing mode invalidates the displayed report', async t => {
  const x = setup(t); await x.lab(); x.$('compare-mode').value='verification';
  x.$('compare-mode').dispatchEvent(new x.w.Event('change'));
  assert.equal(x.$('report').hidden, true);
});
test('signed-out live scan gives a useful error without a request', async t => {
  const x = setup(t); await x.click('capture-before');
  assert.match(x.$('planner-status').textContent, /Sign in/); assert.equal(x.calls.length, 0);
});
test('failed fresh capture clears previous snapshots and restores controls', async t => {
  const x = setup(t, true, url => url.endsWith('/scan') ? {ok:false, json:async()=>({error:'Graph unavailable'})} : null);
  await x.lab(); x.$('source-query').value='group'; await x.click('capture-before');
  assert.match(x.$('planner-status').textContent, /Graph unavailable/);
  assert.equal(x.$('save-before').disabled, true); assert.equal(x.$('save-after').disabled, true);
  assert.equal(x.$('run-compare').disabled, true); assert.equal(x.$('capture-before').disabled, false);
});
test('export carries exact selected evidence and pseudonymization preference', async t => {
  const x = setup(t); await x.lab(); x.$('pseudonymize').checked=true; await x.click('export-json');
  const c=x.calls.at(-1); assert.equal(c.body.before.data.id, 'source'); assert.equal(c.body.after.data.id, 'target');
  assert.equal(c.body.pseudonymize, true); assert.equal(c.options.headers['X-EntraMap-Request'], 'planner');
  assert.deepEqual(x.downloads, [{name:'entramap-change-dossier.json', attached:true}]);
});
test('original snapshot download uses an attached link', async t => {
  const x = setup(t); await x.lab(); await x.click('save-before');
  assert.deepEqual(x.downloads, [{name:'entramap-before-snapshot.json', attached:true}]);
});
test('invalid import cannot replace a captured snapshot', async t => {
  const x = setup(t); await x.lab();
  Object.defineProperty(x.$('import-before'), 'files', {value:[{size:10, text:async()=>'{"report":{}}'}]});
  x.$('import-before').dispatchEvent(new x.w.Event('change')); await x.settle();
  assert.match(x.$('planner-status').textContent, /original snapshot/);
  await x.click('run-compare'); assert.equal(x.calls.at(-1).body.before.data.id, 'source');
});
test('relationship rail renders enterprise applications and generic dependencies', t => {
  const x=setup(t);
  x.w.document.body.innerHTML='<aside id="relationship-rail" class="d-none"><h2 id="rr-title"></h2><div id="rr-groups"></div></aside>';
  const main=readFileSync(join(root,'static/js/main.js'),'utf8');
  const code=main.slice(main.indexOf('function renderRelationshipRail('), main.indexOf('function renderGraph('));
  const makeNode=(id,type)=>({length:1,id:()=>id,data:key=>({type,label:id})[key]});
  const source=makeNode('source','group');
  source.connectedEdges=()=>['enterprise_app','impact_resource'].map(type=>({source:()=>source,target:()=>makeNode(type,type),data:()=>''}));
  x.w.cy={getElementById:()=>source};
  x.w.TYPE_META=Object.fromEntries(['user','group','device','app','enterprise_app','impact_resource','ca_policy'].map(type=>[type,{label:type,icon:'test'}]));
  x.w.getElement=x.$; x.w.escHtml=String; x.w.impactFilterState={explainMode:false};
  x.w.eval(code+'\nrenderRelationshipRail("source");');
  assert.equal(x.$('rr-groups').querySelectorAll('.rr-chip').length,2);
  assert.match(x.$('rr-groups').textContent,/enterprise_app/);
  assert.equal(x.$('relationship-rail').classList.contains('d-none'),false);
});
