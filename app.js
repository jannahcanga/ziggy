import { CONFIG } from './config.js';
import { catSVG, giftSVG, EXPRESSIONS } from './cat.js';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const fmt = (s, o) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', o);
const fmtTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', '');

// ?date=YYYY-MM-DD previews another day without saving anything (for baby Jaa to check upcoming drops)
const params = new URLSearchParams(location.search);
const PREVIEW = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null;
const TODAY = PREVIEW || isoDay();

function rng(seed) { // small seeded random, same result all day
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashId = (n) => Math.imul(Number(n) ^ 0x5bd1e995, 2654435761) >>> 0;

const S = { tab: 'today', unlocked: false, hiddenAt: 0, catFilter: 'all' };

const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

const XP = { daily: 2, special: 5, perReward: 100 };
const CATS = { eat: 'Eat', matcha: 'Matcha and coffee', shop: 'Shop', rides: 'Rides and fun', gl: 'GL spots', sights: 'Sights', night: 'Night out', stay: 'Stay' };

const who = (w) => S.members?.find((m) => m.who === w);
const name = (w) => who(w)?.display || w;

/* ================= touch feedback ================= */
// No sound. Just a light buzz on phones that support it (Android; iPhones ignore it).
function thump(strong = true) { navigator.vibrate?.(strong ? 30 : 12); }

/* ================= ui bits ================= */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('toast-show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('toast-show'), 2400);
}
function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body">${html}</div></div>`;
  $('.backdrop', root).onclick = closeSheet;
  const body = $('.sheet-body', root);
  onMount?.(body);
  setTimeout(() => body.querySelector('[autofocus]')?.focus(), 250);
  return body;
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }
const sheetOpen = () => !!$('#sheet-root').firstChild;

/* ================= heads-up for baby Jaa ================= */
// Sends a notification to the ntfy app on baby Jaa's phone. The topic lives in Supabase settings, never on GitHub.
function notifyJaa(title, message) {
  const topic = S.settings?.notify_topic;
  if (!topic || S.me?.who !== 'kc' || PREVIEW || S.be?.demo) return;
  fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic, title, message, tags: ['tulip'], priority: 4 }) }).catch(() => {});
}

/* ================= no zooming ================= */
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// double-tap zoom is blocked with touch-action in styles.css, so quick repeat taps (like 22) still register

/* ================= cat blinks ================= */
setInterval(() => {
  if (document.hidden || Math.random() < 0.35) return;
  document.querySelectorAll('.cat[data-blinks="true"]').forEach((c) => { c.classList.add('blinking'); setTimeout(() => c.classList.remove('blinking'), 170); });
}, 3800);

/* ================= boot ================= */
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  app.innerHTML = '<div class="loading"><img src="brand/tulip-chalk-transparent.png" alt="ziggy"></div>';
  try {
    if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
      const { createSupabaseBackend } = await import('./backend.js');
      S.be = await createSupabaseBackend(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    } else {
      try { const m = await import('./demo.js'); S.be = m.createDemoBackend(); }
      catch { return renderMessage('Almost there', 'Add your Supabase Project URL and key to config.js, then reload.'); }
    }
    const session = await S.be.getSession();
    if (!session) return renderLogin();
    S.session = session;
    await afterLogin();
  } catch (e) { renderMessage('Couldn’t load', e.message + '. Check your connection and reload.'); }
}

async function afterLogin() {
  S.members = await S.be.members();
  S.me = S.members.find((m) => m.user_id === S.session.user.id);
  S.partner = S.members.find((m) => m !== S.me);
  if (!S.me) return renderMessage('Not linked yet', 'This account signed in, but it isn’t in the members table. Check the emails in setup.sql and run that part again.');
  if (!localStorage.getItem(pinKey())) renderSetPin(); else renderLock();
}

function renderMessage(title, text) {
  app.innerHTML = `<div class="gate"><div class="gate-lines" aria-hidden="true"><i class="v1"></i><i class="v2"></i><i class="h1"></i><i class="h2"></i></div><div class="brand"><img src="brand/tulip-chalk-transparent.png" alt=""><span>ziggy</span></div><div class="gate-hello"><h1>${esc(title)}</h1></div><p class="gate-note" style="margin:18px auto auto">${esc(text)}</p></div>`;
}

