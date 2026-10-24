import { CONFIG } from './config.js';

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

const CHECKINS = [
  { kind: 'need', label: 'need you, don’t ask', hint: 'no questions asked' },
  { kind: 'call', label: 'call me', hint: 'whenever you can' },
  { kind: 'hug', label: 'just a hug', hint: 'from far away' },
  { kind: 'okay', label: 'i’m okay', hint: 'just tired' },
];
const CATS = { eat: 'Eat', matcha: 'Matcha and coffee', shop: 'Shop', rides: 'Rides and fun', gl: 'GL spots', sights: 'Sights', night: 'Night out', stay: 'Stay' };
const KIND_LABEL = { thai: 'Today’s Thai', stack: 'Nickname of the day', photo: 'Photo prompt', dare: 'A dare', bet: 'A bet', sie: 'Sie word of the day', flashback: 'Flashback', unlock: 'Something new' };

const who = (w) => S.members?.find((m) => m.who === w);
const name = (w) => who(w)?.display || w;
const messengerUrl = (handle) => handle ? `https://m.me/${encodeURIComponent(handle)}` : 'https://www.messenger.com/';

/* ================= sound ================= */
let audio;
function thump(strong = true) {
  if (localStorage.getItem('ziggy-sound') === 'off') return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(strong ? 150 : 110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.28);
    g.gain.setValueAtTime(strong ? 1 : 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + 0.6);
    // the beater click on the head
    const buf = audio.createBuffer(1, audio.sampleRate * 0.02, audio.sampleRate);
    const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const n = audio.createBufferSource(), ng = audio.createGain(), f = audio.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2400; ng.gain.value = 0.25;
    n.buffer = buf; n.connect(f).connect(ng).connect(audio.destination); n.start(t);
  } catch {}
  navigator.vibrate?.(strong ? 35 : 15);
}

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

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }
}
function sendSheet(message, title = 'Copied') {
  const p = S.partner;
  openSheet(`
    <h2>${esc(title)}</h2>
    <p class="lead">Paste it in your chat with ${esc(p?.display)}.</p>
    <p class="quote">${esc(message)}</p>
    <div class="row"><a class="btn" href="${esc(messengerUrl(p?.messenger))}" target="_blank" rel="noopener">Open Messenger</a></div>
    <div class="row"><button class="btn quiet" data-close>Done</button></div>`,
  (b) => { b.querySelector('[data-close]').onclick = closeSheet; b.querySelector('a').addEventListener('click', () => setTimeout(closeSheet, 400)); });
}

/* ================= boot ================= */
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  app.innerHTML = '<div class="loading">ziggy</div>';
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
  app.innerHTML = `<div class="gate"><div class="wordmark">ziggy</div><div class="gate-hello"><h1>${esc(title)}</h1></div><p class="gate-note" style="margin:18px auto auto">${esc(text)}</p></div>`;
}

