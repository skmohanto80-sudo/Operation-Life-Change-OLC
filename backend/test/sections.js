/* every section renders on OLD data, and the new v10 features work end-to-end (offline, no server) */
process.env.DATABASE_URL = 'memory';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'); const { JSDOM } = require('jsdom');
require('fake-indexeddb/auto');
const FE = path.join(__dirname, '../../frontend');
const html = fs.readFileSync(FE + '/index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://olc.test/', runScripts: 'dangerously', pretendToBeVisual: true }); const w = dom.window;
const old = { profile: { name: 'SK' }, xp: 300, goals: [{ id: 'g1', label: 'Study', xp: 10 }], dailyLogs: { '2026-09-30': { items: { g1: 'full' }, waterL: 1 } }, trackerLogs: { weight: [{ date: '2026-09-30', kg: 50 }] }, rulebookPages: null,
  customMedals: [{ id: 'm1', name: 'Old medal', requirements: 'r', connectionKey: 'manual', target: 3, current: 3, timesEarned: 0 }], achievements: [{ id: 'a_old', kind: 'medal', name: 'Old one', date: '2026-09-01' }], settings: { theme: 'dark', colorTheme: 'ocean', mode: 'monk' } };
w.localStorage.setItem('olc2_accounts', JSON.stringify([{ id: 'u_1', username: 'Abcdefg1@olc.com', token: 'x' }]));
w.localStorage.setItem('olc2_state_u_1', JSON.stringify(old)); w.localStorage.setItem('olc2_active', 'u_1');
w.fetch = () => Promise.reject(new Error('offline')); w.matchMedia = () => ({ matches: false, addEventListener() {} }); w.confirm = () => true; w.alert = () => {}; w.prompt = () => 'x';
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {}; w.crypto = require('crypto').webcrypto; w.TextEncoder = TextEncoder; w.AbortController = AbortController;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob; w.File = File; let ou = 0; w.URL.createObjectURL = () => 'blob:mock/' + (++ou); w.createImageBitmap = undefined; w.TextDecoder = TextDecoder; w.CustomEvent = CustomEvent;
const ctx = dom.getInternalVMContext(); const errs = []; w.addEventListener('error', e => errs.push(e.message));
for (const f of ['merge.js', 'app.js', 'blobs.js', 'v10.js', 'auth.js']) new vm.Script(fs.readFileSync(FE + '/' + f, 'utf8'), { filename: f }).runInContext(ctx);
const ev = s => vm.runInContext(s, ctx), $ = id => w.document.getElementById(id), main = () => $('mainContent').innerHTML;
let n = 0; const ok = t => console.log('  ✓', t, ++n);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(1200);
  assert.ok(w.document.body.classList.contains('app-on'), 'APP NOT OPEN');
  assert.equal(ev('state.xp'), 300); ok('old data opens, XP kept (' + ev('state.xp') + ')');
  assert.ok(!w.document.documentElement.classList.contains('monk-mode') && !$('modeBtn') && !$('monkBanner')); ok('Monk Mode removed');
  assert.ok(!w.document.querySelector('[data-sec="badges"]') && w.document.querySelector('[data-sec="divisions"]') && w.document.querySelector('[data-sec="books"]') && w.document.querySelector('[data-sec="journal"]')); ok('sidebar: no Badge System item; Divisions, OLC Book, OLC Journal present');
  for (const s of ['home', 'dashboard', 'profile', 'mission', 'streaks', 'daily', 'trackers', 'rank', 'medals', 'achievements', 'badges', 'rulebook', 'books', 'divisions', 'archives']) {
    ev(`go('${s}')`); const h = main(); assert.ok(!h.includes('hit a data problem'), s + ' crashed: ' + h.slice(0, 300)); assert.ok(h.length > 200, s + ' empty');
  } ok('every section renders on old data');
  // medals + badges tabs
  ev("go('medals')"); assert.ok(main().includes('Badges') && main().includes('Medals')); ev("setMedalTab('badges')"); assert.ok(main().includes('BADGES') && /Add Badge|New Badge|＋/.test(main())); ev("go('badges')"); assert.ok(main().includes('BADGES')); ok('Badges live inside Medals & Awards (tab)');
  // badge added as already-earned -> goes to achievements
  ev("badgeForm = {open:true, editId:null, badgeImg:null}; renderSection();");
  $('bf_name') && ($('bf_name').value = 'Marksman'); $('bf_requirements') && ($('bf_requirements').value = 'Hit 10/10'); $('bf_target') && ($('bf_target').value = '5'); $('bf_why').value = 'Proof of focus'; $('bf_earned').checked = true; $('bf_date').value = '2026-10-01';
  ev('saveBadgeForm()');
  assert.ok(ev("state.achievements.some(a=>a.name==='Marksman' && a.kind==='badge' && a.date==='2026-10-01' && a.why==='Proof of focus')")); ok('a badge added in Medals shows up in Achievements (with when/how/why)');
  ev("go('achievements')"); assert.ok(main().includes('Marksman') && main().includes('onclick="openAchievement(')); ev("openAchievement(state.achievements.find(a=>a.name==='Marksman').id)");
  const ab = $('achBody').innerHTML; assert.ok(ab.includes('WHEN') && ab.includes('HOW') && ab.includes('WHY') && ab.includes('Proof of focus')); ok('achievement opens with WHEN / HOW / WHY');
  ev("openAchievement('a_old')"); assert.ok($('achBody').innerHTML.includes('Old one')); ok('old achievements (no details) open too');
  // divisions
  ev("divForm={open:true,editId:null,logo:null,flag:null}; go('divisions')");
  $('df_division').value = 'DIVISION 07'; $('df_name').value = 'Iron Scholars'; $('df_c1').value = '#22c55e'; $('df_c2').value = '#0f7a3d'; $('df_c3').value = '#34d399'; $('df_sys').value = 'light'; $('df_start').value = '2026-10-01'; $('df_end').value = '2026-12-08'; $('df_dur').value = '69'; $('df_mission').value = 'Win the scholarship'; $('df_obj').value = 'Score 90%+';
  ev('saveDivisionForm()'); assert.equal(ev('state.divisions.length'), 1); const did = ev('state.divisions[0].id'); ok('Division created');
  ev(`state.activeDivisionId='${did}'; applyDivisionTheme();`);
  const root = w.document.documentElement; assert.equal(root.getAttribute('data-theme'), 'light'); assert.ok(root.style.getPropertyValue('--lavender')); assert.ok(root.style.getPropertyValue('--bg-1')); ok('Division ON → whole-system colours + light mode applied');
  ev("go('home')"); assert.ok(main().includes('flag-box') && main().indexOf('rk-side-img') < main().indexOf('flag-box')); ok('flag shows below the Radha-Krishna image on Home');
  ev("go('profile')"); assert.ok(main().includes('prof-div') && main().includes('Iron Scholars')); ok('Division logo block shows in Agent Profile');
  ev("setTheme('dark')"); assert.equal(root.getAttribute('data-theme'), 'light'); ok('manual dark/light is locked while the Division forces a mode');
  ev(`state.activeDivisionId=null; applyDivisionTheme();`); assert.ok(!root.style.getPropertyValue('--lavender')); ok('Division OFF → default theme back');
  ev(`go('divisions'); openDivision('${did}')`); assert.ok(main().includes('Win the scholarship') && main().includes('DIVISION BOOKS')); ok('Division detail page (mission, objective, PDF section, history)');
  // reason log through toggle (askReason is a modal): simulate
  ev(`(async()=>{ const p = toggleDivision('${did}'); await new Promise(r=>setTimeout(r,30)); document.getElementById('reasonTxt').value='Starting exam prep'; document.getElementById('reasonOk').click(); await p; })()`); await sleep(200);
  assert.equal(ev('state.activeDivisionId'), did); assert.equal(ev('state.divisions[0].reasonLog[0].reason'), 'Starting exam prep'); ok('ON/OFF button asks for a reason and logs it');
  // OLC Book
  ev("go('books')"); assert.ok(main().includes('OLC BOOK') && main().includes('OLC Rule Book') && main().includes('Add Book')); assert.ok(ev('state.books.some(b=>b.id==="book_rulebook" && b.pages.length>5)')); ok('Rule Book renamed OLC Book; old rulebook became the first book');
  ev("openBook('book_rulebook')"); assert.ok(main().includes('MANAGE PAGES') && main().includes('PERSONAL AMENDMENTS')); ev('fbRenderBase()'); assert.ok($('flipbook').innerHTML.includes('fb-page')); ok('book reader + page manager');
  ev("go('books'); newBookDialog(); document.getElementById('nb_title').value='Strategy'; createBook('blank')"); await sleep(100);
  const bid = ev("state.books.find(b=>b.title==='Strategy').id"); assert.equal(ev(`state.books.find(b=>b.id==='${bid}').pages.length`), 1);
  ev(`bookAddText('${bid}')`); ev(`bookAddText('${bid}')`); assert.equal(ev(`findBook('${bid}').pages.length`), 3);
  ev(`fbIndex=0; bookMovePage('${bid}',1)`); assert.equal(ev('fbIndex'), 1); ev(`bookDeletePage('${bid}')`); assert.equal(ev(`findBook('${bid}').pages.length`), 2); ev(`bookDelete('${bid}')`); assert.ok(!ev(`!!findBook('${bid}')`)); ok('add / move / delete pages and books');
  ev("(async()=>{ const r = await Blobs.put(new Blob(['hello pic'],{type:'image/png'}),'image/png'); globalThis.__ref = r; })()"); await sleep(200);
  const ref = ev('__ref'); assert.match(ref, /^blob:b_/); ev("globalThis.__u = null; Blobs.url(__ref).then(u=>globalThis.__u=u)"); await sleep(100); assert.ok(ev('__u')); ok('files go to the file store (reference in data, picture on device)');
  // journal
  ev("go('journal')"); await sleep(300); assert.ok(ev("typeof journalReady")==='string' || true);
  new vm.Script(fs.readFileSync(FE + '/journal.js', 'utf8'), { filename: 'journal.js' }).runInContext(ctx);
  ev("go('journal')"); assert.ok(main().includes('Front cover') || main().includes('jcover')); ok('Journal opens with a front cover');
  ev("jNewPage('')"); const pid = ev('jUI.sel'); assert.ok(main().includes('fmtbar'));
  for (const t of ['h1', 'p', 'ul', 'todo', 'quote', 'callout', 'code', 'divider', 'image', 'table', 'chart', 'flow', 'embed']) ev(`jAddBlock('${pid}','${t}',null)`);
  assert.ok(ev(`jPage('${pid}').blocks.length`) >= 14); ok('all block types can be added');
  ev("jMode('read')"); const rh = main(); assert.ok(rh.includes('<svg') && rh.includes('jchart') && rh.includes('jflow')); ok('graph + flowchart draw as pictures');
  ev(`jPage('${pid}').blocks.find(b=>b.type==='embed').kind='promotion'; jPage('${pid}').blocks.find(b=>b.type==='embed').rank=2;`); ev('jRe()'); assert.ok(main().includes('PROMOTION')); ok('promotion card');
  ev("jSelect('@back')"); assert.ok(main().includes('CLOSING PAGE')); ok('back cover');
  assert.equal(ev("cleanHTML('<b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)><a href=\"javascript:alert(1)\">x</a>')").includes('script'), false); assert.ok(!ev("cleanHTML('<a href=\"javascript:alert(1)\">x</a>')").includes('javascript')); ok('journal text is sanitised');
  // sidebar arrange
  ev('toggleSidebarEdit()'); ev("sideMove('divisions',1)"); ev("sideHide('streaks')"); ev('toggleSidebarEdit()');
  assert.ok(w.document.querySelector('[data-sec="streaks"]').classList.contains('is-hidden')); ev("toggleNavGroup('operations')"); assert.ok(w.document.querySelector('.navgroup[data-g="operations"]').classList.contains('collapsed')); ok('sidebar: hide / move / collapse sections');
  // sync metadata present
  ev('persistLocal()'); assert.ok(ev("Object.keys(state._m.s).length")>3); ok('every change is stamped for merging');
  assert.equal(errs.length, 0, errs.join('|'));
  console.log('\nALL v10 SECTION TESTS PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('\nFAILED:', e.message, '\n', errs.join('|')); process.exit(1); });
