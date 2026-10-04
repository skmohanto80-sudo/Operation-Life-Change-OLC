/* ============================================================
   OLC — ACCOUNTS • APP LOCK • SAFE SYNC  (v9)
   Replaces the old "opening login". The app now always opens
   instantly from this device's saved data; the cloud is only
   used in the background.
   ============================================================ */
const APP_VERSION = '9.0';
const API_BASE_URL = 'https://operation-life-change-olc-3.onrender.com/'.replace(/\/+$/, '');
const SUFFIX = '@olc.com';

/* ---------- tiny helpers ---------- */
const LS = {
  get(k, d = null){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
};
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const isPlain = (o) => o && typeof o === 'object' && !Array.isArray(o);
let toastTimer = null;
function toast(msg, ms){
  const t = $('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), ms || 3200);
}
function deviceName(){
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  return os + ' · ' + (standalone ? 'Installed app' : br);
}

/* ---------- account registry (this device) ----------
   olc2_accounts: [{id, username, avatar, token, addedAt, expired?}]
   Old data keys (olc_accounts / olc_state_*) are NEVER deleted by this app. */
const ACC_KEY = 'olc2_accounts', ACTIVE_KEY = 'olc2_active';
let activeAccountId = null;
let meta = { updatedAt: 0, serverUpdatedAt: 0, dirty: false };
function getAccounts(){ const a = LS.get(ACC_KEY, []); return Array.isArray(a) ? a : []; }
function saveAccounts(list){ if(!LS.set(ACC_KEY, list)) toast('⚠ Device storage is full — export a backup and free some space.', 6000); }
function loggedAccount(){ return getAccounts().find(a => a.id === activeAccountId) || null; }
function patchAccount(id, patch){ const l = getAccounts(); const a = l.find(x => x.id === id); if(a){ Object.assign(a, patch); saveAccounts(l); } return a; }
const stateKey = (id) => 'olc2_state_' + id;
const metaKey = (id) => 'olc2_meta_' + id;
const bkKey = (id) => 'olc2_bk_' + id;

/* ---------- state hydration: fill anything missing so a section can never crash on old data ---------- */
function deepFill(target, defaults){
  for(const k of Object.keys(defaults)){
    const dv = defaults[k];
    if(target[k] === undefined) target[k] = clone(dv);
    else if(isPlain(dv) && isPlain(target[k])) deepFill(target[k], dv);
  }
  return target;
}
function hydrateState(obj){
  const st = isPlain(obj) ? obj : {};
  deepFill(st, DEFAULT_STATE);
  if(!st.streaks.screen) st.streaks.screen = { count:0, lastDate:null, _pc:0, _pd:null };
  if(!Array.isArray(st.customMedals)) st.customMedals = [];
  if(!Array.isArray(st.customBadges)) st.customBadges = [];
  if(!Array.isArray(st.achievements)) st.achievements = [];
  if(!Array.isArray(st.ruleBookNotes)){
    st.ruleBookNotes = [];
    if(st.ruleBookCustom && String(st.ruleBookCustom).trim())
      st.ruleBookNotes.push({ id: uid('note'), date: st.profile.startDate || todayStr(), text: String(st.ruleBookCustom).trim() });
  }
  // repair every saved day (older versions saved days with missing parts, which crashed pages and hid records)
  if(!isPlain(st.dailyLogs)) st.dailyLogs = {};
  for(const k of Object.keys(st.dailyLogs)){
    let d = st.dailyLogs[k]; if(!isPlain(d)) d = st.dailyLogs[k] = {};
    if(!isPlain(d.items)) d.items = {};
    if(!isPlain(d.ratings)) d.ratings = { study:0, exercise:0, spiritual:0, mood:0 };
    if(!isPlain(d.planner)) d.planner = { morning:'', afternoon:'', night:'' };
    if(!isPlain(d.eod)) d.eod = { well:'', failed:'', learned:'', tomorrow:'' };
    if(!isPlain(d.screen)) d.screen = { totalMin:0, devices:[], awarded:false, xpApplied:0 };
    if(!Array.isArray(d.screen.devices)) d.screen.devices = [];
    if(typeof d.waterL !== 'number') d.waterL = Number(d.waterL) || 0;
  }
  if(!isPlain(st.trackerLogs)) st.trackerLogs = {};
  ['weight','height','exercise','study','sleep'].forEach(k => { if(!Array.isArray(st.trackerLogs[k])) st.trackerLogs[k] = []; });
  if(!Array.isArray(st.goals)) st.goals = clone(DEFAULT_STATE.goals);
  return st;
}
function dayHasData(d){
  if(!d || typeof d !== 'object') return false;
  if(d.items && Object.keys(d.items).length) return true;
  if(d.ratings && Object.values(d.ratings).some(v => v)) return true;
  if(d.wokeOnTime || d.readingDone || d.waterL > 0) return true;
  if(d.screen && (d.screen.totalMin > 0 || (d.screen.devices && d.screen.devices.length))) return true;
  if(d.planner && Object.values(d.planner).some(v => v)) return true;
  if(d.eod && Object.values(d.eod).some(v => v)) return true;
  return false;
}
function stateWeight(s){
  if(!s || typeof s !== 'object') return 0;
  let w = 0;
  if(typeof s.xp === 'number' && s.xp !== 0) w++;
  if(s.dailyLogs) for(const k of Object.keys(s.dailyLogs)) if(dayHasData(s.dailyLogs[k])) w++;
  if(s.trackerLogs) for(const k of Object.keys(s.trackerLogs)) w += (s.trackerLogs[k] || []).length;
  ['customMedals','customBadges','achievements'].forEach(k => { if(Array.isArray(s[k])) w += s[k].length; });
  if(s.profile && (s.profile.name || s.profile.photo)) w++;
  return w;
}
function stateSummary(s){
  const days = s && s.dailyLogs ? Object.values(s.dailyLogs).filter(dayHasData).length : 0;
  return (s && s.profile && (s.profile.codename || s.profile.name) || 'Agent') + ' · ' + ((s && s.xp) || 0) + ' XP · ' + days + ' day(s) logged';
}

/* ---------- local backups (never lose data when something is replaced) ---------- */
function stashBackup(label, st){
  try{
    const id = activeAccountId; if(!id || !st) return;
    const json = JSON.stringify(st);
    if(json.length > 1500000) return; // don't risk the storage quota
    const list = LS.get(bkKey(id), []) || [];
    list.unshift({ label, at: Date.now(), data: st });
    LS.set(bkKey(id), list.slice(0, 3));
  }catch(e){}
}

/* ---------- local persistence + save pipeline ---------- */
let localTimer = null, pushTimer = null;
function persistLocal(){
  if(!activeAccountId || !state) return;
  const ok = LS.set(stateKey(activeAccountId), state);
  LS.set(metaKey(activeAccountId), meta);
  if(!ok) toast('⚠ Could not save on this device (storage full). Export a backup now.', 7000);
}
function saveState(){
  if(!activeAccountId || !state) return;
  meta.updatedAt = Date.now(); meta.dirty = true;
  clearTimeout(localTimer); localTimer = setTimeout(persistLocal, 250);
  schedulePush(3000);
  setSync(navigator.onLine === false ? 'offline' : 'pending');
}
function loadLocalFor(id){
  const raw = LS.get(stateKey(id), null);
  const m = LS.get(metaKey(id), null);
  meta = Object.assign({ updatedAt: 0, serverUpdatedAt: 0, dirty: false }, m || {});
  return raw ? hydrateState(raw) : null;
}

/* ============================================================
   API + SYNC ENGINE
   ============================================================ */
let syncInfo = { status: 'idle', at: null, msg: '' };
function setSync(status, msg){
  syncInfo = { status, at: status === 'ok' ? Date.now() : syncInfo.at, msg: msg || '' };
  const pill = $('syncPill'), txt = $('syncPillTxt');
  if(pill){
    pill.className = 'hud-pill sync-' + status;
    const label = { ok:'Synced', syncing:'Syncing…', pending:'Saving…', offline:'Offline', error:'Sync issue', auth:'Sign in again', idle:'—' }[status] || status;
    txt.textContent = label;
    pill.title = msg || ('Cloud sync: ' + label);
  }
  updateSyncDetail();
}
function updateSyncDetail(){
  const el = $('syncDetail'); if(!el) return;
  const m = { ok:'✓ All changes saved to the cloud' + (syncInfo.at ? ' (' + new Date(syncInfo.at).toLocaleTimeString() + ')' : ''),
    syncing:'Syncing…', pending:'Saved on this device — uploading shortly…', offline:'Offline — saved on this device, will upload when you are back online.',
    error:'Could not reach the server — your data is safe on this device and will retry automatically.', auth:'Session expired — sign in again (your data on this device is safe).', idle:'Not synced yet.' };
  el.textContent = (m[syncInfo.status] || '') + (syncInfo.msg ? ' — ' + syncInfo.msg : '');
}
async function api(method, path, body, token, opts){
  opts = opts || {};
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 20000);
  try{
    const res = await fetch(API_BASE_URL + path, {
      method, signal: ctrl.signal,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await res.text().catch(() => '');
    let data = {}; try{ data = JSON.parse(raw); }catch(e){ data = {}; }
    if(!isPlain(data)) data = {};
    return { ok: res.ok, status: res.status, data, raw: raw.slice(0, 200) };
  } finally { clearTimeout(t); }
}
/* sign-in style calls: tolerate a sleeping free-tier server, tell the user what's happening */
async function authCall(path, body, setMsg){
  const slow = setTimeout(() => setMsg && setMsg('Waking up the server… free hosting sleeps when idle, this can take up to a minute.'), 5000);
  try{
    for(let attempt = 0; attempt < 2; attempt++){
      try{
        const r = await api('POST', path, body, null, { timeout: 70000 });
        if([502, 503, 504].includes(r.status) && attempt === 0){ await new Promise(r => setTimeout(r, 2500)); continue; }
        return r;
      }catch(e){ if(attempt === 1) throw e; await new Promise(r => setTimeout(r, 2500)); }
    }
  } finally { clearTimeout(slow); }
}
function wakeServer(){ try{ fetch(API_BASE_URL + '/api/health', { cache: 'no-store' }).catch(()=>{}); }catch(e){} }

let pushing = false, pushAgain = false, backoff = 0;
function schedulePush(ms){ clearTimeout(pushTimer); pushTimer = setTimeout(() => pushState(), ms); }
async function pushState(force){
  const acc = loggedAccount();
  if(!acc || !acc.token || !state) return;
  if(acc.expired){ setSync('auth'); return; }
  if(meta.fresh && !force){ pullState({ manual: true }); return; }   // blank placeholder: learn what the cloud has first
  if(!meta.dirty && !force) return;
  if(pushing){ pushAgain = true; return; }
  if(navigator.onLine === false){ setSync('offline'); return; }
  pushing = true; setSync('syncing');
  const id = acc.id, stamp = meta.updatedAt;
  try{
    persistLocal();
    const r = await api('PUT', '/api/state', { state, baseUpdatedAt: meta.serverUpdatedAt || 0, force: !!force }, acc.token, { timeout: 45000 });
    if(activeAccountId !== id){            // user switched accounts while this was uploading — record the result for that account
      if(r.ok){ const m = LS.get(metaKey(id), null); if(m){ m.serverUpdatedAt = r.data.updatedAt; if(m.updatedAt === stamp) m.dirty = false; LS.set(metaKey(id), m); } }
      return;
    }
    if(r.ok){
      meta.serverUpdatedAt = r.data.updatedAt;
      if(meta.updatedAt === stamp) meta.dirty = false;
      LS.set(metaKey(id), meta); backoff = 0;
      setSync(meta.dirty ? 'pending' : 'ok');
      if(meta.dirty) schedulePush(1500);
    } else if(r.status === 409){ await handleConflict(r.data); }
    else if(r.status === 401){ patchAccount(id, { expired: true }); setSync('auth'); }
    else if(r.status === 413){ setSync('error', 'data too large'); toast('⚠ Your data is too large to sync — remove some big uploaded images.', 7000); }
    else { setSync('error', r.data && r.data.error); retryLater(); }
  }catch(e){ setSync(navigator.onLine === false ? 'offline' : 'error'); retryLater(); }
  finally{ pushing = false; if(pushAgain){ pushAgain = false; schedulePush(1000); } }
}
function retryLater(){ backoff = Math.min(backoff ? backoff * 2 : 5000, 120000); schedulePush(backoff); }

/* Both this device and the cloud changed. NOTHING is thrown away: the losing copy is saved as a backup. */
async function handleConflict(d){
  const serverState = d && d.state ? hydrateState(d.state) : null;
  if(!serverState){ meta.serverUpdatedAt = (d && d.updatedAt) || 0; return pushState(true); }
  const localNewer = !meta.fresh && meta.dirty && stateWeight(state) > 0 && meta.updatedAt > (d.updatedAt || 0) && d.code !== 'blank';
  if(localNewer){
    // keep this device's work; remember the cloud copy; overwrite (server backs up first too)
    stashBackup('Cloud copy replaced by this device', serverState);
    meta.serverUpdatedAt = d.updatedAt;
    return pushState(true);
  }
  stashBackup('This device before loading newer cloud data', state);
  adoptRemote(serverState, d.updatedAt);
  toast('Loaded newer data from your other device. (Your previous copy is saved in Backups.)', 5000);
}
function adoptRemote(remoteState, updatedAt){
  state = hydrateState(remoteState);
  meta = { updatedAt: Date.now(), serverUpdatedAt: updatedAt || 0, dirty: false, fresh: false };
  persistLocal(); setSync('ok');
  if(document.body.classList.contains('app-on')){ applyStateToUI(); renderAll(); }
}
const isTyping = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
let lastPull = 0;
async function pullState(opts){
  opts = opts || {};
  const acc = loggedAccount();
  if(!acc || !acc.token || acc.expired) return;
  if(!opts.manual && (isTyping() || Date.now() - lastPull < 8000)) return;
  if(navigator.onLine === false){ setSync('offline'); return; }
  lastPull = Date.now();
  const id = acc.id;
  try{
    if(!pushing) setSync('syncing');
    const r = await api('GET', '/api/state?since=' + (meta.serverUpdatedAt || 0), null, acc.token, { timeout: 30000 });
    if(activeAccountId !== id) return;
    if(r.status === 401){ patchAccount(id, { expired: true }); setSync('auth'); return; }
    if(!r.ok){ setSync('error', r.data && r.data.error); return; }
    if(r.data.unchanged){ setSync(meta.dirty ? 'pending' : 'ok'); if(meta.dirty) schedulePush(500); return; }
    if(!r.data.state){            // cloud empty: upload what we have
      const wasFresh = meta.fresh; meta.fresh = false;
      if(stateWeight(state) > 0 || (meta.dirty && !wasFresh)){ meta.dirty = true; meta.serverUpdatedAt = 0; return pushState(); }
      persistLocal(); return setSync('ok');
    }
    if(meta.fresh){ stashBackup('Blank placeholder', state); adoptRemote(r.data.state, r.data.updatedAt); return; }
    if(meta.dirty) await handleConflict({ state: r.data.state, updatedAt: r.data.updatedAt, code: 'conflict' });
    else adoptRemote(r.data.state, r.data.updatedAt);
  }catch(e){ setSync(navigator.onLine === false ? 'offline' : 'error'); }
}
async function manualSyncNow(){
  toast('Syncing…', 1500);
  await pullState({ manual: true });
  await pushState();
  toast(syncInfo.status === 'ok' ? '✓ Synced' : 'Could not sync right now — your data is safe on this device.', 3000);
}
function syncPillClick(){
  const acc = loggedAccount();
  if(syncInfo.status === 'auth' && acc) return reauth(acc);
  manualSyncNow();
}
function startSyncLoops(){
  if(window.__syncLoops) return; window.__syncLoops = true;
  setInterval(() => { if(!document.hidden && state && !locked){ pullState(); pushState(); } }, 90000);
  window.addEventListener('online', () => { pullState({ manual: true }); pushState(); });
  window.addEventListener('offline', () => setSync('offline'));
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){ hiddenAt = Date.now(); persistLocal(); pushState(); }
    else { checkAutoLock(); if(!locked) pullState(); }
    document.documentElement.classList.toggle('anim-paused', document.hidden);
  });
  window.addEventListener('pagehide', () => { persistLocal(); pushState(); });
}

