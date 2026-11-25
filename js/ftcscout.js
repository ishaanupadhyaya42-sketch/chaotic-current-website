/* Live team data from FTCScout (https://ftcscout.org), public GraphQL API.
   Renders into [data-ftcscout]: season tabs, OPR + world rank, record, events and awards. */
(() => {
  const root = document.querySelector('[data-ftcscout]');
  if (!root) return;
  const TEAM = +root.dataset.team;
  const API = 'https://api.ftcscout.org/graphql';
  const SITE = 'https://ftcscout.org';
  const CACHE_KEY = 'ftcscout-' + TEAM;
  const CACHE_MS = 10 * 60 * 1000;

  // FTC seasons are named by the year they start (2025 = 2025–26); a new one starts in September
  const now = new Date();
  const current = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const seasons = [current, current - 1];

  const $ = (sel) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = (s) => `${s}–${String(s + 1).slice(2)}`;
  const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function query(withStats) {
    const statsFrag = withStats
      ? `stats { ${seasons.map((s) => `... on TeamEventStats${s} { rank wins losses ties opr { totalPointsNp } }`).join(' ')} }`
      : '';
    const per = (s, i) => `
      q${i}: quickStats(season: ${s}) { tot { value rank } auto { value rank } dc { value rank } count }
      a${i}: awards(season: ${s}) { type placement eventCode }
      e${i}: events(season: ${s}) { eventCode ${statsFrag} event { name start end } }`;
    return `{ teamByNumber(number: ${TEAM}) { ${seasons.map(per).join(' ')} } }`;
  }

  async function fetchData() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < CACHE_MS) return c.d;
    } catch (e) { /* storage unavailable */ }
    let res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query(true) }) });
    let json = await res.json();
    // a season the API doesn't know stats for yet: retry without per-event stats
    if (json.errors) {
      res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query(false) }) });
      json = await res.json();
    }
    const d = json && json.data && json.data.teamByNumber;
    if (!d) throw new Error('no data');
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* ignore */ }
    return d;
  }

  function awardName(a) {
    if (a.type === 'Winner') return a.placement === 1 ? 'Winning Alliance Captain' : `Winning Alliance, ${ordinal(a.placement - 1)} pick`;
    if (a.type === 'Finalist') return a.placement === 1 ? 'Finalist Alliance Captain' : `Finalist Alliance, ${ordinal(a.placement - 1)} pick`;
    const name = a.type.replace(/([a-z])([A-Z])/g, '$1 $2') + ' Award';
    return a.placement > 1 ? `${name}, ${ordinal(a.placement)} place` : name;
  }

  function countUp(el, to, decimals) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toFixed(decimals); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function render(d, i) {
    const s = seasons[i], q = d['q' + i], events = (d['e' + i] || []).slice(), awards = d['a' + i] || [];
    const today = now.toISOString().slice(0, 10);
    const rows = events
      .filter((e) => e.stats || e.event.start >= today) // skip parent events of divisions and events not played
      .sort((a, b) => a.event.start.localeCompare(b.event.start));
    const played = rows.filter((e) => e.stats);
    const W = played.reduce((n, e) => n + e.stats.wins, 0), L = played.reduce((n, e) => n + e.stats.losses, 0), T = played.reduce((n, e) => n + e.stats.ties, 0);
    const next = rows.find((e) => !e.stats && e.event.start >= today);
    const names = Object.fromEntries(events.map((e) => [e.eventCode, e.event.name]));

    const tile = (k, v, r, dec = 1) => `
      <div class="live__tile">
        <span class="label">${k}</span>
        <b data-count="${v != null ? v : ''}" data-dec="${dec}">${v != null ? '0' : '–'}</b>
        <span class="live__sub">${r || '&nbsp;'}</span>
      </div>`;
    const rankLine = (x) => (x && q ? `#${x.rank.toLocaleString()} of ${q.count.toLocaleString()} · top ${Math.max(1, Math.ceil((x.rank / q.count) * 100))}%` : '');

    $('.live__stats').innerHTML =
      tile('Total OPR', q ? q.tot.value : null, rankLine(q && q.tot)) +
      tile('Auto OPR', q ? q.auto.value : null, rankLine(q && q.auto)) +
      tile('Teleop OPR', q ? q.dc.value : null, rankLine(q && q.dc)) +
      `<div class="live__tile"><span class="label">Record</span><b>${played.length ? `${W}–${L}${T ? '–' + T : ''}` : '–'}</b><span class="live__sub">${played.length ? `${played.length} event${played.length > 1 ? 's' : ''} played` : 'No matches yet'}${next ? ` · next ${fmtDate(next.event.start)}` : ''}</span></div>`;

    $('.live__events tbody').innerHTML = rows.length ? rows.map((e) => {
      const st = e.stats, url = `${SITE}/events/${s}/${e.eventCode}`;
      return `<tr class="${st ? '' : 'is-upcoming'}">
        <td class="live__date">${fmtDate(e.event.start)}</td>
        <td><a class="link" href="${url}" target="_blank" rel="noopener">${esc(e.event.name)}</a></td>
        ${st ? `<td>#${st.rank}</td><td>${st.wins}–${st.losses}${st.ties ? '–' + st.ties : ''}</td><td>${st.opr ? st.opr.totalPointsNp.toFixed(1) : '–'}</td>`
             : '<td colspan="3"><span class="chip">Upcoming</span></td>'}
      </tr>`;
    }).join('') : '<tr><td colspan="5">No events listed yet.</td></tr>';

    $('.live__awards').innerHTML = awards.length
      ? awards.map((a) => `<li><b>${esc(awardName(a))}</b><span>${esc(names[a.eventCode] || a.eventCode)}</span></li>`).join('')
      : '<li class="is-empty"><b>No awards yet this season</b><span>Check back after the next event.</span></li>';

    root.querySelectorAll('[data-count]').forEach((el) => { if (el.dataset.count !== '') countUp(el, +el.dataset.count, +el.dataset.dec); });
    root.querySelectorAll('.live__tab').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  }

  // tabs
  $('.live__tabs').innerHTML = seasons.map((s, i) => `<button type="button" role="tab" class="live__tab" aria-selected="${i === 0}">${label(s)}</button>`).join('');

  root.classList.add('is-loading');
  fetchData().then((d) => {
    root.classList.remove('is-loading'); root.classList.add('is-live');
    const sec = root.closest('section'); if (sec) sec.classList.add('is-live-data');
    // open on the newest season that has played matches
    let start = 0;
    if (!d.q0 && d.q1) start = 1;
    render(d, start);
    root.querySelectorAll('.live__tab').forEach((b, i) => b.addEventListener('click', () => render(d, i)));
    const t = $('[data-updated]'); if (t) t.textContent = 'just now';
  }).catch(() => {
    root.classList.remove('is-loading'); root.classList.add('is-failed');
  });
})();
