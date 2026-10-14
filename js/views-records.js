// Records page: the dynasty's record book.

import { ctx, app, $$, esc, team } from './ui.js?v=20261014163557';
import { recordBook, top, pollRecords } from './records.js?v=20261014163557';
import { coachName, weekName } from './league.js?v=20261014163557';
import { fmtPct } from './util.js?v=20261014163557';

const ui = { programSort: 'w', pollSort: 'ranked' };

const POLL_COLS = [
  ['ranked', 'Polls ranked', 'Polls the team appeared in, preseason and final included'], ['at1', 'Polls at #1', ''], ['streak', 'Longest ranked run', 'Most polls in a row ranked, across seasons'],
  ['pre1', 'Preseason #1', ''], ['final1', 'Final #1', ''], ['top5', 'Final top 5', ''], ['top10', 'Final top 10', ''],
  ['vsRanked', 'Wins vs ranked', 'Ranks from the poll in effect at game time'], ['vsTop5', 'Wins vs top 5', ''], ['vs1', 'Wins vs #1', ''], ['fp', '1st-place votes', ''],
];

const PROGRAM_COLS = [
  ['seasons', 'Seasons'], ['w', 'Wins'], ['pct', 'Pct'], ['reg', 'Reg. season titles'], ['conf', 'Tournament titles'],
  ['ncaa', 'NCAA'], ['mcws', 'Nat. Championships'], ['titles', 'National titles'],
];

