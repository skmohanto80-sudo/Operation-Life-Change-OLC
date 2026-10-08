/* ============================================================
   OLC MERGE ENGINE  (shared by the app and the server — identical code)
   ------------------------------------------------------------
   Every field of the data ("leaf") carries the time of its last change.
   Merging two copies keeps, for every field, the value that was changed
   LAST — by any device. Nothing is replaced wholesale, so an edit made on
   the laptop can never wipe an edit made on the phone (and vice-versa).

   - objects            -> merged key by key
   - arrays of {id,...} -> merged record by record (a "collection"), fields inside merged separately
   - other arrays       -> one value (last writer wins)
   - deletions          -> remembered as tombstones so they travel to other devices too
   - merge(a,b) == merge(b,a), and merging twice changes nothing  => all devices converge
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OLCMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const META = '_m';
  const SKIP_TOP = { _m: 1, xp: 1 };          // xp is derived from the per-device ledger (xpL)
  const TOMB_KEEP_MS = 120 * 86400e3;

  const isPlain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
  const enc = (s) => String(s).replace(/[%\/]/g, (c) => (c === '%' ? '%25' : '%2F'));
  const encKey = (s) => { s = enc(s); return (s[0] === '~' ? '%7E' + s.slice(1) : s[0] === '@' ? '%40' + s.slice(1) : s); };
  const dec = (s) => s.replace(/%(2F|25|7E|40)/g, (m, c) => ({ '2F': '/', '25': '%', '7E': '~', '40': '@' }[c]));
  const clone = (v) => (v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  const sigOf = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  const zeroLike = (v) => v === null || v === 0 || v === '' || v === false;

  function isKeyed(a) {
    if (!a.length) return false;
    const seen = new Set();
    for (const e of a) {
      if (!isPlain(e) || typeof e.id !== 'string' || !e.id || seen.has(e.id)) return false;
      seen.add(e.id);
    }
    return true;
  }

  /* ---- flatten: state -> Map(path -> {v, sig}) + set of record roots ---- */
  function flatten(state) {
    const leaves = new Map(), roots = new Set();
    (function walk(node, path, top) {
      if (Array.isArray(node)) {
        if (isKeyed(node)) {
          const ids = [];
          for (const el of node) {
            const rp = path + '/~' + enc(el.id);
            roots.add(rp); ids.push(el.id);
            walk(el, rp, false);
          }
          const sig = JSON.stringify(ids);
          leaves.set(path + '/@o', { v: ids, sig });
        } else if (node.length) leaves.set(path, { v: node, sig: JSON.stringify(node) });
        return;
      }
      if (isPlain(node)) {
        for (const k of Object.keys(node)) {
          if (top && SKIP_TOP[k]) continue;
          const val = node[k];
          if (val === undefined || typeof val === 'function') continue;
          const p = (path ? path + '/' : '') + encKey(k);
          if (val !== null && typeof val === 'object') walk(val, p, false);
          else leaves.set(p, { v: (typeof val === 'number' && !isFinite(val)) ? null : val, sig: (typeof val === 'number' && !isFinite(val)) ? null : val });
        }
      }
    })(state, '', true);
    return { leaves, roots };
  }

  /* ---- unflatten: Map(path -> value) -> state ---- */
  class KA { constructor() { this.m = new Map(); this.order = null; } }
  function unflatten(map) {
    const rootObj = {};
    for (const [p, v] of map) {
      const segs = p.split('/');
      let cur = rootObj;
      for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i], next = segs[i + 1];
        const nextIsKA = next[0] === '~' || next === '@o';
        if (cur instanceof KA) {
          const id = dec(seg.slice(1));
          let el = cur.m.get(id); if (!el) { el = {}; cur.m.set(id, el); }
          cur = el;
        } else {
          const key = dec(seg);
          let ch = cur[key];
          if (ch === undefined || ch === null || typeof ch !== 'object') { ch = nextIsKA ? new KA() : {}; cur[key] = ch; }
          cur = ch;
        }
      }
      const last = segs[segs.length - 1];
      if (cur instanceof KA) {
        if (last === '@o') cur.order = v;
        else { const id = dec(last.slice(1)); if (!cur.m.has(id)) cur.m.set(id, {}); }
      } else cur[dec(last)] = clone(v);
    }
    const fin = (n) => {
      if (n instanceof KA) {
        const out = [], used = new Set();
        const ord = Array.isArray(n.order) ? n.order : [];
        for (const id of ord) if (n.m.has(id) && !used.has(id)) { used.add(id); out.push(n.m.get(id)); }
        const rest = [...n.m.keys()].filter((id) => !used.has(id)).sort();
        for (const id of rest) out.push(n.m.get(id));
        out.forEach((el, i) => { fin(el); if (el.id === undefined) el.id = [...n.m.keys()].find((k) => n.m.get(k) === el); });
        return out;
      }
      if (isPlain(n)) for (const k of Object.keys(n)) if (n[k] && typeof n[k] === 'object') n[k] = fin(n[k]);
      return n;
    };
    return fin(rootObj);
  }

  function inGoneRecord(p, liveRoots) {
    let i = p.indexOf('/~');
    while (i !== -1) {
      let j = p.indexOf('/', i + 1); if (j === -1) j = p.length;
      if (j < p.length || p.slice(0, j) !== p) { if (!liveRoots.has(p.slice(0, j))) return true; }
      i = p.indexOf('/~', j);
    }
    return false;
  }

  /* ---- stamping: called after local edits ---- */
  function newMeta() { return { s: {}, d: {} }; }
  function ensureMeta(state) {
    if (!isPlain(state[META])) state[META] = newMeta();
    if (!isPlain(state[META].s)) state[META].s = {};
    if (!isPlain(state[META].d)) state[META].d = {};
    return state[META];
  }
  /* prev = result of a previous snapshot(); returns the new snapshot */
  function snapshot(state) {
    const f = flatten(state), sig = new Map();
    for (const [p, l] of f.leaves) sig.set(p, l.sig);
    return { sig, roots: f.roots };
  }
  function stamp(state, prev, now) {
    const m = ensureMeta(state), cur = flatten(state);
    let changed = 0;
    for (const [p, l] of cur.leaves) {
      if (!prev.sig.has(p)) {
        if (!zeroLike(l.v) || p.endsWith('/@o')) { m.s[p] = now; changed++; } 
        delete m.d[p];
      } else if (prev.sig.get(p) !== l.sig) { m.s[p] = now; delete m.d[p]; changed++; }
    }
    for (const p of prev.sig.keys()) {
      if (cur.leaves.has(p)) continue;
      delete m.s[p]; changed++;
      if (inGoneRecord(p, cur.roots)) continue;      // the whole record was deleted: one tombstone on the record is enough
      m.d[p] = now;
    }
    for (const r of prev.roots) if (!cur.roots.has(r)) m.d[r] = now;
    for (const r of cur.roots) if (!prev.roots.has(r)) delete m.d[r];
    const sig = new Map(); for (const [p, l] of cur.leaves) sig.set(p, l.sig);
    return { snap: { sig, roots: cur.roots }, changed };
  }

  /* ---- merge ---- */
  function merge(a, b) {
    const A = prep(a), B = prep(b);
    const out = new Map(), s = {}, d = {};
    let fromA = false, fromB = false, maxT = 0;
    const paths = new Set([...A.flat.leaves.keys(), ...B.flat.leaves.keys(), ...Object.keys(A.m.d), ...Object.keys(B.m.d)]);
    for (const p of paths) {
      const la = A.flat.leaves.get(p), lb = B.flat.leaves.get(p);
      const sa = A.m.s[p] || 0, sb = B.m.s[p] || 0, da = A.m.d[p] || 0, db = B.m.d[p] || 0;
      const eA = la ? { t: sa, present: true, v: la.v, sig: la.sig } : (da ? { t: da, present: false } : null);
      const eB = lb ? { t: sb, present: true, v: lb.v, sig: lb.sig } : (db ? { t: db, present: false } : null);
      let win, src;
      if (!eA) { win = eB; src = 'b'; }
      else if (!eB) { win = eA; src = 'a'; }
      else if (eA.t > eB.t) { win = eA; src = 'a'; }
      else if (eB.t > eA.t) { win = eB; src = 'b'; }
      else if (eA.present && eB.present) {
        if (eA.sig === eB.sig) { win = eA; src = 'ab'; }
        else if (typeof eA.v === 'number' && typeof eB.v === 'number') { const pickA = eA.v > eB.v; win = pickA ? eA : eB; src = pickA ? 'a' : 'b'; }
        else if (eA.t === 0 && zeroLike(eA.v) !== zeroLike(eB.v)) { const pickA = !zeroLike(eA.v); win = pickA ? eA : eB; src = pickA ? 'a' : 'b'; }
        else { const sa_ = String(JSON.stringify(eA.v)), sb_ = String(JSON.stringify(eB.v)); const pickA = sa_ >= sb_; win = pickA ? eA : eB; src = pickA ? 'a' : 'b'; }
      } else if (eA.present) { win = eA; src = 'a'; }
      else if (eB.present) { win = eB; src = 'b'; }
      else { win = eA; src = 'ab'; }
      if (win.present) { out.set(p, win.v); if (win.t) s[p] = win.t; } else d[p] = win.t;
      if (win.t > maxT) maxT = win.t;
      // does the result differ from what A / B had?
      const sameAsA = la ? (win.present && la.sig === win.sig && (sa || 0) === (win.t || 0)) : !win.present && (da || 0) === (win.t || 0);
      const sameAsB = lb ? (win.present && lb.sig === win.sig && (sb || 0) === (win.t || 0)) : !win.present && (db || 0) === (win.t || 0);
      if (!sameAsA) fromB = true;
      if (!sameAsB) fromA = true;
    }
    // A deleted record (tombstone on its root) disappears completely — unless one of its fields was edited
    // AFTER the deletion, in which case the whole record is kept (never a half-record).
    const rootsDead = Object.keys(d).filter((r) => r.indexOf('/~') !== -1 || r[0] === '~');
    if (rootsDead.length) {
      const dead = new Set(rootsDead), groups = new Map();
      for (const p of out.keys()) {
        let i = p.indexOf('/~');
        while (i !== -1) {
          let j = p.indexOf('/', i + 1); if (j === -1) j = p.length;
          const r = p.slice(0, j);
          if (dead.has(r) && r !== p) { if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
          i = p.indexOf('/~', j);
        }
      }
      for (const [r, list] of groups) {
        const t = d[r]; let newest = 0;
        for (const p of list) if ((s[p] || 0) > newest) newest = s[p];
        if (newest > t) { delete d[r]; }
        else { for (const p of list) { out.delete(p); delete s[p]; } fromA = fromB = true; }
      }
    }
    const cutoff = Date.now() - TOMB_KEEP_MS;
    for (const p of Object.keys(d)) if (d[p] < cutoff && d[p] > 0) delete d[p];
    const state = unflatten(out);
    state[META] = { s, d };
    derive(state);
    return { state, fromA, fromB, maxStamp: maxT };
  }
  /* data from before the XP ledger existed: its xp becomes the ledger's starting value */
  function withLedger(st) {
    if (isPlain(st.xpL) || typeof st.xp !== 'number' || !st.xp) return st;
    return Object.assign({}, st, { xpL: { m0: st.xp } });
  }
  function prep(st) {
    st = withLedger(isPlain(st) ? st : {});
    const m = isPlain(st[META]) ? st[META] : {};
    return { flat: flatten(st), m: { s: isPlain(m.s) ? m.s : {}, d: isPlain(m.d) ? m.d : {} } };
  }

  /* xp = sum of the per-device ledger (so two devices adding XP at the same time BOTH count) */
  function derive(state) {
    if (isPlain(state.xpL)) { let t = 0; for (const k of Object.keys(state.xpL)) t += Number(state.xpL[k]) || 0; state.xp = t; }
    return state;
  }
  function maxStampOf(state) {
    const m = state && state[META]; let t = 0;
    if (!m) return 0;
    for (const k in m.s) if (m.s[k] > t) t = m.s[k];
    for (const k in m.d) if (m.d[k] > t) t = m.d[k];
    return t;
  }

  return { META, withLedger, flatten, unflatten, snapshot, stamp, merge, derive, maxStampOf, isKeyed, ensureMeta };
});