/* ================= login + lock ================= */
function renderLogin() {
  S.unlocked = false;
  app.innerHTML = `
  <div class="gate">
    <div class="gate-lines" aria-hidden="true"><i class="v1"></i><i class="v2"></i><i class="h1"></i><i class="h2"></i></div>
    <div class="brand"><img src="brand/tulip-chalk-transparent.png" alt=""><span>ziggy</span></div>
    <div class="gate-hello"><h1>sawadee kha</h1><p>sign in once</p></div>
    <form class="login" id="login" autocomplete="on">
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username"></label>
      <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
      <p class="err" id="err"></p>
      <button class="btn" type="submit">Sign in</button>
    </form>
  </div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector('button');
    btn.disabled = true; $('#err').textContent = '';
    try { S.session = await S.be.signIn(f.get('email').trim(), f.get('password')); await afterLogin(); }
    catch (err) { $('#err').textContent = /invalid/i.test(err.message) ? 'That email and password don’t match.' : err.message; btn.disabled = false; }
  };
}

const pinKey = () => 'ziggy-pin-' + S.me.user_id;
async function hashPin(pin) {
  const data = new TextEncoder().encode('ziggy:' + S.me.user_id + ':' + pin);
  if (crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
  return 'p:' + pin;
}

function keypad(hello, sub, { forgot } = {}) {
  app.innerHTML = `
  <div class="gate">
    <div class="gate-lines" aria-hidden="true"><i class="v1"></i><i class="v2"></i><i class="h1"></i><i class="h2"></i></div>
    <div class="brand"><img src="brand/tulip-chalk-transparent.png" alt=""><span>ziggy</span></div>
    <div class="gate-hello"><h1>${hello}</h1><p>${sub}</p></div>
    <div class="dots" id="dots" aria-label="Code"><i></i><i></i><i></i><i></i></div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}" aria-label="${n}">${n}</button>`).join('')}
      ${forgot ? '<button class="ghost" data-k="forgot">Forgot</button>' : '<span></span>'}
      <button data-k="0" aria-label="0">0</button>
      <button class="ghost" data-k="del">Delete</button>
    </div>
  </div>`;
}
function bindKeypad(onDone, onForgot) {
  let v = '';
  const dots = $('#dots');
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < v.length));
  const press = async (k) => {
    if (k === 'forgot') return onForgot?.();
    if (k === 'del') v = v.slice(0, -1); else if (v.length < 4) v += k;
    paint();
    if (v.length === 4) {
      const code = v;
      const ok = await onDone(code);
      if (ok === false) {
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); navigator.vibrate?.(90);
        setTimeout(() => { v = ''; paint(); }, 360);
      }
    }
  };
  $('.keypad').onclick = (e) => { const k = e.target.closest('button')?.dataset.k; if (k) press(k); };
  document.onkeydown = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
}

function renderLock() {
  S.unlocked = false; closeSheet();
  keypad('sawadee kha', 'nanno na kha', { forgot: true });
  bindKeypad(async (code) => {
    if ((await hashPin(code)) !== localStorage.getItem(pinKey())) return false;
    document.onkeydown = null;
    await unlock();
  }, () => {
    openSheet(`<h2>Forgot your code?</h2><p class="lead">Sign in again with your email and password, then pick a new code.</p>
      <div class="row"><button class="btn" data-go>Sign in again</button></div><div class="row"><button class="btn quiet" data-close>Cancel</button></div>`, (b) => {
      b.querySelector('[data-close]').onclick = closeSheet;
      b.querySelector('[data-go]').onclick = async () => { localStorage.removeItem(pinKey()); closeSheet(); await S.be.signOut(); renderLogin(); };
    });
  });
}

function renderSetPin(changing = false) {
  let first = null;
  const step = () => {
    keypad(first ? 'one more time' : 'choose a code', first ? 'same 4 digits' : '4 digits, just for this phone');
    bindKeypad(async (code) => {
      if (!first) { first = code; return step(); }
      if (code !== first) { first = null; toast('Those didn’t match. Try again.'); return step(); }
      localStorage.setItem(pinKey(), await hashPin(code));
      document.onkeydown = null;
      if (changing) { toast('Code changed'); renderApp(); } else await unlock();
    });
  };
  step();
}

/* ================= data ================= */
async function loadAll() {
  const be = S.be;
  const soft = (p) => p.catch(() => []); // xp and rewards stay empty until update 3's SQL has run
  const [settings, words, drops, opens, vouchers, timeline, places, xp, rewards] = await Promise.all([
    be.settings(), be.words(), be.drops(), be.opens(), be.vouchers(), be.timeline(), be.places(), soft(be.xp()), soft(be.rewards()),
  ]);
  Object.assign(S, { settings, words, drops, opens, vouchers, timeline, places, xp, rewards });
}
async function unlock() {
  app.innerHTML = '<div class="loading"><img src="brand/tulip-chalk-transparent.png" alt="ziggy"></div>';
  try { await loadAll(); } catch (e) { return renderMessage('Couldn’t load', e.message); }
  S.unlocked = true;
  renderApp();
}
async function refresh() {
  try { await loadAll(); if (!sheetOpen()) { S.calm = true; renderApp(); } } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.hiddenAt = Date.now(); return; }
  if (!S.unlocked) return;
  if (Date.now() - S.hiddenAt > 60_000) renderLock(); else refresh();
});

/* ================= shell ================= */
const unlockDay = () => S.drops.find((d) => d.kind === 'unlock' && d.show_on)?.show_on || S.settings.map_unlock;
const mapOpen = () => S.me.who === 'jaa' || (!!unlockDay() && TODAY >= unlockDay());

function renderApp() {
  if (S.tab === 'bangkok' && !mapOpen()) S.tab = 'today';
  const seenWallet = Number(localStorage.getItem('ziggy-wallet-seen-' + S.me.who) || 0);
  const walletNew = S.vouchers.some((v) => !v.redeemed_at && v.id > seenWallet);
  const mapNew = !localStorage.getItem('ziggy-map-seen-' + S.me.who);
  const tabs = [['today', 'Today'], ['wallet', 'Wallet', walletNew], ['us', 'Us'], ...(mapOpen() ? [['bangkok', 'Bangkok', mapNew]] : [])];
  app.innerHTML = `
  <div class="shell">
    <header class="top">
      <div>
        <h1>${esc(name('kc'))} &amp; ${esc(name('jaa'))}</h1>
        ${counterHTML()}
      </div>
      <button class="icon-btn" id="settings" aria-label="Settings">${ICON.gear}</button>
    </header>
    <main class="view" id="view"></main>
  </div>
  <nav class="nav" aria-label="Sections">
    ${tabs.map(([k, l, isNew]) => `<button data-tab="${k}" class="${isNew && S.tab !== k ? 'new' : ''}" ${S.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}
  </nav>`;
  $('.nav').onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (t && t !== S.tab) { S.tab = t; thump(false); renderApp(); window.scrollTo(0, 0); } };
  $('#settings').onclick = openSettings;
  bindCounter();
  ({ today: viewToday, wallet: viewWallet, us: viewUs, bangkok: viewBangkok })[S.tab]();
  if (!S.calm) $('#view').classList.add('enter');
  S.calm = false;
}

