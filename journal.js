/* ============================================================
   OLC JOURNAL — a free-style, wiki / Word-like notebook.
   Pages (with sub-pages) made of blocks: text, headings, lists, checklists, quotes, callouts, code,
   pictures, tables, graphs, flowcharts, campaign / promotion / medal / division cards, covers.
   Loaded on demand (journal.js) so the rest of the app opens fast.
   ============================================================ */
const journalReady = true;
const JK = () => 'olc2_jnl_' + (activeAccountId || 'x');
const jNarrow = window.innerWidth < 900;
let jUI = Object.assign({ sel: '@front', mode: 'read', pages: !jNarrow, outline: !jNarrow, swap: false, q: '' }, LS.get(JK(), {}) || {});
function jSaveUI(){ LS.set(JK(), { sel: jUI.sel, mode: jUI.mode, pages: jUI.pages, outline: jUI.outline, swap: jUI.swap }); }
const jr = () => state.journal;
const jPages = () => jr().pages;
const jPage = (id) => jPages().find(p => p.id === id);
const jBlock = (pid, bid) => { const p = jPage(pid); return p && (p.blocks || []).find(b => b.id === bid); };
window.OLC_BUSY = window.OLC_BUSY || []; window.OLC_BUSY.push(() => currentSection === 'journal' && jUI.mode === 'edit' && document.activeElement && (document.activeElement.closest && document.activeElement.closest('#jMain')));
let jSaveT = null;
function jTouch(pid){ const p = jPage(pid); if(p) p.updatedAt = Date.now(); clearTimeout(jSaveT); jSaveT = setTimeout(() => saveState(), 350); }
const jRe = () => { renderSection(); };

/* ---------- safe rich text ---------- */
const J_ALLOW = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, MARK: 1, A: 1, SPAN: 1, BR: 1, CODE: 1, SUB: 1, SUP: 1 };
function cleanHTML(html){
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  (function walk(n){
    [...n.childNodes].forEach(c => {
      if(c.nodeType === 3) return;
      if(c.nodeType !== 1){ c.remove(); return; }
      if(c.tagName === 'DIV' || c.tagName === 'P'){ const br = document.createElement('br'); c.before(...c.childNodes, br); c.remove(); return; }
      if(!J_ALLOW[c.tagName]){ walk(c); c.replaceWith(...c.childNodes); return; }
      [...c.attributes].forEach(a => {
        const nm = a.name.toLowerCase();
        if(c.tagName === 'A' && nm === 'href' && /^(https?:|mailto:|#)/i.test(a.value)) return;
        if(c.tagName === 'A' && (nm === 'target' || nm === 'rel')) return;
        if(c.tagName === 'SPAN' && nm === 'style'){ const m = a.value.match(/(?:^|;)\s*(color|background-color)\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d, ]+\))/ig); c.setAttribute('style', (m || []).join(';')); return; }
        c.removeAttribute(a.name);
      });
      if(c.tagName === 'A'){ c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
      walk(c);
    });
  })(t.content);
  return t.innerHTML.replace(/(<br>\s*)+$/i, '');
}
const wikiLinks = (html) => html.replace(/\[\[([^\]]{1,80})\]\]/g, (m, t) => `<a href="javascript:void(0)" class="wl" onclick="jOpenTitle('${esc(t).replace(/'/g, '&#39;')}')">${esc(t)}</a>`);
const rich = (html) => wikiLinks(cleanHTML(html));
function jOpenTitle(t){ const p = jPages().find(x => (x.title || '').toLowerCase() === t.toLowerCase()); if(p){ jUI.sel = p.id; jSaveUI(); jRe(); } else toast('No page called “' + t + '” yet.'); }

