/* ============================================================
   Redact — client-only logic. No network calls except loading
   the local brokers.json. All user data lives in localStorage.
   ============================================================ */

const STORE_INFO = 'redact.info.v1';
const STORE_STATUS = 'redact.status.v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const els = {
  list: $('#broker-list'),
  chips: $('#chips'),
  meta: $('#broker-meta'),
  fill: $('#fill'),
  pct: $('#pct'),
  count: $('#count'),
  toast: $('#toast'),
  clear: $('#clear'),
};

const infoFields = ['name', 'address', 'city', 'state', 'phone', 'email'];
let brokers = [];
let status = loadJSON(STORE_STATUS, {});   // { brokerId: true } when done
let activeFilter = 'all';

/* ---------- storage helpers ---------- */
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* ---------- user info ---------- */
function loadInfo() {
  const info = loadJSON(STORE_INFO, {});
  infoFields.forEach((k) => {
    const el = $('#f-' + k);
    if (el && info[k]) el.value = info[k];
  });
}
function getInfo() {
  const info = {};
  infoFields.forEach((k) => { info[k] = ($('#f-' + k)?.value || '').trim(); });
  return info;
}
function wireInfo() {
  infoFields.forEach((k) => {
    const el = $('#f-' + k);
    if (el) el.addEventListener('input', () => {
      saveJSON(STORE_INFO, getInfo());
      if (brokers.length) renderList(); // keep tap-to-fill chips current
    });
  });
}

