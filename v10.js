/* ============================================================
   OLC v10 — Divisions • OLC Book • sidebar arranging • PDF tools
   (the Journal lives in journal.js and loads only when opened, so the app opens fast)
   ============================================================ */

/* ---------- small helpers ---------- */
const $q = (s, r) => (r || document).querySelector(s);
function openV10Modal(html, wide){ const b = document.getElementById('v10ModalBox'); b.innerHTML = html; b.classList.toggle('wide', !!wide); document.getElementById('v10Modal').style.display = 'flex'; if(typeof Blobs !== 'undefined') Blobs.hydrate(b); }
function closeV10Modal(){ document.getElementById('v10Modal').style.display = 'none'; document.getElementById('v10ModalBox').innerHTML = ''; }
function setThemeQuiet(theme){
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtnDark')?.classList.toggle('active', theme === 'dark');
  document.getElementById('themeBtnLight')?.classList.toggle('active', theme === 'light');
}
function fmtBytes(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function pickFiles(accept, multiple){
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '*/*'; i.multiple = !!multiple; i.style.display = 'none';
    i.onchange = () => { res([...(i.files || [])]); i.remove(); };
    document.body.appendChild(i); i.click();
    setTimeout(() => { if(!i.files || !i.files.length) { /* cancelled: nothing to do */ } }, 0);
  });
}
async function storeImage(file, opt){ const b = await Blobs.compress(file, opt); return Blobs.put(b, b.type || file.type); }
function askReason(title, intro, needed){
  return new Promise((res) => {
    openV10Modal(`<h3 style="justify-content:center;">${esc(title)}</h3><p class="stat-label" style="text-align:center;line-height:1.6;">${esc(intro)}</p>
      <textarea id="reasonTxt" rows="3" placeholder="Reason…"></textarea><div id="reasonErr" class="stat-label" style="color:var(--danger);min-height:14px;"></div>
      <div style="display:flex;gap:8px;margin-top:8px;"><button class="btn" id="reasonOk">Confirm</button><button class="btn ghost" id="reasonNo">Cancel</button></div>`);
    $q('#reasonOk').onclick = () => { const v = $q('#reasonTxt').value.trim(); if(needed && !v){ $q('#reasonErr').textContent = 'Please write a reason.'; return; } closeV10Modal(); res(v); };
    $q('#reasonNo').onclick = () => { closeV10Modal(); res(null); };
    setTimeout(() => $q('#reasonTxt') && $q('#reasonTxt').focus(), 50);
  });
}