/* ============================================================
   VALIDATION (same rules as the server)
   ============================================================ */
function normalizeUsername(raw){
  let u = String(raw || '').trim(); if(!u) return '';
  if(!u.includes('@')) u += SUFFIX;
  const at = u.lastIndexOf('@');
  return u.slice(0, at) + u.slice(at).toLowerCase();
}
function usernameChecks(u){
  const local = String(u || '').replace(/@.*$/, '');
  return [
    { ok: local.length === 8, text: 'Exactly 8 characters before ' + SUFFIX },
    { ok: /[A-Z]/.test(local), text: '1 capital letter' },
    { ok: /[a-z]/.test(local), text: '1 small letter' },
    { ok: /[0-9]/.test(local), text: '1 number' },
    { ok: local.length > 0 && /^[A-Za-z0-9]+$/.test(local), text: 'Only letters and numbers' },
  ];
}
function usernameError(u){
  if(!u.toLowerCase().endsWith(SUFFIX)) return 'Username must end with ' + SUFFIX;
  const bad = usernameChecks(u).find(c => !c.ok);
  return bad ? 'Username needs: ' + bad.text.toLowerCase() : null;
}
function passwordError(p){ return (typeof p !== 'string' || p.length < 8) ? 'Password must be at least 8 characters' : null; }

/* ============================================================
   MODALS + TOASTS
   ============================================================ */
