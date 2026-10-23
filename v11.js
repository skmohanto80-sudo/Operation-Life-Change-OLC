/* ============================================================
   v11 — Tracker Division upgrades · Day pages for History · Command Dashboard
   ============================================================ */

/* ---------- small helpers ---------- */
const fmt1 = (n) => (Math.round(n * 10) / 10).toString();
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => a.length ? sum(a) / a.length : 0;
function dashDates(n){ const t = todayStr(), out = []; for(let i = n - 1; i >= 0; i--){ const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() - i); out.push(todayStr(d)); } return out; }
const logsOn = (name, date) => ((state.trackerLogs && state.trackerLogs[name]) || []).filter(e => e && e.date === date);
const studyOn = (date) => sum(logsOn('study', date).map(e => Number(e.hours) || 0));
const sleepOn = (date) => sum(logsOn('sleep', date).map(e => sleepHours(e)));
const exerciseOn = (date) => logsOn('exercise', date).length;
const waterOn = (date) => { const d = state.dailyLogs[date]; return d ? Number(d.waterL) || 0 : 0; };
const screenOn = (date) => { const d = state.dailyLogs[date]; return d && d.screen ? Number(d.screen.totalMin) || 0 : 0; };
function dayXPTotal(date){ return dayGoalXP(date) + Math.round(studyOn(date) * 10); }

/* ============================================================
   TRACKER DIVISION — edit / delete by ID (never by position), totals, full history
   ============================================================ */
