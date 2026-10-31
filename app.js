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

const S = { tab: 'today', unlocked: false, hiddenAt: 0, catFilter: 'all', countries: [] };

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
  if (S.asKC && Date.now() - (S.previewWrite || 0) < 4000) msg = 'Just looking: nothing was saved';
  const t = $('#toast'); t.textContent = msg; t.classList.add('toast-show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('toast-show'), 2400);
}
const scroller = () => document.getElementById('scroller');
function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab-zone"><div class="grab"></div></div><div class="sheet-scroll"><div class="sheet-body">${html}</div></div></div>`;
  $('.backdrop', root).onclick = closeSheet;
  scroller()?.classList.add('locked');
  const sheet = $('.sheet', root), body = $('.sheet-body', root);
  dragToClose(sheet);
  body.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320); });
  onMount?.(body);
  setTimeout(() => body.querySelector('[autofocus]')?.focus(), 250);
  return body;
}
function closeSheet() {
  const root = $('#sheet-root'), sheet = $('.sheet', root);
  if (!sheet) return;
  document.activeElement?.blur?.();
  sheet.classList.add('closing'); $('.backdrop', root)?.classList.add('closing');
  setTimeout(() => { if (root.contains(sheet)) { root.innerHTML = ''; scroller()?.classList.remove('locked'); } settlePage(); }, 260);
}
// Pull the sheet down from the top to close it, like a native sheet.
function dragToClose(sheet) {
  const sc = $('.sheet-scroll', sheet);
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => { y0 = (sc.scrollTop <= 0 || e.target.closest('.grab-zone')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { sheet.style.transform = ''; return; }
    e.preventDefault();
    sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (y0 === null) return;
    sheet.style.transition = ''; y0 = null;
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
  });
}
// Keep sheets sitting just above the keyboard instead of letting the page jump around.
function fitViewport() {
  const vv = window.visualViewport; if (!vv) return;
  const r = document.documentElement.style;
  r.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
  r.setProperty('--vvh', vv.height + 'px');
  if (vv.offsetTop > 0 && sheetOpen()) window.scrollTo(0, 0);
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
// iPhones can leave the whole page nudged up after the keyboard or a file picker closes, which shows as a gap under the tab bar.
function settlePage() { if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } }
document.addEventListener('focusout', () => setTimeout(settlePage, 120));
window.addEventListener('scroll', () => { if (!document.activeElement?.matches?.('input, textarea, select')) settlePage(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(settlePage, 60); });
window.visualViewport?.addEventListener('resize', () => setTimeout(settlePage, 150));
const sheetOpen = () => !!$('#sheet-root').firstChild;
// iPhone home-screen apps have a bug: right at launch, or after the keyboard closes, iOS can think the screen is
// shorter than it is, which leaves a black strip under the tab bar. Hiding the page for an instant and showing it
// again makes iOS measure the screen again. It only runs when the screen really is short, so normally nothing happens.
const STANDALONE = navigator.standalone === true; // only iPhones/iPads report this
let tallest = window.innerHeight;
window.addEventListener('resize', () => { if (!document.activeElement?.matches?.('input, textarea, select')) tallest = Math.max(tallest, window.innerHeight); });
const shortBy = () => tallest - window.innerHeight;
function healViewport() {
  if (!STANDALONE || document.hidden || document.activeElement?.matches?.('input, textarea, select') || shortBy() <= 4) return;
  const sc = scroller(); if (!sc) return;
  const st = sc.scrollTop;
  sc.style.display = 'none'; void sc.offsetHeight; sc.style.display = '';
  sc.scrollTop = st;
  setTimeout(() => {
    if (shortBy() > 4) { const b = document.body; b.style.display = 'none'; void b.offsetHeight; b.style.display = ''; sc.scrollTop = st; }
    S.map?.resize?.();
  }, 60);
}
const healSoon = () => { setTimeout(healViewport, 180); setTimeout(healViewport, 650); };
document.addEventListener('focusout', healSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) healSoon(); });
window.addEventListener('pageshow', healSoon);
window.visualViewport?.addEventListener('resize', () => { if (!document.activeElement?.matches?.('input, textarea, select')) setTimeout(healViewport, 200); });

