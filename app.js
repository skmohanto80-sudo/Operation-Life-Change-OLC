/* ============ OLC CENTRAL COMMAND SYSTEM — CORE ============ */

const RANK_KEYS = ['agent','lance_naik','naik','sergent','cadet','lieutenant','captain','major','colonel','brigedier','commander','jawan','general','field_marshal'];
const RANK_IMAGES = {};
RANK_KEYS.forEach(k => RANK_IMAGES[k] = `assets/ranks/${k}.png`);
const PROFILE_IMG_SRC = 'assets/profile.png';
const ID_FRONT_SRC = 'assets/id_front.jpg';
const ID_BACK_SRC = 'assets/id_back.jpg';
const RADHA_KRISHNA_SRC = 'assets/radha_krishna.jpg';
const RULEBOOK_PAGES = Array.from({length:23}, (_,i) => `assets/rulebook/page-${String(i+1).padStart(2,'0')}.jpg`);
const RANKS = [
  { name:'AGENT', xp:0 },
  { name:'LANCE NAIK', xp:500 },
  { name:'NAIK', xp:1000 },
  { name:'SERGENT', xp:1500 },
  { name:'CADET', xp:2100 },
  { name:'LIEUTENANT', xp:2700 },
  { name:'CAPTAIN', xp:3300 },
  { name:'MAJOR', xp:3900 },
  { name:'COLONEL', xp:4700 },
  { name:'BRIGEDIER', xp:5500 },
  { name:'COMMANDER', xp:6500 },
  { name:'JAWAN', xp:7700 },
  { name:'GENERAL', xp:8700 },
  { name:'FIELD MARSHAL', xp:10000 },
];
function rankImg(idx, w){ return `<img src="${RANK_IMAGES[RANK_KEYS[idx]]}" style="width:${w}px; filter:drop-shadow(0 0 10px rgba(215,121,241,.5)); cursor:pointer;" onclick="openRankInfo(${idx})">`; }

/* ---------- rank groups, stars & descriptions ---------- */
const RANK_INFO = [
  { group:'Junior Officer', stars:0, desc:'The starting point of every mission. Every agent begins here at 0 XP — the blank slate before discipline takes hold. The most junior rank in all of OLC.' },
  { group:'Junior Officer', stars:0, desc:'The first promotion, earned through early consistency. Marks the shift from intention to action.' },
  { group:'Junior Officer', stars:0, desc:'Momentum is building. Steady completion of Daily Goals across Study, Fitness and Spiritual pillars starts to compound.' },
  { group:'Junior Officer', stars:0, desc:'The senior-most Junior Officer rank — effectively the commander of the Junior Officer tier. Discipline is becoming identity.' },
  { group:'Senior Officer', stars:0, desc:'Entry into the Senior Officer ranks. Though the most junior among seniors, a Cadet outranks every Junior Officer, including Sergent.' },
  { group:'Senior Officer', stars:0, desc:'Field-level leadership XP. Systems and habits built earlier are now largely self-sustaining.' },
  { group:'Senior Officer', stars:0, desc:'Commands respect through demonstrated, repeated results across every DSS pillar.' },
  { group:'Senior Officer', stars:0, desc:'Senior leadership threshold — roughly the halfway point toward General Officer status.' },
  { group:'Senior Officer', stars:0, desc:'One tier below General Officer rank. Deep, proven operational mastery of the mission.' },
  { group:'Senior Officer', stars:1, desc:'The first General Officer rank — One-Star. Oversees mission strategy at scale, not just daily execution.' },
  { group:'Senior Officer', stars:2, desc:'Two-Star General Officer. Commands multiple fronts of the mission (Study, Fitness, Spiritual, Discipline) simultaneously and consistently.' },
  { group:'Senior Officer', stars:3, desc:'Three-Star General Officer. A seasoned veteran of the mission with a long, proven track record.' },
  { group:'Senior Officer', stars:4, desc:'Four-Star General Officer — the operational head of the entire OLC mission. The highest active-duty rank.' },
  { group:'Retired', stars:5, desc:"Five-Star. Earned only after surpassing the full XP requirement of General — awarded as OLC's Retired rank, the seniormost honor in the entire system, reserved for those who complete the full arc of the mission." },
];
function starsRow(n){ if(!n) return ''; return '★'.repeat(n) + '☆'.repeat(Math.max(0,5-n)); }

const RATING_CATS = [
  { key:'study', label:'STUDY', icon:'📚' },
  { key:'exercise', label:'EXERCISE', icon:'💪' },
  { key:'spiritual', label:'SPIRITUAL', icon:'🕊️' },
  { key:'mood', label:'MOOD', icon:'🙂' },
];

const DEFAULT_STATE = {
  // (account credentials now live in a separate multi-account registry, not here)
  profile:{ name:'', codename:'', codeno:'', age:'', cls:'', startDate: todayStr(), photo:null },
  idcard:{ front:null, back:null },
  mission:{
    statement:'',
    vision:'',
    values:['Discipline','Consistency','Integrity','Courage','Responsibility','Honesty','Being Best'],
  },
  xp:0,
  goals:[
    { id:'g_study', label:'Study', xp:10 },
    { id:'g_exercise', label:'Exercise', xp:15 },
    { id:'g_water', label:'Water Goal', xp:5 },
    { id:'g_prayer', label:'Prayer', xp:5 },
    { id:'g_reading', label:'Reading', xp:5 },
    { id:'g_skill', label:'Skill Practice', xp:10 },
  ],
  streaks:{
    study:{count:0,lastDate:null,_pc:0,_pd:null},
    fitness:{count:0,lastDate:null,_pc:0,_pd:null},
    spiritual:{count:0,lastDate:null,_pc:0,_pd:null},
    reading:{count:0,lastDate:null,_pc:0,_pd:null},
    wakeup:{count:0,lastDate:null,_pc:0,_pd:null},
    habit:{count:0,lastDate:null,_pc:0,_pd:null},
  },
  dailyLogs:{},
  trackerLogs:{ weight:[], height:[], exercise:[], study:[], sleep:[] },
  settings:{ waterGoal:2.5, screenLimit:180, theme:'dark' },
  ruleBookCustom:'',
};

let state = null;
let currentSection = 'home';
let saveTimer = null;
let sessionUnlocked = false;
let editingTracker = { name:null, index:null };

