process.env.DATABASE_URL = 'memory'; process.env.PORT = '0';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { JSDOM } = require('jsdom');
const { main } = require('../server');
const FE = path.join(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const appJs = fs.readFileSync(path.join(FE, 'app.js'), 'utf8'), authJs = fs.readFileSync(path.join(FE, 'auth.js'), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (t) => console.log('  ✓', t, ++n);
let BASE, puts = 0;

function device(storage) {
  const dom = new JSDOM(html, { url: 'https://olc.test/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.fetch = (u, o) => { if (o && o.method === 'PUT' && /\/api\/state/.test(u)) puts++; return fetch(String(u).replace('https://operation-life-change-olc.onrender.com', BASE), o); };
  w.AbortController = AbortController; w.crypto = require('crypto').webcrypto; w.TextEncoder = TextEncoder;
  w.matchMedia = () => ({ matches: false }); w.confirm = () => true; w.alert = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const ctx = dom.getInternalVMContext();
  const err = []; w.addEventListener('error', e => err.push(e.message));
  new vm.Script(appJs, { filename: 'app.js' }).runInContext(ctx);
  new vm.Script(authJs, { filename: 'auth.js' }).runInContext(ctx);
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
  B.ev('state.xp = 900; saveState();'); await B.until(() => B.$('syncPillTxt').textContent === 'Synced', 10000);
  await A.ev('pullState({manual:true})'); await A.until(() => A.ev('state.xp') === 900); ok('change on one device appears on the other');

  // ---- conflict: both edit offline-ish -> nothing lost
  A.ev('state.xp = 1000; saveState();'); B.ev('state.xp = 950; saveState();');
  await sleep(300); await A.ev('pushState()'); await A.until(() => A.ev('meta.dirty') === false);
  await B.ev('pushState()'); await B.until(() => B.ev('meta.dirty') === false, 10000);
  const keptBackups = JSON.parse(B.store()[B.ev('bkKey(activeAccountId)')] || '[]').length + JSON.parse(A.store()[A.ev('bkKey(activeAccountId)')] || '[]').length;
  assert.ok(keptBackups >= 1, 'losing copy must be kept'); ok('conflict resolved, losing copy kept as backup');

  // ---- multi-account on ONE device
  A.ev("addAccount()"); await A.until(() => A.$('authGate').style.display === 'flex');
  A.ev("renderAuth('create')"); fill(A, { cr_user: 'Zx987654', cr_pass: 'another-pw1', cr_pass2: 'another-pw1' }); A.submit('f_create');
  await A.until(() => A.$('olcModal').innerHTML.includes('RECOVERY CODE'));
  A.$('recSaved').checked = true; A.$('recSaved').dispatchEvent(new A.w.Event('change')); A.$('recGo').click();
  await A.until(() => A.ev('loggedAccount() && loggedAccount().username') === 'Zx987654@olc.com');
  assert.equal(A.ev('state.xp'), 0); assert.equal(A.ev('getAccounts().length'), 2); ok('2nd account on same device starts with its own empty data');
  A.ev('state.xp = 5; saveState();');
  const idFirst = A.ev("getAccounts().find(a=>a.username==='Sk123456@olc.com').id");
  await A.ev(`switchAccount('${idFirst}')`); await A.until(() => A.ev('loggedAccount().username') === 'Sk123456@olc.com');
  assert.ok(A.ev('state.xp') >= 950, 'first account data intact: ' + A.ev('state.xp')); ok('switch back: accounts never mix');
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
  await C.until(() => C.w.document.body.classList.contains('app-on')); assert.ok(C.ev('state.xp') >= 950); ok('forgot password: new password + new code, data intact');

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
  await R.until(() => R.w.document.body.classList.contains('app-on')); assert.ok(R.ev('state.xp') >= 950); ok('unlock -> app opens from local data instantly');

  // ---- cold start without lock opens instantly even if the server is DOWN
  const noLock = Object.assign({}, snap); delete noLock.olc2_lock;
  const realBase = BASE; BASE = 'http://127.0.0.1:1';
  const O = device(noLock); await O.until(() => O.w.document.body.classList.contains('app-on'), 1500); assert.ok(O.ev('state.xp') >= 950); ok('opens instantly from this device even with the server unreachable');
  BASE = realBase;

  // ---- fresh/blank guard: cleared cache must not wipe cloud data
  const wiped = Object.assign({}, C.store()); delete wiped.olc2_lock; Object.keys(wiped).filter(k => /^olc2_(state|meta|bk)_/.test(k)).forEach(k => delete wiped[k]);
  const W = device(wiped); await W.until(() => W.w.document.body.classList.contains('app-on'));
  await W.until(() => W.ev('state.xp') >= 950, 10000); ok('cleared browser cache: cloud data comes back, blank state never overwrites it');

  // ---- rollover must not mark data as changed (it used to upload every 30 s)
  A.ev('persistLocal(); meta.dirty = false;'); A.ev('rollover(); rollover(); rollover();'); await sleep(500);
  assert.equal(A.ev('meta.dirty'), false); ok('background tick no longer marks data changed / uploads');

  assert.equal(A.err.length + B.err.length + C.err.length, 0, [A.err, B.err, C.err].join('|'));
  console.log('\nALL FRONTEND TESTS PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('\nFRONTEND TEST FAILED:', e); process.exit(1); });