/* ================= heads-up for baby Jaa ================= */
// Sends a notification to the ntfy app on baby Jaa's phone. The topic lives in Supabase settings, never on GitHub.
function notifyJaa(title, message) {
  const topic = S.settings?.notify_topic;
  if (!topic || S.me?.who !== 'kc' || S.asKC || PREVIEW || S.be?.demo) return;
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

const self = () => S.realMe || S.me;
const pinKey = () => 'ziggy-pin-' + self().user_id;
async function hashPin(pin) {
  const data = new TextEncoder().encode('ziggy:' + self().user_id + ':' + pin);
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
  const [settings, words, drops, opens, vouchers, timeline, places, xp, rewards, progress, countries] = await Promise.all([
    be.settings(), be.words(), be.drops(), be.opens(), be.vouchers(), be.timeline(), be.places(), soft(be.xp()), soft(be.rewards()), soft(be.bookProgress()), soft(be.countries()),
  ]);
  Object.assign(S, { settings, words, drops, opens, vouchers, timeline, places, xp, rewards, progress, countries });
}
async function unlock() {
  app.innerHTML = '<div class="loading"><img src="brand/tulip-chalk-transparent.png" alt="ziggy"></div>';
  try { await loadAll(); } catch (e) { return renderMessage('Couldn’t load', e.message); }
  S.unlocked = true;
  if (S.me.who === 'jaa' && !PREVIEW) { // XP left behind by places that were deleted before update 13
    const gone = S.xp.filter((x) => x.ref?.startsWith('place:') && !S.places.some((p) => x.ref === 'place:' + p.id)).map((x) => Number(x.ref.slice(6)));
    if (gone.length) dropPlaceXp(gone).catch(() => {});
  }
  if (params.get('view') === 'kc' && S.me.who === 'jaa' && !S.asKC) enterKC(false);
  renderApp();
  if (S.me.who === 'kc' && !S.asKC && !PREVIEW) grantLevels().then((u) => { if (u.length) setTimeout(() => rewardSheet(u), 3800); }).catch(() => {});
}
/* ================= baby KC's view, for baby Jaa ================= */
// Shows her exact screens with her real data. Read-only: nothing saves, nothing counts, nobody gets notified.
function readOnly(be) {
  return new Proxy(be, { get(t, k) {
    if (typeof k === 'string' && /^(add|update|delete|mark|redeem|deliver|issue)/.test(k)) return async () => { S.previewWrite = Date.now(); return []; };
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
}
function enterKC(render = true) {
  S.realMe = S.me; S.realBe = S.be;
  S.me = S.members.find((m) => m.who === 'kc'); S.partner = S.members.find((m) => m.who === 'jaa');
  S.be = readOnly(S.realBe); S.asKC = true; S.replay = false; S.openedLocal = null;
  if (S.tab === 'manage') S.tab = 'today';
  document.body.classList.add('as-kc');
  if (render) { renderApp(); scroller()?.scrollTo(0, 0); toast(`You’re seeing ziggy as ${name('kc')} sees it`); }
}
async function exitKC() {
  if (params.get('view') || params.get('date')) { location.href = location.pathname; return; }
  S.me = S.realMe; S.be = S.realBe; S.partner = S.members.find((m) => m !== S.me);
  S.realMe = null; S.asKC = false; S.replay = false; S.openedLocal = null;
  document.body.classList.remove('as-kc');
  try { await loadAll(); } catch {}
  renderApp(); scroller()?.scrollTo(0, 0); toast('Back to your view');
}
// Tapping her drum while looking: same animation and XP she would get, kept on screen only.
function simulateDrop(sp, before) {
  const amount = sp ? XP.special : XP.daily;
  S.xp = [...S.xp, { id: -Date.now(), who: 'kc', amount, reason: 'preview', ref: 'preview:' + Date.now() }];
  const unlocked = [], L = Math.floor(xpTotal() / XP.perReward);
  const prizes = S.rewards.filter((r) => r.kind === 'level').sort((a, b) => a.sort - b.sort);
  if (L > Math.floor(before / XP.perReward) && prizes.length) unlocked.push({ ...prizes[(L - 1) % prizes.length], xp: L * XP.perReward });
  return { gained: amount, unlocked };
}
function kcViewSheet() {
  openSheet(`<h2>${esc(name('kc'))}’s view</h2>
    <p class="lead">This is exactly what she sees, with her real XP, wallet and drop. Nothing you tap here saves or counts for her, and you won’t get notifications.</p>
    <div class="stack-y">
      <button class="btn line" id="kv-replay" type="button">Replay today’s drop</button>
      <div class="field"><span>See another day</span><div class="row"><input type="date" id="kv-date" value="${esc(PREVIEW || TODAY)}" style="flex:1"><button class="btn line small" id="kv-go" type="button">Go</button></div></div>
      <p class="muted small" style="margin:0">Hidden from her: To deliver, Coming up, Special days, Issue a voucher, Manage ziggy, and the Travel tab until it opens for her.</p>
      <button class="btn" id="kv-exit" type="button">Back to my view</button>
    </div>`, (b) => {
    b.querySelector('#kv-replay').onclick = () => { S.replay = true; S.openedLocal = null; S.tab = 'today'; closeSheet(); renderApp(); scroller()?.scrollTo(0, 0); };
    b.querySelector('#kv-go').onclick = () => { const d = b.querySelector('#kv-date').value; if (d) location.href = `${location.pathname}?view=kc&date=${d}`; };
    b.querySelector('#kv-exit').onclick = () => { closeSheet(); exitKC(); };
  });
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
  if (S.tab === 'travel' && !mapOpen()) S.tab = 'today';
  if (S.tab === 'manage' && S.me.who !== 'jaa') S.tab = 'today';
  const seenWallet = Number(localStorage.getItem('ziggy-wallet-seen-' + S.me.who) || 0);
  const walletNew = S.vouchers.some((v) => !v.redeemed_at && v.id > seenWallet);
  const mapNew = !localStorage.getItem('ziggy-map-seen-' + S.me.who);
  const tabs = [['today', 'Today'], ['wallet', 'Wallet', walletNew], ['us', 'Us'], ...(mapOpen() ? [['travel', 'Travel', mapNew]] : [])];
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
  ${S.asKC ? `<button class="kc-pill" id="kc-pill" type="button">Viewing as ${esc(name('kc'))}<span>Options</span></button>` : ''}
  <nav class="nav" aria-label="Sections">
    ${tabs.map(([k, l, isNew]) => `<button data-tab="${k}" class="${isNew && S.tab !== k ? 'new' : ''}" ${S.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}
  </nav>`;
  $('.nav').onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (t === 'travel' && S.tab === 'travel' && S.trip) { S.trip = null; S.here = null; thump(false); viewTravel(); scroller()?.scrollTo(0, 0); return; } if (t && t !== S.tab) { S.tab = t; thump(false); renderApp(); scroller()?.scrollTo(0, 0); } };
  $('#settings').onclick = openSettings;
  $('#kc-pill')?.addEventListener('click', kcViewSheet);
  bindCounter();
  ({ today: viewToday, wallet: viewWallet, us: viewUs, travel: viewTravel, manage: viewManage })[S.tab]();
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
  const label = sp.monthsary && !p ? 'A special day' : sp.monthsary ? `A special drop, on our ${milestoneName(sp.monthsary)}` : 'A special drop';
  const title = p ? p.title : `Happy ${milestoneName(sp.monthsary)}`;
  const body = p ? p.body : sp.monthsary % 12 === 0
    ? `${sp.monthsary / 12} ${plural(sp.monthsary / 12, 'year')} since we made it official. JK forever and ever.`
    : `${sp.monthsary} months since we made it official. Still choosing you, every single day.`;
  const also = '';
  const treat = treatFor(sp);
  return `<div class="drop special"><p class="kind">${label}</p><h3>${esc(title)}</h3>${body ? `<p class="body">${esc(body)}</p>` : ''}${also}
    <div class="nick-block">${nick}</div>
    ${treat ? `<p class="treat-label">${S.me.who === 'kc' ? 'Today’s treat, now in your wallet' : `Today’s treat for ${esc(name('kc'))}`}</p><div class="mini-v ${['chrome', 'orchid'].includes(treat.tier) ? treat.tier : ''}"><b>${esc(treat.title)}</b>${treat.sub ? `<span>${esc(treat.sub)}</span>` : ''}</div>` : ''}</div>`;
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
function xpHTML(shown) {
  const total = shown ?? xpTotal(), into = total % XP.perReward;
  return `<div class="section-head xp-head-tight"><h2>${S.me.who === 'kc' ? 'Your XP' : `${esc(name('kc'))}’s XP`}</h2></div>
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
      const right = x < track.offsetWidth * 0.6;
      pop.style.setProperty('--x', (right ? x + 40 : x - 40) + 'px'); pop.classList.add(right ? 'to-right' : 'to-left'); track.appendChild(pop); setTimeout(() => pop.remove(), 2300);
      $('#xp-mood').textContent = moodFor(toInto); $('#xp-left').innerHTML = leftText(toInto);
    }, 900);
  }, 700);
  if (S.me.who === 'kc' && !S.asKC) try { localStorage.setItem('ziggy-xp-seen', String(to)); } catch {}
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
  const opened = !(S.asKC && S.replay) && (S.opens.some((o) => o.drop_day === TODAY && o.who === S.me.who) || S.openedLocal === TODAY);
  const upcoming = S.me.who === 'jaa' ? Array.from({ length: 7 }, (_, i) => addDays(TODAY, i + 1)).map((day) => [day, specialFor(day)]) : [];
  const isKC = S.me.who === 'kc', total = xpTotal();
  let seen = NaN; try { seen = Number(localStorage.getItem('ziggy-xp-seen') ?? NaN); } catch {}
  const catchUp = isKC && !S.asKC && !PREVIEW && Number.isFinite(seen) && total > seen && !S.animating;
  v.innerHTML = `
    <p class="today-date">${fmt(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="stage" id="stage">${opened ? dropCardHTML(sp) : drumHTML(sp)}</div>
    ${toDeliverHTML()}
    ${xpHTML(catchUp ? seen : undefined)}
    ${upcoming.length ? `<details class="peek"><summary>Coming up (only you see this)</summary><ol>
      ${upcoming.map(([day, s]) => `<li><span>${fmt(day, { month: 'short', day: 'numeric' })}</span><span>${s ? `<b>${esc(s.pinned ? s.pinned.title : `Happy ${milestoneName(s.monthsary)}`)}</b>, +${XP.special} XP and a treat` : esc(nickname(day))}</span></li>`).join('')}
    </ol></details>` : ''}
    ${specialDaysHTML()}`;

  if (catchUp) {
    S.animating = true;
    let told = 0; try { told = Number(localStorage.getItem('ziggy-bonus-seen') || 0); } catch {}
    const bonus = S.xp.filter((x) => x.ref.startsWith('bonus:') && x.id > told).pop();
    if (bonus) try { localStorage.setItem('ziggy-bonus-seen', String(bonus.id)); } catch {}
    setTimeout(() => { animateGain(seen, total); S.animating = false; if (bonus) setTimeout(() => toast(`From ${name('jaa')}: ${bonus.reason.replace(/^bonus: ?/, '') || 'bonus XP'}`), 1800); }, 500);
  } else if (isKC && !S.asKC && !PREVIEW) { try { localStorage.setItem('ziggy-xp-seen', String(total)); } catch {} }

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
    S.replay = false;
    if (S.asKC) ({ gained, unlocked } = simulateDrop(sp, before));
    else if (!PREVIEW) {
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
  const unlocked = await grantLevels();
  S.vouchers = await be.vouchers();
  return { gained, unlocked };
}
// Hands out any 100 XP rewards she has reached but not received yet. Safe to call any time.
async function grantLevels() {
  const be = S.be, unlocked = [];
  const level = Math.floor(xpTotal() / XP.perReward);
  const prizes = S.rewards.filter((r) => r.kind === 'level').sort((a, b) => a.sort - b.sort);
  if (prizes.length && level > 0) {
    const have = new Set(S.vouchers.map((v) => v.source));
    for (let L = 1; L <= level; L++) {
      if (have.has('level:' + L)) continue;
      const r = prizes[(L - 1) % prizes.length];
      const made = await be.addVoucher({ title: r.title, sub: r.sub, tier: r.tier, issued_by: 'jaa', source: 'level:' + L });
      if (made.length) { unlocked.push({ ...r, xp: L * XP.perReward }); notifyJaa('baby KC unlocked a reward', `${L * XP.perReward} XP: ${r.title}`); }
    }
    if (unlocked.length) S.vouchers = await be.vouchers();
  }
  return unlocked;
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
    ${ahead.length ? `<ul class="days" id="days">${ahead.map((d) => `<li><button type="button" data-day="${d.id}"><time>${when(d.show_on)}</time><span><b>${esc(d.title)}</b><small>${d.voucher_title ? esc(d.voucher_title) : 'a surprise from the treat list'}${d.kind === 'unlock' ? ', opens Travel for her' : ''}</small></span></button></li>`).join('')}</ul>`
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
      ${d?.kind === 'unlock' ? '<p class="muted small" style="margin:0">This day also opens the Travel tab for her, so moving it moves that too.</p>' : ''}
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
function closedYears() { try { return new Set(JSON.parse(localStorage.getItem('ziggy-tl-closed') || '[]')); } catch { return new Set(); } }
function viewUs() {
  const v = $('#view');
  const items = S.timeline.slice().sort((a, b) => a.happened_on.localeCompare(b.happened_on) || a.id - b.id);
  const groups = [];
  for (const m of items) { const y = m.happened_on.slice(0, 4); if (groups.at(-1)?.y !== y) groups.push({ y, items: [] }); groups.at(-1).items.push(m); }
  const closed = closedYears();
  let nowPlaced = false;
  const now = '<p class="tl-now">today</p>';
  const item = (m) => {
    const when = m.precision === 'month' ? fmt(m.happened_on, { month: 'short' }) : fmt(m.happened_on, { month: 'short', day: 'numeric' });
    if (m.book_part) return bookItemHTML(m, when);
    return `<button class="tl-item" type="button" data-id="${m.id}"><span class="when">${when}</span><span><h3>${esc(m.title)}</h3>${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.added_by && m.added_by !== 'jaa' ? `<div class="by">added by ${esc(name(m.added_by))}</div>` : ''}</span></button>`;
  };
  const html = groups.map((g, gi) => {
    let inner = '';
    for (const m of g.items) { if (!nowPlaced && m.happened_on > TODAY) { inner += now; nowPlaced = true; } inner += item(m); }
    if (!nowPlaced && gi === groups.length - 1) { inner += now; nowPlaced = true; }
    const shut = closed.has(g.y);
    return `<section class="tl-group${shut ? ' closed' : ''}" data-year="${g.y}">
      <button class="tl-year" type="button" aria-expanded="${!shut}"><span>${g.y}</span><small>${g.items.length} ${plural(g.items.length, 'moment')}</small><i class="chev" aria-hidden="true"></i></button>
      <div class="tl-items"><div>${inner}</div></div>
    </section>`;
  }).join('');
  v.innerHTML = `
    <div class="section-head us-head"><h2>Our timeline</h2><button class="btn line small" id="add-moment">Add a moment</button></div>
    <div class="tl" id="tl">${html || '<p class="empty">Nothing here yet. Add the first moment.</p>'}</div>`;
  $('#add-moment').onclick = () => momentForm();
  $('#tl').onclick = (e) => {
    const yr = e.target.closest('.tl-year');
    if (yr) {
      const g = yr.parentElement, y = g.dataset.year, set = closedYears();
      const shut = !g.classList.contains('closed');
      g.classList.toggle('closed', shut); yr.setAttribute('aria-expanded', String(!shut));
      shut ? set.add(y) : set.delete(y);
      try { localStorage.setItem('ziggy-tl-closed', JSON.stringify([...set])); } catch {}
      thump(false); return;
    }
    const rd = e.target.closest('[data-read]');
    if (rd) return openBook(Number(rd.dataset.read));
    const id = e.target.closest('.tl-item')?.dataset.id; if (id) momentForm(S.timeline.find((m) => m.id === Number(id)));
  };
}
/* ================= the poetry book ================= */
const toRoman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
function bookParts() { try { return JSON.parse(S.settings.book_map || 'null'); } catch { return null; } }
function poemsRead() { return new Set(S.xp.filter((x) => x.who === 'kc' && x.ref.startsWith('poem:')).map((x) => Number(x.ref.slice(5)))); }
function bookItemHTML(m, when) {
  const pages = bookParts()?.[m.book_part] || [];
  const poems = pages.filter(([, k]) => k === 'p'), read = poemsRead();
  const done = poems.filter(([n]) => read.has(n)).length, total = poems.length;
  const mine = S.me.who === 'kc';
  const started = S.progress.some((r) => r.who === S.me.who && r.part === m.book_part);
  const label = !total ? 'Read' : done >= total ? 'Read again' : (done || started) ? 'Continue' : 'Read';
  const line = total ? `${mine ? '' : `${esc(name('kc'))} has read `}${done} of ${total} ${mine ? 'read' : ''}`.trim() : '';
  return `<div class="tl-item book" role="button" tabindex="0" data-id="${m.id}"><span class="when">${when}</span><span>
    <h3>${esc(m.title)}</h3>${m.note ? `<p>${esc(m.note)}</p>` : ''}
    <div class="book-row">${total ? `<div class="book-bar" aria-hidden="true"><i style="width:${total ? done / total * 100 : 0}%"></i></div><small>${line}</small>` : '<small>Poems</small>'}
      <button class="btn line small" type="button" data-read="${m.book_part}">${label}</button></div>
  </span></div>`;
}
async function openBook(part) {
  const pages = bookParts()?.[part];
  if (!pages?.length || !S.settings.book_version) return toast(S.me.who === 'jaa' && !S.asKC ? 'Upload the book in Manage ziggy first' : 'This part isn’t ready yet');
  const wait = document.createElement('div'); wait.className = 'book-wait'; wait.innerHTML = '<img src="brand/tulip-chalk-transparent.png" alt=""><span>Opening</span>';
  document.body.appendChild(wait);
  let mod;
  try { mod = await import('./book.js'); await mod.loadBook(() => S.be.bookDownload(), S.settings.book_version); }
  catch { wait.remove(); return toast('The book didn’t open. Check your connection and try again.'); }
  wait.remove();
  const read = poemsRead(), isKC = S.me.who === 'kc' && !S.asKC;
  const saved = S.progress.find((r) => r.who === S.me.who && r.part === part)?.page;
  let gained = 0, saveT = null;
  scroller()?.classList.add('locked');
  mod.openReader({
    pages, partLabel: `Part ${toRoman(part)}`,
    startIndex: Math.max(0, pages.findIndex(([n]) => n === saved)),
    isRead: (n) => read.has(n),
    onRead: async (n) => {
      if (!isKC) return null;
      try {
        const rows = await S.be.addXp({ who: 'kc', amount: 1, reason: 'read a poem', ref: 'poem:' + n });
        read.add(n);
        if (rows.length) { gained += 1; S.xp = [...S.xp, ...rows]; navigator.vibrate?.(12); return 1; }
        return 0;
      } catch { return null; }
    },
    onPage: (n) => {
      const row = { who: S.me.who, part, page: n, updated_at: new Date().toISOString() };
      S.progress = [...S.progress.filter((r) => !(r.who === row.who && r.part === part)), row];
      clearTimeout(saveT); saveT = setTimeout(() => S.be.markProgress(row).catch(() => {}), 900);
    },
    onClose: async () => {
      scroller()?.classList.remove('locked');
      if (S.tab === 'us') viewUs();
      if (gained && isKC) {
        toast(`+${gained} XP for reading`);
        const u = await grantLevels().catch(() => []);
        if (u.length) setTimeout(() => rewardSheet(u), 900);
      }
    },
  });
}
function momentForm(m) {
  const editing = !!m;
  openSheet(`<h2>${editing ? 'Edit moment' : 'Add a moment'}</h2>
    <form id="mf">
      <label class="field"><span>When</span><input type="date" name="date" required value="${esc(m?.happened_on || TODAY)}"></label>
      <label class="check"><input type="checkbox" name="month" ${m?.precision === 'month' ? 'checked' : ''}> Only show the month</label>
      <label class="field"><span>What happened</span><input name="title" required maxlength="80" value="${esc(m?.title || '')}" ${editing ? '' : 'autofocus'}></label>
      <label class="field"><span>Details (optional)</span><textarea name="note" maxlength="400">${esc(m?.note || '')}</textarea></label>
      ${S.me.who === 'jaa' && bookParts() ? `<label class="field"><span>Opens the poetry book</span><select name="book"><option value="">No</option>${Object.keys(bookParts()).map((k) => `<option value="${k}" ${Number(m?.book_part) === Number(k) ? 'selected' : ''}>Part ${toRoman(Number(k))}</option>`).join('')}</select></label>` : ''}
      <button class="btn" type="submit">${editing ? 'Save' : 'Add to timeline'}</button>
      ${editing ? '<button class="btn danger" type="button" id="del">Delete</button>' : ''}
    </form>`, (b) => {
    b.querySelector('#mf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const row = { happened_on: f.get('date'), precision: f.get('month') ? 'month' : 'day', title: f.get('title').trim(), note: f.get('note').trim() || null };
      if (f.has('book')) row.book_part = f.get('book') ? Number(f.get('book')) : null;
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

/* ================= travel ================= */
// Choose a map (one per country), then pin places, stamp the ones you've been to (+2 XP for baby KC each).
const TRAVEL_XP = 2;
const QUICK = ['jp', 'kr', 'tw', 'hk', 'sg', 'vn', 'id', 'ph'];
let leafletReady, atlasReady;
function loadLeaflet() {
  return leafletReady ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = res; s.onerror = () => { leafletReady = null; rej(); }; document.head.appendChild(s);
  });
}
// Country outlines + map boxes live in countries.js (bundled, works offline).
const loadAtlas = () => atlasReady ||= import('./countries.js').then((m) => new Map(m.COUNTRIES.map(([code, nm, d, box, al]) => [code.toLowerCase(), { code: code.toLowerCase(), name: nm, d, box, al }])));
const placeCountry = (p) => (p.country || 'th').toLowerCase();
const been = (p) => !!p.visited_at;
const statusText = (s) => s === 'both' ? 'we both want this' : s === 'veto' ? 'vetoed' : `${name(s)} wants this`;
const pinClass = (p) => been(p) ? 'been' : p.status === 'both' ? '' : p.status === 'veto' ? 'veto' : 'one';

function trips() {
  const list = [...(S.countries || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
  const have = new Set(list.map((c) => c.code));
  for (const p of S.places) { const c = placeCountry(p); if (!have.has(c)) { have.add(c); list.push({ id: -have.size, code: c, name: c === 'th' ? 'Thailand' : c.toUpperCase() }); } }
  return list;
}
const tripPlaces = (code) => S.places.filter((p) => placeCountry(p) === code);
const tripCount = (code) => { const ps = tripPlaces(code).filter((p) => p.status !== 'veto'); return { all: ps.length, been: ps.filter(been).length }; };

// The hologram: the country's outline floating between two silver discs.
// The discs stay put; only the hologram slides when you swipe.
const HOLO_AT = 'translate(78 84) scale(1.44)'; // keeps the outline clear of both discs
function holoSVG(uid, d) {
  const u = 'h' + uid;
  return `<svg viewBox="0 0 300 330" aria-hidden="true">
    <defs><clipPath id="${u}c"><path d="${d}" transform="${HOLO_AT}"/></clipPath></defs>
    <g class="holo">
      <path d="${d}" transform="${HOLO_AT}" fill="#a98ff0" opacity=".55" filter="url(#tv-glow)"/>
      <path class="holo-fill" d="${d}" transform="${HOLO_AT}" fill="url(#tv-fill)" fill-rule="evenodd"/>
      <g clip-path="url(#${u}c)"><rect class="scan" x="60" y="56" width="180" height="180" fill="url(#tv-scan)"/></g>
      <path class="holo-line" d="${d}" transform="${HOLO_AT}" fill="none" stroke="#f4f0ff" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round" opacity=".9"/>
    </g>
  </svg>`;
}
const PEDESTAL = `<svg class="cs-base" viewBox="0 0 300 330" aria-hidden="true">
    <path class="beam" d="M84 282 L101 46 L199 46 L216 282 Z" fill="url(#tv-beam)"/>
    <path d="M101 46 L84 282 M199 46 L216 282" stroke="rgba(207,194,255,.14)" stroke-width="1"/>
    <g class="disc-top">
      <path d="M74 42 v8 a76 14 0 0 0 152 0 v-8" fill="url(#tv-edge)"/>
      <ellipse cx="150" cy="42" rx="76" ry="14" fill="url(#tv-lid)"/>
      <ellipse class="emit-top" cx="150" cy="58" rx="48" ry="5" fill="#cbbcff" opacity=".55" filter="url(#tv-blur)"/>
    </g>
    <path d="M40 278 v14 a110 26 0 0 0 220 0 v-14" fill="url(#tv-baseedge)"/>
    <ellipse cx="150" cy="278" rx="110" ry="26" fill="url(#tv-base)"/>
    <ellipse class="emit" id="cs-emit" cx="150" cy="276" rx="74" ry="15" fill="url(#tv-emit)"/>
    <ellipse cx="150" cy="278" rx="94" ry="20.5" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.2" stroke-dasharray="1 4"/>
    <ellipse cx="150" cy="278" rx="102" ry="23.5" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2.4"/>
    <ellipse class="prog" id="cs-prog" cx="150" cy="278" rx="102" ry="23.5" fill="none" stroke="#a98ff0" stroke-width="2.4" pathLength="100" stroke-dasharray="0 100" stroke-linecap="round"/>
  </svg>`;
const HOLO_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="tv-lid" cx="42%" cy="30%" r="80%"><stop offset="0" stop-color="#fbfbfa"/><stop offset=".45" stop-color="#a6a6a4"/><stop offset="1" stop-color="#262626"/></radialGradient>
  <linearGradient id="tv-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9a98"/><stop offset="1" stop-color="#1a1a1a"/></linearGradient>
  <radialGradient id="tv-base" cx="50%" cy="28%" r="75%"><stop offset="0" stop-color="#f4f4f2"/><stop offset=".55" stop-color="#9a9a98"/><stop offset="1" stop-color="#3c3c3c"/></radialGradient>
  <linearGradient id="tv-baseedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4c4c2"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
  <radialGradient id="tv-emit" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e6dcff" stop-opacity=".95"/><stop offset=".45" stop-color="#a98ff0" stop-opacity=".55"/><stop offset="1" stop-color="#a98ff0" stop-opacity="0"/></radialGradient>
  <linearGradient id="tv-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#a98ff0" stop-opacity=".30"/><stop offset=".5" stop-color="#a98ff0" stop-opacity=".05"/><stop offset="1" stop-color="#cfc2ff" stop-opacity=".14"/></linearGradient>
  <linearGradient id="tv-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3eeff" stop-opacity=".62"/><stop offset=".5" stop-color="#a98ff0" stop-opacity=".26"/><stop offset="1" stop-color="#dff3ff" stop-opacity=".5"/></linearGradient>
  <pattern id="tv-scan" width="6" height="3.4" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="#fff" fill-opacity=".26"/></pattern>
  <filter id="tv-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="tv-blur" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
</defs></svg>`;
const NEW_D = 'M50 20 V80 M20 50 H80';

async function viewTravel() {
  localStorage.setItem('ziggy-map-seen-' + S.me.who, '1');
  if (S.trip && !trips().some((t) => t.code === S.trip)) S.trip = null;
  return S.trip ? viewTrip() : viewMaps();
}

async function viewMaps() {
  const v = $('#view');
  S.map?.remove(); S.map = null;
  const atlas = await loadAtlas();
  if (S.tab !== 'travel' || S.trip) return;
  const list = trips();
  const slides = [...list.map((t, i) => {
    const a = atlas.get(t.code), c = tripCount(t.code);
    return { code: t.code, d: a?.d || 'M50 44a6 6 0 1 0 .1 0Z', no: `Map ${pad(i + 1)}`, tag: c.been ? `${c.been} stamped` : t.code.toUpperCase(),
      name: t.name || a?.name, sub: c.all ? `${c.all} ${plural(c.all, 'place')}${c.been ? `, ${c.been} been` : ''}` : 'No places yet', pct: c.all ? Math.round(c.been / c.all * 100) : 0 };
  }), { code: '', d: NEW_D, no: `Map ${pad(list.length + 1)}`, tag: 'New', name: 'Add a country', sub: 'Somewhere we want to go', pct: 0, isNew: true }];
  v.innerHTML = `${HOLO_DEFS}
    <p class="since">Where to next?</p>
    <p class="maps-hint">Choose a map</p>
    <div class="console" id="console">
      <div class="cs-top"><span id="cs-no"></span><span id="cs-tag"></span></div>
      <div class="cs-stage">${PEDESTAL}
        <div class="cs-rail" id="rail" role="listbox" aria-label="Maps">
          ${slides.map((s, i) => `<div class="cs-slide ${s.isNew ? 'new' : ''}" role="option" aria-label="${esc(s.name)}" data-i="${i}">${holoSVG(s.code || 'new', s.d)}</div>`).join('')}
        </div>
      </div>
      <div class="cs-text"><span class="mc-name" id="cs-name"></span><span class="mc-sub" id="cs-sub"></span></div>
    </div>
    <div class="map-dots" id="map-dots">${slides.map(() => '<i></i>').join('')}</div>
    <p class="maps-foot">Swipe the map to switch, tap to open</p>`;
  const rail = $('#rail'), cards = [...rail.children], dots = [...$('#map-dots').children];
  const show = (s, first) => {
    $('#cs-no').textContent = s.no; $('#cs-tag').textContent = s.tag;
    $('#cs-name').textContent = s.name; $('#cs-sub').textContent = s.sub;
    $('#cs-prog').setAttribute('stroke-dasharray', `${s.pct} 100`);
    $('#console').classList.toggle('is-new', !!s.isNew);
    if (first) return;
    const txt = $('.cs-text'); txt.classList.remove('swap'); void txt.offsetWidth; txt.classList.add('swap');
    const em = $('#cs-emit'); em.classList.remove('flash'); void em.getBoundingClientRect(); em.classList.add('flash');
  };
  let raf = 0, cur = -1;
  const paint = (first) => {
    raf = 0;
    const w = rail.clientWidth || 1, x = rail.scrollLeft / w;
    cards.forEach((c, i) => { const o = i - x; c.style.setProperty('--o', Math.max(-1.5, Math.min(1.5, o)).toFixed(3)); c.style.setProperty('--a', Math.min(1, Math.abs(o)).toFixed(3)); });
    const best = Math.max(0, Math.min(cards.length - 1, Math.round(x)));
    if (best !== cur) {
      cur = best; S.mapIndex = best;
      cards.forEach((c, i) => c.classList.toggle('on', i === best)); dots.forEach((d, i) => d.classList.toggle('on', i === best));
      show(slides[best], first === true); if (first !== true) navigator.vibrate?.(6);
    }
  };
  rail.addEventListener('scroll', () => { raf ||= requestAnimationFrame(paint); }, { passive: true });
  const start = Math.max(0, Math.min(S.mapIndex ?? 0, cards.length - 1));
  rail.scrollLeft = start * rail.clientWidth;
  paint(true);
  dots.forEach((d, i) => d.addEventListener('click', () => rail.scrollTo({ left: i * rail.clientWidth, behavior: 'smooth' })));
  $('#console').addEventListener('click', () => {
    const s = slides[cur]; if (!s) return;
    if (s.isNew) return addCountry();
    thump(false); $('#console').classList.add('go');
    setTimeout(() => { S.trip = s.code; viewTravel(); scroller()?.scrollTo(0, 0); }, 380);
  });
}

function addCountry() {
  loadAtlas().then((atlas) => {
    const have = new Set(trips().map((t) => t.code));
    const all = [...atlas.values()];
    const row = (c) => `<li><button data-c="${c.code}" ${have.has(c.code) ? 'disabled' : ''}><svg viewBox="0 0 100 100" aria-hidden="true"><path d="${c.d}"/></svg><span>${esc(c.name)}</span>${have.has(c.code) ? '<small>already a map</small>' : ''}</button></li>`;
    openSheet(`<h2>Add a country</h2><p class="lead">It becomes a new map you can swipe to.</p>
      <input class="search" id="cq" placeholder="Search a country or city" autocomplete="off" autocapitalize="words">
      <ul class="countries" id="cl">${QUICK.map((k) => atlas.get(k)).filter(Boolean).map(row).join('')}</ul>`, (b) => {
      const cl = b.querySelector('#cl'), q = b.querySelector('#cq');
      q.oninput = () => {
        const s = q.value.trim().toLowerCase();
        const hits = !s ? QUICK.map((k) => atlas.get(k)).filter(Boolean)
          : all.filter((c) => c.name.toLowerCase().includes(s) || c.al.split(' ').some((w) => w.startsWith(s)) || (s.length > 3 && c.al.includes(s)) || c.code === s)
            .sort((a, z) => a.name.toLowerCase().startsWith(s) ? -1 : z.name.toLowerCase().startsWith(s) ? 1 : 0).slice(0, 30);
        cl.innerHTML = hits.length ? hits.map(row).join('') : '<li class="muted small" style="padding:14px 0">No country by that name. Try another spelling.</li>';
      };
      cl.onclick = async (e) => {
        const btn = e.target.closest('button[data-c]'); if (!btn || btn.disabled) return;
        btn.disabled = true;
        const c = atlas.get(btn.dataset.c);
        try {
          await S.be.addCountry({ code: c.code, name: c.name, sort: trips().length, added_by: S.me.who });
          S.countries = await S.be.countries();
          S.mapIndex = trips().findIndex((t) => t.code === c.code);
          closeSheet(); thump(true); viewTravel(); toast(`New map: ${c.name}`);
        } catch { btn.disabled = false; toast('Didn’t save. Try again.'); }
      };
    });
  });
}

function tripMore(t, ps) {
  const isReal = t.id > 0;
  openSheet(`<h2>${esc(t.name)}</h2>
    <p class="lead">${ps.length ? `${ps.length} ${plural(ps.length, 'place')} on this map.` : 'No places on this map yet.'}</p>
    <div class="stack-y">
      ${isReal ? `<button class="btn danger" id="rm">Remove this map</button>
      <p class="muted small" style="margin:0">${ps.length ? 'This also deletes its places, and XP from ones you stamped goes back.' : 'You can add it back any time.'}</p>` : '<p class="muted small" style="margin:0">This map is here because it has places. It goes away when they do.</p>'}
    </div>`, (b) => {
    const rm = b.querySelector('#rm'); if (!rm) return;
    rm.onclick = async () => {
      if (!rm.dataset.sure) { rm.dataset.sure = '1'; rm.textContent = ps.length ? `Tap again: delete map and ${ps.length} ${plural(ps.length, 'place')}` : 'Tap again to remove'; return; }
      try {
        for (const p of ps) await S.be.deletePlace(p.id);
        await dropPlaceXp(ps.map((p) => p.id));
        await S.be.deleteCountry(t.id);
        [S.countries, S.places] = await Promise.all([S.be.countries(), S.be.places()]);
        S.trip = null; S.mapIndex = 0; closeSheet(); viewTravel(); toast('Map removed');
      } catch { toast('Didn’t remove. Try again.'); }
    };
  });
}

const ICON_LOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9"/></svg>';
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const far = (d) => d < 1 ? `${Math.round(d * 1000 / 50) * 50 || 50} m away` : d < 20 ? `${d.toFixed(1)} km away` : `${Math.round(d)} km away`;

function placeRow(p) {
  const d = S.here ? km(S.here, p) : null;
  return `<li class="${been(p) ? 'is-been' : ''} ${p.status === 'veto' ? 'is-veto' : ''}" data-row="${p.id}">
    <button class="tick" data-tick="${p.id}" aria-label="${been(p) ? 'Been here. Tap to undo' : 'Mark as been'}" aria-pressed="${been(p)}">${TICK}</button>
    <button class="pl" data-id="${p.id}"><span class="nm">${esc(p.name)}</span>
      <span class="meta">${been(p) ? `Been, ${fmt(p.visited_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}` : esc(CATS[p.category] || 'Spot')}${d !== null ? `, ${far(d)}` : ''}${p.tiktok ? ', has a TikTok' : ''}</span></button>
    <span class="st">${been(p) ? '<span class="stamp-mini">been</span>' : p.status === 'veto' ? 'vetoed' : p.status === 'both' ? '' : esc(name(p.status).replace(/^baby /, ''))}</span>
  </li>`;
}

async function viewTrip() {
  const v = $('#view'), code = S.trip;
  const atlas = await loadAtlas();
  if (S.tab !== 'travel' || S.trip !== code) return;
  const t = trips().find((x) => x.code === code), a = atlas.get(code);
  const all = tripPlaces(code);
  const mode = S.tripMode || localStorage.getItem('ziggy-trip-mode') || 'map';
  const cats = [...new Set(all.map((p) => p.category))].filter((c) => CATS[c]);
  if (S.catFilter !== 'all' && !cats.includes(S.catFilter)) S.catFilter = 'all';
  const shown = all.filter((p) => S.catFilter === 'all' || p.category === S.catFilter);
  const order = (x, y) => S.here ? km(S.here, x) - km(S.here, y) : (x.status === 'veto') - (y.status === 'veto') || x.name.localeCompare(y.name);
  const togo = shown.filter((p) => !been(p)).sort(order);
  const done = shown.filter(been).sort((x, y) => y.visited_at.localeCompare(x.visited_at));
  const c = tripCount(code), pct = c.all ? c.been / c.all * 100 : 0;
  v.innerHTML = `
    <div class="trip-top">
      <button class="back" id="trip-back">All maps</button>
      <button class="icon-btn" id="trip-more" aria-label="Map options"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg></button>
    </div>
    <div class="trip-head">
      <svg class="trip-sil" viewBox="0 0 100 100" aria-hidden="true"><path d="${a?.d || ''}"/></svg>
      <div><h2 class="trip-name">${esc(t.name)}</h2>
      <p class="trip-stat">${c.all ? `${c.been} of ${c.all} been` : 'Nothing pinned yet'}<span>+${TRAVEL_XP} XP for ${esc(name('kc'))} each</span></p></div>
    </div>
    <div class="trip-bar"><i style="width:${pct}%"></i></div>
    <div class="mode" id="mode"><button data-m="map" aria-pressed="${mode === 'map'}">Map</button><button data-m="list" aria-pressed="${mode === 'list'}">List</button></div>
    ${mode === 'map' ? `<div class="map-wrap"><div id="map" aria-label="Map of ${esc(t.name)}"></div>
      <button class="map-btn" id="locate" aria-label="Show where we are">${ICON_LOC}</button>
      <button class="btn small map-add" id="add-spot">Add a place</button></div>` : `<button class="btn line add-line" id="add-spot">Add a place</button>`}
    ${S.here ? `<p class="near-note">Nearest first<button class="btn quiet small" id="unnear">Clear</button></p>` : ''}
    ${cats.length > 1 ? `<div class="chips" id="chips"><button class="chip" data-c="all" aria-pressed="${S.catFilter === 'all'}">All</button>${cats.map((k) => `<button class="chip" data-c="${k}" aria-pressed="${S.catFilter === k}">${CATS[k]}</button>`).join('')}</div>` : ''}
    ${togo.length ? `<div class="section-head"><h2>To go, ${togo.length}</h2></div><ul class="places" id="plist">${togo.map(placeRow).join('')}</ul>` : ''}
    ${done.length ? `<div class="section-head"><h2>Been, ${done.length}</h2></div><ul class="places been-list" id="blist">${done.map(placeRow).join('')}</ul>` : ''}
    ${!all.length ? `<p class="empty">No places yet. Tap Add a place and search the name from the TikTok or your notes.</p>` : ''}`;

  $('#trip-back').onclick = () => { S.trip = null; S.here = null; thump(false); viewTravel(); scroller()?.scrollTo(0, 0); };
  $('#trip-more').onclick = () => tripMore(t, all);
  $('#mode').onclick = (e) => { const m = e.target.closest('button')?.dataset.m; if (!m || m === mode) return; S.tripMode = m; try { localStorage.setItem('ziggy-trip-mode', m); } catch {} viewTrip(); };
  $('#add-spot').onclick = () => addSpot(t);
  $('#unnear')?.addEventListener('click', () => { S.here = null; viewTrip(); });
  $('#chips')?.addEventListener('click', (e) => { const k = e.target.closest('.chip')?.dataset.c; if (k) { S.catFilter = k; viewTrip(); } });
  v.querySelectorAll('.places').forEach((ul) => ul.addEventListener('click', (e) => {
    const tk = e.target.closest('[data-tick]'); if (tk) return toggleBeen(S.places.find((p) => p.id === Number(tk.dataset.tick)), tk);
    const id = e.target.closest('[data-id]')?.dataset.id; if (id) placeSheet(S.places.find((p) => p.id === Number(id)));
  }));
  if (mode !== 'map') { S.map?.remove(); S.map = null; return; }
  $('#locate').onclick = locate;

  S.map?.remove(); S.map = null;
  const el = $('#map'), token = (S.mapToken = (S.mapToken || 0) + 1);
  try {
    const m = await buildMap(el, shown, a);
    if (token !== S.mapToken || !document.body.contains(el)) { m.remove(); return; }
    S.map = m;
  } catch { el.innerHTML = '<p class="empty" style="padding:20px">The map couldn’t load. Check your connection. The list still works.</p>'; }
}

/* ---------- the map itself ---------- */
// First choice: a sharp map drawn on the phone (OpenFreeMap's dark style, free, no key), so it stays crisp when you zoom.
// If that can't start on a phone, the older OpenStreetMap picture map takes over by itself, so there's always a map.
const VECTOR = {
  js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  style: 'https://tiles.openfreemap.org/styles/dark',
};
let mlReady;
function loadMapLibre() {
  return mlReady ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = VECTOR.css; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = VECTOR.js; s.onload = res; s.onerror = () => { mlReady = null; rej(); }; document.head.appendChild(s);
    setTimeout(() => rej(), 15000);
  });
}
let glOK;
function webgl() {
  if (glOK === undefined) { try { const g = document.createElement('canvas').getContext('webgl'); glOK = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { glOK = false; } }
  return glOK;
}
function pinEl(p) { const e = document.createElement('span'); e.className = `pin ${pinClass(p)}`; e.innerHTML = been(p) ? TICK : ''; e.title = p.name; return e; }
function hereEl() { const e = document.createElement('span'); e.className = 'here'; return e; }
// Where the map starts: all your pins, or the one pin, or the whole country.
function frame(shown, a, fit, jump) {
  if (shown.length > 1) { const xs = shown.map((p) => p.lng), ys = shown.map((p) => p.lat); fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 14); }
  else if (shown.length === 1) jump(shown[0].lat, shown[0].lng, 14);
  else if (a) fit(a.box, 12);
  else jump(13.7466, 100.5393, 11);
}
async function buildMap(el, shown, a) {
  if (!S.mapFallback && webgl()) {
    try { return await vectorMap(el, shown, a); }
    catch { S.mapFallback = true; el.innerHTML = ''; el.className = ''; }
  }
  return rasterMap(el, shown, a);
}
async function vectorMap(el, shown, a) {
  await loadMapLibre();
  const ml = window.maplibregl;
  return new Promise((res, rej) => {
    const map = new ml.Map({ container: el, style: VECTOR.style, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, fadeDuration: 120 });
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
    let done = false, styled = false;
    const fail = () => { if (done) return; done = true; try { map.remove(); } catch {} rej(); };
    const timer = setTimeout(fail, 12000);
    map.on('error', () => { if (!styled) fail(); });
    // Ready as soon as the map's look has arrived; the map pieces fill in as they download.
    map.once('style.load', () => {
      styled = true;
      if (done) return; done = true; clearTimeout(timer);
      restyle(map);
      for (const p of shown) {
        const e = pinEl(p); e.addEventListener('click', (ev) => { ev.stopPropagation(); placeSheet(p); });
        new ml.Marker({ element: e }).setLngLat([p.lng, p.lat]).addTo(map);
      }
      if (S.here) new ml.Marker({ element: hereEl() }).setLngLat([S.here.lng, S.here.lat]).addTo(map);
      frame(shown, a, (b, max) => map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: max, duration: 0 }), (lat, lng, z) => map.jumpTo({ center: [lng, lat], zoom: z }));
      res({
        kind: 'vector',
        remove: () => map.remove(),
        resize: () => map.resize(),
        bounds: () => { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; },
        focus: (lat, lng, z) => map.easeTo({ center: [lng, lat], zoom: z }),
        center: () => { const c = map.getCenter().wrap(); return [c.lat, c.lng]; },
        onTap: (cb) => { const f = (e) => cb(e.lngLat.lat, e.lngLat.lng); map.once('click', f); return () => map.off('click', f); },
      });
    });
  });
}
// English names first (instead of 2 lines of English + Thai), and a hint of ziggy purple in the water.
function restyle(map) {
  for (const l of map.getStyle().layers || []) {
    try {
      const tf = l.layout?.['text-field'];
      if (l.type === 'symbol' && tf && JSON.stringify(tf).includes('name')) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]);
      if (l.type === 'fill' && /^water/.test(l.id)) map.setPaintProperty(l.id, 'fill-color', '#15121e');
    } catch {}
  }
}
async function rasterMap(el, shown, a) {
  await loadLeaflet();
  const L = window.L;
  const map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true });
  map.attributionControl.setPrefix(false);
  addTiles(map);
  for (const p of shown) {
    const icon = L.divIcon({ className: '', html: `<span class="pin ${pinClass(p)}" style="display:grid">${been(p) ? TICK : ''}</span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    L.marker([p.lat, p.lng], { icon, title: p.name, zIndexOffset: been(p) ? -100 : 0 }).addTo(map).on('click', () => placeSheet(p));
  }
  frame(shown, a, (b, max) => map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: max }), (lat, lng, z) => map.setView([lat, lng], z));
  if (S.here) showHere(map);
  return {
    kind: 'raster',
    remove: () => map.remove(),
    resize: () => map.invalidateSize(),
    bounds: () => { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; },
    focus: (lat, lng, z) => map.setView([lat, lng], z),
    center: () => { const c = map.getCenter().wrap(); return [c.lat, c.lng]; },
    onTap: (cb) => { const f = (e) => cb(e.latlng.lat, e.latlng.lng); map.once('click', f); return () => map.off('click', f); },
  };
}

// Map pictures come from OpenStreetMap (free, no key). If that server ever fails, a second free OpenStreetMap server takes over.
// The dark look is a filter in styles.css.
const TILES = [
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'],
  ['https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, OSM France'],
];
function addTiles(map, i = 0) {
  const [url, attribution] = TILES[i];
  const layer = window.L.tileLayer(url, { maxZoom: 19, attribution, subdomains: 'abc', crossOrigin: 'anonymous' }).addTo(map);
  let ok = 0, bad = 0;
  layer.on('tileload', () => { ok++; });
  layer.on('tileerror', () => {
    if (++bad < 4 || ok) return;
    if (TILES[i + 1] && navigator.onLine !== false) { bad = -1e9; map.removeLayer(layer); addTiles(map, i + 1); }
    else if (bad === 4) { const n = document.createElement('p'); n.className = 'map-note'; n.textContent = 'The map pictures aren’t loading right now. The pins and the list still work.'; map.getContainer().parentElement?.appendChild(n); }
  });
}

function locate() {
  if (!navigator.geolocation) return toast('This phone can’t share location here');
  const b = $('#locate'); b?.classList.add('busy');
  navigator.geolocation.getCurrentPosition((pos) => {
    b?.classList.remove('busy');
    S.here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    viewTrip().then(() => S.map?.focus(S.here.lat, S.here.lng, 15));
    toast('Nearest places first');
  }, () => { b?.classList.remove('busy'); toast('Location is off for ziggy. You can turn it on in Settings.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
function showHere(map) {
  const icon = window.L.divIcon({ className: '', html: '<span class="here"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
  window.L.marker([S.here.lat, S.here.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
}

// Stamp a place as been: +2 XP for baby KC. Undo takes the 2 XP back, so it can't be done twice.
async function toggleBeen(p, btn) {
  if (!p || btn?.disabled) return;
  if (btn) btn.disabled = true;
  const was = been(p), ref = 'place:' + p.id;
  const before = xpTotal();
  try {
    await S.be.updatePlace(p.id, was ? { visited_at: null, visited_by: null } : { visited_at: new Date().toISOString(), visited_by: S.me.who });
    if (!was) await S.be.addXp({ who: 'kc', amount: TRAVEL_XP, reason: 'been to ' + p.name, ref });
    else { const row = S.xp.find((x) => x.ref === ref); if (row) await S.be.deleteXp(row.id); }
    if (S.asKC) { toast('Just looking: nothing was saved'); if (btn) btn.disabled = false; return; }
    [S.places, S.xp] = await Promise.all([S.be.places(), S.be.xp()]);
    const unlocked = was ? [] : await grantLevels();
    if (!was) {
      btn?.classList.add('stamping'); thump(true);
      const row = btn?.closest('li');
      if (row) { const pop = document.createElement('span'); pop.className = 'tick-pop'; pop.textContent = `+${xpTotal() - before || TRAVEL_XP} XP`; row.appendChild(pop); }
      setTimeout(() => { viewTrip(); toast(S.me.who === 'kc' ? `Stamped. +${TRAVEL_XP} XP` : `Stamped. +${TRAVEL_XP} XP for ${name('kc')}`); }, 900);
      if (unlocked.length) setTimeout(() => rewardSheet(unlocked), 1500);
    } else { thump(false); viewTrip(); toast(`Unstamped. The ${TRAVEL_XP} XP went back.`); }
  } catch { if (btn) btn.disabled = false; toast('Didn’t save. Try again.'); }
}

function placeSheet(p) {
  if (!p) return;
  const isKC = S.me.who === 'kc';
  const t = trips().find((x) => x.code === placeCountry(p));
  const vetoes = S.vouchers.filter((v) => !v.redeemed_at && /veto/i.test(v.title));
  const keys = [t?.name, ...(placeCountry(p) === 'th' ? ['bangkok', 'thai'] : [])].filter(Boolean).map((k) => k.toLowerCase());
  const vetoVoucher = vetoes.find((v) => keys.some((k) => v.title.toLowerCase().includes(k))) || vetoes[0];
  const opts = [['both', 'We both want it'], ['kc', `${name('kc')} wants it`], ['jaa', `${name('jaa')} wants it`], ['veto', 'Veto']];
  openSheet(`<h2>${esc(p.name)}</h2>
    <p class="lead">${esc(CATS[p.category] || 'Spot')}. Added by ${esc(name(p.added_by))}.</p>
    ${p.note ? `<p class="quote">${esc(p.note)}</p>` : ''}
    <div class="stack-y">
      <button class="been-btn ${been(p) ? 'on' : ''}" id="been"><span class="tick" aria-hidden="true">${TICK}</span><span><b>${been(p) ? 'We’ve been here' : 'We went here'}</b><small>${been(p) ? `Stamped ${fmt(p.visited_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}. Tap to undo, the ${TRAVEL_XP} XP goes back.` : `Stamp it: +${TRAVEL_XP} XP for ${esc(name('kc'))}`}</small></span></button>
      <div class="row">
        ${p.tiktok ? `<a class="btn" href="${esc(p.tiktok)}" target="_blank" rel="noopener">Watch the TikTok</a>` : ''}
        <a class="btn line" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Open in Maps</a>
      </div>
      ${been(p) ? '' : `<div class="field"><span>Who wants it</span><div class="seg" id="st">${opts.map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${p.status === k}">${esc(l)}</button>`).join('')}</div></div>
      <p class="muted small" style="margin:0">${isKC ? (vetoVoucher ? `Veto uses your “${esc(vetoVoucher.title)}” voucher.` : 'Veto needs a veto voucher. You don’t have one right now.') : `Only ${esc(name('kc'))} holds vetoes.`}</p>`}
      <div class="row"><button class="btn line" id="edit">Edit</button><button class="btn danger" id="del">Delete</button></div>
    </div>`, (b) => {
    b.querySelector('#been').onclick = () => { closeSheet(); setTimeout(() => toggleBeen(p, $(`[data-tick="${p.id}"]`)), 280); };
    b.querySelector('#st')?.addEventListener('click', async (e) => {
      const s = e.target.closest('button')?.dataset.s;
      if (!s || s === p.status) return;
      if (s === 'veto') {
        if (!isKC) return toast(`Only ${name('kc')} can veto`);
        if (!vetoVoucher) return toast('No veto voucher in your wallet');
        await S.be.redeemVoucher(vetoVoucher.id, true);
        S.vouchers = await S.be.vouchers();
        thump(true); toast('Vetoed. Voucher used.');
      }
      try { await S.be.updatePlace(p.id, { status: s }); S.places = await S.be.places(); closeSheet(); viewTrip(); }
      catch { toast('Didn’t save. Try again.'); }
    });
    b.querySelector('#edit').onclick = () => placeForm(p);
    const del = b.querySelector('#del');
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = been(p) ? `Tap again to delete (the ${TRAVEL_XP} XP goes back)` : 'Tap again to delete'; return; }
      try { await S.be.deletePlace(p.id); const back = await dropPlaceXp([p.id]); S.places = await S.be.places(); closeSheet(); viewTrip(); toast(back ? `Removed. The ${back} XP went back.` : 'Removed'); } catch { toast('Didn’t delete. Try again.'); }
    };
  });
}

// Finding a place: 2 free searches of OpenStreetMap at once (Photon is forgiving with spelling, Nominatim is precise).
// Small cafés are often missing from OpenStreetMap, so you can always place the pin yourself.
const POI = /^(amenity|shop|tourism|leisure|building|office|craft|historic|club|healthcare|sport)$/;
function readCoords(q) { // pasted numbers or a full Google/Apple Maps link
  const g = q.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || q.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!g) return null;
  const lat = Number(g[1]), lng = Number(g[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
async function findPlaces(q, t) {
  const box = S.map ? S.map.bounds() : null, mid = box ? [(box[1] + box[3]) / 2, (box[0] + box[2]) / 2] : null;
  const a = (await loadAtlas()).get(t.code);
  const pb = a && a.box[2] <= 180 ? `&bbox=${a.box.join(',')}` : '';
  const photon = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en${mid ? `&lat=${mid[0]}&lon=${mid[1]}` : ''}${pb}`).then((r) => r.json())
    .then((j) => (j.features || []).filter((f) => (f.properties.countrycode || '').toLowerCase() === t.code).map((f) => {
      const p = f.properties;
      return { name: p.name || p.street || q, sub: [p.street && p.street !== p.name ? p.street : '', p.district || p.locality, p.city || p.county].filter(Boolean).join(', '),
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], poi: POI.test(p.osm_key || '') };
    }));
  const vb = box ? `&viewbox=${box[0]},${box[3]},${box[2]},${box[1]}` : '';
  const nomi = fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=${t.code}${vb}&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } }).then((r) => r.json())
    .then((d) => d.map((r) => { const parts = r.display_name.split(', '); return { name: r.name || parts[0], sub: parts.slice(1, 4).join(', '), lat: Number(r.lat), lng: Number(r.lon), poi: POI.test(r.category || '') }; }));
  const got = await Promise.allSettled([photon, nomi]);
  if (got.every((g) => g.status === 'rejected')) throw new Error('search down');
  const out = [];
  for (const r of got.flatMap((g) => g.status === 'fulfilled' ? g.value : [])) {
    if (!out.some((o) => o.name.toLowerCase() === r.name.toLowerCase() && Math.abs(o.lat - r.lat) < .003 && Math.abs(o.lng - r.lng) < .003)) out.push(r);
  }
  return out.slice(0, 10);
}

function addSpot(t) {
  openSheet(`<h2>Add a place</h2><p class="lead">Search the name from the TikTok. If it isn’t there, you can place the pin yourself.</p>
    <form id="sf" class="stack-y">
      <div class="row"><input class="search" name="q" required placeholder="A name, a street, or a Maps link" autofocus style="flex:1"><button class="btn small" type="submit">Search</button></div>
    </form>
    <ul class="results" id="results"></ul>
    <div class="row"><button class="btn quiet" id="drop-pin">Place the pin myself</button></div>`, (b) => {
    const results = b.querySelector('#results');
    let q = '';
    b.querySelector('#sf').onsubmit = async (e) => {
      e.preventDefault();
      q = new FormData(e.target).get('q').trim();
      const at = readCoords(q);
      if (at) return pinPicker(t, { ...at, name: '' });
      if (/maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\/p/i.test(q)) {
        results.innerHTML = '<li class="muted small" style="padding:12px 0">Short share links can’t be opened here. Type the name instead, or in Google Maps press and hold the spot, copy the 2 numbers it shows, and paste those.</li>'; return;
      }
      b.querySelector('#drop-pin').parentElement.hidden = true;
      results.innerHTML = '<li class="muted small" style="padding:12px 0">Searching…</li>';
      let data;
      try { data = await findPlaces(q, t); }
      catch { results.innerHTML = `<li class="muted small" style="padding:12px 0">Search isn’t working right now.</li>${mineRow(q)}`; return; }
      results.innerHTML = (data.length ? data.map((r, i) => `<li><button data-i="${i}">${esc(r.name)}<small>${esc(r.sub)}${r.poi ? '' : `${r.sub ? '. ' : ''}You’ll place the pin`}</small></button></li>`).join('')
        : `<li class="muted small" style="padding:12px 0">Not on the map yet. Lots of small places aren’t, so place it yourself.</li>`) + mineRow(q);
      results.onclick = (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.mine != null) return pinPicker(t, { name: q });
        const r = data[btn.dataset.i];
        // a real place goes straight to the form; a street or area opens the pin, named with what you typed
        if (r.poi) placeForm({ name: r.name, lat: r.lat, lng: r.lng, country: t.code });
        else pinPicker(t, { lat: r.lat, lng: r.lng, name: q });
      };
    };
    b.querySelector('#drop-pin').onclick = () => pinPicker(t, { name: q });
  });
}
const mineRow = (q) => `<li><button data-mine class="mine">Place “${esc(q)}” myself<small>Pick the spot on the map</small></button></li>`;

// Move the map under a fixed pin, then "Pin it here". Easier on a phone than tapping an exact spot.
async function pinPicker(t, { lat = null, lng = null, name = '' } = {}) {
  closeSheet();
  if (!S.map) { S.tripMode = 'map'; try { localStorage.setItem('ziggy-trip-mode', 'map'); } catch {} await viewTrip(); }
  const wrap = $('.map-wrap');
  if (!S.map || !wrap) return toast('The map isn’t loading right now, so pins can’t be placed');
  if (lat != null) S.map.focus(lat, lng, 17);
  wrap.querySelector('.picker')?.remove();
  const ui = document.createElement('div'); ui.className = 'picker';
  ui.innerHTML = `<span class="cross" aria-hidden="true"></span>
    <div class="pick-bar"><span>Move the map so the pin sits on the spot</span><div class="pick-btns"><button class="btn quiet small" data-x>Cancel</button><button class="btn small" data-ok>Pin it here</button></div></div>`;
  wrap.appendChild(ui); wrap.classList.add('picking');
  setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  const end = () => { ui.remove(); wrap.classList.remove('picking'); };
  ui.querySelector('[data-x]').onclick = end;
  ui.querySelector('[data-ok]').onclick = () => { const [la, ln] = S.map.center(); end(); placeForm({ name, lat: la, lng: ln, country: t.code }); };
}

// Deleting a place you'd stamped takes its XP back too.
async function dropPlaceXp(ids) {
  const rows = S.xp.filter((x) => ids.some((id) => x.ref === 'place:' + id));
  for (const r of rows) await S.be.deleteXp(r.id);
  if (rows.length) S.xp = await S.be.xp();
  return rows.reduce((n, r) => n + r.amount, 0);
}

function placeForm(p) {
  const editing = !!p.id;
  openSheet(`<h2>${editing ? 'Edit place' : 'New place'}</h2>
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
        else {
          if (!S.countries.some((c) => c.code === p.country)) { await S.be.addCountry({ code: p.country, name: trips().find((x) => x.code === p.country)?.name || p.country.toUpperCase(), sort: 0, added_by: S.me.who }).catch(() => {}); S.countries = await S.be.countries(); }
          await S.be.addPlace({ ...row, lat: p.lat, lng: p.lng, country: p.country, status: S.me.who, added_by: S.me.who });
        }
        S.places = await S.be.places(); closeSheet(); thump(false); viewTrip(); toast(editing ? 'Saved' : 'Pinned');
      } catch { toast('Didn’t save. Try again.'); }
    };
  });
}