function todayStr(d){ const x=d?new Date(d):new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function yestOf(dateStr){ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()-1); return todayStr(d); }
function isYesterday(dateStr, refToday){ if(!dateStr) return false; return dateStr === yestOf(refToday); }
function fmtDateLong(dateStr){ if(!dateStr) return '—'; const d=new Date(dateStr+'T00:00:00'); return d.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'}); }
function daysBetween(a,b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(p){ return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* ---------- user-uploaded photo / ID card ---------- */
function currentProfilePhoto(){ return (state && state.profile.photo) || PROFILE_IMG_SRC; }
function currentIdFront(){ return (state && state.idcard && state.idcard.front) || ID_FRONT_SRC; }
function currentIdBack(){ return (state && state.idcard && state.idcard.back) || ID_BACK_SRC; }
function syncProfileImagesToDOM(){
  const av = document.getElementById('topbarAvatarImg'); if(av) av.src = currentProfilePhoto();
  const pm = document.getElementById('photoModalImg'); if(pm) pm.src = currentProfilePhoto();
  const idf = document.getElementById('idCardFrontImg'); if(idf) idf.src = currentIdFront();
  const idb = document.getElementById('idCardBackImg'); if(idb) idb.src = currentIdBack();
}
function fileToCompressedDataURL(file, maxW, quality){
  return new Promise((resolve, reject)=>{
    if(!file) return reject('no file');
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxW/img.width);
        const w = Math.max(1, Math.round(img.width*scale));
        const h = Math.max(1, Math.round(img.height*scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadProfilePhoto(input){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await fileToCompressedDataURL(file, 400, 0.85);
    state.profile.photo = dataUrl;
    saveState(); syncProfileImagesToDOM(); renderSection();
  }catch(e){ alert('Could not read that image — try a different file.'); }
}
async function uploadIdCardFace(input, face){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await fileToCompressedDataURL(file, 700, 0.85);
    if(!state.idcard) state.idcard = { front:null, back:null };
    state.idcard[face] = dataUrl;
    saveState(); syncProfileImagesToDOM(); renderSection();
  }catch(e){ alert('Could not read that image — try a different file.'); }
}

function ensureDay(date){
  if(!state.dailyLogs[date]){
    state.dailyLogs[date] = {
      items:{}, ratings:{ study:0, exercise:0, spiritual:0, mood:0 },
      wokeOnTime:false, readingDone:false, waterL:0,
      screen:{ totalMin:0, devices:[], apps:[], purposes:[], awarded:false },
      planner:{ morning:'', afternoon:'', night:'' },
      eod:{ well:'', failed:'', learned:'', tomorrow:'' },
    };
  }
  const d = state.dailyLogs[date];
  if(!d.ratings) d.ratings = { study:0, exercise:0, spiritual:0, mood:0 };
  if(!d.screen) d.screen = { totalMin:0, devices:[], apps:[], purposes:[], awarded:false };
  if(d.readingDone===undefined) d.readingDone=false;
  return d;
}

/* ---------- multi-account storage ----------
   Uses browser localStorage (works in any browser, hosted or opened as a
   local file). Each device can hold multiple Agent IDs; every account's
   data is stored under its own key so accounts never mix. */
const ACCOUNTS_KEY = 'olc_accounts';       // [{id, codename, codeid}]
let activeAccountId = null;

function getAccounts(){
  try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveAccounts(list){
  try{ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }catch(e){ console.error('save accounts failed', e); }
}
function findAccount(codename, codeid){
  return getAccounts().find(a => a.codename===codename && a.codeid===codeid) || null;
}
function stateKeyFor(accountId){ return 'olc_state_' + accountId; }

async function loadStateFor(accountId){
  try{
    const raw = localStorage.getItem(stateKeyFor(accountId));
    if(raw){ const loaded = JSON.parse(raw); state = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_STATE)), loaded); }
    else state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }catch(e){ state = JSON.parse(JSON.stringify(DEFAULT_STATE)); }
  activeAccountId = accountId;
}
function saveState(){
  if(!activeAccountId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{ localStorage.setItem(stateKeyFor(activeAccountId), JSON.stringify(state)); }catch(e){ console.error('save failed', e); }
    apiSaveState(activeAccountId, state);
  }, 250);
}

/* ---------- rank / xp ---------- */
function getRankInfo(xp){
  let idx=0;
  for(let i=0;i<RANKS.length;i++){ if(xp>=RANKS[i].xp) idx=i; }
  const cur = RANKS[idx];
  const next = RANKS[idx+1] || null;
  const span = next ? next.xp - cur.xp : 1;
  const into = xp - cur.xp;
  const pct = next ? clamp(into/span*100,0,100) : 100;
  return { idx, cur, next, into, span, pct, xp };
}
function addXP(n){ state.xp = Math.max(0, state.xp + n); }

/* ---------- streaks ---------- */
function streakCheck(key, date){
  const s = state.streaks[key]; if(!s) return;
  if(s.lastDate === date) return;
  s._pc = s.count; s._pd = s.lastDate;
  s.count = isYesterday(s.lastDate, date) ? s.count+1 : 1;
  s.lastDate = date;
}
function streakUncheck(key, date){
  const s = state.streaks[key]; if(!s) return;
  if(s.lastDate !== date) return;
  s.count = s._pc; s.lastDate = s._pd;
}
function recomputeHabitStreak(date){
  const day = ensureDay(date);
  const allDone = state.goals.length>0 && state.goals.every(g => goalStatus(day, g.id)==='full');
  if(allDone) streakCheck('habit', date); else streakUncheck('habit', date);
}

/* ---------- goals (editable daily goals, Full/Half/Fail scoring) ---------- */
function goalStatus(day, goalId){
  const v = day.items[goalId];
  if(v===true) return 'full'; // back-compat with old boolean data
  if(v===false || v===undefined) return null;
  return v; // 'full' | 'half' | 'fail'
}
function goalXPEffect(goal, status){
  if(status==='full') return goal.xp;
  if(status==='half') return goal.xp/2;
  if(status==='fail') return -goal.xp/2;
  return 0;
}
function setGoalStatus(date, goalId, status){
  const day = ensureDay(date);
  const goal = state.goals.find(g=>g.id===goalId); if(!goal) return;
  const old = goalStatus(day, goalId);
  const next = (old===status) ? null : status; // clicking the active state again clears it
  addXP(goalXPEffect(goal, next) - goalXPEffect(goal, old));
  day.items[goalId] = next;
  recomputeHabitStreak(date);
  saveState();
}
function addGoal(){
  const label = document.getElementById('newGoalLabel').value.trim();
  const xp = Number(document.getElementById('newGoalXP').value)||10;
  if(!label) return;
  state.goals.push({ id: uid('g'), label, xp });
  saveState(); renderSection();
}
function editGoal(id){
  const g = state.goals.find(x=>x.id===id); if(!g) return;
  const newLabel = prompt('Goal name:', g.label);
  if(newLabel===null) return;
  const newXp = prompt('XP value (full completion):', g.xp);
  if(newXp===null) return;
  g.label = newLabel.trim()||g.label;
  g.xp = Number(newXp)||g.xp;
  saveState(); renderSection();
}
function deleteGoal(id){
  if(!confirm('Remove this goal from your Daily Goals list?')) return;
  state.goals = state.goals.filter(g=>g.id!==id);
  saveState(); renderSection();
}
function goalRowHTML(date, g, compact){
  const day = ensureDay(date);
  const status = goalStatus(day, g.id);
  const eff = goalXPEffect(g, status);
  const effTxt = status ? (eff>0?'+':'') + (Number.isInteger(eff)?eff:eff.toFixed(1)) + ' XP' : `up to +${g.xp} XP`;
  const btn = (val, label, cls) => `<button class="gbtn ${cls} ${status===val?'active':''}" onclick="setGoalStatus('${date}','${g.id}','${val}'); renderSection();" title="${label}">${compact ? (val==='full'?'✓':val==='half'?'½':'✕') : label}</button>`;
  return `<div class="checklist-item goalrow ${status==='full'?'done':''} ${status==='fail'?'failed':''} ${status==='half'?'halfdone':''}">
    <div class="txt">${esc(g.label)}</div>
    <div class="goal-actions">${btn('full','Full','full')}${btn('half','Half','half')}${btn('fail','Fail','fail')}</div>
    <div class="xp">${effTxt}</div>
    ${compact ? '' : `<button class="btn ghost sm" onclick="editGoal('${g.id}')" title="Edit">✎</button><button class="btn ghost sm" onclick="deleteGoal('${g.id}')" title="Delete">🗑</button>`}
  </div>`;
}

/* ---------- manual streak toggles ---------- */
function toggleWokeOnTime(date){
  const day = ensureDay(date);
  day.wokeOnTime = !day.wokeOnTime;
  day.wokeOnTime ? streakCheck('wakeup', date) : streakUncheck('wakeup', date);
  saveState(); renderSection();
}
function toggleReadingDone(date){
  const day = ensureDay(date);
  day.readingDone = !day.readingDone;
  day.readingDone ? streakCheck('reading', date) : streakUncheck('reading', date);
  saveState(); renderSection();
}

/* ---------- star ratings (1 star = 1 XP) ---------- */
const RATING_STREAK_MAP = { study:'study', exercise:'fitness', spiritual:'spiritual' };
function setRating(date, cat, val){
  const day = ensureDay(date);
  const old = day.ratings[cat]||0;
  const next = (old===val) ? 0 : val; // clicking the same star again clears it
  day.ratings[cat] = next;
  addXP(next - old);
  const sKey = RATING_STREAK_MAP[cat];
  if(sKey){ next>=1 ? streakCheck(sKey, date) : streakUncheck(sKey, date); }
  saveState(); renderSection();
}
function starsHTML(date, cat, label, icon){
  const day = ensureDay(date);
  const val = day.ratings[cat]||0;
  let stars='';
  for(let i=1;i<=5;i++){ stars += `<span onclick="setRating('${date}','${cat}',${i})" style="cursor:pointer; font-size:22px; color:${i<=val?'var(--gold)':'rgba(255,255,255,.15)'}; text-shadow:${i<=val?'0 0 8px rgba(255,210,63,.6)':'none'};">★</span>`; }
  return `<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0;">
    <div style="font-weight:600;">${icon} ${label}</div>
    <div>${stars}</div>
  </div>`;
}

/* ---------- DSS + life stats ---------- */
function getDSS(date){
  const day = ensureDay(date);
  if(!state.goals.length) return 0;
  const sum = state.goals.reduce((a,g)=>{ const s=goalStatus(day,g.id); return a + (s==='full'?1:s==='half'?0.5:0); },0);
  return Math.round(sum / state.goals.length * 100);
}
function last7Dates(refDate){
  const arr=[]; for(let i=6;i>=0;i--){ const d=new Date(refDate+'T00:00:00'); d.setDate(d.getDate()-i); arr.push(todayStr(d)); } return arr;
}
function getLifeStats(){
  const t = todayStr();
  const week = last7Dates(t);
  const withData = week.filter(d=>state.dailyLogs[d]);
  function avgRating(cat){
    if(!withData.length) return 0;
    const sum = withData.reduce((a,d)=>a+(state.dailyLogs[d].ratings[cat]||0),0);
    return clamp(sum/withData.length/5*100,0,100);
  }
  const studyScore = avgRating('study');
  const fitnessScore = avgRating('exercise');
  const spiritScore = avgRating('spiritual');
  const moodScore = avgRating('mood');
  const habitScore = clamp(state.streaks.habit.count/30*100,0,100);
  const screenDays = week.filter(d=>state.dailyLogs[d] && state.dailyLogs[d].screen.totalMin>0);
  const screenCompliant = screenDays.filter(d=> state.dailyLogs[d].screen.totalMin <= state.settings.screenLimit).length;
  const screenScore = screenDays.length ? (screenCompliant/screenDays.length*100) : 0;
  const disciplineScore = clamp((habitScore+screenScore)/2,0,100);
  return { study:Math.round(studyScore), fitness:Math.round(fitnessScore), spiritual:Math.round(spiritScore), discipline:Math.round(disciplineScore), mood:Math.round(moodScore) };
}

/* ---------- medals / badges (auto-derived) ---------- */
function getMedals(){
  const totalStudyHrs = state.trackerLogs.study.reduce((a,b)=>a+Number(b.hours||0),0);
  const rank = getRankInfo(state.xp);
  return [
    { id:'discipline', name:'Discipline Medal', desc:'30 Days No Discipline Violation', icon:'🛡️', unlocked: state.streaks.habit.count>=30 },
    { id:'purity', name:'Purity Medal', desc:'30 Days Pure Mind & Body', icon:'💠', unlocked: state.streaks.habit.count>=30 },
    { id:'study', name:'Study Excellence Medal', desc:'100 study hours logged', icon:'📘', unlocked: totalStudyHrs>=100 },
    { id:'spiritual', name:'Spiritual Warrior Medal', desc:'30+ Days Daily Spiritual Practice', icon:'🕊️', unlocked: state.streaks.spiritual.count>=30 },
    { id:'consistency', name:'Consistency Medal', desc:'90 Days Consistency Streak', icon:'🔗', unlocked: state.streaks.habit.count>=90 },
    { id:'comeback', name:'Comeback Medal', desc:'Overcame a relapse & returned', icon:'🔁', unlocked: state.streaks.habit._pc>0 && state.streaks.habit.count>=7 },
    { id:'focus', name:'Focus Medal', desc:'50+ hours logged in Study Tracker', icon:'🎯', unlocked: totalStudyHrs>=50 },
    { id:'leadership', name:'Leadership Medal', desc:'Reach Colonel rank or above', icon:'🧭', unlocked: rank.idx>=8 },
    { id:'selfcontrol', name:'Self Control Medal', desc:'21-day Habit streak', icon:'🧘', unlocked: state.streaks.habit.count>=21 },
    { id:'commander', name:'Mission Commander Medal', desc:'Reached Field Marshal', icon:'👑', unlocked: rank.cur.name==='FIELD MARSHAL' },
  ];
}
function getBadges(){
  const totalStudyHrs = state.trackerLogs.study.reduce((a,b)=>a+Number(b.hours||0),0);
  const stats = getLifeStats();
  const rank = getRankInfo(state.xp);
  return [
    { id:'dss', name:'DSS Badge', desc:'Guardian of Discipline, Spirituality & Study — 30 days Habit streak', icon:'🛡️', unlocked: state.streaks.habit.count>=30 },
    { id:'fitness', name:'Fitness Badge', desc:'Warrior of Physical & Mental Strength — 30-day Fitness streak', icon:'💪', unlocked: state.streaks.fitness.count>=30 },
    { id:'skills', name:'Skills Badge', desc:'Expert in Skills & Knowledge — 100 study hours', icon:'🧠', unlocked: totalStudyHrs>=100 },
  ];
}

/* ---------- rollover ---------- */
function rollover(){ ensureDay(todayStr()); saveState(); }

/* ========================================================
   RENDER — router
======================================================== */
function go(sec){
  currentSection = sec;
  editingTracker = { name:null, index:null };
  if(sec==='rulebook') fbIndex = 0;
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.sec===sec));
  renderSection();
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo({top:0, behavior:'smooth'});
}
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); }

