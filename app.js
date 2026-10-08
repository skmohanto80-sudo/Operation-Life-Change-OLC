/* ============ OLC CENTRAL COMMAND SYSTEM — CORE ============ */

const RANK_KEYS = ['agent','lance_naik','naik','sergent','cadet','lieutenant','captain','major','colonel','brigedier','commander','jawan','general','field_marshal'];
const RANK_IMAGES = {};
RANK_KEYS.forEach(k => RANK_IMAGES[k] = `assets/ranks/${k}.png`);
const PROFILE_IMG_SRC = 'assets/profile.png';
const ID_FRONT_SRC = 'assets/id_front.jpg';
const ID_BACK_SRC = 'assets/id_back.jpg';
const RADHA_KRISHNA_SRC = 'assets/radha_krishna.jpg';
const DEFAULT_RULEBOOK_PAGES = Array.from({length:23}, (_,i) => `assets/rulebook/page-${String(i+1).padStart(2,'0')}.jpg`);
function rbPages(){ return (state && state.rulebookPages && state.rulebookPages.length) ? state.rulebookPages : DEFAULT_RULEBOOK_PAGES; }
function ensureCustomRulebook(){ if(!state.rulebookPages || !state.rulebookPages.length) state.rulebookPages = DEFAULT_RULEBOOK_PAGES.slice(); }
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
function rankImg(idx, w){ return `<img src="${RANK_IMAGES[RANK_KEYS[idx]]}" style="width:${w}px; filter:drop-shadow(0 0 10px color-mix(in srgb, var(--lavender) 50%, transparent)); cursor:pointer;" onclick="openRankInfo(${idx})">`; }

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

const SUBJECT_OPTIONS = ['Bangla', 'English', 'Mathematics', 'Science', 'BGS'];

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
  rulebookPages:null, // null = use bundled default pages; array = user's own custom pages
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
    screen:{count:0,lastDate:null,_pc:0,_pd:null},
  },
  dailyLogs:{},
  trackerLogs:{ weight:[], height:[], exercise:[], study:[], sleep:[] },
  settings:{ waterGoal:2.5, screenLimit:180, theme:'dark' },
  xpL:{ m0:0 }, // XP ledger: one entry per device so XP earned on two devices at once both count
  divisions:[], // [{id,division,name,logo,flag,colors,systemTheme,duration,mission,objective,books,start,end,reasonLog}]
  activeDivisionId:null,
  books:[], // OLC Book library: [{id,title,cover,ratio,pages:[{id,type,img,text,title}]}]
  journal:{ title:'My OLC Journal', subtitle:'', front:{ title:'', subtitle:'', img:null, color:'' }, back:{ title:'The End', subtitle:'', img:null, color:'' }, pages:[] },
  rankOverrides:null, // null = use built-in XP thresholds; else array of 14 custom XP numbers
  customImages:{ radhaKrishna:null }, // null = use bundled default image
  ruleBookCustom:'',
  customMedals:[], // [{id,name,requirements,connection,connectionKey,connectionBaseline,target,current,colors,medalImg,ribbonImg,timesEarned}]
  customBadges:[], // [{id,name,requirements,connection,connectionKey,connectionBaseline,target,current,colors,badgeImg,timesEarned}]
  achievements:[], // permanent log: [{id,kind:'medal'|'badge',medalId,name,date,colors,medalImg,ribbonImg,badgeImg}]
  ruleBookNotes:[], // [{id,date,text}] — dated amendments, replaces the old single ruleBookCustom blob
};

let state = null;
let currentSection = 'home';
let saveTimer = null;
let editingTracker = { name:null, index:null };

function todayStr(d){ const x=d?new Date(d):new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function yestOf(dateStr){ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()-1); return todayStr(d); }
function tomorrowOf(dateStr){ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+1); return todayStr(d); }
function isYesterday(dateStr, refToday){ if(!dateStr) return false; return dateStr === yestOf(refToday); }
function fmtDateLong(dateStr){ if(!dateStr) return '—'; const d=new Date(dateStr+'T00:00:00'); return d.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'}); }
function daysBetween(a,b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(p){ return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* ---------- user-uploaded photo / ID card ---------- */
function currentProfilePhoto(){ return (state && state.profile.photo) || PROFILE_IMG_SRC; }
function currentRKImage(){ return (state && state.customImages && state.customImages.radhaKrishna) || RADHA_KRISHNA_SRC; }
function currentIdFront(){ return (state && state.idcard && state.idcard.front) || ID_FRONT_SRC; }
function currentIdBack(){ return (state && state.idcard && state.idcard.back) || ID_BACK_SRC; }
function syncProfileImagesToDOM(){
  const av = document.getElementById('topbarAvatarImg'); if(av) av.src = currentProfilePhoto();
  const pm = document.getElementById('photoModalImg'); if(pm) pm.src = currentProfilePhoto();
  const idf = document.getElementById('idCardFrontImg'); if(idf) idf.src = currentIdFront();
  const idb = document.getElementById('idCardBackImg'); if(idb) idb.src = currentIdBack();
  const rk = document.getElementById('rkModalImg'); if(rk) rk.src = currentRKImage();
}
async function uploadRKImage(input){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await fileToCompressedDataURL(file, 600, 0.85);
    if(!state.customImages) state.customImages = { radhaKrishna:null };
    state.customImages.radhaKrishna = dataUrl;
    saveState(); syncProfileImagesToDOM(); renderSection();
  }catch(e){ alert('Could not read that image — try a different file.'); }
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
    if(typeof setAccountAvatarFromFile==='function') setAccountAvatarFromFile(file);
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
      screen:{ totalMin:0, devices:[], awarded:false, xpApplied:0 }, // devices: [{id,name,purpose,apps:[{id,name,min}]}]
      planner:{ morning:'', afternoon:'', night:'' },
      eod:{ well:'', failed:'', learned:'', tomorrow:'' },
    };
  }
  const d = state.dailyLogs[date];
  if(!d.ratings) d.ratings = { study:0, exercise:0, spiritual:0, mood:0 };
  if(!d.screen) d.screen = { totalMin:0, devices:[], awarded:false, xpApplied:0 };
  if(d.screen.xpApplied===undefined) d.screen.xpApplied = 0;
  // Migrate any legacy flat {devices:[{name,min}], apps:[...], purposes:[...]} shape
  // from before apps/purposes lived under each device.
  if(d.screen.devices && d.screen.devices.some(dv => dv && !Array.isArray(dv.apps))){
    const oldDevices = d.screen.devices;
    const oldApps = d.screen.apps || [];
    const oldPurpose = (d.screen.purposes||[]).join(', ');
    d.screen.devices = oldDevices.map(dv => ({
      id: uid('dev'), name: dv.name||'', purpose: oldPurpose,
      apps: oldApps.map(a => ({ id: uid('app'), name:a.name||'', min:a.min||0 }))
    }));
    delete d.screen.apps; delete d.screen.purposes;
  }
  if(d.readingDone===undefined) d.readingDone=false;
  return d;
}

/* storage, accounts, sync and app-lock now live in auth.js */

