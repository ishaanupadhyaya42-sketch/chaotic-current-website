/* Live team data from FTCScout (https://ftcscout.org), public GraphQL API.
   Renders into [data-ftcscout] as plain sentences: record, OPR and world rank, then the events and awards. */
(() => {
  const root = document.querySelector('[data-ftcscout]');
  if (!root) return;
  const TEAM = +root.dataset.team;
  const API = 'https://api.ftcscout.org/graphql';
  const SITE = 'https://ftcscout.org';
  const CACHE_KEY = 'ftcscout-v4-' + TEAM;
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

  // matches are fetched per season when an event is opened: one season per request
  const seasonMatches = {};
  function loadMatches(season) {
    if (!seasonMatches[season]) {
      const q = `{ teamByNumber(number: ${TEAM}) { events(season: ${season}) { eventCode
        matches { alliance match { matchNum series tournamentLevel hasBeenPlayed
          scores { ... on MatchScores${season} { red { totalPoints } blue { totalPoints } } }
          teams { teamNumber alliance team { name } } } } } } }`;
      seasonMatches[season] = fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })
        .then((r) => r.json())
        .then((j) => Object.fromEntries(j.data.teamByNumber.events.map((e) => [e.eventCode, e.matches])))
        .catch((err) => { delete seasonMatches[season]; throw err; });
    }
    return seasonMatches[season];
  }

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

  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const num = (n) => words[n] || String(n);
  const rec = (st) => `${st.wins}–${st.losses}${st.ties ? '–' + st.ties : ''}`;

  const LEVEL = { Quals: 'Q', DoubleElim: 'Playoff ', Semis: 'Semi ', Finals: 'Final ' };
  const teamName = (t) => esc(t.team ? t.team.name : String(t.teamNumber));

  function matchLines(list) {
    const played = (list || []).filter((m) => m.match && m.match.hasBeenPlayed && m.match.scores && m.match.scores.red);
    if (!played.length) return '';
    const order = (m) => (m.match.tournamentLevel === 'Quals' ? 0 : 1) * 1e4 + m.match.matchNum;
    return played.sort((a, b) => order(a) - order(b)).map((m) => {
      const x = m.match, us = m.alliance === 'Red' ? 'red' : 'blue', them = us === 'red' ? 'blue' : 'red';
      const a = x.scores[us].totalPoints, b = x.scores[them].totalPoints;
      const res = a > b ? 'Won' : a < b ? 'Lost' : 'Tied';
      const partners = x.teams.filter((t) => t.alliance === m.alliance && t.teamNumber !== TEAM).map(teamName);
      const opp = x.teams.filter((t) => t.alliance !== m.alliance).map(teamName);
      return `<li class="is-${res.toLowerCase()}"><span class="live__m">${LEVEL[x.tournamentLevel] || ''}${x.matchNum}</span>`
        + `<span class="live__res">${res} ${a}–${b}</span>`
        + `<span class="live__who">${partners.length ? `with ${partners.join(', ')} ` : ''}<em>vs ${opp.join(', ')}</em></span></li>`;
    }).join('');
  }

  function render(d, i) {
    const s = seasons[i], q = d['q' + i], events = (d['e' + i] || []).slice(), awards = d['a' + i] || [];
    const today = now.toISOString().slice(0, 10);
    const rows = events
      .filter((e) => e.stats || e.event.start >= today) // skip parent events of divisions and events not played
      .sort((a, b) => a.event.start.localeCompare(b.event.start));
    const played = rows.filter((e) => e.stats);
    const upcoming = rows.filter((e) => !e.stats);
    const sum = (k) => played.reduce((n, e) => n + e.stats[k], 0);
    const W = sum('wins'), L = sum('losses'), T = sum('ties');
    const names = Object.fromEntries(events.map((e) => [e.eventCode, e.event.name]));

    let line;
    if (!played.length) {
      line = upcoming.length
        ? `No matches yet. First up: ${esc(upcoming[0].event.name)} on ${fmtDate(upcoming[0].event.start)}.`
        : 'No matches yet this season.';
    } else {
      const ev = `${num(played.length)} event${played.length > 1 ? 's' : ''}`;
      line = upcoming.length
        ? `We&rsquo;re <b>${W}–${L}${T ? '–' + T : ''}</b> after ${ev}.`
        : `We went <b>${W}–${L}${T ? '–' + T : ''}</b> across ${ev}.`;
      if (q) {
        const pct = Math.max(1, Math.ceil((q.tot.rank / q.count) * 100));
        line += ` Our OPR of <b>${q.tot.value.toFixed(1)}</b> ${upcoming.length ? 'puts' : 'put'} us in the top <b>${pct}%</b> of ${q.count.toLocaleString()} teams worldwide.`;
      }
    }
    $('.live__line').innerHTML = line;

    $('.live__list').innerHTML = rows.map((e) => {
      const st = e.stats, url = `${SITE}/events/${s}/${e.eventCode}`;
      const head = `<time datetime="${e.event.start}">${fmtDate(e.event.start)}</time>`
        + `<b>${esc(e.event.name)}</b>`
        + `<span>${st ? `${ordinal(st.rank)} · ${rec(st)}` : 'Upcoming'}</span>`;
      if (!st) return `<li class="${st ? '' : 'is-upcoming'}"><a class="live__row" href="${url}" target="_blank" rel="noopener">${head}</a></li>`;
      return `<li><details data-season="${s}" data-event="${e.eventCode}"><summary class="live__row">${head}<i aria-hidden="true"></i></summary>`
        + `<ol class="live__matches"><li class="live__wait">Loading matches&hellip;</li></ol>`
        + `<a class="link live__ev" href="${url}" target="_blank" rel="noopener">This event on FTCScout &nearr;</a></details></li>`;
    }).join('');

    root.querySelectorAll('.live__list details').forEach((det) => det.addEventListener('toggle', () => {
      if (!det.open || det.dataset.loaded) return;
      const ol = det.querySelector('.live__matches');
      loadMatches(det.dataset.season).then((map) => {
        det.dataset.loaded = '1';
        ol.innerHTML = matchLines(map[det.dataset.event]) || '<li class="live__wait">No match scores posted.</li>';
      }).catch(() => { ol.innerHTML = '<li class="live__wait">FTCScout didn&rsquo;t answer. Try again in a moment.</li>'; });
    }));

    const aw = $('.live__awards');
    aw.hidden = !awards.length;
    aw.innerHTML = awards.map((a) => `<b>${esc(awardName(a))}</b> at ${esc(names[a.eventCode] || a.eventCode)}`).join('. ') + (awards.length ? '.' : '');

    root.querySelectorAll('.live__tab').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  }

  // tabs
  $('.live__seasons').innerHTML = seasons.map((s, i) => `<button type="button" role="tab" class="live__tab" aria-selected="${i === 0}">${label(s)}</button>`).join('');

  root.classList.add('is-loading');
  fetchData().then((d) => {
    root.classList.remove('is-loading'); root.classList.add('is-live');
    // open on the newest season that has played matches
    let start = 0;
    if (!d.q0 && d.q1) start = 1;
    render(d, start);
    root.querySelectorAll('.live__tab').forEach((b, i) => b.addEventListener('click', () => render(d, i)));
  }).catch(() => {
    root.classList.remove('is-loading'); root.classList.add('is-failed');
  });
})();