function renderTopbar(){
  const rank = getRankInfo(state.xp);
  document.getElementById('rankPillTxt').textContent = rank.cur.name;
  document.getElementById('dssPillTxt').textContent = getDSS(todayStr());
  document.getElementById('xpPillTxt').textContent = state.xp;
}
function tickClock(){
  const el = document.getElementById('clockPill');
  if(el) el.textContent = new Date().toLocaleTimeString();
  const dEl = document.getElementById('datePill');
  if(dEl) dEl.textContent = new Date().toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
}
function openRKModal(){ document.getElementById('rkModal').style.display = 'flex'; }
function closeRKModal(){ document.getElementById('rkModal').style.display = 'none'; }

function renderSection(){
  const map = { home:secHome, dashboard:secDashboard, profile:secProfile, mission:secMission,
    streaks:secStreaks, daily:secDaily, trackers:secTrackers, rank:secRank, medals:secMedals,
    badges:secBadges, rulebook:secRulebook, archives:secArchives };
  const fn = map[currentSection] || secHome;
  document.getElementById('mainContent').innerHTML = fn();
  renderTopbar();
  if(currentSection==='rulebook') fbRenderBase();
}
function renderAll(){ renderTopbar(); renderSection(); }

/* ========================================================
   SECTION: HOME
======================================================== */
const MOTTOS = [
  "Discipline is the bridge between goals and results.",
  "The mission does not pause for motivation.",
  "Small actions, repeated daily, win wars.",
  "You do not rise to the level of your goals. You fall to the level of your systems.",
  "Every checkbox is a battle won.",
  "Comfort is the enemy's greatest weapon.",
  "Mission First. No Zero Days. Progress Over Perfection.",
];
function secHome(){
  const t = todayStr();
  const day = ensureDay(t);
  const rank = getRankInfo(state.xp);
  const dss = getDSS(t);
  const p = state.profile;
  const daysActive = daysBetween(p.startDate || t, t);
  const motto = MOTTOS[new Date().getDate() % MOTTOS.length];
  const doneCount = state.goals.filter(g=>goalStatus(day,g.id)==='full').length;

  return `
  <div class="ticker"><span>⚡ OLC-CCS ONLINE &nbsp;&nbsp;·&nbsp;&nbsp; AGENT: ${esc(p.codename||p.name||'UNNAMED')} &nbsp;&nbsp;·&nbsp;&nbsp; DAY ${daysActive} OF THE MISSION &nbsp;&nbsp;·&nbsp;&nbsp; "${esc(motto)}" &nbsp;&nbsp;·&nbsp;&nbsp; DISCIPLINE BEFORE MOTIVATION &nbsp;&nbsp;·&nbsp;&nbsp;</span></div>

  <div class="pagehead">
    <h2>MISSION OVERVIEW</h2>
    <div class="sub">${fmtDateLong(t)}</div>
  </div>
  <img src="${RADHA_KRISHNA_SRC}" alt="Radha Krishna" onclick="openRKModal()" style="float:right; width:230px; max-width:48vw; border-radius:14px; border:1px solid var(--border-strong); box-shadow:0 10px 30px rgba(0,0,0,.45); margin:-60px 0 14px 16px; cursor:pointer;">

  <div class="grid c3" style="align-items:stretch;">
    <div class="panel" style="text-align:center;">
      <div class="eyebrow">CURRENT RANK</div>
      <div class="radar-sweep" style="position:relative; width:80px; margin:10px auto 6px;">
        <div class="rankbadge">${rankImg(rank.idx,40)}</div>
      </div>
      <div class="disp" style="font-size:16px; color:var(--lavender); margin-top:6px;">${rank.cur.name}</div>
      <div class="bar" style="margin-top:10px;"><i style="width:${rank.pct}%"></i></div>
      <div class="stat-label mono" style="margin-top:6px;">${rank.next ? (rank.into+' / '+rank.span+' XP TOWARD '+rank.next.name) : 'MAX TIER REACHED'}</div>
    </div>

    <div class="panel" style="text-align:center; display:flex; flex-direction:column; justify-content:center;">
      <div class="eyebrow">MISSION PROGRESS</div>
      <div class="stat-big" style="font-size:52px;">${Math.round((rank.xp/RANKS[RANKS.length-1].xp)*100)}%</div>
      <div class="stat-label">TOWARD FIELD MARSHAL</div>
      <div class="bar cyan" style="margin-top:14px;"><i style="width:${clamp((rank.xp/RANKS[RANKS.length-1].xp)*100,0,100)}%"></i></div>
    </div>

    <div class="panel" style="text-align:center; display:flex; flex-direction:column; justify-content:center;">
      <div class="eyebrow">TODAY'S DSS</div>
      <div class="stat-big" style="font-size:52px;">${dss}</div>
      <div class="stat-label">/ 100 &nbsp;·&nbsp; ${doneCount}/${state.goals.length} GOALS COMPLETE</div>
      <div class="bar gold" style="margin-top:14px;"><i style="width:${dss}%"></i></div>
    </div>
  </div>

  <div class="grid c2" style="margin-top:18px;">
    <div class="panel">
      <h3><span class="ic">☑</span>TODAY'S GOALS</h3>
      ${state.goals.length? state.goals.map(g=>goalRowHTML(t,g,true)).join('') : '<div class="empty">No goals yet — add some in Daily Operations</div>'}
      <div style="text-align:right; margin-top:6px;"><button class="btn ghost sm" onclick="go('daily')">Manage in Daily Operations →</button></div>
    </div>

    <div class="panel">
      <h3><span class="ic">🔥</span>ACTIVE STREAKS</h3>
      ${['study','fitness','spiritual','reading','wakeup','habit'].map(k=>`
        <div class="streakcard" style="border-bottom:1px solid rgba(255,255,255,.05);">
          <div style="display:flex; align-items:center; gap:10px;"><span class="flame">🔥</span><span style="font-weight:600; text-transform:uppercase; font-size:13px; color:var(--dim);">${k}</span></div>
          <div class="n">${state.streaks[k].count}<span style="font-size:12px; color:var(--dim);"> d</span></div>
        </div>`).join('')}
      <div style="text-align:right; margin-top:10px;"><button class="btn ghost sm" onclick="go('streaks')">Streak Command Center →</button></div>
    </div>
  </div>

  <div class="panel" style="margin-top:18px;">
    <h3><span class="ic">📡</span>DAILY MOTIVATION</h3>
    <div style="font-family:'Orbitron'; font-size:15px; color:var(--white); line-height:1.6;">"${esc(motto)}"</div>
  </div>
  `;
}

/* ========================================================
   SECTION: COMMAND DASHBOARD
======================================================== */
function secDashboard(){
  const t = todayStr();
  const dss = getDSS(t);
  const stats = getLifeStats();
  const rank = getRankInfo(state.xp);
  const p = state.profile;
  const daysActive = daysBetween(p.startDate||t, t);
  const week = last7Dates(t);
  const weekFull = week.reduce((a,d)=>{ const day=state.dailyLogs[d]; if(!day) return a; return a + state.goals.filter(g=>goalStatus(day,g.id)==='full').length; },0);
  const bestStreak = Math.max(0, ...Object.values(state.streaks).map(s=>s.count));
  return `
  <div class="pagehead"><h2>COMMAND DASHBOARD</h2><div class="sub">DAILY SUCCESS SCORE ENGINE</div></div>

  <div class="panel" style="margin-bottom:16px;">
    <h3><span class="ic">🪪</span>MISSION BRIEF</h3>
    <div class="grid c4">
      <div><div class="eyebrow">CODENAME</div><div class="stat-big" style="font-size:18px;">${esc(p.codename||'—')}</div></div>
      <div><div class="eyebrow">RANK</div><div class="stat-big" style="font-size:18px;">${rank.cur.name}</div></div>
      <div><div class="eyebrow">DAYS ACTIVE</div><div class="stat-big" style="font-size:18px;">${daysActive}</div></div>
      <div><div class="eyebrow">TOTAL XP</div><div class="stat-big" style="font-size:18px;">${state.xp}</div></div>
    </div>
  </div>

  <div class="grid c2">
    <div class="panel" style="text-align:center;">
      <div class="eyebrow">TODAY'S DSS</div>
      <div class="stat-big" style="font-size:64px;">${dss}<span style="font-size:22px; color:var(--dim);">/100</span></div>
      <div class="bar gold" style="margin-top:10px;"><i style="width:${dss}%"></i></div>
      <div class="stat-label" style="margin-top:10px;">DAILY SUCCESS SCORE = COMPLETED GOALS ÷ TOTAL GOALS</div>
    </div>
    <div class="panel">
      <h3><span class="ic">◈</span>LIFE STATS RADAR</h3>
      ${radarChartSVG(stats)}
    </div>
  </div>

  <div class="grid c4" style="margin-top:16px;">
    ${['study','fitness','spiritual','discipline','mood'].map(k=>`
      <div class="panel" style="text-align:center;">
        <div class="eyebrow">${k}</div>
        <div class="stat-big" style="font-size:30px;">${stats[k]}</div>
        <div class="bar" style="margin-top:8px;"><i style="width:${stats[k]}%"></i></div>
      </div>`).join('')}
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">📊</span>THIS WEEK</h3>
    <div class="grid c3">
      <div><div class="eyebrow">GOALS COMPLETED (FULL)</div><div class="stat-big" style="font-size:26px;">${weekFull}</div></div>
      <div><div class="eyebrow">BEST ACTIVE STREAK</div><div class="stat-big" style="font-size:26px;">${bestStreak} d</div></div>
      <div><div class="eyebrow">RANK PROGRESS</div><div class="stat-big" style="font-size:26px;">${Math.round(rank.pct)}%</div></div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">⚡</span>QUICK LOG — TODAY'S GOALS</h3>
    ${state.goals.length ? state.goals.map(g=>goalRowHTML(t,g,true)).join('') : '<div class="empty">No goals yet</div>'}
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">⭐</span>TODAY'S RATINGS</h3>
    ${RATING_CATS.map(c=>starsHTML(t,c.key,c.label,c.icon)).join('')}
  </div>
  `;
}