/* ================= together counter ================= */
// Counts from when you became official. A "together" row in Supabase settings can change it.
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const plural = (n, w) => `${w}${n === 1 ? '' : 's'}`;
function startParts() { return (S.settings.together || '2025-01-01').split('-').map(Number); }
function together() {
  const [y, m, d] = startParts();
  const now = new Date();
  if (PREVIEW) { const [py, pm, pd] = PREVIEW.split('-').map(Number); now.setFullYear(py, pm - 1, pd); }
  let years = now.getFullYear() - y, months = now.getMonth() - (m - 1), days = now.getDate() - d;
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  const totalMonths = years * 12 + months;
  const totalDays = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5);
  const isToday = days === 0 && totalMonths > 0;
  const next = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= d ? 1 : 0), d);
  const toNext = Math.round((Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  return { years, months, days, hours: now.getHours(), totalMonths, totalDays, isToday, toNext };
}
function milestoneName(n) { return n % 12 === 0 ? `${ord(n / 12)} anniversary` : `${ord(n)} monthsary`; }
const FACES = ['full', 'months', 'days'];
function faceHTML(face) {
  const t = together();
  const num = (n, w) => `<span><b>${n.toLocaleString('en-US')}</b><small>${plural(n, w)}</small></span>`;
  if (face === 'months') {
    const note = t.isToday ? `Happy ${milestoneName(t.totalMonths)}, today` : `${milestoneName(t.totalMonths + 1)} in ${t.toNext} ${plural(t.toNext, 'day')}`;
    return [`<span class="tg-face big">${num(t.totalMonths, 'month')}</span>`, note];
  }
  if (face === 'days') return [`<span class="tg-face big">${num(t.totalDays, 'day')}</span>`, 'and counting'];
  return [`<span class="tg-face">${num(t.years, 'year')}${num(t.months, 'month')}${num(t.days, 'day')}${num(t.hours, 'hour')}</span>`, 'together since January 1, 2025'];
}
function counterHTML() {
  S.face ??= together().isToday ? 1 : 0;
  const [face, note] = faceHTML(FACES[S.face]);
  return `<button class="together" id="together" aria-label="Time together. Tap to switch between years, months and days.">
    <span class="tg-swap" id="tg-swap">${face}<span class="tg-note">${note}${PREVIEW ? ' (preview)' : ''}</span></span>
    <span class="tg-dots" aria-hidden="true">${FACES.map((_, i) => `<i class="${i === S.face ? 'on' : ''}"></i>`).join('')}</span>
  </button>`;
}
function showFace(i) {
  S.face = (i + FACES.length) % FACES.length;
  const swap = $('#tg-swap'); if (!swap) return;
  const paint = () => {
    const [face, note] = faceHTML(FACES[S.face]);
    swap.innerHTML = `${face}<span class="tg-note">${note}${PREVIEW ? ' (preview)' : ''}</span>`;
    document.querySelectorAll('.tg-dots i').forEach((d, k) => d.classList.toggle('on', k === S.face));
    swap.classList.remove('out');
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return paint();
  swap.classList.add('out'); setTimeout(paint, 420);
}
function bindCounter() {
  const btn = $('#together'); if (!btn) return;
  btn.onclick = () => { S.pauseUntil = Date.now() + 15000; showFace(S.face + 1); };
}
// switches every 5 seconds; a tap moves it along and pauses the switching for 15 seconds
setInterval(() => {
  if (!S.unlocked || document.hidden || Date.now() < (S.pauseUntil || 0)) return;
  showFace(S.face + 1);
}, 5000);

/* ================= today ================= */
// A special day is a pinned drop (Nov 1, 10, 11, 12 and any you add in Supabase) or a monthsary.
function specialFor(day) {
  const [sy, sm, sd] = startParts();
  const [y, m, d] = day.split('-').map(Number);
  const pinned = S.drops.find((x) => x.show_on === day) || null;
  const monthsN = (y - sy) * 12 + (m - sm);
  const monthsary = d === sd && monthsN > 0 ? monthsN : 0;
  if (!pinned && !monthsary) return null;
  return { day, pinned, monthsary };
}
function treatFor(sp) {
  if (!sp) return null;
  if (sp.pinned?.voucher_title) return { title: sp.pinned.voucher_title, sub: sp.pinned.voucher_sub, tier: sp.pinned.voucher_tier || 'orchid' };
  const list = S.rewards.filter((r) => r.kind === 'special').sort((a, b) => a.sort - b.sort);
  if (!list.length) return null;
  const r = list[((dayNum(sp.day) % list.length) + list.length) % list.length];
  return { title: r.title, sub: r.sub, tier: r.tier };
}
function nickname(day) {
  const r = rng(dayNum(day) * 7919);
  const adj = S.words.filter((w) => w.kind === 'adj').map((w) => w.word);
  const noun = S.words.filter((w) => w.kind === 'noun').map((w) => w.word);
  const clash = (a, b) => a.includes(b) || b.includes(a);
  const want = Math.min(r() < 0.5 ? 3 : 4, adj.length);
  const picked = [];
  for (let tries = 0; picked.length < want && tries < 200; tries++) {
    const w = adj[Math.floor(r() * adj.length)];
    if (!picked.some((p) => clash(p, w))) picked.push(w);
  }
  let n = 'baby';
  for (let tries = 0; tries < 20 && noun.length; tries++) {
    n = noun[Math.floor(r() * noun.length)];
    if (!picked.some((p) => clash(p, n))) break;
  }
  return `my ${picked.join(' ')} ${n}`;
}
const xpTotal = () => S.xp.filter((x) => x.who === 'kc').reduce((a, x) => a + x.amount, 0);

function drumHTML(sp) {
  return `<button class="drum" id="drum" aria-label="Open today's drop">
  <svg viewBox="0 0 300 330" aria-hidden="true">
    <defs>
      <radialGradient id="g-lid" cx="42%" cy="30%" r="80%"><stop offset="0" stop-color="#fbfbfa"/><stop offset=".45" stop-color="#a6a6a4"/><stop offset="1" stop-color="#262626"/></radialGradient>
      <linearGradient id="g-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9a98"/><stop offset="1" stop-color="#1a1a1a"/></linearGradient>
      <linearGradient id="g-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".015"/><stop offset="1" stop-color="#fff" stop-opacity=".11"/></linearGradient>
      <radialGradient id="g-base" cx="50%" cy="28%" r="75%"><stop offset="0" stop-color="#f4f4f2"/><stop offset=".55" stop-color="#9a9a98"/><stop offset="1" stop-color="#3c3c3c"/></radialGradient>
      <linearGradient id="g-baseedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4c4c2"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
      <radialGradient id="g-inner" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/></radialGradient>
    </defs>
    <line class="axis" x1="150" y1="14" x2="150" y2="282"/>
    <path d="M30 282 v12 a120 30 0 0 0 240 0 v-12" fill="url(#g-baseedge)"/>
    <ellipse cx="150" cy="282" rx="120" ry="30" fill="url(#g-base)"/>
    <ellipse cx="150" cy="246" rx="96" ry="24" fill="url(#g-inner)"/>
    <path class="cross" d="M92 232 L208 260 M208 232 L92 260"/>
    <path class="gl" d="M30 200 V282 A120 30 0 0 0 270 282 V200" fill="url(#g-glass)"/>
    <ellipse class="gl" cx="150" cy="200" rx="120" ry="30" fill="rgba(255,255,255,.025)"/>
    <ellipse class="ring" cx="150" cy="200" rx="120" ry="30"/>
    <g class="lid">
      <path d="M62 128 v10 a88 22 0 0 0 176 0 v-10" fill="url(#g-edge)"/>
      <ellipse cx="150" cy="128" rx="88" ry="22" fill="url(#g-lid)"/>
    </g>
    <circle class="seal" cx="150" cy="14" r="3"/>
  </svg>
  <span class="label"><b>${sp ? 'a special drop' : 'today’s drop'}</b><span>${S.me.who === 'kc' ? `tap to open, +${sp ? XP.special : XP.daily} XP` : 'tap to open'}</span></span></button>`;
}
function voucherCardHTML(v, no) {
  const tier = ['chrome', 'orchid'].includes(v.tier) ? v.tier : '';
  return `<div class="vcard ${tier}">
    <div class="v-top"><div class="v-title">${esc(v.title)}</div>${no ? `<div class="v-no">No. ${String(no).padStart(3, '0')}</div>` : ''}</div>
    ${v.sub ? `<div class="v-sub">${esc(v.sub)}</div>` : ''}
    <div class="v-foot"><div>issued by ${esc(name(v.issued_by || 'jaa'))}<br>valid JK forever and ever</div><div class="v-mono" aria-hidden="true">JK</div></div>
  </div>`;
}
function dropCardHTML(sp) {
  const nick = `<p class="extra" style="margin:0 0 10px">Today you are officially</p><p class="stack">${esc(nickname(TODAY))}</p>`;
  if (!sp) return `<div class="drop"><p class="kind">Nickname of the day</p>${nick}</div>`;
  const p = sp.pinned;
  const label = sp.monthsary && !p ? 'A special day' : 'A special drop';
  const title = p ? p.title : `Happy ${milestoneName(sp.monthsary)}`;
  const body = p ? p.body : sp.monthsary % 12 === 0
    ? `${sp.monthsary / 12} ${plural(sp.monthsary / 12, 'year')} since we made it official. JK forever and ever.`
    : `${sp.monthsary} months since we made it official. Still choosing you, every single day.`;
  const also = p && sp.monthsary ? `<p class="extra">It’s also our ${milestoneName(sp.monthsary)}.</p>` : '';
  const treat = treatFor(sp);
  return `<div class="drop special"><p class="kind">${label}</p><h3>${esc(title)}</h3>${body ? `<p class="body">${esc(body)}</p>` : ''}${also}
    <div class="nick-block">${nick}</div>
    ${treat ? `<p class="treat-label">${S.me.who === 'kc' ? 'Today’s treat, now in your wallet' : `Today’s treat for ${esc(name('kc'))}`}</p><div class="granted">${voucherCardHTML({ ...treat, issued_by: 'jaa' })}</div>` : ''}</div>`;
}
const MOODS = [
  [0, 'A fresh start. He’s already eyeing the next one.'],
  [10, 'He’s strolling, not rushing.'],
  [30, 'Almost halfway. He noticed, he’s just not saying.'],
  [50, 'Past halfway. He’s trying very hard to look unbothered.'],
  [70, 'He can smell the reward from here.'],
  [90, 'Right at the door. Don’t keep him waiting.'],
];
const moodFor = (into) => MOODS.filter(([m]) => into >= m).pop()[1];
const idleFace = (into) => (into >= 90 ? 'excited' : into >= 50 ? 'smug' : 'sassy');
const leftText = (into) => `<b>${XP.perReward - into} XP</b> to ${S.me.who === 'kc' ? 'your' : 'her'} next reward`;
function xpHTML() {
  const total = xpTotal(), into = total % XP.perReward;
  return `<div class="section-head"><h2>${S.me.who === 'kc' ? 'Your XP' : `${esc(name('kc'))}’s XP`}</h2></div>
    <div class="xp" id="xp" style="--p:${into}">
      <div class="xp-top"><div class="xp-row"><b id="xp-total">${total}</b><span>XP</span></div><p class="xp-mood" id="xp-mood">${moodFor(into)}</p></div>
      <div class="xp-track" id="xp-track">
        <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${XP.perReward}" aria-valuenow="${into}"><i></i></div>
        <div class="xp-gift">${giftSVG()}</div>
        <button class="xp-cat" id="xp-cat" type="button" aria-label="Boop the cat">${catSVG(idleFace(into))}</button>
      </div>
      <p class="xp-left" id="xp-left">${leftText(into)}</p>
    </div>`;
}
// Swap the cat's face for a while, then let him settle back to his resting face.
function setCat(expr, ms = 0, move = '') {
  const el = $('#xp-cat'); if (!el) return;
  el.innerHTML = catSVG(expr);
  if (move) { el.classList.remove('hop', 'boop'); void el.offsetWidth; el.classList.add(move); }
  clearTimeout(setCat.t);
  if (ms) setCat.t = setTimeout(() => { const box = $('#xp'); const into = Number(box?.style.getPropertyValue('--p')) || 0; setCat(idleFace(into)); }, ms);
}
function sparkle(track, x) {
  for (let i = 0; i < 9; i++) {
    const d = document.createElement('i'); d.className = 'xp-burst';
    const a = (Math.PI * (0.15 + 0.7 * (i / 8))) , r = 34 + Math.random() * 22;
    d.style.cssText = `--x:${x}px;--dx:${Math.cos(a) * r * (i % 2 ? 1 : -1)}px;--dy:${-Math.sin(a) * r}px;--c:${i % 3 ? '#f0f0ee' : '#a98ff0'}`;
    track.appendChild(d); setTimeout(() => d.remove(), 1000);
  }
}
function animateGain(from, to) {
  const box = $('#xp'), track = $('#xp-track'); if (!box || !track) return;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const fromInto = from % XP.perReward, toInto = to % XP.perReward;
  const wrapped = Math.floor(to / XP.perReward) > Math.floor(from / XP.perReward);
  setTimeout(() => {
    const num = $('#xp-total'), t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1100); num.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    if (wrapped) {
      box.style.setProperty('--p', 100);
      setTimeout(() => { box.classList.add('no-anim'); box.style.setProperty('--p', 0); void box.offsetWidth; box.classList.remove('no-anim'); box.style.setProperty('--p', toInto); }, 1450);
    } else box.style.setProperty('--p', toInto);
    const tick = wrapped || Math.floor(toInto / 10) > Math.floor(fromInto / 10);
    setCat(tick ? 'excited' : 'happy', 3200, 'hop');
    navigator.vibrate?.([14, 50, 22]);
    setTimeout(() => {
      const cat = $('#xp-cat'); if (!cat) return;
      const x = cat.getBoundingClientRect().left + cat.offsetWidth / 2 - track.getBoundingClientRect().left;
      sparkle(track, x);
      const pop = document.createElement('span'); pop.className = 'xp-pop'; pop.textContent = `+${to - from} XP`;
      pop.style.setProperty('--x', x + 'px'); track.appendChild(pop); setTimeout(() => pop.remove(), 2300);
      $('#xp-mood').textContent = moodFor(toInto); $('#xp-left').innerHTML = leftText(toInto);
    }, 900);
  }, 700);
}
function toDeliverHTML() {
  if (S.me.who !== 'jaa') return '';
  const list = S.vouchers.filter((v) => v.redeemed_at && !v.delivered_at).sort((a, b) => a.redeemed_at.localeCompare(b.redeemed_at));
  if (!list.length) return '';
  return `<div class="section-head"><h2>To deliver</h2></div>
    <ul class="deliver" id="deliver">${list.map((v) => `<li><span><b>${esc(v.title)}</b><small>used ${fmt(v.redeemed_at.slice(0, 10), { month: 'short', day: 'numeric' })}</small></span><button class="btn line small" data-deliver="${v.id}">Delivered</button></li>`).join('')}</ul>`;
}

function viewToday() {
  const v = $('#view');
  const sp = specialFor(TODAY);
  const opened = S.opens.some((o) => o.drop_day === TODAY && o.who === S.me.who) || S.openedLocal === TODAY;
  const upcoming = S.me.who === 'jaa' ? Array.from({ length: 7 }, (_, i) => addDays(TODAY, i + 1)).map((day) => [day, specialFor(day)]) : [];
  v.innerHTML = `
    <p class="today-date">${fmt(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="stage" id="stage">${opened ? dropCardHTML(sp) : drumHTML(sp)}</div>
    ${toDeliverHTML()}
    ${xpHTML()}
    ${upcoming.length ? `<details class="peek"><summary>Coming up (only you see this)</summary><ol>
      ${upcoming.map(([day, s]) => `<li><span>${fmt(day, { month: 'short', day: 'numeric' })}</span><span>${s ? `<b>${esc(s.pinned ? s.pinned.title : `Happy ${milestoneName(s.monthsary)}`)}</b>, +${XP.special} XP and a treat` : esc(nickname(day))}</span></li>`).join('')}
    </ol></details>` : ''}
    ${specialDaysHTML()}`;

  $('#xp-cat')?.addEventListener('click', () => {
    const into = Number($('#xp')?.style.getPropertyValue('--p')) || 0, rest = idleFace(into);
    const pick = EXPRESSIONS.filter((e) => e !== rest && e !== $('#xp-cat .cat')?.dataset.expr);
    setCat(pick[Math.floor(Math.random() * pick.length)], 1900, 'boop'); thump(false);
  });
  $('#add-day')?.addEventListener('click', () => dayForm());
  $('#days')?.addEventListener('click', (e) => { const id = e.target.closest('[data-day]')?.dataset.day; if (id) dayForm(S.drops.find((d) => d.id === Number(id))); });

  $('#deliver')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-deliver]'); if (!b) return;
    b.disabled = true;
    try { await S.be.deliverVoucher(Number(b.dataset.deliver)); S.vouchers = await S.be.vouchers(); thump(false); toast('Marked delivered'); viewToday(); }
    catch { toast('Didn’t save. Try again.'); b.disabled = false; }
  });

  const drum = $('#drum');
  if (drum) drum.onclick = async () => {
    if (drum.classList.contains('strike')) return;
    drum.classList.add('strike');
    setTimeout(() => thump(true), 300);
    S.openedLocal = TODAY;
    const isKC = S.me.who === 'kc';
    let gained = 0, unlocked = [];
    const before = xpTotal();
    if (!PREVIEW) {
      try {
        await S.be.markOpen(TODAY, S.me.who);
        if (isKC) ({ gained, unlocked } = await awardDrop(sp));
      } catch (e) { toast('Opened, but didn’t save. Check your connection.'); }
    }
    setTimeout(() => {
      $('#stage').innerHTML = dropCardHTML(sp);
      if (gained) { animateGain(before, xpTotal()); renderNavBadges(); }
      if (unlocked.length) setTimeout(() => rewardSheet(unlocked), 3600);
    }, 1450);
  };
}

