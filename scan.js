/* ============================================================
   Redact — scan & clean client
   ------------------------------------------------------------
   Talks to the scanning engine (REDACT_API_BASE) if one is
   configured. If not, or if it can't be reached, the whole
   Step 2 panel falls back to a friendly "use the guided list"
   note — the app never breaks.

   Contract with the server (see /server):
     GET  /health        -> { ok, brokers:[{id,name,scan,submit}] }
     POST /scan   {info}  -> { job_id }
     POST /clean  {job_id, broker_ids, info} -> { job_id }
     GET  /jobs/{id}      -> { kind, status, progress, results:[
                                {broker_id,name,state,listing_url?,message?} ] }
   ============================================================ */

(function () {
  const API = (window.REDACT_API_BASE || '').replace(/\/$/, '');
  const el = (id) => document.getElementById(id);

  // wire the "view source" link from config
  const src = el('src-link');
  if (src && window.REDACT_REPO_URL) src.href = window.REDACT_REPO_URL;

  const nodes = {
    engineNote: el('scan-engine-note'),
    face: el('scan-face'),
    title: el('scan-title'),
    sub: el('scan-sub'),
    scanBtn: el('scan-btn'),
    progress: el('scan-progress'),
    status: el('scan-status'),
    fill: el('scan-fill'),
    findings: el('findings'),
    cta: el('scan-cta'),
    cleanBtn: el('clean-btn'),
    rescanBtn: el('rescan-btn'),
    offline: el('scan-offline'),
  };

  let engineReady = false;
  let lastScanJob = null;
  let exposedIds = [];

  /* ---------- helpers shared with app.js ---------- */
  function getInfo() {
    const g = (id) => (document.getElementById(id)?.value || '').trim();
    return {
      name: g('f-name'), address: g('f-address'), city: g('f-city'),
      state: g('f-state'), phone: g('f-phone'), email: g('f-email'),
    };
  }
  function hasEnoughInfo(i) { return i.name && (i.city || i.state || i.address); }

  /* ---------- engine availability ---------- */
  async function checkEngine() {
    if (!API) { setOffline('guided'); return; }
    try {
      const res = await fetch(API + '/health', { method: 'GET' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      engineReady = !!data.ok;
      if (engineReady) {
        nodes.engineNote.textContent = 'scanner ready';
        nodes.engineNote.classList.add('ok');
      } else { setOffline('guided'); }
    } catch {
      setOffline('unreachable');
    }
  }

  function setOffline(reason) {
    engineReady = false;
    nodes.engineNote.textContent = reason === 'unreachable' ? 'scanner offline' : 'guided mode';
    nodes.face.hidden = true;
    nodes.offline.hidden = false;
  }

  /* ---------- scan ---------- */
  async function startScan() {
    const info = getInfo();
    if (!hasEnoughInfo(info)) {
      toast('Add at least your name and city up in Step 1');
      document.getElementById('info').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    nodes.face.hidden = true;
    nodes.offline.hidden = true;
    nodes.cta.hidden = true;
    nodes.findings.hidden = true;
    nodes.findings.innerHTML = '';
    nodes.progress.hidden = false;
    setStatus('Starting scan…', 4);

    try {
      const res = await fetch(API + '/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info }),
      });
      if (!res.ok) throw new Error('scan start failed');
      const { job_id } = await res.json();
      lastScanJob = job_id;
      await pollJob(job_id, renderScanProgress, onScanDone);
    } catch (e) {
      failScan();
    }
  }

  function renderScanProgress(job) {
    setStatus(
      job.progress >= 100 ? 'Finishing up…'
        : `Scanning brokers… ${job.progress || 0}%`,
      job.progress || 6
    );
    paintFindings(job.results || [], 'scan');
  }

  function onScanDone(job) {
    paintFindings(job.results || [], 'scan');
    nodes.progress.hidden = true;
    exposedIds = (job.results || [])
      .filter((r) => r.state === 'exposed')
      .map((r) => r.broker_id);

    const exposed = exposedIds.length;
    const checked = (job.results || []).length;
    if (exposed > 0) {
      setStatus('', 100);
      nodes.cta.hidden = false;
      nodes.cleanBtn.textContent =
        `Clean ${exposed} exposed record${exposed === 1 ? '' : 's'}`;
      toast(`Found on ${exposed} of ${checked} sites`);
    } else {
      nodes.findings.hidden = false;
      showAllClear(checked);
      nodes.cta.hidden = false;
      nodes.cleanBtn.hidden = true;
    }
  }

  /* ---------- clean ---------- */
  async function startClean() {
    if (!lastScanJob || !exposedIds.length) return;
    nodes.cta.hidden = true;
    nodes.progress.hidden = false;
    setStatus('Sending removal requests…', 6);

    try {
      const res = await fetch(API + '/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: lastScanJob,
          broker_ids: exposedIds,
          info: getInfo(),
        }),
      });
      if (!res.ok) throw new Error('clean start failed');
      const { job_id } = await res.json();
      await pollJob(job_id, renderCleanProgress, onCleanDone);
    } catch {
      setStatus('Something interrupted the cleanup. You can try again, or use the guided list below.', 100);
    }
  }

  function renderCleanProgress(job) {
    setStatus(`Removing… ${job.progress || 0}%`, job.progress || 6);
    paintFindings(job.results || [], 'clean');
  }

  function onCleanDone(job) {
    paintFindings(job.results || [], 'clean');
    nodes.progress.hidden = true;
    nodes.cta.hidden = false;
    nodes.cleanBtn.hidden = true;

    // reflect submitted removals in the guided list's progress
    (job.results || []).forEach((r) => {
      if (r.state === 'submitted' && window.RedactStatus) {
        window.RedactStatus.markDone(r.broker_id);
      }
    });

    const needs = (job.results || []).filter((r) => r.state === 'needs_you');
    if (needs.length) {
      toast(`${needs.length} need a quick confirmation from you`);
    } else {
      toast('Removal requests sent');
    }
  }

  /* ---------- shared rendering ---------- */
  function paintFindings(results, kind) {
    if (!results.length) return;
    nodes.findings.hidden = false;
    nodes.findings.innerHTML = '';
    results.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'finding ' + stateClass(r.state);
      const right = stateLabel(r.state);
      li.innerHTML = `
        <div class="f-main">
          <span class="f-name">${esc(r.name || r.broker_id)}</span>
          ${r.listing_url ? `<a class="f-link" href="${esc(r.listing_url)}" target="_blank" rel="noopener">view listing</a>` : ''}
          ${r.message ? `<span class="f-msg">${esc(r.message)}</span>` : ''}
        </div>
        <span class="f-state">${right}</span>`;
      nodes.findings.appendChild(li);
    });
  }

  function showAllClear(checked) {
    nodes.findings.innerHTML =
      `<li class="finding clear"><div class="f-main"><span class="f-name">No listings found</span>
       <span class="f-msg">Checked ${checked} broker${checked === 1 ? '' : 's'} — nothing matched your info.</span></div>
       <span class="f-state">CLEAR</span></li>`;
  }

  function stateClass(s) {
    return ({
      checking: 'checking', exposed: 'exposed', clear: 'clear',
      submitting: 'checking', submitted: 'done', needs_you: 'needs',
      error: 'err',
    })[s] || 'checking';
  }
  function stateLabel(s) {
    return ({
      checking: 'CHECKING…', exposed: 'EXPOSED', clear: 'CLEAR',
      submitting: 'SENDING…', submitted: 'REDACTED', needs_you: 'NEEDS YOU',
      error: 'RETRY',
    })[s] || '…';
  }

  function failScan() {
    nodes.progress.hidden = true;
    setOffline('unreachable');
    nodes.face.hidden = true;
    nodes.offline.hidden = false;
  }

  /* ---------- polling ---------- */
  async function pollJob(id, onTick, onDone) {
    let tries = 0;
    while (tries < 400) {
      let job;
      try {
        const res = await fetch(`${API}/jobs/${id}`);
        if (!res.ok) throw new Error('job read failed');
        job = await res.json();
      } catch {
        throw new Error('lost connection');
      }
      onTick(job);
      if (job.status === 'done') { onDone(job); return; }
      if (job.status === 'error') { throw new Error(job.message || 'job error'); }
      await sleep(1500);
      tries++;
    }
    throw new Error('timed out');
  }

  /* ---------- small utils ---------- */
  function setStatus(text, pct) {
    if (text !== '') nodes.status.textContent = text;
    if (typeof pct === 'number') nodes.fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function toast(msg) {
    if (window.RedactToast) return window.RedactToast(msg);
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(window.__rt); window.__rt = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- wire up ---------- */
  if (nodes.scanBtn) nodes.scanBtn.addEventListener('click', startScan);
  if (nodes.rescanBtn) nodes.rescanBtn.addEventListener('click', startScan);
  if (nodes.cleanBtn) nodes.cleanBtn.addEventListener('click', startClean);

  checkEngine();
})();