function trkIdx(name, ref){ const arr = (state.trackerLogs && state.trackerLogs[name]) || []; return typeof ref === 'string' ? arr.findIndex(x => x && x.id === ref) : Number(ref); }
function fixEditIdx(){
  const e = editingTracker; if(!e || !e.name || !e.id) return;
  const i = trkIdx(e.name, e.id);
  if(i < 0) editingTracker = { name: null, index: null }; else e.index = i;
}
const _startEdit0 = startEditEntry, _delEntry0 = deleteTrackerEntry, _secTrackers0 = secTrackers;
startEditEntry = function(name, ref){
  const i = trkIdx(name, ref); if(i < 0) return;
  editingTracker = { name, index: i, id: (state.trackerLogs[name][i] || {}).id };
  renderSection(); const el = document.getElementById('trk_' + name); if(el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
deleteTrackerEntry = function(name, ref){ const i = trkIdx(name, ref); if(i < 0) return; return _delEntry0(name, i); };
['saveSleepLog', 'saveWeightLog', 'saveHeightLog', 'saveExerciseLog', 'saveStudyLog'].forEach(n => {
  const f = window[n]; if(typeof f !== 'function') return;
  window[n] = function(){ fixEditIdx(); return f.apply(this, arguments); };
});
function toggleTrkAll(){ trkAll = !trkAll; renderSection(); }
function trackerSummaryHTML(){
  const t = todayStr(), w7 = dashDates(7);
  const T = state.trackerLogs, study = T.study || [], ex = T.exercise || [], wt = [...(T.weight || [])].sort((a, b) => a.date < b.date ? -1 : 1);
  const studyTotal = sum(study.map(e => Number(e.hours) || 0)), study7 = sum(w7.map(studyOn));
  const sleepDays = w7.filter(d => sleepOn(d) > 0), sleepAvg = avg(sleepDays.map(sleepOn));
  const ex7 = sum(w7.map(exerciseOn)), exMin7 = sum(ex.filter(e => w7.includes(e.date)).map(e => Number(e.durationMin) || 0));
  const wLast = wt.length ? wt[wt.length - 1] : null, wPrev = wt.length > 1 ? wt[0] : null;
  const card = (ic, label, big, sub) => `<div class="panel" style="text-align:center; padding:12px;"><div class="eyebrow">${ic} ${label}</div><div class="stat-big" style="font-size:26px; margin:4px 0;">${big}</div><div class="stat-label">${sub}</div></div>`;
  return `<div class="grid c4" style="margin-bottom:16px;">
    ${card('📚', 'STUDY', fmt1(studyOn(t)) + ' h', 'today · ' + fmt1(study7) + ' h this week · ' + fmt1(studyTotal) + ' h total')}
    ${card('🛌', 'SLEEP', sleepAvg ? fmt1(sleepAvg) + ' h' : '—', sleepAvg ? 'average of the last ' + sleepDays.length + ' logged night(s)' : 'log bed + wake time')}
    ${card('🏋️', 'EXERCISE', ex7 + ' sessions', 'this week · ' + exMin7 + ' min · ' + ex.length + ' total')}
    ${card('⚖️', 'WEIGHT', wLast ? wLast.kg + ' kg' : '—', wLast && wPrev && wPrev !== wLast ? ((wLast.kg - wPrev.kg >= 0 ? '+' : '') + fmt1(wLast.kg - wPrev.kg) + ' kg since ' + wPrev.date) : 'latest entry')}
  </div>
  <div style="display:flex; justify-content:flex-end; margin:-6px 0 12px;"><button class="btn ghost sm" onclick="toggleTrkAll()">${trkAll ? '▲ Show latest 10 only' : '▼ Show full history in every table'}</button></div>`;
}
secTrackers = function(){
  try{ ensureEntryIds(state, false); }catch(e){}
  fixEditIdx();
  let html = _secTrackers0();
  html = html.replace(/\b(startEditEntry|deleteTrackerEntry)\('(\w+)',(\d+)\)/g, (m, fn, name, i) => { const e = (state.trackerLogs[name] || [])[Number(i)]; return e && e.id ? fn + "('" + name + "','" + e.id + "')" : m; });
  return html.replace('<div class="grid c2">', trackerSummaryHTML() + '<div class="grid c2">');
};

/* ============================================================
   DAY PAGES (History) — every day is its own page; today's edits never change earlier days
   ============================================================ */
let dayPageDate = null;
function openDayDetail(date){ if(!state.dailyLogs[date]) return; dayPageDate = date; renderDayPage(); document.getElementById('dayDetailModal').style.display = 'flex'; document.getElementById('dayDetailBox')?.scrollTo?.(0, 0); }
function dayNav(dir){ const dates = Object.keys(state.dailyLogs).sort(), i = dates.indexOf(dayPageDate), j = i + dir; if(j >= 0 && j < dates.length){ dayPageDate = dates[j]; renderDayPage(); } }
function renderDayPage(){
  const date = dayPageDate, day = state.dailyLogs[date]; if(!day) return;
  const dates = Object.keys(state.dailyLogs).sort(), i = dates.indexOf(date);
  const goals = goalsForDate(date), dss = getDSS(date), gxp = dayGoalXP(date), sxp = Math.round(studyOn(date) * 10);
  const goalsHtml = goals.map(g => {
    const s = goalStatus(day, g.id), eff = goalXPEffect(g, s);
    const lbl = s === 'full' ? 'FULL' : s === 'half' ? 'HALF' : s === 'fail' ? 'FAIL' : 'NOT MARKED';
    const col = s === 'full' ? 'var(--green)' : s === 'half' ? 'var(--gold)' : s === 'fail' ? 'var(--danger)' : 'var(--dim)';
    return `<div class="dp-row"><span>${esc(g.label)} <small style="color:var(--dim)">(${g.xp} XP)</small></span><span style="color:${col}; font-family:'Share Tech Mono'; font-size:12px;">${lbl}${s ? ' · ' + (eff > 0 ? '+' : '') + fmt1(eff) + ' XP' : ''}</span></div>`;
  }).join('') || '<div class="empty">No goals on this day</div>';
  const list = (title, arr, row) => arr.length ? `<h3 class="dp-h">${title}</h3>${arr.map(row).join('')}` : '';
  const trk = list('📚 STUDY', logsOn('study', date), e => `<div class="dp-row"><span>${esc(e.subject || '—')}${e.topic ? ' · ' + esc(e.topic) : ''}</span><span class="mono">${e.hours} h · ${e.sessions || 1} sess.</span></div>`)
    + list('🛌 SLEEP', logsOn('sleep', date), e => `<div class="dp-row"><span>${e.bed} → ${e.wake}</span><span class="mono">${fmt1(sleepHours(e))} h</span></div>`)
    + list('🏋️ EXERCISE', logsOn('exercise', date), e => `<div class="dp-row"><span>${esc(e.name || '—')} ${e.amount ? '· ' + esc(e.amount) : ''}</span><span class="mono">${e.durationMin || 0} min${e.gripper ? ' · grip ' + e.gripper : ''}</span></div>`)
    + list('⚖️ WEIGHT / 📏 HEIGHT', logsOn('weight', date).map(e => ({ t: e.kg + ' kg' })).concat(logsOn('height', date).map(e => ({ t: e.cm + ' cm' }))), e => `<div class="dp-row"><span>${e.t}</span></div>`);
  const ratingsHtml = RATING_CATS.map(c => `<span class="tag" style="margin-right:6px;">${c.icon} ${c.label}: ${(day.ratings && day.ratings[c.key]) || 0}★</span>`).join('');
  const eod = day.eod || {}, hasEod = eod.well || eod.failed || eod.learned || eod.tomorrow;
  const pl = day.planner || {}, hasPl = pl.morning || pl.afternoon || pl.night;
  const devs = (day.screen && day.screen.devices || []).filter(d => d.name || (d.apps || []).length);
  document.getElementById('dayDetailBody').innerHTML = `
    <div class="dp-nav"><button class="btn ghost sm" ${i <= 0 ? 'disabled' : ''} onclick="dayNav(-1)">‹ Earlier day</button>
      <div style="text-align:center"><h3 style="color:var(--lavender); margin:0;">${fmtDateLong(date)}</h3><div class="stat-label">DAY PAGE · ${i + 1} OF ${dates.length}${date === todayStr() ? ' · TODAY' : ''}</div></div>
      <button class="btn ghost sm" ${i >= dates.length - 1 ? 'disabled' : ''} onclick="dayNav(1)">Later day ›</button></div>
    <div class="dp-grid">
      <div class="panel dp-k"><div class="eyebrow">DSS</div><div class="stat-big">${dss}</div></div>
      <div class="panel dp-k"><div class="eyebrow">GOAL XP</div><div class="stat-big">${gxp > 0 ? '+' : ''}${fmt1(gxp)}</div></div>
      <div class="panel dp-k"><div class="eyebrow">STUDY XP</div><div class="stat-big">+${sxp}</div></div>
      <div class="panel dp-k"><div class="eyebrow">GOALS FULL</div><div class="stat-big">${goals.filter(g => goalStatus(day, g.id) === 'full').length}/${goals.length}</div></div>
    </div>
    <div class="stat-label" style="margin:0 0 10px;">Woke on time: ${day.wokeOnTime ? '✓' : '—'} · Reading: ${day.readingDone ? '✓' : '—'} · Water: ${day.waterL || 0} L / ${state.settings.waterGoal} L · Screen: ${(day.screen && day.screen.totalMin) || 0} / ${state.settings.screenLimit} min</div>
    <h3 class="dp-h">☑ GOALS OF THIS DAY</h3>${goalsHtml}
    ${trk}
    ${devs.length ? `<h3 class="dp-h">📱 SCREEN TIME</h3>${devs.map(d => `<div class="dp-row"><span>${esc(d.name || 'Device')}${d.purpose ? ' · ' + esc(d.purpose) : ''}</span><span class="mono">${(d.apps || []).map(a => esc(a.name) + ' ' + a.min + 'm').join(', ') || '—'}</span></div>`).join('')}` : ''}
    <h3 class="dp-h">⭐ RATINGS</h3><div>${ratingsHtml}</div>
    ${hasPl ? `<h3 class="dp-h">🗓 PLANNER</h3>${pl.morning ? `<div><b style="color:var(--dim)">Morning:</b> ${esc(pl.morning)}</div>` : ''}${pl.afternoon ? `<div><b style="color:var(--dim)">Afternoon:</b> ${esc(pl.afternoon)}</div>` : ''}${pl.night ? `<div><b style="color:var(--dim)">Night:</b> ${esc(pl.night)}</div>` : ''}` : ''}
    ${hasEod ? `<h3 class="dp-h">📓 END OF DAY REVIEW</h3>${eod.well ? `<div><b style="color:var(--dim)">Went well:</b> ${esc(eod.well)}</div>` : ''}${eod.failed ? `<div><b style="color:var(--dim)">Failed:</b> ${esc(eod.failed)}</div>` : ''}${eod.learned ? `<div><b style="color:var(--dim)">Learned:</b> ${esc(eod.learned)}</div>` : ''}${eod.tomorrow ? `<div><b style="color:var(--dim)">Tomorrow:</b> ${esc(eod.tomorrow)}</div>` : ''}` : ''}`;
}

/* ============================================================
   COMMAND DASHBOARD — KPIs with pins, targets, trend graphs, pie charts, heat-map
   ============================================================ */
let dashRange = 30;
function dashState(){ if(!state.dash || typeof state.dash !== 'object') state.dash = {}; const d = state.dash; if(!d.pins || typeof d.pins !== 'object') d.pins = {}; if(!d.targets || typeof d.targets !== 'object') d.targets = {}; if(!Array.isArray(d.notes)) d.notes = []; return d; }
function setDashRange(n){ dashRange = n; renderSection(); }
function togglePin(key){ const d = dashState(); d.pins[key] = d.pins[key] ? 0 : 1; saveState(); renderSection(); }
function setDashTarget(key, v){ dashState().targets[key] = Number(v) || 0; saveState(); renderSection(); }
function addDashNote(){ const el = document.getElementById('dashNoteTxt'); const text = el && el.value.trim(); if(!text) return; dashState().notes.unshift({ id: uid('note'), text, done: 0, at: todayStr() }); saveState(); renderSection(); }
function toggleDashNote(id){ const n = dashState().notes.find(x => x.id === id); if(n){ n.done = n.done ? 0 : 1; saveState(); renderSection(); } }
function deleteDashNote(id){ const d = dashState(); d.notes = d.notes.filter(x => x.id !== id); saveState(); renderSection(); }

/* --- tiny SVG chart kit (uses the theme colours, so it follows every Division / dark / light) --- */
function svgSpark(vals, color){
  if(!vals.length || vals.every(v => !v)) return '<svg viewBox="0 0 100 24" class="spark"><line x1="0" y1="20" x2="100" y2="20" stroke="var(--border)" stroke-width="1"/></svg>';
  const mx = Math.max(...vals), mn = Math.min(...vals), r = (mx - mn) || 1;
  const pts = vals.map((v, i) => (i * 100 / Math.max(1, vals.length - 1)).toFixed(1) + ',' + (21 - (v - mn) / r * 18).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 100 24" class="spark" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color || 'var(--lavender)'}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function svgLineChart(vals, labels, o){
  o = o || {}; const W = 320, H = 150, L = 30, R = 8, T = 10, B = 22, n = vals.length;
  const mx = Math.max(o.max || 0, ...vals, o.target || 0, 1), mn = 0;
  const X = (i) => L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1)), Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  const pts = vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1));
  const color = o.color || 'var(--lavender)';
  const grid = [0, .5, 1].map(f => { const y = Y(mn + (mx - mn) * f); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="var(--dim)">${fmt1(mn + (mx - mn) * f)}</text>`; }).join('');
  const lab = labels.map((l, i) => (i === 0 || i === n - 1 || (n > 10 && i % Math.ceil(n / 5) === 0)) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" font-size="8" fill="var(--dim)">${l}</text>` : '').join('');
  const tg = o.target ? `<line x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="5 3"/><text x="${W - R}" y="${Y(o.target) - 3}" text-anchor="end" font-size="8" fill="var(--gold)">target ${fmt1(o.target)}</text>` : '';
  const dots = n <= 31 ? vals.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.2" fill="${color}"><title>${labels[i]}: ${fmt1(v)}${o.unit || ''}</title></circle>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${grid}${tg}<polygon points="${L},${Y(0)} ${pts.join(' ')} ${X(n - 1)},${Y(0)}" fill="${color}" opacity=".13"/><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}${lab}</svg>`;
}
function svgBarChart(vals, labels, o){
  o = o || {}; const W = 320, H = 150, L = 30, R = 8, T = 10, B = 22, n = vals.length;
  const mxv = Math.max(...vals.map(Math.abs), o.target || 0, 1), mid = vals.some(v => v < 0);
  const y0 = mid ? T + (H - T - B) / 2 : H - B, half = mid ? (H - T - B) / 2 : (H - T - B);
  const bw = (W - L - R) / n, Y = (v) => y0 - v / mxv * half;
  const bars = vals.map((v, i) => `<rect x="${(L + i * bw + bw * .15).toFixed(1)}" y="${Math.min(Y(v), y0).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - y0)).toFixed(1)}" rx="1.5" fill="${v < 0 ? 'var(--danger)' : (o.color || 'var(--cyan)')}"><title>${labels[i]}: ${fmt1(v)}${o.unit || ''}</title></rect>`).join('');
  const lab = labels.map((l, i) => (i === 0 || i === n - 1 || (n > 10 && i % Math.ceil(n / 5) === 0)) ? `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="8" fill="var(--dim)">${l}</text>` : '').join('');
  const tg = o.target ? `<line x1="${L}" x2="${W - R}" y1="${Y(o.target)}" y2="${Y(o.target)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="5 3"/><text x="${W - R}" y="${Y(o.target) - 3}" text-anchor="end" font-size="8" fill="var(--gold)">target ${fmt1(o.target)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}" stroke="var(--border-strong)" stroke-width=".8"/><text x="${L - 4}" y="${T + 3}" text-anchor="end" font-size="8" fill="var(--dim)">${fmt1(mxv)}</text>${tg}${bars}${lab}</svg>`;
}
function svgDonut(slices, centerTop, centerSub){
  const total = sum(slices.map(s => s.value));
  if(!total) return '<div class="empty" style="padding:30px 0">No data in this range yet</div>';
  let off = 25; const arcs = slices.filter(s => s.value > 0).map(s => { const p = s.value / total * 100; const a = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${s.color}" stroke-width="6.5" stroke-dasharray="${p.toFixed(2)} ${(100 - p).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"><title>${esc(s.label)}: ${fmt1(s.value)} (${Math.round(p)}%)</title></circle>`; off -= p; return a; }).join('');
  const legend = slices.filter(s => s.value > 0).map(s => `<div class="lg"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${fmt1(s.value)}${s.unit || ''} <small>${Math.round(s.value / total * 100)}%</small></b></div>`).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 42 42" class="donut"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--border)" stroke-width="6.5" opacity=".4"/>${arcs}<text x="21" y="21.5" text-anchor="middle" font-size="7" font-weight="700" fill="var(--white)">${centerTop}</text><text x="21" y="27" text-anchor="middle" font-size="3.4" fill="var(--dim)">${centerSub || ''}</text></svg><div class="legend">${legend}</div></div>`;
}
const PIE_COLORS = ['var(--lavender)', 'var(--cyan)', 'var(--gold)', 'var(--green)', 'var(--violet)', 'var(--danger)', '#7fb3ff', '#ff9bd0'];
function heatmapHTML(weeks){
  const t = todayStr(), end = new Date(t + 'T00:00:00'); const dow = (end.getDay() + 6) % 7;             // Monday = 0
  const start = new Date(end); start.setDate(start.getDate() - dow - (weeks - 1) * 7);
  let cols = '';
  for(let w = 0; w < weeks; w++){
    let col = '';
    for(let d = 0; d < 7; d++){
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d); const ds = todayStr(dt);
      if(ds > t){ col += '<i class="hm empty"></i>'; continue; }
      const has = state.dailyLogs[ds], v = has ? getDSS(ds) : -1;
      const bg = v < 0 ? 'var(--panel-2)' : 'color-mix(in srgb, var(--lavender) ' + (12 + Math.round(v * .78)) + '%, var(--panel-2))';
      col += `<i class="hm" style="background:${bg}" title="${ds}: ${v < 0 ? 'no record' : 'DSS ' + v}" onclick="${has ? "openDayDetail('" + ds + "')" : ''}"></i>`;
    }
    cols += '<div class="hm-col">' + col + '</div>';
  }
  return `<div class="heatmap">${cols}</div><div class="stat-label" style="margin-top:6px">Each square is a day — brighter = higher Daily Success Score. Tap one to open that day's page.</div>`;
}

secDashboard = function(){
  const t = todayStr(), D = dashState(), TG = Object.assign({ studyWeek: 20, sleepHrs: 7.5, water: 0, xpMonth: 1000, dss: 80, exerciseWeek: 4, screenMax: 0, weight: 0 }, D.targets);
  const rank = getRankInfo(state.xp), p = state.profile, daysActive = daysBetween(p.startDate || t, t), stats = getLifeStats();
  const dates = dashDates(dashRange), w7 = dashDates(7), w14 = dashDates(14), lab = (d) => d.slice(5);
  const recDates = dates.filter(d => state.dailyLogs[d]);
  const dssV = dates.map(d => state.dailyLogs[d] ? getDSS(d) : 0), xpV = dates.map(d => state.dailyLogs[d] ? dayXPTotal(d) : Math.round(studyOn(d) * 10));
  const studyV = dates.map(studyOn), sleepV = dates.map(sleepOn), waterV = dates.map(waterOn), screenV = dates.map(screenOn);
  const waterT = TG.water || state.settings.waterGoal, screenT = TG.screenMax || state.settings.screenLimit;
  const bestStreak = Math.max(0, ...Object.values(state.streaks).map(s => s.count));
  const goalRate = (() => { let f = 0, n = 0; recDates.forEach(d => { const day = state.dailyLogs[d]; goalsForDate(d).forEach(g => { n++; if(goalStatus(day, g.id) === 'full') f++; }); }); return n ? Math.round(f / n * 100) : 0; })();
  const monthKey = t.slice(0, 7), monthXP = Object.keys(state.dailyLogs).filter(d => d.startsWith(monthKey)).reduce((a, d) => a + dayXPTotal(d), 0);
  const study7 = sum(w7.map(studyOn)), sleep7 = avg(w7.filter(d => sleepOn(d) > 0).map(sleepOn)), water7 = avg(w7.map(waterOn)), screen7 = avg(w7.filter(d => screenOn(d) > 0).map(screenOn)), ex7 = sum(w7.map(exerciseOn)), dss7 = avg(w7.filter(d => state.dailyLogs[d]).map(getDSS));
  const wt = [...(state.trackerLogs.weight || [])].sort((a, b) => a.date < b.date ? -1 : 1), wLast = wt.length ? wt[wt.length - 1].kg : 0;
  const sp = (arr) => arr.slice(-14);
  const KPI = [
    { k: 'xp', ic: '✦', l: 'TOTAL XP', v: state.xp, s: rank.cur.name + ' · ' + Math.round(rank.pct) + '% to next', sp: sp(xpV) },
    { k: 'dss', ic: '◎', l: "TODAY'S DSS", v: getDSS(t), s: '7-day average ' + Math.round(dss7), sp: sp(dssV) },
    { k: 'streak', ic: '🔥', l: 'BEST STREAK', v: bestStreak + ' d', s: 'habit streak ' + ((state.streaks.habit || {}).count || 0) + ' d', sp: [] },
    { k: 'study', ic: '📚', l: 'STUDY (7 DAYS)', v: fmt1(study7) + ' h', s: 'today ' + fmt1(studyOn(t)) + ' h', sp: sp(studyV) },
    { k: 'sleep', ic: '🛌', l: 'SLEEP (AVG)', v: sleep7 ? fmt1(sleep7) + ' h' : '—', s: 'target ' + fmt1(TG.sleepHrs) + ' h', sp: sp(sleepV) },
    { k: 'water', ic: '💧', l: 'WATER (AVG)', v: fmt1(water7) + ' L', s: 'target ' + fmt1(waterT) + ' L', sp: sp(waterV) },
    { k: 'exercise', ic: '🏋️', l: 'EXERCISE (7 DAYS)', v: ex7 + ' sessions', s: 'target ' + TG.exerciseWeek, sp: sp(dates.map(exerciseOn)) },
    { k: 'screen', ic: '📱', l: 'SCREEN (AVG)', v: screen7 ? Math.round(screen7) + ' min' : '—', s: 'limit ' + screenT + ' min', sp: sp(screenV) },
    { k: 'rate', ic: '✔', l: 'GOALS DONE', v: goalRate + '%', s: 'full completion, last ' + dashRange + ' d', sp: [] },
    { k: 'weight', ic: '⚖️', l: 'WEIGHT', v: wLast ? wLast + ' kg' : '—', s: TG.weight ? 'target ' + TG.weight + ' kg' : 'set a target below', sp: wt.slice(-14).map(e => e.kg) },
  ];
  const kcard = (c) => `<div class="kpi ${D.pins[c.k] ? 'pinned' : ''}"><button class="pin" onclick="togglePin('${c.k}')" title="${D.pins[c.k] ? 'Unpin' : 'Pin to the top'}">${D.pins[c.k] ? '★' : '☆'}</button><div class="eyebrow">${c.ic} ${c.l}</div><div class="kv">${c.v}</div><div class="stat-label">${c.s}</div>${c.sp.length ? svgSpark(c.sp) : ''}</div>`;
  const pinned = KPI.filter(c => D.pins[c.k]);
  const prog = (label, cur, target, unit, key, lowerBetter) => {
    const pct = target ? clamp((lowerBetter ? (target - cur) / target + 1 : cur / target) * (lowerBetter ? 50 : 100), 0, 100) : 0;
    const ok = target ? (lowerBetter ? cur <= target : cur >= target) : false;
    return `<div class="tgt"><div class="tgt-top"><span>${label}</span><span class="mono" style="color:${ok ? 'var(--green)' : 'var(--dim)'}">${fmt1(cur)}${unit} / <input class="tgt-in" type="number" step="0.5" value="${target}" onchange="setDashTarget('${key}',this.value)" title="Change target">${unit}</span></div><div class="bar ${ok ? '' : 'gold'}"><i style="width:${Math.round(pct)}%"></i></div></div>`;
  };
  const wlabels = dates.map(lab);
  // pie data
  const outc = { full: 0, half: 0, fail: 0, none: 0 }; const perGoal = {};
  recDates.forEach(d => { const day = state.dailyLogs[d]; goalsForDate(d).forEach(g => { const s = goalStatus(day, g.id) || 'none'; outc[s]++; const o = perGoal[g.label] || (perGoal[g.label] = { f: 0, n: 0 }); o.n++; if(s === 'full') o.f++; }); });
  const bySubject = {}; (state.trackerLogs.study || []).filter(e => dates.includes(e.date)).forEach(e => { const s = e.subject || 'Other'; bySubject[s] = (bySubject[s] || 0) + (Number(e.hours) || 0); });
  const byEx = {}; (state.trackerLogs.exercise || []).filter(e => dates.includes(e.date)).forEach(e => { const s = (e.name || e.type || 'Other').slice(0, 18); byEx[s] = (byEx[s] || 0) + 1; });
  const byApp = {}; dates.forEach(d => { const day = state.dailyLogs[d]; if(day && day.screen) (day.screen.devices || []).forEach(dv => (dv.apps || []).forEach(a => { const n = (a.name || 'App').slice(0, 18); byApp[n] = (byApp[n] || 0) + (Number(a.min) || 0); })); });
  const topN = (o, unit) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value], i) => ({ label, value, unit, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const goalBars = Object.entries(perGoal).map(([l, o]) => [l, Math.round(o.f / o.n * 100), o.n]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const range = [7, 30, 90].map(n => `<button class="btn ${dashRange === n ? '' : 'ghost'} sm" onclick="setDashRange(${n})">${n} days</button>`).join('');
  return `
  <div class="pagehead"><h2>COMMAND DASHBOARD</h2><div class="sub">DAILY SUCCESS SCORE ENGINE · ${rank.cur.name.toUpperCase()} · DAY ${daysActive}</div></div>
  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:14px;"><span class="eyebrow" style="margin-right:4px;">RANGE</span>${range}<span class="stat-label" style="margin-left:auto;">☆ pin any card to keep it at the top</span></div>

  ${pinned.length ? `<div class="panel" style="margin-bottom:16px;"><h3><span class="ic">★</span>PINNED</h3><div class="kpis">${pinned.map(kcard).join('')}</div></div>` : ''}

  <div class="kpis" style="margin-bottom:16px;">${KPI.filter(c => !D.pins[c.k]).map(kcard).join('')}</div>

  <div class="grid c2">
    <div class="panel"><h3><span class="ic">◎</span>DAILY SUCCESS SCORE</h3>${svgLineChart(dssV, wlabels, { max: 100, target: TG.dss, unit: '' })}</div>
    <div class="panel"><h3><span class="ic">✦</span>XP EARNED PER DAY</h3>${svgBarChart(xpV, wlabels, { unit: ' XP', color: 'var(--lavender)' })}</div>
  </div>

  <div class="grid c2" style="margin-top:16px;">
    <div class="panel"><h3><span class="ic">🎯</span>TARGETS <span style="font-weight:400; color:var(--dim); font-size:11px;">(tap a target number to change it)</span></h3>
      ${prog('Study this week', study7, TG.studyWeek, ' h', 'studyWeek')}
      ${prog('Sleep average', sleep7, TG.sleepHrs, ' h', 'sleepHrs')}
      ${prog('Water average', water7, waterT, ' L', 'water')}
      ${prog('Exercise sessions this week', ex7, TG.exerciseWeek, '', 'exerciseWeek')}
      ${prog('Average DSS (7 days)', dss7, TG.dss, '', 'dss')}
      ${prog('XP this month', monthXP, TG.xpMonth, ' XP', 'xpMonth')}
      ${prog('Screen time average (lower is better)', screen7, screenT, ' min', 'screenMax', true)}
      ${wLast ? prog('Weight (target kg)', wLast, TG.weight || wLast, ' kg', 'weight') : ''}
    </div>
    <div class="panel"><h3><span class="ic">◈</span>LIFE STATS RADAR</h3>${radarChartSVG(stats)}</div>
  </div>

  <div class="grid c2" style="margin-top:16px;">
    <div class="panel"><h3><span class="ic">📚</span>STUDY HOURS</h3>${svgBarChart(studyV, wlabels, { unit: ' h', target: TG.studyWeek / 7, color: 'var(--cyan)' })}</div>
    <div class="panel"><h3><span class="ic">🛌</span>SLEEP HOURS</h3>${svgLineChart(sleepV, wlabels, { target: TG.sleepHrs, unit: ' h', color: 'var(--violet)', max: 10 })}</div>
  </div>

  <div class="grid c3" style="margin-top:16px;">
    <div class="panel"><h3><span class="ic">◔</span>GOAL RESULTS</h3>${svgDonut([{ label: 'Full', value: outc.full, color: 'var(--green)' }, { label: 'Half', value: outc.half, color: 'var(--gold)' }, { label: 'Fail', value: outc.fail, color: 'var(--danger)' }, { label: 'Not marked', value: outc.none, color: 'var(--dim)' }], goalRate + '%', 'FULL')}</div>
    <div class="panel"><h3><span class="ic">◔</span>STUDY BY SUBJECT</h3>${svgDonut(topN(bySubject, ' h'), fmt1(sum(Object.values(bySubject))), 'HOURS')}</div>
    <div class="panel"><h3><span class="ic">◔</span>${Object.keys(byApp).length ? 'SCREEN TIME BY APP' : 'EXERCISE MIX'}</h3>${Object.keys(byApp).length ? svgDonut(topN(byApp, ' m'), Math.round(sum(Object.values(byApp))), 'MINUTES') : svgDonut(topN(byEx, ''), sum(Object.values(byEx)), 'SESSIONS')}</div>
  </div>

  <div class="grid c2" style="margin-top:16px;">
    <div class="panel"><h3><span class="ic">▤</span>GOAL COMPLETION RATE</h3>${goalBars.length ? goalBars.map(([l, v, n]) => `<div class="tgt"><div class="tgt-top"><span>${esc(l)}</span><span class="mono">${v}% <small style="color:var(--dim)">(${n} d)</small></span></div><div class="bar ${v >= 70 ? '' : 'gold'}"><i style="width:${v}%"></i></div></div>`).join('') : '<div class="empty">Mark some goals to see how each one is going</div>'}</div>
    <div class="panel"><h3><span class="ic">📌</span>PINNED NOTES</h3>
      <div style="display:flex; gap:8px;"><input type="text" id="dashNoteTxt" placeholder="A reminder, a rule, a target…" onkeydown="if(event.key==='Enter')addDashNote()"><button class="btn sm" onclick="addDashNote()">Pin</button></div>
      <div style="margin-top:10px;">${D.notes.length ? D.notes.map(n => `<div class="dp-row"><span style="${n.done ? 'text-decoration:line-through; opacity:.55' : ''}"><input type="checkbox" ${n.done ? 'checked' : ''} onchange="toggleDashNote('${n.id}')" style="width:auto; margin-right:8px;">${esc(n.text)}</span><button class="btn ghost sm" onclick="deleteDashNote('${n.id}')">🗑</button></div>`).join('') : '<div class="empty">Nothing pinned yet</div>'}</div></div>
  </div>

  <div class="panel" style="margin-top:16px;"><h3><span class="ic">▦</span>CONSISTENCY MAP <span style="font-weight:400; color:var(--dim); font-size:11px;">(last 16 weeks)</span></h3>${heatmapHTML(16)}</div>

  <div class="panel" style="margin-top:16px;"><h3><span class="ic">⚡</span>QUICK LOG — TODAY'S GOALS</h3>${goalsForDate(t).length ? goalsForDate(t).map(g => goalRowHTML(t, g, true)).join('') : '<div class="empty">No goals yet</div>'}</div>
  <div class="panel" style="margin-top:16px;"><h3><span class="ic">⭐</span>TODAY'S RATINGS</h3>${RATING_CATS.map(c => starsHTML(t, c.key, c.label, c.icon)).join('')}</div>`;
};
