// The poetry book. The PDF lives only in ziggy's private Supabase storage.
// This file reads the text from it on the phone and lays each page out in ziggy's own type.
// Nothing from the book is written into the app's code.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
let lib, doc, docVersion;
const parsed = new Map();

async function pdfjs() {
  if (lib) return lib;
  lib = await import(PDFJS + 'pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  return lib;
}

// Loads the book once, keeping a copy on this phone so it opens fast next time.
export async function loadBook(download, version) {
  if (doc && docVersion === version) return doc;
  let buf;
  const key = 'book-' + version;
  try { const c = await caches.open('ziggy-book'); const hit = await c.match(key); if (hit) buf = await hit.arrayBuffer(); } catch {}
  if (!buf) {
    const blob = await download();
    buf = await blob.arrayBuffer();
    try { const c = await caches.open('ziggy-book'); for (const k of await c.keys()) await c.delete(k); await c.put(key, new Response(buf.slice(0))); } catch {}
  }
  const L = await pdfjs();
  doc = await L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  docVersion = version; parsed.clear();
  return doc;
}
export async function openFile(file) {
  const L = await pdfjs();
  doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  docVersion = 'local'; parsed.clear();
  return doc;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Turns 1 PDF page into paragraphs: joins wrapped lines, keeps real line breaks, centring, bold and italics.
export async function pageBlocks(n) {
  if (parsed.has(n)) return parsed.get(n);
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const fonts = {};
  try {
    await page.getOperatorList();
    for (const it of tc.items) if (it.fontName && !(it.fontName in fonts)) { try { fonts[it.fontName] = page.commonObjs.get(it.fontName)?.name || ''; } catch { fonts[it.fontName] = ''; } }
  } catch {}
  const items = tc.items.filter((it) => typeof it.str === 'string').map((it) => ({
    s: it.str.replace(/[​﻿]/g, ''), x: it.transform[4], y: it.transform[5], w: it.width,
    size: Math.hypot(it.transform[2], it.transform[3]) || 11, font: fonts[it.fontName] || '',
  })).filter((it) => it.s.length);
  const body = items.filter((it) => !(it.y > vp.height * 0.88 && /^\s*([0-9]+|[ivxlc]+)\s*$/i.test(it.s)));
  body.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const it of body) {
    const l = lines.at(-1);
    if (l && Math.abs(l.y - it.y) < it.size * 0.45) l.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.runs = []; let prev = null;
    for (const it of l.items) {
      let s = it.s;
      if (prev && it.x - (prev.x + prev.w) > it.size * 0.18 && !/\s$/.test(prev.s) && !/^\s/.test(s)) s = ' ' + s;
      const i = /italic|oblique/i.test(it.font), b = /bold|black|semibold/i.test(it.font);
      const r = l.runs.at(-1);
      if (r && r.i === i && r.b === b) r.t += s; else l.runs.push({ t: s, i, b });
      prev = it;
    }
    l.text = l.runs.map((r) => r.t).join('');
    l.x0 = Math.min(...l.items.map((t) => t.x)); l.x1 = Math.max(...l.items.map((t) => t.x + t.w));
    l.size = Math.max(...l.items.map((t) => t.size));
  }
  const L = lines.filter((l) => l.text.trim());
  if (!L.length) { parsed.set(n, []); return []; }
  const left = Math.min(...L.map((l) => l.x0)), right = Math.max(...L.map((l) => l.x1)), width = Math.max(1, right - left);
  const gaps = [];
  for (let i = 1; i < L.length; i++) { const d = L[i - 1].y - L[i].y; if (d < L[i].size * 2.2) gaps.push(d); }
  gaps.sort((a, b) => a - b);
  const lead = gaps.length ? gaps[Math.floor(gaps.length / 2)] : L[0].size * 1.3;

  const blocks = []; let cur = null;
  L.forEach((l, i) => {
    const brk = i === 0 || (L[i - 1].y - l.y) > lead * 1.45;
    const centered = Math.abs((l.x0 + l.x1) / 2 - vp.width / 2) < l.size * 1.6 && (l.x1 - l.x0) < vp.width * 0.62;
    if (brk) { cur = { lines: [], centered: true }; blocks.push(cur); }
    cur.lines.push(l); if (!centered) cur.centered = false;
  });
  const html = (l) => l.runs.map((r) => { let t = esc(r.t); if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t; }).join('');
  const out = blocks.map((bk, bi) => {
    let h = '';
    bk.lines.forEach((l, li) => {
      h += html(l).trim();
      if (li < bk.lines.length - 1) h += (!bk.centered && l.x1 >= right - width * 0.07) ? ' ' : '<br>';
    });
    const plain = bk.lines.map((l) => l.text).join(' ').trim();
    const allBold = bk.lines.every((l) => l.runs.every((r) => r.b || !r.t.trim()));
    const heading = bi === 0 && bk.lines.length === 1 && allBold && blocks.length > 1;
    return { kind: heading ? 'h' : 'p', center: bk.centered, html: h, plain };
  });
  parsed.set(n, out);
  return out;
}

// Works out the book's shape: which pages are the cover, each Part, the poems, and the closing pages.
// Saves page numbers only, never any words.
const roman = (s) => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100 }; let t = 0; s = s.toLowerCase(); for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; t += a < b ? -a : a; } return t; };
export async function bookMap(onProgress) {
  const parts = {}, front = []; let cur = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages);
    const b = await pageBlocks(n);
    const first = (b[0]?.plain || '').trim();
    if (!first) continue;
    if (/^table of contents/i.test(first)) continue;
    const m = first.match(/^part\s+([ivxlc]+|\d+)\b\.?/i);
    if (m) { cur = /\d/.test(m[1]) ? Number(m[1]) : roman(m[1]); (parts[cur] ??= []).push([n, 't']); continue; }
    if (/^(acknowledg|about this book)/i.test(first)) { (parts[cur || 1] ??= []).push([n, 'e']); continue; }
    if (!cur) { front.push([n, 'f']); continue; }
    parts[cur].push([n, 'p']);
  }
  if (front.length) parts[1] = [...front, ...(parts[1] || [])];
  return parts;
}