let modalSticky = false;
function openModal(html, sticky){
  modalSticky = !!sticky;
  const m = $('olcModal');
  m.innerHTML = '<div class="olc-backdrop" onmousedown="if(event.target===this && !modalSticky) closeModal()"><div class="olc-box panel">' + html + '</div></div>';
  m.classList.add('open');
}
function closeModal(){ const m = $('olcModal'); m.classList.remove('open'); m.innerHTML = ''; modalSticky = false; }
/* generic form dialog: fields -> onSubmit(values, api) returns error string | null (null = close) */
function formModal(spec){
  const fields = (spec.fields || []).map(f => f.hidden
    ? `<input type="text" name="${f.name}" value="${esc(f.value || '')}" autocomplete="${f.autocomplete || 'username'}" style="position:absolute; left:-9999px; width:1px; height:1px;" tabindex="-1" aria-hidden="true">`
    : `<div class="field"><label class="f">${esc(f.label)}</label><input id="fm_${f.name}" name="${f.name}" type="${f.type === 'pin' ? 'text' : (f.type || 'text')}" ${f.type === 'pin' ? 'class="pin-input" inputmode="numeric" pattern="[0-9]*"' : (f.inputmode ? `inputmode="${f.inputmode}"` : '')} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} autocomplete="${f.autocomplete || 'off'}" value="${esc(f.value || '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}></div>`).join('');
  openModal(`<h3 style="justify-content:center;">${esc(spec.title)}</h3>
    ${spec.intro ? `<p class="stat-label" style="text-align:center; margin-bottom:12px;">${spec.intro}</p>` : ''}
    <form id="fmForm" autocomplete="on">${fields}
      <div id="fmErr" class="form-err"></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button type="button" class="btn ghost" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn" style="flex:1;" id="fmGo">${esc(spec.submitText || 'OK')}</button>
      </div></form>`);
  const form = $('fmForm');
  const first = form.querySelector('input:not([aria-hidden])'); if(first) setTimeout(() => first.focus(), 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = {}; (spec.fields || []).forEach(f => { const el = form.elements[f.name]; vals[f.name] = el ? el.value : ''; });
    const btn = $('fmGo'), err = $('fmErr'); err.textContent = ''; btn.disabled = true; const old = btn.textContent; btn.textContent = '…';
    try{ const msg = await spec.onSubmit(vals); if(msg){ err.textContent = msg; } else closeModal(); }
    catch(ex){ err.textContent = 'Something went wrong — check your connection and try again.'; }
    btn.disabled = false; btn.textContent = old;
  });
}

/* ============================================================
   OLD DATA DETECTION (nothing is ever deleted)
   ============================================================ */
function findLegacy(){
  const out = [], seen = new Set();
  const accs = LS.get('olc_accounts', []) || [];
  accs.forEach(a => { const st = LS.get('olc_state_' + a.id, null); if(st && isPlain(st)){ seen.add('olc_state_' + a.id); out.push({ key: 'olc_state_' + a.id, label: a.codename || 'Agent', state: st }); } });
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && /^olc_state/.test(k) && !seen.has(k)){ const st = LS.get(k, null); if(st && isPlain(st)) out.push({ key: k, label: 'Saved data', state: st }); }
    }
  }catch(e){}
  return out.filter(x => stateWeight(x.state) > 0);
}
function markMigrated(item){ if(!item) return; const m = LS.get('olc2_migrated', []) || []; if(!m.includes(item.key)){ m.push(item.key); LS.set('olc2_migrated', m); } }

/* ============================================================
   AUTH SCREEN  (sign in • create account • forgot password)
   ============================================================ */
let pendingImport = null, createAvatar = null, authCancelable = false;
function authShell(inner){
  const hasAcc = getAccounts().length > 0;
  return `<div class="authbox panel">
    ${authCancelable ? '<button class="idcard-close" style="position:absolute; top:10px; right:10px;" onclick="closeAuth()">✕</button>' : ''}
    <img src="assets/logo_symbol.png" alt="OLC">
    ${inner}
  </div>`;
}
function eyeBtn(id){ return `<button type="button" class="eye" onclick="togglePw('${id}')" tabindex="-1" aria-label="Show or hide password">👁</button>`; }
function togglePw(id){ const el = $(id); if(el) el.type = el.type === 'password' ? 'text' : 'password'; }
function checklistHTML(u){ return usernameChecks(u).map(c => `<span class="chk ${c.ok ? 'ok' : ''}">${c.ok ? '✓' : '○'} ${esc(c.text)}</span>`).join(''); }
function checkUsernameLive(v){ const el = $('unameCheck'); if(el) el.innerHTML = checklistHTML(v); }
function fixUsername(el){ const v = el.value.trim(); if(v && !v.includes('@')) el.value = v + SUFFIX; }
function setAuthMsg(t){ const e = $('authMsg'); if(e) e.textContent = t || ''; }
function setAuthErr(t, fieldId){
  document.querySelectorAll('#authGate .field input').forEach(i => i.classList.remove('bad'));
  const e = $('authError'); if(e) e.textContent = t || '';
  if(fieldId && $(fieldId)){ $(fieldId).classList.add('bad'); $(fieldId).focus(); }
}
function setAuthBusy(b){ document.querySelectorAll('#authGate button.btn').forEach(x => x.disabled = b); }

function openAuth(mode, opts){
  opts = opts || {};
  authCancelable = !!opts.cancelable || getAccounts().length > 0 && opts.cancelable !== false && !!state;
  if(!state && !opts.cancelable) authCancelable = false;
  closeAcctMenu();
  const g = $('authGate'); g.style.display = 'flex';
  document.body.classList.add('auth-on');
  renderAuth(mode || (getAccounts().length ? 'signin' : 'create'), opts);
}
function closeAuth(){ $('authGate').style.display = 'none'; $('authGate').innerHTML = ''; document.body.classList.remove('auth-on'); pendingImport = null; createAvatar = null; }
function renderAuth(mode, opts){
  opts = opts || {};
  const g = $('authGate');
  const legacy = (mode === 'create' && !pendingImport) ? findLegacy().filter(x => !(LS.get('olc2_migrated', []) || []).includes(x.key)) : [];
  const tabs = mode === 'forgot' ? '' : `<div class="authtabs">
      <div class="authtab ${mode === 'signin' ? 'active' : ''}" onclick="renderAuth('signin')">SIGN IN</div>
      <div class="authtab ${mode === 'create' ? 'active' : ''}" onclick="renderAuth('create')">CREATE ACCOUNT</div></div>`;
  let body = '';
  if(mode === 'signin'){
    body = `${opts.note ? `<div class="auth-note">${esc(opts.note)}</div>` : ''}
    <form id="f_signin" autocomplete="on" onsubmit="submitSignin(event)">
      <div class="field"><label class="f">Username</label><input type="text" id="si_user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" placeholder="Abcde123@olc.com" value="${esc(opts.prefill || '')}" onblur="fixUsername(this)"></div>
      <div class="field pw"><label class="f">Password</label><input type="password" id="si_pass" name="password" autocomplete="current-password" placeholder="Your password">${eyeBtn('si_pass')}</div>
      <button class="btn" type="submit" style="width:100%;">Sign in</button>
      ${window.PasswordCredential ? '<button class="btn ghost" type="button" style="width:100%; margin-top:8px;" onclick="useSavedPassword()">🔑 Use saved password</button>' : ''}
      <div class="auth-links"><a onclick="renderAuth('forgot')">Forgot password?</a></div>
    </form>`;
  } else if(mode === 'create'){
    body = `${pendingImport ? `<div class="auth-note ok">Your old data <b>${esc(stateSummary(pendingImport.state))}</b> will be moved into the account you create now. Nothing is deleted.</div>` : ''}
    ${legacy.length ? `<div class="auth-note ok"><b>Old OLC data found on this device</b>${legacy.map((l, i) => `<div class="legacy-row"><span>${esc(stateSummary(l.state))}</span><button type="button" class="btn sm" onclick="useLegacy(${i})">Use for new account</button></div>`).join('')}</div>` : ''}
    <form id="f_create" autocomplete="on" onsubmit="submitCreate(event)">
      <div class="avatar-pick"><label class="avatar-circle" title="Add profile picture">${createAvatar ? `<img src="${createAvatar}" alt="">` : '<span>＋</span>'}<input type="file" accept="image/*" style="display:none;" onchange="pickCreateAvatar(this)"></label><div class="stat-label">Profile picture (optional)</div></div>
      <div class="field"><label class="f">Username</label><input type="text" id="cr_user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" placeholder="Abcde123@olc.com" oninput="checkUsernameLive(this.value)" onblur="fixUsername(this)"></div>
      <div id="unameCheck" class="checklist">${checklistHTML('')}</div>
      <div class="field pw"><label class="f">Password (8 or more characters)</label><input type="password" id="cr_pass" name="new-password" autocomplete="new-password" placeholder="Choose a password">${eyeBtn('cr_pass')}</div>
      <div class="field pw"><label class="f">Confirm password</label><input type="password" id="cr_pass2" autocomplete="new-password" placeholder="Type it again">${eyeBtn('cr_pass2')}</div>
      <button class="btn" type="submit" style="width:100%;">Create account</button>
      <div class="stat-label" style="margin-top:10px;">Every username and password must be unique — no two accounts can share them. Your browser or Google Password Manager will offer to save the password.</div>
    </form>`;
  } else {
    body = `<h3 style="justify-content:center; margin-bottom:6px;">FORGOT PASSWORD</h3>
    <div class="stat-label" style="text-align:center; margin-bottom:12px;">Enter the recovery code you saved when you created the account, then choose a new password. Your data stays exactly as it is.</div>
    <form id="f_forgot" autocomplete="on" onsubmit="submitForgot(event)">
      <div class="field"><label class="f">Username</label><input type="text" id="fr_user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" placeholder="Abcde123@olc.com" onblur="fixUsername(this)"></div>
      <div class="field"><label class="f">Recovery code</label><input type="text" id="fr_code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></div>
      <div class="field pw"><label class="f">New password</label><input type="password" id="fr_pass" name="new-password" autocomplete="new-password">${eyeBtn('fr_pass')}</div>
      <button class="btn" type="submit" style="width:100%;">Set new password</button>
      <div class="auth-links"><a onclick="renderAuth('signin')">← Back to sign in</a></div>
    </form>`;
  }
  g.innerHTML = authShell(tabs + body + '<div id="authMsg" class="auth-msg"></div><div id="authError"></div><div class="auth-links" style="margin-top:8px;"><a onclick="checkServer()">Check server</a></div>');
  const first = g.querySelector('input[type=text]'); if(first && !opts.noFocus) setTimeout(() => { try{ first.focus(); }catch(e){} }, 60);
}
function useLegacy(i){
  const l = findLegacy().filter(x => !(LS.get('olc2_migrated', []) || []).includes(x.key))[i]; if(!l) return;
  pendingImport = l; renderAuth('create');
}
async function pickCreateAvatar(input){
  const f = input.files && input.files[0]; if(!f) return;
  try{ createAvatar = await fileToCompressedDataURL(f, 192, 0.8); }catch(e){ setAuthErr('Could not read that picture — try another one.'); return; }
  const keep = { u: $('cr_user').value, p: $('cr_pass').value, p2: $('cr_pass2').value };
  renderAuth('create', { noFocus: true });
  $('cr_user').value = keep.u; $('cr_pass').value = keep.p; $('cr_pass2').value = keep.p2; checkUsernameLive(keep.u);
}