/* ================= login + lock ================= */
function renderLogin() {
  S.unlocked = false;
  app.innerHTML = `
  <div class="gate">
    <div class="wordmark">ziggy</div>
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
    <div class="wordmark">ziggy</div>
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
  const [settings, words, drops, opens, vouchers, timeline, places, checkins] = await Promise.all([
    be.settings(), be.words(), be.drops(), be.opens(), be.vouchers(), be.timeline(), be.places(), be.checkins(),
  ]);
  Object.assign(S, { settings, words, drops, opens, vouchers, timeline, places, checkins });
}
async function unlock() {
  app.innerHTML = '<div class="loading">ziggy</div>';
  try { await loadAll(); } catch (e) { return renderMessage('Couldn’t load', e.message); }
  S.unlocked = true;
  renderApp();
}
async function refresh() {
  try { await loadAll(); if (!sheetOpen()) renderApp(); } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.hiddenAt = Date.now(); return; }
  if (!S.unlocked) return;
  if (Date.now() - S.hiddenAt > 60_000) renderLock(); else refresh();
});

/* ================= shell ================= */
const mapOpen = () => S.me.who === 'jaa' || (S.settings.map_unlock && TODAY >= S.settings.map_unlock);

function renderApp() {
  if (S.tab === 'bangkok' && !mapOpen()) S.tab = 'today';
  const since = S.settings.since;
  const dayCount = since ? dayNum(TODAY) - dayNum(since) + 1 : null;
  const seenWallet = Number(localStorage.getItem('ziggy-wallet-seen-' + S.me.who) || 0);
  const walletNew = S.vouchers.some((v) => !v.redeemed_at && v.id > seenWallet);
  const mapNew = !localStorage.getItem('ziggy-map-seen-' + S.me.who);
  const tabs = [['today', 'Today'], ['wallet', 'Wallet', walletNew], ['us', 'Us'], ...(mapOpen() ? [['bangkok', 'Bangkok', mapNew]] : [])];
  app.innerHTML = `
  <div class="shell">
    <header class="top">
      <div>
        <h1>${esc(name('kc'))} &amp; ${esc(name('jaa'))}</h1>
        ${dayCount ? `<p class="count">day ${dayCount.toLocaleString('en-US')} of forever and ever${PREVIEW ? ' (preview)' : ''}</p>` : ''}
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
  ({ today: viewToday, wallet: viewWallet, us: viewUs, bangkok: viewBangkok })[S.tab]();
}

/* ================= today ================= */
function dropFor(day) {
  const pinned = S.drops.filter((d) => d.show_on === day);
  if (pinned.length) return pinned[0];
  const pool = S.drops.filter((d) => !d.show_on).sort((a, b) => hashId(a.id) - hashId(b.id));
  if (!pool.length) return null;
  return pool[((dayNum(day) % pool.length) + pool.length) % pool.length];
}
function nickname(day) {
  const r = rng(dayNum(day) * 7919);
  const adj = S.words.filter((w) => w.kind === 'adj').map((w) => w.word);
  const noun = S.words.filter((w) => w.kind === 'noun').map((w) => w.word);
  const picked = [];
  while (picked.length < Math.min(3, adj.length)) { const w = adj[Math.floor(r() * adj.length)]; if (!picked.includes(w)) picked.push(w); }
  return `my ${picked.join(' ')} ${noun[Math.floor(r() * noun.length)] || 'baby'}`;
}

function drumHTML() {
  const rods = Array.from({ length: 8 }, (_, i) => `<span class="rod" style="transform: rotate(${i * 45 + 22.5}deg) translateY(calc(var(--d) / -2 + 17px))"></span>`).join('');
  return `<button class="drum" id="drum" aria-label="Open today's drop">${rods}<span class="label"><span class="seal"></span><b>today’s drop</b><span>tap to open</span></span></button>`;
}
function voucherCardHTML(v, no) {
  const tier = ['chrome', 'orchid'].includes(v.tier) ? v.tier : '';
  return `<div class="vcard ${tier}">
    <div class="v-top"><div class="v-title">${esc(v.title)}</div><div class="v-no">No. ${String(no).padStart(3, '0')}</div></div>
    ${v.sub ? `<div class="v-sub">${esc(v.sub)}</div>` : ''}
    <div class="v-foot"><div>issued by ${esc(name(v.issued_by || 'jaa'))}<br>valid JK forever and ever</div><div class="v-mono" aria-hidden="true">JK</div></div>
  </div>`;
}
function dropCardHTML(d) {
  if (!d) return `<div class="drop"><p class="kind">Today</p><h3>No drop today</h3><p class="body">Even ziggy needs a day off.</p></div>`;
  const label = KIND_LABEL[d.kind] || `From ${name('jaa')}`;
  let inner;
  if (d.kind === 'thai') inner = `<h3 class="thai" lang="th">${esc(d.title)}</h3><p class="say">${esc(d.body)}</p>${d.extra ? `<p class="extra">${esc(d.extra)}</p>` : ''}`;
  else if (d.kind === 'stack') inner = `<p class="extra" style="margin:0 0 10px">${esc(d.body || 'Today you are officially')}</p><p class="stack">${esc(nickname(TODAY))}</p>`;
  else inner = `<h3>${esc(d.title)}</h3>${d.body ? `<p class="body">${esc(d.body)}</p>` : ''}${d.extra ? `<p class="extra">${esc(d.extra)}</p>` : ''}`;
  const sendable = ['photo', 'dare', 'bet'].includes(d.kind) && S.me.who === 'kc';
  const granted = d.voucher_title ? `<div class="granted">${voucherCardHTML({ title: d.voucher_title, sub: d.voucher_sub, tier: d.voucher_tier, issued_by: 'jaa' }, S.vouchers.length + (PREVIEW ? 1 : 0))}</div>` : '';
  return `<div class="drop"><p class="kind">${esc(label)}</p>${inner}${granted}
    ${sendable ? `<div class="v-actions"><a class="btn line small" href="${esc(messengerUrl(S.partner?.messenger))}" target="_blank" rel="noopener">Send it to ${esc(S.partner.display)}</a></div>` : ''}</div>`;
}

