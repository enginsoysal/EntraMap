(() => {
  'use strict';
  const input = document.getElementById('docs-search');
  const chapters = [...document.querySelectorAll('.chapter')];
  const links = [...document.querySelectorAll('#chapter-nav a')];
  const status = document.getElementById('search-status');
  const initialStatus = status.textContent;
  function filter() {
    const terms = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    chapters.forEach((chapter, i) => {
      const text = chapter.dataset.search.toLocaleLowerCase();
      const match = terms.every(term => text.includes(term));
      chapter.hidden = !match;
      links[i].hidden = !match;
      if (match) count++;
    });
    status.textContent = terms.length ? `${count} matching chapter${count === 1 ? '' : 's'}` : initialStatus;
    document.getElementById('no-results').hidden = count !== 0;
  }
  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    const chapter = target.closest('.chapter');
    if (chapter?.hidden) { input.value = ''; filter(); }
    links.forEach(link => {
      if (chapter && link.hash === `#${chapter.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    target.scrollIntoView({block: 'start'});
  }
  input.addEventListener('input', filter);
  document.getElementById('docs-clear').addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  document.getElementById('docs-print').addEventListener('click', () => window.print());
  window.addEventListener('hashchange', revealHash);
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    // Same-hash links must also reveal a chapter hidden by a later search.
    if (link.hash === location.hash) revealHash();
  }));
  const index = document.querySelector('#button-index ul');
  [...index.children].sort((a,b) => a.querySelector('a').textContent.localeCompare(b.querySelector('a').textContent)).forEach(item => index.appendChild(item));
  if (location.hash) revealHash();
})();
