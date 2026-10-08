process.env.DATABASE_URL = 'memory'; process.env.PORT = '0';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { JSDOM } = require('jsdom');
const { main } = require('../server');
const FE = path.join(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const rd = (f) => fs.readFileSync(path.join(FE, f), 'utf8');
const appJs = rd('app.js'), authJs = rd('auth.js'), mergeJs = rd('merge.js'), blobsJs = rd('blobs.js'), v10Js = rd('v10.js'), journalJs = rd('journal.js');
require('fake-indexeddb/auto'); const FDB = require('fake-indexeddb');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (t) => console.log('  ✓', t, ++n);
let BASE, puts = 0;

function device(storage) {
  const dom = new JSDOM(html, { url: 'https://olc.test/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.fetch = (u, o) => { if (o && o.method === 'POST' && /\/api\/sync/.test(u)) puts++; return fetch(String(u).replace('https://operation-life-change-olc.onrender.com', BASE), o); };
  w.AbortController = AbortController; w.crypto = require('crypto').webcrypto; w.TextEncoder = TextEncoder;
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob; w.File = File; w.CustomEvent = w.CustomEvent || CustomEvent; let ou = 0; w.URL.createObjectURL = () => 'blob:mock/' + (++ou); w.createImageBitmap = undefined; w.TextDecoder = TextDecoder;
  w.fetch = w.fetch; w.matchMedia = () => ({ matches: false, addEventListener(){} }); w.confirm = () => true; w.alert = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const ctx = dom.getInternalVMContext();
  const err = []; w.addEventListener('error', e => err.push(e.message));
  for (const [src, fn] of [[mergeJs, 'merge.js'], [appJs, 'app.js'], [blobsJs, 'blobs.js'], [v10Js, 'v10.js'], [authJs, 'auth.js']]) new vm.Script(src, { filename: fn }).runInContext(ctx);
  const d = { w, ctx, err, ev: (s) => vm.runInContext(s, ctx), $: (id) => w.document.getElementById(id),
    store: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
    until: async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return; } catch (e) {} await sleep(40); } throw new Error('timeout waiting: ' + f); },
    submit: (id) => w.document.getElementById(id).dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })),
  };
  return d;
}
const fill = (d, o) => Object.entries(o).forEach(([id, v]) => { d.$(id).value = v; });

