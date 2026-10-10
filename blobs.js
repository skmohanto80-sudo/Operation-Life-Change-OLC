/* ============================================================
   OLC FILES (blobs.js) — images and PDFs are kept OUT of the synced data.
   The data only holds a short reference ("blob:b_xxxx"); the file itself lives
   in this device's IndexedDB and in the cloud. This keeps saving and syncing fast
   and lets other devices download a file only when they actually need it.
   ============================================================ */
const Blobs = (function(){
  const DB = 'olc-files', ST = 'files';
  let dbp = null; const mem = new Map();          // fallback + hot cache of records
  const urls = new Map(), loading = new Map();    // objectURL cache, in-flight loads
  const PLACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function open(){
    if(dbp) return dbp;
    dbp = new Promise((res) => {
      try{
        const q = indexedDB.open(DB, 1);
        q.onupgradeneeded = () => { const d = q.result; if(!d.objectStoreNames.contains(ST)){ const s = d.createObjectStore(ST, { keyPath: 'id' }); s.createIndex('up', 'up'); } };
        q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
      }catch(e){ res(null); }
    });
    return dbp;
  }
  const tx = (db, mode) => db.transaction(ST, mode).objectStore(ST);
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function getRec(id){
    if(mem.has(id)) return mem.get(id);
    const db = await open(); if(!db) return null;
    try{ const r = await req(tx(db, 'readonly').get(id)); if(r) mem.set(id, r); return r || null; }catch(e){ return null; }
  }
  async function putRec(rec){
    mem.set(rec.id, rec);
    const db = await open(); if(!db) return;
    try{ await req(tx(db, 'readwrite').put(rec)); }catch(e){}
  }
  async function hashBytes(buf){
    try{ if(crypto && crypto.subtle){ const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); let s = ''; for(let i = 0; i < 12; i++) s += h[i].toString(16).padStart(2, '0'); return s; } }catch(e){}
    let a = 0x811c9dc5, b = 0x1b873593; const u = new Uint8Array(buf);
    for(let i = 0; i < u.length; i++){ a = Math.imul(a ^ u[i], 16777619); b = Math.imul(b + u[i], 2246822519) ^ (a >>> 7); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0') + u.length.toString(16);
  }
  const idOf = (ref) => String(ref || '').replace(/^blob:/, '');
  const isRef = (v) => typeof v === 'string' && v.startsWith('blob:');

  /* store a File/Blob; returns the reference to keep in the data */
  async function put(file, mime){
    const buf = await file.arrayBuffer();
    const id = 'b_' + await hashBytes(buf);
    const m = mime || file.type || 'application/octet-stream';
    const old = await getRec(id);
    if(!old) await putRec({ id, mime: m, size: buf.byteLength, blob: new Blob([buf], { type: m }), up: 0, at: Date.now() });
    return 'blob:' + id;
  }
  async function getBlob(ref){
    const id = idOf(ref); const r = await getRec(id);
    if(r && r.blob) return r.blob;
    // not on this device: download from the cloud (cached afterwards)
    if(loading.has(id)) return loading.get(id);
    const p = (async () => {
      const acc = (typeof loggedAccount === 'function') ? loggedAccount() : null;
      if(!acc || !acc.token || navigator.onLine === false) return null;
      try{
        const res = await fetch(API_BASE_URL + '/api/blobs/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + acc.token } });
        if(!res.ok) return null;
        const blob = await res.blob();
        await putRec({ id, mime: blob.type || res.headers.get('content-type') || 'application/octet-stream', size: blob.size, blob, up: 1, at: Date.now() });
        return blob;
      }catch(e){ return null; }
    })();
    loading.set(id, p); p.finally(() => loading.delete(id));
    return p;
  }
  /* object URL if the file is already on this device, else a placeholder + background download */
  function src(ref){
    if(!isRef(ref)) return ref || '';
    const id = idOf(ref);
    if(urls.has(id)) return urls.get(id);
    getBlob(ref).then((b) => { if(b){ const u = URL.createObjectURL(b); urls.set(id, u); hydrate(document); document.dispatchEvent(new CustomEvent('olc-blob', { detail: { ref } })); } });
    return PLACE;
  }
  async function url(ref){
    if(!isRef(ref)) return ref;
    const id = idOf(ref); if(urls.has(id)) return urls.get(id);
    const b = await getBlob(ref); if(!b) return null;
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  }
  /* <img data-bref="blob:..."> elements are filled in as soon as the file is available */
  function hydrate(root){
    (root || document).querySelectorAll('[data-bref]').forEach((el) => {
      const ref = el.getAttribute('data-bref'); if(!ref) return;
      const id = idOf(ref);
      if(urls.has(id)){
        if(el.tagName === 'IMG'){ if(el.getAttribute('src') !== urls.get(id)) el.src = urls.get(id); }
        else el.style.backgroundImage = 'url(' + urls.get(id) + ')';
        el.classList.remove('blob-wait'); return;
      }
      el.classList.add('blob-wait');
      getBlob(ref).then((b) => { if(!b) return; if(!urls.has(id)) urls.set(id, URL.createObjectURL(b)); hydrate(document); });
    });
  }
  async function uploadPending(acc){
    acc = acc || (typeof loggedAccount === 'function' ? loggedAccount() : null);
    if(!acc || !acc.token || (typeof legacyServer !== 'undefined' && legacyServer)) return;
    const db = await open(); let list = [];
    if(db){ try{ list = (await req(tx(db, 'readonly').index('up').getAll(0))) || []; }catch(e){} }
    else list = [...mem.values()].filter((r) => !r.up);
    if(!list.length) return;
    // ask the cloud which ones it already has (skip those)
    let have = [];
    try{ const r = await api('POST', '/api/blobs/have', { ids: list.map((x) => x.id).slice(0, 200) }, acc.token, { timeout: 20000 }); if(r.ok) have = r.data.have || []; }catch(e){ return; }
    for(const rec of list){
      if(have.includes(rec.id)){ rec.up = 1; await putRec(rec); continue; }
      try{
        const res = await fetch(API_BASE_URL + '/api/blobs/' + encodeURIComponent(rec.id) + '?m=' + encodeURIComponent(rec.mime), { method: 'PUT', headers: { Authorization: 'Bearer ' + acc.token, 'Content-Type': 'application/octet-stream' }, body: rec.blob });
        if(res.ok){ rec.up = 1; await putRec(rec); }
        else if(res.status === 413){ if(typeof toast === 'function') toast('Cloud file storage is full — some files are only on this device.', 6000); return; }
      }catch(e){ return; }
    }
  }
  /* shrink a picture before it is stored (keeps the app and the cloud light). keepAlpha=true keeps transparency (logos, flags) */
  async function compress(file, o){
    o = o || {}; const maxW = o.maxW || 1200, maxH = o.maxH || maxW, q = o.quality || 0.82;
    if(!/^image\//.test(file.type) || /svg|gif/.test(file.type)) return file;
    let bmp = null;
    try{ bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }catch(e){}
    if(!bmp){
      bmp = await new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(file); i.onload = () => { res(i); }; i.onerror = rej; i.src = u; });
    }
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    const k = Math.min(1, maxW / w0, maxH / h0);
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, w, h);
    const type = o.keepAlpha ? 'image/png' : 'image/jpeg';
    const out = await new Promise((res) => c.toBlob(res, type, q));
    if(bmp.close) try{ bmp.close(); }catch(e){}
    return out && out.size < file.size ? out : (o.keepAlpha && out ? out : file);
  }
  async function dims(ref){
    const u = await url(ref); if(!u) return null;
    return new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = u; });
  }
  if(typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'){
    let t = null; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => hydrate(document), 30); });
    const start = () => mo.observe(document.body, { childList: true, subtree: true });
    if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  return { put, getBlob, src, url, hydrate, uploadPending, compress, dims, isRef, idOf, PLACE };
})();
/* <img> that loads a stored file (or any normal image path) */
function bimg(ref, attrs){
  attrs = attrs || '';
  if(Blobs.isRef(ref)) return `<img data-bref="${esc(ref)}" src="${Blobs.PLACE}" ${attrs}>`;
  return `<img src="${esc(ref || '')}" ${attrs}>`;
}