/* ---------- rank / xp ---------- */
function rankXP(i){ return (state && state.rankOverrides && state.rankOverrides[i]!=null) ? state.rankOverrides[i] : RANKS[i].xp; }
function effectiveRanks(){ return RANKS.map((r,i)=>({ name:r.name, xp: rankXP(i) })); }
function getRankInfo(xp){
  const ranks = effectiveRanks();
  let idx=0;
  for(let i=0;i<ranks.length;i++){ if(xp>=ranks[i].xp) idx=i; }
  const cur = ranks[idx];
  const next = ranks[idx+1] || null;
  const span = next ? next.xp - cur.xp : 1;
  const into = xp - cur.xp;
  const pct = next ? clamp(into/span*100,0,100) : 100;
  return { idx, cur, next, into, span, pct, xp };
}
function addXP(n){ const k = 'd_' + deviceId; if(!isPlain(state.xpL)) state.xpL = { m0: Number(state.xp)||0 }; state.xpL[k] = (Number(state.xpL[k])||0) + n; OLCMerge.derive(state); } // XP can go negative — Fail penalties must actually subtract

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
function goalsForDate(date){
  return state.goals.filter(g => !g.effectiveFrom || g.effectiveFrom <= date);
}
function recomputeHabitStreak(date){
  const day = ensureDay(date);
  const active = goalsForDate(date);
  const allDone = active.length>0 && active.every(g => goalStatus(day, g.id)==='full');
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
  const when = document.getElementById('newGoalWhen').value; // 'today' | 'tomorrow'
  if(!label) return;
  // Every new goal is pinned to the date it was actually created (or tomorrow, if
  // scheduled ahead) — never left open-ended — so it can never leak backward into
  // days before it existed, in History, Day Detail, or DSS.
  const effectiveFrom = when==='tomorrow' ? tomorrowOf(todayStr()) : todayStr();
  state.goals.push({ id: uid('g'), label, xp, effectiveFrom });
  saveState(); renderSection();
}
function editGoal(id){
  const g = state.goals.find(x=>x.id===id); if(!g) return;
  const newLabel = prompt('Goal name:', g.label);
  if(newLabel===null) return;
  const newXp = prompt('XP value (full completion):', g.xp);
  if(newXp===null) return;
  const newFrom = prompt('Active from date (YYYY-MM-DD). Leave this blank ONLY if this goal has genuinely always applied — otherwise set the day it actually started, so past History stays accurate:', g.effectiveFrom||'');
  if(newFrom===null) return;
  g.label = newLabel.trim()||g.label;
  g.xp = Number(newXp)||g.xp;
  g.effectiveFrom = newFrom.trim() || null;
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
  const active = goalsForDate(date);
  if(!active.length) return 0;
  const sum = active.reduce((a,g)=>{ const s=goalStatus(day,g.id); return a + (s==='full'?1:s==='half'?0.5:0); },0);
  return Math.round(sum / active.length * 100);
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
const MEDAL_RIBBONS = {
  discipline:['#6753b7','#d779f1','#6753b7'],
  purity:['#ffffff','#01c4c4','#ffffff'],
  study:['#0a3d62','#01c4c4','#0a3d62'],
  spiritual:['#8e3fc7','#ffd23f','#8e3fc7'],
  consistency:['#0a5c36','#3ee08a','#0a5c36'],
  comeback:['#7a1030','#ff4d6d','#7a1030'],
  focus:['#ffd23f','#01c4c4','#ffd23f'],
  leadership:['#6753b7','#d779f1','#6753b7'],
  selfcontrol:['#a5770a','#ffd23f','#a5770a'],
  commander:['#ff4d6d','#ffd23f','#01c4c4'],
};
const BADGE_RIBBONS = {
  dss:['#6753b7','#d779f1','#6753b7'],
  fitness:['#0a5c36','#3ee08a','#0a5c36'],
  skills:['#0a3d62','#01c4c4','#0a3d62'],
};
function getMedals(){
  const totalStudyHrs = state.trackerLogs.study.reduce((a,b)=>a+Number(b.hours||0),0);
  const rank = getRankInfo(state.xp);
  const raw = [
    { id:'discipline', name:'Discipline Medal', desc:'30 Days No Discipline Violation', current: state.streaks.habit.count, target:30 },
    { id:'purity', name:'Purity Medal', desc:'30 Days Pure Mind & Body', current: state.streaks.habit.count, target:30 },
    { id:'study', name:'Study Excellence Medal', desc:'100 study hours logged', current: totalStudyHrs, target:100 },
    { id:'spiritual', name:'Spiritual Warrior Medal', desc:'30+ Days Daily Spiritual Practice', current: state.streaks.spiritual.count, target:30 },
    { id:'consistency', name:'Consistency Medal', desc:'90 Days Consistency Streak', current: state.streaks.habit.count, target:90 },
    { id:'comeback', name:'Comeback Medal', desc:'Overcame a relapse & returned', current: (state.streaks.habit._pc>0 && state.streaks.habit.count>=7)?1:0, target:1 },
    { id:'focus', name:'Focus Medal', desc:'50+ hours logged in Study Tracker', current: totalStudyHrs, target:50 },
    { id:'leadership', name:'Leadership Medal', desc:'Reach Colonel rank or above', current: rank.idx, target:8 },
    { id:'selfcontrol', name:'Self Control Medal', desc:'21-day Habit streak', current: state.streaks.habit.count, target:21 },
    { id:'commander', name:'Mission Commander Medal', desc:'Reached Field Marshal', current: rank.idx, target:13 },
  ];
  return raw.map(m => Object.assign(m, { unlocked: m.current>=m.target, ribbon: MEDAL_RIBBONS[m.id] }));
}
function getBadges(){
  const totalStudyHrs = state.trackerLogs.study.reduce((a,b)=>a+Number(b.hours||0),0);
  const raw = [
    { id:'dss', name:'DSS Badge', desc:'Guardian of Discipline, Spirituality & Study — 30 days Habit streak', current: state.streaks.habit.count, target:30 },
    { id:'fitness', name:'Fitness Badge', desc:'Warrior of Physical & Mental Strength — 30-day Fitness streak', current: state.streaks.fitness.count, target:30 },
    { id:'skills', name:'Skills Badge', desc:'Expert in Skills & Knowledge — 100 study hours', current: totalStudyHrs, target:100 },
  ];
  return raw.map(b => Object.assign(b, { unlocked: b.current>=b.target, ribbon: BADGE_RIBBONS[b.id] }));
}
/* Real army-style medal: ribbon strip + hanging medallion. ribbonOnly=true renders just the ribbon bar chip. */
function medalSVG(colors, unlocked, ribbonOnly){
  const stripes = colors.map((c,i)=>`<rect x="${i*(30/colors.length)}" y="0" width="${30/colors.length+0.5}" height="14" fill="${c}"/>`).join('');
  const grey = unlocked ? '' : `<rect x="0" y="0" width="30" height="14" fill="rgba(0,0,0,0.55)"/>`;
  if(ribbonOnly){
    return `<svg viewBox="0 0 30 14" width="30" height="14">${stripes}${grey}</svg>`;
  }
  const medalColor = unlocked ? '#ffd23f' : '#555';
  return `<svg viewBox="0 0 30 60" width="30" height="60">
    <g>${stripes}${grey}</g>
    <line x1="8" y1="14" x2="12" y2="30" stroke="#8a7a4a" stroke-width="1.5"/>
    <line x1="22" y1="14" x2="18" y2="30" stroke="#8a7a4a" stroke-width="1.5"/>
    <circle cx="15" cy="42" r="14" fill="${medalColor}" stroke="#7a6a1a" stroke-width="1.5"/>
    <path d="M15 33 L17.5 39 L24 39 L18.7 43 L20.7 49.5 L15 45.5 L9.3 49.5 L11.3 43 L6 39 L12.5 39 Z" fill="${unlocked?'#fff8e0':'#333'}"/>
  </svg>`;
}

/* ========================================================
   TRACKED METRICS — shared "connection" engine for Medals & Badges
   Lets a medal/badge link to a real streak or lifetime stat so it
   can fill its bar and claim itself automatically, without ever
   touching the real streak/XP numbers it's reading from.
======================================================== */
const TRACK_OPTIONS = [
  { key:'manual', label:"Manual — I'll update it myself" },
  { key:'streak_study', label:'Study Streak' },
  { key:'streak_fitness', label:'Fitness Streak' },
  { key:'streak_spiritual', label:'Spiritual Streak' },
  { key:'streak_reading', label:'Reading Streak' },
  { key:'streak_wakeup', label:'Wake-Up Streak' },
  { key:'streak_habit', label:'Habit Streak (Perfect Days)' },
  { key:'streak_screen', label:'Screen Discipline Streak' },
  { key:'total_xp', label:'Total XP Earned' },
  { key:'total_study_hours', label:'Total Study Hours (lifetime)' },
  { key:'total_gripper', label:'Total Gripper Count (lifetime)' },
  { key:'total_exercise_sessions', label:'Total Exercise Sessions Logged' },
];
function trackLabel(key){ return (TRACK_OPTIONS.find(o=>o.key===key)||{}).label || 'Manual'; }
function trackedMetricValue(key){
  switch(key){
    case 'streak_study': return state.streaks.study.count;
    case 'streak_fitness': return state.streaks.fitness.count;
    case 'streak_spiritual': return state.streaks.spiritual.count;
    case 'streak_reading': return state.streaks.reading.count;
    case 'streak_wakeup': return state.streaks.wakeup.count;
    case 'streak_habit': return state.streaks.habit.count;
    case 'streak_screen': return state.streaks.screen.count;
    case 'total_xp': return state.xp;
    case 'total_study_hours': return (state.trackerLogs.study||[]).reduce((a,e)=>a+(Number(e.hours)||0),0);
    case 'total_gripper': return (state.trackerLogs.exercise||[]).reduce((a,e)=>a+(Number(e.gripper)||0),0);
    case 'total_exercise_sessions': return (state.trackerLogs.exercise||[]).length;
    default: return null; // 'manual' or unrecognized — not auto-tracked
  }
}
/* Live progress for a connected item is "how much the metric has grown since
   the baseline" — never the metric's raw value — so claiming can reset the
   bar without ever rewinding the real streak/XP/stat it's watching. */
function trackedCurrent(item){
  if(!item.connectionKey || item.connectionKey==='manual') return Number(item.current)||0;
  const v = trackedMetricValue(item.connectionKey);
  if(v===null) return Number(item.current)||0;
  if(item.connectionBaseline===undefined) return 0;
  return Math.max(0, v - item.connectionBaseline);
}
/* Checked on every render: auto-claims any connected medal/badge whose live
   progress has reached its target, logs it to Achievements, then re-baselines
   so it must grow by the target again before claiming a second time. */
/* every achievement keeps a snapshot of WHEN / HOW / WHY it was earned, so it can be opened and read later */
function makeAchievement(kind, item, method, extra){
  const how = method==='auto' ? ('Tracked automatically from "'+trackLabel(item.connectionKey)+'" — reached the target of '+item.target+'.')
    : method==='direct' ? 'Added straight to Achievements.'
    : ('Claimed by hand after the progress bar reached its target of '+item.target+'.');
  return Object.assign({
    id: uid('ach'), kind, medalId: item.id, name: item.name, date: todayStr(), at: Date.now(),
    colors: item.colors, medalImg: item.medalImg, ribbonImg: item.ribbonImg, badgeImg: item.badgeImg,
    requirements: item.requirements||'', how, why: item.why||'', note: item.connection||'', method, target: item.target,
    connectionKey: item.connectionKey||'manual', earnedNo: (item.timesEarned||0)+1,
  }, extra||{});
}
/* standard (built-in) medals & badges are logged the first time they unlock */
function checkStandardUnlocks(){
  let changed = false;
  const add = (kind, m) => {
    const id = 'ach_std_'+kind+'_'+m.id;
    if(!m.unlocked || state.achievements.some(a=>a.id===id)) return;
    state.achievements.push({ id, kind, std:true, medalId:m.id, name:m.name, date:todayStr(), at:Date.now(), colors:m.ribbon,
      requirements:m.desc, how:'Unlocked automatically: '+m.desc+'.', why:'', method:'auto', target:m.target, earnedNo:1 });
    changed = true;
  };
  getMedals().forEach(m=>add('medal',m)); getBadges().forEach(b=>add('badge',b));
  if(changed) saveState();
}
function checkAutoClaims(){
  if(!state) return;
  let changed = false;
  const process = (list, kind) => (list||[]).forEach(item=>{
    if(!item.connectionKey || item.connectionKey==='manual') return;
    const v = trackedMetricValue(item.connectionKey);
    if(v===null) return;
    if(item.connectionBaseline===undefined){ item.connectionBaseline = v; changed = true; return; }
    const progress = Math.max(0, v - item.connectionBaseline);
    if(progress >= item.target){
      state.achievements.unshift(makeAchievement(kind, item, 'auto'));
      item.timesEarned = (item.timesEarned||0) + 1;
      item.connectionBaseline = v;
      changed = true;
    }
  });
  process(state.customMedals, 'medal');
  process(state.customBadges, 'badge');
  if(changed) saveState();
}

/* ========================================================
   CUSTOM MEDAL SYSTEM — user-created, repeatable medals
   Each medal has its own progress bar toward a target you set —
   either updated by hand, or auto-tracked from a real streak/stat.
   Reaching the target claims it: the claim is logged forever in
   Achievements and on the Agent Profile ribbon bar, then the bar
   resets to 0 so the same medal can be earned again.
======================================================== */
const DEFAULT_MEDAL_COLORS = ['#6753b7','#d779f1','#6753b7'];
let medalForm = { open:false, editId:null, medalImg:null, ribbonImg:null };

function medalGraphic(m, size){
  size = size || 60;
  if(m.medalImg) return `<img src="${m.medalImg}" style="width:${size}px; height:${size}px; object-fit:contain; border-radius:50%;">`;
  return medalSVG((m.colors && m.colors.length===3) ? m.colors : DEFAULT_MEDAL_COLORS, true, false);
}
function ribbonGraphic(m){
  if(m.ribbonImg) return `<img src="${m.ribbonImg}" style="width:30px; height:14px; object-fit:cover; border-radius:2px;">`;
  return medalSVG((m.colors && m.colors.length===3) ? m.colors : DEFAULT_MEDAL_COLORS, true, true);
}

function openAddMedalForm(){ medalForm = { open:true, editId:null, medalImg:null, ribbonImg:null }; renderSection(); setTimeout(()=>document.getElementById('medalFormPanel')?.scrollIntoView({behavior:'smooth', block:'center'}), 60); }
function openEditMedalForm(id){
  const m = state.customMedals.find(x=>x.id===id); if(!m) return;
  medalForm = { open:true, editId:id, medalImg:m.medalImg||null, ribbonImg:m.ribbonImg||null };
  renderSection();
  setTimeout(()=>document.getElementById('medalFormPanel')?.scrollIntoView({behavior:'smooth', block:'center'}), 60);
}
function closeMedalForm(){ medalForm = { open:false, editId:null, medalImg:null, ribbonImg:null }; renderSection(); }

async function uploadMedalFormImage(input, kind){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await fileToCompressedDataURL(file, 300, 0.9);
    if(kind==='medal') medalForm.medalImg = dataUrl; else medalForm.ribbonImg = dataUrl;
    renderSection();
  }catch(e){ alert('Could not read that image — try a different file.'); }
}
function clearMedalFormImage(kind){ if(kind==='medal') medalForm.medalImg=null; else medalForm.ribbonImg=null; renderSection(); }