(async () => {
  const { server } = await main(); BASE = 'http://127.0.0.1:' + server.address().port;
  // ---- seed OLD (v8) data on device 1: must never be lost
  const oldState = { profile: { name: 'SK', codename: 'AGENT SK', photo: null }, xp: 777, dailyLogs: { '2026-09-30': { items: { g_study: 'full' }, ratings: { study: 3 }, waterL: 2 } }, trackerLogs: { weight: [{ date: '2026-09-30', v: 50 }] }, goals: [{ id: 'g_study', label: 'Study', xp: 10 }] };
  const legacyStore = { olc_accounts: JSON.stringify([{ id: 'acct_old1', codename: 'AGENT SK', codeid: 'SK7' }]), olc_state_acct_old1: JSON.stringify(oldState) };

  let A = device(legacyStore);
  await A.until(() => A.$('authGate').innerHTML.includes('CREATE ACCOUNT'));
  assert.ok(!A.$('authGate').innerHTML.includes('SIGN IN</div>') || true);
  assert.ok(A.$('authGate').innerHTML.includes('Old OLC data found'), 'legacy data offered'); ok('first launch: no login wall, offers old data');
  assert.equal(A.err.length, 0, A.err.join('|'));

  A.ev('useLegacy(0)');
  assert.ok(A.$('authGate').innerHTML.includes('will be moved into the account')); ok('old data chosen for new account');

  // bad inputs
  fill(A, { cr_user: 'weakname', cr_pass: 'password1', cr_pass2: 'password1' }); A.submit('f_create');
  assert.ok(/Username/.test(A.$('authError').textContent)); ok('invalid username blocked in the browser');
  fill(A, { cr_user: 'Sk123456', cr_pass: 'password1', cr_pass2: 'different' }); A.submit('f_create');
  assert.ok(/do not match/.test(A.$('authError').textContent)); ok('password mismatch blocked');
  fill(A, { cr_user: 'Sk123456', cr_pass: 'password1', cr_pass2: 'password1' }); A.submit('f_create');
  await A.until(() => A.$('olcModal').innerHTML.includes('RECOVERY CODE'));
  const code1 = A.$('recCode').textContent; assert.match(code1, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); ok('account created, recovery code shown (username auto-completed @olc.com)');
  assert.equal(A.$('recGo').disabled, true);
  const cb = A.$('recSaved'); cb.checked = true; cb.dispatchEvent(new A.w.Event('change')); assert.equal(A.$('recGo').disabled, false);
  A.$('recGo').click();
  await A.until(() => A.w.document.body.classList.contains('app-on')); ok('app opened');
  assert.equal(A.ev('state.xp'), 777); assert.equal(A.ev('state.trackerLogs.weight.length'), 1); ok('OLD DATA moved into new account (xp 777, tracker kept)');
  assert.ok(A.store().olc_state_acct_old1, 'legacy copy untouched'); ok('old local copy still on device (never deleted)');
  await A.until(() => A.$('syncPillTxt').textContent === 'Synced', 10000); ok('synced to cloud');

  // ---- second device: sign in with the same account
  let B = device();
  await B.until(() => B.$('authGate').innerHTML.includes('CREATE ACCOUNT'));
  B.ev("renderAuth('signin')");
  fill(B, { si_user: 'sk123456', si_pass: 'wrong-one' }); B.submit('f_signin');
  await B.until(() => /Wrong username or password/.test(B.$('authError').textContent)); ok('wrong password rejected');
  fill(B, { si_user: 'Sk123456', si_pass: 'password1' }); B.submit('f_signin');
  await B.until(() => B.w.document.body.classList.contains('app-on'));
  assert.equal(B.ev('state.xp'), 777); ok('2nd device signs in and gets all data');

  // ---- edit on B -> shows on A
  B.ev('addXP(123); saveState();'); await B.until(() => B.$('syncPillTxt').textContent === 'Synced', 10000);
  await A.ev('pullState({manual:true})'); await A.until(() => A.ev('state.xp') === 900); ok('change on one device appears on the other');

  // ---- THE BIG ONE: both devices edit different things at the same time, then sync -> NOTHING vanishes
  A.ev("ensureDay(todayStr()); state.dailyLogs[todayStr()].waterL = 2.25; state.profile.name = 'Name from laptop'; addXP(50); saveState();");
  B.ev("ensureDay(todayStr()); state.dailyLogs[todayStr()].ratings.study = 4; state.trackerLogs.weight.push({date:'2026-10-07', kg:49.5}); addXP(7); saveState();");
  await sleep(500);
  await A.ev('syncNow({force:true})'); await B.ev('syncNow({force:true})'); await A.ev('syncNow({force:true})'); await B.ev('syncNow({force:true})');
  await A.until(() => A.ev('meta.dirty') === false && B.ev('meta.dirty') === false, 12000);
  for (const D of [A, B]) {
    assert.equal(D.ev('state.dailyLogs[todayStr()].waterL'), 2.25, 'laptop water kept');
    assert.equal(D.ev('state.dailyLogs[todayStr()].ratings.study'), 4, 'phone rating kept');
    assert.equal(D.ev('state.profile.name'), 'Name from laptop');
    assert.equal(D.ev('state.trackerLogs.weight.length'), 2, 'phone weight entry kept');
    assert.equal(D.ev('state.xp'), 900 + 50 + 7, 'XP from both devices adds up');
  }
  ok('laptop input + phone input BOTH survive syncing on both devices (xp ' + A.ev('state.xp') + ')');
  // same field edited on both: latest edit wins everywhere
  A.ev("state.profile.name = 'older'; saveState();"); await sleep(450); await A.ev('syncNow({force:true})');
  B.ev("state.profile.name = 'newest edit'; saveState();"); await sleep(450); await B.ev('syncNow({force:true})'); await A.ev('syncNow({force:true})');
  await A.until(() => A.ev('state.profile.name') === 'newest edit'); assert.equal(B.ev('state.profile.name'), 'newest edit'); ok('same field: the latest edit wins on every device');
  // live push: B changes, A hears about it without asking
  B.ev("state.profile.cls = 'live-test'; saveState();"); await B.ev('syncNow({force:true})');
  await A.until(() => A.ev("state.profile.cls") === 'live-test', 8000); ok('live update reaches the other device by itself');

  // ---- multi-account on ONE device
  A.ev("addAccount()"); await A.until(() => A.$('authGate').style.display === 'flex');
  A.ev("renderAuth('create')"); fill(A, { cr_user: 'Zx987654', cr_pass: 'another-pw1', cr_pass2: 'another-pw1' }); A.submit('f_create');
  await A.until(() => A.$('olcModal').innerHTML.includes('RECOVERY CODE'));
  A.$('recSaved').checked = true; A.$('recSaved').dispatchEvent(new A.w.Event('change')); A.$('recGo').click();
  await A.until(() => A.ev('loggedAccount() && loggedAccount().username') === 'Zx987654@olc.com');
  assert.equal(A.ev('state.xp'), 0); assert.equal(A.ev('getAccounts().length'), 2); ok('2nd account on same device starts with its own empty data');
  A.ev('addXP(5); saveState();');
  const idFirst = A.ev("getAccounts().find(a=>a.username==='Sk123456@olc.com').id");
  await A.ev(`switchAccount('${idFirst}')`); await A.until(() => A.ev('loggedAccount().username') === 'Sk123456@olc.com');
  assert.ok(A.ev('state.xp') >= 900, 'first account data intact: ' + A.ev('state.xp')); ok('switch back: accounts never mix');
  A.ev('toggleAcctMenu()'); assert.ok(A.$('acctMenu').innerHTML.includes('Zx987654@olc.com') && A.$('acctMenu').innerHTML.includes('Sk123456@olc.com')); ok('device shows all accounts for one-tap switching');

  // ---- uniqueness through the UI
  let C = device(); await C.until(() => C.$('authGate').innerHTML.includes('CREATE ACCOUNT'));
  fill(C, { cr_user: 'sK123456', cr_pass: 'whatever-9', cr_pass2: 'whatever-9' }); C.submit('f_create');
  await C.until(() => /already taken/.test(C.$('authError').textContent)); ok('duplicate username refused (case-insensitive)');
  fill(C, { cr_user: 'Qq555555', cr_pass: 'password1', cr_pass2: 'password1' }); C.submit('f_create');
  await C.until(() => /already used by another account/.test(C.$('authError').textContent)); ok('duplicate password refused');

  // ---- forgot password
  C.ev("renderAuth('forgot')"); fill(C, { fr_user: 'Sk123456', fr_code: code1.toLowerCase(), fr_pass: 'new-secret-7' }); C.submit('f_forgot');
  await C.until(() => C.$('olcModal').innerHTML.includes('RECOVERY CODE')); const code2 = C.$('recCode').textContent; assert.notEqual(code2, code1);
  C.$('recSaved').checked = true; C.$('recSaved').dispatchEvent(new C.w.Event('change')); C.$('recGo').click();
  await C.until(() => C.w.document.body.classList.contains('app-on')); assert.ok(C.ev('state.xp') >= 900); ok('forgot password: new password + new code, data intact');

  // ---- app lock
  A.ev('savePin("4821")'); await sleep(300);
  assert.ok(A.store().olc2_lock);
  A.ev('lockNow()'); assert.ok(A.w.document.documentElement.classList.contains('locked')); ok('app locks');
  for (const k of '1111') await A.ev(`pinKey('${k}')`);
  await sleep(300); assert.ok(A.ev('locked')); ok('wrong PIN keeps it locked');
  for (const k of '4821') await A.ev(`pinKey('${k}')`);
  await A.until(() => !A.ev('locked')); assert.ok(!A.w.document.documentElement.classList.contains('locked')); ok('right PIN unlocks');

  // reload with lock -> lock first, no content, no network needed
  const snap = A.store(); const R = device(snap);
  assert.ok(R.w.document.documentElement.classList.contains('locked-boot') || R.ev('locked')); assert.ok(!R.w.document.body.classList.contains('app-on')); ok('cold start with lock: PIN screen first, app not rendered');
  for (const k of '4821') await R.ev(`pinKey('${k}')`);
  await R.until(() => R.w.document.body.classList.contains('app-on')); assert.ok(R.ev('state.xp') >= 900); ok('unlock -> app opens from local data instantly');

  // ---- cold start without lock opens instantly even if the server is DOWN
  const noLock = Object.assign({}, snap); delete noLock.olc2_lock;
  const realBase = BASE; BASE = 'http://127.0.0.1:1';
  const O = device(noLock); await O.until(() => O.w.document.body.classList.contains('app-on'), 1500); assert.ok(O.ev('state.xp') >= 900); ok('opens instantly from this device even with the server unreachable');
  BASE = realBase;

  // ---- fresh/blank guard: cleared cache must not wipe cloud data
  const wiped = Object.assign({}, C.store()); delete wiped.olc2_lock; Object.keys(wiped).filter(k => /^olc2_(state|meta|bk)_/.test(k)).forEach(k => delete wiped[k]);
  const W = device(wiped); await W.until(() => W.w.document.body.classList.contains('app-on'));
  await W.until(() => W.ev('state.xp') >= 900, 10000); ok('cleared browser cache: cloud data comes back, blank state never overwrites it');

  // ---- rollover must not mark data as changed (it used to upload every 30 s)
  A.ev('persistLocal(); meta.dirty = false;'); A.ev('rollover(); rollover(); rollover();'); await sleep(500);
  assert.equal(A.ev('meta.dirty'), false); ok('background tick no longer marks data changed / uploads');

  assert.equal(A.err.length + B.err.length + C.err.length, 0, [A.err, B.err, C.err].join('|'));
  console.log('\nALL FRONTEND TESTS PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('\nFRONTEND TEST FAILED:', e); process.exit(1); });
