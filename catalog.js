/* ============================================================
   SHARED CATALOG — ranks, medals, badges and divisions are the same in EVERY account on this server.
   What stays per account: progress, achievements earned, times earned, which division is ON, its reason log.
   Latest edit wins. Items removed by one account disappear for all (earned Achievements stay as history).
   ============================================================ */
const CAT_SHARED = {
  medal: ['name','requirements','connection','connectionKey','target','colors','why','medalImg','ribbonImg','createdDate'],
  badge: ['name','requirements','connection','connectionKey','target','colors','why','badgeImg','createdDate'],
  division: ['division','name','logo','flag','colors','systemTheme','durationDays','start','end','mission','objective','books','createdAt'],
  rank: ['xp']
};
const CAT_LIST = { medal: 'customMedals', badge: 'customBadges', division: 'divisions' };
const RANK_ID = 'ranks_main';
let catBusy = false, catAgain = false;
const catKey = () => 'olc2_cat_' + activeAccountId;
function catStr(s){ let h = 5381; for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h) + ':' + s.length; }
function catPick(kind, it){ const o = {}; CAT_SHARED[kind].forEach(k => { if(it && it[k] !== undefined && it[k] !== null) o[k] = it[k]; }); return o; }
const catHash = (kind, it) => catStr(JSON.stringify(catPick(kind, it)));
function catLocal(kind){
  if(kind === 'rank') return Array.isArray(state.rankOverrides) ? [{ id: RANK_ID, xp: state.rankOverrides }] : [];
  return (state[CAT_LIST[kind]] || []).filter(x => x && x.id && !x.builtin);
}
function catNew(kind, id, data){
  if(kind === 'medal' || kind === 'badge'){
    const key = data.connectionKey || 'manual';
    let base; try{ base = key !== 'manual' ? trackedMetricValue(key) : undefined; }catch(e){}
    return Object.assign({ id, current: 0, timesEarned: 0, connectionBaseline: base }, data);
  }
  return Object.assign({ id, books: [], reasonLog: [] }, data);
}
function catApply(kind, r, store){
  const k = kind + ':' + r.id, kn = store.known[k];
  if(kind === 'rank'){
    if(r.deleted){ if(state.rankOverrides){ state.rankOverrides = null; return true; } return false; }
    if(Array.isArray(r.data && r.data.xp) && JSON.stringify(state.rankOverrides) !== JSON.stringify(r.data.xp)){ state.rankOverrides = r.data.xp.slice(); return true; }
    return false;
  }
  const list = state[CAT_LIST[kind]]; const i = list.findIndex(x => x.id === r.id); const cur = i >= 0 ? list[i] : null;
  if(r.deleted){
    if(cur){ list.splice(i, 1); if(kind === 'division' && state.activeDivisionId === r.id) state.activeDivisionId = null; return true; }
    return false;
  }
  if(!r.data) return false;
  if(!cur){ list.push(catNew(kind, r.id, r.data)); return true; }
  if(kn && catHash(kind, cur) !== kn.h) return false;            // this account has an unsent edit of its own — it is newer, so it wins and is pushed below
  const before = catHash(kind, cur), incoming = catStr(JSON.stringify(catPick(kind, r.data)));
  if(before === incoming) return false;
  CAT_SHARED[kind].forEach(f => { if(r.data[f] !== undefined) cur[f] = r.data[f]; else if(f !== 'books') delete cur[f]; });
  return true;
}
async function catSync(){
  if(typeof legacyServer !== 'undefined' && legacyServer) return;
  const acc = loggedAccount(); if(!acc || !acc.token || acc.expired || !state || navigator.onLine === false) return;
  if(catBusy){ catAgain = true; return; }
  catBusy = true;
  const id = acc.id;
  try{
    const store = LS.get(catKey(), null) || { since: 0, known: {} };
    let changed = false;
    const r = await api('GET', '/api/catalog?since=' + (store.since || 0), null, acc.token, { timeout: 30000 });
    if(activeAccountId !== id) return;
    if(r.status === 404){ return; }
    if(!r.ok) return;
    (r.data.items || []).forEach(it => {
      if(!CAT_SHARED[it.kind]) return;
      if(catApply(it.kind, it, store)) changed = true;
      const loc = catLocal(it.kind).find(x => x.id === it.id);
      store.known[it.kind + ':' + it.id] = it.deleted ? { at: it.at, del: 1 } : { at: it.at, h: loc ? catHash(it.kind, loc) : catStr(JSON.stringify(catPick(it.kind, it.data || {}))) };
    });
    if(typeof r.data.max === 'number') store.since = Math.max(store.since || 0, r.data.max);
    // push this account's own additions / edits / removals
    const items = [], deletes = [], seen = {};
    Object.keys(CAT_SHARED).forEach(kind => catLocal(kind).forEach(it => {
      const k = kind + ':' + it.id; seen[k] = 1; const h = catHash(kind, it), kn = store.known[k];
      if(!kn || kn.del || kn.h !== h){ if(kn && kn.del && catApplied(kn)) return; items.push({ kind, id: it.id, at: Date.now(), data: catPick(kind, it), h }); }
    }));
    Object.keys(store.known).forEach(k => { if(!seen[k] && !store.known[k].del){ const p = k.split(':'); deletes.push({ kind: p[0], id: p.slice(1).join(':'), at: Date.now() }); } });
    for(let o = 0; o < Math.max(items.length, deletes.length) && (items.length || deletes.length); o += 100){
      const body = { items: items.slice(o, o + 100).map(x => ({ kind: x.kind, id: x.id, at: x.at, data: x.data })), deletes: deletes.slice(o, o + 100) };
      const w = await api('POST', '/api/catalog', body, acc.token, { timeout: 60000 });
      if(activeAccountId !== id) return;
      if(!w.ok) break;
      const rej = {}; (w.data.rejected || []).forEach(x => { rej[x.kind + ':' + x.id] = x.why; });
      body.items.forEach((x, n) => { const k = x.kind + ':' + x.id; if(!rej[k]) store.known[k] = { at: x.at, h: items[o + n].h }; });
      body.deletes.forEach(x => { const k = x.kind + ':' + x.id; if(!rej[k]) store.known[k] = { at: x.at, del: 1 }; });
      store.since = 0;                                              // re-read once so our own server stamps are in sync (cheap, hashes match → no changes)
    }
    LS.set(catKey(), store);
    if(changed){
      try{ if(typeof applyDivisionTheme === 'function') applyDivisionTheme(); }catch(e){}
      saveState();
      if(typeof refreshUI === 'function'){ if(typeof uiBusy === 'function' && uiBusy()) pendingRender = true; else refreshUI(); }
    }
  }catch(e){ /* try again on the next sync */ }
  finally{ catBusy = false; if(catAgain){ catAgain = false; setTimeout(catSync, 300); } }
}
function catApplied(kn){ return false; }