/* ---------- email template ---------- */
function buildMailto(broker) {
  const i = getInfo();
  const nameLine = i.name || '[your full name]';
  const loc = [i.address, [i.city, i.state].filter(Boolean).join(', ')]
    .filter(Boolean).join(', ') || '[your address]';

  const subject = `Data deletion and opt-out request — ${nameLine}`;
  const body =
`To the Privacy Team,

I am requesting that you delete all personal information you hold about me, and opt me out of any sale or sharing of that information, under applicable privacy laws.

My details for matching your records:
  Name:    ${nameLine}
  Address: ${loc}
  Phone:   ${i.phone || '[your phone]'}
  Email:   ${i.email || '[your email]'}

Please confirm in writing once my information has been deleted and suppressed so it is not re-collected. If any information cannot be deleted, tell me which records and the specific legal basis for retaining them.

Thank you,
${nameLine}`;

  return `mailto:${broker.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ---------- rendering ---------- */
function categories() {
  return ['all', ...new Set(brokers.map((b) => b.category))];
}

function renderChips() {
  els.chips.innerHTML = '';
  categories().forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = cat === 'all' ? 'All' : cat;
    btn.setAttribute('aria-pressed', String(cat === activeFilter));
    btn.addEventListener('click', () => { activeFilter = cat; renderChips(); renderList(); });
    els.chips.appendChild(btn);
  });
}

function renderList() {
  els.list.innerHTML = '';
  const shown = brokers.filter((b) => activeFilter === 'all' || b.category === activeFilter);

  shown.forEach((b) => {
    const done = !!status[b.id];
    const card = document.createElement('div');
    card.className = 'broker' + (done ? ' done' : '');

    const actionLabel =
      b.method === 'email' ? 'Compose email' :
      b.method === 'drop'  ? 'Open DROP' : 'Open form';
    const actionHref = b.method === 'email' ? buildMailto(b) : b.url;
    const target = b.method === 'email' ? '_self' : '_blank';

    card.innerHTML = `
      <div class="top">
        <div>
          <div class="name">${escapeHTML(b.name)}</div>
          <div class="cat">${escapeHTML(b.category)} · ${b.method}</div>
        </div>
        <div class="status">${done ? 'Redacted' : 'Exposed'}</div>
      </div>
      <p class="notes">${escapeHTML(b.notes || '')}</p>
      <div class="row">
        <a class="btn small" data-open href="${actionHref}" target="${target}" rel="noopener">${actionLabel}</a>
        <button class="btn ghost small" data-toggle>${done ? 'Mark exposed' : 'Mark redacted'}</button>
      </div>
    `;

    // rebuild mailto live at click time so latest info is used
    const openLink = $('[data-open]', card);
    if (b.method === 'email') {
      openLink.addEventListener('click', () => { openLink.href = buildMailto(b); });
    }

    // Tap-to-fill: for form brokers, offer one-tap copy of each saved field so
    // the visitor pastes instead of retyping. (A web page can't fill another
    // site's form directly, so copy-then-paste is the honest client-side path.)
    if (b.method === 'form') {
      const i = getInfo();
      const parts = [
        ['name', 'name', i.name],
        ['address', 'address', [i.address, [i.city, i.state].filter(Boolean).join(', ')].filter(Boolean).join(', ')],
        ['phone', 'phone', i.phone],
        ['email', 'email', i.email],
      ].filter(([, , v]) => v);

      if (parts.length) {
        const fillRow = document.createElement('div');
        fillRow.className = 'fill-row';
        const tag = document.createElement('span');
        tag.className = 'fill-tag';
        tag.textContent = 'Tap to copy → paste on their form:';
        fillRow.appendChild(tag);
        parts.forEach(([, label, value]) => {
          const chip = document.createElement('button');
          chip.className = 'chip fill';
          chip.textContent = label;
          chip.addEventListener('click', () => copyText(value, label));
          fillRow.appendChild(chip);
        });
        card.appendChild(fillRow);
      } else {
        const tip = document.createElement('p');
        tip.className = 'fill-empty';
        tip.textContent = 'Add your info up top to get one-tap fill for this form.';
        card.appendChild(tip);
      }
    }

    $('[data-toggle]', card).addEventListener('click', () => {
      if (status[b.id]) delete status[b.id]; else status[b.id] = true;
      saveJSON(STORE_STATUS, status);
      renderList();
      updateProgress();
      if (status[b.id]) toast(`${b.name} marked redacted`);
    });

    els.list.appendChild(card);
  });

  els.meta.textContent = `${brokers.length} total`;
}

function updateProgress() {
  const total = brokers.length || 1;
  const done = brokers.filter((b) => status[b.id]).length;
  const pct = Math.round((done / total) * 100);
  els.fill.style.width = pct + '%';
  els.pct.textContent = pct;
  els.count.textContent = `${done} of ${brokers.length}`;
}

/* ---------- utilities ---------- */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function copyText(value, label) {
  const done = () => toast(`${label} copied — paste it on their form`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, done));
  } else {
    fallbackCopy(value, done);
  }
}
function fallbackCopy(value, done) {
  const ta = document.createElement('textarea');
  ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch {}
  document.body.removeChild(ta);
}
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

/* ---------- boot ---------- */
async function init() {
  loadInfo();
  wireInfo();

  els.clear.addEventListener('click', () => {
    if (!confirm('Erase your saved info and progress from this device?')) return;
    localStorage.removeItem(STORE_INFO);
    localStorage.removeItem(STORE_STATUS);
    status = {};
    infoFields.forEach((k) => { const el = $('#f-' + k); if (el) el.value = ''; });
    renderList(); updateProgress(); toast('Erased from this device');
  });

  try {
    const res = await fetch('data/brokers.json', { cache: 'no-cache' });
    const data = await res.json();
    brokers = data.brokers || [];
  } catch (e) {
    els.meta.textContent = 'could not load catalog';
    els.list.innerHTML = '<p class="hint">The broker list failed to load. If you opened this file directly, run it from a web server or your published site instead.</p>';
    return;
  }

  renderChips();
  renderList();
  updateProgress();
}

/* ---------- hooks shared with scan.js ---------- */
window.RedactToast = toast;
window.RedactStatus = {
  markDone(id) {
    if (!id || status[id]) return;
    status[id] = true;
    saveJSON(STORE_STATUS, status);
    renderList();
    updateProgress();
  },
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