/* ---- password manager integration ---- */
async function offerSavePassword(username, password){
  try{ if(window.PasswordCredential && navigator.credentials && navigator.credentials.store){ await navigator.credentials.store(new PasswordCredential({ id: username, password, name: username })); } }catch(e){}
}
async function useSavedPassword(){
  try{
    const c = await navigator.credentials.get({ password: true, mediation: 'optional' });
    if(c && c.id){ $('si_user').value = c.id; $('si_pass').value = c.password; submitSignin(new Event('submit')); }
  }catch(e){}
}

/* ---- flows ---- */
function addDeviceAccount(a){
  const l = getAccounts(); const i = l.findIndex(x => x.id === a.id);
  if(i >= 0) l[i] = Object.assign({}, l[i], a, { expired: false }); else l.push(Object.assign({ addedAt: Date.now() }, a));
  saveAccounts(l);
}
/* turn any server reply into a message a human can act on */
function replyError(r, fallback){
  if(r.data && r.data.error) return r.data.error;
  const st = r.status;
  if(st === 404 || st === 405) return 'The server at ' + API_BASE_URL + ' does not have the new OLC backend (HTTP ' + st + '). It is probably still the OLD version — redeploy the new backend folder on Render, then tap "Check server".';
  if([502, 503, 504].includes(st)) return 'The server is not running properly (HTTP ' + st + '). On Render open the service → Logs: it usually means DATABASE_URL is missing or wrong. Tap "Check server" for details.';
  return (fallback || 'Request failed') + ' (server replied HTTP ' + st + '). Tap "Check server" for details.';
}
async function checkServer(){
  setAuthErr(''); setAuthMsg('Checking the server… (can take up to a minute if it was asleep)');
  const t0 = performance.now();
  try{
    const r = await api('GET', '/api/health', null, null, { timeout: 70000 });
    setAuthMsg('');
    const ms = Math.round(performance.now() - t0);
    if(r.ok && r.data && r.data.version){
      const good = r.data.storage === 'postgres' && String(r.data.version).startsWith('2');
      openModal(`<h3 style="justify-content:center;">SERVER CHECK</h3>
        <div class="diag ${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'} Server answered in ${ms} ms — backend v${esc(r.data.version)}, storage: ${esc(r.data.storage)}</div>
        ${r.data.storage !== 'postgres' ? '<div class="diag bad">✗ Storage is not PostgreSQL. Data would be lost. Set DATABASE_URL on Render.</div>' : ''}
        <div class="stat-label" style="margin-top:8px;">Address used: ${esc(API_BASE_URL)}</div>
        <button class="btn" style="width:100%; margin-top:12px;" onclick="closeModal()">Close</button>`);
    } else {
      openModal(`<h3 style="justify-content:center;">SERVER CHECK</h3>
        <div class="diag bad">✗ HTTP ${r.status} from ${esc(API_BASE_URL)}/api/health</div>
        <div class="stat-label">${r.status === 404 ? 'The new backend is NOT running at this address (old version or wrong service).' : 'The server is up but not healthy — check the Render logs.'}</div>
        <div class="stat-label mono" style="margin-top:8px; word-break:break-all;">${esc(r.raw || '(empty reply)')}</div>
        <button class="btn" style="width:100%; margin-top:12px;" onclick="closeModal()">Close</button>`);
    }
  }catch(e){
    setAuthMsg('');
    openModal(`<h3 style="justify-content:center;">SERVER CHECK</h3>
      <div class="diag bad">✗ Cannot reach ${esc(API_BASE_URL)}</div>
      <div class="stat-label">${navigator.onLine ? 'Wrong address in API_BASE_URL (top of auth.js), or the Render service is stopped/failed to deploy.' : 'You are offline.'}</div>
      <button class="btn" style="width:100%; margin-top:12px;" onclick="closeModal()">Close</button>`);
  }
}
async function submitCreate(e){
  e.preventDefault();
  const u = normalizeUsername($('cr_user').value), p = $('cr_pass').value, p2 = $('cr_pass2').value;
  const ue = usernameError(u); if(ue) return setAuthErr(ue, 'cr_user');
  const pe = passwordError(p); if(pe) return setAuthErr(pe, 'cr_pass');
  if(p !== p2) return setAuthErr('The two passwords do not match.', 'cr_pass2');
  setAuthErr(''); setAuthBusy(true); setAuthMsg('Creating your account…');
  let r;
  try{ r = await authCall('/api/register', { username: u, password: p, avatar: createAvatar, device: deviceName() }, setAuthMsg); }
  catch(err){ setAuthBusy(false); setAuthMsg(''); return setAuthErr('Cannot reach the server. Check your internet and try again — nothing was lost.'); }
  setAuthBusy(false); setAuthMsg('');
  if(!r.ok) return setAuthErr(replyError(r, 'Could not create the account'), r.data.field === 'password' ? 'cr_pass' : r.data.field === 'username' ? 'cr_user' : null);
  const d = r.data;
  addDeviceAccount({ id: d.user.id, username: d.user.username, avatar: d.user.avatar, token: d.token });
  activeAccountId = d.user.id; LS.set(ACTIVE_KEY, d.user.id);
  let st;
  if(pendingImport){ st = hydrateState(clone(pendingImport.state)); if(!st.profile.photo && createAvatar) st.profile.photo = createAvatar; }
  else { st = hydrateState({}); st.profile.codename = u.split('@')[0]; if(createAvatar) st.profile.photo = createAvatar; }
  state = st; meta = { updatedAt: Date.now(), serverUpdatedAt: 0, dirty: true }; persistLocal();
  offerSavePassword(u, p);
  markMigrated(pendingImport); pendingImport = null; createAvatar = null;
  $('authGate').innerHTML = '';               // remove the form so the browser offers to save the password
  showRecoveryModal(d.recoveryCode, () => { closeAuth(); enterApp(); pushState(); });
}
async function submitSignin(e){
  e.preventDefault();
  const u = normalizeUsername($('si_user').value), p = $('si_pass').value;
  if(!u || !p) return setAuthErr('Enter your username and password.', u ? 'si_pass' : 'si_user');
  setAuthErr(''); setAuthBusy(true); setAuthMsg('Signing in…');
  let r;
  try{ r = await authCall('/api/login', { username: u, password: p, device: deviceName() }, setAuthMsg); }
  catch(err){ setAuthBusy(false); setAuthMsg(''); return setAuthErr('Cannot reach the server. Check your internet. (If you were already signed in on this device, close this and keep using the app — your data is safe.)'); }
  setAuthBusy(false); setAuthMsg('');
  if(!r.ok) return setAuthErr(replyError(r, 'Could not sign in'), r.data.error ? 'si_pass' : null);
  offerSavePassword(r.data.user.username, p);
  completeSignIn(r.data);
  $('authGate').innerHTML = '';
  closeAuth(); enterApp(); if(meta.dirty) pushState();
}
async function submitForgot(e){
  e.preventDefault();
  const u = normalizeUsername($('fr_user').value), code = $('fr_code').value.trim(), p = $('fr_pass').value;
  if(!u || !code) return setAuthErr('Enter your username and recovery code.', u ? 'fr_code' : 'fr_user');
  const pe = passwordError(p); if(pe) return setAuthErr(pe, 'fr_pass');
  setAuthErr(''); setAuthBusy(true); setAuthMsg('Checking…');
  let r;
  try{ r = await authCall('/api/recover', { username: u, recoveryCode: code, newPassword: p, device: deviceName() }, setAuthMsg); }
  catch(err){ setAuthBusy(false); setAuthMsg(''); return setAuthErr('Cannot reach the server. Try again in a moment.'); }
  setAuthBusy(false); setAuthMsg('');
  if(!r.ok) return setAuthErr(replyError(r, 'Recovery failed'), r.data.field === 'password' ? 'fr_pass' : r.data.error ? 'fr_code' : null);
  offerSavePassword(r.data.user.username, p);
  completeSignIn(r.data);
  $('authGate').innerHTML = '';
  showRecoveryModal(r.data.recoveryCode, () => { closeAuth(); enterApp(); if(meta.dirty) pushState(); }, true);
}
/* decide between this device's copy and the cloud copy — the losing one is always kept as a backup */
function completeSignIn(d){
  const id = d.user.id;
  addDeviceAccount({ id, username: d.user.username, avatar: d.user.avatar, token: d.token });
  activeAccountId = id; LS.set(ACTIVE_KEY, id);
  const local = loadLocalFor(id);                    // also loads this device's sync info into `meta`
  const serverState = d.state ? hydrateState(d.state) : null, sUpd = d.updatedAt || 0;
  const localHasData = local && (stateWeight(local) > 0 || meta.dirty);
  if(localHasData){
    if(serverState && sUpd > (meta.serverUpdatedAt || 0)){
      if(meta.dirty && meta.updatedAt > sUpd){ state = local; stashBackup('Cloud copy at sign-in', serverState); meta.serverUpdatedAt = sUpd; }
      else { state = local; stashBackup('This device before sign-in', local); state = serverState; meta = { updatedAt: Date.now(), serverUpdatedAt: sUpd, dirty: false }; }
    } else { state = local; if(!serverState){ meta.serverUpdatedAt = 0; meta.dirty = true; } }
  } else if(serverState){ state = serverState; meta = { updatedAt: Date.now(), serverUpdatedAt: sUpd, dirty: false }; }
  else { state = hydrateState({}); state.profile.codename = d.user.username.split('@')[0]; meta = { updatedAt: Date.now(), serverUpdatedAt: sUpd, dirty: false }; }
  persistLocal();
}
function showRecoveryModal(code, done, isReset){
  openModal(`<h3 style="justify-content:center;">🔑 ${isReset ? 'NEW ' : 'YOUR '}RECOVERY CODE</h3>
    <p class="stat-label" style="text-align:center;">If you ever forget your password, this code is the <b>only</b> way back into your account. Save it somewhere safe (screenshot, notes app, paper). ${isReset ? 'Your old code no longer works.' : ''}</p>
    <div class="recovery-code" id="recCode">${esc(code)}</div>
    <div style="display:flex; gap:8px; justify-content:center; margin:10px 0;">
      <button class="btn ghost sm" onclick="copyText('${esc(code)}')">Copy</button>
      <button class="btn ghost sm" onclick="downloadRecovery('${esc(code)}')">Download .txt</button>
    </div>
    <label class="chk-row"><input type="checkbox" id="recSaved" onchange="$('recGo').disabled=!this.checked"> I have saved my recovery code</label>
    <button class="btn" id="recGo" style="width:100%; margin-top:10px;" disabled>Continue</button>`, true);
  $('recGo').onclick = () => { closeModal(); done && done(); };
}
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('Copied'); }catch(e){ toast('Press and hold the code to copy it.'); } }
function downloadRecovery(code){
  const acc = loggedAccount();
  const blob = new Blob(['OLC recovery code\nAccount: ' + (acc ? acc.username : '') + '\nCode: ' + code + '\n\nKeep this private. It resets your password.\n'], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'olc-recovery-code.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function reauth(acc){ openAuth('signin', { cancelable: true, prefill: acc.username, note: 'Your cloud session expired. Sign in again to keep syncing — your data on this device is safe.' }); }

/* ============================================================
   ACCOUNT SWITCHER (several accounts on one device)
   ============================================================ */
function avatarHTML(acc, cls){
  const ini = (acc.username || '?').charAt(0).toUpperCase();
  return acc.avatar ? `<img class="${cls || 'am-av'}" src="${esc(acc.avatar)}" alt="">` : `<span class="${cls || 'am-av'} ini">${esc(ini)}</span>`;
}
function renderAcctMenu(){
  const accs = getAccounts();
  $('acctMenu').innerHTML = `<div class="am-title">ACCOUNTS ON THIS DEVICE</div>
    ${accs.map(a => `<div class="am-row ${a.id === activeAccountId ? 'active' : ''}" onclick="switchAccount('${esc(a.id)}')">
        ${avatarHTML(a)}<div class="am-name">${esc(a.username)}${a.expired ? '<small class="warn">sign in again</small>' : ''}</div>
        ${a.id === activeAccountId ? '<span class="am-tick">✓</span>' : `<button class="am-x" title="Remove from this device" onclick="event.stopPropagation(); removeAccount('${esc(a.id)}')">✕</button>`}
      </div>`).join('')}
    <div class="am-sep"></div>
    <div class="am-act" onclick="addAccount()">＋ Add another account</div>
    <div class="am-act" onclick="closeAcctMenu(); go('profile')">☰ Agent profile &amp; account settings</div>
    <div class="am-act" onclick="closeAcctMenu(); lockNow()">🔒 Lock now</div>`;
}
function toggleAcctMenu(ev){ if(ev) ev.stopPropagation(); const m = $('acctMenu'); if(m.classList.contains('open')){ closeAcctMenu(); return; } renderAcctMenu(); m.classList.add('open'); }
function closeAcctMenu(){ const m = $('acctMenu'); if(m){ m.classList.remove('open'); } }
document.addEventListener('click', (e) => { const m = $('acctMenu'); if(m && m.classList.contains('open') && !m.contains(e.target)) closeAcctMenu(); });
function addAccount(){ closeAcctMenu(); openAuth('signin', { cancelable: true }); }
async function switchAccount(id){
  closeAcctMenu();
  if(id === activeAccountId) return;
  const acc = getAccounts().find(a => a.id === id); if(!acc) return;
  persistLocal(); pushState();
  activeAccountId = id; LS.set(ACTIVE_KEY, id);
  let st = loadLocalFor(id);
  if(!st){
    toast('Loading account…', 2500);
    if(acc.token && !acc.expired){
      try{ const r = await api('GET', '/api/state', null, acc.token, { timeout: 30000 });
        if(r.ok && r.data.state){ st = hydrateState(r.data.state); meta = { updatedAt: Date.now(), serverUpdatedAt: r.data.updatedAt, dirty: false }; } }catch(e){}
    }
    if(!st){ st = hydrateState({}); st.profile.codename = acc.username.split('@')[0]; }
  }
  state = st; persistLocal();
  applyStateToUI(); currentSection = 'home'; go('home'); renderAll();
  toast('Switched to ' + acc.username);
  setSync(acc.expired ? 'auth' : 'idle');
  if(!acc.expired) pullState({ manual: true }); else reauth(acc);
}
async function removeAccount(id){
  const acc = getAccounts().find(a => a.id === id); if(!acc) return;
  if(!confirm('Remove ' + acc.username + ' from this device?\n\nYour data stays safe in the cloud, and a copy is kept on this device. You can add the account again any time.')) return;
  if(acc.token){ try{ await api('POST', '/api/logout', null, acc.token, { timeout: 8000 }); }catch(e){} }
  saveAccounts(getAccounts().filter(a => a.id !== id));
  if(id === activeAccountId){
    const next = getAccounts()[0];
    if(next) await switchAccount(next.id);
    else { LS.del(ACTIVE_KEY); LS.del('olc2_lock'); activeAccountId = null; state = null; document.body.classList.remove('app-on'); $('app').classList.remove('ready'); openAuth('signin', { cancelable: false }); }
  } else renderAcctMenu();
}

/* ============================================================
   APP LOCK (PIN) — per device, for the web app and the installed app
   Hashed with PBKDF2 and stored only on this device. It is a privacy
   lock that hides OLC from people using your phone/laptop; it does not
   encrypt the data on the device.
   ============================================================ */
let locked = false, hiddenAt = 0, pinBuf = '', lockTick = null;
const lockCfg = () => LS.get('olc2_lock', null);
const toHex = (u8) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array((h.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
async function pinHash(pin, saltHex){
  try{
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256);
    return toHex(new Uint8Array(bits));
  }catch(e){                                 // very old / non-secure browsers
    let h = 5381; const s = saltHex + pin;
    for(let r = 0; r < 2000; r++) for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i) + r) | 0;
    return 'f' + (h >>> 0).toString(16);
  }
}
async function savePin(pin, auto){
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const prev = lockCfg();
  LS.set('olc2_lock', { v: 1, salt, hash: await pinHash(pin, salt), len: pin.length, auto: auto !== undefined ? auto : (prev ? prev.auto : 1) });
  LS.del('olc2_lockfail');
}
async function pinMatches(pin){ const c = lockCfg(); return !!c && (await pinHash(pin, c.salt)) === c.hash; }
const pinProblem = (p) => /^\d{4,6}$/.test(p) ? null : 'Use 4 to 6 digits (numbers only).';

function setupPinDialog(then){
  formModal({ title: 'SET APP LOCK PIN', intro: 'Choose a 4–6 digit PIN. OLC will ask for it when you open the app and when you lock it.',
    fields: [{ name: 'pin', label: 'New PIN', type: 'pin', maxlength: 6 }, { name: 'pin2', label: 'Repeat PIN', type: 'pin', maxlength: 6 }],
    submitText: 'Save PIN',
    onSubmit: async (v) => {
      const e = pinProblem(v.pin); if(e) return e;
      if(v.pin !== v.pin2) return 'The two PINs do not match.';
      await savePin(v.pin); toast('🔒 App lock is on'); refreshProfileIfOpen(); if(then) then(); return null;
    } });
}
function changePinDialog(){
  formModal({ title: 'CHANGE PIN', fields: [
      { name: 'old', label: 'Current PIN', type: 'pin', maxlength: 6 }, { name: 'pin', label: 'New PIN', type: 'pin', maxlength: 6 }, { name: 'pin2', label: 'Repeat new PIN', type: 'pin', maxlength: 6 }],
    submitText: 'Change PIN',
    onSubmit: async (v) => {
      if(!(await pinMatches(v.old))) return 'Current PIN is wrong.';
      const e = pinProblem(v.pin); if(e) return e;
      if(v.pin !== v.pin2) return 'The two new PINs do not match.';
      await savePin(v.pin); toast('PIN changed'); return null;
    } });
}
function disableLockDialog(){
  formModal({ title: 'TURN OFF APP LOCK', intro: 'Enter your PIN to turn the lock off.', fields: [{ name: 'pin', label: 'PIN', type: 'pin', maxlength: 6 }], submitText: 'Turn off',
    onSubmit: async (v) => { if(!(await pinMatches(v.pin))) return 'Wrong PIN.'; LS.del('olc2_lock'); LS.del('olc2_lockfail'); toast('App lock turned off'); refreshProfileIfOpen(); return null; } });
}
function setAutoLock(v){ const c = lockCfg(); if(!c) return; c.auto = (v === 'open' || v === 'now') ? v : Number(v); LS.set('olc2_lock', c); toast('Saved'); }
function refreshProfileIfOpen(){ if(currentSection === 'profile' && state) renderSection(); }

function lockNow(){
  if(!state) return;
  if(!lockCfg()){ if(confirm('You have not set an app lock yet.\n\nSet a PIN now?')) setupPinDialog(() => setTimeout(lockNow, 150)); return; }
  closeModal(); closeAcctMenu();
  locked = true; pinBuf = '';
  document.documentElement.classList.add('locked');
  renderLock();
}
function checkAutoLock(){
  const c = lockCfg(); if(!c || locked || !state || !hiddenAt) return;
  const a = c.auto;
  if(a === 'now' || (typeof a === 'number' && Date.now() - hiddenAt > a * 60000)) lockNow();
}
function renderLock(){
  const c = lockCfg(); if(!c) return;
  const acc = getAccounts().find(a => a.id === (activeAccountId || LS.get(ACTIVE_KEY))) || getAccounts()[0];
  const key = (k, l) => `<button class="key" type="button" onclick="pinKey('${k}')">${l || k}</button>`;
  $('lockScreen').innerHTML = `<div class="lock-box">
    <img class="lock-logo" src="assets/logo_symbol.png" alt="OLC">
    ${acc ? avatarHTML(acc, 'lock-av') : ''}
    <div class="lock-name">${esc(acc ? acc.username : 'OLC')}</div>
    <div class="lock-sub" id="lockSub">Enter your PIN</div>
    <div class="pin-dots" id="pinDots">${Array.from({ length: c.len }, () => '<i></i>').join('')}</div>
    <div class="keypad">${['1','2','3','4','5','6','7','8','9'].map(k => key(k)).join('')}<span></span>${key('0')}${key('del', '⌫')}</div>
    <a class="lock-forgot" onclick="forgotPin()">Forgot PIN?</a></div>`;
  updateDots(); tickCooldown();
}
function updateDots(){ document.querySelectorAll('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length)); }
function cooldownLeft(){ const f = LS.get('olc2_lockfail', null); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function tickCooldown(){
  clearInterval(lockTick);
  const sub = $('lockSub'); if(!sub) return;
  const left = cooldownLeft();
  if(!left){ sub.classList.remove('bad'); if(sub.dataset.cool){ sub.textContent = 'Enter your PIN'; delete sub.dataset.cool; } return; }
  sub.dataset.cool = '1'; sub.classList.add('bad'); sub.textContent = 'Too many wrong tries. Wait ' + left + 's';
  lockTick = setInterval(tickCooldown, 1000);
}
async function pinKey(k){
  if(!locked || cooldownLeft()) return;
  const c = lockCfg(); if(!c) return;
  if(k === 'del') pinBuf = pinBuf.slice(0, -1);
  else if(pinBuf.length < c.len) pinBuf += k;
  updateDots();
  if(pinBuf.length === c.len){
    const attempt = pinBuf;
    if(await pinMatches(attempt)){ LS.del('olc2_lockfail'); unlock(); }
    else {
      const f = LS.get('olc2_lockfail', { n: 0, until: 0 }); f.n++;
      if(f.n % 5 === 0) f.until = Date.now() + Math.min(30000 * Math.pow(2, f.n / 5 - 1), 600000);
      LS.set('olc2_lockfail', f);
      const box = document.querySelector('.lock-box'); if(box){ box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
      try{ navigator.vibrate && navigator.vibrate(120); }catch(e){}
      pinBuf = ''; updateDots();
      const sub = $('lockSub'); if(sub){ sub.textContent = 'Wrong PIN'; sub.classList.add('bad'); setTimeout(() => { if(!cooldownLeft() && sub) { sub.textContent = 'Enter your PIN'; sub.classList.remove('bad'); } }, 1200); }
      tickCooldown();
    }
  }
}
document.addEventListener('keydown', (e) => {
  if(!locked && !document.documentElement.classList.contains('locked-boot')) return;
  if($('olcModal').classList.contains('open')) return;
  if(/^[0-9]$/.test(e.key)) pinKey(e.key); else if(e.key === 'Backspace') pinKey('del');
});
let afterUnlock = null;
function unlock(){
  locked = false; pinBuf = '';
  document.documentElement.classList.remove('locked', 'locked-boot');
  $('lockScreen').innerHTML = '';
  if(afterUnlock){ const f = afterUnlock; afterUnlock = null; f(); }
  else { pullState(); }
}
async function verifyAccountPassword(acc, pw){
  try{
    if(acc.token && !acc.expired){
      const r = await api('POST', '/api/me/verify', { password: pw }, acc.token, { timeout: 30000 });
      if(r.ok) return null;
      if(!(r.status === 401 && r.data && r.data.code === 'bad_token')) return (r.data && r.data.error) || 'Wrong password';
    }
    const r2 = await api('POST', '/api/login', { username: acc.username, password: pw, device: deviceName() }, null, { timeout: 60000 });
    if(r2.ok){ patchAccount(acc.id, { token: r2.data.token, expired: false }); return null; }
    return (r2.data && r2.data.error) || 'Wrong password';
  }catch(e){ return 'Cannot reach the server — you need internet to reset the PIN this way.'; }
}
function forgotPin(){
  const acc = getAccounts().find(a => a.id === (activeAccountId || LS.get(ACTIVE_KEY))) || getAccounts()[0]; if(!acc) return;
  formModal({ title: 'RESET PIN', intro: 'Enter the password of <b>' + esc(acc.username) + '</b> to remove the lock. You can then set a new PIN. Your data is not touched.',
    fields: [{ name: 'username', hidden: true, value: acc.username, autocomplete: 'username' }, { name: 'password', label: 'Account password', type: 'password', autocomplete: 'current-password' }],
    submitText: 'Reset PIN',
    onSubmit: async (v) => {
      const err = await verifyAccountPassword(acc, v.password); if(err) return err;
      LS.del('olc2_lock'); LS.del('olc2_lockfail'); unlock(); toast('Lock removed — set a new PIN any time in Agent Profile.', 5000); return null;
    } });
}

/* ============================================================
   ACCOUNT / SECURITY / DATA PANELS  (shown in Agent Profile)
   ============================================================ */
function accountPanelsHTML(){
  const acc = loggedAccount(), lk = lockCfg();
  const legacy = findLegacy();
  setTimeout(() => { updateSyncDetail(); loadDevices(); loadBackups(); }, 0);
  const auto = lk ? lk.auto : 1;
  const opt = (v, t) => `<option value="${v}" ${String(auto) === String(v) ? 'selected' : ''}>${t}</option>`;
  return `
  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🪪</span>MY OLC ACCOUNT</h3>
    <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
      ${acc ? avatarHTML(Object.assign({}, acc, { avatar: acc.avatar || (state.profile && state.profile.photo) }), 'acct-big') : ''}
      <div style="flex:1; min-width:200px;">
        <div class="eyebrow">USERNAME</div>
        <div class="stat-big mono" style="font-size:17px; word-break:break-all;">${esc(acc ? acc.username : '—')}</div>
        <div class="stat-label" style="margin-top:4px;">${getAccounts().length} account(s) on this device · connected to your Agent Profile (name, photo, rank, XP and all records belong to this account).</div>
      </div>
    </div>
    <div class="btnrow">
      <label class="btn ghost sm" style="cursor:pointer;">Change profile picture<input type="file" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(this)"></label>
      <button class="btn ghost sm" onclick="toggleAcctMenu(event)">Switch account</button>
      <button class="btn ghost sm" onclick="addAccount()">＋ Add account</button>
      <button class="btn ghost sm" onclick="removeAccount(activeAccountId)">Sign out of this device</button>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🔐</span>PASSWORD &amp; RECOVERY</h3>
    <p class="stat-label">Forgot your password someday? Your recovery code gets you back in without losing any data.</p>
    <div class="btnrow">
      <button class="btn ghost sm" onclick="changePasswordDialog()">Change password</button>
      <button class="btn ghost sm" onclick="newRecoveryDialog()">Make a new recovery code</button>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🔒</span>APP LOCK (PIN)</h3>
    <p class="stat-label">${lk ? 'App lock is <b style="color:var(--green)">ON</b> for this device. OLC asks for your PIN when it opens and when you lock it.' : 'Lock OLC on this device with a 4–6 digit PIN. It works in the website and the installed app.'}</p>
    <div class="btnrow">
      ${lk ? `<button class="btn sm" onclick="lockNow()">Lock now</button><button class="btn ghost sm" onclick="changePinDialog()">Change PIN</button><button class="btn ghost sm" onclick="disableLockDialog()">Turn off</button>`
           : `<button class="btn sm" onclick="setupPinDialog()">Set up app lock</button>`}
    </div>
    ${lk ? `<div class="field" style="margin-top:10px; max-width:340px;"><label class="f">Lock automatically</label>
      <select onchange="setAutoLock(this.value)">${opt('now', 'As soon as I leave the app')}${opt(1, 'After 1 minute away')}${opt(5, 'After 5 minutes away')}${opt(15, 'After 15 minutes away')}${opt('open', 'Only when I open the app fresh')}</select></div>` : ''}
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">☁</span>CLOUD SYNC &amp; MY DEVICES</h3>
    <div class="stat-label" id="syncDetail">…</div>
    <div class="btnrow"><button class="btn ghost sm" onclick="manualSyncNow()">Sync now</button></div>
    <div class="eyebrow" style="margin:14px 0 6px;">DEVICES SIGNED IN TO THIS ACCOUNT</div>
    <div id="devList" class="stat-label">Loading…</div>
    <p class="stat-label" style="margin-top:10px;">To use this account on another device: open OLC there → <b>Sign in</b> with the same username and password. Your data appears automatically.</p>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🛡</span>DATA SAFETY</h3>
    <p class="stat-label">Your data is saved on this device first, then copied to the cloud. Replaced copies are always kept below so nothing is lost.</p>
    <div class="btnrow">
      <button class="btn ghost sm" onclick="exportMyData()">⬇ Download backup (JSON)</button>
      <label class="btn ghost sm" style="cursor:pointer;">⬆ Restore from backup file<input type="file" accept=".json,application/json" style="display:none;" onchange="importBackupFile(this)"></label>
      ${legacy.length ? `<button class="btn ghost sm" onclick="legacyImportDialog()">Import old data found on this device (${legacy.length})</button>` : ''}
      <button class="btn ghost sm" onclick="claimOldCloudDialog()">Recover old cloud account</button>
    </div>
    <div class="eyebrow" style="margin:14px 0 6px;">SAVED COPIES (BACKUPS)</div>
    <div id="bkList" class="stat-label">Loading…</div>
    <div class="btnrow" style="margin-top:12px;"><button class="btn ghost sm" onclick="runDiagnostics()">🩺 Run diagnostics (images &amp; server)</button></div>
    <div class="stat-label" style="margin-top:8px;">OLC v${APP_VERSION}</div>
  </div>`;
}
const fmtAgo = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
async function loadDevices(){
  const el = $('devList'); if(!el) return;
  const acc = loggedAccount(); if(!acc || !acc.token || acc.expired){ el.textContent = 'Sign in again to see your devices.'; return; }
  try{
    const r = await api('GET', '/api/sessions', null, acc.token, { timeout: 25000 });
    if(!$('devList')) return;
    if(!r.ok){ $('devList').textContent = 'Could not load devices right now.'; return; }
    $('devList').innerHTML = r.data.sessions.map(s => `<div class="dev-row"><div><b>${esc(s.device)}</b>${s.current ? ' <span class="tag">THIS DEVICE</span>' : ''}<div class="stat-label">Last active ${fmtAgo(s.lastSeen)}</div></div>
      ${s.current ? '' : `<button class="btn ghost sm" onclick="signOutDevice('${esc(s.id)}')">Sign out</button>`}</div>`).join('') || 'No devices.';
  }catch(e){ if($('devList')) $('devList').textContent = 'Offline — device list unavailable.'; }
}
async function signOutDevice(sid){
  const acc = loggedAccount(); if(!acc) return;
  try{ await api('DELETE', '/api/sessions/' + encodeURIComponent(sid), null, acc.token); toast('Device signed out'); }catch(e){ toast('Could not reach the server.'); }
  loadDevices();
}
async function loadBackups(){
  const el = $('bkList'); if(!el) return;
  const acc = loggedAccount(); const local = LS.get(bkKey(activeAccountId), []) || [];
  let server = [];
  if(acc && acc.token && !acc.expired){ try{ const r = await api('GET', '/api/backups', null, acc.token, { timeout: 25000 }); if(r.ok) server = r.data.backups; }catch(e){} }
  if(!$('bkList')) return;
  const rows = [
    ...local.map((b, i) => `<div class="dev-row"><div><b>${esc(b.label)}</b><div class="stat-label">On this device · ${fmtAgo(b.at)} · ${esc(stateSummary(b.data))}</div></div><button class="btn ghost sm" onclick="restoreLocalBackup(${i})">Restore</button></div>`),
    ...server.slice(0, 6).map(b => `<div class="dev-row"><div><b>Cloud copy</b><div class="stat-label">${fmtAgo(b.createdAt)} · ${Math.round(b.bytes / 1024)} KB</div></div><button class="btn ghost sm" onclick="restoreServerBackup('${esc(b.id)}')">Restore</button></div>`),
  ];
  $('bkList').innerHTML = rows.join('') || 'No older copies yet — they appear automatically when data is replaced.';
}
function replaceStateWith(st, label){
  stashBackup('Before ' + label, state);
  state = hydrateState(clone(st)); saveState(); applyStateToUI(); renderAll(); toast('✓ ' + label + ' restored', 4000);
}
function restoreLocalBackup(i){
  const b = (LS.get(bkKey(activeAccountId), []) || [])[i]; if(!b) return;
  if(confirm('Restore this saved copy?\n\n' + stateSummary(b.data) + '\n\nYour current data is backed up first.')) replaceStateWith(b.data, 'saved copy');
}
async function restoreServerBackup(id){
  const acc = loggedAccount(); if(!acc) return;
  if(!confirm('Restore this cloud copy? Your current data is backed up first.')) return;
  try{
    stashBackup('Before cloud restore', state);
    const r = await api('POST', '/api/backups/' + encodeURIComponent(id) + '/restore', null, acc.token, { timeout: 40000 });
    if(r.ok){ adoptRemote(r.data.state, r.data.updatedAt); toast('✓ Cloud copy restored', 4000); } else toast(r.data.error || 'Could not restore.');
  }catch(e){ toast('Could not reach the server.'); }
}
function importBackupFile(input){
  const f = input.files && input.files[0]; input.value = ''; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let obj; try{ obj = JSON.parse(rd.result); }catch(e){ return alert('That file is not a valid OLC backup.'); }
    if(!isPlain(obj) || (obj.xp === undefined && !obj.profile && !obj.dailyLogs)) return alert('That file does not look like an OLC backup.');
    if(confirm('Restore this backup into your current account?\n\n' + stateSummary(obj) + '\n\nYour current data is backed up first.')) replaceStateWith(obj, 'backup file');
  };
  rd.readAsText(f);
}
function legacyImportDialog(){
  const l = findLegacy();
  openModal(`<h3 style="justify-content:center;">OLD DATA ON THIS DEVICE</h3>
    <p class="stat-label" style="text-align:center;">Choose which old Agent ID to copy into this account. The old copy stays on the device untouched.</p>
    ${l.map((x, i) => `<div class="legacy-row"><span>${esc(stateSummary(x.state))}</span><button class="btn sm" onclick="legacyImportGo(${i})">Import</button></div>`).join('')}
    <button class="btn ghost" style="width:100%; margin-top:10px;" onclick="closeModal()">Close</button>`);
}
function legacyImportGo(i){
  const x = findLegacy()[i]; if(!x) return; closeModal();
  if(confirm('Replace this account\'s current data with:\n' + stateSummary(x.state) + '\n\nYour current data is backed up first.')){ replaceStateWith(x.state, 'old data'); markMigrated(x); }
}
function claimOldCloudDialog(){
  formModal({ title: 'RECOVER OLD CLOUD ACCOUNT', intro: 'If you used the old Codename + Code ID login with cloud sync, enter them to copy that data into this account (works if the old server data still exists).',
    fields: [{ name: 'codename', label: 'Old Codename' }, { name: 'codeid', label: 'Old Code ID' }], submitText: 'Find my data',
    onSubmit: async (v) => {
      const acc = loggedAccount(); if(!acc || acc.expired) return 'Sign in again first.';
      const r = await api('POST', '/api/legacy/claim', { codename: v.codename.trim(), codeid: v.codeid.trim() }, acc.token, { timeout: 40000 });
      if(!r.ok || !r.data.state) return (r.data && r.data.error) || 'Nothing found for that Codename + Code ID.';
      closeModal(); if(confirm('Found: ' + stateSummary(r.data.state) + '\n\nReplace this account\'s data with it? (Current data is backed up first.)')) replaceStateWith(r.data.state, 'old cloud data');
      return null;
    } });
}
function changePasswordDialog(){
  const acc = loggedAccount(); if(!acc) return;
  formModal({ title: 'CHANGE PASSWORD', fields: [
      { name: 'username', hidden: true, value: acc.username, autocomplete: 'username' },
      { name: 'old', label: 'Current password', type: 'password', autocomplete: 'current-password' },
      { name: 'pw', label: 'New password (8+ characters)', type: 'password', autocomplete: 'new-password' },
      { name: 'pw2', label: 'Repeat new password', type: 'password', autocomplete: 'new-password' }], submitText: 'Change password',
    onSubmit: async (v) => {
      const e = passwordError(v.pw); if(e) return e;
      if(v.pw !== v.pw2) return 'The new passwords do not match.';
      const r = await api('POST', '/api/me/password', { oldPassword: v.old, newPassword: v.pw }, acc.token, { timeout: 40000 });
      if(!r.ok) return r.status === 401 && r.data.code === 'bad_token' ? 'Session expired — sign in again first.' : (r.data.error || 'Could not change the password.');
      offerSavePassword(acc.username, v.pw); toast('✓ Password changed'); return null;
    } });
}
function newRecoveryDialog(){
  const acc = loggedAccount(); if(!acc) return;
  formModal({ title: 'NEW RECOVERY CODE', intro: 'Your old recovery code stops working. Enter your password to continue.',
    fields: [{ name: 'username', hidden: true, value: acc.username, autocomplete: 'username' }, { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }], submitText: 'Create new code',
    onSubmit: async (v) => {
      const r = await api('POST', '/api/me/recovery', { password: v.password }, acc.token, { timeout: 40000 });
      if(!r.ok) return r.data.error || 'Could not create a new code.';
      setTimeout(() => showRecoveryModal(r.data.recoveryCode, closeModal, true), 50); return null;
    } });
}
async function setAccountAvatarFromFile(file){
  const acc = loggedAccount(); if(!acc) return;
  try{
    const small = await fileToCompressedDataURL(file, 192, 0.8);
    patchAccount(acc.id, { avatar: small });
    if(acc.token && !acc.expired) api('PUT', '/api/me/avatar', { avatar: small }, acc.token).catch(() => {});
  }catch(e){}
}

/* ============================================================
   DIAGNOSTICS — find out exactly why images / server fail
   ============================================================ */
async function runDiagnostics(){
  openModal('<h3 style="justify-content:center;">🩺 DIAGNOSTICS</h3><div id="diagOut" class="stat-label">Checking…</div><button class="btn ghost" style="width:100%; margin-top:12px;" onclick="closeModal()">Close</button>');
  const out = []; const add = (ok, t) => out.push(`<div class="diag ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${esc(t)}</div>`);
  const t0 = performance.now();
  try{ const r = await api('GET', '/api/health', null, null, { timeout: 70000 }); add(r.ok, r.ok ? 'Server reachable (' + r.data.storage + ' database, v' + r.data.version + ', ' + Math.round(performance.now() - t0) + ' ms)' : 'Server answered with an error ' + r.status); if(r.ok && r.data.storage === 'memory') add(false, 'Server is using a TEMPORARY memory database — data will be lost. Set DATABASE_URL.'); }
  catch(e){ add(false, 'Server NOT reachable (' + (navigator.onLine ? 'it may be asleep — try again in a minute' : 'you are offline') + ')'); }
  const files = ['assets/logo_symbol.png', 'assets/logo_text.png', 'assets/profile.png', 'assets/id_front.jpg', 'assets/id_back.jpg', 'assets/radha_krishna.jpg']
    .concat(RANK_KEYS.map(k => 'assets/ranks/' + k + '.png'), DEFAULT_RULEBOOK_PAGES);
  const missing = [];
  await Promise.all(files.map(async f => { try{ const r = await fetch(f, { method: 'HEAD', cache: 'no-store' }); if(!r.ok) missing.push(f); }catch(e){ missing.push(f); } }));
  add(!missing.length, missing.length ? missing.length + ' of ' + files.length + ' image files are MISSING on the website: ' + missing.slice(0, 6).join(', ') + (missing.length > 6 ? '…' : '') + ' — re-upload the whole assets folder to GitHub.' : 'All ' + files.length + ' image files are present.');
  try{ const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []; add(regs.length > 0, regs.length ? 'Offline cache (service worker) active' : 'Offline cache not active (works only on https)'); }catch(e){}
  let bytes = 0; try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); bytes += k.length + (localStorage.getItem(k) || '').length; } }catch(e){}
  add(bytes < 4.2e6, 'Device storage used: ' + (bytes / 1048576).toFixed(2) + ' MB of about 5 MB' + (bytes >= 4.2e6 ? ' — nearly full! Download a backup and remove big uploaded images.' : ''));
  add(true, 'Your data: ' + stateSummary(state));
  if($('diagOut')) $('diagOut').innerHTML = out.join('');
}

/* broken-image safety net: retry once with a fresh URL, then show a neat placeholder (never an empty hole) */
const IMG_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="14" fill="#1a1226" stroke="#6753b7"/><text x="60" y="66" text-anchor="middle" font-size="11" fill="#a89bc4" font-family="monospace">image missing</text></svg>');
let missingImgs = new Set(), imgWarned = false;
window.addEventListener('error', (e) => {
  const t = e.target; if(!t || t.tagName !== 'IMG') return;
  const src = t.getAttribute('src') || '';
  if(src.startsWith('data:')) return;
  if(!t.dataset.retry){ t.dataset.retry = '1'; t.src = src.split('?')[0] + '?r=' + Date.now(); return; }
  t.dataset.retry = '2'; missingImgs.add(src.split('?')[0]); t.src = IMG_PLACEHOLDER; t.classList.add('img-missing');
  if(missingImgs.size >= 3 && !imgWarned){ imgWarned = true; toast('Some images could not load — open Agent Profile → Run diagnostics.', 7000); }
}, true);

/* ============================================================
   STARTUP — instant, local-first
   ============================================================ */
function applyStateToUI(){
  setTheme(state.settings.theme || 'dark');
  const ct = state.settings.colorTheme;
  if(ct && ct !== 'violet') document.documentElement.setAttribute('data-color', ct); else document.documentElement.removeAttribute('data-color');
  applyMonkMode(state.settings.mode || 'normal');
  syncProfileImagesToDOM();
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.sec === currentSection));
}
let bootPlayed = false;
function enterApp(){
  document.body.classList.add('app-on');
  rollover();
  applyStateToUI(); renderAll();
  const boot = $('boot'), app = $('app');
  if(bootPlayed){ app.classList.add('ready'); }
  else {
    bootPlayed = true;
    boot.style.display = 'flex'; boot.style.opacity = '1';
    boot.querySelectorAll('.bootline').forEach(el => { el.style.animation = 'none'; void el.offsetHeight; el.style.animation = ''; el.classList.add('blink-in'); });
    let done = false;
    const finish = () => {
      if(done) return; done = true;
      boot.style.opacity = '0'; app.classList.add('ready');
      setTimeout(() => { boot.style.display = 'none'; }, 450);
    };
    boot.onclick = finish;                 // tap to skip
    setTimeout(finish, 1300);
  }
  startSyncLoops();
  setSync(syncInfo.status === 'idle' ? 'idle' : syncInfo.status);
  pullState({ manual: true });
}
function repairData(){ stashBackup('Before repair', state); state = hydrateState(state); saveState(); renderAll(); toast('Repaired'); }
function boot(){
  tickClock(); setInterval(tickClock, 1000);
  setInterval(() => { if(state && !locked){ rollover(); renderTopbar(); } }, 30000);
  $('boot').style.display = 'none';
  registerServiceWorker(); initInstallButtonVisibility();
  wakeServer();                                  // wake a sleeping free server in the background while the user types / unlocks
  const accs = getAccounts();
  if(!accs.length){ document.documentElement.classList.remove('locked-boot'); LS.del('olc2_lock'); openAuth('create', { cancelable: false }); return; }
  let id = LS.get(ACTIVE_KEY, null); if(!accs.find(a => a.id === id)) id = accs[0].id;
  activeAccountId = id; LS.set(ACTIVE_KEY, id);
  let st = loadLocalFor(id);
  if(!st){ st = hydrateState({}); const a = accs.find(x => x.id === id); st.profile.codename = a.username.split('@')[0]; meta = { updatedAt: 0, serverUpdatedAt: 0, dirty: false, fresh: true }; }
  state = st;
  const go_ = () => { enterApp(); };
  if(lockCfg()){ afterUnlock = go_; locked = true; document.documentElement.classList.add('locked-boot'); renderLock(); }
  else go_();
}
boot();