/* ========================================================
   SECTION: PROFILE
======================================================== */
function secProfile(){
  const p = state.profile;
  const rank = getRankInfo(state.xp);
  const daysActive = daysBetween(p.startDate||todayStr(), todayStr());
  return `
  <div class="pagehead"><h2>AGENT PROFILE</h2><div class="sub">CLASSIFIED — COMMAND EYES ONLY</div></div>
  <div class="grid c2">
    <div class="panel" style="text-align:center;">
      <img src="${currentProfilePhoto()}" alt="Agent" onclick="openPhotoModal()" style="width:150px; height:150px; object-fit:cover; border-radius:50%; border:3px solid var(--border-strong); box-shadow:0 0 24px rgba(215,121,241,.4); cursor:pointer;">
      <div class="stat-label" style="margin-top:6px;">TAP PHOTO TO ENLARGE</div>
      <div style="margin-top:10px;">
        <label class="btn ghost sm" style="cursor:pointer;">Upload Profile Photo<input type="file" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(this)"></label>
      </div>
      <h3 style="justify-content:center; margin-top:16px;"><span class="ic">☰</span>AGENT INFORMATION</h3>
      <div class="grid c2" style="text-align:left;">
        <div class="field"><label class="f">Agent Name</label><input type="text" id="pf_name" value="${esc(p.name)}"></div>
        <div class="field"><label class="f">Codename</label><input type="text" id="pf_codename" value="${esc(p.codename)}"></div>
        <div class="field"><label class="f">Code No.</label><input type="text" id="pf_codeno" value="${esc(p.codeno)}"></div>
        <div class="field"><label class="f">Age</label><input type="text" id="pf_age" value="${esc(p.age)}"></div>
        <div class="field"><label class="f">Class</label><input type="text" id="pf_cls" value="${esc(p.cls)}"></div>
        <div class="field"><label class="f">Mission Start Date</label><input type="date" id="pf_start" value="${p.startDate}"></div>
      </div>
      <button class="btn" onclick="saveProfile()">Save Profile</button>
    </div>
    <div class="panel" style="text-align:center;">
      <h3 style="justify-content:center;"><span class="ic">★</span>SERVICE RECORD</h3>
      <div class="rankbadge" style="margin:14px auto;">${rankImg(rank.idx,52)}</div>
      <div class="disp" style="color:var(--lavender); font-size:16px;">${rank.cur.name}</div>
      <div class="tag" style="margin-top:10px;">OPERATION: LIFE CHANGE</div>
      <div class="grid c2" style="margin-top:18px; text-align:left;">
        <div><div class="eyebrow">DAYS ACTIVE</div><div class="stat-big" style="font-size:26px;">${daysActive}</div></div>
        <div><div class="eyebrow">TOTAL XP</div><div class="stat-big" style="font-size:26px;">${state.xp}</div></div>
      </div>
      <div style="margin-top:20px;">
        <div class="eyebrow" style="margin-bottom:10px;">AGENT ID CARD</div>
        <div class="idcard-thumb" style="max-width:220px; margin:0 auto;" onclick="openIdCard()">
          <img src="${currentIdFront()}" alt="ID Card">
        </div>
        <div class="stat-label" style="margin-top:8px;">TAP TO VIEW &amp; ROTATE</div>
        <div style="display:flex; gap:8px; justify-content:center; margin-top:10px; flex-wrap:wrap;">
          <label class="btn ghost sm" style="cursor:pointer;">Upload Front<input type="file" accept="image/*" style="display:none;" onchange="uploadIdCardFace(this,'front')"></label>
          <label class="btn ghost sm" style="cursor:pointer;">Upload Back<input type="file" accept="image/*" style="display:none;" onchange="uploadIdCardFace(this,'back')"></label>
        </div>
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🪪</span>LOGGED-IN ACCOUNT</h3>
    <div class="grid c3">
      <div><div class="eyebrow">CODENAME</div><div class="stat-big" style="font-size:18px;">${esc(loggedAccount()?.codename || '—')}</div></div>
      <div><div class="eyebrow">CODE ID</div><div class="stat-big" style="font-size:18px;">${esc(loggedAccount()?.codeid || '—')}</div></div>
      <div><div class="eyebrow">ACCOUNTS ON THIS DEVICE</div><div class="stat-big" style="font-size:18px;">${getAccounts().length}</div></div>
    </div>
    <p class="stat-label" style="margin-top:12px;">Each Agent ID on this device keeps completely separate data. Use the 🔒 button in the top bar to switch to another ID or lock the app.</p>
    <button class="btn ghost sm" style="margin-top:8px;" onclick="lockApp()">Switch Account / Lock</button>
  </div>
  `;
}
function loggedAccount(){ return getAccounts().find(a=>a.id===activeAccountId) || null; }
function saveProfile(){
  state.profile.name = document.getElementById('pf_name').value;
  state.profile.codename = document.getElementById('pf_codename').value;
  state.profile.codeno = document.getElementById('pf_codeno').value;
  state.profile.age = document.getElementById('pf_age').value;
  state.profile.cls = document.getElementById('pf_cls').value;
  state.profile.startDate = document.getElementById('pf_start').value || todayStr();
  saveState(); renderSection();
}

/* ========================================================
   SECTION: MISSION
======================================================== */
function secMission(){
  const m = state.mission;
  return `
  <div class="pagehead"><h2>MISSION</h2><div class="sub">WHY OLC EXISTS</div></div>
  <div class="grid c2">
    <div class="panel">
      <h3><span class="ic">⚑</span>MISSION STATEMENT</h3>
      <textarea id="ms_statement" rows="4" placeholder="Why does Operation Life Change exist?">${esc(m.statement)}</textarea>
    </div>
    <div class="panel">
      <h3><span class="ic">🔭</span>VISION</h3>
      <textarea id="ms_vision" rows="4" placeholder="Where does this mission lead?">${esc(m.vision)}</textarea>
    </div>
  </div>
  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">✦</span>CORE VALUES</h3>
    <div class="grid c3">
      ${m.values.map((v,i)=>`<div class="tag" style="padding:8px 14px; font-size:12px; text-align:center;">${esc(v)}</div>`).join('')}
    </div>
  </div>
  <div class="panel" style="margin-top:16px;">
    <button class="btn" onclick="saveMission()">Save Mission Data</button>
  </div>
  `;
}
function saveMission(){
  state.mission.statement = document.getElementById('ms_statement').value;
  state.mission.vision = document.getElementById('ms_vision').value;
  saveState(); renderSection();
}

/* ========================================================
   SECTION: STREAK COMMAND CENTER
======================================================== */
const STREAK_META = {
  study:{label:'STUDY STREAK', icon:'📘'}, fitness:{label:'FITNESS STREAK', icon:'💪'},
  spiritual:{label:'SPIRITUAL STREAK', icon:'🕊️'}, reading:{label:'READING STREAK', icon:'📖'},
  wakeup:{label:'WAKE-UP STREAK', icon:'⏰'}, habit:{label:'HABIT STREAK (PERFECT DAYS)', icon:'⚡'},
};
function secStreaks(){
  return `
  <div class="pagehead"><h2>STREAK COMMAND CENTER</h2><div class="sub">CONSISTENCY IS THE MISSION</div></div>
  <div class="grid c3">
    ${Object.keys(STREAK_META).map(k=>{
      const s = state.streaks[k]; const meta = STREAK_META[k];
      const active = s.lastDate === todayStr();
      return `<div class="panel" style="text-align:center;">
        <div class="flame" style="font-size:34px; ${active?'':'opacity:.35;'}">${meta.icon}</div>
        <div class="stat-big" style="margin-top:8px;">${s.count}</div>
        <div class="stat-label">${meta.label}</div>
        <div class="tag" style="margin-top:10px;">${s.lastDate ? 'LAST: '+s.lastDate : 'NOT STARTED'}</div>
      </div>`;
    }).join('')}
  </div>
  <div class="panel" style="margin-top:16px;">
    <p style="color:var(--dim); font-size:13px;">Study, Fitness and Spiritual streaks update automatically when you give that category a star rating in Daily Operations. Reading and Wake-Up streaks are logged with manual toggles. Habit streak counts consecutive days where <b style="color:var(--white)">every</b> Daily Goal was completed — the mark of Iron Discipline.</p>
  </div>
  `;
}

/* ========================================================
   SECTION: DAILY OPERATIONS
======================================================== */
function secDaily(){
  const t = todayStr();
  const day = ensureDay(t);
  return `
  <div class="pagehead"><h2>DAILY OPERATIONS</h2><div class="sub">${fmtDateLong(t)}</div></div>

  <div class="grid c2">
    <div class="panel">
      <h3><span class="ic">☑</span>DAILY GOALS <span style="font-weight:400; color:var(--dim); font-size:11px;">(Full = full XP · Half = half XP · Fail = −half XP)</span></h3>
      ${state.goals.length? state.goals.map(g=>goalRowHTML(t,g,false)).join('') : '<div class="empty">No goals yet — add your first one below</div>'}
      <div class="grid c2" style="margin-top:12px;">
        <div class="field"><label class="f">New Goal Name</label><input type="text" id="newGoalLabel" placeholder="e.g. Meditate"></div>
        <div class="field"><label class="f">XP Value</label><input type="number" id="newGoalXP" value="10"></div>
      </div>
      <button class="btn sm" onclick="addGoal()">+ Add Goal</button>

      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px;">
        <div class="checklist-item ${day.wokeOnTime?'done':''}" onclick="toggleWokeOnTime('${t}');">
          <div class="ck">${day.wokeOnTime?'✓':''}</div><div class="txt">Woke Up On Time</div><div class="xp">streak</div>
        </div>
        <div class="checklist-item ${day.readingDone?'done':''}" onclick="toggleReadingDone('${t}');">
          <div class="ck">${day.readingDone?'✓':''}</div><div class="txt">Reading Done</div><div class="xp">streak</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3><span class="ic">⭐</span>DAILY RATINGS <span style="font-weight:400; color:var(--dim); font-size:11px;">(1★ = 1 XP)</span></h3>
      ${RATING_CATS.map(c=>starsHTML(t,c.key,c.label,c.icon)).join('')}

      <h3 style="margin-top:20px;"><span class="ic">🗓</span>DAILY PLANNER</h3>
      <div class="field"><label class="f">Morning</label><textarea id="pl_morning" rows="2">${esc(day.planner.morning)}</textarea></div>
      <div class="field"><label class="f">Afternoon</label><textarea id="pl_afternoon" rows="2">${esc(day.planner.afternoon)}</textarea></div>
      <div class="field"><label class="f">Night</label><textarea id="pl_night" rows="2">${esc(day.planner.night)}</textarea></div>
      <button class="btn sm" onclick="savePlanner('${t}')">Save Planner</button>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">🌙</span>END OF DAY REVIEW</h3>
    <div class="grid c2">
      <div class="field"><label class="f">What went well?</label><textarea id="eod_well" rows="3">${esc(day.eod.well)}</textarea></div>
      <div class="field"><label class="f">What failed?</label><textarea id="eod_failed" rows="3">${esc(day.eod.failed)}</textarea></div>
      <div class="field"><label class="f">What did I learn?</label><textarea id="eod_learned" rows="3">${esc(day.eod.learned)}</textarea></div>
      <div class="field"><label class="f">Tomorrow's target?</label><textarea id="eod_tomorrow" rows="3">${esc(day.eod.tomorrow)}</textarea></div>
    </div>
    <button class="btn" onclick="saveEOD('${t}')">Log End Of Day Review</button>
  </div>
  `;
}
function savePlanner(date){
  const day = ensureDay(date);
  day.planner.morning = document.getElementById('pl_morning').value;
  day.planner.afternoon = document.getElementById('pl_afternoon').value;
  day.planner.night = document.getElementById('pl_night').value;
  saveState(); renderSection();
}
function saveEOD(date){
  const day = ensureDay(date);
  day.eod.well = document.getElementById('eod_well').value;
  day.eod.failed = document.getElementById('eod_failed').value;
  day.eod.learned = document.getElementById('eod_learned').value;
  day.eod.tomorrow = document.getElementById('eod_tomorrow').value;
  saveState(); renderSection();
}

