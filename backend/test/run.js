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

  // state: create, conflict, blank guard, backup
  const big = { xp: 120, dailyLogs: { '2026-10-01': { waterL: 2 } }, trackerLogs: { weight: [{ date: '2026-10-01', v: 50 }] }, profile: { name: 'SK' } };
  r = await call('PUT', '/api/state', { state: big, baseUpdatedAt: 0 }, a.body.token); assert.equal(r.status, 200);
  let stamp = r.body.updatedAt; ok('first state save');
  r = await call('GET', '/api/state', null, tokA2); assert.equal(r.body.state.xp, 120); ok('2nd device sees data');
  r = await call('GET', '/api/state?since=' + stamp, null, tokA2); assert.equal(r.body.unchanged, true); ok('unchanged shortcut');
  r = await call('PUT', '/api/state', { state: { ...big, xp: 150 }, baseUpdatedAt: stamp }, tokA2); assert.equal(r.status, 200); const stamp2 = r.body.updatedAt;
  r = await call('PUT', '/api/state', { state: { ...big, xp: 999 }, baseUpdatedAt: stamp }, a.body.token);
  assert.equal(r.status, 409); assert.equal(r.body.code, 'conflict'); assert.equal(r.body.state.xp, 150); ok('stale write rejected with server copy');
  r = await call('PUT', '/api/state', { state: { xp: 0, dailyLogs: {}, trackerLogs: {} }, baseUpdatedAt: stamp2 }, a.body.token);
  assert.equal(r.status, 409); assert.equal(r.body.code, 'blank'); ok('blank state cannot erase data');
  r = await call('GET', '/api/state', null, a.body.token); assert.equal(r.body.state.xp, 150); ok('data intact');
  r = await call('GET', '/api/backups', null, a.body.token); assert.ok(r.body.backups.length >= 1); const bk = r.body.backups[0].id; ok('server backup exists');
  r = await call('POST', '/api/backups/' + bk + '/restore', null, a.body.token); assert.equal(r.body.state.xp, 120); ok('restore backup');

  r = await call('PUT', '/api/state', { state: { xp: 0, dailyLogs: { '2026-10-01': { items: {}, ratings: { study: 0 }, wokeOnTime: false, waterL: 0, screen: { totalMin: 0, devices: [] }, planner: { morning: '' }, eod: { well: '' } } }, trackerLogs: { weight: [] } }, baseUpdatedAt: (await call('GET', '/api/state', null, a.body.token)).body.updatedAt }, a.body.token);
  assert.equal(r.status, 409); assert.equal(r.body.code, 'blank'); ok('blank state with an empty auto-created day cannot erase data');

  // isolation
  r = await call('GET', '/api/state', null, b.token); assert.equal(r.body.state, null); ok('accounts isolated');

  // recovery
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: 'AAAA-BBBB-CCCC', newPassword: 'brand-new-1' }); assert.equal(r.status, 401);
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: a.body.recoveryCode.toLowerCase(), newPassword: 'secret-One1' }); assert.equal(r.status, 409); ok('recovery cannot reuse another account password');
  r = await call('POST', '/api/recover', { username: 'Abcdefg1', recoveryCode: a.body.recoveryCode.toLowerCase(), newPassword: 'brand-new-1' });
  assert.equal(r.status, 200); assert.notEqual(r.body.recoveryCode, a.body.recoveryCode); assert.equal(r.body.state.xp, 120); ok('recover: new password, new code, data kept');
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

  // admin
  const ad = await fetch(base + '/admin?key=k'); assert.equal(ad.status, 200); assert.equal((await fetch(base + '/admin?key=bad')).status, 401); ok('admin viewer (key protected)');
  console.log('\nALL BACKEND TESTS PASSED (' + n + ')');
  server.close(); process.exit(0);
})().catch((e) => { console.error('\nTEST FAILED:', e); process.exit(1); });