/* ---------- PDF tools (pdf.js is vendored and only loaded when a PDF is used) ---------- */
let pdfLibP = null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(pdfLibP) return pdfLibP;
  pdfLibP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfLibP = null; rej(new Error('PDF tools could not load')); };
    document.head.appendChild(s);
  });
  return pdfLibP;
}
async function openPdfDoc(blobOrBuf){
  const lib = await loadPdfJs();
  const data = blobOrBuf instanceof Blob ? await blobOrBuf.arrayBuffer() : blobOrBuf;
  return lib.getDocument({ data }).promise;
}
async function pdfToImageBlobs(file, onProgress, width){
  const pdf = await openPdfDoc(file), out = [];
  for(let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const scale = (width || 900) / v0.width, vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    out.push(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.74)));
    page.cleanup && page.cleanup();
    if(onProgress) onProgress(i, pdf.numPages);
  }
  return out;
}
/* in-app PDF reader */
let pdfView = null;
async function openPdfViewer(ref, title){
  openV10Modal(`<div class="pdfv"><div class="pdfv-bar"><b>${esc(title || 'PDF')}</b><span class="spacer"></span>
    <button class="btn ghost sm" onclick="pdfStep(-1)">‹</button><span id="pdfPg" class="mono">…</span><button class="btn ghost sm" onclick="pdfStep(1)">›</button>
    <button class="btn ghost sm" onclick="pdfZoom(-.2)">−</button><button class="btn ghost sm" onclick="pdfZoom(.2)">+</button>
    <button class="btn ghost sm" onclick="pdfDownload()">⬇</button><button class="btn ghost sm" onclick="closeV10Modal()">✕</button></div>
    <div class="pdfv-body" id="pdfBody"><div class="empty">Opening…</div></div></div>`, true);
  try{
    const blob = await Blobs.getBlob(ref);
    if(!blob){ $q('#pdfBody').innerHTML = '<div class="empty">This file is not on this device yet and could not be downloaded. Connect to the internet and try again.</div>'; return; }
    const pdf = await openPdfDoc(blob);
    pdfView = { pdf, n: 1, zoom: 1, blob, title };
    pdfDraw();
  }catch(e){ const b = $q('#pdfBody'); if(b) b.innerHTML = '<div class="empty">Could not display this PDF here. Use ⬇ to download it.</div>'; pdfView = pdfView || { blob: null }; }
}
async function pdfDraw(){
  const v = pdfView; if(!v || !v.pdf) return;
  const body = $q('#pdfBody'); if(!body) return;
  const page = await v.pdf.getPage(v.n);
  const w = Math.min(body.clientWidth - 16, 1100) * v.zoom, vp0 = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5), vp = page.getViewport({ scale: (w / vp0.width) * dpr });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = Math.round(w) + 'px';
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  body.innerHTML = ''; body.appendChild(c);
  const pg = $q('#pdfPg'); if(pg) pg.textContent = v.n + ' / ' + v.pdf.numPages;
}
function pdfStep(d){ const v = pdfView; if(!v || !v.pdf) return; v.n = clamp(v.n + d, 1, v.pdf.numPages); pdfDraw(); }
function pdfZoom(d){ const v = pdfView; if(!v) return; v.zoom = clamp(v.zoom + d, .5, 3); pdfDraw(); }
function pdfDownload(){ const v = pdfView; if(!v || !v.blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(v.blob); a.download = ((v.title || 'document').replace(/[^\w\- ]+/g, '') || 'document') + '.pdf'; a.click(); }

/* ============================================================
   DIVISIONS
   ============================================================ */
const PALETTES = [
  { n: 'Violet Command', c: ['#c46be0', '#5b46b0', '#19c4c4'] }, { n: 'Ocean Fleet', c: ['#3b9ae8', '#1f5aa6', '#4fd1e0'] },
  { n: 'Emerald Corps', c: ['#2fbf71', '#146b3f', '#7ad9b0'] }, { n: 'Crimson Guard', c: ['#e0475b', '#8c1f33', '#ff9a8b'] },
  { n: 'Amber Wing', c: ['#e8a33d', '#8a5a14', '#3cc9b4'] }, { n: 'Rose Unit', c: ['#e0529c', '#8a2260', '#f7a8cf'] },
  { n: 'Steel Mono', c: ['#9aa3b5', '#4d566a', '#cfd6e4'] }, { n: 'Saffron Dawn', c: ['#f08a24', '#7a3b0a', '#2f9e44'] },
  { n: 'Midnight Gold', c: ['#d9b04a', '#2b3a67', '#8fb4ff'] }, { n: 'Forest Ops', c: ['#7cb342', '#33502b', '#c0ca33'] },
  { n: 'Arctic', c: ['#5ec8f2', '#2d6a8f', '#b8e8ff'] }, { n: 'Sunset', c: ['#f2705a', '#7b2d5b', '#ffc15e'] },
];
/* ---------- THEME ENGINE: builds a balanced, readable dark OR light palette from the Division's 3 colours ---------- */
const hex2rgb = (h) => { h = String(h || '#000').replace('#', ''); if(h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r) => '#' + r.map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
const mixc = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex([0, 1, 2].map(i => x[i] * (1 - t) + y[i] * t)); };
const rgba = (h, a) => { const r = hex2rgb(h); return `rgba(${r[0]},${r[1]},${r[2]},${a})`; };
function hex2hsl(hex){
  let [r, g, b] = hex2rgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if(mx !== mn){ const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s: s * 100, l: l * 100 };
}
function hsl2hex(h, s, l){
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
const lum = (hex) => { const [r, g, b] = hex2rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/* nudge lightness (up on dark backgrounds, down on light ones) until the colour is readable on the background */
function readable(hex, bg, min, dark){
  const c = hex2hsl(hex); let l = c.l, n = 0;
  while(contrast(hsl2hex(c.h, c.s, l), bg) < min && n++ < 60) l += dark ? 1.5 : -1.5;
  return hsl2hex(c.h, c.s, clamp(l, 4, 96));
}
function buildTheme(col, mode){
  const dark = mode !== 'light', P = hex2hsl(col.p), S = hex2hsl(col.s), A = hex2hsl(col.a);
  const hue = P.h, tint = clamp(P.s, 10, 70);
  const bg0 = dark ? hsl2hex(hue, tint * .5, 3) : hsl2hex(hue, tint * .8, 97.5);
  const bg1 = dark ? hsl2hex(hue, tint * .5, 6) : hsl2hex(hue, tint * .75, 94.5);
  const bg2 = dark ? hsl2hex(hue, tint * .45, 9.5) : hsl2hex(hue, tint * .65, 90);
  const lav = readable(hsl2hex(P.h, clamp(P.s, 40, 92), dark ? clamp(P.l, 60, 76) : clamp(P.l, 26, 42)), bg1, 4.8, dark);
  const vio = hsl2hex(S.h, clamp(S.s, 30, 85), dark ? clamp(S.l, 34, 52) : clamp(S.l, 40, 58));
  const cyn = readable(hsl2hex(A.h, clamp(A.s, 40, 95), dark ? clamp(A.l, 56, 72) : clamp(A.l, 26, 40)), bg1, 4.6, dark);
  const txt = readable(dark ? hsl2hex(hue, 28, 95) : hsl2hex(hue, 42, 10), bg1, 12, dark);
  const dim = readable(hsl2hex(hue, 18, dark ? 68 : 34), bg1, 4.8, dark);
  const onAcc = contrast('#0b0612', lav) >= contrast('#ffffff', lav) ? '#0b0612' : '#ffffff';
  return {
    '--bg-0': bg0, '--bg-1': bg1, '--bg-2': bg2, '--lavender': lav, '--lavender-dim': mixc(lav, bg1, dark ? .38 : .3), '--violet': vio, '--cyan': cyn, '--white': txt, '--dim': dim,
    '--border': rgba(lav, dark ? .26 : .3), '--border-strong': rgba(lav, dark ? .56 : .62), '--panel': rgba(lav, dark ? .065 : .05), '--panel-2': rgba(lav, dark ? .11 : .09),
    '--glow-a': dark ? '30%' : '13%', '--glow-b': dark ? '11%' : '7%', '--on-accent': onAcc,
  };
}
const THEME_VARS = ['--lavender', '--lavender-dim', '--violet', '--cyan', '--border', '--border-strong', '--panel', '--panel-2', '--bg-0', '--bg-1', '--bg-2', '--white', '--dim', '--glow-a', '--glow-b', '--on-accent'];

function divisions(){ return (state && state.divisions) || []; }
function activeDivision(){ return divisions().find(d => d.id === state.activeDivisionId) || null; }
function divColors(d){ const c = (d && d.colors) || {}; return { p: c.primary || '#d779f1', s: c.secondary || '#6753b7', a: c.accent || '#01c4c4' }; }
/* the whole system takes the active Division's colours and its dark/light choice */
function applyDivisionTheme(){
  const root = document.documentElement, d = activeDivision();
  THEME_VARS.forEach(v => root.style.removeProperty(v));
  let theme = (state && state.settings && state.settings.theme) || 'dark';
  if(d){
    const c = divColors(d);
    if(d.systemTheme === 'dark' || d.systemTheme === 'light') theme = d.systemTheme;
    const vars = buildTheme(c, theme);
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
  }
  setThemeQuiet(theme);
  const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.setAttribute('content', (d ? buildTheme(divColors(d), theme)['--bg-1'] : (theme === 'light' ? '#ece0f6' : '#0b0714')));
  const bt = document.getElementById('divBtnTxt'); if(bt) bt.textContent = d ? (d.name || d.division || 'Division') : 'Division';
  document.querySelectorAll('.themeToggle').forEach(el => { el.classList.toggle('locked', !!(d && d.systemTheme && d.systemTheme !== 'auto')); });
}
function divStatus(d){
  const t = todayStr();
  if(d.start && t < d.start) return 'UPCOMING';
  if(d.end && t > d.end) return 'ENDED';
  return d.start || d.end ? 'RUNNING' : 'OPEN-ENDED';
}
function divDuration(d){
  if(d.start && d.end) return Math.max(1, daysBetween(d.start, d.end) + 1);
  return Number(d.durationDays) || 0;
}
function flagSVG(d){
  const c = divColors(d);
  return `<svg viewBox="0 0 120 80" class="flag-svg" preserveAspectRatio="none"><rect width="120" height="27" fill="${c.p}"/><rect y="27" width="120" height="26" fill="${c.s}"/><rect y="53" width="120" height="27" fill="${c.a}"/></svg>`;
}
function divisionFlagHTML(){
  const d = state && activeDivision(); if(!d) return '';
  return `<div class="flag-box" onclick="go('divisions')" title="Open Divisions"><div class="flag-cloth">${d.flag ? bimg(d.flag, 'alt="Flag" class="flag-img"') : flagSVG(d)}</div><div class="flag-cap"><b>${esc(d.division || 'DIVISION')}</b><span>${esc(d.name || '')}</span></div></div>`;
}
function profileDivisionHTML(){
  const d = state && activeDivision();
  if(!d) return `<div class="prof-div empty-div" onclick="go('divisions')">⚔ No active Division — tap to choose one</div>`;
  return `<div class="prof-div" onclick="go('divisions')" title="Open Divisions"><span class="prof-div-logo">${d.logo ? bimg(d.logo, 'alt="Division logo"') : '⚔'}</span><span class="prof-div-txt"><small>${esc(d.division || 'DIVISION')}</small><b>${esc(d.name || '')}</b></span></div>`;
}

let divForm = { open: false, editId: null, logo: null, flag: null }, openDivId = null;
window.OLC_BUSY = window.OLC_BUSY || []; window.OLC_BUSY.push(() => divForm.open);

function openDivisionSwitcher(){
  const list = divisions(), act = activeDivision();
  openV10Modal(`<h3 style="justify-content:center;">⚔ DIVISION — SYSTEM THEME</h3>
    <p class="stat-label" style="text-align:center;line-height:1.6;">The Division that is ON decides the colours and the dark/light mode of the whole system.</p>
    ${list.length ? list.map(d => `<div class="div-pick ${act && act.id === d.id ? 'on' : ''}"><span class="swatch" style="background:linear-gradient(90deg,${divColors(d).p},${divColors(d).s},${divColors(d).a})"></span>
      <span class="grow"><b>${esc(d.division || '')}</b> ${esc(d.name || '')}</span>
      <button class="btn ${act && act.id === d.id ? '' : 'ghost'} sm" onclick="closeV10Modal();toggleDivision('${d.id}')">${act && act.id === d.id ? 'ON — turn off' : 'Turn on'}</button></div>`).join('') : '<div class="empty">No Divisions yet.</div>'}
    <div style="display:flex;gap:8px;margin-top:12px;"><button class="btn" onclick="closeV10Modal();go('divisions');openDivisionForm()">＋ New Division</button><button class="btn ghost" onclick="closeV10Modal();go('divisions')">Manage</button></div>`);
}
async function toggleDivision(id){
  const d = divisions().find(x => x.id === id); if(!d) return;
  const turningOn = state.activeDivisionId !== id;
  const reason = await askReason(turningOn ? 'Turn ON ' + (d.name || d.division) : 'Turn OFF ' + (d.name || d.division),
    turningOn ? 'Why are you switching this Division on? The whole system will take its theme.' : 'Why are you switching this Division off? The system returns to the default theme.', true);
  if(reason === null) return;
  const now = Date.now();
  if(turningOn){
    const prev = activeDivision();
    if(prev){ prev.reasonLog = prev.reasonLog || []; prev.reasonLog.unshift({ id: uid('rl'), at: now, on: false, reason: 'Replaced by ' + (d.name || d.division) + ' — ' + reason }); }
    state.activeDivisionId = id;
  } else state.activeDivisionId = null;
  d.reasonLog = d.reasonLog || []; d.reasonLog.unshift({ id: uid('rl'), at: now, on: turningOn, reason });
  saveState(); applyDivisionTheme(); renderAll();
  toast(turningOn ? '⚔ ' + (d.name || d.division) + ' is now ON' : 'Division OFF — default theme restored');
}
function openDivisionForm(id){
  const d = id ? divisions().find(x => x.id === id) : null;
  divForm = { open: true, editId: id || null, logo: d ? d.logo : null, flag: d ? d.flag : null, colors: d ? divColors(d) : null };
  if(currentSection !== 'divisions') go('divisions'); else renderSection();
  setTimeout(() => document.getElementById('divFormPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); setTimeout(divPreview, 90);
}
function closeDivisionForm(){ divForm = { open: false, editId: null, logo: null, flag: null }; renderSection(); }
async function divUpload(kind, input){
  const f = input.files && input.files[0]; if(!f) return;
  try{ divForm[kind] = await storeImage(f, { maxW: kind === 'logo' ? 400 : 700, keepAlpha: kind === 'logo' || /png/.test(f.type), quality: .85 }); divFormKeep(); renderSection(); }
  catch(e){ alert('Could not read that image — try a different file.'); }
}
function divFormKeep(){ setTimeout(divPreview, 30);
  const g = (id) => document.getElementById(id); if(!g('df_name')) return;
  divForm.keep = { division: g('df_division').value, name: g('df_name').value, p: g('df_c1').value, s: g('df_c2').value, a: g('df_c3').value, sys: g('df_sys').value, start: g('df_start').value, end: g('df_end').value, dur: g('df_dur').value, mission: g('df_mission').value, objective: g('df_obj').value };
}
function divPreview(){
  const g = (id) => document.getElementById(id), box = g('divPreview'); if(!box || !g('df_c1')) return;
  const col = { p: g('df_c1').value, s: g('df_c2').value, a: g('df_c3').value };
  box.innerHTML = ['dark', 'light'].map(m => { const v = buildTheme(col, m); const st = Object.keys(v).map(k => k + ':' + v[k]).join(';');
    return `<div class="pv" style="${st};background:linear-gradient(160deg,var(--bg-0),var(--bg-2));color:var(--white)"><b style="color:var(--lavender);font-family:Orbitron;font-size:12px">${m.toUpperCase()}</b><div class="pv-panel" style="background:var(--panel-2);border:1px solid var(--border-strong)"><span style="color:var(--white)">Readable text</span> <small style="color:var(--dim)">muted text</small></div><div class="pv-row"><i style="background:var(--lavender)"></i><i style="background:var(--violet)"></i><i style="background:var(--cyan)"></i><span class="pv-btn" style="background:var(--lavender);color:var(--on-accent)">Button</span></div></div>`; }).join('');
}
function divHarmonise(){
  const g = (id) => document.getElementById(id), P = hex2hsl(g('df_c1').value);
  g('df_c2').value = hsl2hex(P.h - 14, clamp(P.s * .9, 30, 80), clamp(P.l * .55, 22, 42));
  g('df_c3').value = hsl2hex(P.h + 160, clamp(P.s, 45, 85), 62);
  divPreview();
}
function divPreset(i){ divFormKeep(); const c = PALETTES[i].c; divForm.keep = Object.assign(divForm.keep || {}, { p: c[0], s: c[1], a: c[2] }); renderSection(); setTimeout(divPreview, 40); }
function divClear(kind){ divFormKeep(); divForm[kind] = null; renderSection(); }
function saveDivisionForm(){
  const g = (id) => document.getElementById(id).value;
  const name = g('df_name').trim(); if(!name){ alert('Give the Division a name.'); return; }
  const v = { division: g('df_division').trim() || 'DIVISION', name, logo: divForm.logo, flag: divForm.flag,
    colors: { primary: g('df_c1'), secondary: g('df_c2'), accent: g('df_c3') }, systemTheme: g('df_sys'),
    start: g('df_start'), end: g('df_end'), durationDays: Number(g('df_dur')) || 0, mission: g('df_mission').trim(), objective: g('df_obj').trim() };
  if(divForm.editId){ const d = divisions().find(x => x.id === divForm.editId); if(d) Object.assign(d, v); }
  else state.divisions.push(Object.assign({ id: uid('div'), books: [], reasonLog: [], createdAt: Date.now() }, v));
  divForm = { open: false, editId: null, logo: null, flag: null };
  saveState(); applyDivisionTheme(); renderSection(); toast('Division saved');
}
function deleteDivision(id){
  const d = divisions().find(x => x.id === id); if(!d) return;
  if(!confirm('Delete the Division "' + (d.name || d.division) + '"? Its PDF books and history are removed too.')) return;
  if(state.activeDivisionId === id) state.activeDivisionId = null;
  state.divisions = state.divisions.filter(x => x.id !== id);
  if(openDivId === id) openDivId = null;
  saveState(); applyDivisionTheme(); renderSection();
}
async function addDivisionBook(id){
  const d = divisions().find(x => x.id === id); if(!d) return;
  const files = await pickFiles('application/pdf,.pdf', true); if(!files.length) return;
  d.books = d.books || [];
  for(const f of files){
    if(f.size > 38 * 1048576){ alert(f.name + ' is larger than 38 MB — please use a smaller PDF.'); continue; }
    toast('Adding ' + f.name + '…', 2500);
    const ref = await Blobs.put(f, 'application/pdf');
    d.books.push({ id: uid('dbk'), name: f.name.replace(/\.pdf$/i, ''), file: ref, size: f.size, addedAt: Date.now() });
  }
  saveState(); renderSection(); syncNow();
}
function removeDivisionBook(id, bid){ const d = divisions().find(x => x.id === id); if(!d || !confirm('Remove this PDF from the Division?')) return; d.books = (d.books || []).filter(b => b.id !== bid); saveState(); renderSection(); }
async function downloadBlobRef(ref, name, ext){ const b = await Blobs.getBlob(ref); if(!b){ toast('File not available yet — connect to the internet.'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (name || 'file').replace(/[^\w\- ]+/g, '') + (ext || ''); a.click(); }
function openDivision(id){ openDivId = id; renderSection(); window.scrollTo({ top: 0 }); }

function divCardHTML(d){
  const on = state.activeDivisionId === d.id, c = divColors(d), st = divStatus(d), dur = divDuration(d);
  let prog = '';
  if(d.start && d.end){ const n = daysBetween(d.start, todayStr()) + 1; const pct = clamp(n / dur * 100, 0, 100); prog = `<div class="bar" style="margin-top:8px;"><i style="width:${pct}%"></i></div><div class="stat-label">${st === 'UPCOMING' ? 'STARTS IN ' + (-daysBetween(todayStr(), d.start)) + ' DAYS' : st === 'ENDED' ? 'COMPLETED' : 'DAY ' + n + ' OF ' + dur}</div>`; }
  return `<div class="panel div-card ${on ? 'on' : ''}" style="--dc:${c.p}">
    <div class="div-card-top"><span class="div-logo">${d.logo ? bimg(d.logo, 'alt=""') : '⚔'}</span>
      <div class="grow"><div class="eyebrow">${esc(d.division || 'DIVISION')}</div><div class="div-name">${esc(d.name)}</div>
        <div class="chips"><span class="chip ${on ? 'on' : ''}">${on ? '● ON' : '○ OFF'}</span><span class="chip">${st}</span>${dur ? `<span class="chip">${dur} DAYS</span>` : ''}</div></div>
      <div class="div-flag-mini">${d.flag ? bimg(d.flag, 'alt=""') : flagSVG(d)}</div></div>
    ${prog}
    <div class="div-actions"><button class="btn ${on ? '' : 'ghost'} sm" onclick="toggleDivision('${d.id}')">${on ? 'Turn OFF' : 'Turn ON'}</button>
      <button class="btn ghost sm" onclick="openDivision('${d.id}')">Open</button>
      <button class="btn ghost sm" onclick="openDivisionForm('${d.id}')">Edit</button>
      <button class="btn ghost sm" onclick="deleteDivision('${d.id}')">🗑</button></div></div>`;
}
function divDetailHTML(d){
  const on = state.activeDivisionId === d.id, c = divColors(d), dur = divDuration(d);
  return `<div class="pagehead"><h2>${esc(d.division || 'DIVISION')} — ${esc(d.name)}</h2><div class="sub"><a href="javascript:openDivision(null)" style="color:var(--cyan)">‹ All Divisions</a></div></div>
  <div class="panel div-hero" style="background-image:linear-gradient(120deg,${rgba(c.s, .55)},${rgba(c.p, .25)})">
    <span class="div-logo big">${d.logo ? bimg(d.logo, 'alt=""') : '⚔'}</span>
    <div class="grow"><div class="eyebrow">${esc(d.division || '')}</div><div class="disp" style="font-size:22px;">${esc(d.name)}</div>
      <div class="chips"><span class="chip ${on ? 'on' : ''}">${on ? '● PRIMARY ON' : '○ PRIMARY OFF'}</span><span class="chip">${divStatus(d)}</span></div></div>
    <div class="div-flag-mini big">${d.flag ? bimg(d.flag, 'alt="Flag"') : flagSVG(d)}</div>
    <button class="btn ${on ? '' : 'ghost'}" onclick="toggleDivision('${d.id}')">${on ? 'Turn OFF (with reason)' : 'Turn ON (with reason)'}</button></div>
  <div class="grid c2" style="margin-top:16px;">
    <div class="panel"><h3><span class="ic">⚑</span>MISSION</h3><div class="prose">${d.mission ? esc(d.mission) : '<span class="dim">Not written yet — tap Edit.</span>'}</div>
      <h3 style="margin-top:16px;"><span class="ic">◎</span>OBJECTIVE</h3><div class="prose">${d.objective ? esc(d.objective) : '<span class="dim">Not written yet.</span>'}</div></div>
    <div class="panel"><h3><span class="ic">⏱</span>TIMELINE</h3>
      <div class="kv"><span>Start</span><b>${d.start ? fmtDateLong(d.start) : '—'}</b></div><div class="kv"><span>End</span><b>${d.end ? fmtDateLong(d.end) : '—'}</b></div>
      <div class="kv"><span>Duration</span><b>${dur ? dur + ' days' : '—'}</b></div>
      <div class="kv"><span>System theme</span><b>${esc(d.systemTheme || 'auto')}</b></div>
      <div class="kv"><span>Colours</span><b><i class="dot-c" style="background:${c.p}"></i><i class="dot-c" style="background:${c.s}"></i><i class="dot-c" style="background:${c.a}"></i></b></div></div>
  </div>
  <div class="panel" style="margin-top:16px;"><h3><span class="ic">📕</span>DIVISION BOOKS (PDF)</h3>
    ${(d.books || []).length ? (d.books || []).map(b => `<div class="dev-row"><div><b>📄 ${esc(b.name)}</b><div class="stat-label">${fmtBytes(b.size || 0)} · added ${new Date(b.addedAt || Date.now()).toLocaleDateString()}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" onclick="openPdfViewer('${esc(b.file)}','${esc(b.name).replace(/'/g, '')}')">Read</button><button class="btn ghost sm" onclick="downloadBlobRef('${esc(b.file)}','${esc(b.name).replace(/'/g, '')}','.pdf')">⬇</button><button class="btn ghost sm" onclick="removeDivisionBook('${d.id}','${b.id}')">🗑</button></div></div>`).join('') : '<div class="empty">No PDF book yet.</div>'}
    <button class="btn" style="margin-top:10px;" onclick="addDivisionBook('${d.id}')">＋ Add PDF book</button></div>
  <div class="panel" style="margin-top:16px;"><h3><span class="ic">⏻</span>PRIMARY ON / OFF HISTORY</h3>
    ${(d.reasonLog || []).length ? (d.reasonLog || []).slice().sort((a, b) => b.at - a.at).map(r => `<div class="timeline-item"><div><div class="mono" style="color:${r.on ? 'var(--green)' : 'var(--danger)'};font-size:12px;">${r.on ? 'TURNED ON' : 'TURNED OFF'} · ${new Date(r.at).toLocaleString()}</div><div>${esc(r.reason)}</div></div></div>`).join('') : '<div class="empty">Never switched yet.</div>'}</div>`;
}
function divFormHTML(){
  const d = divForm.editId ? divisions().find(x => x.id === divForm.editId) : null, k = divForm.keep || {};
  const c = d ? divColors(d) : { p: '#d779f1', s: '#6753b7', a: '#01c4c4' };
  const val = (kk, dv) => esc(k[kk] !== undefined ? k[kk] : dv);
  return `<div class="panel" id="divFormPanel" style="border-color:var(--border-strong);margin-bottom:16px;"><h3><span class="ic">⚔</span>${d ? 'EDIT DIVISION' : 'NEW DIVISION'}</h3>
    <div class="grid c2"><div class="field"><label class="f">Division (code / number)</label><input type="text" id="df_division" value="${val('division', d ? d.division || '' : 'DIVISION 01')}"></div>
    <div class="field"><label class="f">Name</label><input type="text" id="df_name" value="${val('name', d ? d.name : '')}" placeholder="e.g. Scholarship Strike Force"></div></div>
    <div class="grid c2">
      <div><label class="f">Logo</label>${divForm.logo ? `<div class="up-prev">${bimg(divForm.logo, 'alt=""')}<button class="btn ghost sm" onclick="divClear('logo')">✕</button></div>` : ''}<button type="button" class="btn ghost sm" onclick="document.getElementById('df_logoIn').click()">Upload logo</button><input type="file" id="df_logoIn" accept="image/*" style="display:none" onchange="divUpload('logo',this)"></div>
      <div><label class="f">Flag</label>${divForm.flag ? `<div class="up-prev wide">${bimg(divForm.flag, 'alt=""')}<button class="btn ghost sm" onclick="divClear('flag')">✕</button></div>` : '<div class="stat-label">No image → a flag is drawn from your 3 colours.</div>'}<button type="button" class="btn ghost sm" onclick="document.getElementById('df_flagIn').click()">Upload flag</button><input type="file" id="df_flagIn" accept="image/*" style="display:none" onchange="divUpload('flag',this)"></div></div>
    <label class="f" style="margin-top:12px;">Colour theme <span class="dim">(applies to the whole system while this Division is ON)</span></label>
    <div class="palette-row">${PALETTES.map((p, i) => `<button type="button" class="pal" title="${p.n}" onclick="divPreset(${i})" style="background:linear-gradient(90deg,${p.c[0]} 33%,${p.c[1]} 33% 66%,${p.c[2]} 66%)"></button>`).join('')}</div>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0;"><label class="f" style="margin:0">Main <input type="color" id="df_c1" value="${val('p', c.p)}" oninput="divPreview()"></label><label class="f" style="margin:0">Second <input type="color" id="df_c2" value="${val('s', c.s)}" oninput="divPreview()"></label><label class="f" style="margin:0">Accent <input type="color" id="df_c3" value="${val('a', c.a)}" oninput="divPreview()"></label><button type="button" class="btn ghost sm" onclick="divHarmonise()">✨ Auto-match from Main</button></div>
    <div class="stat-label">LIVE PREVIEW — the same colours in dark and in light (readability is balanced automatically)</div><div id="divPreview" class="div-preview"></div>
    <div class="grid c2"><div class="field"><label class="f">System theme (brightness)</label><select id="df_sys">${['auto', 'dark', 'light'].map(o => `<option value="${o}" ${((k.sys || (d && d.systemTheme) || 'auto') === o) ? 'selected' : ''}>${o === 'auto' ? 'Auto — keep my 🌙/☀️ choice' : o === 'dark' ? 'Dark' : 'Light'}</option>`).join('')}</select></div>
    <div class="field"><label class="f">Duration (days) <span class="dim">— filled automatically when Start and End are set</span></label><input type="number" id="df_dur" min="0" value="${val('dur', d ? d.durationDays || '' : '')}"></div></div>
    <div class="grid c2"><div class="field"><label class="f">Start</label><input type="date" id="df_start" value="${val('start', d ? d.start || '' : '')}"></div><div class="field"><label class="f">End</label><input type="date" id="df_end" value="${val('end', d ? d.end || '' : '')}"></div></div>
    <div class="field"><label class="f">Mission</label><textarea id="df_mission" rows="3">${val('mission', d ? d.mission || '' : '')}</textarea></div>
    <div class="field"><label class="f">Objective</label><textarea id="df_obj" rows="3">${val('objective', d ? d.objective || '' : '')}</textarea></div>
    <div class="stat-label" style="margin-bottom:8px;">PDF books are added from the Division page after saving.</div>
    <div style="display:flex;gap:8px;"><button class="btn" onclick="saveDivisionForm()">${d ? 'Save changes' : 'Create Division'}</button><button class="btn ghost" onclick="closeDivisionForm()">Cancel</button></div></div>`;
}
function secDivisions(){
  const list = divisions();
  if(openDivId){ const d = list.find(x => x.id === openDivId); if(d && !divForm.open) return divDetailHTML(d); if(!d) openDivId = null; }
  const act = activeDivision();
  return `<div class="pagehead"><h2>DIVISIONS</h2><div class="sub">THE ACTIVE DIVISION DECIDES THE THEME OF THE WHOLE SYSTEM</div></div>
  ${divForm.open ? divFormHTML() : `<div class="panel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><button class="btn" onclick="openDivisionForm()">＋ New Division</button>
    <span class="stat-label" style="margin:0;">${act ? 'ON NOW: ' + esc(act.division || '') + ' · ' + esc(act.name) : 'No Division is ON — the default OLC theme is used.'}</span></div>`}
  <div class="grid c2" style="margin-top:16px;">${list.length ? list.map(divCardHTML).join('') : '<div class="empty" style="grid-column:1/-1;">No Divisions yet — create one to give the whole system its own colours, flag and mission.</div>'}</div>`;
}
document.addEventListener('input', (e) => {
  if(!e.target || (e.target.id !== 'df_start' && e.target.id !== 'df_end')) return;
  const s = document.getElementById('df_start').value, en = document.getElementById('df_end').value;
  if(s && en) document.getElementById('df_dur').value = Math.max(1, daysBetween(s, en) + 1);
});
document.addEventListener('change', (e) => {
  if(!e.target || (e.target.id !== 'df_start' && e.target.id !== 'df_end')) return;
  const s = document.getElementById('df_start').value, en = document.getElementById('df_end').value;
  if(s && en) document.getElementById('df_dur').value = Math.max(1, daysBetween(s, en) + 1);
});

/* ============================================================
   OLC BOOK  (library of books; each book has pages you can read, add, delete, replace, move)
   ============================================================ */
let openBookId = null, fbIndex = 0, fbAnimating = false, bookBusy = false;
const books = () => (state && state.books) || [];
const findBook = (id) => books().find(b => b.id === id);
function v10Migrate(st){
  if(!isPlain(st.settings)) st.settings = {};
  if(!st.settings.rulebookMigrated){
    st.settings.rulebookMigrated = true;
    if(!st.books.some(b => b.id === 'book_rulebook')){
      const custom = Array.isArray(st.rulebookPages) && st.rulebookPages.length ? st.rulebookPages : null;
      const imgs = custom || DEFAULT_RULEBOOK_PAGES;
      st.books.unshift({ id: 'book_rulebook', title: 'OLC Rule Book', subtitle: 'The official operating manual of Agent SK & OLC — v1.0', cover: DEFAULT_RULEBOOK_PAGES[0], ratio: 1102 / 1758, builtin: 'rulebook', createdAt: 0,
        pages: imgs.map((img, i) => ({ id: 'rbp' + String(i + 1).padStart(3, '0') + (custom ? 'c' + hash32(String(img).slice(0, 300) + i).toString(36) : ''), type: 'image', img, title: '', text: '' })) });
    }
  }
}
/* move big pictures that older versions kept inside the data into the file store (makes saving/syncing much lighter) */
let upgrading = false;
async function upgradeInlineImages(){
  if(upgrading || !state || typeof Blobs === 'undefined') return; upgrading = true;
  try{
    let n = 0;
    for(const b of books()) for(const p of (b.pages || [])){
      if(typeof p.img === 'string' && p.img.startsWith('data:') && p.img.length > 20000){
        const blob = await (await fetch(p.img)).blob(); p.img = await Blobs.put(blob, blob.type); n++;
        if(b.cover && b.cover.startsWith('data:') && b.cover === p.img) b.cover = p.img;
      }
    }
    if(n){ saveState(); }
  }catch(e){} finally{ upgrading = false; }
}
function pageFaceHTML(b, p){
  if(!p) return '';
  if(p.type === 'text') return `<div class="fb-text"><h4>${esc(p.title || '')}</h4><div>${esc(p.text || '')}</div></div>`;
  return bimg(p.img, 'alt="page" draggable="false"');
}
function secBooks(){
  if(openBookId){ const b = findBook(openBookId); if(b) return bookReaderHTML(b); openBookId = null; }
  const list = books();
  return `<div class="pagehead"><h2>OLC BOOK</h2><div class="sub">YOUR LIBRARY — READ, ADD, EDIT AND ORGANISE BOOKS</div></div>
  <div class="panel" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;"><button class="btn" onclick="newBookDialog()">＋ Add Book</button><span class="stat-label" style="margin:0;">Add a book from a PDF, from pictures, or start a blank one and write the pages yourself.</span></div>
  <div class="book-shelf">${list.length ? list.map(b => `<div class="book-card" onclick="openBook('${b.id}')"><div class="book-cover" style="aspect-ratio:${(b.ratio || .63).toFixed ? Number(b.ratio || .63).toFixed(3) : .63}">${b.cover ? bimg(b.cover, 'alt=""') : '<div class="book-cover-ph">📕</div>'}</div><div class="book-t">${esc(b.title)}</div><div class="stat-label">${(b.pages || []).length} PAGE${(b.pages || []).length === 1 ? '' : 'S'}</div></div>`).join('') : '<div class="empty" style="grid-column:1/-1;">No books yet — tap “＋ Add Book”.</div>'}</div>`;
}
function openBook(id){ openBookId = id; fbIndex = 0; renderSection(); window.scrollTo({ top: 0 }); }
function bookReaderHTML(b){
  const pages = b.pages || [], notes = (state.ruleBookNotes || []).slice().sort((x, y) => x.date < y.date ? 1 : -1), r = Number(b.ratio) || .63;
  return `<div class="pagehead"><h2>${esc(b.title)}</h2><div class="sub"><a href="javascript:go('books')" style="color:var(--cyan)">‹ All books</a>${b.subtitle ? ' · ' + esc(b.subtitle) : ''}</div></div>
  <div class="panel flipbook-wrap">
    <div class="flipbook" id="flipbook" style="aspect-ratio:${r}"></div>
    <div class="fb-controls"><button class="fb-navbtn" id="fbPrev" onclick="fbTurn(-1)">‹</button><div class="fb-pagenum" id="fbPageNum">Page 1 / ${pages.length}</div><button class="fb-navbtn" id="fbNext" onclick="fbTurn(1)">›</button><button class="fb-navbtn" onclick="fbFull()" title="Full screen reading" aria-label="Full screen">⛶</button></div>
    <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;flex-wrap:wrap;"><label class="stat-label" style="margin:0;">Jump to page</label><input type="number" id="fbJump" min="1" max="${pages.length}" style="width:70px;text-align:center;" placeholder="#"><button class="btn ghost sm" onclick="fbJumpTo()">Go</button><button class="btn ghost sm" onclick="bookFullscreen()">⤢ Full screen</button></div>
    <div class="idcard-hint" style="margin-top:6px;">ARROWS · ← → KEYS · SWIPE · OR JUMP TO A PAGE</div>
  </div>
  <div class="panel" style="margin-top:16px;"><h3><span class="ic">🗂</span>MANAGE PAGES</h3>
    <div class="page-tools"><button class="btn sm" onclick="bookAddImages('${b.id}')">＋ Pictures</button><button class="btn sm" onclick="bookAddPdf('${b.id}')">＋ PDF pages</button><button class="btn sm" onclick="bookAddText('${b.id}')">＋ Text page</button>
      <span class="sep"></span><button class="btn ghost sm" onclick="bookEditPage('${b.id}')">✎ Edit this page</button><button class="btn ghost sm" onclick="bookReplaceImage('${b.id}')">⇄ Replace picture</button><button class="btn ghost sm" onclick="bookMovePage('${b.id}',-1)">◀ Move</button><button class="btn ghost sm" onclick="bookMovePage('${b.id}',1)">Move ▶</button><button class="btn ghost sm" onclick="bookSetCover('${b.id}')">★ Use as cover</button><button class="btn ghost sm" onclick="bookDeletePage('${b.id}')">🗑 Delete page</button></div>
    <div class="thumbs" id="fbThumbs">${pages.map((p, i) => `<button class="thumb ${i === fbIndex ? 'on' : ''}" onclick="fbGo(${i})"><span class="th-img">${p.type === 'text' ? '<span class="th-text">T</span>' : bimg(p.img, 'alt="" loading="lazy"')}</span><small>${i + 1}</small></button>`).join('') || '<div class="empty">No pages yet.</div>'}</div></div>
  <div class="panel" style="margin-top:16px;"><h3><span class="ic">⚙</span>BOOK SETTINGS</h3>
    <div class="page-tools"><button class="btn ghost sm" onclick="bookRename('${b.id}')">Rename</button><button class="btn ghost sm" onclick="bookChangeCover('${b.id}')">Upload cover</button><button class="btn ghost sm" onclick="bookRatio('${b.id}')">Page shape</button>${b.builtin ? `<button class="btn ghost sm" onclick="bookResetBuiltin('${b.id}')">Reset to original pages</button>` : ''}<button class="btn ghost sm" onclick="bookDelete('${b.id}')">Delete book</button></div></div>
  ${b.builtin === 'rulebook' ? `<div class="panel" style="margin-top:16px;"><h3><span class="ic">✎</span>PERSONAL AMENDMENTS</h3>
    <textarea id="rb_custom" rows="4" placeholder="Add a new amendment to the constitution, dated today..."></textarea><button class="btn sm" style="margin-top:8px;" onclick="addRuleBookNote()">Add Amendment</button>
    <div style="margin-top:14px;">${notes.length ? notes.map(n => `<div class="timeline-item"><div style="flex:1;"><div class="mono" style="color:var(--cyan);font-size:12px;">${n.date}</div><div>${esc(n.text)}</div></div><button class="btn ghost sm" onclick="deleteRuleBookNote('${n.id}')">🗑</button></div>`).join('') : '<div class="empty">No amendments yet</div>'}</div></div>` : ''}`;
}
function bookAfterRender(){ if(openBookId) fbRenderBase(); }
function curBook(){ return findBook(openBookId); }
function fbRenderBase(){
  const el = document.getElementById('flipbook'), b = curBook(); if(!el || !b) return;
  const pages = b.pages || [];
  if(fbIndex >= pages.length) fbIndex = Math.max(0, pages.length - 1);
  if(!pages.length){ el.innerHTML = '<div class="empty" style="padding:30px;">No pages — add some below</div>'; }
  else el.innerHTML = `<div class="fb-page">${pageFaceHTML(b, pages[fbIndex])}</div>`;
  const pn = document.getElementById('fbPageNum'); if(pn) pn.textContent = `Page ${pages.length ? fbIndex + 1 : 0} / ${pages.length}`;
  const pv = document.getElementById('fbPrev'), nx = document.getElementById('fbNext'); if(pv) pv.disabled = fbIndex <= 0; if(nx) nx.disabled = fbIndex >= pages.length - 1;
  document.querySelectorAll('#fbThumbs .thumb').forEach((t, i) => t.classList.toggle('on', i === fbIndex));
  Blobs.hydrate(el);
}
function fbGo(i){ fbIndex = i; fbRenderBase(); document.getElementById('flipbook')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
function fbJumpTo(){ const b = curBook(); const v = Number(document.getElementById('fbJump').value); if(!b || !v || v < 1 || v > b.pages.length) return; fbIndex = v - 1; fbRenderBase(); }
document.addEventListener('keydown', (e) => {
  if(currentSection !== 'books' || !openBookId) return;
  if(e.target && (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
  if(e.key === 'ArrowLeft') fbTurn(-1); else if(e.key === 'ArrowRight') fbTurn(1);
});
let swipeX = null;
document.addEventListener('touchstart', (e) => { swipeX = (e.target.closest && e.target.closest('#flipbook')) ? e.touches[0].clientX : null; }, { passive: true });
document.addEventListener('touchend', (e) => { if(swipeX === null) return; const dx = e.changedTouches[0].clientX - swipeX; swipeX = null; if(Math.abs(dx) > 50) fbTurn(dx < 0 ? 1 : -1); }, { passive: true });
function fbTurn(dir){
  if(fbAnimating) return;
  const b = curBook(); if(!b) return; const pages = b.pages, next = fbIndex + dir;
  if(next < 0 || next >= pages.length) return;
  fbAnimating = true;
  const el = document.getElementById('flipbook'), flip = document.createElement('div');
  flip.className = 'fb-flip';
  flip.innerHTML = `<div class="fb-face fb-front">${pageFaceHTML(b, pages[fbIndex])}</div><div class="fb-face fb-back">${pageFaceHTML(b, pages[next])}</div>`;
  el.appendChild(flip); Blobs.hydrate(flip); void flip.offsetWidth;
  flip.classList.add(dir > 0 ? 'turning-fwd' : 'turning-back');
  setTimeout(() => { fbIndex = next; fbAnimating = false; fbRenderBase(); }, 640);
}
function bookFullscreen(){
  const b = curBook(); if(!b || !b.pages.length) return; const p = b.pages[fbIndex];
  openV10Modal(`<div class="pdfv"><div class="pdfv-bar"><b>${esc(b.title)} — page ${fbIndex + 1}</b><span class="spacer"></span><button class="btn ghost sm" onclick="closeV10Modal()">✕</button></div><div class="pdfv-body">${p.type === 'text' ? pageFaceHTML(b, p) : bimg(p.img, 'alt="page" style="max-width:100%;height:auto;display:block;margin:0 auto;"')}</div></div>`, true);
}
async function setBookDims(b, ref){ const d = await Blobs.dims(ref); if(d && d.w && d.h && (!b.pages || b.pages.length <= 1 || !b.ratio)) b.ratio = +(d.w / d.h).toFixed(4); }
function newBookDialog(){
  openV10Modal(`<h3 style="justify-content:center;">＋ ADD BOOK</h3>
    <div class="field"><label class="f">Title</label><input type="text" id="nb_title" placeholder="e.g. Exam Strategy Handbook"></div>
    <div class="field"><label class="f">Subtitle <span class="dim">(optional)</span></label><input type="text" id="nb_sub"></div>
    <label class="f">How do you want to start?</label>
    <div class="choice-row"><button class="btn" onclick="createBook('pdf')">📄 From a PDF</button><button class="btn" onclick="createBook('img')">🖼 From pictures</button><button class="btn ghost" onclick="createBook('blank')">📝 Blank book</button></div>
    <button class="btn ghost" style="margin-top:10px;width:100%;" onclick="closeV10Modal()">Cancel</button>`);
}
async function createBook(kind){
  const title = ($q('#nb_title').value || '').trim(); if(!title){ $q('#nb_title').focus(); return; }
  const subtitle = ($q('#nb_sub').value || '').trim(); closeV10Modal();
  const b = { id: uid('book'), title, subtitle, cover: null, ratio: .707, createdAt: Date.now(), pages: [] };
  state.books.push(b);
  if(kind === 'blank') b.pages.push({ id: uid('pg'), type: 'text', img: null, title: 'Page 1', text: '' });
  openBookId = b.id; fbIndex = 0; saveState(); renderSection();
  if(kind === 'pdf') await bookAddPdf(b.id); else if(kind === 'img') await bookAddImages(b.id);
}
async function bookAddImages(id){
  const b = findBook(id); if(!b) return; const files = await pickFiles('image/*', true); if(!files.length) return;
  toast('Adding pictures…', 3000);
  for(const f of files){ const ref = await storeImage(f, { maxW: 1000, quality: .78 }); const first = !b.pages.length; b.pages.push({ id: uid('pg'), type: 'image', img: ref, title: '', text: '' }); if(first){ await setBookDims(b, ref); if(!b.cover) b.cover = ref; } }
  fbIndex = Math.max(0, b.pages.length - files.length); saveState(); renderSection(); syncNow();
}
async function bookAddPdf(id){
  const b = findBook(id); if(!b) return; const files = await pickFiles('application/pdf,.pdf', false); if(!files.length) return;
  try{
    toast('Reading the PDF…', 4000);
    const blobs = await pdfToImageBlobs(files[0], (i, n) => toast('Importing page ' + i + ' / ' + n + '…', 1800));
    const first = !b.pages.length;
    for(const bl of blobs){ const ref = await Blobs.put(bl, 'image/jpeg'); b.pages.push({ id: uid('pg'), type: 'image', img: ref, title: '', text: '' }); }
    if(first && b.pages.length){ await setBookDims(b, b.pages[0].img); if(!b.cover) b.cover = b.pages[0].img; }
    fbIndex = Math.max(0, b.pages.length - blobs.length); saveState(); renderSection(); toast('✓ ' + blobs.length + ' pages added'); syncNow();
  }catch(e){ alert('Could not read that PDF. Try another file.'); }
}
function bookAddText(id){
  const b = findBook(id); if(!b) return;
  b.pages.splice(Math.min(b.pages.length, fbIndex + 1), 0, { id: uid('pg'), type: 'text', img: null, title: 'New page', text: '' });
  fbIndex = Math.min(b.pages.length - 1, fbIndex + 1); saveState(); renderSection(); setTimeout(() => bookEditPage(id), 80);
}
function bookEditPage(id){
  const b = findBook(id), p = b && b.pages[fbIndex]; if(!p) return;
  openV10Modal(`<h3 style="justify-content:center;">✎ PAGE ${fbIndex + 1}</h3><div class="field"><label class="f">Title / label</label><input type="text" id="pe_title" value="${esc(p.title || '')}"></div>
    ${p.type === 'text' ? `<div class="field"><label class="f">Text</label><textarea id="pe_text" rows="10">${esc(p.text || '')}</textarea></div>` : `<div class="stat-label">This is a picture page. Use “Replace picture” to change the picture.</div>`}
    <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn" onclick="savePageEdit('${id}')">Save</button><button class="btn ghost" onclick="closeV10Modal()">Cancel</button></div>`);
}
function savePageEdit(id){ const b = findBook(id), p = b && b.pages[fbIndex]; if(!p) return; p.title = $q('#pe_title').value; if(p.type === 'text') p.text = $q('#pe_text').value; closeV10Modal(); saveState(); renderSection(); }
async function bookReplaceImage(id){
  const b = findBook(id), p = b && b.pages[fbIndex]; if(!p) return; const files = await pickFiles('image/*', false); if(!files.length) return;
  p.img = await storeImage(files[0], { maxW: 1000, quality: .78 }); p.type = 'image'; saveState(); renderSection(); syncNow();
}
function bookMovePage(id, d){ const b = findBook(id); if(!b) return; const j = fbIndex + d; if(j < 0 || j >= b.pages.length) return; const [p] = b.pages.splice(fbIndex, 1); b.pages.splice(j, 0, p); fbIndex = j; saveState(); renderSection(); }
function bookDeletePage(id){ const b = findBook(id); if(!b || !b.pages.length) return; if(!confirm('Delete page ' + (fbIndex + 1) + ' from this book?')) return; b.pages.splice(fbIndex, 1); if(fbIndex >= b.pages.length) fbIndex = Math.max(0, b.pages.length - 1); saveState(); renderSection(); }
function bookSetCover(id){ const b = findBook(id), p = b && b.pages[fbIndex]; if(!p || p.type !== 'image') return toast('Pick a picture page first.'); b.cover = p.img; saveState(); toast('Cover updated'); }
async function bookChangeCover(id){ const b = findBook(id); if(!b) return; const f = await pickFiles('image/*', false); if(!f.length) return; b.cover = await storeImage(f[0], { maxW: 600 }); saveState(); renderSection(); }
function bookRename(id){ const b = findBook(id); if(!b) return; const t = prompt('Book title', b.title); if(t === null) return; b.title = t.trim() || b.title; const s = prompt('Subtitle (optional)', b.subtitle || ''); if(s !== null) b.subtitle = s.trim(); saveState(); renderSection(); }
function bookRatio(id){ const b = findBook(id); if(!b) return; const v = prompt('Page shape — type: portrait, landscape, square, or a width/height number like 0.7', b.ratio); if(v === null) return; const m = { portrait: .707, landscape: 1.414, square: 1 }[String(v).trim().toLowerCase()] || Number(v); if(m > .2 && m < 5){ b.ratio = m; saveState(); renderSection(); } }
function bookDelete(id){ const b = findBook(id); if(!b || !confirm('Delete the book “' + b.title + '” and all its pages?')) return; state.books = state.books.filter(x => x.id !== id); openBookId = null; saveState(); renderSection(); }
function bookResetBuiltin(id){
  const b = findBook(id); if(!b || !confirm('Reset this book to the original OLC pages? Pages you added or deleted will be lost.')) return;
  b.pages = DEFAULT_RULEBOOK_PAGES.map((img, i) => ({ id: 'rbp' + String(i + 1).padStart(3, '0'), type: 'image', img, title: '', text: '' })); b.cover = DEFAULT_RULEBOOK_PAGES[0]; b.ratio = 1102 / 1758; fbIndex = 0; saveState(); renderSection();
}

/* ============================================================
   SIDEBAR — hide/show the whole menu, collapse groups, arrange (move / hide) sections. Saved per device.
   ============================================================ */
const SIDE_KEY = () => 'olc2_side_' + (activeAccountId || 'x');
let sideEdit = false;
function sideCfg(){ return Object.assign({ order: [], gorder: [], hidden: [], collapsed: [], home: {}, off: false }, LS.get(SIDE_KEY(), {}) || {}); }
function sideSave(c){ LS.set(SIDE_KEY(), c); }
function applySidebarLayout(){
  const sb = document.getElementById('sidebar'); if(!sb) return;
  const c = sideCfg();
  const groups = [...sb.querySelectorAll('.navgroup')];
  const gmap = Object.fromEntries(groups.map(g => [g.dataset.g, g]));
  const tools = sb.querySelector('.side-tools');
  const gord = c.gorder.filter(x => gmap[x]).concat(groups.map(g => g.dataset.g).filter(x => !c.gorder.includes(x)));
  gord.forEach(k => sb.appendChild(gmap[k]));
  const allBtns = {}; sb.querySelectorAll('.navbtn').forEach(b => { if(b.dataset.home0 === undefined) b.dataset.home0 = b.closest('.navgroup').dataset.g; allBtns[b.dataset.sec] = b; });
  Object.keys(allBtns).forEach(k => { const hg = (c.home && c.home[k]) || allBtns[k].dataset.home0; if(gmap[hg] && allBtns[k].closest('.navgroup') !== gmap[hg]) gmap[hg].querySelector('.navgroup-body').appendChild(allBtns[k]); });
  groups.forEach(g => {
    const body = g.querySelector('.navgroup-body'), btns = {}; body.querySelectorAll('.navbtn').forEach(b => btns[b.dataset.sec] = b);
    const ord = c.order.filter(x => btns[x]).concat(Object.keys(btns).filter(x => !c.order.includes(x)));
    ord.forEach(k => body.appendChild(btns[k]));
    body.querySelectorAll('.navbtn').forEach(b => { b.classList.toggle('is-hidden', c.hidden.includes(b.dataset.sec)); });
    g.classList.toggle('collapsed', c.collapsed.includes(g.dataset.g));
    g.classList.toggle('empty-g', !sideEdit && !body.querySelector('.navbtn:not(.is-hidden)'));
  });
  document.documentElement.classList.toggle('side-off', !!c.off);
  document.documentElement.classList.toggle('side-edit', sideEdit);
  if(sideEdit) sideEditControls();
}
function sideEditControls(){
  const sb = document.getElementById('sidebar');
  sb.querySelectorAll('.nav-ctl').forEach(x => x.remove());
  const c = sideCfg();
  sb.querySelectorAll('.navbtn').forEach(b => {
    const k = b.dataset.sec, ctl = document.createElement('span'); ctl.className = 'nav-ctl';
    ctl.innerHTML = `<i class="nav-drag" data-k="${k}" title="Drag to move (any place, any group)">⠿</i><i onclick="event.stopPropagation();sideMove('${k}',-1)" title="Move up">▲</i><i onclick="event.stopPropagation();sideMove('${k}',1)" title="Move down">▼</i><i onclick="event.stopPropagation();sideHide('${k}')" title="Show / hide">${c.hidden.includes(k) ? '🙈' : '👁'}</i>`;
    b.appendChild(ctl);
  });
  sb.querySelectorAll('.navgroup').forEach(g => {
    const l = g.querySelector('.navgroup-label'); l.querySelectorAll('.nav-ctl').forEach(x => x.remove());
    const ctl = document.createElement('span'); ctl.className = 'nav-ctl'; const k = g.dataset.g;
    ctl.innerHTML = `<i onclick="event.stopPropagation();sideMoveGroup('${k}',-1)">▲</i><i onclick="event.stopPropagation();sideMoveGroup('${k}',1)">▼</i>`; l.appendChild(ctl);
  });
}
function toggleSidebarEdit(){ sideEdit = !sideEdit; document.getElementById('sideEditBtn').textContent = sideEdit ? '✓ Done' : '✎ Arrange'; if(!sideEdit) document.querySelectorAll('#sidebar .nav-ctl').forEach(x => x.remove()); applySidebarLayout(); }
function toggleNavGroup(g){ if(sideEdit) return; const c = sideCfg(); c.collapsed = c.collapsed.includes(g) ? c.collapsed.filter(x => x !== g) : c.collapsed.concat(g); sideSave(c); applySidebarLayout(); }
function sideHide(k){ const c = sideCfg(); c.hidden = c.hidden.includes(k) ? c.hidden.filter(x => x !== k) : c.hidden.concat(k); sideSave(c); applySidebarLayout(); }
function sideMove(k, d){
  const c = sideCfg(), btn = document.querySelector(`#sidebar .navbtn[data-sec="${k}"]`), body = btn.parentElement;
  const cur = [...body.querySelectorAll('.navbtn')].map(b => b.dataset.sec), i = cur.indexOf(k), j = i + d; if(j < 0 || j >= cur.length) return;
  cur.splice(i, 1); cur.splice(j, 0, k);
  const all = [...document.querySelectorAll('#sidebar .navbtn')].map(b => b.dataset.sec).filter(x => !cur.includes(x));
  c.order = cur.concat(all); sideSave(c); applySidebarLayout();
}
function sideMoveGroup(g, d){
  const c = sideCfg(), cur = [...document.querySelectorAll('#sidebar .navgroup')].map(x => x.dataset.g), i = cur.indexOf(g), j = i + d; if(j < 0 || j >= cur.length) return;
  cur.splice(i, 1); cur.splice(j, 0, g); c.gorder = cur; sideSave(c); applySidebarLayout();
}
function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  if(window.matchMedia('(max-width: 860px)').matches){ sb.classList.toggle('open'); document.getElementById('sideScrim').classList.toggle('on', sb.classList.contains('open')); }
  else { const c = sideCfg(); c.off = !c.off; sideSave(c); applySidebarLayout(); }
}
document.addEventListener('click', (e) => { if(e.target.closest && e.target.closest('#sidebar .navbtn') && !sideEdit) document.getElementById('sideScrim')?.classList.remove('on'); });

/* the Journal is a large module: load it only when it is first opened */
let journalLoading = null;
function loadJournalModule(){
  if(typeof journalReady !== 'undefined') return Promise.resolve();
  if(journalLoading) return journalLoading;
  journalLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'journal.js'; s.onload = () => res(); s.onerror = () => { journalLoading = null; rej(); }; document.head.appendChild(s); });
  return journalLoading;
}
function secJournal(){
  if(typeof journalReady === 'undefined'){
    loadJournalModule().then(() => { if(currentSection === 'journal') renderSection(); }).catch(() => { const m = document.getElementById('mainContent'); if(m && currentSection === 'journal') m.innerHTML = '<div class="panel"><h3>Journal could not load</h3><p class="stat-label">Check your connection and open the Journal again.</p></div>'; });
    return '<div class="pagehead"><h2>OLC JOURNAL</h2></div><div class="panel"><div class="skeleton"></div><div class="skeleton" style="width:60%"></div></div>';
  }
  return journalSection();
}

/* drag a section anywhere (mouse or finger): inside its group or into another group */
(function(){
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest && e.target.closest('.nav-drag'); if(!h || !sideEdit) return;
    const btn = h.closest('.navbtn'); drag = { btn, id: e.pointerId }; btn.classList.add('dragging'); document.documentElement.classList.add('side-dragging');
    try{ h.setPointerCapture(e.pointerId); }catch(_){} e.preventDefault(); e.stopPropagation();
  }, true);
  document.addEventListener('pointermove', (e) => {
    if(!drag) return; e.preventDefault();
    const sb = document.getElementById('sidebar'), r = sb.getBoundingClientRect();
    if(e.clientY < r.top + 36) sb.scrollTop -= 14; else if(e.clientY > r.bottom - 36) sb.scrollTop += 14;     // auto-scroll while dragging
    const el = document.elementFromPoint(e.clientX, e.clientY); if(!el) return;
    const over = el.closest && el.closest('#sidebar .navbtn'), grp = el.closest && el.closest('#sidebar .navgroup');
    if(over && over !== drag.btn){ const b = over.getBoundingClientRect(); over.parentElement.insertBefore(drag.btn, e.clientY < b.top + b.height / 2 ? over : over.nextSibling); }
    else if(!over && grp){ const body = grp.querySelector('.navgroup-body'); if(grp.classList.contains('collapsed')) grp.classList.remove('collapsed'); if(!body.contains(drag.btn) || !body.querySelector('.navbtn:not(.dragging)')) body.appendChild(drag.btn); }
  }, { passive: false });
  const end = () => {
    if(!drag) return; const c = sideCfg(); drag.btn.classList.remove('dragging'); document.documentElement.classList.remove('side-dragging'); drag = null;
    const order = [], home = {}; document.querySelectorAll('#sidebar .navgroup').forEach(g => g.querySelectorAll('.navbtn').forEach(b => { order.push(b.dataset.sec); home[b.dataset.sec] = g.dataset.g; }));
    c.order = order; c.home = home; sideSave(c); applySidebarLayout();
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();

function fbFull(){ const w = document.querySelector('.flipbook-wrap'); if(!w) return; const on = w.classList.toggle('fb-full'); document.documentElement.classList.toggle('fb-lock', on); }
document.addEventListener('keydown', (e) => { if(e.key === 'Escape'){ const w = document.querySelector('.flipbook-wrap.fb-full'); if(w) fbFull(); } if(document.querySelector('.flipbook')){ if(e.key === 'ArrowRight' && !isTyping()) fbTurn(1); if(e.key === 'ArrowLeft' && !isTyping()) fbTurn(-1); } });