/* ========================================================
   SECTION: TRACKER DIVISION
======================================================== */
function lineChartSVG(log, field){
  const sorted = [...log].sort((a,b)=>a.date<b.date?-1:1).slice(-12);
  if(sorted.length<2) return '<div class="empty">Log at least 2 entries to see trend</div>';
  const vals = sorted.map(e=>Number(e[field]));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max-min)||1;
  const W=280,H=70,pad=6;
  const pts = vals.map((v,i)=> [pad + i*(W-2*pad)/(vals.length-1), H-pad - ( (v-min)/range )*(H-2*pad) ].join(',')).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; margin-top:10px;"><polyline points="${pts}" fill="none" stroke="#01c4c4" stroke-width="2"/></svg>`;
}
function withIdx(arr){ return arr.map((e,i)=>Object.assign({_i:i}, e)); }
function sortedDesc(arr){ return withIdx(arr).sort((a,b)=> a.date<b.date?1:(a.date>b.date?-1:b._i-a._i)); }

function startEditEntry(name, idx){ editingTracker = {name, index: idx}; renderSection(); document.getElementById('trk_'+name)?.scrollIntoView({behavior:'smooth', block:'center'}); }
function cancelEdit(){ editingTracker = {name:null, index:null}; renderSection(); }
function deleteTrackerEntry(name, idx){
  if(!confirm('Delete this entry?')) return;
  if(name==='study'){ const e = state.trackerLogs.study[idx]; if(e) addXP(-Math.round(Number(e.hours||0)*10)); }
  state.trackerLogs[name].splice(idx,1);
  if(editingTracker.name===name) editingTracker={name:null,index:null};
  saveState(); renderSection();
}

