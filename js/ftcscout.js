/* Live team data from FTCScout (https://ftcscout.org), public GraphQL API.
   Renders into [data-ftcscout] the way a stats site does: season tabs, an OPR table with world ranks,
   then every event with its full match table (red and blue alliances, scores, result) and the awards. */
(() => {
  const root = document.querySelector('[data-ftcscout]');
  if (!root) return;
  const TEAM = +root.dataset.team;
  const API = 'https://api.ftcscout.org/graphql';
  const SITE = 'https://ftcscout.org';
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
  const f1 = (v) => (v == null ? '–' : v.toFixed(1));
  const post = (query) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }).then((r) => r.json());

  async function cached(key, make) {
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < CACHE_MS) return c.d;
    } catch (e) { /* storage unavailable */ }
    const d = await make();
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* ignore */ }
    return d;
  }

  // one request per season: the API drops scores when two seasons share one query
  function loadSeason(s) {
    return cached(`ftcscout-v5-${TEAM}-${s}`, async () => {
      const q = `{ teamByNumber(number: ${TEAM}) {
        quickStats(season: ${s}) { tot { value rank } auto { value rank } dc { value rank } eg { value rank } count }
        awards(season: ${s}) { type placement eventCode }
        events(season: ${s}) { eventCode event { name start }
          stats { ... on TeamEventStats${s} { rank rp wins losses ties opr { totalPointsNp } avg { totalPointsNp } } }
          matches { alliance match { matchNum series tournamentLevel hasBeenPlayed
            scores { ... on MatchScores${s} { red { totalPoints } blue { totalPoints } } }
            teams { teamNumber alliance team { name } } } } } } }`;
      const json = await post(q);
      const d = json && json.data && json.data.teamByNumber;
      if (!d) throw new Error('no data');
      return d;
    });
  }

  function awardName(a) {
    if (a.type === 'Winner') return a.placement === 1 ? 'Winning Alliance Captain' : `Winning Alliance, ${ordinal(a.placement - 1)} pick`;
    if (a.type === 'Finalist') return a.placement === 1 ? 'Finalist Alliance Captain' : `Finalist Alliance, ${ordinal(a.placement - 1)} pick`;
    const name = a.type.replace(/([a-z])([A-Z])/g, '$1 $2') + ' Award';
    return a.placement > 1 ? `${name}, ${ordinal(a.placement)} place` : name;
  }

  const LEVEL = { Quals: 'Q', DoubleElim: 'P', Semis: 'SF', Finals: 'F' };

  const teamCell = (teams) => teams.map((t) =>
    `<span class="fs-team${t.teamNumber === TEAM ? ' is-us' : ''}"><a href="${SITE}/teams/${t.teamNumber}" target="_blank" rel="noopener">${t.teamNumber}</a>`
    + `<em>${esc(t.team ? t.team.name : '')}</em></span>`).join('');

  function matchTable(list) {
    const played = (list || []).filter((m) => m.match && m.match.hasBeenPlayed && m.match.scores && m.match.scores.red);
    if (!played.length) return '';
    const order = (m) => (m.match.tournamentLevel === 'Quals' ? 0 : 1) * 1e4 + m.match.matchNum;
    const rows = played.sort((a, b) => order(a) - order(b)).map((m) => {
      const x = m.match, r = x.scores.red.totalPoints, b = x.scores.blue.totalPoints;
      const ours = m.alliance === 'Red' ? r : b, theirs = m.alliance === 'Red' ? b : r;
      const res = ours > theirs ? 'W' : ours < theirs ? 'L' : 'T';
      const side = (a) => x.teams.filter((t) => t.alliance === a);
      return `<tr>
        <td class="fs-m">${LEVEL[x.tournamentLevel] || ''}${x.matchNum}</td>
        <td class="fs-red">${teamCell(side('Red'))}</td>
        <td class="fs-score fs-red${r > b ? ' is-win' : ''}">${r}</td>
        <td class="fs-score fs-blue${b > r ? ' is-win' : ''}">${b}</td>
        <td class="fs-blue">${teamCell(side('Blue'))}</td>
        <td class="fs-res is-${res}">${res}</td>
      </tr>`;
    }).join('');
    return `<div class="fs-scroll"><table class="fs-matches">
      <thead><tr><th>Match</th><th>Red alliance</th><th colspan="2">Score</th><th>Blue alliance</th><th><span class="sr">Result</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function render(s, d) {
    const q = d.quickStats, awards = d.awards || [];
    const today = now.toISOString().slice(0, 10);
    const events = (d.events || [])
      .filter((e) => e.stats || e.event.start >= today) // skip parent events of divisions and events not played
      .sort((a, b) => a.event.start.localeCompare(b.event.start));
    const names = Object.fromEntries((d.events || []).map((e) => [e.eventCode, e.event.name]));
    const played = events.filter((e) => e.stats);
    const sum = (k) => played.reduce((n, e) => n + e.stats[k], 0);
    const W = sum('wins'), L = sum('losses'), T = sum('ties');

    // quick stats
    const cell = (x) => (x ? `<td><b>${f1(x.value)}</b><small>#${x.rank.toLocaleString()}</small></td>` : '<td>–</td>');
    $('.fs-quick').innerHTML = q ? `
      <thead><tr><th></th><th>Total NP</th><th>Auto</th><th>Teleop</th><th>Endgame</th><th>Record</th></tr></thead>
      <tbody><tr><th scope="row">Best OPR<small>World rank of ${q.count.toLocaleString()}</small></th>${cell(q.tot)}${cell(q.auto)}${cell(q.dc)}${cell(q.eg)}
        <td><b>${played.length ? `${W}–${L}${T ? '–' + T : ''}` : '–'}</b><small>${played.length} event${played.length === 1 ? '' : 's'}</small></td></tr></tbody>`
      : '<tbody><tr><td>No matches played yet this season.</td></tr></tbody>';

    // events with match tables
    $('.fs-events').innerHTML = events.length ? events.map((e) => {
      const st = e.stats, url = `${SITE}/events/${s}/${e.eventCode}`;
      const meta = st
        ? `<span>Rank <b>${st.rank}</b></span><span>W-L-T <b>${st.wins}-${st.losses}-${st.ties}</b></span><span>RP <b>${st.rp != null ? st.rp.toFixed(2) : '–'}</b></span><span>OPR <b>${f1(st.opr && st.opr.totalPointsNp)}</b></span><span>Avg <b>${f1(st.avg && st.avg.totalPointsNp)}</b></span>`
        : '<span class="fs-up">Upcoming</span>';
      return `<article class="fs-ev${st ? '' : ' is-upcoming'}">
        <header><time datetime="${e.event.start}">${fmtDate(e.event.start)}</time><h3><a href="${url}" target="_blank" rel="noopener">${esc(e.event.name)}</a></h3><p class="fs-meta">${meta}</p></header>
        ${st ? matchTable(e.matches) : ''}
      </article>`;
    }).join('') : '<p class="fs-none">No events listed yet.</p>';

    // awards
    const aw = $('.fs-awards');
    aw.hidden = !awards.length;
    aw.innerHTML = awards.length ? `<h3>Awards</h3><ul>${awards.map((a) => `<li><b>${esc(awardName(a))}</b><span>${esc(names[a.eventCode] || a.eventCode)}</span></li>`).join('')}</ul>` : '';
  }

  // tabs
  $('.live__seasons').innerHTML = seasons.map((s, i) => `<button type="button" role="tab" class="live__tab" aria-selected="${i === 0}">${label(s)}</button>`).join('');
  const tabs = [...root.querySelectorAll('.live__tab')];

  function show(i) {
    tabs.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    root.classList.add('is-loading');
    return loadSeason(seasons[i]).then((d) => {
      root.classList.remove('is-loading', 'is-failed'); root.classList.add('is-live');
      render(seasons[i], d);
      return d;
    }).catch(() => { root.classList.remove('is-loading'); root.classList.add('is-failed'); });
  }
  tabs.forEach((b, i) => b.addEventListener('click', () => show(i)));

  // open on the newest season that has played matches
  show(0).then((d) => { if (d && !d.quickStats && seasons.length > 1) show(1); });
})();