// Gives baby KC her XP for today's drop, today's treat on special days, and any 100 XP rewards she has reached.
async function awardDrop(sp) {
  const be = S.be;
  const amount = sp ? XP.special : XP.daily;
  const rows = await be.addXp({ who: 'kc', amount, reason: sp ? 'special day drop' : 'daily drop', ref: 'drop:' + TODAY });
  const gained = rows.length ? amount : 0;
  const treat = treatFor(sp);
  if (treat) await be.addVoucher({ ...treat, issued_by: 'jaa', source: 'special:' + TODAY });
  S.xp = await be.xp();
  const unlocked = [];
  const level = Math.floor(xpTotal() / XP.perReward);
  const prizes = S.rewards.filter((r) => r.kind === 'level').sort((a, b) => a.sort - b.sort);
  if (prizes.length) {
    const have = new Set(S.vouchers.map((v) => v.source));
    for (let L = 1; L <= level; L++) {
      if (have.has('level:' + L)) continue;
      const r = prizes[(L - 1) % prizes.length];
      const made = await be.addVoucher({ title: r.title, sub: r.sub, tier: r.tier, issued_by: 'jaa', source: 'level:' + L });
      if (made.length) { unlocked.push({ ...r, xp: L * XP.perReward }); notifyJaa('baby KC unlocked a reward', `${L * XP.perReward} XP: ${r.title}`); }
    }
  }
  S.vouchers = await be.vouchers();
  return { gained, unlocked };
}
function rewardSheet(list) {
  const r = list[list.length - 1];
  thump(true);
  openSheet(`<div class="sheet-cat">${catSVG('love')}</div><h2>${r.xp} XP</h2><p class="lead">You unlocked a reward. It’s already in your wallet, so use it whenever you want. No asking needed.</p>
    <div class="granted" style="margin:0 0 22px">${voucherCardHTML({ ...r, issued_by: 'jaa' })}</div>
    <div class="row"><button class="btn" data-go>See my wallet</button></div><div class="row"><button class="btn quiet" data-close>Later</button></div>`, (b) => {
    b.querySelector('[data-close]').onclick = closeSheet;
    b.querySelector('[data-go]').onclick = () => { closeSheet(); S.tab = 'wallet'; renderApp(); };
  });
}
function specialDaysHTML() {
  if (S.me.who !== 'jaa') return '';
  const ahead = S.drops.filter((d) => d.show_on && d.show_on >= TODAY).sort((a, b) => a.show_on.localeCompare(b.show_on));
  const when = (day) => fmt(day, { month: 'short', day: 'numeric', ...(day.slice(0, 4) !== TODAY.slice(0, 4) ? { year: 'numeric' } : {}) });
  return `<div class="section-head"><h2>Special days</h2><button class="btn line small" id="add-day">Add a day</button></div>
    ${ahead.length ? `<ul class="days" id="days">${ahead.map((d) => `<li><button type="button" data-day="${d.id}"><time>${when(d.show_on)}</time><span><b>${esc(d.title)}</b><small>${d.voucher_title ? esc(d.voucher_title) : 'a surprise from the treat list'}${d.kind === 'unlock' ? ', opens Bangkok for her' : ''}</small></span></button></li>`).join('')}</ul>`
      : '<p class="empty">No special days coming up. Add one for your next trip or date.</p>'}
    <p class="note-small">Monthsaries on the 1st happen on their own. Every special day gives ${esc(name('kc'))} +${XP.special} XP and a treat.</p>`;
}
function dayForm(d) {
  const editing = !!d;
  let mode = d?.voucher_title ? 'own' : 'list', tier = d?.voucher_tier || 'orchid';
  const tiers = [['black', 'Matte black'], ['chrome', 'Chrome'], ['orchid', 'Purple']];
  openSheet(`<h2>${editing ? 'Edit special day' : 'Add a special day'}</h2>
    <p class="lead">${esc(name('kc'))} gets +${XP.special} XP and a treat when she opens that day’s drop. She won’t know it’s coming.</p>
    <form id="df">
      <label class="field"><span>Date</span><input type="date" name="date" required value="${esc(d?.show_on || '')}" min="${TODAY}"></label>
      <label class="field"><span>What’s the day</span><input name="title" required maxlength="60" placeholder="Travel day" value="${esc(d?.title || '')}"></label>
      <label class="field"><span>Message for her (optional)</span><textarea name="body" maxlength="400" placeholder="Shows on her drop, above her nickname">${esc(d?.body || '')}</textarea></label>
      <div class="field"><span>Her treat</span><div class="seg" id="mode">
        <button type="button" data-m="list" aria-pressed="${mode === 'list'}">Surprise from the treat list</button>
        <button type="button" data-m="own" aria-pressed="${mode === 'own'}">Write my own</button></div></div>
      <div class="stack-y" id="own" ${mode === 'own' ? '' : 'hidden'}>
        <label class="field"><span>What it’s for</span><input name="vt" maxlength="40" placeholder="1 airport snack run" value="${esc(d?.voucher_title || '')}"></label>
        <label class="field"><span>Fine print</span><input name="vs" maxlength="70" placeholder="anything you want at the gate" value="${esc(d?.voucher_sub || '')}"></label>
        <div class="field"><span>Card</span><div class="seg" id="tier">${tiers.map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${tier === k}">${l}</button>`).join('')}</div></div>
      </div>
      ${d?.kind === 'unlock' ? '<p class="muted small" style="margin:0">This day also opens the Bangkok tab for her, so moving it moves that too.</p>' : ''}
      <button class="btn" type="submit">${editing ? 'Save' : 'Add special day'}</button>
      ${editing ? '<button class="btn danger" type="button" id="del">Delete</button>' : ''}
    </form>`, (b) => {
    const own = b.querySelector('#own');
    b.querySelector('#mode').onclick = (e) => { const m = e.target.closest('button')?.dataset.m; if (!m) return; mode = m; [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === m)); own.hidden = m !== 'own'; };
    b.querySelector('#tier').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (!t) return; tier = t; [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === t)); };
    b.querySelector('#df').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), day = f.get('date'), vt = f.get('vt').trim();
      if (day < TODAY) return toast('Pick today or a later date');
      if (S.drops.some((x) => x.show_on === day && x.id !== d?.id)) return toast(`${fmt(day, { month: 'short', day: 'numeric' })} is already a special day. Edit that one instead.`);
      if (mode === 'own' && !vt) return toast('Give her treat a name, or pick the treat list');
      const row = { show_on: day, title: f.get('title').trim(), body: f.get('body').trim() || null,
        voucher_title: mode === 'own' ? vt : null, voucher_sub: mode === 'own' ? (f.get('vs').trim() || null) : null, voucher_tier: mode === 'own' ? tier : null };
      try {
        if (editing) await S.be.updateDrop(d.id, row); else await S.be.addDrop({ ...row, kind: 'note' });
        S.drops = await S.be.drops(); closeSheet(); viewToday(); toast(editing ? 'Saved' : 'Special day added');
      } catch { toast('Didn’t save. Try again.'); }
    };
    const del = b.querySelector('#del');
    if (del) del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; }
      try { await S.be.deleteDrop(d.id); S.drops = await S.be.drops(); closeSheet(); viewToday(); toast('Deleted'); } catch { toast('Didn’t delete. Try again.'); }
    };
  });
}
function renderNavBadges() {
  const seen = Number(localStorage.getItem('ziggy-wallet-seen-' + S.me.who) || 0);
  $('.nav [data-tab="wallet"]')?.classList.toggle('new', S.tab !== 'wallet' && S.vouchers.some((v) => !v.redeemed_at && v.id > seen));
}

/* ================= wallet ================= */
function viewWallet() {
  const v = $('#view');
  const numbered = S.vouchers.slice().sort((a, b) => a.id - b.id).map((x, i) => ({ ...x, no: i + 1 }));
  const active = numbered.filter((x) => !x.redeemed_at);
  const coming = numbered.filter((x) => x.redeemed_at && !x.delivered_at).sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
  const used = numbered.filter((x) => x.redeemed_at && x.delivered_at).sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
  const maxId = Math.max(0, ...S.vouchers.map((x) => x.id));
  try { localStorage.setItem('ziggy-wallet-seen-' + S.me.who, String(maxId)); } catch {}
  const isKC = S.me.who === 'kc';
  const day = (iso) => fmt(iso.slice(0, 10), { month: 'short', day: 'numeric' });
  v.innerHTML = `
    <div class="section-head" style="margin-top:22px"><h2>${active.length} ${plural(active.length, 'voucher')} to use</h2>
      ${!isKC ? '<button class="btn line small" id="issue">Issue a voucher</button>' : ''}</div>
    ${isKC && active.length ? `<p class="wallet-note">These are yours. Tap one and use it whenever you like, no need to ask.</p>` : ''}
    ${active.length ? `<div class="cards" id="cards">${active.map((x) => `
      <div class="vwrap" data-id="${x.id}">
        <button class="vbtn" aria-expanded="false" style="all:unset;display:block;width:100%;cursor:pointer">${voucherCardHTML(x, x.no)}</button>
        <div class="v-actions">${isKC ? `<button class="btn" data-redeem="${x.id}">Use it</button>` : `<p class="muted small" style="margin:4px 0 0">Waiting for ${esc(name('kc'))} to use it.</p>`}</div>
      </div>`).join('')}</div>` : `<p class="empty">Nothing in the wallet right now. Keep opening your drops.</p>`}
    ${coming.length ? `<div class="section-head"><h2>On its way</h2></div><ul class="used coming" id="coming">${coming.map((x) => `<li><b>${esc(x.title)}</b><span>${isKC ? `used ${day(x.redeemed_at)}` : `<button class="btn line small" data-deliver="${x.id}">Delivered</button>`}</span></li>`).join('')}</ul>` : ''}
    ${used.length ? `<div class="section-head"><h2>Used</h2></div><ul class="used">${used.map((x) => `<li><b>${esc(x.title)}</b><span>${day(x.redeemed_at)}</span></li>`).join('')}</ul>` : ''}`;

  const cards = $('#cards');
  if (cards) {
    const last = cards.lastElementChild; last?.classList.add('open');
    cards.onclick = (e) => {
      const r = e.target.closest('[data-redeem]');
      if (r) return redeem(Number(r.dataset.redeem));
      const wrap = e.target.closest('.vbtn')?.parentElement;
      if (!wrap) return;
      thump(false);
      [...cards.children].forEach((w) => w.classList.toggle('open', w === wrap));
    };
  }
  $('#coming')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-deliver]'); if (!b) return;
    b.disabled = true;
    try { await S.be.deliverVoucher(Number(b.dataset.deliver)); S.vouchers = await S.be.vouchers(); thump(false); toast('Marked delivered'); viewWallet(); }
    catch { toast('Didn’t save. Try again.'); b.disabled = false; }
  });
  $('#issue')?.addEventListener('click', issueVoucher);
}
// Using a voucher is quiet: no message to send. baby Jaa gets a heads-up and it shows in her To deliver list.
function redeem(id) {
  const x = S.vouchers.find((v) => v.id === id);
  openSheet(`<h2>Use this one?</h2><p class="lead">${esc(name('jaa'))} gets a quiet heads-up and takes it from there. Nothing to send, nothing to ask.</p>
    <p class="quote">${esc(x.title)}${x.sub ? `, ${esc(x.sub)}` : ''}</p>
    <div class="row"><button class="btn" data-yes>Use it</button></div><div class="row"><button class="btn quiet" data-no>Not yet</button></div>`, (b) => {
    b.querySelector('[data-no]').onclick = closeSheet;
    b.querySelector('[data-yes]').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await S.be.redeemVoucher(id);
        thump(true);
        notifyJaa('baby KC used a voucher', `${x.title}${x.sub ? `, ${x.sub}` : ''}`);
        S.vouchers = await S.be.vouchers();
        closeSheet(); viewWallet(); toast('On its way');
      } catch (err) { toast('Didn’t go through. Try again.'); e.target.disabled = false; }
    };
  });
}
function issueVoucher() {
  let tier = 'black';
  openSheet(`<h2>Issue a voucher</h2><p class="lead">It goes straight into ${esc(name('kc'))}’s wallet.</p>
    <form id="vf">
      <label class="field"><span>What it’s for</span><input name="title" required maxlength="40" placeholder="1 matcha" autofocus></label>
      <label class="field"><span>Fine print</span><input name="sub" maxlength="70" placeholder="your milk, my treat"></label>
      <div class="field"><span>Card</span><div class="seg" id="tier">
        <button type="button" data-t="black" aria-pressed="true">Matte black</button>
        <button type="button" data-t="chrome" aria-pressed="false">Chrome</button>
        <button type="button" data-t="orchid" aria-pressed="false">Purple, for big ones</button>
      </div></div>
      <button class="btn" type="submit">Issue it</button>
    </form>`, (b) => {
    b.querySelector('#tier').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (!t) return; tier = t; [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === t)); };
    b.querySelector('#vf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await S.be.issueVoucher({ title: f.get('title').trim(), sub: f.get('sub').trim() || null, tier, issued_by: S.me.who }); S.vouchers = await S.be.vouchers(); closeSheet(); viewWallet(); toast('Issued'); }
      catch { toast('Didn’t save. Try again.'); }
    };
  });
}

/* ================= us: timeline ================= */
function viewUs() {
  const v = $('#view');
  const items = S.timeline.slice().sort((a, b) => a.happened_on.localeCompare(b.happened_on) || a.id - b.id);
  let html = '', year = null, nowPlaced = false;
  for (const m of items) {
    if (!nowPlaced && m.happened_on > TODAY) { html += `<p class="tl-now">today</p>`; nowPlaced = true; }
    const y = m.happened_on.slice(0, 4);
    if (y !== year) { html += `<div class="tl-year" aria-hidden="false">${y}</div>`; year = y; }
    const when = m.precision === 'month' ? fmt(m.happened_on, { month: 'short' }) : fmt(m.happened_on, { month: 'short', day: 'numeric' });
    html += `<button class="tl-item" data-id="${m.id}"><span class="when">${when}</span><span><h3>${esc(m.title)}</h3>${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.added_by && m.added_by !== 'jaa' ? `<div class="by">added by ${esc(name(m.added_by))}</div>` : ''}</span></button>`;
  }
  if (!nowPlaced && items.length) html += `<p class="tl-now">today</p>`;
  v.innerHTML = `
    ${S.settings.since ? `<p class="since">since ${fmt(S.settings.since, { month: 'long', day: 'numeric', year: 'numeric' })}</p>` : ''}
    <div class="section-head"><h2>Our timeline</h2><button class="btn line small" id="add-moment">Add a moment</button></div>
    <div class="tl" id="tl">${html || '<p class="empty">Nothing here yet. Add the first moment.</p>'}</div>`;
  $('#add-moment').onclick = () => momentForm();
  $('#tl').onclick = (e) => { const id = e.target.closest('.tl-item')?.dataset.id; if (id) momentForm(S.timeline.find((m) => m.id === Number(id))); };
}
function momentForm(m) {
  const editing = !!m;
  openSheet(`<h2>${editing ? 'Edit moment' : 'Add a moment'}</h2>
    <form id="mf">
      <label class="field"><span>When</span><input type="date" name="date" required value="${esc(m?.happened_on || TODAY)}"></label>
      <label class="check"><input type="checkbox" name="month" ${m?.precision === 'month' ? 'checked' : ''}> Only show the month</label>
      <label class="field"><span>What happened</span><input name="title" required maxlength="80" value="${esc(m?.title || '')}" ${editing ? '' : 'autofocus'}></label>
      <label class="field"><span>Details (optional)</span><textarea name="note" maxlength="400">${esc(m?.note || '')}</textarea></label>
      <button class="btn" type="submit">${editing ? 'Save' : 'Add to timeline'}</button>
      ${editing ? '<button class="btn danger" type="button" id="del">Delete</button>' : ''}
    </form>`, (b) => {
    b.querySelector('#mf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const row = { happened_on: f.get('date'), precision: f.get('month') ? 'month' : 'day', title: f.get('title').trim(), note: f.get('note').trim() || null };
      try {
        if (editing) await S.be.updateMoment(m.id, row); else await S.be.addMoment({ ...row, added_by: S.me.who });
        S.timeline = await S.be.timeline(); closeSheet(); viewUs(); toast(editing ? 'Saved' : 'Added to your timeline');
      } catch { toast('Didn’t save. Try again.'); }
    };
    const del = b.querySelector('#del');
    if (del) del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; }
      try { await S.be.deleteMoment(m.id); S.timeline = await S.be.timeline(); closeSheet(); viewUs(); toast('Deleted'); } catch { toast('Didn’t delete. Try again.'); }
    };
  });
}

/* ================= bangkok ================= */
let leafletReady;
function loadLeaflet() {
  return leafletReady ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
const statusText = (s) => s === 'both' ? 'we both want this' : s === 'veto' ? 'vetoed' : `${name(s)} wants this`;
const pinClass = (s) => s === 'both' ? '' : s === 'veto' ? 'veto' : 'one';

async function viewBangkok() {
  localStorage.setItem('ziggy-map-seen-' + S.me.who, '1');
  const v = $('#view');
  const cats = [...new Set(S.places.map((p) => p.category))].filter((c) => CATS[c]);
  if (S.catFilter !== 'all' && !cats.includes(S.catFilter)) S.catFilter = 'all';
  const shown = S.places.filter((p) => S.catFilter === 'all' || p.category === S.catFilter)
    .sort((a, b) => (a.status === 'veto') - (b.status === 'veto') || a.name.localeCompare(b.name));
  v.innerHTML = `
    <p class="since">Bangkok, someday. ${S.places.filter((p) => p.status !== 'veto').length} spots so far.</p>
    <div class="map-wrap"><div id="map" aria-label="Map of Bangkok"></div>
      <button class="btn map-add" id="add-spot">Add a spot</button></div>
    ${cats.length > 1 ? `<div class="chips" id="chips"><button class="chip" data-c="all" aria-pressed="${S.catFilter === 'all'}">All</button>${cats.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${S.catFilter === c}">${CATS[c]}</button>`).join('')}</div>` : ''}
    ${shown.length ? `<ul class="places" id="plist">${shown.map((p) => `<li><button data-id="${p.id}"><span class="pin ${pinClass(p.status)}"></span><span><span class="nm">${esc(p.name)}</span><span class="meta">${esc(CATS[p.category] || 'Spot')}${p.tiktok ? ', has a TikTok' : ''}</span></span><span class="st">${esc(statusText(p.status))}</span></button></li>`).join('')}</ul>`
      : `<p class="empty">No spots yet. Tap Add a spot and paste the first TikTok.</p>`}`;
  $('#add-spot').onclick = addSpot;
  $('#chips')?.addEventListener('click', (e) => { const c = e.target.closest('.chip')?.dataset.c; if (c) { S.catFilter = c; viewBangkok(); } });
  $('#plist')?.addEventListener('click', (e) => { const id = e.target.closest('button')?.dataset.id; if (id) placeSheet(S.places.find((p) => p.id === Number(id))); });

  try { await loadLeaflet(); } catch { $('#map').innerHTML = '<p class="empty" style="padding:20px">The map couldn’t load. Check your connection.</p>'; return; }
  if (!$('#map')) return;
  S.map?.remove();
  const L = window.L;
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([13.7466, 100.5393], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(map);
  const pts = [];
  for (const p of shown) {
    const icon = L.divIcon({ className: '', html: `<span class="pin ${pinClass(p.status)}" style="display:block"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map).on('click', () => placeSheet(p));
    pts.push([p.lat, p.lng]);
  }
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
  else if (pts.length === 1) map.setView(pts[0], 14);
  S.map = map;
}

function placeSheet(p) {
  const isKC = S.me.who === 'kc';
  const vetoVoucher = S.vouchers.find((v) => !v.redeemed_at && /veto/i.test(v.title) && /bangkok/i.test(v.title));
  const opts = [['both', 'We both want it'], ['kc', `${name('kc')} wants it`], ['jaa', `${name('jaa')} wants it`], ['veto', 'Veto']];
  openSheet(`<h2>${esc(p.name)}</h2>
    <p class="lead">${esc(CATS[p.category] || 'Spot')}. Added by ${esc(name(p.added_by))}.</p>
    ${p.note ? `<p class="quote">${esc(p.note)}</p>` : ''}
    <div class="stack-y">
      <div class="row">
        ${p.tiktok ? `<a class="btn" href="${esc(p.tiktok)}" target="_blank" rel="noopener">Watch the TikTok</a>` : ''}
        <a class="btn line" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Open in Maps</a>
      </div>
      <div class="field"><span>Who wants it</span><div class="seg" id="st">${opts.map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${p.status === k}">${esc(l)}</button>`).join('')}</div></div>
      <p class="muted small" style="margin:0">${isKC ? (vetoVoucher ? 'Veto uses your Bangkok veto voucher.' : 'Veto needs a Bangkok veto voucher. You don’t have one right now.') : `Only ${esc(name('kc'))} holds vetoes.`}</p>
      <div class="row"><button class="btn line" id="edit">Edit</button><button class="btn danger" id="del">Delete</button></div>
    </div>`, (b) => {
    b.querySelector('#st').onclick = async (e) => {
      const s = e.target.closest('button')?.dataset.s;
      if (!s || s === p.status) return;
      if (s === 'veto') {
        if (!isKC) return toast(`Only ${name('kc')} can veto`);
        if (!vetoVoucher) return toast('No Bangkok veto in your wallet');
        await S.be.redeemVoucher(vetoVoucher.id, true);
        S.vouchers = await S.be.vouchers();
        thump(true); toast('Vetoed. Voucher used.');
      }
      try { await S.be.updatePlace(p.id, { status: s }); S.places = await S.be.places(); closeSheet(); viewBangkok(); }
      catch { toast('Didn’t save. Try again.'); }
    };
    b.querySelector('#edit').onclick = () => placeForm(p);
    const del = b.querySelector('#del');
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; }
      try { await S.be.deletePlace(p.id); S.places = await S.be.places(); closeSheet(); viewBangkok(); toast('Removed'); } catch { toast('Didn’t delete. Try again.'); }
    };
  });
}

function addSpot() {
  openSheet(`<h2>Add a spot</h2><p class="lead">Search the name from the TikTok, then pick the right one.</p>
    <form id="sf" class="stack-y">
      <div class="row"><input class="field-input" name="q" required placeholder="e.g. Jodd Fairs" autofocus style="flex:1;background:var(--raise);border:1px solid var(--line);border-radius:12px;padding:13px 14px;font-size:16px"><button class="btn small" type="submit">Search</button></div>
    </form>
    <ul class="results" id="results"></ul>
    <div class="row"><button class="btn quiet" id="drop-pin">Can’t find it? Drop a pin on the map instead</button></div>`, (b) => {
    const results = b.querySelector('#results');
    b.querySelector('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const q = new FormData(e.target).get('q').trim();
      results.innerHTML = '<li class="muted small" style="padding:12px 0">Searching…</li>';
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&bounded=1&viewbox=100.25,14.10,100.95,13.45&q=${encodeURIComponent(q)}`;
        const data = await (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
        if (!data.length) { results.innerHTML = '<li class="muted small" style="padding:12px 0">No match in Bangkok. Try a shorter name, or drop a pin.</li>'; return; }
        results.innerHTML = data.map((r, i) => { const parts = r.display_name.split(', '); return `<li><button data-i="${i}">${esc(r.name || parts[0])}<small>${esc(parts.slice(1, 4).join(', '))}</small></button></li>`; }).join('');
        results.onclick = (ev) => { const i = ev.target.closest('button')?.dataset.i; if (i == null) return; const r = data[i]; placeForm({ name: r.name || r.display_name.split(', ')[0], lat: Number(r.lat), lng: Number(r.lon) }); };
      } catch { results.innerHTML = '<li class="muted small" style="padding:12px 0">Search isn’t working right now. Drop a pin instead.</li>'; }
    };
    b.querySelector('#drop-pin').onclick = () => {
      closeSheet();
      const wrap = $('.map-wrap'); if (!wrap || !S.map) return;
      const hint = document.createElement('div'); hint.className = 'map-hint';
      hint.innerHTML = '<span>Tap the map where it is</span><button class="btn quiet small" style="padding:4px">Cancel</button>';
      wrap.appendChild(hint); wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const done = () => { hint.remove(); S.map.off('click', onTap); };
      const onTap = (ev) => { done(); placeForm({ name: '', lat: ev.latlng.lat, lng: ev.latlng.lng }); };
      hint.querySelector('button').onclick = done;
      S.map.on('click', onTap);
    };
  });
}

function placeForm(p) {
  const editing = !!p.id;
  openSheet(`<h2>${editing ? 'Edit spot' : 'New spot'}</h2>
    <form id="pf">
      <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(p.name || '')}" ${p.name ? '' : 'autofocus'}></label>
      <label class="field"><span>Type</span><select name="category">${Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>TikTok link (optional)</span><input name="tiktok" type="url" inputmode="url" placeholder="Paste it here" value="${esc(p.tiktok || '')}"></label>
      <label class="field"><span>Note (optional)</span><textarea name="note" maxlength="300" placeholder="Why we want to go">${esc(p.note || '')}</textarea></label>
      <button class="btn" type="submit">${editing ? 'Save' : 'Pin it'}</button>
    </form>`, (b) => {
    b.querySelector('#pf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const row = { name: f.get('name').trim(), category: f.get('category'), tiktok: f.get('tiktok').trim() || null, note: f.get('note').trim() || null };
      try {
        if (editing) await S.be.updatePlace(p.id, row);
        else await S.be.addPlace({ ...row, lat: p.lat, lng: p.lng, status: S.me.who, added_by: S.me.who });
        S.places = await S.be.places(); closeSheet(); thump(false); viewBangkok(); toast(editing ? 'Saved' : 'Pinned');
      } catch { toast('Didn’t save. Try again.'); }
    };
  });
}

/* ================= settings ================= */
function openSettings() {
  openSheet(`<h2>Settings</h2><p class="lead">Signed in as ${esc(S.me.display)}.</p>
    <div class="stack-y">
      <button class="btn line" id="s-code">Change code</button>
      <button class="btn line" id="s-backup">Download a backup</button>
      ${S.be.demo ? `<button class="btn line" id="s-as">Demo: view as ${S.me.who === 'jaa' ? esc(name('kc')) : esc(name('jaa'))}</button>` : ''}
      <button class="btn danger" id="s-out">Sign out</button>
    </div>`, (b) => {
    b.querySelector('#s-code').onclick = () => { closeSheet(); renderSetPin(true); };
    b.querySelector('#s-backup').onclick = () => {
      const data = { exported: new Date().toISOString(), timeline: S.timeline, places: S.places, vouchers: S.vouchers, xp: S.xp };
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `ziggy-backup-${TODAY}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    b.querySelector('#s-as')?.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('as', S.me.who === 'jaa' ? 'kc' : 'jaa'); location.href = u; });
    const out = b.querySelector('#s-out');
    out.onclick = async () => {
      if (!out.dataset.sure) { out.dataset.sure = '1'; out.textContent = 'Tap again to sign out'; return; }
      localStorage.removeItem(pinKey()); closeSheet(); await S.be.signOut(); renderLogin();
    };
  });
}

boot();