/* ---------- charts ---------- */
const CH_COL = () => ['var(--lavender)', 'var(--cyan)', 'var(--gold)', 'var(--green)', 'var(--danger)', '#9b87f5'];
function chartData(b){
  const src = b.source || 'manual', days = (n) => { const a = []; for(let i = n - 1; i >= 0; i--){ const d = new Date(); d.setDate(d.getDate() - i); a.push(todayStr(d)); } return a; };
  if(src === 'dss'){ const d = days(14); return { labels: d.map(x => x.slice(5)), series: [{ n: 'DSS', v: d.map(x => getDSS(x)) }] }; }
  if(src === 'water'){ const d = days(14); return { labels: d.map(x => x.slice(5)), series: [{ n: 'Water (L)', v: d.map(x => (state.dailyLogs[x] || {}).waterL || 0) }] }; }
  if(src === 'study'){ const d = days(14); return { labels: d.map(x => x.slice(5)), series: [{ n: 'Study hours', v: d.map(x => (state.trackerLogs.study || []).filter(e => e.date === x).reduce((a, e) => a + (Number(e.hours) || 0), 0)) }] }; }
  if(src === 'weight'){ const w = (state.trackerLogs.weight || []).slice().sort((a, c) => a.date < c.date ? -1 : 1).slice(-20); return { labels: w.map(e => e.date.slice(5)), series: [{ n: 'Weight (kg)', v: w.map(e => Number(e.kg) || 0) }] }; }
  const rows = String(b.csv || '').split('\n').map(r => r.split(',').map(x => x.trim())).filter(r => r.length && r[0] !== '');
  if(!rows.length) return { labels: [], series: [] };
  const head = rows[0][0] === '#' || /^#/.test(rows[0][0]);
  const names = head ? rows[0].slice(1) : [], data = head ? rows.slice(1) : rows, n = Math.max(1, ...data.map(r => r.length - 1));
  return { labels: data.map(r => r[0]), series: Array.from({ length: n }, (_, i) => ({ n: names[i] || (n > 1 ? 'Series ' + (i + 1) : ''), v: data.map(r => Number(r[i + 1]) || 0) })) };
}
function chartSVG(b){
  const { labels, series } = chartData(b), W = 560, H = 280, P = { l: 44, r: 14, t: 16, b: 46 }, col = CH_COL();
  if(!labels.length) return '<div class="empty">Add some data to see the graph.</div>';
  const kind = b.kind || 'bar';
  if(kind === 'pie'){
    const v = series[0].v.map(x => Math.max(0, x)), tot = v.reduce((a, c) => a + c, 0) || 1; let a0 = -Math.PI / 2, out = '';
    v.forEach((x, i) => { const a1 = a0 + x / tot * Math.PI * 2, r = 100, cx = 150, cy = 140, large = a1 - a0 > Math.PI ? 1 : 0;
      out += x ? `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}Z" fill="${col[i % col.length]}" stroke="var(--bg-1)" stroke-width="2"/>` : ''; a0 = a1; });
    const leg = labels.map((l, i) => `<g transform="translate(300,${30 + i * 22})"><rect width="12" height="12" rx="2" fill="${col[i % col.length]}"/><text x="18" y="10" fill="currentColor" font-size="12">${esc(l)} — ${Math.round(v[i] / tot * 100)}%</text></g>`).join('');
    return `<svg viewBox="0 0 ${W} 290" class="jchart">${out}${leg}</svg>`;
  }
  const max = Math.max(1e-9, ...series.flatMap(s => s.v)), min = Math.min(0, ...series.flatMap(s => s.v)), rng = (max - min) || 1;
  const iw = W - P.l - P.r, ih = H - P.t - P.b, y = (v) => P.t + ih - (v - min) / rng * ih, n = labels.length;
  let g = '';
  for(let i = 0; i <= 4; i++){ const v = min + rng * i / 4, yy = y(v); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="currentColor" opacity=".12"/><text x="${P.l - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".7">${Math.round(v * 10) / 10}</text>`; }
  if(kind === 'line'){
    series.forEach((s, si) => { const pts = s.v.map((v, i) => [P.l + (n === 1 ? iw / 2 : i / (n - 1) * iw), y(v)]); g += `<polyline fill="none" stroke="${col[si % col.length]}" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${col[si % col.length]}"/>`).join(''); });
    labels.forEach((l, i) => { if(n > 12 && i % 2) return; g += `<text x="${P.l + (n === 1 ? iw / 2 : i / (n - 1) * iw)}" y="${H - 26}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".75">${esc(String(l).slice(0, 8))}</text>`; });
  } else {
    const bw = iw / n, sw = bw * .72 / series.length;
    series.forEach((s, si) => s.v.forEach((v, i) => { const x = P.l + i * bw + bw * .14 + si * sw, yy = y(Math.max(v, 0)), hh = Math.abs(y(v) - y(0)); g += `<rect x="${x}" y="${v >= 0 ? yy : y(0)}" width="${sw - 1}" height="${hh}" rx="2" fill="${col[si % col.length]}"/>`; }));
    labels.forEach((l, i) => { if(n > 12 && i % 2) return; g += `<text x="${P.l + i * bw + bw / 2}" y="${H - 26}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".75">${esc(String(l).slice(0, 8))}</text>`; });
  }
  const leg = series.length > 1 ? series.map((s, i) => `<g transform="translate(${P.l + i * 110},${H - 10})"><rect width="10" height="10" rx="2" fill="${col[i % col.length]}"/><text x="14" y="9" font-size="10" fill="currentColor">${esc(s.n)}</text></g>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="jchart">${g}${leg}</svg>`;
}

/* ---------- flowcharts (text → picture) ---------- */
function flowParse(code){
  const nodes = new Map(), edges = [];
  const node = (raw) => {
    raw = raw.trim(); let m;
    let id, label, shape = 'box';
    if((m = raw.match(/^([\w.-]+)\(\[(.+)\]\)$/))){ id = m[1]; label = m[2]; shape = 'pill'; }
    else if((m = raw.match(/^([\w.-]+)\{(.+)\}$/))){ id = m[1]; label = m[2]; shape = 'diamond'; }
    else if((m = raw.match(/^([\w.-]+)\((.+)\)$/))){ id = m[1]; label = m[2]; shape = 'round'; }
    else if((m = raw.match(/^([\w.-]+)\[(.+)\]$/))){ id = m[1]; label = m[2]; shape = 'box'; }
    else { id = raw.replace(/\s+/g, '_'); label = raw; }
    if(!id) return null;
    const ex = nodes.get(id); if(ex){ if(label !== id || shape !== 'box'){ ex.label = label; ex.shape = shape; } return ex; }
    const n = { id, label, shape }; nodes.set(id, n); return n;
  };
  String(code || '').split('\n').forEach(line => {
    line = line.trim(); if(!line || line.startsWith('%%')) return;
    const parts = line.split(/\s*-->\s*(?:\|([^|]*)\|\s*)?/); // [n0, label1, n1, label2, n2...]
    let prev = node(parts[0]);
    for(let i = 1; i < parts.length; i += 2){ const nx = node(parts[i + 1] || ''); if(prev && nx) edges.push({ a: prev.id, b: nx.id, label: (parts[i] || '').trim() }); prev = nx || prev; }
  });
  return { nodes: [...nodes.values()], edges };
}
function flowSVG(b){
  const { nodes, edges } = flowParse(b.code); if(!nodes.length) return '<div class="empty">Write steps like:  Start([Start]) --> Study[Study 2h] --> Test{Passed?}</div>';
  const LR = b.dir === 'LR', layer = {}, out = {}; nodes.forEach(n => { out[n.id] = []; layer[n.id] = 0; });
  edges.forEach(e => out[e.a].push(e.b));
  const state0 = {}; const order = [];
  (function dfs(id){ state0[id] = 1; out[id].forEach(t => { if(state0[t] === 1) return; if(!state0[t]) dfs(t); }); state0[id] = 2; order.push(id); })(nodes[0].id);
  nodes.forEach(n => { if(!state0[n.id]) (function dfs(id){ state0[id] = 1; out[id].forEach(t => { if(state0[t] === 1) return; if(!state0[t]) dfs(t); }); state0[id] = 2; order.push(id); })(n.id); });
  const topo = order.reverse(), pos = {}; topo.forEach((id, i) => pos[id] = i);
  topo.forEach(id => out[id].forEach(t => { if(pos[t] > pos[id]) layer[t] = Math.max(layer[t], layer[id] + 1); }));
  const cols = {}; nodes.forEach(n => { (cols[layer[n.id]] = cols[layer[n.id]] || []).push(n); });
  const NW = 150, NH = 54, GX = 46, GY = 40, L = Object.keys(cols).length, maxc = Math.max(...Object.values(cols).map(c => c.length));
  const W = LR ? L * (NW + GX) : maxc * (NW + GX), H = LR ? maxc * (NH + GY) : L * (NH + GY);
  Object.keys(cols).forEach(l => { const c = cols[l]; c.forEach((n, i) => { const off = ((LR ? maxc : maxc) - c.length) / 2;
    n.x = LR ? l * (NW + GX) + NW / 2 + 8 : (i + off) * (NW + GX) + NW / 2 + GX / 2; n.y = LR ? (i + off) * (NH + GY) + NH / 2 + 8 : l * (NH + GY) + NH / 2 + 8; }); });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  let svg = `<defs><marker id="ar${b.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="var(--lavender)"/></marker></defs>`;
  edges.forEach(e => {
    const a = byId[e.a], c = byId[e.b]; if(!a || !c) return;
    let x1 = a.x, y1 = a.y, x2 = c.x, y2 = c.y;
    if(LR){ x1 += NW / 2; x2 -= NW / 2; } else { y1 += NH / 2; y2 -= NH / 2; }
    if(a.id === c.id) return;
    const back = LR ? x2 < x1 : y2 < y1, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const d = LR ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    svg += `<path d="${d}" fill="none" stroke="var(--lavender)" stroke-width="2" ${back ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#ar${b.id})"/>`;
    if(e.label) svg += `<text x="${mx}" y="${my - 4}" text-anchor="middle" font-size="11" fill="var(--cyan)" paint-order="stroke" stroke="var(--bg-1)" stroke-width="4">${esc(e.label)}</text>`;
  });
  nodes.forEach(n => {
    const w = NW, h = NH, x = n.x - w / 2, y = n.y - h / 2; let sh;
    if(n.shape === 'diamond') sh = `<polygon points="${n.x},${y - 4} ${x + w + 8},${n.y} ${n.x},${y + h + 4} ${x - 8},${n.y}" />`;
    else if(n.shape === 'pill') sh = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    else if(n.shape === 'round') sh = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`;
    else sh = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
    const words = String(n.label).split(' '), lines = []; let cur = '';
    words.forEach(wd => { if((cur + ' ' + wd).trim().length > 18){ lines.push(cur.trim()); cur = wd; } else cur += ' ' + wd; }); lines.push(cur.trim());
    const t = lines.slice(0, 3).map((l, i, a) => `<tspan x="${n.x}" dy="${i === 0 ? -(a.length - 1) * 7 : 14}">${esc(l)}</tspan>`).join('');
    svg += `<g class="fnode">${sh}<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-size="12.5">${t}</text></g>`;
  });
  return `<svg viewBox="0 0 ${Math.max(W, 200)} ${Math.max(H, 80)}" class="jflow">${svg}</svg>`;
}

/* ---------- blocks ---------- */
const BLOCK_TYPES = [
  ['p', '¶', 'Text'], ['h1', 'H1', 'Heading 1'], ['h2', 'H2', 'Heading 2'], ['h3', 'H3', 'Heading 3'], ['ul', '•', 'Bullets'], ['ol', '1.', 'Numbers'], ['todo', '☑', 'Checklist'],
  ['quote', '❝', 'Quote'], ['callout', '💡', 'Callout'], ['code', '</>', 'Code'], ['divider', '—', 'Divider'], ['image', '🖼', 'Picture'], ['table', '▦', 'Table'], ['chart', '📊', 'Graph'], ['flow', '⎇', 'Flowchart'],
  ['embed', '🎖', 'Card (campaign / promotion / medal…)'],
];
const typeName = (t) => (BLOCK_TYPES.find(x => x[0] === t) || [0, 0, t])[2];
function newBlock(type){
  const b = { id: uid('jb'), type, text: '' };
  if(type === 'callout') b.tone = 'info';
  if(type === 'chart'){ b.kind = 'bar'; b.source = 'manual'; b.csv = '#,Hours\nMon,2\nTue,3\nWed,1.5\nThu,4'; b.title = 'My graph'; }
  if(type === 'flow'){ b.dir = 'TB'; b.code = 'Start([Start]) --> Plan[Plan the day] --> Done{Finished?}\nDone -->|yes| End([Rest])\nDone -->|no| Plan'; }
  if(type === 'table'){ b.csv = 'Subject,Target,Done\nMath,10,6\nScience,8,5'; }
  if(type === 'embed'){ b.kind = 'campaign'; b.title = ''; b.date = todayStr(); }
  if(type === 'image'){ b.size = 'm'; b.caption = ''; }
  return b;
}
function jAddBlock(pid, type, afterId){
  const p = jPage(pid); if(!p) return; p.blocks = p.blocks || [];
  const nb = newBlock(type), i = afterId ? p.blocks.findIndex(b => b.id === afterId) : -1;
  if(i >= 0) p.blocks.splice(i + 1, 0, nb); else p.blocks.push(nb);
  jTouch(pid); jRe(); setTimeout(() => { const el = document.querySelector(`[data-bid="${nb.id}"] [contenteditable],[data-bid="${nb.id}"] textarea`); el && el.focus(); }, 80);
}
function jDelBlock(pid, bid){ const p = jPage(pid); if(!p) return; p.blocks = p.blocks.filter(b => b.id !== bid); jTouch(pid); jRe(); }
function jMoveBlock(pid, bid, d){ const p = jPage(pid); const i = p.blocks.findIndex(b => b.id === bid), j = i + d; if(j < 0 || j >= p.blocks.length) return; const [b] = p.blocks.splice(i, 1); p.blocks.splice(j, 0, b); jTouch(pid); jRe(); }
function jDupBlock(pid, bid){ const p = jPage(pid), i = p.blocks.findIndex(b => b.id === bid); const c = JSON.parse(JSON.stringify(p.blocks[i])); c.id = uid('jb'); p.blocks.splice(i + 1, 0, c); jTouch(pid); jRe(); }
function jSetType(pid, bid, t){ const b = jBlock(pid, bid); if(!b) return; const nb = newBlock(t); const keep = b.text; Object.keys(b).forEach(k => { if(k !== 'id') delete b[k]; }); Object.assign(b, nb, { id: bid }); if(keep && ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'quote', 'callout', 'code'].includes(t)) b.text = keep; jTouch(pid); jRe(); }
function jField(pid, bid, f, v, redraw){ const b = jBlock(pid, bid); if(!b) return; b[f] = v; jTouch(pid); if(redraw) jPreview(pid, bid); }
function jRichInput(el){ const pid = el.dataset.pid, bid = el.dataset.bid2; const b = jBlock(pid, bid); if(!b) return; b.text = cleanHTML(el.innerHTML); jTouch(pid); jOutlineRefresh(); }
function jPreview(pid, bid){ const b = jBlock(pid, bid); const el = document.getElementById('prev_' + bid); if(!b || !el) return; el.innerHTML = b.type === 'chart' ? chartSVG(b) : b.type === 'flow' ? flowSVG(b) : b.type === 'table' ? tableHTML(b) : ''; }
function jTodoToggle(pid, bid, i){ const b = jBlock(pid, bid); if(!b) return; const lines = String(b.text || '').split('\n'); lines[i] = /^\[x\]/i.test(lines[i]) ? lines[i].replace(/^\[x\]\s?/i, '[ ] ') : lines[i].replace(/^\[ \]\s?/, '[x] '); b.text = lines.join('\n'); jTouch(pid); jRe(); }
async function jImagePick(pid, bid, multi){
  const files = await pickFiles('image/*', false); if(!files.length) return; const b = jBlock(pid, bid); if(!b) return;
  toast('Adding picture…', 2000); b.img = await storeImage(files[0], { maxW: 1400, quality: .8, keepAlpha: /png/.test(files[0].type) && files[0].size < 400000 }); jTouch(pid); jRe(); syncNow();
}
function tableHTML(b){
  const rows = String(b.csv || '').split('\n').map(r => r.split(',')).filter(r => r.length && r.join('').trim() !== '');
  if(!rows.length) return '<div class="empty">Empty table</div>';
  return `<div class="jtable-wrap"><table class="jtable">${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${esc(c.trim())}</th>` : `<td>${esc(c.trim())}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function embedHTML(b){
  const k = b.kind || 'campaign';
  if(k === 'promotion'){ const i = clamp(Number(b.rank) || 0, 0, RANKS.length - 1); return `<div class="jcard promo"><div class="jc-img">${rankImg(i, 64)}</div><div class="jc-body"><div class="eyebrow">PROMOTION</div><h4>${esc(b.title || 'Promoted to ' + RANKS[i].name)}</h4><div class="jc-date">${b.date ? fmtDateLong(b.date) : ''}</div><div>${esc(b.note || '')}</div></div></div>`; }
  if(k === 'medal'){ const a = (state.achievements || []).find(x => x.id === b.ref); return a ? `<div class="jcard" onclick="openAchievement('${a.id}')" style="cursor:pointer"><div class="jc-img">${achGraphic(a, 64)}</div><div class="jc-body"><div class="eyebrow">${a.kind === 'badge' ? 'BADGE' : 'MEDAL'}</div><h4>${esc(a.name)}</h4><div class="jc-date">${fmtDateLong(a.date)}</div><div>${esc(b.note || a.why || '')}</div></div></div>` : '<div class="empty">Choose an achievement in edit mode.</div>'; }
  if(k === 'division'){ const d = divisions().find(x => x.id === b.ref); return d ? `<div class="jcard"><div class="jc-img div-logo">${d.logo ? bimg(d.logo, 'alt=""') : '⚔'}</div><div class="jc-body"><div class="eyebrow">${esc(d.division || 'DIVISION')}</div><h4>${esc(d.name)}</h4><div class="jc-date">${d.start ? fmtDateLong(d.start) : ''}${d.end ? ' → ' + fmtDateLong(d.end) : ''}</div><div>${esc(b.note || d.mission || '')}</div></div></div>` : '<div class="empty">Choose a Division in edit mode.</div>'; }
  if(k === 'stats'){ const r = getRankInfo(state.xp); return `<div class="jcard stats"><div class="jc-img">${rankImg(r.idx, 56)}</div><div class="jc-body"><div class="eyebrow">STATUS SNAPSHOT (LIVE)</div><h4>${esc(r.cur.name)} · ${state.xp} XP</h4><div>DSS today ${getDSS(todayStr())}/100 · Habit streak ${state.streaks.habit.count} d · Study streak ${state.streaks.study.count} d</div></div></div>`; }
  return `<div class="jcard campaign">${b.img ? `<div class="jc-poster">${bimg(b.img, 'alt="campaign"')}</div>` : ''}<div class="jc-body"><div class="eyebrow">CAMPAIGN</div><h4>${esc(b.title || 'Untitled campaign')}</h4><div class="jc-date">${b.date ? fmtDateLong(b.date) : ''}${b.endDate ? ' → ' + fmtDateLong(b.endDate) : ''}</div><div>${esc(b.note || '')}</div></div></div>`;
}
function blockView(p, b){
  const t = b.type, id = b.id;
  switch(t){
    case 'h1': case 'h2': case 'h3': return `<${t} class="jh" id="h_${id}">${rich(b.text)}</${t}>`;
    case 'p': return `<p class="jp">${rich(b.text) || '&nbsp;'}</p>`;
    case 'ul': return `<ul class="jl">${String(b.text || '').split('\n').filter(x => x.trim()).map(x => `<li>${rich(esc(x))}</li>`).join('')}</ul>`;
    case 'ol': return `<ol class="jl">${String(b.text || '').split('\n').filter(x => x.trim()).map(x => `<li>${rich(esc(x))}</li>`).join('')}</ol>`;
    case 'todo': return `<div class="jtodo">${String(b.text || '').split('\n').filter(x => x.trim()).map((x, i) => { const done = /^\[x\]/i.test(x); return `<label class="${done ? 'done' : ''}"><input type="checkbox" ${done ? 'checked' : ''} onchange="jTodoToggle('${p.id}','${id}',${i})"> <span>${esc(x.replace(/^\[( |x)\]\s?/i, ''))}</span></label>`; }).join('')}</div>`;
    case 'quote': return `<blockquote class="jq">${rich(b.text)}</blockquote>`;
    case 'callout': return `<div class="jcall ${b.tone || 'info'}"><span class="jcall-ic">${{ info: 'ℹ️', warn: '⚠️', good: '✅', danger: '🚨' }[b.tone || 'info']}</span><div>${rich(b.text)}</div></div>`;
    case 'code': return `<pre class="jcode">${esc(b.text)}</pre>`;
    case 'divider': return '<hr class="jhr">';
    case 'image': return b.img ? `<figure class="jfig ${b.size || 'm'}">${bimg(b.img, 'alt="' + esc(b.caption || '') + '" onclick="jZoom(\'' + esc(b.img) + '\')"')}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>` : '<div class="empty">No picture yet — edit this page to add one.</div>';
    case 'table': return tableHTML(b);
    case 'chart': return `<figure class="jfig full">${b.title ? `<figcaption class="top">${esc(b.title)}</figcaption>` : ''}${chartSVG(b)}</figure>`;
    case 'flow': return `<figure class="jfig full">${flowSVG(b)}</figure>`;
    case 'embed': return embedHTML(b);
  }
  return '';
}
function jZoom(ref){ openV10Modal(`<div class="pdfv"><div class="pdfv-bar"><span class="spacer"></span><button class="btn ghost sm" onclick="closeV10Modal()">✕</button></div><div class="pdfv-body">${bimg(ref, 'alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;"')}</div></div>`, true); }

/* ---------- block editors ---------- */
function blockEdit(p, b, i, n){
  const t = b.type, id = b.id, P = p.id;
  const bar = `<div class="jb-bar"><span class="jb-type">${typeName(t)}</span>
    <select class="jb-sel" onchange="jSetType('${P}','${id}',this.value)" title="Change type">${BLOCK_TYPES.map(x => `<option value="${x[0]}" ${x[0] === t ? 'selected' : ''}>${x[2]}</option>`).join('')}</select><span class="spacer"></span>
    <button onclick="jMoveBlock('${P}','${id}',-1)" ${i === 0 ? 'disabled' : ''} title="Up">▲</button><button onclick="jMoveBlock('${P}','${id}',1)" ${i === n - 1 ? 'disabled' : ''} title="Down">▼</button><button onclick="jDupBlock('${P}','${id}')" title="Duplicate">⧉</button><button onclick="jDelBlock('${P}','${id}')" title="Delete">🗑</button></div>`;
  let body = '';
  const ce = (cls) => `<div class="jb-edit ${cls || ''}" contenteditable="true" data-pid="${P}" data-bid2="${id}" oninput="jRichInput(this)" data-ph="Type here…">${cleanHTML(b.text)}</div>`;
  const ta = (f, rows, ph) => `<textarea rows="${rows}" class="jb-ta" placeholder="${ph || ''}" oninput="jField('${P}','${id}','${f}',this.value,true)">${esc(b[f] || '')}</textarea>`;
  if(['p', 'h1', 'h2', 'h3'].includes(t)) body = ce('t-' + t);
  else if(t === 'quote') body = ce('t-quote');
  else if(t === 'callout') body = `<div class="jb-row"><select onchange="jField('${P}','${id}','tone',this.value);jRe()">${['info', 'warn', 'good', 'danger'].map(x => `<option ${b.tone === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>${ce('')}`;
  else if(t === 'ul' || t === 'ol') body = ta('text', 4, 'One item per line');
  else if(t === 'todo') body = ta('text', 4, 'One task per line. Start with [x] for done, [ ] for open');
  else if(t === 'code') body = ta('text', 6, 'Code or plain notes');
  else if(t === 'divider') body = '<hr class="jhr">';
  else if(t === 'image') body = `<div class="jb-row">${b.img ? `<div class="up-prev wide">${bimg(b.img, 'alt=""')}</div>` : ''}<button class="btn sm" onclick="jImagePick('${P}','${id}')">${b.img ? 'Replace picture' : 'Choose picture'}</button>
      <select onchange="jField('${P}','${id}','size',this.value);jRe()">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['full', 'Full width']].map(x => `<option value="${x[0]}" ${b.size === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
      <input type="text" class="jb-in" placeholder="Caption (optional)" value="${esc(b.caption || '')}" oninput="jField('${P}','${id}','caption',this.value)">`;
  else if(t === 'table') body = `${ta('csv', 5, 'Comma separated, first line = headings')}<div class="jb-prev" id="prev_${id}">${tableHTML(b)}</div>`;
  else if(t === 'chart') body = `<div class="jb-row"><select onchange="jField('${P}','${id}','kind',this.value,true)">${['bar', 'line', 'pie'].map(x => `<option ${b.kind === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select onchange="jField('${P}','${id}','source',this.value);jRe()">${[['manual', 'My own numbers'], ['dss', 'Live: DSS (14 days)'], ['study', 'Live: study hours (14 days)'], ['water', 'Live: water (14 days)'], ['weight', 'Live: weight log']].map(x => `<option value="${x[0]}" ${b.source === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
      <input type="text" class="jb-in" placeholder="Graph title" value="${esc(b.title || '')}" oninput="jField('${P}','${id}','title',this.value)">
      ${b.source === 'manual' || !b.source ? ta('csv', 5, 'label,value  (add more columns for more series; first line may start with # to name series)') : '<div class="stat-label">This graph reads your OLC data live.</div>'}<div class="jb-prev" id="prev_${id}">${chartSVG(b)}</div>`;
  else if(t === 'flow') body = `<div class="jb-row"><select onchange="jField('${P}','${id}','dir',this.value,true)"><option value="TB" ${b.dir !== 'LR' ? 'selected' : ''}>Top → down</option><option value="LR" ${b.dir === 'LR' ? 'selected' : ''}>Left → right</option></select></div>
      ${ta('code', 6, 'A --> B --> C   |   A -->|yes| B   |   Name[Box]  Name(Round)  Name([Start/End])  Name{Decision?}')}<div class="jb-prev" id="prev_${id}">${flowSVG(b)}</div>`;
  else if(t === 'embed'){
    const k = b.kind || 'campaign', ach = (state.achievements || []), divs = divisions();
    body = `<div class="jb-row"><select onchange="jField('${P}','${id}','kind',this.value);jRe()">${[['campaign', 'Campaign'], ['promotion', 'Promotion'], ['medal', 'Medal / badge earned'], ['division', 'Division'], ['stats', 'Live status snapshot']].map(x => `<option value="${x[0]}" ${k === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>`;
    if(k === 'promotion') body += `<div class="jb-row"><select onchange="jField('${P}','${id}','rank',Number(this.value));jRe()">${RANKS.map((r, i) => `<option value="${i}" ${Number(b.rank) === i ? 'selected' : ''}>${r.name}</option>`).join('')}</select><input type="date" value="${b.date || ''}" onchange="jField('${P}','${id}','date',this.value);jRe()"></div><input class="jb-in" placeholder="Title (optional)" value="${esc(b.title || '')}" oninput="jField('${P}','${id}','title',this.value)"><textarea class="jb-ta" rows="2" placeholder="Note" oninput="jField('${P}','${id}','note',this.value)">${esc(b.note || '')}</textarea>`;
    else if(k === 'medal') body += `<select class="jb-in" onchange="jField('${P}','${id}','ref',this.value);jRe()"><option value="">— choose —</option>${ach.map(a => `<option value="${a.id}" ${b.ref === a.id ? 'selected' : ''}>${esc(a.name)} (${a.date})</option>`).join('')}</select><textarea class="jb-ta" rows="2" placeholder="Note (optional)" oninput="jField('${P}','${id}','note',this.value)">${esc(b.note || '')}</textarea>`;
    else if(k === 'division') body += `<select class="jb-in" onchange="jField('${P}','${id}','ref',this.value);jRe()"><option value="">— choose —</option>${divs.map(d => `<option value="${d.id}" ${b.ref === d.id ? 'selected' : ''}>${esc(d.division || '')} ${esc(d.name)}</option>`).join('')}</select><textarea class="jb-ta" rows="2" placeholder="Note (optional)" oninput="jField('${P}','${id}','note',this.value)">${esc(b.note || '')}</textarea>`;
    else if(k === 'campaign') body += `<div class="jb-row">${b.img ? `<div class="up-prev wide">${bimg(b.img, 'alt=""')}</div>` : ''}<button class="btn sm" onclick="jImagePick('${P}','${id}')">${b.img ? 'Replace poster' : 'Add campaign picture'}</button></div>
      <input class="jb-in" placeholder="Campaign title" value="${esc(b.title || '')}" oninput="jField('${P}','${id}','title',this.value)"><div class="jb-row"><input type="date" value="${b.date || ''}" onchange="jField('${P}','${id}','date',this.value)"><span>→</span><input type="date" value="${b.endDate || ''}" onchange="jField('${P}','${id}','endDate',this.value)"></div><textarea class="jb-ta" rows="2" placeholder="What happened / what is it for?" oninput="jField('${P}','${id}','note',this.value)">${esc(b.note || '')}</textarea>`;
    body += `<div class="jb-prev">${embedHTML(b)}</div>`;
  }
  return `<div class="jb" data-bid="${id}">${bar}<div class="jb-body">${body}</div><button class="jb-add" onclick="jAddMenu('${P}','${id}')" title="Add a block below">＋</button></div>`;
}
function jAddMenu(pid, after){
  openV10Modal(`<h3 style="justify-content:center;">＋ ADD</h3><div class="jtypes">${BLOCK_TYPES.map(x => `<button class="jtype" onclick="closeV10Modal();jAddBlock('${pid}','${x[0]}',${after ? "'" + after + "'" : 'null'})"><b>${x[1]}</b><span>${x[2]}</span></button>`).join('')}</div>`);
}
function fmt(cmd, val){ document.execCommand(cmd, false, val || null); const a = document.activeElement; if(a && a.dataset && a.dataset.pid) jRichInput(a); }
function fmtLink(){ const u = prompt('Link address (https://…)'); if(u) fmt('createLink', /^https?:|^mailto:/i.test(u) ? u : 'https://' + u); }
function fmtBar(){
  return `<div class="fmtbar" onmousedown="event.preventDefault()"><button onclick="fmt('bold')"><b>B</b></button><button onclick="fmt('italic')"><i>I</i></button><button onclick="fmt('underline')"><u>U</u></button><button onclick="fmt('strikeThrough')"><s>S</s></button>
    <button onclick="fmt('hiliteColor','#ffd23f66')" title="Highlight">🖍</button><label title="Text colour">A<input type="color" value="#d779f1" onchange="fmt('foreColor',this.value)"></label><button onclick="fmtLink()">🔗</button><button onclick="fmt('removeFormat')" title="Clear">⌫</button>
    <span class="sep"></span><button onclick="jAddMenu('${jUI.sel}',null)">＋ Add block</button></div>`;
}

/* ---------- pages ---------- */
function jChildren(pid){ return jPages().filter(p => (p.parent || '') === (pid || '')); }
function jNewPage(parent){
  const p = { id: uid('jp'), title: 'Untitled page', icon: '📄', parent: parent || '', cover: null, color: '', blocks: [newBlock('p')], createdAt: Date.now(), updatedAt: Date.now() };
  jPages().push(p); jUI.sel = p.id; jUI.mode = 'edit'; jSaveUI(); saveState(); jRe(); setTimeout(() => document.getElementById('jTitle')?.select(), 80);
}
function jDelPage(id){
  const p = jPage(id); if(!p || !confirm('Delete the page “' + p.title + '” and its sub-pages?')) return;
  const ids = new Set([id]); let grow = true; while(grow){ grow = false; jPages().forEach(x => { if(x.parent && ids.has(x.parent) && !ids.has(x.id)){ ids.add(x.id); grow = true; } }); }
  state.journal.pages = jPages().filter(x => !ids.has(x.id)); jUI.sel = '@front'; jSaveUI(); saveState(); jRe();
}
function jMovePage(id, d){ const arr = jPages(), p = jPage(id); const sibs = jChildren(p.parent); const i = sibs.indexOf(p), j = i + d; if(j < 0 || j >= sibs.length) return; const a = arr.indexOf(p), b = arr.indexOf(sibs[j]); arr.splice(a, 1); arr.splice(b, 0, p); saveState(); jRe(); }
function jIndent(id, dir){ const p = jPage(id), sibs = jChildren(p.parent), i = sibs.indexOf(p); if(dir > 0){ if(i < 1) return; p.parent = sibs[i - 1].id; } else { const par = jPage(p.parent); if(!par) return; p.parent = par.parent || ''; } saveState(); jRe(); }
function jDupPage(id){ const p = jPage(id); const c = JSON.parse(JSON.stringify(p)); c.id = uid('jp'); c.title += ' (copy)'; c.blocks.forEach(b => b.id = uid('jb')); jPages().push(c); jUI.sel = c.id; jSaveUI(); saveState(); jRe(); }
function jSelect(id){ jUI.sel = id; jSaveUI(); jRe(); document.getElementById('jMain')?.scrollIntoView({ block: 'start' }); window.scrollTo({ top: 0 }); }
function jMode(m){ jUI.mode = m; jSaveUI(); jRe(); }
function jTogglePanel(k){ jUI[k] = !jUI[k]; jSaveUI(); jRe(); }
function jSwap(){ jUI.swap = !jUI.swap; jSaveUI(); jRe(); }
function jTreeHTML(parent, depth){
  const q = (jUI.q || '').toLowerCase();
  return jChildren(parent).map(p => {
    const hit = !q || (p.title || '').toLowerCase().includes(q) || (p.blocks || []).some(b => String(b.text || '').toLowerCase().includes(q));
    const kids = jTreeHTML(p.id, depth + 1);
    if(!hit && !kids) return '';
    return `<div class="jt-item"><button class="jt ${jUI.sel === p.id ? 'on' : ''}" style="padding-left:${10 + depth * 14}px" onclick="jSelect('${p.id}')"><span>${esc(p.icon || '📄')}</span> ${esc(p.title || 'Untitled')}</button>${kids}</div>`;
  }).join('');
}
function jOutline(p){ return (p.blocks || []).filter(b => ['h1', 'h2', 'h3'].includes(b.type)).map(b => `<a class="jo ${b.type}" href="javascript:void(0)" onclick="document.getElementById('h_${b.id}')?.scrollIntoView({behavior:'smooth',block:'start'})">${esc(String(b.text || '').replace(/<[^>]+>/g, '')) || '…'}</a>`).join('') || '<div class="stat-label">Add headings to build an outline.</div>'; }
function jOutlineRefresh(){ const p = jPage(jUI.sel), el = document.getElementById('jOutlineBody'); if(p && el) el.innerHTML = jOutline(p); }
async function jCover(which){
  const files = await pickFiles('image/*', false); if(!files.length) return; const ref = await storeImage(files[0], { maxW: 1600, quality: .8 });
  if(which === '@front') jr().front.img = ref; else if(which === '@back') jr().back.img = ref; else { const p = jPage(which); if(p) p.cover = ref; }
  saveState(); jRe(); syncNow();
}
function jCoverClear(which){ if(which === '@front') jr().front.img = null; else if(which === '@back') jr().back.img = null; else { const p = jPage(which); if(p) p.cover = null; } saveState(); jRe(); }
function jCoverField(which, f, v){ const c = which === '@front' ? jr().front : jr().back; c[f] = v; clearTimeout(jSaveT); jSaveT = setTimeout(() => saveState(), 350); }
function coverHTML(which, edit){
  const c = which === '@front' ? jr().front : jr().back, title = c.title || (which === '@front' ? jr().title : 'The End'), col = c.color || '';
  return `<div class="jcover ${which === '@back' ? 'back' : ''}" style="${col ? 'background-color:' + esc(col) + ';' : ''}">${c.img ? `<div class="jcover-img">${bimg(c.img, 'alt=""')}</div>` : ''}<div class="jcover-txt"><div class="eyebrow">${which === '@front' ? 'OLC JOURNAL' : 'CLOSING PAGE'}</div><h1>${esc(title)}</h1><p>${esc(c.subtitle || (which === '@front' ? jr().subtitle : ''))}</p>${which === '@front' ? `<div class="mono dim">${esc(state.profile.codename || state.profile.name || '')}</div>` : ''}</div></div>
  ${edit ? `<div class="panel jcover-edit"><div class="grid c2"><div class="field"><label class="f">Title</label><input type="text" value="${esc(c.title || '')}" placeholder="${esc(title)}" oninput="jCoverField('${which}','title',this.value)" onchange="jRe()"></div><div class="field"><label class="f">Subtitle</label><input type="text" value="${esc(c.subtitle || '')}" oninput="jCoverField('${which}','subtitle',this.value)" onchange="jRe()"></div></div>
    <div class="jb-row"><button class="btn sm" onclick="jCover('${which}')">${c.img ? 'Replace cover picture' : 'Add cover picture'}</button>${c.img ? `<button class="btn ghost sm" onclick="jCoverClear('${which}')">Remove picture</button>` : ''}<label class="f" style="margin:0">Colour <input type="color" value="${col || '#1a1226'}" onchange="jCoverField('${which}','color',this.value);jRe()"></label></div></div>` : ''}`;
}
function pageHTML(p, edit){
  const n = (p.blocks || []).length;
  return `${p.cover ? `<div class="jpage-cover">${bimg(p.cover, 'alt=""')}</div>` : ''}
  <div class="jpage-head">${edit ? `<input id="jTitle" class="jtitle-in" type="text" value="${esc(p.title)}" oninput="jPageField('${p.id}','title',this.value)"><input class="jicon-in" type="text" maxlength="4" value="${esc(p.icon || '📄')}" oninput="jPageField('${p.id}','icon',this.value)" title="Page icon">` : `<h1 class="jtitle"><span>${esc(p.icon || '')}</span> ${esc(p.title)}</h1>`}</div>
  <div class="stat-label">${p.updatedAt ? 'UPDATED ' + new Date(p.updatedAt).toLocaleString() : ''}</div>
  ${edit ? `<div class="jb-row page-tools2"><button class="btn ghost sm" onclick="jCover('${p.id}')">${p.cover ? 'Replace page cover' : '＋ Page cover'}</button>${p.cover ? `<button class="btn ghost sm" onclick="jCoverClear('${p.id}')">Remove cover</button>` : ''}
    <button class="btn ghost sm" onclick="jIndent('${p.id}',-1)" title="Make it a main page">⇤</button><button class="btn ghost sm" onclick="jIndent('${p.id}',1)" title="Make it a sub-page of the one above">⇥</button><button class="btn ghost sm" onclick="jMovePage('${p.id}',-1)">▲</button><button class="btn ghost sm" onclick="jMovePage('${p.id}',1)">▼</button><button class="btn ghost sm" onclick="jNewPage('${p.id}')">＋ Sub-page</button><button class="btn ghost sm" onclick="jDupPage('${p.id}')">⧉</button><button class="btn ghost sm" onclick="jDelPage('${p.id}')">🗑</button></div>` : ''}
  <div class="jbody">${(p.blocks || []).map((b, i) => edit ? blockEdit(p, b, i, n) : blockView(p, b)).join('') || '<div class="empty">Empty page.</div>'}</div>
  ${edit ? `<button class="btn" style="margin-top:12px;" onclick="jAddMenu('${p.id}',null)">＋ Add block</button>` : ''}`;
}
function jPageField(id, f, v){ const p = jPage(id); if(!p) return; p[f] = v; jTouch(id); const t = document.querySelector(`.jt.on`); }
function journalSection(){
  const edit = jUI.mode === 'edit', sel = jUI.sel, p = jPage(sel);
  if(sel !== '@front' && sel !== '@back' && !p) jUI.sel = '@front';
  const cur = jUI.sel === '@front' || jUI.sel === '@back' ? null : jPage(jUI.sel);
  const side = `<aside class="jside jpages ${jUI.pages ? '' : 'hide'}"><div class="jside-h"><b>PAGES</b><button class="btn ghost sm" onclick="jTogglePanel('pages')" title="Hide">✕</button></div>
      <input type="search" class="jsearch" placeholder="Search the journal…" value="${esc(jUI.q || '')}" oninput="jUI.q=this.value;clearTimeout(window.__jq);window.__jq=setTimeout(()=>{const f=document.activeElement===this;jRe();if(f){const e=document.querySelector('.jsearch');e&&e.focus();e&&e.setSelectionRange(e.value.length,e.value.length);}},250)">
      <button class="jt ${jUI.sel === '@front' ? 'on' : ''}" onclick="jSelect('@front')">📖 Front cover</button>${jTreeHTML('', 0)}<button class="jt ${jUI.sel === '@back' ? 'on' : ''}" onclick="jSelect('@back')">🔖 Back cover</button>
      <button class="btn sm" style="margin-top:8px;width:100%;" onclick="jNewPage('')">＋ New page</button></aside>`;
  const outline = `<aside class="jside jout ${jUI.outline && cur ? '' : 'hide'}"><div class="jside-h"><b>OUTLINE</b><button class="btn ghost sm" onclick="jTogglePanel('outline')" title="Hide">✕</button></div><div id="jOutlineBody">${cur ? jOutline(cur) : ''}</div></aside>`;
  const main = `<main id="jMain" class="jmain">${edit && cur ? fmtBar() : ''}<article class="jarticle">${cur ? pageHTML(cur, edit) : coverHTML(jUI.sel, edit)}</article></main>`;
  return `<div class="pagehead"><h2>${esc(jr().title || 'OLC JOURNAL')}</h2><div class="sub">WRITE FREELY — PAGES, PICTURES, GRAPHS, FLOWCHARTS, CAMPAIGNS, PROMOTIONS, COVERS</div></div>
  <div class="jtoolbar"><button class="btn sm ${edit ? '' : 'ghost'}" onclick="jMode('${edit ? 'read' : 'edit'}')">${edit ? '👁 Read' : '✎ Edit'}</button>
    <button class="btn ghost sm ${jUI.pages ? 'on' : ''}" onclick="jTogglePanel('pages')">☰ Pages</button><button class="btn ghost sm ${jUI.outline ? 'on' : ''}" onclick="jTogglePanel('outline')">≣ Outline</button><button class="btn ghost sm" onclick="jSwap()" title="Swap the side panels">⇄ Move panels</button>
    <span class="spacer"></span><button class="btn ghost sm" onclick="jRenameJournal()">Rename journal</button><button class="btn ghost sm" onclick="jPrint()">🖨 Print / PDF</button><button class="btn ghost sm" onclick="jExportHTML()">⬇ Save as web page</button></div>
  <div class="jlayout ${jUI.swap ? 'swap' : ''}">${side}${main}${outline}</div>`;
}
function jRenameJournal(){ const t = prompt('Journal title', jr().title); if(t === null) return; jr().title = t.trim() || jr().title; const s = prompt('Subtitle (optional)', jr().subtitle || ''); if(s !== null) jr().subtitle = s.trim(); saveState(); jRe(); }

/* ---------- print / export ---------- */
function jAllHTML(){
  const order = []; (function add(par){ jChildren(par).forEach(p => { order.push(p); add(p.id); }); })('');
  return `<section class="jprint-page">${coverHTML('@front', false)}</section>` + order.map(p => `<section class="jprint-page">${pageHTML(p, false)}</section>`).join('') + `<section class="jprint-page">${coverHTML('@back', false)}</section>`;
}
function jPrint(){
  let r = document.getElementById('jPrintRoot'); if(!r){ r = document.createElement('div'); r.id = 'jPrintRoot'; document.body.appendChild(r); }
  r.innerHTML = jAllHTML(); Blobs.hydrate(r); document.body.classList.add('printing-journal');
  setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove('printing-journal'); r.innerHTML = ''; }, 500); }, 600);
}
async function jExportHTML(){
  toast('Preparing the web page…', 3000);
  const div = document.createElement('div'); div.innerHTML = jAllHTML();
  for(const img of div.querySelectorAll('img[data-bref]')){
    const b = await Blobs.getBlob(img.getAttribute('data-bref')); if(!b) continue;
    img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); img.removeAttribute('data-bref');
  }
  const css = [...document.styleSheets].map(s => { try{ return [...s.cssRules].map(r => r.cssText).join('\n'); }catch(e){ return ''; } }).join('\n');
  const html = `<!DOCTYPE html><html data-theme="${document.documentElement.getAttribute('data-theme')}" style="${document.documentElement.getAttribute('style') || ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(jr().title)}</title><style>${css}\nbody{padding:20px;max-width:900px;margin:auto}</style></head><body class="journal-export">${div.innerHTML}</body></html>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = (jr().title || 'journal').replace(/[^\w\- ]+/g, '') + '.html'; a.click();
}
