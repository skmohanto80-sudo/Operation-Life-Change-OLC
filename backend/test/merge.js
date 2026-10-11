const M = require('../merge.js');
const assert = require('assert');
const clone = (o)=>JSON.parse(JSON.stringify(o));
let T = 1000; const tick = () => (T += 1);
function Dev(name, st){ this.name=name; this.s = st ? clone(st) : {}; this.snap = M.snapshot(this.s); }
Dev.prototype.commit = function(){ const r = M.stamp(this.s, this.snap, tick()); this.snap = r.snap; };
Dev.prototype.absorb = function(other){ const r = M.merge(this.s, other.s); this.s = r.state; this.snap = M.snapshot(this.s); };
const base = { profile:{name:'SK'}, goals:[{id:'g1',label:'Study',xp:10}], dailyLogs:{'2026-10-06':{items:{}, waterL:0, ratings:{study:0}}}, trackerLogs:{weight:[]}, xpL:{m0:100}, settings:{theme:'dark'} };
// 1. laptop edit then phone sync must keep the laptop edit
let L = new Dev('L', base), P = new Dev('P', base), S = new Dev('S', base);
L.s.dailyLogs['2026-10-06'].items.g1 = 'full'; L.s.dailyLogs['2026-10-06'].ratings.study = 4; L.commit();
S.absorb(L); P.absorb(S);
assert.equal(P.s.dailyLogs['2026-10-06'].items.g1, 'full'); assert.equal(P.s.dailyLogs['2026-10-06'].ratings.study, 4);
// 2. phone makes a *different* edit, pushes; laptop pulls -> both survive
P.s.dailyLogs['2026-10-06'].waterL = 1.5; P.s.profile.name='Agent SK'; P.commit();
S.absorb(P); L.absorb(S);
assert.equal(L.s.dailyLogs['2026-10-06'].waterL, 1.5); assert.equal(L.s.dailyLogs['2026-10-06'].items.g1, 'full'); assert.equal(L.s.profile.name,'Agent SK');
// 3. phone with stale defaults (rollover zeros) must not erase laptop's real data
let P2 = new Dev('P2', base); P2.s.dailyLogs['2026-10-07'] = {items:{}, waterL:0, ratings:{study:0}}; P2.commit();
let L2 = new Dev('L2', base); L2.s.dailyLogs['2026-10-07'] = {items:{g1:'full'}, waterL:2, ratings:{study:5}}; L2.commit();
P2.absorb(L2); assert.equal(P2.s.dailyLogs['2026-10-07'].waterL, 2); assert.equal(P2.s.dailyLogs['2026-10-07'].ratings.study, 5);
// 4. concurrent record adds in the same collection both survive
let A = new Dev('A', base), B = new Dev('B', base);
A.s.trackerLogs.weight.push({id:'w_a', date:'2026-10-06', kg:50}); A.commit();
B.s.trackerLogs.weight.push({id:'w_b', date:'2026-10-06', kg:51}); B.commit();
A.absorb(B); B.absorb(A);
assert.deepEqual(A.s.trackerLogs.weight.map(x=>x.id).sort(), ['w_a','w_b']); assert.deepEqual(clone(A.s), clone(B.s));
// 5. deletion propagates, and edit-after-delete of an other field does not resurrect a half record
A.s.trackerLogs.weight = A.s.trackerLogs.weight.filter(x=>x.id!=='w_b'); A.commit();
B.s.trackerLogs.weight.find(x=>x.id==='w_b').kg = 52; B.commit();   // B edits older than A's delete? (B committed earlier tick) 
A.absorb(B); B.absorb(A); assert.deepEqual(A.s.trackerLogs.weight.map(x=>x.id).sort(), ['w_a','w_b']); assert.equal(A.s.trackerLogs.weight.find(x=>x.id==='w_b').date,'2026-10-06'); assert.deepEqual(clone(A.s), clone(B.s));
// 5b. plain delete (no later edit) propagates
A.s.trackerLogs.weight = A.s.trackerLogs.weight.filter(x=>x.id!=='w_a'); A.commit(); B.absorb(A); assert.deepEqual(B.s.trackerLogs.weight.map(x=>x.id), ['w_b']);
// 6. xp from two devices both count
A.s.xpL['d_A'] = 10; A.commit(); B.s.xpL['d_B'] = 25; B.commit(); A.absorb(B); B.absorb(A);
assert.equal(A.s.xp, 135); assert.equal(B.s.xp, 135);
// 7. idempotent + commutative
const r1 = M.merge(A.s, B.s).state, r2 = M.merge(B.s, A.s).state, r3 = M.merge(r1, r1).state;
assert.deepEqual(clone(r1), clone(r2)); assert.deepEqual(clone(r1), clone(r3));
// 8. random fuzz: 3 devices, random edits & random syncs, then full sync -> all equal and every last edit present
for (let round=0; round<300; round++){
  const D = [new Dev('x', base), new Dev('y', base), new Dev('z', base)];
  const lastWrite = {};  // key -> [t, value]
  for (let step=0; step<30; step++){
    const d = D[Math.floor(Math.random()*3)];
    const r = Math.random();
    if (r<0.45){ const k='k'+Math.floor(Math.random()*5); const v=Math.floor(Math.random()*1000)+1; d.s.settings[k]=v; d.commit(); lastWrite['settings/'+k]=[T,v]; }
    else if (r<0.65){ const id='r'+Math.floor(Math.random()*6); d.s.goals = d.s.goals||[]; const ex = d.s.goals.find(g=>g.id===id); if(ex){ ex.label='L'+step+d.name; } else d.s.goals.push({id, label:'N'+step, xp:step}); d.commit(); }
    else if (r<0.75){ const id='r'+Math.floor(Math.random()*6); d.s.goals = (d.s.goals||[]).filter(g=>g.id!==id); d.commit(); }
    else { const o = D[Math.floor(Math.random()*3)]; if(o!==d) d.absorb(o); }
  }
  for (let i=0;i<2;i++) for (const a of D) for (const b of D) if (a!==b) a.absorb(b);
  const canon=(o)=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((a,x)=>(a[x]=v[x],a),{}):v);const j0 = canon(D[0].s), j1=canon(D[1].s), j2=canon(D[2].s);
  assert.equal(j0,j1,'diverged x/y'); assert.equal(j0,j2,'diverged x/z');
  for (const [k,[t,v]] of Object.entries(lastWrite)) { const key=k.split('/')[1]; assert.equal(D[0].s.settings[key], v, 'lost latest write '+k); }
}
console.log('merge engine: all tests passed');