export function renderRecords() {
  const L = ctx.league, B = recordBook(L);
  if (!B.seasons.length) { app.innerHTML = '<div class="section-head"><h1>Records</h1></div><div class="empty">The record book fills in once games are played.</div>'; return; }
  const yr = x => `${x.year}${x.done ? '' : '*'}`;
  const tm = t => team(t, { rank: false, size: 16 });
  const inProgress = B.seasons.some(x => !x.done);

  // Program leaders, sortable.
  const progs = B.programs.map(p => ({ ...p, pct: p.w + p.l ? p.w / (p.w + p.l) : 0 }));
  const key = ui.programSort;
  progs.sort((a, b) => b[key] - a[key] || b.w - a.w || a.team.localeCompare(b.team));
  const programs = `<div class="card"><h2>Programs · all-time</h2>
    <div class="table-wrap"><table class="rec-table"><thead><tr><th></th><th>Team</th>${PROGRAM_COLS.map(([k, l]) => `<th class="num sortable ${k === key ? 'sorted' : ''}" data-psort="${k}" title="Sort by ${esc(l)}">${esc(l)}</th>`).join('')}<th class="num">W–L</th></tr></thead>
    <tbody>${progs.map((p, i) => `<tr><td class="num muted">${i + 1}</td><td>${tm(p.team)}</td><td class="num">${p.seasons}</td><td class="num">${p.w}</td><td class="num">${fmtPct(p.pct)}</td><td class="num">${p.reg || ''}</td><td class="num">${p.conf || ''}</td><td class="num">${p.ncaa || ''}</td><td class="num">${p.mcws || ''}</td><td class="num">${p.titles ? `<b>${p.titles}</b>` : ''}</td><td class="num muted">${p.w}–${p.l}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Click a column to sort. Totals include the postseason.</p></div>`;

  // A small top-5 list.
  const board = (title, list, value, sub = () => '') => `<div class="card rec-card"><h3>${esc(title)}</h3>${list.length ? `<ol class="rec-list">${list.map(x => `<li><span class="rec-who">${x.team ? tm(x.team) : x.who}<span class="small muted">${sub(x)}</span></span><b class="rec-val">${value(x)}</b></li>`).join('')}</ol>` : '<p class="muted small">—</p>'}</div>`;

  const S = B.seasons, full = S.filter(x => x.g >= 20);
  const seasons = `<div class="rec-grid">
    ${board('Most wins', top(S, x => x.w), x => x.w, x => ` ${yr(x)} · ${x.w}–${x.l}`)}
    ${board('Best winning percentage', top(full, x => x.pct), x => fmtPct(x.pct), x => ` ${yr(x)} · ${x.w}–${x.l}`)}
    ${board('Most runs scored', top(S, x => x.rs), x => x.rs, x => ` ${yr(x)} · ${x.g} games`)}
    ${board('Fewest runs allowed', top(full, x => -x.ra), x => x.ra, x => ` ${yr(x)} · ${x.g} games`)}
    ${board('Best run differential', top(S, x => x.diff), x => (x.diff > 0 ? '+' : '') + x.diff, x => ` ${yr(x)}`)}
    ${board('Longest winning streak', top(S, x => x.streak), x => x.streak, x => ` ${yr(x)}`)}
    ${board('Best conference record', top(S.filter(x => x.cw + x.cl >= 5), x => x.cw / (x.cw + x.cl) + x.cw / 1000), x => `${x.cw}–${x.cl}`, x => ` ${yr(x)}`)}
    ${board('Most losses by a national champion', top(S.filter(x => x.champ), x => x.l), x => x.l, x => ` ${yr(x)} · ${x.w}–${x.l}`)}
  </div>`;

  const G = B.games;
  const where = g => g.type === 'regular' ? `Week ${g.week}` : esc((g.label || '').split(' · ')[0]);
  const vs = (g, t) => (t === g.home ? g.away : g.home);
  const gameRow = (t, g, text) => ({ team: t, year: g.year, g, text });
  const gsub = x => ` ${x.year} · ${where(x.g)} · ${x.text}`;
  const runs = G.flatMap(g => [gameRow(g.home, g, `vs ${esc(g.away)}`), gameRow(g.away, g, `at ${esc(g.home)}`)].map(x => ({ ...x, v: x.team === g.home ? g.homeR : g.awayR })));
  const hits = G.filter(g => g.homeH != null).flatMap(g => [{ ...gameRow(g.home, g, `vs ${esc(g.away)}`), v: g.homeH }, { ...gameRow(g.away, g, `at ${esc(g.home)}`), v: g.awayH }]);
  const margins = G.map(g => ({ ...gameRow(g.w, g, `${g.wR}–${g.lR} over ${esc(g.l)}`), v: g.wR - g.lR }));
  const combined = G.map(g => ({ who: `${tm(g.w)}`, team: null, year: g.year, g, text: `${g.wR}–${g.lR} over ${esc(g.l)}`, v: g.wR + g.lR }));
  const longest = G.map(g => ({ ...gameRow(g.w, g, `${g.wR}–${g.lR} over ${esc(g.l)}`), v: g.innings }));
  // No-hitters: the losing side had no hits (only when hits were recorded for the winner).
  const noHit = G.filter(g => g.homeH != null && (g.w === g.home ? g.awayH === 0 && g.homeH > 0 : g.homeH === 0 && g.awayH > 0)).map(g => ({ ...gameRow(g.w, g, `${g.wR}–${g.lR} vs ${esc(g.l)}`), v: g.year }));
  const gamesHtml = `<div class="rec-grid">
    ${board('Most runs in a game', top(runs, x => x.v), x => x.v, gsub)}
    ${board('Most hits in a game', top(hits, x => x.v), x => x.v, gsub)}
    ${board('Largest margin of victory', top(margins, x => x.v), x => x.v, gsub)}
    ${board('Most combined runs', top(combined, x => x.v), x => x.v, gsub)}
    ${board('Longest games', top(longest.filter(x => x.v > 7), x => x.v), x => `${x.v} inn.`, gsub)}
    <div class="card rec-card"><h3>No-hitters</h3>${noHit.length ? `<ol class="rec-list">${noHit.sort((a, b) => b.year - a.year || b.g.week - a.g.week).slice(0, 12).map(x => `<li><span class="rec-who">${tm(x.team)}<span class="small muted">${gsub(x)}</span></span></li>`).join('')}</ol>${noHit.length > 12 ? `<p class="small muted">${noHit.length} in all.</p>` : ''}` : '<p class="muted small">None yet.</p>'}</div>
  </div>`;

  const C = B.coaches.map(c => ({ ...c, who: `<a class="team-link" href="#/coach/${encodeURIComponent(c.id)}">${esc(coachName(L, c.id))}</a>` }));
  const csub = c => ` ${c.seasons} season${c.seasons === 1 ? '' : 's'} · ${c.w}–${c.l}`;
  const coachesHtml = `<div class="rec-grid">
    ${board('Career wins', top(C, c => c.w), c => c.w, csub)}
    ${board('Career winning percentage', top(C.filter(c => c.w + c.l >= 100), c => c.w / (c.w + c.l)), c => fmtPct(c.w / (c.w + c.l)), csub)}
    ${board('National titles', top(C.filter(c => c.titles), c => c.titles + c.w / 1e5), c => c.titles, csub)}
    ${board('National Championship appearances', top(C.filter(c => c.mcws), c => c.mcws + c.w / 1e5), c => c.mcws, csub)}
  </div>`;

  // Poll records.
  const PR = pollRecords(L);
  const pkey = ui.pollSort;
  const pprogs = PR.programs.filter(p => p.ranked).sort((a, b) => b[pkey] - a[pkey] || b.ranked - a.ranked || a.team.localeCompare(b.team));
  const pollLabel = (year, key) => key === 0 ? 'Preseason' : key === 'final' ? 'Final poll' : weekName(key, L.seasons[year]);
  const pollTable = `<div class="card"><h2>Programs · in the polls</h2>
    <div class="table-wrap"><table class="rec-table"><thead><tr><th></th><th>Team</th>${POLL_COLS.map(([k, l, tip]) => `<th class="num sortable ${k === pkey ? 'sorted' : ''}" data-rsort="${k}" title="${esc(tip || 'Sort by ' + l)}">${esc(l)}</th>`).join('')}</tr></thead>
    <tbody>${pprogs.map((p, i) => `<tr><td class="num muted">${i + 1}</td><td>${tm(p.team)}</td>${POLL_COLS.map(([k]) => `<td class="num">${k === pkey ? `<b>${p[k] || ''}</b>` : p[k] || ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${POLL_COLS.length + 2}" class="muted">No one has been ranked yet.</td></tr>`}</tbody></table></div>
    <p class="small muted">Click a column to sort. Only programs that have been ranked are listed.</p></div>`;
  const msub = x => ` ${x.year} · ${pollLabel(x.year, x.key)}`;
  const rises = top(PR.moves.filter(m => m.to), m => m.delta + (m.to ? -m.to / 100 : 0));
  const falls = top(PR.moves.filter(m => m.to), m => -m.delta - m.from / 100);
  const debuts = top(PR.debuts.filter(d => d.key !== 0), d => -d.to);
  const runs1 = top(PR.seasonRuns, r => r.n + r.n / r.of / 100);
  const over1 = [...PR.bigWins].sort((a, b) => b.year - a.year || b.week - a.week);
  const rankingsHtml = `${pollTable}<div class="rec-grid" style="margin-top:16px">
    ${board('Biggest one-week rise', rises, m => `#${m.from} → #${m.to}`, m => `${msub(m)} · +${m.delta}`)}
    ${board('Biggest one-week fall', falls, m => `#${m.from} → #${m.to}`, m => `${msub(m)} · ${m.delta}`)}
    ${board('Highest debut from unranked', debuts, d => `#${d.to}`, msub)}
    ${board('Most polls at #1 in a season', runs1, r => r.n, r => ` ${r.year} · of ${r.of} polls${r.n === r.of ? ' · wire to wire' : ''}`)}
    ${board('Fell out from the highest rank', top(PR.moves.filter(m => !m.to), m => -m.from), m => `#${m.from} → NR`, msub)}
    <div class="card rec-card"><h3>Wins over #1</h3>${over1.length ? `<ol class="rec-list">${over1.slice(0, 5).map(x => `<li><span class="rec-who">${tm(x.team)}<span class="small muted"> ${x.year} · ${x.type === 'regular' ? `Week ${x.week}` : esc((x.label || '').split(' · ')[0])} · over ${esc(x.opp)}${x.winRank ? ` · as #${x.winRank}` : ' · unranked'}</span></span><b class="rec-val">${x.score}</b></li>`).join('')}</ol>${over1.length > 5 ? `<p class="small muted">Latest 5 of ${over1.length}.</p>` : ''}` : '<p class="muted small">None yet.</p>'}</div>
  </div>`;

  app.innerHTML = `<div class="section-head"><h1>Records</h1><span class="muted">${B.years[0]}–${B.years[B.years.length - 1]} · every season in the dynasty${inProgress ? ' · * season in progress' : ''}</span></div>
    ${programs}
    <h2 class="rec-section">Single season</h2>${seasons}
    <h2 class="rec-section">Single game</h2>${gamesHtml}
    <h2 class="rec-section">Rankings</h2>${rankingsHtml}
    <h2 class="rec-section">Coaches</h2>${coachesHtml}
    <p class="small muted">Season, game and ranking records count every game, postseason included; a team's rank in a game is from the poll in effect when it was played. "Best winning percentage" and "fewest runs allowed" need at least 20 games; coaching percentage needs 100.</p>`;
  $$('[data-psort]').forEach(th => (th.onclick = () => { ui.programSort = th.dataset.psort; renderRecords(); }));
  $$('[data-rsort]').forEach(th => (th.onclick = () => { ui.pollSort = th.dataset.rsort; renderRecords(); }));
}
