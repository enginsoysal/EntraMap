const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname, '../..');
const script = fs.readFileSync(path.join(root,'static/js/docs.js'),'utf8');
function page(hash='') {
  const dom = new JSDOM(`<input id="docs-search"><button id="docs-clear"></button><button id="docs-print"></button><p id="search-status">2 chapters</p><p id="no-results" hidden></p><nav id="chapter-nav"><a href="#alpha">Alpha</a><a href="#beta">Beta</a></nav><section class="chapter" id="alpha" data-search="Export CSV evidence"><article id="control-export"></article></section><section class="chapter" id="beta" data-search="Unknown coverage"><article id="control-unknown"></article></section><section id="button-index"><ul><li><a href="#control-unknown">Unknown</a></li><li><a href="#control-export">Export</a></li></ul></section>`,{url:'https://entramap.com/docs'+hash,runScripts:'outside-only'});
  dom.window.HTMLElement.prototype.scrollIntoView = function() {this.dataset.scrolled='yes';};
  dom.window.eval(script);
  return dom;
}
function search(dom, value) {const input=dom.window.document.getElementById('docs-search');input.value=value;input.dispatchEvent(new dom.window.Event('input'));}
test('search combines terms case-insensitively and preserves chapter context',()=>{
  const dom=page(), d=dom.window.document; search(dom,'CSV EXPORT');
  assert.equal(d.getElementById('alpha').hidden,false);assert.equal(d.getElementById('beta').hidden,true);
  assert.equal(d.getElementById('search-status').textContent,'1 matching chapter');dom.window.close();
});
test('no-result state and clear restore navigation and keyboard focus',()=>{
  const dom=page(),d=dom.window.document;search(dom,'<img onerror=alert(1)>');
  assert.equal(d.getElementById('no-results').hidden,false);assert.equal(d.querySelectorAll('img').length,0);
  d.getElementById('docs-clear').click();assert.equal(d.querySelectorAll('.chapter[hidden]').length,0);
  assert.equal(d.activeElement.id,'docs-search');assert.equal(d.getElementById('search-status').textContent,'2 chapters');dom.window.close();
});
test('index deeplink reveals chapter hidden by search including same hash',()=>{
  const dom=page('#control-export'),d=dom.window.document;search(dom,'unknown');
  d.querySelector('#button-index a[href="#control-export"]').click();
  assert.equal(d.getElementById('alpha').hidden,false);assert.equal(d.getElementById('docs-search').value,'');
  assert.equal(d.querySelector('#chapter-nav a').getAttribute('aria-current'),'location');dom.window.close();
});
test('malformed fragment does not break search and control index sorts',()=>{
  const dom=page('#%ZZ'),d=dom.window.document;search(dom,'coverage');
  assert.equal(d.getElementById('beta').hidden,false);assert.equal(d.querySelector('#button-index a').textContent,'Export');dom.window.close();
});
test('print button invokes browser print',()=>{
  const dom=page();let prints=0;dom.window.print=()=>prints++;dom.window.document.getElementById('docs-print').click();assert.equal(prints,1);dom.window.close();
});

// Exercise the actual map functions with a DOM and mocked data boundary.
const main = fs.readFileSync(path.join(root,'static/js/main.js'),'utf8');
function functionSource(name, nextName) {return main.slice(main.indexOf(`async function ${name}(`), main.indexOf(nextName, main.indexOf(`async function ${name}(`)));}
test('guest tutorial compare renders synthetic data but guest live compare stays gated',async()=>{
  const source = functionSource('compareGroupMaps','function renderSearch');
  const dom=new JSDOM('<div id="group-impact-panel"></div>',{runScripts:'outside-only'});
  dom.window.eval(`const APP_CONTEXT={signedIn:false}; const tutorialState={active:true}; const getElement=id=>document.getElementById(id); const calls=[]; function showToast(m){calls.push(m)} function renderTutorialComparePanel(p,id){p.textContent=id;calls.push('demo')} ${source}\nwindow.run=compareGroupMaps;window.calls=calls;`);
  await dom.window.run('tutorial-group-1');assert.deepEqual(Array.from(dom.window.calls),['demo']);
  await dom.window.run('live-group');assert.equal(dom.window.calls.at(-1),'Sign in required');dom.window.close();
});
test('tutorial projection rebuild preserves comparison export buttons and handlers',()=>{
  const start=main.indexOf('function renderTutorialComparePanel(');
  const end=main.indexOf('\nfunction ',start+10);
  const dom=new JSDOM('<div id="group-impact-panel"></div>',{runScripts:'outside-only'});
  dom.window.eval(`const getElement=id=>document.getElementById(id);const escHtml=String;const calls=[];function setDetailTab(){} function showToast(m){calls.push(m)} function loadTutorialMap(type,id,mode){document.body.innerHTML='<div id="group-impact-panel"></div>';calls.push(mode)} ${main.slice(start,end)}\nrenderTutorialComparePanel(getElement('group-impact-panel'),'tutorial-group-1');window.calls=calls;`);
  const d=dom.window.document;
  d.getElementById('gi-compare-open-impact').click();
  assert.ok(d.getElementById('gi-compare-export-json'));
  d.getElementById('gi-compare-export-json').click();
  d.getElementById('gi-compare-export-csv').click();
  assert.deepEqual(Array.from(dom.window.calls),['impact','Tutorial compare JSON export complete','Tutorial compare CSV export complete']);
  dom.window.close();
});