function saveMedalForm(){
  const name = document.getElementById('mf_name').value.trim();
  if(!name){ alert('Give the medal a name first.'); return; }
  const requirements = document.getElementById('mf_requirements').value.trim();
  const connection = document.getElementById('mf_connection').value.trim();
  const connectionKey = document.getElementById('mf_connectionKey').value;
  const why = document.getElementById('mf_why').value.trim();
  const target = Math.max(1, Number(document.getElementById('mf_target').value)||1);
  const colors = [
    document.getElementById('mf_color1').value || DEFAULT_MEDAL_COLORS[0],
    document.getElementById('mf_color2').value || DEFAULT_MEDAL_COLORS[1],
    document.getElementById('mf_color3').value || DEFAULT_MEDAL_COLORS[2],
  ];
  if(medalForm.editId){
    const m = state.customMedals.find(x=>x.id===medalForm.editId);
    if(m){
      const keyChanged = (m.connectionKey||'manual') !== connectionKey;
      Object.assign(m, { name, requirements, connection, connectionKey, target, colors, why, medalImg: medalForm.medalImg, ribbonImg: medalForm.ribbonImg });
      if(keyChanged){
        m.connectionBaseline = connectionKey==='manual' ? undefined : trackedMetricValue(connectionKey);
        if(connectionKey==='manual') m.current = 0;
      }
    }
  } else {
    const connectionBaseline = connectionKey!=='manual' ? trackedMetricValue(connectionKey) : undefined;
    const item = { id: uid('medal'), name, requirements, connection, connectionKey, connectionBaseline, target, current:0,
      colors, why, medalImg: medalForm.medalImg, ribbonImg: medalForm.ribbonImg, timesEarned:0, createdDate: todayStr() };
    const earned = document.getElementById('mf_earned');
    if(earned && earned.checked){ const dt = document.getElementById('mf_date').value || todayStr(); state.achievements.unshift(makeAchievement('medal', item, 'direct', { date: dt })); item.timesEarned = 1; }
    state.customMedals.push(item);
  }
  closeMedalForm();
  saveState(); renderSection();
}

function deleteCustomMedal(id){
  if(!confirm('Delete this medal? Its permanent record in Achievements is kept, but the medal card and its live progress will be removed.')) return;
  state.customMedals = state.customMedals.filter(m=>m.id!==id);
  saveState(); renderSection();
}

function bumpMedalProgress(id, delta){
  const m = state.customMedals.find(x=>x.id===id); if(!m) return;
  m.current = Math.max(0, (Number(m.current)||0) + delta);
  saveState(); renderSection();
}
function setMedalProgress(id, val){
  const m = state.customMedals.find(x=>x.id===id); if(!m) return;
  m.current = Math.max(0, Number(val)||0);
  saveState(); renderSection();
}
function resetMedalTracking(id){
  const m = state.customMedals.find(x=>x.id===id); if(!m) return;
  if(m.connectionKey && m.connectionKey!=='manual') m.connectionBaseline = trackedMetricValue(m.connectionKey);
  else m.current = 0;
  saveState(); renderSection();
}

/* Manual claiming (connected medals auto-claim via checkAutoClaims instead).
   Logs a permanent Achievement entry with a snapshot of the medal's look,
   adds one to timesEarned so the ribbon bar can show it, then resets the
   medal's own progress bar back to 0 so it can be worked toward again. */
function claimMedal(id){
  const m = state.customMedals.find(x=>x.id===id); if(!m) return;
  if(trackedCurrent(m) < m.target) return;
  state.achievements.unshift(makeAchievement('medal', m, 'manual'));
  m.timesEarned = (m.timesEarned||0) + 1;
  m.current = 0;
  saveState(); renderSection();
}

function medalFormHTML(){
  const editing = !!medalForm.editId;
  const m = editing ? state.customMedals.find(x=>x.id===medalForm.editId) : null;
  const colors = (m && m.colors) || DEFAULT_MEDAL_COLORS;
  const curKey = (m && m.connectionKey) || 'manual';
  return `
  <div class="panel" id="medalFormPanel" style="margin-top:16px; border-color:var(--border-strong);">
    <h3><span class="ic">🎖</span>${editing?'EDIT MEDAL':'ADD MEDAL'}</h3>
    <div class="grid c2">
      <div class="field"><label class="f">Medal Name</label><input type="text" id="mf_name" value="${m?esc(m.name):''}" placeholder="e.g. Iron Focus Medal"></div>
      <div class="field"><label class="f">Target (bar completes at this number)</label><input type="number" id="mf_target" min="1" value="${m?m.target:30}"></div>
    </div>
    <div class="field"><label class="f">Requirements — how is it earned?</label><textarea id="mf_requirements" rows="2" placeholder="e.g. 30 days without a single missed study session">${m?esc(m.requirements||''):''}</textarea></div>

    <div class="field"><label class="f">Connection — link to a streak or stat for auto-claim</label>
      <select id="mf_connectionKey">${TRACK_OPTIONS.map(o=>`<option value="${o.key}" ${curKey===o.key?'selected':''}>${o.label}</option>`).join('')}</select>
    </div>
    <div class="field"><label class="f">Note <span style="font-weight:400; color:var(--dim);">(optional — shown as a tag on the card)</span></label><input type="text" id="mf_connection" value="${m?esc(m.connection||''):''}" placeholder="e.g. For staying disciplined all month"></div>
    <div class="field"><label class="f">Why this medal matters <span style="font-weight:400; color:var(--dim);">(shown in Achievements when you open it)</span></label><textarea id="mf_why" rows="2" placeholder="e.g. Proof that I can keep a promise to myself">${m?esc(m.why||''):''}</textarea></div>
    ${editing?'':`<label class="f" style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="mf_earned" onchange="document.getElementById('mf_date').style.display=this.checked?'block':'none'"> Already earned — put it straight into Achievements</label>
    <input type="date" id="mf_date" value="${todayStr()}" style="display:none; margin:6px 0 10px;">`}

    <label class="f">Ribbon Colors <span style="font-weight:400; color:var(--dim);">(used when no custom image is uploaded)</span></label>
    <div style="display:flex; gap:10px; margin-bottom:12px;">
      <input type="color" id="mf_color1" value="${colors[0]}">
      <input type="color" id="mf_color2" value="${colors[1]}">
      <input type="color" id="mf_color3" value="${colors[2]}">
    </div>

    <div class="grid c2">
      <div>
        <label class="f">Medal Image <span style="font-weight:400; color:var(--dim);">(optional)</span></label>
        ${medalForm.medalImg ? `<div style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><img src="${medalForm.medalImg}" style="width:50px; height:50px; object-fit:contain;"><button class="btn ghost sm" onclick="clearMedalFormImage('medal')">✕ Remove</button></div>` : ''}
        <label class="btn ghost sm" style="cursor:pointer;">Upload Medal Image<input type="file" accept="image/*" style="display:none;" onchange="uploadMedalFormImage(this,'medal')"></label>
      </div>
      <div>
        <label class="f">Ribbon Image <span style="font-weight:400; color:var(--dim);">(optional — can add on its own)</span></label>
        ${medalForm.ribbonImg ? `<div style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><img src="${medalForm.ribbonImg}" style="width:30px; height:14px; object-fit:cover;"><button class="btn ghost sm" onclick="clearMedalFormImage('ribbon')">✕ Remove</button></div>` : ''}
        <label class="btn ghost sm" style="cursor:pointer;">Upload Ribbon Image<input type="file" accept="image/*" style="display:none;" onchange="uploadMedalFormImage(this,'ribbon')"></label>
      </div>
    </div>

    <div style="margin-top:14px; display:flex; gap:8px;">
      <button class="btn" onclick="saveMedalForm()">${editing?'Save Changes':'Create Medal'}</button>
      <button class="btn ghost" onclick="closeMedalForm()">Cancel</button>
    </div>
  </div>`;
}

/* ========================================================
   CUSTOM BADGE SYSTEM — Side Arm Badges, image-only version of
   the medal system above (no ribbon). Same progress/connection/
   auto-claim mechanics, its own permanent Achievements entries.
======================================================== */
let badgeForm = { open:false, editId:null, badgeImg:null };

function badgeGraphic(b, size){
  size = size || 60;
  if(b.badgeImg) return `<img src="${b.badgeImg}" style="width:${size}px; height:${size}px; object-fit:contain; border-radius:10px;">`;
  return medalSVG((b.colors && b.colors.length===3) ? b.colors : DEFAULT_MEDAL_COLORS, true, false);
}

function openAddBadgeForm(){ badgeForm = { open:true, editId:null, badgeImg:null }; renderSection(); setTimeout(()=>document.getElementById('badgeFormPanel')?.scrollIntoView({behavior:'smooth', block:'center'}), 60); }
function openEditBadgeForm(id){
  const b = state.customBadges.find(x=>x.id===id); if(!b) return;
  badgeForm = { open:true, editId:id, badgeImg:b.badgeImg||null };
  renderSection();
  setTimeout(()=>document.getElementById('badgeFormPanel')?.scrollIntoView({behavior:'smooth', block:'center'}), 60);
}
function closeBadgeForm(){ badgeForm = { open:false, editId:null, badgeImg:null }; renderSection(); }

