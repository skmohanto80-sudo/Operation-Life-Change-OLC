/* v10.3 tests: tracker dates, sync never blocked by pictures, never stuck on "Saving…", full browser storage never loses data */
process.env.DATABASE_URL = 'memory'; process.env.PORT = '0';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { JSDOM } = require('jsdom');
const { main } = require('../server');
const FE = path.join(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const rd = (f) => fs.readFileSync(path.join(FE, f), 'utf8');
require('fake-indexeddb/auto');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (t) => console.log('  ✓', t, ++n);
let BASE, posts = 0, hangBlobs = false, quota = 0;
const IDB = { indexedDB, IDBKeyRange };

function device(storage) {
  const dom = new JSDOM(html, { url: 'https://olc.test/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  const realLS = w.localStorage;
  if (quota) {            // a tiny "quick storage": writes that would go over the limit throw, exactly like a full browser
    const fake = { getItem: (k) => realLS.getItem(k), removeItem: (k) => realLS.removeItem(k), key: (i) => realLS.key(i), get length() { return realLS.length; },
      setItem(k, v) { let t = 0; for (let i = 0; i < realLS.length; i++) { const kk = realLS.key(i); if (kk !== k) t += kk.length + realLS.getItem(kk).length; } if (t + k.length + String(v).length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } realLS.setItem(k, v); } };
    Object.defineProperty(w, 'localStorage', { value: fake, configurable: true });
  }
  w.fetch = (u, o) => {
    if (o && o.method === 'POST' && /\/api\/sync/.test(u)) posts++;
    if (hangBlobs && /\/api\/blobs\/b_/.test(u) && o && o.method === 'PUT') return new Promise((_, rej) => { if (o.signal) o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    return fetch(String(u).replace('https://operation-life-change-olc-3.onrender.com', BASE), o);
  };
  w.AbortController = AbortController; w.crypto = require('crypto').webcrypto; w.TextEncoder = TextEncoder;
  w.indexedDB = IDB.indexedDB; w.IDBKeyRange = IDB.IDBKeyRange; w.Blob = Blob; w.File = File; w.CustomEvent = w.CustomEvent || CustomEvent; let ou = 0; w.URL.createObjectURL = () => 'blob:mock/' + (++ou); w.createImageBitmap = undefined; w.TextDecoder = TextDecoder;
  w.matchMedia = () => ({ matches: false, addEventListener(){} }); w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const ctx = dom.getInternalVMContext();
  const err = []; w.addEventListener('error', e => err.push(e.message));
  for (const f of ['merge.js', 'app.js', 'blobs.js', 'v10.js', 'v11.js', 'catalog.js', 'auth.js']) new vm.Script(rd(f), { filename: f }).runInContext(ctx);
  return { w, ctx, err, ev: (s) => vm.runInContext(s, ctx), $: (id) => w.document.getElementById(id),
    store: () => { const o = {}; for (let i = 0; i < realLS.length; i++) { const k = realLS.key(i); o[k] = realLS.getItem(k); } return o; },
    until: async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return; } catch (e) {} await sleep(40); } throw new Error('timeout waiting: ' + f); },
    submit: (id) => w.document.getElementById(id).dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })),
    pill: () => w.document.getElementById('syncPillTxt').textContent, toast: () => w.document.getElementById('toast').textContent };
}
const fill = (d, o) => Object.entries(o).forEach(([id, v]) => { d.$(id).value = v; });
async function signup(user, pass) {
  const A = device(); await A.until(() => A.$('authGate').innerHTML.includes('CREATE ACCOUNT'));
  fill(A, { cr_user: user, cr_pass: pass, cr_pass2: pass }); A.submit('f_create');
  await A.until(() => A.$('olcModal').innerHTML.includes('RECOVERY CODE'));
  A.$('recSaved').checked = true; A.$('recSaved').dispatchEvent(new A.w.Event('change')); A.$('recGo').click();
  await A.until(() => A.w.document.body.classList.contains('app-on')); await A.until(() => A.pill() === 'Synced', 10000);
  return A;
}
const dayStr = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

