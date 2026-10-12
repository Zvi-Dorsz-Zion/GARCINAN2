(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = {
    db: null, masechtot: [], masechet: null, pages: [], page: null,
    sections: [], section: null, witnesses: [], witness: null,
    fontScale: 1, wordMode: false, readMode: false, hideAbbrev: true, onlyChanged: false, theme: 'parchment'
  };

  // ---------- settings persistence ----------
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('tf_prefs') || '{}');
      Object.assign(state, p);
    } catch (e) {}
  }
  function savePrefs() {
    try {
      const { fontScale, wordMode, readMode, hideAbbrev, onlyChanged, theme } = state;
      localStorage.setItem('tf_prefs', JSON.stringify({ fontScale, wordMode, readMode, hideAbbrev, onlyChanged, theme }));
    } catch (e) {}
  }
  function applyPrefs() {
    document.body.className = 'theme-' + state.theme;
    document.documentElement.style.setProperty('--font-scale', state.fontScale);
    $('fontSizeLabel').textContent = Math.round(state.fontScale * 100) + '%';
    $('toggleWordMode').checked = state.wordMode;
    $('toggleReadMode').checked = state.readMode;
    $('toggleHideAbbrev').checked = state.hideAbbrev;
    $('toggleOnlyChanged').checked = state.onlyChanged;
    document.querySelectorAll('#themeSwitch button').forEach((b) =>
      b.classList.toggle('active', b.dataset.theme === state.theme));
  }

  // ---------- DB ----------
  function q(sql, params = []) {
    const stmt = state.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  // ---- device-stored database (IndexedDB) ----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('tf-store', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kvGet(k) {
    const d = await idb();
    return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function kvSet(k, v) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }

  const isSqlite = (u8) => new TextDecoder().decode(u8.slice(0, 15)) === 'SQLite format 3';

  function showImport(msg) {
    $('loadingScreen').hidden = false;
    $('loadingScreen').classList.add('waiting');
    $('loadingText').textContent = msg;
    $('importBox').hidden = false;
  }

  async function loadBytes() {
    const saved = await kvGet('db').catch(() => null);
    if (saved && saved.blob) {
      state.dbSource = 'נבחר מהמכשיר: ' + saved.name;
      return new Uint8Array(await saved.blob.arrayBuffer());
    }
    try { // optional bundled copy (only if the APK was built with one)
      const r = await fetch('assets/talmud.db');
      if (r.ok) {
        const u = new Uint8Array(await r.arrayBuffer());
        if (isSqlite(u)) { state.dbSource = 'מובנה באפליקציה'; return u; }
      }
    } catch (e) {}
    return null;
  }

  async function importFile(file) {
    if (!file) return;
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!isSqlite(head)) {
      showImport('הקובץ שנבחר אינו מסד SQLite. אם הורדתם ZIP — חלצו אותו ובחרו את talmud.db.');
      return;
    }
    $('importBox').hidden = true;
    $('loadingScreen').hidden = false;
    $('loadingScreen').classList.remove('waiting');
    $('loadingText').textContent = 'שומר את המאגר באפליקציה…';
    try {
      await kvSet('db', { blob: file.slice(0, file.size), name: file.name, size: file.size, ts: Date.now() });
    } catch (e) {
      showImport('השמירה נכשלה (אין מספיק מקום פנוי?): ' + e.message);
      return;
    }
    location.reload();
  }

  // ---------- drawer ----------
  function openDrawer() { $('drawer').classList.add('open'); $('drawerScrim').classList.add('open'); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawerScrim').classList.remove('open'); }
  function showCol(name) {
    $('colMasechtot').hidden = name !== 'm';
    $('colPages').hidden = name !== 'p';
    $('colSections').hidden = true;
  }

  function renderMasechtot(filter = '') {
    const list = $('listMasechtot');
    list.innerHTML = '';
    state.masechtot
      .filter((m) => !filter || (m.name || '').includes(filter))
      .forEach((m) => {
        const b = document.createElement('button');
        b.className = 'list-item' + (state.masechet && state.masechet.id === m.id ? ' active' : '');
        b.innerHTML = `<span>${esc(m.name)}</span><span class="chevron">›</span>`;
        b.onclick = () => selectMasechet(m);
        list.appendChild(b);
      });
  }

  function selectMasechet(m) {
    state.masechet = m;
    state.pages = q('SELECT id, page_label FROM pages WHERE masechet_id = ? ORDER BY id', [m.id]);
    // witnesses: schema doc suggests masechet_id; fall back to global list
    try {
      state.witnesses = q('SELECT id, name, position FROM witnesses WHERE masechet_id = ? ORDER BY position', [m.id]);
      if (!state.witnesses.length) throw 0;
    } catch (e) {
      state.witnesses = q('SELECT id, name, position FROM witnesses ORDER BY position');
    }
    const list = $('listPages');
    list.innerHTML = '';
    state.pages.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'list-item';
      b.innerHTML = `<span>${esc(p.page_label)}</span><span class="chevron">›</span>`;
      b.onclick = () => selectPage(p);
      list.appendChild(b);
    });
    showCol('p');
  }

  function selectPage(p) {
    state.page = p;
    state.sections = q('SELECT id, section_label FROM sections WHERE page_id = ? ORDER BY id', [p.id]);
    state.section = state.sections[0] || null;
    $('titleMasechet').textContent = state.masechet.name;
    $('titleLocation').textContent = p.page_label;
    closeDrawer();
    $('emptyState').hidden = true;
    $('compareView').hidden = false;
    renderChips();
    renderWitnessTabs();
    renderText();
    $('mainContent').scrollTop = 0;
  }

  // ---------- compare view ----------
  function renderChips() {
    const row = $('sectionChips');
    row.innerHTML = '';
    row.hidden = state.sections.length <= 1 || state.readMode;
    state.sections.forEach((s, i) => {
      const c = document.createElement('button');
      c.className = 'chip' + (state.section && s.id === state.section.id ? ' active' : '');
      c.textContent = s.section_label || ('קטע ' + (i + 1));
      c.onclick = () => { state.section = s; renderChips(); renderWitnessTabs(); renderText(); $('mainContent').scrollTop = 0; };
      row.appendChild(c);
    });
  }

  function witnessesForSection(sectionId) {
    return q(`SELECT w.id AS wid, w.name, w.position, t.content
              FROM texts t JOIN witnesses w ON w.id = t.witness_id
              WHERE t.section_id = ? ORDER BY w.position`, [sectionId]);
  }

  const normText = (t) => TalmudDiff.tokens(t).map(TalmudDiff.norm).join(' ');
  const currentSections = () => state.readMode ? state.sections : (state.section ? [state.section] : []);

  // Witnesses visible now. With "only changed", keeps the representative + witnesses that differ from it.
  function buildWitnessList() {
    const per = currentSections().map((sec) => witnessesForSection(sec.id));
    const ws = new Map();
    per.forEach((rows) => rows.forEach((r) => { if (!ws.has(r.wid)) ws.set(r.wid, { ...r, changed: false }); }));
    per.forEach((rows) => {
      const rep = rows.find((r) => r.position === 0) || rows[0];
      if (!rep) return;
      const rn = normText(rep.content);
      rows.forEach((r) => { if (r !== rep && normText(r.content) !== rn) ws.get(r.wid).changed = true; });
    });
    let list = [...ws.values()].sort((a, b) => a.position - b.position);
    if (state.onlyChanged) list = list.filter((w) => w.position === 0 || w.changed);
    return list;
  }

  function renderWitnessTabs() {
    const wrap = $('witnessTabs');
    wrap.innerHTML = '';
    if (state.wordMode) { wrap.hidden = true; state.visible = []; return; }
    wrap.hidden = false;
    const list = buildWitnessList();
    state.visible = list;
    if (!list.some((w) => w.wid === state.witness)) {
      state.witness = list.length ? (list.find((x) => x.position === 0) || list[0]).wid : null;
    }
    let active = null;
    list.forEach((w) => {
      const t = document.createElement('button');
      const on = w.wid === state.witness;
      t.className = 'witness-tab' + (on ? ' active' : '');
      t.innerHTML = esc(w.name) + (w.position === 0 ? '<span class="rep-star">★</span>' : '');
      t.onclick = () => { state.witness = w.wid; renderWitnessTabs(); renderText(); };
      wrap.appendChild(t);
      if (on) active = t;
    });
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // dir: +1 = next witness (its tab is to the left), -1 = previous
  function switchWitness(dir) {
    const list = state.visible || [];
    if (state.wordMode || list.length < 2) return;
    let i = list.findIndex((w) => w.wid === state.witness);
    i = (i + dir + list.length) % list.length;
    state.witness = list[i].wid;
    renderWitnessTabs();
    renderText();
    const pane = $('textPane');
    pane.classList.remove('slide-in-left', 'slide-in-right');
    void pane.offsetWidth;
    pane.classList.add(dir > 0 ? 'slide-in-left' : 'slide-in-right');
  }

  function renderDiff(rep, cur, isRep) {
    if (isRep) return esc(cur);
    return TalmudDiff.diffWords(rep, cur).map((d) => {
      const ab = TalmudDiff.isAbbrev(d.w) ? ' w-abbrev' : '';
      if (d.t === 'eq') return esc(d.w);
      if (d.t === 'add') return `<span class="w w-add${ab}">${esc(d.w)}</span>`;
      if (d.t === 'miss') return `<span class="w w-miss${ab}">${esc(d.w)}</span>`;
      return `<span class="w w-diff${ab}" title="${esc(d.was)}">${esc(d.w)}</span>`;
    }).join(' ');
  }

  function renderText() {
    const pane = $('textPane');
    pane.className = 'text-pane' + (state.hideAbbrev ? ' hide-abbrev' : '');
    if (state.wordMode) return renderWordMode();
    const secs = state.readMode ? state.sections : (state.section ? [state.section] : []);
    let html = '';
    secs.forEach((s) => {
      const rows = witnessesForSection(s.id);
      const rep = rows.find((r) => r.position === 0) || rows[0];
      const cur = rows.find((r) => r.wid === state.witness) || rep;
      if (!cur) return;
      if (state.readMode) html += `<div class="section-heading">${esc(s.section_label)}</div>`;
      html += `<p>${renderDiff(rep ? rep.content : '', cur.content, cur === rep)}</p>`;
    });
    if (state.onlyChanged && state.visible && state.visible.length === 1 && html) {
      html = '<div class="no-change">בקטע הזה אין נוסחאות שונות מהנוסח המייצג.</div>' + html;
    }
    pane.innerHTML = html || '<p>אין טקסט לקטע זה.</p>';
  }

  function renderWordMode() {
    const pane = $('textPane');
    pane.classList.add('word-mode');
    if (!state.section) { pane.innerHTML = ''; return; }
    let rows = [];
    try {
      rows = q(`SELECT sw.id AS swid, w.position, wi.name AS wname, wd.word
                FROM sections_words sw
                JOIN sections_words_texts swt ON swt.sections_word_id = sw.id
                JOIN witnesses wi ON wi.id = swt.witness_id
                JOIN words wd ON wd.id = swt.word_id
                JOIN witnesses w ON w.id = wi.id
                WHERE sw.section_id = ? ORDER BY sw.id, w.position`, [state.section.id]);
    } catch (e) { pane.innerHTML = '<p>מצב מילים אינו זמין במסד זה.</p>'; return; }
    if (!rows.length) { pane.innerHTML = '<p>אין נתוני מילים לקטע זה.</p>'; return; }
    const groups = new Map();
    rows.forEach((r) => { if (!groups.has(r.swid)) groups.set(r.swid, []); groups.get(r.swid).push(r); });
    let html = '';
    groups.forEach((g) => {
      const base = TalmudDiff.norm(g[0].word);
      const variants = new Map();
      g.forEach((r) => {
        const k = r.word; if (!variants.has(k)) variants.set(k, []); variants.get(k).push(r.wname);
      });
      if (variants.size === 1) { html += `<span>${esc(g[0].word)}</span> `; return; }
      const parts = [...variants.entries()].map(([w, names]) =>
        `<span class="w ${TalmudDiff.norm(w) === base ? '' : 'w-diff'}" title="${esc(names.join(', '))}">${esc(w)}</span>`);
      html += `<span class="w-group">[${parts.join(' | ')}]</span> `;
    });
    pane.innerHTML = `<p>${html}</p>`;
  }

  // ---------- sheets ----------
  function toggleSheet(open) {
    $('settingsSheet').classList.toggle('open', open);
    $('settingsScrim').classList.toggle('open', open);
  }

  function bind() {
    $('btnMenu').onclick = openDrawer;
    $('btnOpenNavEmpty').onclick = openDrawer;
    $('drawerScrim').onclick = closeDrawer;
    $('btnSettings').onclick = () => toggleSheet(true);
    $('settingsScrim').onclick = () => toggleSheet(false);
    $('backToMasechtot').onclick = () => showCol('m');
    $('backToPages').onclick = () => showCol('p');
    $('searchBox').oninput = (e) => { showCol('m'); renderMasechtot(e.target.value.trim()); };

    document.querySelectorAll('#themeSwitch button').forEach((b) =>
      b.onclick = () => { state.theme = b.dataset.theme; applyPrefs(); savePrefs(); });
    $('fontPlus').onclick = () => { state.fontScale = Math.min(2, +(state.fontScale + 0.1).toFixed(2)); applyPrefs(); savePrefs(); };
    $('fontMinus').onclick = () => { state.fontScale = Math.max(0.7, +(state.fontScale - 0.1).toFixed(2)); applyPrefs(); savePrefs(); };
    const refresh = () => { renderChips(); renderWitnessTabs(); renderText(); };
    $('toggleWordMode').onchange = (e) => { state.wordMode = e.target.checked; savePrefs(); if (state.page) refresh(); };
    $('toggleReadMode').onchange = (e) => { state.readMode = e.target.checked; savePrefs(); if (state.page) refresh(); };
    $('toggleOnlyChanged').onchange = (e) => { state.onlyChanged = e.target.checked; savePrefs(); if (state.page) refresh(); };
    $('toggleHideAbbrev').onchange = (e) => { state.hideAbbrev = e.target.checked; savePrefs(); if (state.page) renderText(); };


    // ---- swipe between witnesses (drag content right = next, left = previous; tabs are RTL) ----
    (function () {
      const main = $('mainContent');
      let x0, y0, t0, ok = false;
      main.addEventListener('touchstart', (e) => {
        ok = !e.target.closest('.chip-row, .witness-tabs') && e.touches.length === 1;
        if (!ok) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
      }, { passive: true });
      main.addEventListener('touchend', (e) => {
        if (!ok) return; ok = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0, dy = t.clientY - y0;
        if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        switchWitness(dx > 0 ? 1 : -1);
      }, { passive: true });
    })();

    // ---- swipe down to close the settings sheet ----
    (function () {
      const sh = $('settingsSheet');
      let y0 = null, dy = 0;
      sh.addEventListener('touchstart', (e) => {
        if (sh.scrollTop > 0 && !e.target.closest('.sheet-handle, .sheet-title')) return;
        y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none';
      }, { passive: true });
      sh.addEventListener('touchmove', (e) => {
        if (y0 === null) return;
        dy = e.touches[0].clientY - y0;
        sh.style.transform = dy > 0 ? 'translateY(' + dy + 'px)' : '';
      }, { passive: true });
      const end = () => {
        if (y0 === null) return;
        sh.style.transition = ''; sh.style.transform = '';
        if (dy > 80) toggleSheet(false);
        y0 = null; dy = 0;
      };
      sh.addEventListener('touchend', end);
      sh.addEventListener('touchcancel', end);
    })();

    // Android hardware back button: close panels first, then step back, then exit
    const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (capApp) capApp.addListener('backButton', () => {
      if ($('settingsSheet').classList.contains('open')) toggleSheet(false);
      else if ($('drawer').classList.contains('open')) {
        if (!$('colPages').hidden && $('searchBox').value === '') showCol('m'); else closeDrawer();
      }
      else capApp.exitApp();
    });
  }

  // ---------- boot ----------
  loadPrefs(); applyPrefs(); bind();
  $('filePicker').onchange = (e) => importFile(e.target.files[0]);
  $('btnPick').onclick = () => $('filePicker').click();
  $('btnReplaceDb').onclick = () => { toggleSheet(false); $('filePicker').value = ''; $('filePicker').click(); };
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  try {
    const bytes = await loadBytes();
    if (!bytes) { showImport('לא נמצא מאגר נתונים. בחרו את קובץ talmud.db מהמכשיר.'); return; }
    const SQL = await initSqlJs({ locateFile: (f) => 'js/' + f });
    state.db = new SQL.Database(bytes);
    state.masechtot = q('SELECT id, num, name FROM masechtot ORDER BY num');
    $('dbSourceLabel').textContent = state.dbSource || '';
    renderMasechtot();
    showCol('m');
    $('loadingScreen').hidden = true;
  } catch (e) {
    console.error(e);
    showImport('המאגר לא נטען (' + e.message + '). בחרו קובץ talmud.db תקין.');
  }
})();