async function uploadBadgeFormImage(input){
  const file = input.files && input.files[0]; if(!file) return;
  try{ badgeForm.badgeImg = await fileToCompressedDataURL(file, 300, 0.9); renderSection(); }
  catch(e){ alert('Could not read that image — try a different file.'); }
}
function clearBadgeFormImage(){ badgeForm.badgeImg = null; renderSection(); }

function saveBadgeForm(){
  const name = document.getElementById('bf_name').value.trim();
  if(!name){ alert('Give the badge a name first.'); return; }
  const requirements = document.getElementById('bf_requirements').value.trim();
  const connection = document.getElementById('bf_connection').value.trim();
  const connectionKey = document.getElementById('bf_connectionKey').value;
  const why = document.getElementById('bf_why').value.trim();
  const target = Math.max(1, Number(document.getElementById('bf_target').value)||1);
  const colors = [
    document.getElementById('bf_color1').value || DEFAULT_MEDAL_COLORS[0],
    document.getElementById('bf_color2').value || DEFAULT_MEDAL_COLORS[1],
    document.getElementById('bf_color3').value || DEFAULT_MEDAL_COLORS[2],
  ];
  if(badgeForm.editId){
    const b = state.customBadges.find(x=>x.id===badgeForm.editId);
    if(b){
      const keyChanged = (b.connectionKey||'manual') !== connectionKey;
      Object.assign(b, { name, requirements, connection, connectionKey, target, colors, why, badgeImg: badgeForm.badgeImg });
      if(keyChanged){
        b.connectionBaseline = connectionKey==='manual' ? undefined : trackedMetricValue(connectionKey);
        if(connectionKey==='manual') b.current = 0;
      }
    }
  } else {
    const connectionBaseline = connectionKey!=='manual' ? trackedMetricValue(connectionKey) : undefined;
    const item = { id: uid('badge'), name, requirements, connection, connectionKey, connectionBaseline, target, current:0,
      colors, why, badgeImg: badgeForm.badgeImg, timesEarned:0, createdDate: todayStr() };
    const earned = document.getElementById('bf_earned');
    if(earned && earned.checked){ const dt = document.getElementById('bf_date').value || todayStr(); state.achievements.unshift(makeAchievement('badge', item, 'direct', { date: dt })); item.timesEarned = 1; }
    state.customBadges.push(item);
  }
  closeBadgeForm();
  saveState(); renderSection();
}

function deleteCustomBadge(id){
  if(!confirm('Delete this badge? Its permanent record in Achievements is kept, but the badge card and its live progress will be removed.')) return;
  state.customBadges = state.customBadges.filter(b=>b.id!==id);
  saveState(); renderSection();
}
function bumpBadgeProgress(id, delta){
  const b = state.customBadges.find(x=>x.id===id); if(!b) return;
  b.current = Math.max(0, (Number(b.current)||0) + delta);
  saveState(); renderSection();
}
function setBadgeProgress(id, val){
  const b = state.customBadges.find(x=>x.id===id); if(!b) return;
  b.current = Math.max(0, Number(val)||0);
  saveState(); renderSection();
}
function resetBadgeTracking(id){
  const b = state.customBadges.find(x=>x.id===id); if(!b) return;
  if(b.connectionKey && b.connectionKey!=='manual') b.connectionBaseline = trackedMetricValue(b.connectionKey);
  else b.current = 0;
  saveState(); renderSection();
}
function claimBadge(id){
  const b = state.customBadges.find(x=>x.id===id); if(!b) return;
  if(trackedCurrent(b) < b.target) return;
  state.achievements.unshift(makeAchievement('badge', b, 'manual'));
  b.timesEarned = (b.timesEarned||0) + 1;
  b.current = 0;
  saveState(); renderSection();
}

function badgeFormHTML(){
  const editing = !!badgeForm.editId;
  const b = editing ? state.customBadges.find(x=>x.id===badgeForm.editId) : null;
  const colors = (b && b.colors) || DEFAULT_MEDAL_COLORS;
  const curKey = (b && b.connectionKey) || 'manual';
  return `
  <div class="panel" id="badgeFormPanel" style="margin-top:16px; border-color:var(--border-strong);">
    <h3><span class="ic">◉</span>${editing?'EDIT BADGE':'ADD BADGE'}</h3>
    <div class="grid c2">
      <div class="field"><label class="f">Badge Name</label><input type="text" id="bf_name" value="${b?esc(b.name):''}" placeholder="e.g. Marksman Badge"></div>
      <div class="field"><label class="f">Target (bar completes at this number)</label><input type="number" id="bf_target" min="1" value="${b?b.target:30}"></div>
    </div>
    <div class="field"><label class="f">Requirements — how is it earned?</label><textarea id="bf_requirements" rows="2" placeholder="e.g. 30 days of excelling in this field">${b?esc(b.requirements||''):''}</textarea></div>

    <div class="field"><label class="f">Connection — link to a streak or stat for auto-claim</label>
      <select id="bf_connectionKey">${TRACK_OPTIONS.map(o=>`<option value="${o.key}" ${curKey===o.key?'selected':''}>${o.label}</option>`).join('')}</select>
    </div>
    <div class="field"><label class="f">Note <span style="font-weight:400; color:var(--dim);">(optional — shown as a tag on the card)</span></label><input type="text" id="bf_connection" value="${b?esc(b.connection||''):''}" placeholder="e.g. Marksmanship training"></div>
    <div class="field"><label class="f">Why this badge matters <span style="font-weight:400; color:var(--dim);">(shown in Achievements when you open it)</span></label><textarea id="bf_why" rows="2" placeholder="e.g. Shows I stayed consistent in this field">${b?esc(b.why||''):''}</textarea></div>
    ${editing?'':`<label class="f" style="display:flex; gap:8px; align-items:center;"><input type="checkbox" id="bf_earned" onchange="document.getElementById('bf_date').style.display=this.checked?'block':'none'"> Already earned — put it straight into Achievements</label>
    <input type="date" id="bf_date" value="${todayStr()}" style="display:none; margin:6px 0 10px;">`}

    <label class="f">Badge Colors <span style="font-weight:400; color:var(--dim);">(used when no custom image is uploaded)</span></label>
    <div style="display:flex; gap:10px; margin-bottom:12px;">
      <input type="color" id="bf_color1" value="${colors[0]}">
      <input type="color" id="bf_color2" value="${colors[1]}">
      <input type="color" id="bf_color3" value="${colors[2]}">
    </div>

    <label class="f">Badge Image <span style="font-weight:400; color:var(--dim);">(optional — image only, no ribbon for badges)</span></label>
    ${badgeForm.badgeImg ? `<div style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><img src="${badgeForm.badgeImg}" style="width:50px; height:50px; object-fit:contain;"><button class="btn ghost sm" onclick="clearBadgeFormImage()">✕ Remove</button></div>` : ''}
    <label class="btn ghost sm" style="cursor:pointer;">Upload Badge Image<input type="file" accept="image/*" style="display:none;" onchange="uploadBadgeFormImage(this)"></label>

    <div style="margin-top:14px; display:flex; gap:8px;">
      <button class="btn" onclick="saveBadgeForm()">${editing?'Save Changes':'Create Badge'}</button>
      <button class="btn ghost" onclick="closeBadgeForm()">Cancel</button>
    </div>
  </div>`;
}

/* ---------- rollover ---------- */
function rollover(){ const t=todayStr(); const had = !!(state && state.dailyLogs && state.dailyLogs[t]); ensureDay(t); if(!had) saveState(); }