(async () => {
  const { server } = await main(); BASE = 'http://127.0.0.1:' + server.address().port;
  const A = await signup('Tk123456', 'password1');

  // ---------------- 1. tracker: past dates are accepted and counted ----------------
  A.ev("go('trackers')");
  for (const id of ['sl_date', 'sd_date', 'ex_date']) assert.ok(A.$(id), id + ' date box exists'); ok('Sleep, Study and Exercise forms now have a Date box');
  const d3 = dayStr(3), d5 = dayStr(5), xp0 = A.ev('state.xp');
  fill(A, { sl_date: d3, sl_bed: '22:30', sl_wake: '06:00' }); A.ev('saveSleepLog()');
  assert.equal(A.ev(`state.trackerLogs.sleep.filter(e=>e.date==='${d3}').length`), 1); assert.equal(A.ev(`sleepOn('${d3}')`), 7.5); ok('sleep for 3 days ago saved on THAT day (7.5 h)');
  assert.ok(/Sleep saved/.test(A.toast())); ok('a clear "saved" message is shown');
  assert.equal(A.$('sl_date').value, d3); ok('date stays on the chosen day so several past nights can be added quickly');
  fill(A, { sd_date: d5, sd_hours: '2.5', sd_topic: 'Past paper' }); A.ev('saveStudyLog()');
  assert.equal(A.ev(`studyOn('${d5}')`), 2.5); assert.equal(A.ev('state.xp'), xp0 + 25); ok('study 5 days ago counted on that day, +25 XP');
  fill(A, { ex_date: d5, ex_name: 'Push-ups', ex_amount: '30', ex_duration: '15' }); A.ev('saveExerciseLog()');
  assert.equal(A.ev(`exerciseOn('${d5}')`), 1); ok('exercise 5 days ago counted on that day');
  assert.equal(A.ev(`state.trackerLogs.study.every(e=>typeof e.id==='string')`), true); ok('every new entry has an id (safe to merge between devices)');
  // wrong input explains itself instead of doing nothing
  fill(A, { sd_hours: '' }); A.ev('saveStudyLog()'); assert.ok(/hours/.test(A.toast())); ok('empty hours: tells you what is missing');
  fill(A, { sl_bed: '', sl_wake: '' }); A.ev('saveSleepLog()'); assert.ok(/bed time/.test(A.toast())); ok('missing bed/wake time: tells you what is missing');
  // editing an entry can move it to another date
  const sid = A.ev(`state.trackerLogs.study.find(e=>e.date==='${d5}').id`);
  A.ev(`startEditEntry('study','${sid}')`); assert.equal(A.$('sd_date').value, d5);
  const d7 = dayStr(7); fill(A, { sd_date: d7, sd_hours: '3' }); A.ev('saveStudyLog()');
  assert.equal(A.ev(`studyOn('${d7}')`), 3); assert.equal(A.ev(`studyOn('${d5}')`), 0); assert.equal(A.ev('state.xp'), xp0 + 30); ok('edit: entry moves to the new date, XP adjusts (+30 total)');
  // summary + history see old days
  A.ev("go('trackers')"); assert.ok(/h this week|h total/.test(A.$('mainContent').innerHTML)); ok('tracker summary cards still render');
  await A.until(() => A.pill() === 'Synced', 10000); ok('…and everything synced green');

  // ---------------- 2. a hanging picture upload can never hold the light on "Saving…" ----------------
  hangBlobs = true;
  const f = new A.w.File([new Uint8Array(200000).map((_, i) => i % 251)], 'big.jpg', { type: 'image/jpeg' });
  await A.ev('Blobs').put(f, 'image/jpeg');
  A.ev("state.profile.name='Edited while upload hangs'; saveState();");
  const t0 = Date.now(); await A.until(() => A.pill() === 'Synced', 12000);
  assert.ok(Date.now() - t0 < 9000, 'synced in ' + (Date.now() - t0)); ok('picture upload hangs → data still reaches the cloud and the light turns green (' + (Date.now() - t0) + ' ms)');
  hangBlobs = false;

  // ---------------- 3. sign-in lost: pill must not stay on "Saving…" ----------------
  A.ev("patchAccount(activeAccountId,{expired:true}); state.profile.name='x1'; saveState();"); await sleep(1500);
  assert.equal(A.pill(), 'Sign in again'); ok('expired sign-in shows "Sign in again", not an endless "Saving…"');
  A.ev("patchAccount(activeAccountId,{expired:false});");

  // ---------------- 4. stuck request watchdog ----------------
  A.ev("syncing = true; syncStartedAt = Date.now() - 200000;"); A.ev("state.profile.name='after hang'; saveState();");
  await A.until(() => A.pill() === 'Synced' && A.ev('meta.dirty') === false, 12000); ok('a sync attempt that hung is abandoned and a new one starts');

  // ---------------- 5. nothing changes but data keeps flagging itself → stops after a few rounds ----------------
  A.ev("(window.__orig = applyRemote); applyRemote = function(){ meta.dirty = true; meta.seq++; return true; };");
  A.ev("state.profile.name='loop test'; saveState();"); const p0 = posts;
  await sleep(6000); const used = posts - p0; A.ev("applyRemote = window.__orig;");
  await A.until(() => A.pill() === 'Synced' || A.ev('meta.dirty') === false, 8000);
  assert.ok(used <= 8, 'rounds: ' + used); ok('endless re-saving is cut off after a few rounds (' + used + ' uploads), not forever');

  // ---------------- 6. quick storage full: data is kept, nothing lost, space is made ----------------
  await A.until(() => A.pill() === 'Synced', 10000);
  const id = A.ev('activeAccountId');
  // fill the quick storage with saved copies from an older version (this is what used to fill it up)
  const bigBk = JSON.stringify([{ label: 'old', at: Date.now(), data: { filler: 'x'.repeat(250000) } }]);
  A.w.localStorage.setItem('olc2_bk_' + id, bigBk);
  const used0 = Object.values(A.store()).reduce((a, v) => a + v.length, 0);
  A.ev('freeLocalSpace()'); await A.until(() => !A.store()['olc2_bk_' + id], 5000);
  const used1 = Object.values(A.store()).reduce((a, v) => a + v.length, 0);
  assert.ok(used1 < used0 - 200000); ok('"Free up space" moved old saved copies out of quick storage (' + Math.round((used0 - used1) / 1024) + ' KB freed)');
  const kept = await A.ev('getBackups(activeAccountId)'); assert.ok(kept.some(b => b.label === 'old')); ok('…and they are still available under Saved copies (nothing deleted)');

  const snapBefore = A.store();
  quota = Object.values(snapBefore).reduce((a, v) => a + v.length, 0) + 20000;     // almost no room left
  const B = device(snapBefore);                                                     // the same browser, reopened, with a nearly full quick storage
  await B.until(() => B.w.document.body.classList.contains('app-on'));
  const big = 'y'.repeat(60000);
  B.ev(`state.trackerLogs.study.push({id:'t_full_1',date:'${dayStr(2)}',hours:4,subject:'ICT',topic:'${big}',sessions:1}); addXP(40); saveState();`);
  await sleep(1200);
  assert.ok(await B.ev("Vault.get('state:'+activeAccountId)").then(v => !!(v && v.state)) || B.store()['olc2_state_' + id].includes('t_full_1')); ok('storage full: the new entry is kept in big storage instead of being lost');
  await B.until(() => B.pill() === 'Synced', 10000); ok('…and it still syncs to the cloud');
  // reopen with the same (full) storage but WITHOUT the cloud: the entry must still be there
  const full = B.store(); const real = BASE; BASE = 'http://127.0.0.1:1';
  const C = device(full); await C.until(() => C.w.document.body.classList.contains('app-on'));
  await C.until(() => C.ev("state.trackerLogs.study.some(e=>e.id==='t_full_1')"), 6000); BASE = real;
  ok('reopened offline with full storage: the entry is still there (merged back from big storage)');
  quota = 0;

  // ---------------- 7. old data keeps working ----------------
  assert.equal(A.err.length, 0, A.err.join('|')); ok('no script errors');
  console.log('\nALL v10.3 TESTS PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