function secTrackers(){
  const t = todayStr();
  const day = ensureDay(t);
  const waterGoal = state.settings.waterGoal;
  const waterPct = clamp(day.waterL/waterGoal*100,0,100);
  const screen = day.screen;
  const screenPct = clamp(screen.totalMin/state.settings.screenLimit*100,0,100);

  const weightLog = sortedDesc(state.trackerLogs.weight).slice(0,8);
  const heightLog = sortedDesc(state.trackerLogs.height).slice(0,8);
  const exLog = sortedDesc(state.trackerLogs.exercise).slice(0,8);
  const studyLog = sortedDesc(state.trackerLogs.study).slice(0,8);
  const sleepLog = sortedDesc(state.trackerLogs.sleep).slice(0,8);

  const wEdit = editingTracker.name==='weight' ? state.trackerLogs.weight[editingTracker.index] : null;
  const hEdit = editingTracker.name==='height' ? state.trackerLogs.height[editingTracker.index] : null;
  const exEdit = editingTracker.name==='exercise' ? state.trackerLogs.exercise[editingTracker.index] : null;
  const sdEdit = editingTracker.name==='study' ? state.trackerLogs.study[editingTracker.index] : null;
  const slEdit = editingTracker.name==='sleep' ? state.trackerLogs.sleep[editingTracker.index] : null;

  return `
  <div class="pagehead"><h2>TRACKER DIVISION</h2><div class="sub">EVERY METRIC, ONE COMMAND CENTER</div></div>

  <div class="grid c2">
    <div class="panel" style="text-align:center;">
      <h3 style="justify-content:center;"><span class="ic">💧</span>WATER TRACKER</h3>
      <div class="water-bottle"><div class="fill" style="height:${waterPct}%;"></div></div>
      <div class="stat-big" style="font-size:22px; margin-top:10px;">${day.waterL.toFixed(2)} L <span style="font-size:13px; color:var(--dim);">/ ${waterGoal} L</span></div>
      <div style="display:flex; gap:8px; justify-content:center; margin-top:10px;">
        <button class="btn cyan sm" onclick="addWater(0.25)">+0.25L</button>
        <button class="btn cyan sm" onclick="addWater(0.5)">+0.5L</button>
        <button class="btn ghost sm" onclick="resetWater()">Reset</button>
      </div>
      <div class="field" style="margin-top:12px; text-align:left;"><label class="f">Daily Goal (L)</label><input type="number" step="0.1" id="waterGoalInput" value="${waterGoal}" onchange="setWaterGoal(this.value)"></div>
    </div>

    <div class="panel">
      <h3><span class="ic">📱</span>SCREEN TIME TRACKER</h3>
      <div class="field"><label class="f">Total Duration (min)</label><input type="number" id="scr_total" value="${screen.totalMin}"></div>
      <div class="bar" style="margin:10px 0;"><i style="width:${Math.min(screenPct,100)}%; background:${screen.totalMin>state.settings.screenLimit?'linear-gradient(90deg,#8a1030,var(--danger))':'linear-gradient(90deg,var(--violet),var(--lavender))'}"></i></div>
      <div class="field"><label class="f">Daily Limit (min)</label><input type="number" id="scr_limit" value="${state.settings.screenLimit}"></div>

      <label class="f" style="margin-top:10px;">Devices (name + minutes)</label>
      ${screen.devices.map((d,i)=>`<div style="display:flex; gap:6px; margin-bottom:6px;"><input type="text" value="${esc(d.name)}" onchange="updateScreenSub('devices',${i},'name',this.value)" placeholder="Device"><input type="number" style="width:90px;" value="${d.min}" onchange="updateScreenSub('devices',${i},'min',this.value)"><button class="btn ghost sm" onclick="removeScreenSub('devices',${i})">✕</button></div>`).join('')}
      <button class="btn ghost sm" onclick="addScreenSub('devices')">+ Add Device</button>

      <label class="f" style="margin-top:12px;">Apps / Software (name + minutes)</label>
      ${screen.apps.map((d,i)=>`<div style="display:flex; gap:6px; margin-bottom:6px;"><input type="text" value="${esc(d.name)}" onchange="updateScreenSub('apps',${i},'name',this.value)" placeholder="App"><input type="number" style="width:90px;" value="${d.min}" onchange="updateScreenSub('apps',${i},'min',this.value)"><button class="btn ghost sm" onclick="removeScreenSub('apps',${i})">✕</button></div>`).join('')}
      <button class="btn ghost sm" onclick="addScreenSub('apps')">+ Add App</button>

      <label class="f" style="margin-top:12px;">Purpose(s)</label>
      ${screen.purposes.map((p,i)=>`<div style="display:flex; gap:6px; margin-bottom:6px;"><input type="text" value="${esc(p)}" onchange="updateScreenPurpose(${i},this.value)" placeholder="Purpose"><button class="btn ghost sm" onclick="removeScreenPurpose(${i})">✕</button></div>`).join('')}
      <button class="btn ghost sm" onclick="addScreenPurpose()">+ Add Purpose</button>

      <div class="stat-label" style="margin-top:12px;">${screen.totalMin} / ${state.settings.screenLimit} MIN — ${screen.totalMin<=state.settings.screenLimit && screen.totalMin>0 ? 'WITHIN LIMIT ✓' : screen.totalMin===0 ? 'NOT LOGGED' : 'OVER LIMIT ✗'}</div>
      <button class="btn sm" style="margin-top:10px;" onclick="saveScreenTime()">Save Screen Time (+10XP if compliant)</button>
    </div>
  </div>

  <div class="grid c2" style="margin-top:16px;">
    <div class="panel" id="trk_sleep">
      <h3><span class="ic">🛌</span>SLEEP TRACKER</h3>
      <div class="grid c2">
        <div class="field"><label class="f">Bed Time</label><input type="time" id="sl_bed" value="${slEdit?slEdit.bed:''}"></div>
        <div class="field"><label class="f">Wake Time</label><input type="time" id="sl_wake" value="${slEdit?slEdit.wake:''}"></div>
      </div>
      <button class="btn sm" onclick="saveSleepLog()">${slEdit?'Update Entry':'Log Sleep'}</button>
      ${slEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
      <table style="margin-top:12px;"><tr><th>Date</th><th>Bed</th><th>Wake</th><th></th></tr>
      ${sleepLog.length? sleepLog.map(e=>`<tr><td>${e.date}</td><td>${e.bed}</td><td>${e.wake}</td><td><button class="btn ghost sm" onclick="startEditEntry('sleep',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('sleep',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty">No entries yet</td></tr>'}
      </table>
    </div>

    <div class="panel" id="trk_weight">
      <h3><span class="ic">⚖️</span>WEIGHT TRACKER</h3>
      <div class="grid c2">
        <div class="field"><label class="f">Weight (kg)</label><input type="number" step="0.1" id="wt_kg" value="${wEdit?wEdit.kg:''}"></div>
        <div class="field"><label class="f">Date</label><input type="date" id="wt_date" value="${wEdit?wEdit.date:t}"></div>
      </div>
      <button class="btn sm" onclick="saveWeightLog()">${wEdit?'Update Entry':'Log Weight'}</button>
      ${wEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
      ${lineChartSVG(state.trackerLogs.weight,'kg')}
      <table style="margin-top:8px;"><tr><th>Date</th><th>KG</th><th></th></tr>
      ${weightLog.length? weightLog.map(e=>`<tr><td>${e.date}</td><td>${e.kg}</td><td><button class="btn ghost sm" onclick="startEditEntry('weight',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('weight',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty">No entries yet</td></tr>'}
      </table>
    </div>
  </div>

  <div class="grid c2" style="margin-top:16px;">
    <div class="panel" id="trk_height">
      <h3><span class="ic">📏</span>HEIGHT TRACKER</h3>
      <div class="grid c2">
        <div class="field"><label class="f">Height (cm)</label><input type="number" step="0.1" id="ht_cm" value="${hEdit?hEdit.cm:''}"></div>
        <div class="field"><label class="f">Date</label><input type="date" id="ht_date" value="${hEdit?hEdit.date:t}"></div>
      </div>
      <button class="btn sm" onclick="saveHeightLog()">${hEdit?'Update Entry':'Log Height'}</button>
      ${hEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
      ${lineChartSVG(state.trackerLogs.height,'cm')}
      <table style="margin-top:8px;"><tr><th>Date</th><th>CM</th><th></th></tr>
      ${heightLog.length? heightLog.map(e=>`<tr><td>${e.date}</td><td>${e.cm}</td><td><button class="btn ghost sm" onclick="startEditEntry('height',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('height',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="3" class="empty">No entries yet</td></tr>'}
      </table>
    </div>

    <div class="panel" id="trk_exercise">
      <h3><span class="ic">🏋️</span>EXERCISE TRACKER</h3>
      <label class="f">Type</label>
      <div style="display:flex; gap:10px; margin-bottom:10px;">
        <button type="button" class="btn ${(exEdit?exEdit.type:exerciseTypeSel)==='proper'?'':'ghost'} sm" onclick="exerciseTypeSel='proper'; renderSection();">Proper</button>
        <button type="button" class="btn ${(exEdit?exEdit.type:exerciseTypeSel)==='common'?'':'ghost'} sm" onclick="exerciseTypeSel='common'; renderSection();">Common</button>
      </div>
      <div class="grid c2">
        <div class="field"><label class="f">Gripper Count</label><input type="number" id="ex_gripper" value="${exEdit?exEdit.gripper:''}"></div>
        <div class="field"><label class="f">Duration (min)</label><input type="number" id="ex_duration" value="${exEdit?exEdit.durationMin:''}"></div>
      </div>
      <button class="btn sm" onclick="saveExerciseLog()">${exEdit?'Update Entry':'Log Exercise Session'}</button>
      ${exEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
      <table style="margin-top:12px;"><tr><th>Date</th><th>Type</th><th>Gripper</th><th>Min</th><th></th></tr>
      ${exLog.length? exLog.map(e=>`<tr><td>${e.date}</td><td>${e.type||'—'}</td><td>${e.gripper||0}</td><td>${e.durationMin||0}</td><td><button class="btn ghost sm" onclick="startEditEntry('exercise',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('exercise',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No entries yet</td></tr>'}
      </table>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;" id="trk_study">
    <h3><span class="ic">📚</span>STUDY TRACKER</h3>
    <div class="grid c4">
      <div class="field"><label class="f">Hours</label><input type="number" step="0.1" id="sd_hours" value="${sdEdit?sdEdit.hours:''}"></div>
      <div class="field"><label class="f">Subject</label><input type="text" id="sd_subject" value="${sdEdit?esc(sdEdit.subject):''}"></div>
      <div class="field"><label class="f">Topic</label><input type="text" id="sd_topic" value="${sdEdit?esc(sdEdit.topic||''):''}"></div>
      <div class="field"><label class="f">Sessions</label><input type="number" id="sd_sessions" value="${sdEdit?sdEdit.sessions:1}"></div>
    </div>
    <button class="btn sm" onclick="saveStudyLog()">${sdEdit?'Update Entry':'Log Study Session (+10XP/hr)'}</button>
    ${sdEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
    <table style="margin-top:12px;"><tr><th>Date</th><th>Hrs</th><th>Subject</th><th>Topic</th><th>Sess.</th><th></th></tr>
    ${studyLog.length? studyLog.map(e=>`<tr><td>${e.date}</td><td>${e.hours}</td><td>${esc(e.subject||'—')}</td><td>${esc(e.topic||'—')}</td><td>${e.sessions||1}</td><td><button class="btn ghost sm" onclick="startEditEntry('study',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('study',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No entries yet</td></tr>'}
    </table>
  </div>
  `;
}

let exerciseTypeSel = 'proper';

function addWater(l){ const day=ensureDay(todayStr()); day.waterL = Math.round((day.waterL+l)*100)/100; saveState(); renderSection(); }
function resetWater(){ const day=ensureDay(todayStr()); day.waterL=0; saveState(); renderSection(); }
function setWaterGoal(v){ state.settings.waterGoal = Number(v)||2.5; saveState(); renderSection(); }

/* screen time */
function addScreenSub(kind){ const day=ensureDay(todayStr()); day.screen[kind].push({name:'',min:0}); saveState(); renderSection(); }
function removeScreenSub(kind, i){ const day=ensureDay(todayStr()); day.screen[kind].splice(i,1); saveState(); renderSection(); }
function updateScreenSub(kind, i, field, val){ const day=ensureDay(todayStr()); day.screen[kind][i][field] = field==='min'? (Number(val)||0) : val; saveState(); }
function addScreenPurpose(){ const day=ensureDay(todayStr()); day.screen.purposes.push(''); saveState(); renderSection(); }
function removeScreenPurpose(i){ const day=ensureDay(todayStr()); day.screen.purposes.splice(i,1); saveState(); renderSection(); }
function updateScreenPurpose(i, val){ const day=ensureDay(todayStr()); day.screen.purposes[i]=val; saveState(); }
function saveScreenTime(){
  const day = ensureDay(todayStr());
  day.screen.totalMin = Number(document.getElementById('scr_total').value)||0;
  state.settings.screenLimit = Number(document.getElementById('scr_limit').value)||180;
  const compliant = day.screen.totalMin <= state.settings.screenLimit && day.screen.totalMin>0;
  if(compliant && !day.screen.awarded){ addXP(10); day.screen.awarded=true; }
  else if(!compliant && day.screen.awarded){ addXP(-10); day.screen.awarded=false; }
  saveState(); renderSection();
}

/* generic add/update for logs */
function saveSleepLog(){
  const bed=document.getElementById('sl_bed').value, wake=document.getElementById('sl_wake').value;
  if(!bed||!wake) return;
  if(editingTracker.name==='sleep'){ state.trackerLogs.sleep[editingTracker.index] = Object.assign({}, state.trackerLogs.sleep[editingTracker.index], {bed, wake}); editingTracker={name:null,index:null}; }
  else state.trackerLogs.sleep.push({date:todayStr(), bed, wake});
  saveState(); renderSection();
}
function saveWeightLog(){
  const kg=Number(document.getElementById('wt_kg').value); const date=document.getElementById('wt_date').value||todayStr();
  if(!kg) return;
  if(editingTracker.name==='weight'){ state.trackerLogs.weight[editingTracker.index] = {date, kg}; editingTracker={name:null,index:null}; }
  else state.trackerLogs.weight.push({date, kg});
  saveState(); renderSection();
}
function saveHeightLog(){
  const cm=Number(document.getElementById('ht_cm').value); const date=document.getElementById('ht_date').value||todayStr();
  if(!cm) return;
  if(editingTracker.name==='height'){ state.trackerLogs.height[editingTracker.index] = {date, cm}; editingTracker={name:null,index:null}; }
  else state.trackerLogs.height.push({date, cm});
  saveState(); renderSection();
}
function saveExerciseLog(){
  const gripper=Number(document.getElementById('ex_gripper').value)||0;
  const durationMin=Number(document.getElementById('ex_duration').value)||0;
  const type = exerciseTypeSel;
  if(!gripper && !durationMin) return;
  if(editingTracker.name==='exercise'){ state.trackerLogs.exercise[editingTracker.index] = Object.assign({}, state.trackerLogs.exercise[editingTracker.index], {type, gripper, durationMin}); editingTracker={name:null,index:null}; }
  else state.trackerLogs.exercise.push({date:todayStr(), type, gripper, durationMin});
  saveState(); renderSection();
}
function saveStudyLog(){
  const hours=Number(document.getElementById('sd_hours').value)||0;
  const subject=document.getElementById('sd_subject').value;
  const topic=document.getElementById('sd_topic').value;
  const sessions=Number(document.getElementById('sd_sessions').value)||1;
  if(!hours) return;
  if(editingTracker.name==='study'){
    const old = state.trackerLogs.study[editingTracker.index];
    addXP(Math.round((hours-old.hours)*10));
    state.trackerLogs.study[editingTracker.index] = Object.assign({}, old, {hours, subject, topic, sessions});
    editingTracker={name:null,index:null};
  } else {
    state.trackerLogs.study.push({date:todayStr(), hours, subject, topic, sessions});
    addXP(Math.round(hours*10));
  }
  saveState(); renderSection();
}

/* ========================================================
   SECTION: RANK SYSTEM
======================================================== */
function secRank(){
  const rank = getRankInfo(state.xp);
  return `
  <div class="pagehead"><h2>RANK SYSTEM</h2><div class="sub">14 TIERS · JUNIOR OFFICER → SENIOR OFFICER → RETIRED · TAP A BADGE FOR DETAILS</div></div>
  <div class="panel" style="text-align:center; margin-bottom:16px;">
    <div class="eyebrow">CURRENT PROGRESS</div>
    <div class="stat-big" style="font-size:20px; margin:8px 0;">${rank.xp} XP ${rank.next? '&nbsp;/&nbsp; '+rank.next.xp+' XP TOWARD '+rank.next.name : '&nbsp;— MAX TIER'}</div>
    <div class="bar" style="max-width:520px; margin:0 auto;"><i style="width:${rank.pct}%"></i></div>
  </div>
  <div class="grid c4">
    ${RANKS.map((r,i)=>{
      const achieved = i<=rank.idx; const isCurrent = i===rank.idx;
      const next = RANKS[i+1];
      const rangeTxt = next ? `${r.xp} – ${next.xp-1} XP` : `${r.xp}+ XP`;
      const info = RANK_INFO[i];
      return `<div class="panel" style="text-align:center; cursor:pointer; ${achieved?'':'opacity:.4; filter:grayscale(.6);'} ${isCurrent?'box-shadow:0 0 22px rgba(215,121,241,.5); border-color:var(--lavender);':''}" onclick="openRankInfo(${i})">
        <div class="tag">TIER ${i+1}</div>
        <div class="rankbadge" style="margin:10px auto;">${rankImg(i,42)}</div>
        <div style="font-family:'Orbitron'; font-size:12px; color:${isCurrent?'var(--lavender)':'var(--white)'};">${r.name}</div>
        <div class="stat-label" style="margin-top:6px;">${rangeTxt}</div>
        <div class="stat-label" style="margin-top:4px; color:var(--cyan);">${info.group}${info.stars?' · '+starsRow(info.stars):''}</div>
      </div>`;
    }).join('')}
  </div>
  `;
}

/* ========================================================
   SECTION: MEDALS
======================================================== */
function secMedals(){
  const medals = getMedals();
  return `
  <div class="pagehead"><h2>MEDALS &amp; AWARDS</h2><div class="sub">THE ACHIEVEMENT ROOM</div></div>
  <div class="grid c4">
    ${medals.map(m=>`
      <div class="medal ${m.unlocked?'':'locked'}">
        <div class="mic">${m.icon}</div>
        <div class="mn">${m.name}</div>
        <div class="md">${m.desc}</div>
        <div class="tag" style="margin-top:10px; ${m.unlocked?'color:var(--green); border-color:var(--green);':''}">${m.unlocked?'UNLOCKED':'LOCKED'}</div>
      </div>`).join('')}
  </div>
  `;
}

/* ========================================================
   SECTION: BADGES
======================================================== */
function secBadges(){
  const badges = getBadges();
  return `
  <div class="pagehead"><h2>SIDE ARM BADGE SYSTEM</h2><div class="sub">DSS · FITNESS · SKILLS SPECIALIZATION</div></div>
  <div class="grid c3">
    ${badges.map(b=>`
      <div class="badgechip ${b.unlocked?'':'locked'}">
        <div class="bi">${b.icon}</div>
        <div>
          <div class="bn" style="font-family:'Orbitron'; font-size:12px;">${b.name}</div>
          <div class="stat-label">${b.desc}</div>
        </div>
      </div>`).join('')}
  </div>
  <div class="panel" style="margin-top:16px;">
    <p style="color:var(--dim); font-size:13px;">Earn a Side Arm Badge by excelling in that field for 30+ days, per the OLC Rule Book.</p>
  </div>
  `;
}

/* ========================================================
   SECTION: RULE BOOK — real page-flip book (actual PDF pages)
======================================================== */
let fbIndex = 0;
let fbAnimating = false;

function secRulebook(){
  return `
  <div class="pagehead"><h2>THE RULE BOOK</h2><div class="sub">THE OFFICIAL OPERATING MANUAL OF AGENT SK &amp; OLC — v1.0</div></div>
  <div class="panel flipbook-wrap">
    <div class="flipbook" id="flipbook"></div>
    <div class="fb-controls">
      <button class="fb-navbtn" id="fbPrev" onclick="fbTurn(-1)">‹</button>
      <div class="fb-pagenum" id="fbPageNum">Page 1 / ${RULEBOOK_PAGES.length}</div>
      <button class="fb-navbtn" id="fbNext" onclick="fbTurn(1)">›</button>
    </div>
    <div class="idcard-hint" style="margin-top:6px;">CLICK THE ARROWS TO TURN PAGES</div>
  </div>
  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">✎</span>ADDITIONAL PERSONAL NOTES</h3>
    <textarea id="rb_custom" rows="5" placeholder="Add your own amendments to the constitution...">${esc(state.ruleBookCustom)}</textarea>
    <button class="btn sm" style="margin-top:8px;" onclick="saveCustomRules()">Save</button>
  </div>
  `;
}
function fbRenderBase(){
  const el = document.getElementById('flipbook');
  if(!el) return;
  el.innerHTML = `<div class="fb-page"><img src="${RULEBOOK_PAGES[fbIndex]}"></div>`;
  document.getElementById('fbPageNum').textContent = `Page ${fbIndex+1} / ${RULEBOOK_PAGES.length}`;
  document.getElementById('fbPrev').disabled = fbIndex<=0;
  document.getElementById('fbNext').disabled = fbIndex>=RULEBOOK_PAGES.length-1;
}
function fbTurn(dir){
  if(fbAnimating) return;
  const next = fbIndex + dir;
  if(next<0 || next>=RULEBOOK_PAGES.length) return;
  fbAnimating = true;
  const el = document.getElementById('flipbook');
  const flip = document.createElement('div');
  flip.className = 'fb-flip';
  flip.innerHTML = `
    <div class="fb-face fb-front"><img src="${RULEBOOK_PAGES[fbIndex]}"></div>
    <div class="fb-face fb-back"><img src="${RULEBOOK_PAGES[next]}"></div>`;
  el.appendChild(flip);
  void flip.offsetWidth;
  flip.classList.add(dir>0 ? 'turning-fwd' : 'turning-back');
  setTimeout(()=>{
    fbIndex = next;
    fbAnimating = false;
    fbRenderBase();
  }, 680);
}
function saveCustomRules(){ state.ruleBookCustom = document.getElementById('rb_custom').value; saveState(); renderSection(); }

/* ========================================================
   SECTION: ARCHIVES & HISTORY
======================================================== */
function secArchives(){
  const dates = Object.keys(state.dailyLogs).sort((a,b)=>a<b?1:-1);
  const rankLog = getRankInfo(state.xp);
  return `
  <div class="pagehead"><h2>HISTORY &amp; ARCHIVES</h2><div class="sub">NOTHING GETS DELETED — ${dates.length} DAYS RECORDED</div></div>

  <div class="panel">
    <h3><span class="ic">🗄</span>DAILY REPORTS <span style="font-weight:400; color:var(--dim); font-size:11px;">(last 2 months · click a row for full detail)</span></h3>
    <table>
      <tr><th>Date</th><th>DSS</th><th>Goals</th><th>Woke On Time</th><th>EOD Logged</th></tr>
      ${dates.length ? dates.slice(0,62).map(d=>{
        const day = state.dailyLogs[d];
        const done = state.goals.filter(g=>goalStatus(day,g.id)==='full').length;
        const hasEod = day.eod.well || day.eod.failed || day.eod.learned || day.eod.tomorrow;
        return `<tr style="cursor:pointer;" onclick="openDayDetail('${d}')"><td>${d}</td><td>${getDSS(d)}</td><td>${done}/${state.goals.length}</td><td>${day.wokeOnTime?'✓':'—'}</td><td>${hasEod?'✓':'—'}</td></tr>`;
      }).join('') : '<tr><td colspan="5" class="empty">No history yet — complete your first day</td></tr>'}
    </table>
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">📓</span>PERSONAL JOURNAL (END OF DAY REVIEWS)</h3>
    ${dates.filter(d=>{const e=state.dailyLogs[d].eod; return e.well||e.failed||e.learned||e.tomorrow;}).slice(0,15).map(d=>{
      const e = state.dailyLogs[d].eod;
      return `<div class="timeline-item">
        <div>
          <div class="mono" style="color:var(--cyan); font-size:12px;">${d}</div>
          ${e.well?`<div><b style="color:var(--dim);">Went well:</b> ${esc(e.well)}</div>`:''}
          ${e.failed?`<div><b style="color:var(--dim);">Failed:</b> ${esc(e.failed)}</div>`:''}
          ${e.learned?`<div><b style="color:var(--dim);">Learned:</b> ${esc(e.learned)}</div>`:''}
          ${e.tomorrow?`<div><b style="color:var(--dim);">Tomorrow:</b> ${esc(e.tomorrow)}</div>`:''}
        </div>
      </div>`;
    }).join('') || '<div class="empty">No journal entries yet</div>'}
  </div>

  <div class="panel" style="margin-top:16px;">
    <h3><span class="ic">★</span>MISSION TIMELINE</h3>
    <div class="timeline-item"><div><div class="mono" style="color:var(--cyan); font-size:12px;">${state.profile.startDate||'—'}</div>Mission commenced.</div></div>
    <div class="timeline-item"><div><div class="mono" style="color:var(--cyan); font-size:12px;">${todayStr()}</div>Currently rank <b style="color:var(--lavender);">${rankLog.cur.name}</b> with ${state.xp} XP.</div></div>
  </div>
  `;
}

/* ========================================================
   THEME
======================================================== */
function setTheme(theme){
  state.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtnDark')?.classList.toggle('active', theme==='dark');
  document.getElementById('themeBtnLight')?.classList.toggle('active', theme==='light');
  saveState();
}

/* ========================================================
   ID CARD 3D FLIP MODAL
======================================================== */
function openIdCard(){
  document.getElementById('idCardModal').style.display = 'flex';
  document.getElementById('idCard3d').classList.remove('flipped');
}
function closeIdCard(){ document.getElementById('idCardModal').style.display = 'none'; }
function flipIdCard(){ document.getElementById('idCard3d').classList.toggle('flipped'); }
function openPhotoModal(){ document.getElementById('photoModal').style.display = 'flex'; }
function closePhotoModal(){ document.getElementById('photoModal').style.display = 'none'; }

function openRankInfo(idx){
  const r = RANKS[idx];
  const info = RANK_INFO[idx];
  const next = RANKS[idx+1];
  const rangeTxt = next ? `${r.xp} – ${next.xp-1} XP` : `${r.xp}+ XP`;
  document.getElementById('rankInfoBody').innerHTML = `
    <div style="text-align:center;">
      <img src="${RANK_IMAGES[RANK_KEYS[idx]]}" style="width:90px; filter:drop-shadow(0 0 14px rgba(215,121,241,.6));">
      <h3 style="justify-content:center; margin-top:10px; color:var(--lavender);">${r.name}</h3>
      <div style="display:flex; gap:8px; justify-content:center; margin:10px 0; flex-wrap:wrap;">
        <div class="tag">TIER ${idx+1} / 14</div>
        <div class="tag">${info.group.toUpperCase()}</div>
        <div class="tag">${rangeTxt}</div>
      </div>
      ${info.stars ? `<div style="color:var(--gold); font-size:20px; letter-spacing:3px; margin-bottom:10px;">${starsRow(info.stars)}</div>` : ''}
      <p style="text-align:left; color:var(--dim); font-size:14px; line-height:1.7;">${esc(info.desc)}</p>
    </div>`;
  document.getElementById('rankInfoModal').style.display = 'flex';
}
function closeRankInfo(){ document.getElementById('rankInfoModal').style.display = 'none'; }

function openDayDetail(date){
  const day = state.dailyLogs[date];
  if(!day) return;
  const goalsHtml = state.goals.map(g=>{
    const s = goalStatus(day, g.id);
    const eff = goalXPEffect(g, s);
    const lbl = s==='full'?'FULL':s==='half'?'HALF':s==='fail'?'FAIL':'—';
    const col = s==='full'?'var(--green)':s==='half'?'var(--gold)':s==='fail'?'var(--danger)':'var(--dim)';
    return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
      <span>${esc(g.label)}</span><span style="color:${col}; font-family:'Share Tech Mono'; font-size:12px;">${lbl} ${s?((eff>0?'+':'')+eff.toFixed(1)+' XP'):''}</span>
    </div>`;
  }).join('') || '<div class="empty">No goals defined that day</div>';
  const ratingsHtml = RATING_CATS.map(c=>`<span class="tag" style="margin-right:6px;">${c.icon} ${c.label}: ${day.ratings[c.key]||0}★</span>`).join('');
  const hasEod = day.eod.well || day.eod.failed || day.eod.learned || day.eod.tomorrow;
  document.getElementById('dayDetailBody').innerHTML = `
    <h3 style="color:var(--lavender);">${fmtDateLong(date)}</h3>
    <div class="stat-label" style="margin:6px 0 14px;">DSS: ${getDSS(date)} / 100 &nbsp;·&nbsp; Woke On Time: ${day.wokeOnTime?'✓':'—'} &nbsp;·&nbsp; Reading: ${day.readingDone?'✓':'—'}</div>
    <h3 style="font-size:13px;">GOALS</h3>
    ${goalsHtml}
    <h3 style="font-size:13px; margin-top:14px;">RATINGS</h3>
    <div>${ratingsHtml}</div>
    ${hasEod ? `<h3 style="font-size:13px; margin-top:14px;">END OF DAY REVIEW</h3>
      ${day.eod.well?`<div><b style="color:var(--dim);">Went well:</b> ${esc(day.eod.well)}</div>`:''}
      ${day.eod.failed?`<div><b style="color:var(--dim);">Failed:</b> ${esc(day.eod.failed)}</div>`:''}
      ${day.eod.learned?`<div><b style="color:var(--dim);">Learned:</b> ${esc(day.eod.learned)}</div>`:''}
      ${day.eod.tomorrow?`<div><b style="color:var(--dim);">Tomorrow:</b> ${esc(day.eod.tomorrow)}</div>`:''}` : ''}
  `;
  document.getElementById('dayDetailModal').style.display = 'flex';
}
function closeDayDetail(){ document.getElementById('dayDetailModal').style.display = 'none'; }

/* ========================================================
   AUTH — Create ID / Add ID (no email/password, multi-account)
======================================================== */
function showAuthTab(tab){
  document.getElementById('authTabCreate').classList.toggle('active', tab==='create');
  document.getElementById('authTabLogin').classList.toggle('active', tab==='login');
  document.getElementById('authCreatePane').style.display = tab==='create' ? '' : 'none';
  document.getElementById('authLoginPane').style.display = tab==='login' ? '' : 'none';
  document.getElementById('authError').textContent='';
}
/* ========================================================
   OPTIONAL BACKEND SYNC
   Leave API_BASE_URL empty to run fully offline on localStorage only
   (perfect for GitHub Pages with no server). Set it to a deployed
   instance of /backend (see backend/server.js) to get real cross-device
   accounts + data. The app always keeps a local copy too, so it still
   works if the backend is briefly unreachable.
======================================================== */
const API_BASE_URL = ''; // e.g. 'https://your-olc-backend.onrender.com'

async function apiSignup(codename, codeid){
  if(!API_BASE_URL) return null;
  try{
    const res = await fetch(API_BASE_URL+'/api/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codename,codeid}) });
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}
async function apiLogin(codename, codeid){
  if(!API_BASE_URL) return null;
  try{
    const res = await fetch(API_BASE_URL+'/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codename,codeid}) });
    if(!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}
async function apiSaveState(accountId, stateObj){
  if(!API_BASE_URL || !accountId) return;
  try{
    await fetch(API_BASE_URL+'/api/state/'+accountId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(stateObj) });
  }catch(e){ /* offline — local copy already saved */ }
}

/* Reconciles a local account record with the backend's canonical account id.
   Prevents the "I made this ID locally before the backend existed" bug,
   where a device could otherwise end up with two disconnected copies of
   the same account. Whatever the backend calls this account IS the account
   — a pre-existing local-only copy gets migrated onto that id. */
function reconcileLocalAccount(codename, codeid, canonicalId){
  const accounts = getAccounts();
  let acc = accounts.find(a => a.codename===codename && a.codeid===codeid);
  if(acc && acc.id !== canonicalId){
    // Migrate any locally-cached state from the old id to the canonical id.
    try{
      const oldRaw = localStorage.getItem(stateKeyFor(acc.id));
      if(oldRaw && !localStorage.getItem(stateKeyFor(canonicalId))){
        localStorage.setItem(stateKeyFor(canonicalId), oldRaw);
      }
      localStorage.removeItem(stateKeyFor(acc.id));
    }catch(e){}
    acc.id = canonicalId;
    saveAccounts(accounts);
  } else if(!acc){
    acc = { id: canonicalId, codename, codeid };
    accounts.push(acc);
    saveAccounts(accounts);
  }
  return acc;
}

async function doCreateID(){
  const codename = document.getElementById('ac_codename').value.trim();
  const codeid = document.getElementById('ac_codeid').value.trim();
  const err = document.getElementById('authError');
  if(!codename || !codeid){ err.textContent = 'Enter both a Codename and a Code ID.'; return; }

  // Try the backend first (if configured) so the same ID works across devices,
  // exactly like adding a Gmail account: it either finds your existing account
  // or creates a new one on the server, and the backend's id is always the
  // real, canonical one.
  const remote = await apiSignup(codename, codeid);

  if(remote){
    const acc = reconcileLocalAccount(codename, codeid, remote.accountId);
    activeAccountId = acc.id;
    if(remote.state){
      state = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_STATE)), remote.state);
      localStorage.setItem(stateKeyFor(acc.id), JSON.stringify(state));
    } else {
      // No server copy yet — use whatever's cached locally (migrated above) or a fresh default.
      await loadStateFor(acc.id);
      state.profile.codename = state.profile.codename || codename;
      saveState();
    }
    sessionUnlocked = true; enterApp(); return;
  }

  // No backend configured / unreachable — fall back to local-only accounts.
  let acc = findAccount(codename, codeid);
  if(acc){ await loadStateFor(acc.id); sessionUnlocked = true; enterApp(); return; }

  const accounts = getAccounts();
  acc = { id: uid('acct'), codename, codeid };
  accounts.push(acc);
  saveAccounts(accounts);
  await loadStateFor(acc.id); // fresh DEFAULT_STATE for this new account
  state.profile.codename = codename;
  saveState();
  sessionUnlocked = true;
  enterApp();
}
async function doLogin(){
  const codename = document.getElementById('al_codename').value.trim();
  const codeid = document.getElementById('al_codeid').value.trim();
  const err = document.getElementById('authError');

  const remote = await apiLogin(codename, codeid);
  if(remote){
    const acc = reconcileLocalAccount(codename, codeid, remote.accountId);
    activeAccountId = acc.id;
    state = remote.state ? Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_STATE)), remote.state) : JSON.parse(JSON.stringify(DEFAULT_STATE));
    localStorage.setItem(stateKeyFor(acc.id), JSON.stringify(state));
    sessionUnlocked = true; enterApp(); return;
  }

  const acc = findAccount(codename, codeid);
  if(!acc){ err.textContent = 'No matching ID found on this device, and the backend is unreachable right now. Check your connection, or use Create ID if this is genuinely new.'; return; }
  await loadStateFor(acc.id);
  sessionUnlocked = true;
  enterApp();
}
function lockApp(){
  sessionUnlocked = false;
  activeAccountId = null;
  state = null;
  document.getElementById('app').classList.remove('ready');
  document.getElementById('authGate').style.display = 'flex';
  showAuthTab(getAccounts().length ? 'login' : 'create');
  document.getElementById('ac_codename').value='';
  document.getElementById('ac_codeid').value='';
  document.getElementById('al_codename').value='';
  document.getElementById('al_codeid').value='';
}
function showAuthGate(){
  document.getElementById('authGate').style.display = 'flex';
  showAuthTab(getAccounts().length ? 'login' : 'create');
}
function enterApp(){
  document.getElementById('authGate').style.display = 'none';
  runBootAndApp();
}

/* ========================================================
   INIT
======================================================== */
function runBootAndApp(){
  rollover();
  setTheme(state.settings.theme || 'dark');
  syncProfileImagesToDOM();
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.sec==='home'));
  renderAll();
  document.getElementById('boot').style.display='flex';
  document.getElementById('boot').style.opacity='1';
  document.querySelectorAll('#boot .bootline').forEach(el=>{ el.style.animation='none'; el.offsetHeight; el.style.animation=''; el.classList.add('blink-in'); });
  setTimeout(()=>{
    document.getElementById('boot').style.opacity='0';
    document.getElementById('app').classList.add('ready');
    setTimeout(()=>{ document.getElementById('boot').style.display='none'; }, 650);
  }, 2600);
}

/* ========================================================
   PWA — "Install App" support
======================================================== */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = 'none';
});
function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; }
async function doInstallApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
    return;
  }
  if(isIOS()){
    alert('To install OLC on iPhone/iPad:\n\n1. Tap the Share icon (square with an arrow) in Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"\n\nOLC will then open full-screen from your home screen like a real app.');
    return;
  }
  alert('Your browser doesn\'t support one-tap install here. Look for "Add to Home Screen" or "Install App" in your browser\'s menu (usually the ⋮ or share icon).');
}
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}
function initInstallButtonVisibility(){
  const btn = document.getElementById('installBtn');
  if(!btn) return;
  if(isStandalone()){ btn.style.display = 'none'; return; }
  if(isIOS()){ btn.style.display = ''; } // iOS never fires beforeinstallprompt, so show our manual-instructions button
}

async function init(){
  tickClock(); setInterval(tickClock, 1000);
  setInterval(()=>{ if(state) { rollover(); renderTopbar(); } }, 30000);
  document.getElementById('boot').style.display='none';
  registerServiceWorker();
  initInstallButtonVisibility();
  showAuthGate();
}
init();