/* ================= manage (baby Jaa only) ================= */
const TIERS = [['black', 'Matte black'], ['chrome', 'Chrome'], ['orchid', 'Purple']];
function viewManage() {
  const v = $('#view');
  const adj = S.words.filter((w) => w.kind === 'adj').sort((a, b) => a.word.localeCompare(b.word));
  const noun = S.words.filter((w) => w.kind === 'noun').sort((a, b) => a.word.localeCompare(b.word));
  const levels = S.rewards.filter((r) => r.kind === 'level').sort((a, b) => a.sort - b.sort);
  const treats = S.rewards.filter((r) => r.kind === 'special').sort((a, b) => a.sort - b.sort);
  const nextLevel = Math.floor(xpTotal() / XP.perReward) + 1;
  const nextPrize = levels.length ? levels[(nextLevel - 1) % levels.length] : null;
  const unused = S.vouchers.filter((x) => !x.redeemed_at).sort((a, b) => a.id - b.id);
  const bonuses = S.xp.filter((x) => x.ref.startsWith('bonus:')).slice(-5).reverse();
  const chips = (list) => list.map((w) => `<button type="button" class="wchip" data-word="${w.id}">${esc(w.word)}</button>`).join('');
  const row = (attr, id, title, sub) => `<li><button type="button" ${attr}="${id}"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button></li>`;
  v.innerHTML = `
    <button class="back" id="m-back" type="button">Back</button>
    <h2 class="m-title">Manage ziggy</h2>
    <p class="muted small" style="margin:6px 0 0">Changes save right away and show on both phones. Only you can see this.</p>

    <div class="section-head"><h2>Nicknames</h2></div>
    <div class="nick-try"><p class="stack" id="m-nick">${esc(nickname(addDays(TODAY, Math.floor(Math.random() * 999) + 1)))}</p><button class="btn line small" id="m-shuffle" type="button">Shuffle</button></div>
    <h3 class="m-sub">Describing words <span>${adj.length}</span></h3>
    <div class="wchips" id="m-words-adj">${chips(adj)}</div>
    <form class="addrow" data-kind="adj"><input name="w" maxlength="30" placeholder="Add a describing word" autocomplete="off"><button class="btn small" type="submit">Add</button></form>
    <h3 class="m-sub">Nicknames <span>${noun.length}</span></h3>
    <div class="wchips" id="m-words-noun">${chips(noun)}</div>
    <form class="addrow" data-kind="noun"><input name="w" maxlength="30" placeholder="Add a nickname" autocomplete="off"><button class="btn small" type="submit">Add</button></form>
    <p class="note-small">Each day mixes 3 or 4 describing words with 1 nickname. Tap a word to edit or remove it.</p>

    <div class="section-head"><h2>Bonus XP</h2></div>
    <p class="muted small" style="margin:0 0 12px">Give ${esc(name('kc'))} extra XP for anything. Her bar fills up the next time she opens ziggy.</p>
    <form class="bonus" id="m-bonus"><input name="amount" type="number" inputmode="numeric" min="1" max="100" value="10" aria-label="XP"><input name="reason" maxlength="60" placeholder="What it’s for" autocomplete="off"><button class="btn small" type="submit">Give</button></form>
    ${bonuses.length ? `<ul class="mlist" id="m-bonuses">${bonuses.map((x) => `<li><div><b>+${x.amount} XP</b><small>${esc(x.reason.replace(/^bonus: ?/, '') || 'bonus')}</small></div><button type="button" class="btn quiet small" data-unbonus="${x.id}">Remove</button></li>`).join('')}</ul>` : ''}

    <div class="section-head"><h2>Rewards every 100 XP</h2><button class="btn line small" type="button" data-addreward="level">Add</button></div>
    <ol class="mlist num" id="m-level">${levels.map((r) => row('data-reward', r.id, r.title, r.sub)).join('')}</ol>
    ${nextPrize ? `<p class="note-small">Given in this order, then it starts over. Her next one, at ${nextLevel * XP.perReward} XP: ${esc(nextPrize.title)}.</p>` : ''}

    <div class="section-head"><h2>Special day treats</h2><button class="btn line small" type="button" data-addreward="special">Add</button></div>
    <ul class="mlist" id="m-special">${treats.map((r) => row('data-reward', r.id, r.title, r.sub)).join('')}</ul>
    <p class="note-small">Used on monthsaries and special days that don’t have their own treat.</p>

    <div class="section-head"><h2>Poetry book</h2></div>
    <p class="muted small" style="margin:0 0 12px">${bookParts() ? `On ziggy: ${Object.entries(bookParts()).map(([k, v]) => `Part ${toRoman(Number(k))}, ${v.filter(([, t]) => t === 'p').length} poems`).join('; ')}. Upload a new PDF here whenever you add a part.` : 'Upload the PDF once. It stays private to the 2 of you, and ziggy splits it into parts and poems on its own.'}</p>
    <label class="btn line upload" id="m-book-label"><input type="file" accept="application/pdf" id="m-book" hidden>${bookParts() ? 'Upload a new version' : 'Upload the PDF'}</label>
    <p class="note-small" id="m-book-status"></p>

    <div class="section-head"><h2>In her wallet</h2></div>
    <ul class="mlist" id="m-vouchers">${unused.map((x) => row('data-voucher', x.id, x.title, x.sub)).join('') || '<li class="muted small">Nothing unused right now.</li>'}</ul>
    <p class="note-small">Special days are on Today. Timeline moments and Travel places are edited right where they are.</p>`;

  $('#m-back').onclick = () => { S.tab = S.back || 'today'; renderApp(); };
  $('#m-shuffle').onclick = () => { const el = $('#m-nick'); el.classList.remove('pop'); void el.offsetWidth; el.textContent = nickname(addDays(TODAY, Math.floor(Math.random() * 9999) + 1)); el.classList.add('pop'); thump(false); };
  v.querySelectorAll('.addrow').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    const word = f.w.value.trim().replace(/\s+/g, ' '), kind = f.dataset.kind;
    if (!word) return;
    if (S.words.some((w) => w.kind === kind && w.word.toLowerCase() === word.toLowerCase())) return toast(`“${word}” is already there`);
    try { await S.be.addWord({ kind, word }); S.words = await S.be.words(); viewManage(); toast(`Added “${word}”`); } catch { toast('Didn’t save. Try again.'); }
  });
  v.querySelectorAll('.wchips').forEach((c) => c.onclick = (e) => { const id = e.target.closest('[data-word]')?.dataset.word; if (id) wordForm(S.words.find((w) => w.id === Number(id))); });
  $('#m-bonus').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Math.round(Number(e.target.amount.value)), reason = e.target.reason.value.trim();
    if (!(amount >= 1 && amount <= 100)) return toast('Pick between 1 and 100 XP');
    try { await S.be.addXp({ who: 'kc', amount, reason: 'bonus: ' + (reason || 'just because'), ref: 'bonus:' + Date.now() }); S.xp = await S.be.xp(); thump(false); viewManage(); toast(`Gave her +${amount} XP`); }
    catch { toast('Didn’t save. Try again.'); }
  };
  $('#m-bonuses')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-unbonus]'); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again'; return; }
    try { await S.be.deleteXp(Number(b.dataset.unbonus)); S.xp = await S.be.xp(); viewManage(); toast('Removed'); } catch { toast('Didn’t remove. Try again.'); }
  });
  v.querySelectorAll('[data-addreward]').forEach((b) => b.onclick = () => rewardForm(null, b.dataset.addreward));
  ['#m-level', '#m-special'].forEach((sel) => $(sel)?.addEventListener('click', (e) => { const id = e.target.closest('[data-reward]')?.dataset.reward; if (id) rewardForm(S.rewards.find((r) => r.id === Number(id))); }));
  $('#m-book')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const st = $('#m-book-status'), label = $('#m-book-label');
    label.classList.add('busy');
    try {
      st.textContent = 'Reading the book…';
      const mod = await import('./book.js');
      await mod.openFile(file);
      const parts = await mod.bookMap((n, t) => { st.textContent = `Reading page ${n} of ${t}…`; });
      const counts = Object.entries(parts).map(([k, v]) => `Part ${toRoman(Number(k))}: ${v.filter(([, t]) => t === 'p').length} poems`);
      if (!counts.length) throw new Error('No parts found');
      st.textContent = 'Uploading privately…';
      await S.be.updateBook(file);
      const version = String(Date.now());
      await S.be.updateSetting('book_map', JSON.stringify(parts));
      await S.be.updateSetting('book_version', version);
      S.settings = await S.be.settings();
      toast('The book is on ziggy'); viewManage();
      $('#m-book-status').textContent = `Done. ${counts.join(', ')}.`;
    } catch (err) { st.textContent = 'That didn’t work: ' + (err.message || 'try again') + '.'; label.classList.remove('busy'); }
    e.target.value = '';
  });
  $('#m-vouchers')?.addEventListener('click', (e) => { const id = e.target.closest('[data-voucher]')?.dataset.voucher; if (id) voucherEdit(S.vouchers.find((x) => x.id === Number(id))); });
}
function confirmDelete(btn, run) {
  btn.onclick = async () => {
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Tap again to delete'; return; }
    try { await run(); } catch { toast('Didn’t delete. Try again.'); }
  };
}
function wordForm(w) {
  openSheet(`<h2>Edit word</h2><p class="lead">${w.kind === 'adj' ? 'A describing word' : 'A nickname'} in her daily nickname.</p>
    <form id="wf"><label class="field"><span>Word</span><input name="w" maxlength="30" required value="${esc(w.word)}" autocomplete="off"></label>
      <button class="btn" type="submit">Save</button><button class="btn danger" type="button" id="del">Remove</button></form>`, (b) => {
    b.querySelector('#wf').onsubmit = async (e) => {
      e.preventDefault(); const word = e.target.w.value.trim().replace(/\s+/g, ' ');
      if (!word) return;
      try { await S.be.updateWord(w.id, { word }); S.words = await S.be.words(); closeSheet(); viewManage(); toast('Saved'); } catch { toast('Didn’t save. Try again.'); }
    };
    confirmDelete(b.querySelector('#del'), async () => { await S.be.deleteWord(w.id); S.words = await S.be.words(); closeSheet(); viewManage(); toast(`Removed “${w.word}”`); });
  });
}
function rewardForm(r, kind = r?.kind) {
  let tier = r?.tier || 'black';
  const label = kind === 'level' ? 'reward' : 'treat';
  openSheet(`<h2>${r ? `Edit ${label}` : `Add a ${label}`}</h2>
    <p class="lead">${kind === 'level' ? `She gets these in order, 1 for every ${XP.perReward} XP.` : 'Given on monthsaries and special days without their own treat.'}</p>
    <form id="rf">
      <label class="field"><span>What it’s for</span><input name="title" maxlength="40" required value="${esc(r?.title || '')}" placeholder="1 matcha" autocomplete="off"></label>
      <label class="field"><span>Fine print</span><input name="sub" maxlength="70" value="${esc(r?.sub || '')}" placeholder="your milk, my treat" autocomplete="off"></label>
      <div class="field"><span>Card</span><div class="seg" id="tier">${TIERS.map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${tier === k}">${l}</button>`).join('')}</div></div>
      <button class="btn" type="submit">${r ? 'Save' : 'Add'}</button>
      ${r ? '<button class="btn danger" type="button" id="del">Delete</button>' : ''}
    </form>`, (b) => {
    b.querySelector('#tier').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (!t) return; tier = t; [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === t)); };
    b.querySelector('#rf').onsubmit = async (e) => {
      e.preventDefault();
      const row = { title: e.target.title.value.trim(), sub: e.target.sub.value.trim() || null, tier };
      try {
        if (r) await S.be.updateReward(r.id, row);
        else await S.be.addReward({ ...row, kind, sort: Math.max(0, ...S.rewards.filter((x) => x.kind === kind).map((x) => x.sort)) + 1 });
        S.rewards = await S.be.rewards(); closeSheet(); viewManage(); toast(r ? 'Saved' : 'Added');
      } catch { toast('Didn’t save. Try again.'); }
    };
    const del = b.querySelector('#del');
    if (del) confirmDelete(del, async () => { await S.be.deleteReward(r.id); S.rewards = await S.be.rewards(); closeSheet(); viewManage(); toast('Deleted'); });
  });
}
function voucherEdit(x) {
  let tier = x.tier || 'black';
  openSheet(`<h2>Edit voucher</h2><p class="lead">It’s unused, in ${esc(name('kc'))}’s wallet.</p>
    <form id="xf">
      <label class="field"><span>What it’s for</span><input name="title" maxlength="40" required value="${esc(x.title)}" autocomplete="off"></label>
      <label class="field"><span>Fine print</span><input name="sub" maxlength="70" value="${esc(x.sub || '')}" autocomplete="off"></label>
      <div class="field"><span>Card</span><div class="seg" id="tier">${TIERS.map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${tier === k}">${l}</button>`).join('')}</div></div>
      <button class="btn" type="submit">Save</button><button class="btn danger" type="button" id="del">Remove from her wallet</button>
    </form>`, (b) => {
    b.querySelector('#tier').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (!t) return; tier = t; [...e.currentTarget.children].forEach((y) => y.setAttribute('aria-pressed', y.dataset.t === t)); };
    b.querySelector('#xf').onsubmit = async (e) => {
      e.preventDefault();
      try { await S.be.updateVoucher(x.id, { title: e.target.title.value.trim(), sub: e.target.sub.value.trim() || null, tier }); S.vouchers = await S.be.vouchers(); closeSheet(); viewManage(); toast('Saved'); }
      catch { toast('Didn’t save. Try again.'); }
    };
    confirmDelete(b.querySelector('#del'), async () => { await S.be.deleteVoucher(x.id); S.vouchers = await S.be.vouchers(); closeSheet(); viewManage(); toast('Removed'); });
  });
}

/* ================= settings ================= */
function openSettings() {
  openSheet(`<h2>Settings</h2><p class="lead">Signed in as ${esc(S.me.display)}.</p>
    <div class="stack-y">
      ${S.asKC ? `<button class="btn" id="s-exitkc">Back to my view</button>` : ''}
      ${S.me.who === 'jaa' ? '<button class="btn" id="s-manage">Manage ziggy</button>' : ''}
      ${S.me.who === 'jaa' ? `<button class="btn line" id="s-askc">See ziggy as ${esc(name('kc'))}</button>` : ''}
      <button class="btn line" id="s-code">Change code</button>
      <button class="btn line" id="s-backup">Download a backup</button>
      ${S.be.demo ? `<button class="btn line" id="s-as">Demo: view as ${S.me.who === 'jaa' ? esc(name('kc')) : esc(name('jaa'))}</button>` : ''}
      <button class="btn danger" id="s-out">Sign out</button>
    </div>`, (b) => {
    b.querySelector('#s-askc')?.addEventListener('click', () => { closeSheet(); enterKC(); });
    b.querySelector('#s-exitkc')?.addEventListener('click', () => { closeSheet(); exitKC(); });
    if (S.asKC) b.querySelectorAll('#s-code, #s-backup, #s-out').forEach((x) => x.addEventListener('click', (e) => { e.stopImmediatePropagation(); toast(`${name('kc')} would see this. It’s off while you’re looking.`); }, true));
    b.querySelector('#s-manage')?.addEventListener('click', () => { closeSheet(); S.back = S.tab === 'manage' ? 'today' : S.tab; S.tab = 'manage'; renderApp(); scroller()?.scrollTo(0, 0); });
    b.querySelector('#s-code').onclick = () => { closeSheet(); renderSetPin(true); };
    b.querySelector('#s-backup').onclick = () => {
      const data = { exported: new Date().toISOString(), timeline: S.timeline, countries: S.countries, places: S.places, vouchers: S.vouchers, xp: S.xp };
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
setTimeout(healViewport, 400); setTimeout(healViewport, 1500);