// The reader: 1 page at a time, swipe sideways, scroll down on long pages.
export function openReader(o) {
  const { pages, startIndex = 0, isRead, onRead, onPage, onClose, partLabel } = o;
  const poems = pages.filter(([, k]) => k === 'p');
  const root = document.createElement('div');
  root.className = 'reader'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', partLabel);
  root.innerHTML = `
    <div class="r-top"><button class="r-close" type="button" aria-label="Close"></button><span class="r-part">${esc(partLabel)}</span><span class="r-count" id="r-count"></span></div>
    <div class="r-line"><i id="r-line"></i></div>
    <div class="r-track" id="r-track">${pages.map((p, i) => `<section class="r-page ${p[1] === 'p' ? 'is-poem' : 'is-' + p[1]}" data-i="${i}"><div class="r-inner"><div class="r-wait"></div></div></section>`).join('')}</div>
    <div class="r-foot"><span class="r-state" id="r-state"></span><span class="r-hint" id="r-hint">Swipe for the next page</span></div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));
  const track = root.querySelector('#r-track');
  let idx = -1, timer = null, closed = false;
  const readCount = () => poems.filter(([n]) => isRead(n)).length;
  const paintLine = () => { root.querySelector('#r-line').style.width = (poems.length ? readCount() / poems.length * 100 : 0) + '%'; };

  async function fill(i) {
    const sec = track.children[i]; if (!sec || sec.dataset.done) return;
    sec.dataset.done = '1';
    try {
      const blocks = await pageBlocks(pages[i][0]);
      sec.querySelector('.r-inner').innerHTML = blocks.map((b) => `<${b.kind === 'h' ? 'h3' : 'p'}${b.center ? ' class="c"' : ''}>${b.html}</${b.kind === 'h' ? 'h3' : 'p'}>`).join('');
    } catch { sec.dataset.done = ''; sec.querySelector('.r-inner').innerHTML = '<p class="c r-err">This page didn’t load. Swipe away and back to try again.</p>'; }
  }
  function show(i) {
    if (i === idx) return;
    idx = i;
    for (let k = i - 1; k <= i + 2; k++) if (k >= 0 && k < pages.length) fill(k);
    const [n, kind] = pages[i];
    const pos = poems.findIndex(([m]) => m === n);
    root.querySelector('#r-count').textContent = kind === 'p' ? `${pos + 1} of ${poems.length}` : '';
    const st = root.querySelector('#r-state');
    st.className = 'r-state'; st.textContent = kind === 'p' && isRead(n) ? 'read' : '';
    if (i > 0) root.querySelector('#r-hint').classList.add('gone');
    onPage?.(n);
    clearTimeout(timer);
    if (kind === 'p' && !isRead(n)) timer = setTimeout(async () => {
      if (closed || idx !== i) return;
      const gained = await onRead(n);
      if (gained === null || closed) return;
      st.textContent = 'read'; st.className = 'r-state' + (gained ? ' pop' : '');
      if (gained) st.dataset.xp = `+${gained} XP`;
      paintLine();
    }, 4000);
  }
  let raf = 0;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => show(Math.round(track.scrollLeft / track.clientWidth))); }, { passive: true });
  const go = (d) => track.scrollTo({ left: (idx + d) * track.clientWidth, behavior: 'smooth' });
  const key = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  function close() {
    if (closed) return; closed = true; clearTimeout(timer);
    document.removeEventListener('keydown', key);
    root.classList.remove('in');
    setTimeout(() => root.remove(), 320);
    onClose?.();
  }
  root.querySelector('.r-close').onclick = close;
  paintLine();
  requestAnimationFrame(() => { track.scrollLeft = startIndex * track.clientWidth; show(startIndex); });
  return { close };
}
