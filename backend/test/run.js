process.env.DATABASE_URL = 'memory';
process.env.PORT = '0';
process.env.OLC_ADMIN_KEY = 'k';
const assert = require('assert');
const { main } = require('../server');

(async () => {
  const { server } = await main();
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (m, p, body, token) => {
    const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  let n = 0; const ok = (name) => console.log('  ✓', name, ++n);

  assert.equal((await call('GET', '/api/health')).body.ok, true); ok('health');

  // username/password rules
  for (const bad of ['short1A', 'alllower1', 'ALLUPPER1', 'NoDigitsX', 'Abcdef1!', 'Abcdefg12']) {
    const r = await call('POST', '/api/register', { username: bad, password: 'password1' });
    assert.equal(r.status, 400, bad + ' should be rejected: ' + JSON.stringify(r.body));
  }
  ok('invalid usernames rejected');
  assert.equal((await call('POST', '/api/register', { username: 'Abcdefg1', password: 'short' })).status, 400); ok('short password rejected');

  const a = await call('POST', '/api/register', { username: 'Abcdefg1', password: 'secret-One' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.user.username, 'Abcdefg1@olc.com');
  assert.match(a.body.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); ok('register + recovery code');

  // uniqueness
  let r = await call('POST', '/api/register', { username: 'aBCDEFG1@olc.com', password: 'different-1' });
  assert.equal(r.status, 409); assert.equal(r.body.field, 'username'); ok('username unique (case-insensitive)');
  r = await call('POST', '/api/register', { username: 'Abcdefg2', password: 'secret-One' });
  assert.equal(r.status, 409); assert.equal(r.body.field, 'password'); ok('password unique across accounts');
  r = await call('POST', '/api/register', { username: 'Abcdefg2', password: 'secret-One1' });
  assert.equal(r.status, 200); const b = r.body; ok('1 char different password is allowed');

  // login
  assert.equal((await call('POST', '/api/login', { username: 'Abcdefg1', password: 'wrong-pass' })).status, 401);
  const l = await call('POST', '/api/login', { username: 'abcdefg1@OLC.com', password: 'secret-One', device: 'Phone' });
  assert.equal(l.status, 200); const tokA2 = l.body.token; ok('login (case-insensitive username, 2nd device)');

  // ---- sync: field-by-field merge (the heart of v10) ----
  const M = require('../merge');
  const dev = (name, st) => { const o = { name, s: st ? JSON.parse(JSON.stringify(st)) : {}, v: 0 }; M.ensureMeta(o.s); o.snap = M.snapshot(o.s); return o; };
  let clock = Date.now();
  const edit = (d, fn) => { fn(d.s); const r = M.stamp(d.s, d.snap, ++clock); d.snap = r.snap; };
  const push = async (d, tok) => { const r = await call('POST', '/api/sync', { state: d.s, device: d.name }, tok); assert.equal(r.status, 200, JSON.stringify(r.body)); if (r.body.state) { d.s = M.merge(d.s, r.body.state).state; d.snap = M.snapshot(d.s); } d.v = r.body.v; return r.body; };
  const seed = { xpL: { m0: 120 }, dailyLogs: { '2026-10-01': { waterL: 2, items: {} } }, trackerLogs: { weight: [{ id: 'w1', date: '2026-10-01', kg: 50 }] }, profile: { name: 'SK' }, goals: [{ id: 'g1', label: 'Study', xp: 10 }] };
  const laptop = dev('laptop', seed), phone = dev('phone', seed);
  await push(laptop, a.body.token); ok('first sync stores the data');
  r = await call('GET', '/api/state', null, tokA2); assert.equal(r.body.state.xp, 120); ok('legacy read still works');
  r = await call('PUT', '/api/state', { state: base, baseUpdatedAt: 0 }, tokA2); assert.equal(r.status, 426); ok('old v9 app cannot overwrite (asked to update)');
  r = await call('POST', '/api/sync', { state: { profile: { name: 'old' } } }, tokA2); assert.equal(r.status, 426); ok('state without field stamps refused once stamped data exists');
  await push(phone, tokA2); ok('phone joins');
  edit(laptop, (s) => { s.dailyLogs['2026-10-01'].items.g1 = 'full'; s.dailyLogs['2026-10-01'].ratings = { study: 4 }; s.profile.name = 'Agent SK'; });
  await push(laptop, a.body.token);
  edit(phone, (s) => { s.dailyLogs['2026-10-01'].waterL = 3.5; s.trackerLogs.weight.push({ id: 'w2', date: '2026-10-02', kg: 51 }); s.xpL['d_phone'] = 15; });   // phone edits WITHOUT seeing the laptop's edit first
  const pr = await push(phone, tokA2);
  assert.ok(pr.state, 'phone is sent what the laptop did');
  assert.equal(phone.s.dailyLogs['2026-10-01'].items.g1, 'full'); assert.equal(phone.s.dailyLogs['2026-10-01'].waterL, 3.5); assert.equal(phone.s.profile.name, 'Agent SK');
  ok('laptop edit + phone edit BOTH survive (no vanishing)');
  edit(laptop, (s) => { s.xpL['d_laptop'] = 40; });
  await push(laptop, a.body.token);
  assert.equal(laptop.s.dailyLogs['2026-10-01'].waterL, 3.5); assert.equal(laptop.s.trackerLogs.weight.length, 2); assert.equal(laptop.s.xp, 175); ok('laptop receives the phone input; XP from both devices adds up (120+15+40)');
  // a fresh blank default day created later on the phone must NOT erase laptop's real values
  edit(phone, (s) => { s.dailyLogs['2026-10-05'] = { items: {}, waterL: 0, ratings: { study: 0 } }; });
  edit(laptop, (s) => { s.dailyLogs['2026-10-05'] = { items: { g1: 'full' }, waterL: 1, ratings: { study: 3 } }; });
  await push(laptop, a.body.token); await push(phone, tokA2);
  assert.equal(phone.s.dailyLogs['2026-10-05'].waterL, 1); assert.equal(phone.s.dailyLogs['2026-10-05'].ratings.study, 3); ok('empty auto-created day never erases real data');
  // latest edit wins on the same field
  edit(laptop, (s) => { s.profile.name = 'Laptop name'; }); edit(phone, (s) => { s.profile.name = 'Phone name (later)'; });
  await push(laptop, a.body.token); await push(phone, tokA2); await push(laptop, a.body.token);
  assert.equal(laptop.s.profile.name, 'Phone name (later)'); assert.equal(phone.s.profile.name, 'Phone name (later)'); ok('same field: the LATEST edit from any device wins');
  // deletion travels
  edit(phone, (s) => { s.trackerLogs.weight = s.trackerLogs.weight.filter((w) => w.id !== 'w1'); });
  await push(phone, tokA2); await push(laptop, a.body.token);
  assert.deepEqual(laptop.s.trackerLogs.weight.map((w) => w.id), ['w2']); ok('deleting on one device deletes on the other');
  r = await call('GET', '/api/sync?v=' + laptop.v, null, a.body.token); assert.equal(r.body.unchanged, true); ok('unchanged shortcut');
  r = await call('GET', '/api/sync?v=0', null, a.body.token); assert.ok(r.body.state && r.body.v > 3); ok('full pull');
  r = await call('GET', '/api/backups', null, a.body.token); ok('backups listing works (' + r.body.backups.length + ')');

  // ---- concurrent pushes from two devices at the same instant: nothing lost ----
  const d1 = dev('d1', laptop.s), d2 = dev('d2', laptop.s);
  edit(d1, (s) => { s.profile.codename = 'ONE'; s.goals.push({ id: 'g_d1', label: 'From d1', xp: 5 }); });
  edit(d2, (s) => { s.profile.age = '15'; s.goals.push({ id: 'g_d2', label: 'From d2', xp: 5 }); });
  await Promise.all([push(d1, a.body.token), push(d2, tokA2)]);
  await push(d1, a.body.token); await push(d2, tokA2);
  for (const d of [d1, d2]) { assert.equal(d.s.profile.codename, 'ONE'); assert.equal(d.s.profile.age, '15'); assert.deepEqual(d.s.goals.map((g) => g.id).sort(), ['g1', 'g_d1', 'g_d2']); }
  ok('two devices pushing at the same moment: both edits kept');

  // ---- live updates (server-sent events) ----
  const ac = new AbortController();
  const ev = await fetch(base + '/api/events?device=watcher', { headers: { Authorization: 'Bearer ' + tokA2 }, signal: ac.signal });
  assert.equal(ev.status, 200);
  const reader = ev.body.getReader(); let got = '';
  const readSome = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; got += Buffer.from(value).toString(); if (got.includes('"v":')) return; } })();
  await new Promise((r2) => setTimeout(r2, 150));
  edit(d1, (s) => { s.profile.cls = 'Ten'; }); await push(d1, a.body.token);
  await Promise.race([readSome, new Promise((_, rej) => setTimeout(() => rej(new Error('no live event')), 3000))]);
  assert.match(got, /"v":\d+/); ac.abort(); ok('live update pushed to the other device');

  // ---- file storage (images / PDFs) ----
  const bytes = Buffer.from('%PDF-1.4 hello olc ' + 'x'.repeat(3000));
  let pr2 = await fetch(base + '/api/blobs/b_test_pdf_001?m=application/pdf', { method: 'PUT', headers: { Authorization: 'Bearer ' + a.body.token, 'Content-Type': 'application/octet-stream' }, body: bytes });
  assert.equal(pr2.status, 200); ok('file upload');
  pr2 = await fetch(base + '/api/blobs/b_test_pdf_001', { headers: { Authorization: 'Bearer ' + tokA2 } });
  assert.equal(pr2.status, 200); assert.equal(pr2.headers.get('content-type'), 'application/pdf'); assert.equal(Buffer.from(await pr2.arrayBuffer()).toString().slice(0, 8), '%PDF-1.4'); ok('file download on another device');
  r = await call('POST', '/api/blobs/have', { ids: ['b_test_pdf_001', 'b_missing_0001'] }, a.body.token); assert.deepEqual(r.body.have, ['b_test_pdf_001']); ok('which files does the cloud already have');
  pr2 = await fetch(base + '/api/blobs/b_test_pdf_001', { headers: {} }); assert.equal(pr2.status, 401); ok('files need sign-in');

  // isolation
  r = await call('GET', '/api/sync?v=0', null, b.token); assert.equal(r.body.state, null); ok('accounts isolated');
  r = await fetch(base + '/api/blobs/b_test_pdf_001', { headers: { Authorization: 'Bearer ' + b.token } }); assert.equal(r.status, 200); ok('files are shared by content between accounts (so shared medals/divisions show their pictures)');
  r = await call('POST', '/api/blobs/have', { ids: ['b_test_pdf_001'] }, b.token); assert.deepEqual(r.body.have, ['b_test_pdf_001']); ok('other account sees the file as already stored');

  // recovery
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: 'AAAA-BBBB-CCCC', newPassword: 'brand-new-1' }); assert.equal(r.status, 401);
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: a.body.recoveryCode.toLowerCase(), newPassword: 'secret-One1' }); assert.equal(r.status, 409); ok('recovery cannot reuse another account password');
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: a.body.recoveryCode.toLowerCase(), newPassword: 'brand-new-1' });
  assert.equal(r.status, 200); assert.notEqual(r.body.recoveryCode, a.body.recoveryCode); assert.equal(r.body.state.xp, 175); ok('recover: new password, new code, data kept');
  assert.equal((await call('POST', '/api/login', { username: 'Abcdefg1', password: 'secret-One' })).status, 401);
  assert.equal((await call('POST', '/api/login', { username: 'Abcdefg1', password: 'brand-new-1' })).status, 200); ok('old password dead, new works');
  assert.equal((await call('GET', '/api/state', null, tokA2)).status, 401); ok('recovery signs out old sessions');

  // password change, sessions, avatar, verify
  const t = (await call('POST', '/api/login', { username: 'Abcdefg1', password: 'brand-new-1', device: 'Laptop' })).body.token;
  r = await call('POST', '/api/me/password', { oldPassword: 'brand-new-1', newPassword: 'secret-One1' }, t); assert.equal(r.status, 409);
  r = await call('POST', '/api/me/password', { oldPassword: 'brand-new-1', newPassword: 'another-pw-2' }, t); assert.equal(r.status, 200); ok('change password');
  assert.equal((await call('POST', '/api/me/verify', { password: 'another-pw-2' }, t)).status, 200);
  assert.equal((await call('POST', '/api/me/verify', { password: 'nope' }, t)).status, 401); ok('verify password');
  assert.equal((await call('PUT', '/api/me/avatar', { avatar: 'data:image/jpeg;base64,AAAA' }, t)).status, 200);
  assert.equal((await call('GET', '/api/me', null, t)).body.user.avatar, 'data:image/jpeg;base64,AAAA'); ok('avatar');
  r = await call('GET', '/api/sessions', null, t); assert.ok(r.body.sessions.some(s => s.current)); ok('sessions list');
  r = await call('POST', '/api/me/recovery', { password: 'another-pw-2' }, t); assert.ok(r.body.recoveryCode); ok('rotate recovery code');
  await call('POST', '/api/logout', null, t); assert.equal((await call('GET', '/api/me', null, t)).status, 401); ok('logout');

  // body-size limits (pg-mem can't store megabytes, so test the HTTP layer; real Postgres TEXT handles it)
  r = await call('POST', '/api/login', { username: 'Abcdefg1', password: 'x', junk: 'x'.repeat(8 * 1024 * 1024) }); assert.equal(r.status, 401); ok('8 MB request body accepted by server');
  r = await call('POST', '/api/login', { username: 'Abcdefg1', password: 'x', junk: 'x'.repeat(30 * 1024 * 1024) }); assert.equal(r.status, 413); assert.equal(r.body.code, 'too_large'); ok('30 MB rejected with a clear message');

  // ---- shared catalog ----
  const tA = (await call('POST', '/api/login', { username: 'Abcdefg1', password: 'another-pw-2', device: 'Catalog' })).body.token, tB = b.token; assert.ok(tA && tB);
  let T0 = Date.now();
  r = await call('POST', '/api/catalog', { items: [{ kind: 'medal', id: 'medal_one', at: ++T0, data: { name: 'Iron Will', target: 5, colors: ['#111', '#222', '#333'], timesEarned: 99, current: 4, secret: 'x' } }, { kind: 'division', id: 'div_one', at: ++T0, data: { division: 'D1', name: 'Alpha', colors: { primary: '#fff' }, reasonLog: [{ reason: 'private' }] } }, { kind: 'bogus', id: 'bad_one', at: T0, data: {} }] }, tA);
  assert.equal(r.status, 200); assert.equal(r.body.accepted.length, 2); assert.equal(r.body.rejected.length, 1); ok('catalog: account A shares a medal + a division (bad kind refused)');
  r = await call('GET', '/api/catalog?since=0', null, tB); assert.equal(r.body.items.length, 2);
  const med = r.body.items.find((x) => x.id === 'medal_one'); assert.equal(med.data.name, 'Iron Will'); assert.equal(med.data.timesEarned, undefined); assert.equal(med.data.current, undefined); assert.equal(med.data.secret, undefined);
  assert.equal(r.body.items.find((x) => x.id === 'div_one').data.reasonLog, undefined); ok('catalog: account B sees them; progress / private fields are never shared');
  const since = r.body.max;
  r = await call('GET', '/api/catalog?since=' + since, null, tB); assert.equal(r.body.items.length, 0); ok('catalog: incremental pull is empty when nothing changed');
  r = await call('POST', '/api/catalog', { items: [{ kind: 'medal', id: 'medal_one', at: ++T0, data: { name: 'Iron Will II', target: 6 } }] }, tB); assert.equal(r.body.accepted.length, 1);
  r = await call('POST', '/api/catalog', { items: [{ kind: 'medal', id: 'medal_one', at: T0 - 50, data: { name: 'stale edit' } }] }, tA); assert.equal(r.body.rejected[0].why, 'newer'); ok('catalog: latest edit wins, a stale edit is refused');
  r = await call('GET', '/api/catalog?since=' + since, null, tA); assert.equal(r.body.items.length, 1); assert.equal(r.body.items[0].data.name, 'Iron Will II'); ok('catalog: A receives B\'s edit');
  r = await call('POST', '/api/catalog', { deletes: [{ kind: 'division', id: 'div_one', at: ++T0 }] }, tA); assert.equal(r.body.accepted.length, 1);
  r = await call('GET', '/api/catalog?since=' + since, null, tB); assert.ok(r.body.items.some((x) => x.id === 'div_one' && x.deleted)); ok('catalog: deletion reaches every account');
  const ac2 = new AbortController(); const ev2 = await fetch(base + '/api/events?device=cat', { headers: { Authorization: 'Bearer ' + tB }, signal: ac2.signal }); const rd2 = ev2.body.getReader(); let got2 = '';
  const waitCat = (async () => { for (;;) { const { value, done } = await rd2.read(); if (done) return; got2 += Buffer.from(value).toString(); if (got2.includes('"cat":1')) return; } })();
  await new Promise((r2) => setTimeout(r2, 120)); await call('POST', '/api/catalog', { items: [{ kind: 'badge', id: 'badge_one', at: ++T0, data: { name: 'Marksman' } }] }, tA);
  await Promise.race([waitCat, new Promise((_, rej) => setTimeout(() => rej(new Error('no catalog live event')), 3000))]); ac2.abort(); ok('catalog: other accounts are told live');
  r = await call('POST', '/api/catalog', { items: [{ kind: 'medal', id: 'big_one_x', at: ++T0, data: { name: 'x', medalImg: 'A'.repeat(3.2 * 1024 * 1024) } }] }, tA); assert.equal(r.body.rejected[0].why, 'too large'); ok('catalog: oversized item refused');

  // ---- admin ----
  const adm = (m, p, body) => fetch(base + p, { method: m, headers: Object.assign({ 'x-admin-key': 'k' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
  assert.equal((await fetch(base + '/admin')).status, 200); assert.equal((await fetch(base + '/api/admin/overview')).status, 401); assert.equal((await fetch(base + '/api/admin/overview', { headers: { 'x-admin-key': 'bad' } })).status, 401); assert.equal((await fetch(base + '/api/admin/overview?key=k')).status, 401); ok('admin: page loads; API refuses missing / wrong key (key in the URL is not accepted)');
  r = await adm('GET', '/api/admin/overview'); assert.equal(r.status, 200); assert.ok(r.body.users >= 2 && r.body.catalog >= 2 && r.body.version === '4.0.0'); ok('admin: overview');
  r = await adm('GET', '/api/admin/users'); assert.ok(r.body.users.length >= 2 && r.body.users.every((u) => u.username && !('pass_hash' in u))); const uA = r.body.users.find((u) => /^abcdefg1@/i.test(u.username)) || r.body.users[0]; ok('admin: list of every account (no passwords exposed)');
  r = await adm('GET', '/api/admin/users/' + uA.id); assert.equal(r.status, 200); assert.ok(Array.isArray(r.body.sessions) && r.body.summary); ok('admin: account detail (devices, backups, summary)');
  r = await adm('GET', '/api/admin/users/' + uA.id + '/state'); assert.equal(r.status, 200); ok('admin: download an account\'s data');
  const reg = await adm('POST', '/api/admin/settings', { registration: 'closed' }); assert.equal(reg.body.registration, 'closed');
  r = await call('POST', '/api/register', { username: 'Zzzzzzz9@olc.com', password: 'Qw3rtyuz', device: 'x' }); assert.equal(r.status, 403); await adm('POST', '/api/admin/settings', { registration: 'open' }); ok('admin: closing sign-ups blocks new accounts, reopening works');
  r = await call('POST', '/api/register', { username: 'Dispos4b@olc.com', password: 'Zx8cvbnm', device: 'x' }); assert.equal(r.status, 200); const dispId = r.body.user.id;
  r = await adm('POST', '/api/admin/users/' + dispId + '/reset-password', {}); assert.equal(r.status, 200); const newPw = r.body.newPassword; assert.ok(newPw.length >= 8 && r.body.recoveryCode);
  r = await call('POST', '/api/login', { username: 'Dispos4b@olc.com', password: newPw, device: 'x' }); assert.equal(r.status, 200); ok('admin: reset password gives working new sign-in details');
  r = await adm('DELETE', '/api/admin/users/' + dispId, { confirm: 'wrong' }); assert.equal(r.status, 400);
  r = await adm('DELETE', '/api/admin/users/' + dispId, { confirm: 'dispos4b@olc.com' }); assert.equal(r.status, 200);
  r = await call('POST', '/api/login', { username: 'Dispos4b@olc.com', password: newPw, device: 'x' }); assert.equal(r.status, 401); ok('admin: delete needs the exact username, then the account is gone');
  r = await adm('DELETE', '/api/admin/catalog/medal/medal_one'); assert.equal(r.body.changed, 1); r = await call('GET', '/api/catalog?since=0', null, tB); assert.ok(r.body.items.find((x) => x.id === 'medal_one').deleted); ok('admin: remove a shared item for everyone');
  r = await adm('GET', '/api/admin/export'); assert.ok(r.body.accounts.length >= 2 && Array.isArray(r.body.catalog)); ok('admin: full server export');
  console.log('\nALL BACKEND TESTS PASSED (' + n + ')');
  server.close(); process.exit(0);
})().catch((e) => { console.error('\nTEST FAILED:', e); process.exit(1); });