function viewToday() {
  const v = $('#view');
  const drop = dropFor(TODAY);
  const opened = S.opens.some((o) => o.drop_day === TODAY && o.who === S.me.who) || S.openedLocal === TODAY;
  const theirs = S.checkins.filter((c) => c.by_who === S.partner?.who).slice(0, 3);
  const upcoming = S.me.who === 'jaa' ? Array.from({ length: 7 }, (_, i) => addDays(TODAY, i + 1)).map((day) => [day, dropFor(day)]) : [];
  v.innerHTML = `
    <p class="today-date">${fmt(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="stage" id="stage">${opened ? dropCardHTML(drop) : drumHTML()}</div>
    <div class="section-head"><h2>Tell ${esc(S.partner?.display)} without explaining</h2></div>
    <div class="checkin">${CHECKINS.map((c) => `<button data-c="${c.kind}">${esc(c.label)}<small>${esc(c.hint)}</small></button>`).join('')}</div>
    ${theirs.length ? `<div class="section-head"><h2>Latest from ${esc(S.partner.display)}</h2></div>
      <ul class="feed">${theirs.map((c) => `<li><span>${esc(c.label)}</span><time>${fmtTime(c.created_at)}</time></li>`).join('')}</ul>` : ''}
    ${upcoming.length ? `<details class="peek"><summary>Coming up (only you see this)</summary><ol>
      ${upcoming.map(([day, d]) => `<li><span>${fmt(day, { month: 'short', day: 'numeric' })}</span>${esc(d ? (d.kind === 'stack' ? 'Nickname of the day' : d.title) : 'nothing')}${d?.show_on ? ' (pinned)' : ''}</li>`).join('')}
    </ol></details>` : ''}`;

  const drum = $('#drum');
  if (drum) drum.onclick = async () => {
    thump(true);
    drum.classList.add('hit');
    const rip = document.createElement('span'); rip.className = 'ripple'; drum.appendChild(rip);
    S.openedLocal = TODAY;
    let granted = false;
    if (!PREVIEW) {
      try {
        await S.be.markOpen(TODAY, S.me.who);
        if (drop?.voucher_title) {
          await S.be.addVoucher({ title: drop.voucher_title, sub: drop.voucher_sub, tier: drop.voucher_tier || 'black', from_drop: TODAY, issued_by: 'jaa' });
          S.vouchers = await S.be.vouchers(); granted = true;
        }
      } catch (e) { toast('Opened, but didn’t save. Check your connection.'); }
    }
    setTimeout(() => {
      $('#stage').innerHTML = dropCardHTML(drop);
      if (granted) { toast('Added to your wallet'); renderNavBadges(); }
    }, 380);
  };
  v.querySelector('.checkin').onclick = async (e) => {
    const c = CHECKINS.find((x) => x.kind === e.target.closest('button')?.dataset.c);
    if (!c) return;
    thump(false);
    const msg = `${c.label} \u{1F5A4}`;
    await copyText(msg);
    sendSheet(msg);
    if (!PREVIEW) S.be.addCheckin({ kind: c.kind, label: c.label, by_who: S.me.who }).catch(() => toast('Didn’t save, but the message is copied.'));
  };
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
  const used = numbered.filter((x) => x.redeemed_at).sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
  const maxId = Math.max(0, ...S.vouchers.map((x) => x.id));
  localStorage.setItem('ziggy-wallet-seen-' + S.me.who, String(maxId));
  const isKC = S.me.who === 'kc';
  v.innerHTML = `
    <div class="section-head" style="margin-top:22px"><h2>${active.length} ${active.length === 1 ? 'voucher' : 'vouchers'} to use</h2>
      ${!isKC ? '<button class="btn line small" id="issue">Issue a voucher</button>' : ''}</div>
    ${active.length ? `<div class="cards" id="cards">${active.map((x) => `
      <div class="vwrap" data-id="${x.id}">
        <button class="vbtn" aria-expanded="false" style="all:unset;display:block;width:100%;cursor:pointer">${voucherCardHTML(x, x.no)}</button>
        <div class="v-actions">${isKC ? `<button class="btn" data-redeem="${x.id}">Redeem</button>` : `<p class="muted small" style="margin:4px 0 0">Waiting for ${esc(name('kc'))} to use it.</p>`}</div>
      </div>`).join('')}</div>` : `<p class="empty">Nothing in the wallet right now. Keep opening your drops.</p>`}
    ${used.length ? `<div class="section-head"><h2>Used</h2></div><ul class="used">${used.map((x) => `<li><b>${esc(x.title)}</b><span>${fmt(x.redeemed_at.slice(0, 10), { month: 'short', day: 'numeric' })}</span></li>`).join('')}</ul>` : ''}`;

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
  $('#issue')?.addEventListener('click', issueVoucher);
}
function redeem(id) {
  const x = S.vouchers.find((v) => v.id === id);
  openSheet(`<h2>Use this voucher?</h2><p class="lead">${esc(name('jaa'))} gets a message to make it happen.</p>
    <p class="quote">${esc(x.title)}${x.sub ? `, ${esc(x.sub)}` : ''}</p>
    <div class="row"><button class="btn" data-yes>Redeem</button></div><div class="row"><button class="btn quiet" data-no>Not yet</button></div>`, (b) => {
    b.querySelector('[data-no]').onclick = closeSheet;
    b.querySelector('[data-yes]').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await S.be.redeemVoucher(id);
        thump(true);
        const msg = `Redeeming: ${x.title}${x.sub ? ` (${x.sub})` : ''}. Pay up, ${name('jaa')} \u{1F5A4}`;
        await copyText(msg);
        S.vouchers = await S.be.vouchers();
        viewWallet();
        sendSheet(msg, 'Redeemed and copied');
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
        await S.be.redeemVoucher(vetoVoucher.id);
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
  const soundOn = localStorage.getItem('ziggy-sound') !== 'off';
  openSheet(`<h2>Settings</h2><p class="lead">Signed in as ${esc(S.me.display)}.</p>
    <div class="stack-y">
      <button class="btn line" id="s-code">Change code</button>
      <button class="btn line" id="s-sound">Sound: ${soundOn ? 'on' : 'off'}</button>
      <button class="btn line" id="s-backup">Download a backup</button>
      ${S.be.demo ? `<button class="btn line" id="s-as">Demo: view as ${S.me.who === 'jaa' ? esc(name('kc')) : esc(name('jaa'))}</button>` : ''}
      <button class="btn danger" id="s-out">Sign out</button>
    </div>`, (b) => {
    b.querySelector('#s-code').onclick = () => { closeSheet(); renderSetPin(true); };
    b.querySelector('#s-sound').onclick = (e) => { const on = localStorage.getItem('ziggy-sound') === 'off'; localStorage.setItem('ziggy-sound', on ? 'on' : 'off'); e.target.textContent = `Sound: ${on ? 'on' : 'off'}`; if (on) thump(false); };
    b.querySelector('#s-backup').onclick = () => {
      const data = { exported: new Date().toISOString(), timeline: S.timeline, places: S.places, vouchers: S.vouchers, checkins: S.checkins };
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