/* ========================================================
   RENDER — router
======================================================== */
function go(sec){
  currentSection = sec;
  editingTracker = { name:null, index:null };
  if(sec==='badges'){ sec = 'medals'; medalTab = 'badges'; currentSection = 'medals'; }
  else if(sec==='medals') medalTab = 'medals';
  if(sec==='rulebook'){ sec = 'books'; currentSection = 'books'; }
  if(sec!=='medals'){ medalForm = { open:false, editId:null, medalImg:null, ribbonImg:null }; badgeForm = { open:false, editId:null, badgeImg:null }; }
  if(sec==='books') openBookId = null;
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
  checkAutoClaims(); checkStandardUnlocks();
  const map = { home:secHome, dashboard:secDashboard, profile:secProfile, mission:secMission,
    streaks:secStreaks, daily:secDaily, trackers:secTrackers, rank:secRank, medals:secMedals,
    achievements:secAchievements, badges:secMedals, rulebook:secBooks, books:secBooks, journal:secJournal, divisions:secDivisions, archives:secArchives };
  const fn = map[currentSection] || secHome;
  let html;
  try{ html = fn(); }
  catch(e){
    console.error('render failed for', currentSection, e);
    html = `<div class="panel"><h3>⚠ This page hit a data problem</h3><p class="stat-label">Your saved data is NOT deleted. Press Repair, or open another section.</p><p class="mono" style="font-size:11px; color:var(--danger);">${esc(String(e && e.message || e))}</p><button class="btn" onclick="repairData()">Repair &amp; Reload</button></div>`;
  }
  document.getElementById('mainContent').innerHTML = html;
  renderTopbar();
  if(currentSection==='books') bookAfterRender();
  if(typeof Blobs!=='undefined') Blobs.hydrate(document.getElementById('mainContent'));
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
  const todaysGoals = goalsForDate(t);
  const doneCount = todaysGoals.filter(g=>goalStatus(day,g.id)==='full').length;

  return `
  <div class="ticker"><span>⚡ OLC-CCS ONLINE &nbsp;&nbsp;·&nbsp;&nbsp; AGENT: ${esc(p.codename||p.name||'UNNAMED')} &nbsp;&nbsp;·&nbsp;&nbsp; DAY ${daysActive} OF THE MISSION &nbsp;&nbsp;·&nbsp;&nbsp; "${esc(motto)}" &nbsp;&nbsp;·&nbsp;&nbsp; DISCIPLINE BEFORE MOTIVATION &nbsp;&nbsp;·&nbsp;&nbsp;</span></div>

  <div class="pagehead">
    <h2>MISSION OVERVIEW</h2>
    <div class="sub">${fmtDateLong(t)}</div>
  </div>
  <div class="rk-side">
    <img src="${currentRKImage()}" alt="Radha Krishna" onclick="openRKModal()" class="rk-side-img">
    ${divisionFlagHTML()}
  </div>

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
      <div class="stat-big" style="font-size:52px;">${Math.round(clamp(rank.xp/rankXP(RANKS.length-1)*100,0,100))}%</div>
      <div class="stat-label">TOWARD FIELD MARSHAL</div>
      <div class="bar cyan" style="margin-top:14px;"><i style="width:${clamp(rank.xp/rankXP(RANKS.length-1)*100,0,100)}%"></i></div>
    </div>

    <div class="panel" style="text-align:center; display:flex; flex-direction:column; justify-content:center;">
      <div class="eyebrow">TODAY'S DSS</div>
      <div class="stat-big" style="font-size:52px;">${dss}</div>
      <div class="stat-label">/ 100 &nbsp;·&nbsp; ${doneCount}/${todaysGoals.length} GOALS COMPLETE</div>
      <div class="bar gold" style="margin-top:14px;"><i style="width:${dss}%"></i></div>
    </div>
  </div>

  <div class="grid c2" style="margin-top:18px;">
    <div class="panel">
      <h3><span class="ic">☑</span>TODAY'S GOALS</h3>
      ${todaysGoals.length? todaysGoals.map(g=>goalRowHTML(t,g,true)).join('') : '<div class="empty">No goals yet — add some in Daily Operations</div>'}
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
  const weekFull = week.reduce((a,d)=>{ const day=state.dailyLogs[d]; if(!day) return a; return a + goalsForDate(d).filter(g=>goalStatus(day,g.id)==='full').length; },0);
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
    ${goalsForDate(t).length ? goalsForDate(t).map(g=>goalRowHTML(t,g,true)).join('') : '<div class="empty">No goals yet</div>'}
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
      <img src="${currentProfilePhoto()}" alt="Agent" onclick="openPhotoModal()" style="width:150px; height:150px; object-fit:cover; border-radius:50%; border:3px solid var(--border-strong); box-shadow:0 0 24px color-mix(in srgb, var(--lavender) 40%, transparent); cursor:pointer;">
      <div class="stat-label" style="margin-top:6px;">TAP PHOTO TO ENLARGE</div>
      ${profileDivisionHTML()}
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

  ${accountPanelsHTML()}
  `;
}
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
  screen:{label:'SCREEN DISCIPLINE STREAK', icon:'📱'},
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
    <p style="color:var(--dim); font-size:13px;">Study, Fitness and Spiritual streaks update automatically when you give that category a star rating in Daily Operations. Reading and Wake-Up streaks are logged with manual toggles. Habit streak counts consecutive days where <b style="color:var(--white)">every</b> Daily Goal was completed — the mark of Iron Discipline. Screen Discipline streak builds on every day you save Screen Time within your limit — Tracker Division awards +10XP per hour under the limit, and deducts -10XP per hour over it.</p>
  </div>
  `;
}

/* ========================================================
   SECTION: DAILY OPERATIONS
======================================================== */
function secDaily(){
  const t = todayStr();
  const day = ensureDay(t);
  const todaysGoals = goalsForDate(t);
  const scheduledGoals = state.goals.filter(g => g.effectiveFrom && g.effectiveFrom > t);
  return `
  <div class="pagehead"><h2>DAILY OPERATIONS</h2><div class="sub">${fmtDateLong(t)}</div></div>

  <div class="grid c2">
    <div class="panel">
      <h3><span class="ic">☑</span>DAILY GOALS <span style="font-weight:400; color:var(--dim); font-size:11px;">(Full = full XP · Half = half XP · Fail = −half XP)</span></h3>
      ${todaysGoals.length? todaysGoals.map(g=>goalRowHTML(t,g,false)).join('') : '<div class="empty">No goals yet — add your first one below</div>'}
      <div class="grid c3" style="margin-top:12px;">
        <div class="field"><label class="f">New Goal Name</label><input type="text" id="newGoalLabel" placeholder="e.g. Meditate"></div>
        <div class="field"><label class="f">XP Value</label><input type="number" id="newGoalXP" value="10"></div>
        <div class="field"><label class="f">Starts</label><select id="newGoalWhen"><option value="today">Today</option><option value="tomorrow">Tomorrow</option></select></div>
      </div>
      <button class="btn sm" onclick="addGoal()">+ Add Goal</button>
      <div class="stat-label" style="margin-top:6px;">Out of time to plan tomorrow? Set "Starts: Tomorrow" now — it'll sit quietly until then and won't affect today's goals or XP.</div>

      ${scheduledGoals.length ? `
      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px;">
        <div class="eyebrow" style="margin-bottom:8px;">SCHEDULED — NOT ACTIVE YET</div>
        ${scheduledGoals.map(g=>`
          <div class="checklist-item">
            <div class="txt">${esc(g.label)}</div>
            <div class="xp">+${g.xp} XP · from ${g.effectiveFrom}</div>
            <button class="btn ghost sm" onclick="editGoal('${g.id}')" title="Edit">✎</button>
            <button class="btn ghost sm" onclick="deleteGoal('${g.id}')" title="Delete">🗑</button>
          </div>`).join('')}
      </div>` : ''}

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
/* radar chart for the Command Dashboard (this function was missing before, which blanked the whole page) */
function radarChartSVG(stats){
  const keys = ['study','fitness','spiritual','discipline','mood'];
  const labels = { study:'STUDY', fitness:'FITNESS', spiritual:'SPIRIT', discipline:'DISCIPLINE', mood:'MOOD' };
  const S = 260, c = S/2, R = 84;
  const pt = (i, f) => { const a = -Math.PI/2 + i*2*Math.PI/keys.length; return [c + Math.cos(a)*R*f, c + Math.sin(a)*R*f]; };
  const ring = (f) => keys.map((_,i)=>pt(i,f).join(',')).join(' ');
  const vals = keys.map((k,i)=>pt(i, clamp((Number(stats && stats[k])||0)/100, 0, 1)).join(',')).join(' ');
  return `<svg viewBox="0 0 ${S} ${S}" style="width:100%; max-width:300px; display:block; margin:0 auto;">
    ${[0.25,0.5,0.75,1].map(f=>`<polygon points="${ring(f)}" fill="none" stroke="var(--border)" stroke-width="1"/>`).join('')}
    ${keys.map((_,i)=>{ const [x,y]=pt(i,1); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`; }).join('')}
    <polygon points="${vals}" fill="color-mix(in srgb, var(--lavender) 30%, transparent)" stroke="var(--lavender)" stroke-width="2"/>
    ${keys.map((k,i)=>{ const [x,y]=pt(i,1.2); return `<text x="${x}" y="${y}" fill="var(--dim)" font-size="9" text-anchor="middle" dominant-baseline="middle" font-family="Share Tech Mono, monospace">${labels[k]}</text>`; }).join('')}
  </svg>`;
}
function lineChartSVG(log, field){
  const sorted = [...log].sort((a,b)=>a.date<b.date?-1:1).slice(-12);
  if(sorted.length<2) return '<div class="empty">Log at least 2 entries to see trend</div>';
  const vals = sorted.map(e=>Number(e[field]));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max-min)||1;
  const W=280,H=70,pad=6;
  const pts = vals.map((v,i)=> [pad + i*(W-2*pad)/(vals.length-1), H-pad - ( (v-min)/range )*(H-2*pad) ].join(',')).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; margin-top:10px;"><polyline points="${pts}" fill="none" stroke="var(--cyan)" stroke-width="2"/></svg>`;
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
      <div class="grid c2">
        <div class="field"><label class="f">Total Duration (min)</label><input type="number" id="scr_total" value="${screen.totalMin}" onchange="updateScreenTotal(this.value)"></div>
        <div class="field"><label class="f">Daily Limit (min)</label><input type="number" id="scr_limit" value="${state.settings.screenLimit}" onchange="updateScreenLimit(this.value)"></div>
      </div>
      <div class="bar" style="margin:10px 0;"><i style="width:${Math.min(screenPct,100)}%; background:${screen.totalMin>state.settings.screenLimit?'linear-gradient(90deg,#8a1030,var(--danger))':'linear-gradient(90deg,var(--violet),var(--lavender))'}"></i></div>
      <div class="stat-label">${screen.totalMin} / ${state.settings.screenLimit} MIN — ${screen.totalMin<=state.settings.screenLimit && screen.totalMin>0 ? 'WITHIN LIMIT ✓' : screen.totalMin===0 ? 'NOT LOGGED' : 'OVER LIMIT ✗'}</div>
      <div class="stat-label" style="margin-top:4px; color:${computeScreenXP(screen.totalMin,state.settings.screenLimit)<0?'var(--danger)':'var(--lavender)'};">${screen.totalMin===0?'Log your time to see today\'s XP effect':(computeScreenXP(screen.totalMin,state.settings.screenLimit)>=0?'+':'')+computeScreenXP(screen.totalMin,state.settings.screenLimit)+' XP for today'}</div>

      <label class="f" style="margin-top:14px;">Devices</label>
      ${screen.devices.map((dv,di)=>`
        <div style="border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:10px; background:rgba(255,255,255,.02);">
          <div style="display:flex; gap:6px; margin-bottom:6px;">
            <input type="text" value="${esc(dv.name)}" onchange="updateScreenDevice(${di},'name',this.value)" placeholder="Device name (e.g. Phone)">
            <input type="text" value="${esc(dv.purpose||'')}" onchange="updateScreenDevice(${di},'purpose',this.value)" placeholder="Purpose (e.g. Study, Chat)">
            <button class="btn ghost sm" onclick="removeScreenDevice(${di})">✕</button>
          </div>
          <label class="f" style="margin-top:6px;">Apps on this device</label>
          ${dv.apps.map((a,ai)=>`<div style="display:flex; gap:6px; margin-bottom:6px;">
            <input type="text" value="${esc(a.name)}" onchange="updateScreenApp(${di},${ai},'name',this.value)" placeholder="App / Software">
            <input type="number" style="width:90px;" value="${a.min}" onchange="updateScreenApp(${di},${ai},'min',this.value)" placeholder="min">
            <button class="btn ghost sm" onclick="removeScreenApp(${di},${ai})">✕</button>
          </div>`).join('') || '<div class="empty" style="padding:6px;">No apps logged for this device yet</div>'}
          <button class="btn ghost sm" onclick="addScreenApp(${di})">+ Add App</button>
        </div>`).join('') || '<div class="empty">No devices logged yet</div>'}
      <button class="btn ghost sm" onclick="addScreenDevice()">+ Add Device</button>

      <button class="btn sm" style="margin-top:14px; display:block;" onclick="saveScreenTime()">Save Screen Time (+10XP/hr under · -10XP/hr over limit)</button>
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
        <div class="field"><label class="f">Exercise Name</label><input type="text" id="ex_name" value="${exEdit?esc(exEdit.name||''):''}" placeholder="e.g. Push-ups, Running"></div>
        <div class="field"><label class="f">How Many / How Much</label><input type="text" id="ex_amount" value="${exEdit?esc(exEdit.amount||''):''}" placeholder="e.g. 3 sets x 20, 2 km"></div>
      </div>
      <div class="grid c2">
        <div class="field"><label class="f">Duration (min)</label><input type="number" id="ex_duration" value="${exEdit?exEdit.durationMin:''}"></div>
        <div class="field"><label class="f">Gripper Count</label><input type="number" id="ex_gripper" value="${exEdit?exEdit.gripper:''}"></div>
      </div>
      <button class="btn sm" onclick="saveExerciseLog()">${exEdit?'Update Entry':'Log Exercise Session'}</button>
      ${exEdit?`<button class="btn ghost sm" onclick="cancelEdit()">Cancel</button>`:''}
      <table style="margin-top:12px;"><tr><th>Date</th><th>Type</th><th>Exercise</th><th>Amount</th><th>Min</th><th>Gripper</th><th></th></tr>
      ${exLog.length? exLog.map(e=>`<tr><td>${e.date}</td><td>${e.type||'—'}</td><td>${esc(e.name||'—')}</td><td>${esc(e.amount||'—')}</td><td>${e.durationMin||0}</td><td>${e.gripper||0}</td><td><button class="btn ghost sm" onclick="startEditEntry('exercise',${e._i})">✎</button> <button class="btn ghost sm" onclick="deleteTrackerEntry('exercise',${e._i})">🗑</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No entries yet</td></tr>'}
      </table>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;" id="trk_study">
    <h3><span class="ic">📚</span>STUDY TRACKER</h3>
    <div class="grid c4">
      <div class="field"><label class="f">Hours</label><input type="number" step="0.1" id="sd_hours" value="${sdEdit?sdEdit.hours:''}"></div>
      <div class="field"><label class="f">Subject</label><select id="sd_subject">${SUBJECT_OPTIONS.map(s=>`<option value="${s}" ${sdEdit&&sdEdit.subject===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Topic</label><input type="text" id="sd_topic" value="${sdEdit?esc(sdEdit.topic||''):''}" placeholder="e.g. 1st Paper - Grammar"></div>
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

/* screen time — apps live nested inside each device */
function addScreenDevice(){ const day=ensureDay(todayStr()); day.screen.devices.push({ id:uid('dev'), name:'', purpose:'', apps:[] }); saveState(); renderSection(); }
function removeScreenDevice(i){ const day=ensureDay(todayStr()); day.screen.devices.splice(i,1); saveState(); renderSection(); }
function updateScreenDevice(i, field, val){ const day=ensureDay(todayStr()); day.screen.devices[i][field] = val; saveState(); }
function addScreenApp(deviceIdx){ const day=ensureDay(todayStr()); day.screen.devices[deviceIdx].apps.push({ id:uid('app'), name:'', min:0 }); saveState(); renderSection(); }
function removeScreenApp(deviceIdx, appIdx){ const day=ensureDay(todayStr()); day.screen.devices[deviceIdx].apps.splice(appIdx,1); saveState(); renderSection(); }
function updateScreenApp(deviceIdx, appIdx, field, val){ const day=ensureDay(todayStr()); day.screen.devices[deviceIdx].apps[appIdx][field] = field==='min' ? (Number(val)||0) : val; saveState(); }
function updateScreenTotal(v){ const day=ensureDay(todayStr()); day.screen.totalMin = Number(v)||0; saveState(); renderSection(); }
function updateScreenLimit(v){ state.settings.screenLimit = Number(v)||180; saveState(); renderSection(); }
/* +10 XP for every hour spent UNDER the daily limit (rewards discipline & a streak);
   -10 XP for every hour spent OVER the daily limit (penalizes losing control). */
function computeScreenXP(totalMin, limit){
  totalMin = Number(totalMin)||0; limit = Number(limit)||0;
  if(totalMin<=0) return 0;
  if(totalMin>limit){ const hrsOver = (totalMin-limit)/60; return -Math.round(hrsOver*10); }
  const hrsUnder = (limit-totalMin)/60;
  return Math.round(hrsUnder*10);
}
function saveScreenTime(){
  const day = ensureDay(todayStr());
  day.screen.totalMin = Number(document.getElementById('scr_total').value)||0;
  state.settings.screenLimit = Number(document.getElementById('scr_limit').value)||180;
  const newXP = computeScreenXP(day.screen.totalMin, state.settings.screenLimit);
  const prevXP = day.screen.xpApplied||0;
  addXP(newXP - prevXP);
  day.screen.xpApplied = newXP;
  const compliant = day.screen.totalMin>0 && day.screen.totalMin <= state.settings.screenLimit;
  day.screen.awarded = compliant;
  if(compliant) streakCheck('screen', todayStr()); else streakUncheck('screen', todayStr());
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
  if(editingTracker.name==='weight'){ state.trackerLogs.weight[editingTracker.index] = Object.assign({}, state.trackerLogs.weight[editingTracker.index], {date, kg}); editingTracker={name:null,index:null}; }
  else state.trackerLogs.weight.push({date, kg});
  saveState(); renderSection();
}
function saveHeightLog(){
  const cm=Number(document.getElementById('ht_cm').value); const date=document.getElementById('ht_date').value||todayStr();
  if(!cm) return;
  if(editingTracker.name==='height'){ state.trackerLogs.height[editingTracker.index] = Object.assign({}, state.trackerLogs.height[editingTracker.index], {date, cm}); editingTracker={name:null,index:null}; }
  else state.trackerLogs.height.push({date, cm});
  saveState(); renderSection();
}
function saveExerciseLog(){
  const name=document.getElementById('ex_name').value.trim();
  const amount=document.getElementById('ex_amount').value.trim();
  const gripper=Number(document.getElementById('ex_gripper').value)||0;
  const durationMin=Number(document.getElementById('ex_duration').value)||0;
  const type = exerciseTypeSel;
  if(!name && !gripper && !durationMin) return;
  if(editingTracker.name==='exercise'){ state.trackerLogs.exercise[editingTracker.index] = Object.assign({}, state.trackerLogs.exercise[editingTracker.index], {type, name, amount, gripper, durationMin}); editingTracker={name:null,index:null}; }
  else state.trackerLogs.exercise.push({date:todayStr(), type, name, amount, gripper, durationMin});
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
let rankEditMode = false;
function secRank(){
  const rank = getRankInfo(state.xp);
  const ranks = effectiveRanks();
  return `
  <div class="pagehead"><h2>RANK SYSTEM</h2><div class="sub">14 TIERS · JUNIOR OFFICER → SENIOR OFFICER → RETIRED · TAP A BADGE FOR DETAILS</div></div>
  <div class="panel" style="text-align:center; margin-bottom:16px;">
    <div class="eyebrow">CURRENT PROGRESS</div>
    <div class="stat-big" style="font-size:20px; margin:8px 0;">${rank.xp} XP ${rank.next? '&nbsp;/&nbsp; '+rank.next.xp+' XP TOWARD '+rank.next.name : '&nbsp;— MAX TIER'}</div>
    <div class="bar" style="max-width:520px; margin:0 auto;"><i style="width:${rank.pct}%"></i></div>
    <div style="margin-top:12px;">
      <button class="btn ghost sm" onclick="rankEditMode=!rankEditMode; renderSection();">${rankEditMode ? 'Done Editing' : '✎ Edit XP Requirements'}</button>
      ${state.rankOverrides ? `<button class="btn ghost sm" onclick="resetRankXP()">Reset To Default</button>` : ''}
    </div>
  </div>
  <div class="grid c4">
    ${ranks.map((r,i)=>{
      const achieved = i<=rank.idx; const isCurrent = i===rank.idx;
      const next = ranks[i+1];
      const rangeTxt = next ? `${r.xp} – ${next.xp-1} XP` : `${r.xp}+ XP`;
      const info = RANK_INFO[i];
      return `<div class="panel" style="text-align:center; ${rankEditMode?'':'cursor:pointer;'} ${achieved?'':'opacity:.4; filter:grayscale(.6);'} ${isCurrent?'box-shadow:0 0 22px color-mix(in srgb, var(--lavender) 50%, transparent); border-color:var(--lavender);':''}" ${rankEditMode?'':`onclick="openRankInfo(${i})"`}>
        <div class="tag">TIER ${i+1}</div>
        <div class="rankbadge" style="margin:10px auto;">${rankImg(i,42)}</div>
        <div style="font-family:'Orbitron'; font-size:12px; color:${isCurrent?'var(--lavender)':'var(--white)'};">${r.name}</div>
        ${rankEditMode
          ? (i===0 ? `<div class="stat-label" style="margin-top:6px;">FIXED AT 0 XP</div>`
             : `<div class="field" style="margin-top:8px;"><input type="number" value="${r.xp}" onchange="setRankXP(${i}, this.value)"></div>`)
          : `<div class="stat-label" style="margin-top:6px;">${rangeTxt}</div>`}
        <div class="stat-label" style="margin-top:4px; color:var(--cyan);">${info.group}${info.stars?' · '+starsRow(info.stars):''}</div>
      </div>`;
    }).join('')}
  </div>
  `;
}

/* ========================================================
   SECTION: MEDALS
======================================================== */
let medalTab = 'medals';
function setMedalTab(t){ medalTab = t; if(t!=='medals') medalForm = { open:false, editId:null, medalImg:null, ribbonImg:null }; if(t!=='badges') badgeForm = { open:false, editId:null, badgeImg:null }; renderSection(); }
function medalTabsHTML(){
  return `<div class="tabs" role="tablist"><button class="tab ${medalTab==='medals'?'active':''}" onclick="setMedalTab('medals')">🎖 Medals</button><button class="tab ${medalTab==='badges'?'active':''}" onclick="setMedalTab('badges')">◉ Badges</button><button class="tab" onclick="go('achievements')">🏆 Achievements →</button></div>`;
}
function secMedals(){
  if(medalTab==='badges') return secBadges();
  const medals = state.customMedals || [];
  const autoMedals = getMedals();
  return `
  <div class="pagehead"><h2>MEDALS &amp; AWARDS</h2><div class="sub">DESIGN YOUR OWN DECORATIONS</div></div>
  ${medalTabsHTML()}

  <div class="panel">
    <button class="btn" onclick="openAddMedalForm()">+ Add Medal</button>
    <p class="stat-label" style="margin-top:10px; line-height:1.6;">Create your own medal: name it, set the requirements to earn it, and pick a target. Either track the bar yourself with +1 / -1, or set Connection to link it to a real streak or lifetime stat — it will then fill and claim itself automatically. Once the bar is full, it's logged forever in Achievements and its ribbon joins your Agent Profile, then the bar resets to 0 so the same medal can be earned all over again.</p>
  </div>

  ${medalForm.open ? medalFormHTML() : ''}

  <div class="grid c3" style="margin-top:16px;">
    ${medals.length ? medals.map(m=>{
      const cur = trackedCurrent(m);
      const pct = clamp((cur/m.target)*100,0,100);
      const ready = cur >= m.target;
      const auto = m.connectionKey && m.connectionKey!=='manual';
      return `
      <div class="medal" id="medalcard_${m.id}" style="${ready?'border-color:var(--gold); box-shadow:0 0 14px color-mix(in srgb, var(--gold) 35%, transparent);':''}">
        <div class="mic">${medalGraphic(m,60)}</div>
        <div class="mn">${esc(m.name)}</div>
        ${m.requirements?`<div class="md">${esc(m.requirements)}</div>`:''}
        <div class="tag" style="margin-top:6px;">🔗 ${auto?('Auto: '+esc(trackLabel(m.connectionKey))):'Manual tracking'}</div>
        ${m.connection?`<div class="tag" style="margin-top:4px;">${esc(m.connection)}</div>`:''}
        <div class="bar gold" style="margin-top:10px;"><i style="width:${pct}%"></i></div>
        <div class="stat-label" style="margin-top:4px;">${Number.isInteger(cur)?cur:cur.toFixed(1)} / ${m.target}${m.timesEarned?` · Earned ${m.timesEarned}×`:''}</div>
        ${auto ? `
        <div class="stat-label" style="margin-top:6px;">Fills automatically — claims itself at target.</div>
        <button class="btn ghost sm" style="margin-top:6px;" onclick="resetMedalTracking('${m.id}')">Reset Progress</button>
        ` : `
        <div style="display:flex; gap:6px; justify-content:center; align-items:center; margin-top:8px; flex-wrap:wrap;">
          <button class="btn ghost sm" onclick="bumpMedalProgress('${m.id}',-1)">-1</button>
          <input type="number" style="width:60px; text-align:center;" value="${m.current}" onchange="setMedalProgress('${m.id}', this.value)">
          <button class="btn ghost sm" onclick="bumpMedalProgress('${m.id}',1)">+1</button>
        </div>
        <button class="btn ${ready?'':'ghost'} sm" style="margin-top:8px; width:100%; ${ready?'':'opacity:.5;'}" ${ready?`onclick="claimMedal('${m.id}')"`:'disabled'}>${ready?'🎖 Claim Medal':'Locked'}</button>
        `}
        <div style="display:flex; gap:6px; justify-content:center; margin-top:6px;">
          <button class="btn ghost sm" onclick="openEditMedalForm('${m.id}')">Edit</button>
          <button class="btn ghost sm" onclick="deleteCustomMedal('${m.id}')">Delete</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1;">No medals yet — tap "+ Add Medal" above to create your first one.</div>'}
  </div>

  <div style="margin-top:26px; border-top:1px solid var(--border); padding-top:16px;">
    <div class="eyebrow" style="margin-bottom:10px;">STANDARD MEDALS — AUTO-TRACKED</div>
    <div class="grid c4">
      ${autoMedals.map(m=>{
        const pct = clamp(m.current/m.target*100,0,100);
        return `
        <div class="medal ${m.unlocked?'':'locked'}">
          <div class="mic">${medalSVG(m.ribbon, m.unlocked, false)}</div>
          <div class="mn">${m.name}</div>
          <div class="md">${m.desc}</div>
          <div class="bar gold" style="margin-top:10px;"><i style="width:${pct}%"></i></div>
          <div class="stat-label" style="margin-top:4px;">${Math.min(m.current,m.target)} / ${m.target}</div>
          <div class="tag" style="margin-top:8px; ${m.unlocked?'color:var(--green); border-color:var(--green);':''}">${m.unlocked?'UNLOCKED':'LOCKED'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
  `;
}

/* ========================================================
   SECTION: ACHIEVEMENTS — permanent record of every claimed medal/badge
======================================================== */
function achGraphic(a, size){
  size = size||40;
  a = Object.assign({}, a, { colors: Array.isArray(a.colors) ? a.colors : DEFAULT_MEDAL_COLORS });
  if(a.kind==='badge') return a.badgeImg ? `<img src="${a.badgeImg}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:8px;">` : medalSVG(a.colors||DEFAULT_MEDAL_COLORS,true,false);
  return a.medalImg ? `<img src="${a.medalImg}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;">` : medalSVG(a.colors||DEFAULT_MEDAL_COLORS,true,false);
}
function secAchievements(){
  const list = (state.achievements||[]).slice().sort((x,y)=> (y.at||0)-(x.at||0) || (x.date<y.date?1:-1));
  const medalsN = list.filter(a=>a.kind!=='badge').length, badgesN = list.length-medalsN;
  return `
  <div class="pagehead"><h2>ACHIEVEMENTS</h2><div class="sub">EVERY MEDAL &amp; BADGE EVER EARNED — TAP ONE TO SEE WHEN, HOW AND WHY</div></div>
  <div class="grid c3" style="margin-bottom:14px;">
    <div class="panel" style="text-align:center;"><div class="eyebrow">TOTAL</div><div class="stat-big" style="font-size:30px;">${list.length}</div></div>
    <div class="panel" style="text-align:center;"><div class="eyebrow">MEDALS</div><div class="stat-big" style="font-size:30px;">${medalsN}</div></div>
    <div class="panel" style="text-align:center;"><div class="eyebrow">BADGES</div><div class="stat-big" style="font-size:30px;">${badgesN}</div></div>
  </div>
  <div class="panel">
    ${list.length ? `<div class="ach-list">${list.map(a=>`
      <button class="ach-row" onclick="openAchievement('${a.id}')">
        <span class="ach-ic">${achGraphic(a,38)}</span>
        <span class="ach-main"><b>${esc(a.name)}</b><small>${a.kind==='badge'?'Badge':'Medal'} · ${a.date}${a.earnedNo>1?' · earned '+a.earnedNo+'×':''}</small></span>
        <span class="ach-go">›</span>
      </button>`).join('')}</div>` : '<div class="empty">No medals or badges earned yet. Open Medals &amp; Awards (Medals or Badges tab) to create and earn your first one.</div>'}
  </div>`;
}
function openAchievement(id){
  const a = (state.achievements||[]).find(x=>x.id===id); if(!a) return;
  const src = (a.kind==='badge' ? (state.customBadges||[]) : (state.customMedals||[])).find(x=>x.id===a.medalId);
  const when = a.at ? new Date(a.at).toLocaleString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}) : fmtDateLong(a.date);
  const requirements = a.requirements || (src&&src.requirements) || '';
  const why = a.why || (src&&src.why) || '';
  document.getElementById('achBody').innerHTML = `
    <div style="text-align:center;"><div class="ach-big">${achGraphic(a,96)}</div>
    <h3 style="justify-content:center; margin:10px 0 2px;">${esc(a.name)}</h3>
    <div class="tag">${a.kind==='badge'?'BADGE':'MEDAL'}${a.std?' · STANDARD':''}${a.earnedNo>1?' · EARNED '+a.earnedNo+'×':''}</div></div>
    <div class="ach-facts">
      <div><div class="eyebrow">WHEN</div><div>${esc(when)}${a.std?'<div class="stat-label">First noticed as unlocked on this date</div>':''}</div></div>
      <div><div class="eyebrow">HOW</div><div>${esc(a.how||'—')}${requirements?`<div class="stat-label" style="margin-top:6px;">REQUIREMENT: ${esc(requirements)}</div>`:''}</div></div>
      <div><div class="eyebrow">WHY</div><div id="achWhyView">${why?esc(why):'<span style="color:var(--dim)">No reason written yet.</span>'}</div>
        <textarea id="achWhyEdit" rows="3" style="display:none; margin-top:6px;" placeholder="Why does this matter to you?">${esc(why)}</textarea></div>
    </div>
    <div style="display:flex; gap:8px; justify-content:center; margin-top:14px; flex-wrap:wrap;">
      <button class="btn sm" id="achEditBtn" onclick="achEditWhy('${a.id}')">✎ Write / edit the reason</button>
      <button class="btn ghost sm" onclick="deleteAchievement('${a.id}')">Remove record</button>
    </div>`;
  document.getElementById('achModal').style.display='flex';
}
function achEditWhy(id){
  const ta=document.getElementById('achWhyEdit'), btn=document.getElementById('achEditBtn');
  if(ta.style.display==='none'){ ta.style.display='block'; document.getElementById('achWhyView').style.display='none'; btn.textContent='Save reason'; ta.focus(); return; }
  const a=state.achievements.find(x=>x.id===id); if(!a) return;
  a.why = ta.value.trim(); saveState(); openAchievement(id);
}
function deleteAchievement(id){
  if(!confirm('Remove this achievement record? (The medal/badge itself is not deleted.)')) return;
  state.achievements = state.achievements.filter(x=>x.id!==id); saveState(); closeAchModal(); renderSection();
}
function closeAchModal(){ document.getElementById('achModal').style.display='none'; }

/* ========================================================
   SECTION: BADGES (Side Arm Badge System)
======================================================== */
function secBadges(){
  const badges = state.customBadges || [];
  const autoBadges = getBadges();
  return `
  <div class="pagehead"><h2>BADGES</h2><div class="sub">PART OF MEDALS &amp; AWARDS — EVERY EARNED BADGE IS LOGGED IN ACHIEVEMENTS</div></div>
  ${medalTabsHTML()}

  <div class="panel">
    <button class="btn" onclick="openAddBadgeForm()">+ Add Badge</button>
    <p class="stat-label" style="margin-top:10px; line-height:1.6;">Same idea as Medals, but image-only — no ribbon. Name it, set requirements and a target, and optionally connect it to a real streak or stat for auto-claim. Claims are logged forever in Achievements (open any one there to see when, how and why you earned it) and the bar resets so it can be earned again.</p>
  </div>

  ${badgeForm.open ? badgeFormHTML() : ''}

  <div class="grid c3" style="margin-top:16px;">
    ${badges.length ? badges.map(b=>{
      const cur = trackedCurrent(b);
      const pct = clamp((cur/b.target)*100,0,100);
      const ready = cur >= b.target;
      const auto = b.connectionKey && b.connectionKey!=='manual';
      return `
      <div class="medal" id="badgecard_${b.id}" style="${ready?'border-color:var(--gold); box-shadow:0 0 14px color-mix(in srgb, var(--gold) 35%, transparent);':''}">
        <div class="mic">${badgeGraphic(b,60)}</div>
        <div class="mn">${esc(b.name)}</div>
        ${b.requirements?`<div class="md">${esc(b.requirements)}</div>`:''}
        <div class="tag" style="margin-top:6px;">🔗 ${auto?('Auto: '+esc(trackLabel(b.connectionKey))):'Manual tracking'}</div>
        ${b.connection?`<div class="tag" style="margin-top:4px;">${esc(b.connection)}</div>`:''}
        <div class="bar" style="margin-top:10px;"><i style="width:${pct}%"></i></div>
        <div class="stat-label" style="margin-top:4px;">${Number.isInteger(cur)?cur:cur.toFixed(1)} / ${b.target}${b.timesEarned?` · Earned ${b.timesEarned}×`:''}</div>
        ${auto ? `
        <div class="stat-label" style="margin-top:6px;">Fills automatically — claims itself at target.</div>
        <button class="btn ghost sm" style="margin-top:6px;" onclick="resetBadgeTracking('${b.id}')">Reset Progress</button>
        ` : `
        <div style="display:flex; gap:6px; justify-content:center; align-items:center; margin-top:8px; flex-wrap:wrap;">
          <button class="btn ghost sm" onclick="bumpBadgeProgress('${b.id}',-1)">-1</button>
          <input type="number" style="width:60px; text-align:center;" value="${b.current}" onchange="setBadgeProgress('${b.id}', this.value)">
          <button class="btn ghost sm" onclick="bumpBadgeProgress('${b.id}',1)">+1</button>
        </div>
        <button class="btn ${ready?'':'ghost'} sm" style="margin-top:8px; width:100%; ${ready?'':'opacity:.5;'}" ${ready?`onclick="claimBadge('${b.id}')"`:'disabled'}>${ready?'◉ Claim Badge':'Locked'}</button>
        `}
        <div style="display:flex; gap:6px; justify-content:center; margin-top:6px;">
          <button class="btn ghost sm" onclick="openEditBadgeForm('${b.id}')">Edit</button>
          <button class="btn ghost sm" onclick="deleteCustomBadge('${b.id}')">Delete</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1;">No badges yet — tap "+ Add Badge" above to create your first one.</div>'}
  </div>

  <div style="margin-top:26px; border-top:1px solid var(--border); padding-top:16px;">
    <div class="eyebrow" style="margin-bottom:10px;">STANDARD BADGES — AUTO-TRACKED</div>
    <div class="grid c3">
      ${autoBadges.map(b=>{
        const pct = clamp(b.current/b.target*100,0,100);
        return `
        <div class="badgechip ${b.unlocked?'':'locked'}" style="flex-direction:column; align-items:stretch;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="bi" style="border-radius:6px; width:auto; height:auto; padding:4px;">${medalSVG(b.ribbon, b.unlocked, true)}</div>
            <div>
              <div class="bn" style="font-family:'Orbitron'; font-size:12px;">${b.name}</div>
              <div class="stat-label">${b.desc}</div>
            </div>
          </div>
          <div class="bar" style="margin-top:10px;"><i style="width:${pct}%"></i></div>
          <div class="stat-label" style="margin-top:4px;">${Math.min(b.current,b.target)} / ${b.target}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
  <div class="panel" style="margin-top:16px;">
    <p style="color:var(--dim); font-size:13px;">Earn a Standard Side Arm Badge by excelling in that field for 30+ days, per the OLC Rule Book.</p>
  </div>
  `;
}


/* The Rule Book is now part of the OLC Book library (books.js section in v10.js). Amendments below belong to it. */
function addRuleBookNote(){
  const text = document.getElementById('rb_custom').value.trim();
  if(!text) return;
  state.ruleBookNotes.unshift({ id: uid('note'), date: todayStr(), text });
  saveState(); renderSection();
}
function deleteRuleBookNote(id){
  state.ruleBookNotes = state.ruleBookNotes.filter(n=>n.id!==id);
  saveState(); renderSection();
}

/* ========================================================
   SECTION: ARCHIVES & HISTORY
======================================================== */
function secArchives(){
  const dates = Object.keys(state.dailyLogs).sort((a,b)=>a<b?1:-1);
  const rankLog = getRankInfo(state.xp);

  // Monthly rollups
  const byMonth = {};
  dates.forEach(d=>{
    const ym = d.slice(0,7);
    if(!byMonth[ym]) byMonth[ym] = { days:0, dssSum:0, fullGoals:0 };
    byMonth[ym].days++;
    byMonth[ym].dssSum += getDSS(d);
    const day = state.dailyLogs[d];
    byMonth[ym].fullGoals += goalsForDate(d).filter(g=>goalStatus(day,g.id)==='full').length;
  });
  const months = Object.keys(byMonth).sort((a,b)=>b<a?-1:1);

  return `
  <div class="pagehead"><h2>HISTORY &amp; ARCHIVES</h2><div class="sub">NOTHING GETS DELETED — ${dates.length} DAYS RECORDED</div></div>

  <div class="panel" style="margin-bottom:16px;">
    <h3><span class="ic">📅</span>MONTHLY SUMMARY</h3>
    <div class="grid c3">
      ${months.length ? months.map(ym=>{
        const m = byMonth[ym];
        const avgDss = Math.round(m.dssSum/m.days);
        return `<div class="panel" style="text-align:center;">
          <div class="eyebrow">${ym}</div>
          <div class="stat-big" style="font-size:26px;">${avgDss}<span style="font-size:13px; color:var(--dim);"> avg DSS</span></div>
          <div class="stat-label" style="margin-top:6px;">${m.days} days logged · ${m.fullGoals} goals completed</div>
        </div>`;
      }).join('') : '<div class="empty">No history yet</div>'}
    </div>
  </div>

  <div class="panel" style="margin-bottom:16px;">
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between;">
      <div class="field" style="margin:0; min-width:180px;"><label class="f">Jump to date</label><input type="date" id="historyJump" onchange="jumpToHistoryDate(this.value)"></div>
      <button class="btn ghost sm" onclick="exportMyData()">⬇ Export My Data (JSON)</button>
    </div>
  </div>

  <div class="panel">
    <h3><span class="ic">🗄</span>DAILY REPORTS <span style="font-weight:400; color:var(--dim); font-size:11px;">(last 2 months · click a row for full detail)</span></h3>
    <table>
      <tr><th>Date</th><th>DSS</th><th>Goals</th><th>Woke On Time</th><th>Water</th><th>Screen</th><th>EOD Logged</th></tr>
      ${dates.length ? dates.slice(0,62).map(d=>{
        const day = state.dailyLogs[d];
        const activeGoals = goalsForDate(d);
        const done = activeGoals.filter(g=>goalStatus(day,g.id)==='full').length;
        const hasEod = day.eod.well || day.eod.failed || day.eod.learned || day.eod.tomorrow;
        const waterL = day.waterL||0;
        const scrMin = (day.screen&&day.screen.totalMin)||0;
        const scrOver = scrMin>0 && scrMin>state.settings.screenLimit;
        return `<tr id="hrow-${d}" style="cursor:pointer;" onclick="openDayDetail('${d}')"><td>${d}</td><td>${getDSS(d)}</td><td>${done}/${activeGoals.length}</td><td>${day.wokeOnTime?'✓':'—'}</td><td>${waterL?waterL+'L':'—'}</td><td style="${scrMin?(scrOver?'color:var(--danger);':'color:var(--green);'):''}">${scrMin?scrMin+'m':'—'}</td><td>${hasEod?'✓':'—'}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="empty">No history yet — complete your first day</td></tr>'}
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
  const d = (typeof activeDivision === 'function') ? activeDivision() : null;
  if(d && d.systemTheme && d.systemTheme !== 'auto' && theme !== d.systemTheme){ toast('The active Division "' + (d.name||d.division) + '" keeps the system in ' + d.systemTheme + ' mode. Switch the Division off to change it.', 4200); return; }
  state.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtnDark')?.classList.toggle('active', theme==='dark');
  document.getElementById('themeBtnLight')?.classList.toggle('active', theme==='light');
  saveState();
}

/* Colour choices were replaced by Divisions (see v10.js): the active Division sets the theme of the whole system. */
function openThemeModal(){ openDivisionSwitcher(); }
function closeThemeModal(){ const m = document.getElementById('themeModal'); if(m) m.style.display='none'; }

/* Monk Mode was removed in v10. */
function applyMonkMode(){ document.documentElement.classList.remove('monk-mode'); }

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

function setRankXP(i, val){
  const n = Number(val);
  if(isNaN(n)){ renderSection(); return; }
  const ranks = effectiveRanks();
  const prev = ranks[i-1] ? ranks[i-1].xp : -1;
  const next = ranks[i+1] ? ranks[i+1].xp : Infinity;
  if(n<=prev || n>=next){
    alert(`${RANKS[i].name} must be more than ${prev>=0?prev:0} XP and less than ${next===Infinity?'∞':next} XP to keep ranks in order.`);
    renderSection(); return;
  }
  if(!state.rankOverrides) state.rankOverrides = RANKS.map(r=>r.xp);
  state.rankOverrides[i] = n;
  saveState(); renderSection();
}
function resetRankXP(){
  if(!confirm('Reset all rank XP requirements back to the original OLC values?')) return;
  state.rankOverrides = null;
  saveState(); renderSection();
}
function openRankInfo(idx){
  const ranks = effectiveRanks();
  const r = ranks[idx];
  const info = RANK_INFO[idx];
  const next = ranks[idx+1];
  const rangeTxt = next ? `${r.xp} – ${next.xp-1} XP` : `${r.xp}+ XP`;
  document.getElementById('rankInfoBody').innerHTML = `
    <div style="text-align:center;">
      <img src="${RANK_IMAGES[RANK_KEYS[idx]]}" style="width:90px; filter:drop-shadow(0 0 14px color-mix(in srgb, var(--lavender) 60%, transparent));">
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

function jumpToHistoryDate(date){
  if(!date || !state.dailyLogs[date]){ alert('No history recorded for that date.'); return; }
  openDayDetail(date);
  setTimeout(()=>{ document.getElementById('hrow-'+date)?.scrollIntoView({behavior:'smooth', block:'center'}); }, 300);
}
function exportMyData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `olc-backup-${(loggedAccount()?.username||'agent').replace(/[^A-Za-z0-9._-]+/g,'_')}-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function openDayDetail(date){
  const day = state.dailyLogs[date];
  if(!day) return;
  const goalsHtml = goalsForDate(date).map(g=>{
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
    <div class="stat-label" style="margin:0 0 14px;">Water: ${day.waterL||0}L / ${state.settings.waterGoal}L &nbsp;·&nbsp; Screen Time: ${(day.screen&&day.screen.totalMin)||0} / ${state.settings.screenLimit} min</div>
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
  // Show it any time we're NOT currently running as an installed app — this way,
  // if the app gets uninstalled later, the button is simply there again next visit,
  // instead of depending on the browser re-firing beforeinstallprompt.
  btn.style.display = isStandalone() ? 'none' : '';
}

// startup is handled by auth.js (boot())

window.OLC_BUSY = window.OLC_BUSY || [];
window.OLC_BUSY.push(() => medalForm.open || badgeForm.open);
