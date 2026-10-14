// Season pages: home, schedule, standings, rankings and postseason.

import { ctx, S, app, modal, $, $$, esc, toast, changed, persist, cache, team, teamOptions, teamNames, confLogo, confHref, confColor, confInfo, gameCard, compactCard, placeholderCard, bindGameCards, openGame, resultText, DAY_NAMES, readableOn, teamInfo, logoImg } from './ui.js?v=20261014143014';
import { isFinal, winnerOf, records, rpi, confStandings, conferences, regSeasonChamp, regSeasonChamps, TIEBREAKERS, quadrants } from './standings.js?v=20261014143014';
import { latestPoll, generatePoll, pollRankMap, pollSizeOf, VOTER_PANEL, voterStyle } from './polls.js?v=20261014143014';
import { ovr } from './sim.js?v=20261014143014';
import { simGames, addGame, weekName } from './league.js?v=20261014143014';
import { CONF_FORMATS, confFormatName, confKind } from './postseason.js?v=20261014143014';
import { mcwsVenue, postWeeks, regWeeksOf, ncaaConfig, hasSupers, fieldSize, wsTeams, formatSummary, shownSeed, postseasonBonus, defaultConfTourneySize, confTourneySeeds, reseedConfTourney, proposeField, lockField, pods, nodeTeams, nodeNeeded, runnerUp, committeeOrder, autoBids, refLabel, setConfFormat, ensureLayout, confHost, setConfHost, mcwsHistory, selectionBoard, setAtLarge, confirmField, unconfirmField, bracketology, BRACKETOLOGY_FROM_WEEK } from './postseason.js?v=20261014143014';
import { fmtPct, hashStr } from './util.js?v=20261014143014';
import { DAY_ORDER } from './schedule.js?v=20261014143014';

const ui = { week: null, schedFilter: 'all', pollWeek: null, rankTab: 'poll', postTab: null, editPoll: null, voter: null };
export function resetSeasonUi() { ui.week = null; ui.pollWeek = null; ui.postTab = null; ui.editPoll = null; }

const PHASE_TEXT = { regular: 'Regular season', conf: 'Conference tournaments', selection: 'Selection', regionals: 'NCAA Regionals', supers: 'Super Regionals', mcws: "WCWS", complete: 'Season complete' };

function nextGame(s) {
  return s.games.filter(g => !isFinal(g)).sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id)[0] || null;
}

function simAndReport(filter, what, opts = {}) {
  const s = S();
  const n = simGames(s, filter, opts);
  changed();
  toast(n ? `${n} game${n === 1 ? '' : 's'} simulated${what ? ' ' + what : ''}.` : 'Nothing left to simulate there.');
}

// ---------- Home ----------

export function renderHome() {
  const s = S(), recs = cache.recs(), poll = latestPoll(s);
  const total = s.games.length, done = s.games.filter(isFinal).length;
  const nx = nextGame(s);
  const best = Object.keys(s.teams).sort((a, b) => (recs[b].w - recs[b].l) - (recs[a].w - recs[a].l) || recs[b].w - recs[a].w)[0];
  const champ = s.post?.champion;
  const ct = champ ? teamInfo(champ) : null;
  const recent = s.games.filter(isFinal).sort((a, b) => b.week - a.week || b.order - a.order || b.id - a.id).slice(0, 8);
  const leaders = Object.keys(ctx.league.conferences).filter(c => Object.values(s.teams).some(t => t.conference === c)).map(c => {
    const st = confStandings(s, c, recs);
    return { c, top: st[0] };
  });
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Season</h1><span class="muted">${PHASE_TEXT[s.phase]}${nx ? ` · next: ${weekName(nx.week, s)}, ${DAY_NAMES[nx.day] || nx.day}` : ''}</span></div>
    ${champ ? `<div class="banner" style="background:linear-gradient(120deg, ${esc(ct.color)}, #0f2540)"><span class="trophy">🏆</span><div><div class="small" style="opacity:.8">${s.year} National Champion</div><div class="big">${esc(champ)}</div><div class="small" style="opacity:.8">Beat ${esc(s.post.runnerUp)} in the ${esc(s.settings.mcwsName)} Championship Series · ${recs[champ].w}-${recs[champ].l}</div></div></div><div style="height:16px"></div>` : ''}
    <div class="kpis">
      <div class="kpi"><div class="v">${done}<span class="muted" style="font-size:16px"> / ${total}</span></div><div class="l">Games final</div></div>
      <div class="kpi"><div class="v">${poll?.ranks[0] ? team(poll.ranks[0].team, { rank: false, size: 22 }) : '—'}</div><div class="l">No. 1 ${poll ? (poll.week === 'final' ? '(final poll)' : poll.week === 0 ? '(preseason)' : `(week ${poll.week} poll)`) : ''}</div></div>
      <div class="kpi"><div class="v">${best ? team(best, { rank: false, size: 22 }) : '—'}</div><div class="l">Best record ${best ? `(${recs[best].w}-${recs[best].l})` : ''}</div></div>
      <div class="kpi"><div class="v">${PHASE_TEXT[s.phase]}</div><div class="l">Phase</div></div>
    </div>
    ${nx ? `<div class="card"><div class="row"><div><h2 style="margin:0">Up next: ${weekName(nx.week, s)} · ${DAY_NAMES[nx.day] || nx.day}</h2>
      <div class="muted small">${(n => `${n} game${n === 1 ? '' : 's'}`)(s.games.filter(g => g.week === nx.week && g.day === nx.day && !isFinal(g)).length)} that day</div></div><span class="spacer"></span>
      <a class="btn" href="#/schedule">Open schedule</a>
      <button class="btn" id="h-day">🎲 Sim next day</button>
      <button class="btn primary" id="h-week">🎲 Sim ${weekName(nx.week, s)}</button></div></div>`
      : s.phase === 'complete' && ctx.league.viewYear === ctx.league.currentYear ? `<div class="card"><div class="row"><div><h2 style="margin:0">On to the ${s.year + 1} offseason</h2><div class="muted small">Add teams and conferences, realign, and update coaches before the new schedule is built.</div></div><span class="spacer"></span><a class="btn primary" href="#/offseason">Open the offseason</a></div></div>`
      : s.phase === 'selection' ? `<div class="card"><div class="row"><h2 style="margin:0">The NCAA field is ready to announce</h2><span class="spacer"></span><a class="btn primary" href="#/postseason">Review the field</a></div></div>` : ''}
    <div class="grid" style="margin-top:16px">
      <div class="card"><h2>${poll ? (poll.week === 'final' ? 'Final poll' : poll.week === 0 ? 'Preseason poll' : `Week ${poll.week} poll`) : 'Poll'}</h2>
        <table><tbody>${(poll?.ranks || []).slice(0, 10).map((x, i) => `<tr><td class="num" style="width:28px">${i + 1}</td><td>${team(x.team, { rank: false })}</td><td class="num muted">${esc(x.record)}</td></tr>`).join('')}</tbody></table>
        <p class="small"><a href="#/rankings">Full Top 15 and RPI →</a></p></div>
      <div class="card"><h2>Conference leaders</h2>
        <table><tbody>${leaders.map(({ c, top }) => `<tr><td style="width:30px"><a href="${confHref(c)}">${confLogo(c, 22)}</a></td><td>${top ? team(top.team) : '—'}</td><td class="num muted">${top ? `${top.cw}-${top.cl}` : ''}</td></tr>`).join('')}</tbody></table>
        <p class="small"><a href="#/standings">Standings →</a></p></div>
      <div class="card"><h2>Latest results</h2>
        ${recent.length ? `<div class="mini-scores">${recent.map(g => miniScore(g, s)).join('')}</div>` : '<p class="muted">No games played yet.</p>'}</div>
    </div>`;
  $$('[data-open]').forEach(r => (r.onclick = () => openGame(Number(r.dataset.open))));
  if ($('#h-day')) $('#h-day').onclick = () => simAndReport(g => g.week === nx.week && g.day === nx.day, `on ${DAY_NAMES[nx.day] || nx.day}`);
  if ($('#h-week')) $('#h-week').onclick = () => simAndReport(g => g.week === nx.week, `in ${weekName(nx.week, s)}`);
}

// One finished game as a compact scoreboard row: logos, abbreviations,
// runs, with the winner in bold.
function miniScore(g, s) {
  const w = winnerOf(g);
  const side = (t, r) => { const info = teamInfo(t); return `<span class="ms-team ${w === t ? 'is-win' : ''}">${logoImg(info, 20)}<span class="ms-abbr" title="${esc(t)}">${esc(info?.abbr || t)}</span><b class="ms-r">${r}</b></span>`; };
  const inn = Math.max(g.homeLine.length, g.awayLine.length);
  return `<button type="button" class="mini-score" data-open="${g.id}" title="${esc(resultText(g))}">${side(g.away, g.awayR)}${side(g.home, g.homeR)}<span class="ms-when">${esc(weekName(g.week, s).replace('Week ', 'Wk '))} ${esc(g.day)}${inn !== 7 ? ` · F/${inn}` : ''}</span></button>`;
}

// ---------- Schedule ----------

function weeksOf(s) { return [...new Set(s.games.map(g => g.week))].sort((a, b) => a - b); }

export function renderSchedule() {
  const s = S();
  const weeks = weeksOf(s);
  if (ui.week === null || !weeks.includes(ui.week)) ui.week = nextGame(s)?.week ?? weeks[weeks.length - 1] ?? 1;
  // Within a day, mix conferences like a real scoreboard. The sort key comes
  // from the series (or the game), so a weekend series keeps its spot
  // Friday through Sunday and the order stays the same between visits.
  const mixKey = g => hashStr(`${s.year}|${g.series || 'g' + g.id}`);
  // Postseason days mix the same way: each event's games keep their order
  // (Game 1 before Game 2), but the events are shuffled together, so the
  // day's first games from every tournament come first in a mixed order,
  // then the next ones, and so on.
  const week = s.games.filter(g => g.week === ui.week);
  const post = week.filter(g => g.type !== 'regular');
  const dayKey = g => DAY_ORDER[g.day] + (g.type !== 'conf' && ['Mon', 'Tue', 'Wed'].includes(g.day) ? 7 : 0);
  const slot = {};
  const byEventDay = {};
  for (const g of post) (byEventDay[`${g.event || g.type}|${g.day}`] ||= []).push(g);
  for (const list of Object.values(byEventDay)) list.sort((a, b) => a.order - b.order || a.id - b.id).forEach((g, i) => { slot[g.id] = i; });
  const postKey = g => hashStr(`${s.year}|${g.event || g.type}|${g.day}|${slot[g.id]}`);
  const games = week.sort((a, b) => {
    if (a.type === 'regular' && b.type === 'regular') return a.order - b.order || mixKey(a) - mixKey(b) || a.id - b.id;
    if (a.type !== 'regular' && b.type !== 'regular') return dayKey(a) - dayKey(b) || slot[a.id] - slot[b.id] || postKey(a) - postKey(b) || a.id - b.id;
    return a.order - b.order || a.id - b.id;
  });
  const unplayed = games.filter(g => !isFinal(g));
  const days = [...new Set(games.map(g => g.day))];
  // Filter (All games unless the commissioner picks another; the sim buttons
  // still cover the whole week). A game counts as ranked if either team was
  // ranked in the poll in effect when it was played (the latest poll if not).
  const confs = conferences(s);
  if (ui.schedFilter !== 'all' && !['ranked', 'top'].includes(ui.schedFilter) && !confs.includes(ui.schedFilter.replace(/^conf:/, ''))) ui.schedFilter = 'all';
  const rankedIn = g => { const r = isFinal(g) ? cache.ranksAt(g.week) : cache.ranks(); return [g.home, g.away].filter(t => r[t]).length; };
  const sf = ui.schedFilter, filtering = sf !== 'all';
  const keep = sf === 'ranked' ? g => rankedIn(g) >= 1 : sf === 'top' ? g => rankedIn(g) === 2
    : sf.startsWith('conf:') ? (c => g => s.teams[g.home]?.conference === c || s.teams[g.away]?.conference === c)(sf.slice(5)) : () => true;
  const shown = games.filter(keep);
  const shownDays = days.filter(d => shown.some(g => g.day === d));
  const filterName = sf === 'ranked' ? 'ranked-team' : sf === 'top' ? 'ranked vs. ranked' : sf.startsWith('conf:') ? sf.slice(5) : '';
  const fchip = (v, label, extra = '') => `<button type="button" class="fchip ${sf === v ? 'active' : ''}" data-sf="${esc(v)}" aria-pressed="${sf === v}"${extra}>${label}</button>`;
  const filterBar = `<div class="sched-filter" role="group" aria-label="Filter games">
      ${fchip('all', 'All games')}${fchip('ranked', 'Ranked teams', ' title="Games with at least one ranked team"')}${fchip('top', 'Ranked vs. ranked', ' title="Both teams ranked"')}
      <span class="fsep" aria-hidden="true"></span>
      ${confs.map(c => fchip(`conf:${c}`, `${confLogo(c, 16)}<span>${esc(confInfo(c).abbr || c)}</span>`, ` title="Games with a ${esc(c)} team"`)).join('')}
    </div>`;
  const firstOpenDay = unplayed[0]?.day;
  const isDone = w => s.games.filter(g => g.week === w).every(isFinal);
  const finals = s.games.filter(isFinal).length;
  const regLeft = s.games.filter(g => g.type === 'regular' && !isFinal(g)).length;
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Schedule</h1><span class="muted">${finals} of ${s.games.length} games final</span></div>
    <div class="chips">${weeks.map(w => `<button class="chip ${w === ui.week ? 'active' : ''} ${isDone(w) ? 'done' : ''}" data-week="${w}">${w > regWeeksOf(s) ? esc(weekName(w, s)) : 'Wk ' + w}</button>`).join('')}</div>
    <div class="row" style="margin-bottom:14px">
      <h2 style="margin:0">${esc(weekName(ui.week, s))}</h2><span class="spacer"></span>
      ${firstOpenDay ? `<button class="btn" id="w-day">🎲 Sim ${DAY_NAMES[firstOpenDay] || firstOpenDay}</button>` : ''}
      ${unplayed.length ? `<button class="btn" id="w-sim">🎲 Sim week (${unplayed.length})</button>` : ''}
      ${regLeft && ui.week <= regWeeksOf(s) ? `<button class="btn" id="w-rest">Sim rest of regular season (${regLeft})</button>` : ''}
      ${ui.week <= regWeeksOf(s) ? '<button class="btn" id="w-add">+ Add game</button>' : ''}
    </div>
    ${filterBar}
    ${shownDays.map(d => { const all = games.filter(g => g.day === d).length, n = shown.filter(g => g.day === d).length; return `<h3 class="day-head">${DAY_NAMES[d] || esc(d)} <span class="muted small">${filtering ? `${n} of ${all} games` : `${n} game${n === 1 ? '' : 's'}`}</span></h3>
      <div class="games">${shown.filter(g => g.day === d).map(gameCard).join('')}</div>`; }).join('') || `<div class="empty">${filtering && games.length ? `No ${esc(filterName)} games in ${esc(weekName(ui.week, s))}. <button class="btn sm" id="sf-clear">Show all games</button>` : 'No games this week.'}</div>`}
    <p class="small muted" style="margin-top:16px">Click a game to enter its line score by inning or simulate it. Percentages are pre-game win chances from the teams' OFF, PIT and DEF ratings and the day's starting pitchers (Friday aces, Saturday and Sunday starters, midweek arms). Rotation order and starters can be changed in the game editor.</p>`;
  $$('[data-week]').forEach(b => (b.onclick = () => { ui.week = Number(b.dataset.week); renderSchedule(); }));
  $$('[data-sf]').forEach(b => (b.onclick = () => { ui.schedFilter = b.dataset.sf; renderSchedule(); }));
  if ($('#sf-clear')) $('#sf-clear').onclick = () => { ui.schedFilter = 'all'; renderSchedule(); };
  bindGameCards();
  if ($('#w-day')) $('#w-day').onclick = () => simAndReport(g => g.week === ui.week && g.day === firstOpenDay, `on ${DAY_NAMES[firstOpenDay] || firstOpenDay}`);
  if ($('#w-sim')) $('#w-sim').onclick = () => simAndReport(g => g.week === ui.week, `in ${weekName(ui.week, s)}`);
  if ($('#w-rest')) $('#w-rest').onclick = () => {
    if (!confirm(`Simulate all ${regLeft} remaining regular-season games? Every result stays editable.`)) return;
    simAndReport(g => g.type === 'regular', 'in the regular season');
  };
  if ($('#w-add')) $('#w-add').onclick = () => {
    const g = addGame(s, { week: ui.week, day: 'Tue' });
    openGame(g.id, { isNew: true });
  };
}

// ---------- Standings ----------

export function renderStandings() {
  const s = S(), recs = cache.recs(), r = rpi(s);
  const regRecs = records(s, g => g.type === 'regular');
  const confs = Object.keys(ctx.league.conferences).filter(c => Object.values(s.teams).some(t => t.conference === c));
  const card = c => {
    const st = confStandings(s, c, regRecs, r);
    const n = st.length;
    const size = Math.min(n, s.settings.confTourney?.[c] ?? defaultConfTourneySize(n));
    const champ = regSeasonChamp(s, c, regRecs, r);
    const tchamp = s.post?.confT?.[c]?.champion;
    const canSize = s.phase === 'regular';
    return `<div class="card">
      <div class="row" style="margin-bottom:8px"><a href="${confHref(c)}">${confLogo(c, 30)}</a><h2 style="margin:0"><a class="team-link" href="${confHref(c)}">${esc(c)}</a></h2><span class="spacer"></span>
        ${tchamp ? `<span class="badge gold">Tournament: ${esc(tchamp)}</span>` : ''}</div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Team</th><th class="num">Conf</th><th class="num">GB</th><th class="num">Overall</th><th class="num">Home</th><th class="num">Away</th><th class="num">Strk</th></tr></thead>
        <tbody>${st.map((x, i) => `<tr class="${i === size - 1 && size < n ? 'cutline' : ''}"><td class="num muted">${i + 1}</td>
          <td>${team(x.team)}</td>
          <td class="num"><b>${x.cw}-${x.cl}</b></td><td class="num">${x.gb ? x.gb.toFixed(1).replace('.0', '') : '—'}</td>
          <td class="num">${recs[x.team].w}-${recs[x.team].l}</td><td class="num">${x.hw}-${x.hl}</td><td class="num">${x.aw}-${x.al}</td>
          <td class="num">${x.streak || ''}</td></tr>`).join('')}</tbody></table></div>
      <details class="small" style="margin-top:8px"><summary class="muted">Commissioner</summary><div class="row" style="margin-top:8px">
        <label class="field">Regular-season champion <select data-champ="${esc(c)}"><option value="">Automatic (${esc(regSeasonChamps({ ...s, overrides: {} }, c, regRecs, r).join(' & ') || '—')})</option>${teamOptions(s.overrides.regChamps?.[c], { blank: false, list: st.map(x => x.team) })}</select></label>
        <label class="field">Tournament format <select data-format="${esc(c)}" ${canSize ? '' : 'disabled'}>${CONF_FORMATS.map(([k, l]) => `<option value="${k}" ${(s.settings.confFormat?.[c] || 'single') === k ? 'selected' : ''}>${l}${k === 'playin' && size < 5 ? ' (top 5 or more; double elimination for now)' : ''}</option>`).join('')}</select></label>
        <label class="field">Tournament teams <select data-size="${esc(c)}" ${canSize ? '' : 'disabled'}>${[0, 2, 3, 4, 5, 6, 7, 8].filter(k => k <= n).map(k => `<option value="${k}" ${k === size ? 'selected' : ''}>${k ? `Top ${k}` : 'No tournament'}</option>`).join('')}</select></label>
      </div>${canSize ? '' : `<p class="muted">Tournament size and format are locked once the tournaments are set. You can still switch a tournament's format on the Postseason page until its first game.</p>`}</details>
    </div>`;
  };
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Standings</h1><span class="muted">Ordered by conference winning percentage. The line marks the conference tournament cut.</span></div>
    <details class="card small" style="margin-bottom:16px"><summary><b>Tiebreakers</b></summary><ol style="margin:8px 0 0 18px">${TIEBREAKERS.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      <p class="muted" style="margin:6px 0 0">The same order seeds the conference tournaments.</p></details>
    <div class="grid wide">${confs.map(card).join('')}</div>`;
  $$('[data-champ]').forEach(sel => (sel.onchange = () => {
    s.overrides.regChamps ||= {};
    if (sel.value) s.overrides.regChamps[sel.dataset.champ] = sel.value; else delete s.overrides.regChamps[sel.dataset.champ];
    changed({ progress: false });
  }));
  $$('[data-format]').forEach(sel => (sel.onchange = () => { s.settings.confFormat ||= {}; s.settings.confFormat[sel.dataset.format] = sel.value; changed({ progress: false }); }));
  $$('[data-size]').forEach(sel => (sel.onchange = () => { s.settings.confTourney ||= {}; s.settings.confTourney[sel.dataset.size] = Number(sel.value); changed({ progress: false }); }));
}

// ---------- Rankings ----------

function pollWeeks(s) {
  const ks = Object.keys(s.polls || {}).filter(k => k !== 'final').map(Number).sort((a, b) => a - b);
  if (s.polls?.final) ks.push('final');
  return ks;
}

export function renderRankings() {
  const s = S();
  const tabs = { poll: `Top ${pollSizeOf(s)} poll`, rpi: 'RPI', sos: 'Strength of schedule', power: 'Power (OVR)', bracket: 'Bracketology' };
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Rankings</h1></div>
    <div class="steps">${Object.entries(tabs).map(([k, l]) => `<a href="#/rankings" data-tab="${k}" class="${ui.rankTab === k ? 'active' : ''}">${l}</a>`).join('')}</div>
    <div id="rk"></div>`;
  $$('[data-tab]').forEach(a => (a.onclick = e => { e.preventDefault(); ui.rankTab = a.dataset.tab; ui.editPoll = null; renderRankings(); }));
  ({ poll: renderPollTab, rpi: renderRpiTab, sos: renderSosTab, power: renderPowerTab, bracket: renderBracketology })[ui.rankTab]($('#rk'));
}

function renderPollTab(root) {
  const s = S();
  const weeks = pollWeeks(s);
  if (!weeks.length) { root.innerHTML = '<div class="empty">No polls yet.</div>'; return; }
  if (ui.pollWeek === null || !weeks.some(w => String(w) === String(ui.pollWeek))) ui.pollWeek = weeks[weeks.length - 1];
  const key = ui.pollWeek;
  const poll = s.polls[key];
  const prevKey = key === 'final' ? weeks.filter(w => w !== 'final').slice(-1)[0] : weeks.filter(w => w !== 'final' && w < key).slice(-1)[0];
  const prev = prevKey !== undefined ? pollRankMap(s.polls[prevKey]) : {};
  const label = w => (w === 'final' ? 'Final' : w === 0 ? 'Pre' : w === postWeeks(s).conf ? 'Post-tourney' : `Wk ${w}`);
  const editing = ui.editPoll && ui.editPoll.key === key;
  const rows = editing ? ui.editPoll.ranks : poll.ranks;
  // Teams ranked in the previous poll but not in this one, with that week's results.
  const inNow = new Set(rows.map(r => r.team));
  const weekRec = t => {
    if (key === 0) return '';
    const inWeek = key === 'final' ? g => g.type !== 'regular' && g.type !== 'conf' : g => g.week === key;
    const gs = s.games.filter(g => inWeek(g) && isFinal(g) && (g.home === t || g.away === t));
    if (!gs.length) return '';
    const w = gs.filter(g => (g.homeR > g.awayR ? g.home : g.away) === t).length;
    return `${w}-${gs.length - w}`;
  };
  const dropped = prevKey === undefined ? [] : Object.entries(prev).filter(([t]) => !inNow.has(t)).sort((a, b) => a[1] - b[1]).map(([t, was]) => ({ team: t, was, week: weekRec(t) }));
  const mv = (t, i) => {
    const p = prev[t];
    if (prevKey === undefined) return '';
    if (!p) return '<span class="move up">NEW</span>';
    const d = p - (i + 1);
    return d > 0 ? `<span class="move up">▲${d}</span>` : d < 0 ? `<span class="move down">▼${-d}</span>` : '<span class="muted">—</span>';
  };
  root.innerHTML = `
    <div class="chips">${weeks.map(w => `<button class="chip ${String(w) === String(key) ? 'active' : ''}" data-pw="${w}">${label(w)}</button>`).join('')}</div>
    <div class="card">
      <div class="row" style="margin-bottom:10px"><h2 style="margin:0">${key === 'final' ? 'Final poll' : key === 0 ? 'Preseason poll' : key === postWeeks(s).conf ? 'Poll after conference tournaments' : `Week ${key} poll`}</h2>
        ${poll.edited ? '<span class="badge manual">Commissioner edited</span>' : ''}<span class="spacer"></span>
        ${editing ? '<button class="btn" id="p-cancel">Cancel</button><button class="btn primary" id="p-save">Save poll</button>' : '<button class="btn" id="p-edit">Edit poll</button><button class="btn" id="p-regen">Regenerate</button>'}</div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">#</th><th>Team</th><th class="num">Record</th>${key === 0 ? '' : `<th class="num" title="${key === 'final' ? 'NCAA tournament record' : "Record in this poll's week"}">${key === 'final' ? 'NCAA' : 'This week'}</th>`}${editing ? '<th></th>' : '<th class="num">Points</th><th class="num">Prev</th><th></th>'}</tr></thead>
        <tbody>${rows.map((x, i) => `<tr><td class="num"><b>${i + 1}</b></td><td>${team(x.team, { rank: false })}${!editing && x.fp ? ` <span class="muted small">(${x.fp})</span>` : ''}</td><td class="num muted">${esc(x.record || '')}</td>${key === 0 ? '' : (() => { const wr = weekRec(x.team); if (!wr) return '<td class="num muted">—</td>'; const [w, l] = wr.split('-').map(Number); return `<td class="num"><span class="wk-rec ${w > l ? 'up' : w < l ? 'down' : ''}">${wr}</span></td>`; })()}
          ${editing ? `<td class="num" style="white-space:nowrap"><button class="btn sm" data-up="${i}" ${i ? '' : 'disabled'}>▲</button> <button class="btn sm" data-down="${i}" ${i < rows.length - 1 ? '' : 'disabled'}>▼</button> <button class="btn sm danger" data-rm="${i}">✕</button></td>`
          : `<td class="num">${x.pts ?? ''}</td><td class="num muted">${prevKey !== undefined ? prev[x.team] ?? 'NR' : ''}</td><td class="num">${mv(x.team, i)}</td>`}</tr>`).join('')}</tbody></table></div>
      ${editing ? `<div class="row" style="margin-top:10px"><select id="p-add">${teamOptions('', { blankLabel: 'Add a team…', list: teamNames().filter(t => !rows.some(r => r.team === t)) })}</select><span class="muted small">Added teams go to the bottom; move them up with ▲. The poll keeps ${poll.size || poll.ranks.length} teams.</span></div>`
      : `${dropped.length ? `<div class="dropped"><b>Dropped out:</b> ${dropped.map(d => `<span class="drop-item">${team(d.team, { rank: false, size: 16 })} <span class="muted small">was #${d.was}${d.week ? `, ${d.week} ${key === 'final' ? 'in the NCAA tournament' : 'this week'}` : ''}</span></span>`).join('')}</div>` : prevKey !== undefined ? '<p class="small muted" style="margin-top:10px">No teams dropped out this week.</p>' : ''}
        ${poll.others?.length ? `<p class="small muted" style="margin-top:10px"><b>Others receiving votes:</b> ${poll.others.map(o => `${esc(o.team)} ${o.pts}`).join(', ')}</p>` : ''}`}
      <p class="small muted">${poll.ballots ? `${poll.voters} voters` : `${poll.voters || 40} simulated voters`}. First-place votes in parentheses. ${poll.ranks.length !== pollSizeOf(s) ? `This poll ranks ${poll.ranks.length} teams; polls released from now on rank ${pollSizeOf(s)}. ` : ''}Polls come out when a week's games are all final.</p>
    </div>
    ${voterPanel(s, poll)}`;
  $$('[data-voter]', root).forEach(b => (b.onclick = () => { ui.voter = ui.voter === b.dataset.voter ? null : b.dataset.voter; renderRankings(); }));
  $$('[data-pw]', root).forEach(b => (b.onclick = () => { ui.pollWeek = b.dataset.pw === 'final' ? 'final' : Number(b.dataset.pw); ui.editPoll = null; renderRankings(); }));
  const recs = cache.recs();
  if ($('#p-edit', root)) $('#p-edit', root).onclick = () => { ui.editPoll = { key, ranks: poll.ranks.map(x => ({ ...x })) }; renderRankings(); };
  if ($('#p-cancel', root)) $('#p-cancel', root).onclick = () => { ui.editPoll = null; renderRankings(); };
  if ($('#p-regen', root)) $('#p-regen', root).onclick = () => {
    if (!confirm('Regenerate this poll from scratch? Your edits to it will be replaced.')) return;
    s.polls[key] = key === 'final' ? generatePoll(s, 'final', { final: true, postBonus: postseasonBonus(s) }) : generatePoll(s, key);
    changed({ progress: false }); toast('Poll regenerated.');
  };
  if ($('#p-save', root)) $('#p-save', root).onclick = () => {
    const ranks = ui.editPoll.ranks.slice(0, poll.size || poll.ranks.length);
    const kept = new Set(ranks.map(r => r.team));
    s.polls[key] = { ...poll, edited: true, ranks: ranks.map(r => ({ ...r, pts: r.pts ?? 0, fp: r.fp ?? 0 })), others: [...poll.others || [], ...poll.ranks.filter(r => !kept.has(r.team))].filter(o => !kept.has(o.team)) };
    ui.editPoll = null; changed({ progress: false }); toast('Poll saved.');
  };
  const list = ui.editPoll?.ranks;
  $$('[data-up]', root).forEach(b => (b.onclick = () => { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; renderRankings(); }));
  $$('[data-down]', root).forEach(b => (b.onclick = () => { const i = +b.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; renderRankings(); }));
  $$('[data-rm]', root).forEach(b => (b.onclick = () => { list.splice(+b.dataset.rm, 1); renderRankings(); }));
  if ($('#p-add', root)) $('#p-add', root).onchange = e => {
    const t = e.target.value; if (!t) return;
    const r = recs[t];
    list.push({ team: t, record: `${r.w}-${r.l}`, pts: 0, fp: 0 });
    const cap = poll.size || poll.ranks.length;
    if (list.length > cap) list.splice(cap - 1, 1);
    renderRankings();
  };
}

// The voter panel: who votes, how they lean, their #1 this week, and any
// voter's full ballot next to the poll.
function voterPanel(s, poll) {
  if (!poll.ballots) return `<div class="card" style="margin-top:16px"><h2>The voters</h2><p class="muted">Individual ballots weren't saved for this poll. Regenerate it to see them.</p></div>`;
  const rank = pollRankMap(poll);
  const pick = ui.voter && poll.ballots[ui.voter] ? VOTER_PANEL.find(v => v.id === ui.voter) : null;
  const ballot = pick ? poll.ballots[pick.id] : null;
  const diff = (t, i) => {
    const r = rank[t];
    if (!r) return '<span class="move up">Not in poll</span>';
    const d = r - (i + 1);
    return d === 0 ? '<span class="muted">same</span>' : d > 0 ? `<span class="move up">poll #${r}</span>` : `<span class="move down">poll #${r}</span>`;
  };
  return `<div class="card" style="margin-top:16px">
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">The voters</h2><span class="muted small">${VOTER_PANEL.length} voters, each with their own way of ranking. Click a voter to see their ballot.</span></div>
    <div class="voter-layout">
      <div class="table-wrap"><table class="voters">
        <thead><tr><th>Voter</th><th>Tendency</th><th>#1 vote</th></tr></thead>
        <tbody>${VOTER_PANEL.map(v => `<tr class="clickable ${pick?.id === v.id ? 'sel' : ''}" data-voter="${v.id}"><td><b>${esc(v.name)}</b><div class="small muted">${esc(v.outlet)}</div></td><td class="small">${esc(voterStyle(s, v))}</td><td>${poll.ballots[v.id]?.[0] ? team(poll.ballots[v.id][0], { rank: false, size: 16, link: false }) : ''}</td></tr>`).join('')}</tbody></table></div>
      ${pick ? `<div class="ballot"><h3>${esc(pick.name)}'s ballot</h3><div class="small muted" style="margin-bottom:6px">${esc(pick.outlet)} · ${esc(voterStyle(s, pick))}</div>
        <table><tbody>${ballot.map((t, i) => `<tr><td class="num"><b>${i + 1}</b></td><td>${team(t, { rank: false, size: 16 })}</td><td class="num small">${diff(t, i)}</td></tr>`).join('')}</tbody></table>
        <p class="small muted">${poll.edited ? 'The published poll was edited by the commissioner after the votes came in.' : 'Green: this voter ranks the team higher than the poll. Red: lower.'}</p></div>` : ''}
    </div></div>`;
}

// Bracketology: the projected NCAA field and regionals as of today. It
// starts once Week 4 is in the books and stops once the real field is out.
function renderBracketology(root) {
  const s = S(), p = s.post || {};
  const W = BRACKETOLOGY_FROM_WEEK;
  const reg = s.games.filter(g => g.type === 'regular');
  const doneThrough = (() => { let w = 0; for (let k = 1; k <= regWeeksOf(s); k++) { const gs = reg.filter(g => g.week === k); if (gs.length && gs.every(isFinal)) w = k; else break; } return w; })();
  if (p.field && s.phase !== 'selection') { root.innerHTML = `<div class="empty">The ${s.year} NCAA field has been announced. <a href="#/postseason">See the real bracket</a>.</div>`; return; }
  if (doneThrough < W) {
    root.innerHTML = `<div class="empty">Bracketology comes out once Week ${W} is finished${doneThrough ? ` (games are final through Week ${doneThrough})` : ''}. It projects the NCAA field and regionals as if the season ended that day, and updates as games are played.</div>`;
    return;
  }
  const B = bracketology(s), r = rpi(s), recs = cache.recs(), pr = cache.ranks();
  const seedOf = Object.fromEntries(B.field.map(f => [f.team, f.seed]));
  const autoSet = new Set(Object.values(B.autos).filter(Boolean));
  const asOf = s.phase === 'regular' ? `after Week ${doneThrough}` : 'today';
  const row = (t, k) => `<div class="bo-row"><span class="bo-seed">${k + 1}</span><span class="bo-team">${team(t, { rank: false, size: 16 })}</span><span>${autoSet.has(t) ? '<span class="badge real" title="Projected automatic bid">AQ</span>' : ''}</span>
    <span class="bo-conf" title="${esc(s.teams[t].conference)}">${confLogo(s.teams[t].conference, 16)}</span><span class="bo-num">${recs[t].w}-${recs[t].l}</span><span class="bo-num muted" title="RPI rank">${r[t]?.rank ? `RPI ${r[t].rank}` : ''}</span></div>`;
  const regionals = B.regionals.map(teams => `<div class="card bo-reg"><div class="bo-head"><h3>${esc(teams[0])} Regional</h3><span class="muted small">Host: national seed ${seedOf[teams[0]]}</span></div>${teams.map(row).join('')}</div>`).join('');
  const list = (title, teams, note) => `<div class="bo-list"><h3>${title}</h3>${teams.length ? `<ol>${teams.map(t => `<li>${team(t, { rank: false, size: 16 })} <span class="muted small">${recs[t].w}-${recs[t].l} · RPI ${r[t]?.rank ?? '–'}</span></li>`).join('')}</ol>` : '<p class="muted small">—</p>'}${note ? `<p class="small muted">${note}</p>` : ''}</div>`;
  const autoList = Object.entries(B.autos).filter(([, t]) => t).sort((a, b) => a[0].localeCompare(b[0]));
  root.innerHTML = `<div class="hint">Projected ${asOf}: ${B.field.length} teams in ${B.cfg.regionals} regionals. Automatic bids go to each conference's current leader${s.phase === 'conf' ? ' (or tournament champion)' : ''}; at-large spots and seeds follow the committee order (RPI 50%, poll 30%, strength of schedule 20%), and teams below .500 can't take an at-large spot. It changes as games are played.${B.fill.length ? ` <b>Too few at-large candidates are .500 or better to fill the field, so the best of the rest take the last ${B.fill.length} spot${B.fill.length > 1 ? 's' : ''}: ${B.fill.map(esc).join(', ')}.</b>` : ''}</div>
    <div class="bo-layout">
      <div class="bo-grid">${regionals}</div>
      <aside class="card bo-side">
        <div class="bo-list"><h3>Projected automatic bids</h3><ul class="bo-aq">${autoList.map(([c, t]) => `<li>${confLogo(c, 16)} <span class="muted small">${esc(c)}</span> ${team(t, { rank: false, size: 16 })}</li>`).join('')}</ul></div>
        ${list('Last four in', B.lastIn)}
        ${list('First four out', B.firstOut)}
        ${list('Next four out', B.nextOut)}
      </aside>
    </div>`;
}

function renderRpiTab(root) {
  const s = S(), r = rpi(s), recs = cache.recs(), pr = cache.ranks(), Q = quadrants(s, r);
  const qc = (t, i) => { const x = Q[t].rec[i]; return `<td class="num${x.w + x.l ? '' : ' muted'}">${x.w}-${x.l}</td>`; };
  const teams = Object.keys(s.teams).filter(t => r[t].games).sort((a, b) => r[a].rank - r[b].rank);
  root.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th class="num">RPI</th><th>Team</th><th>Conf</th><th class="num">Record</th><th class="num">WP</th><th class="num">OWP</th><th class="num">OOWP</th><th class="num">Rating</th><th class="num">SOS</th><th class="num">Poll</th><th class="num" title="Record against Quadrant 1 (RPI top quarter)">Q1</th><th class="num">Q2</th><th class="num">Q3</th><th class="num">Q4</th></tr></thead>
    <tbody>${teams.map(t => `<tr><td class="num"><b>${r[t].rank}</b></td><td>${team(t, { rank: false })}</td><td>${confLogo(s.teams[t].conference, 18)}</td><td class="num">${recs[t].w}-${recs[t].l}</td>
      <td class="num">${fmtPct(r[t].wp)}</td><td class="num">${fmtPct(r[t].owp)}</td><td class="num">${fmtPct(r[t].oowp)}</td><td class="num"><b>${r[t].rpi.toFixed(4).replace(/^0/, '')}</b></td><td class="num muted">${r[t].sosRank ?? ''}</td><td class="num muted">${pr[t] ?? ''}</td>${[0, 1, 2, 3].map(i => qc(t, i)).join('')}</tr>`).join('') || '<tr><td colspan="14" class="muted">The RPI starts once games are played.</td></tr>'}</tbody></table></div>
    <p class="small muted">RPI = 25% winning percentage + 50% opponents' winning percentage (not counting games against this team) + 25% opponents' opponents' winning percentage. The selection committee weighs RPI rank 50%, poll rank 30% and strength-of-schedule rank 20%. Quadrants: every team is placed in Q1–Q4 by RPI rank (Q1 is the top quarter); Q1–Q4 are each team's record against teams in that quadrant.</p></div>`;
}

function renderSosTab(root) {
  const s = S(), r = rpi(s), recs = cache.recs(), pr = cache.ranks();
  const teams = Object.keys(s.teams).filter(t => r[t].games).sort((a, b) => r[a].sosRank - r[b].sosRank);
  root.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th class="num">SOS</th><th>Team</th><th>Conf</th><th class="num">Record</th><th class="num">Opponents' record</th><th class="num">Opp. win %</th><th class="num">Opp. opp. win %</th><th class="num">Rating</th><th class="num">RPI</th><th class="num">Poll</th></tr></thead>
    <tbody>${teams.map(t => `<tr><td class="num"><b>${r[t].sosRank}</b></td><td>${team(t, { rank: false })}</td><td>${confLogo(s.teams[t].conference, 18)}</td><td class="num">${recs[t].w}-${recs[t].l}</td>
      <td class="num">${r[t].oppW}-${r[t].oppL}</td><td class="num">${fmtPct(r[t].owp)}</td><td class="num">${fmtPct(r[t].oowp)}</td><td class="num"><b>${r[t].sos.toFixed(4).replace(/^0/, '')}</b></td><td class="num muted">${r[t].rank ?? ''}</td><td class="num muted">${pr[t] ?? ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">Strength of schedule starts once games are played.</td></tr>'}</tbody></table></div>
    <p class="small muted">Strength of schedule = ⅔ opponents' winning percentage (not counting games against this team) + ⅓ opponents' opponents' winning percentage. Opponents' record counts every game a team's opponents played, once per meeting. The selection committee uses SOS rank for 20% of its order, which picks the at-large teams and sets the seeds.</p></div>`;
}

function renderPowerTab(root) {
  const s = S(), recs = cache.recs(), pr = cache.ranks();
  const teams = Object.keys(s.teams).sort((a, b) => ovr(s.teams[b]) - ovr(s.teams[a]) || s.teams[b].pit - s.teams[a].pit);
  root.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th class="num">#</th><th>Team</th><th>Conf</th><th class="num">OFF</th><th class="num">PIT</th><th class="num">DEF</th><th class="num">OVR</th><th class="num">Record</th><th class="num">Poll</th></tr></thead>
    <tbody>${teams.map((t, i) => { const x = s.teams[t]; return `<tr><td class="num">${i + 1}</td><td>${team(t, { rank: false })}</td><td>${confLogo(x.conference, 18)}</td><td class="num">${x.off}</td><td class="num">${x.pit}</td><td class="num">${x.def}</td><td class="num"><b>${ovr(x)}</b></td><td class="num">${recs[t].w}-${recs[t].l}</td><td class="num muted">${pr[t] ?? ''}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="small muted">OVR = 40% OFF + 40% PIT + 20% DEF. Change ratings on the Teams page or a team's profile.</p></div>`;
}

// ---------- Postseason ----------

// A drawn bracket. Rounds are columns; every game sits halfway between the
// two games that feed it, joined by lines. Double elimination draws the
// winners bracket on top, the elimination bracket underneath, and the
// championship to the right. Cards show R/H/E; click for the line score.
const BK = { CW: 300, COLW: 340, H: 90, SLOT: 104, HEAD: 30, SEC_GAP: 34 };

function eventBracket(ev, seedFn, { stack = false, colw = BK.COLW } = {}) {
  const COLW = colw;
  const s = S();
  const rankOn = !!s.post?.confT && Object.values(s.post.confT).includes(ev); // poll rankings on conference tournament brackets only
  ensureLayout(ev);
  const byKey = Object.fromEntries(ev.nodes.map(n => [n.key, n]));
  const secOf = n => n.sec || 'W';
  const kids = n => [n.a, n.b].filter(r => r && r.w && byKey[r.w] && secOf(byKey[r.w]) === secOf(n)).map(r => byKey[r.w]);
  const pos = {};
  // Elimination-bracket "games" against a bye never happen; leave them out.
  const hidden = new Set(ev.nodes.filter(n => secOf(n) === 'L' && nodeTeams(ev, n).includes('BYE')).map(n => n.key));
  const sections = ['W', 'L'].filter(sec => ev.nodes.some(n => secOf(n) === sec));
  const double = sections.includes('L');
  let top = 0, maxCol = 0;
  const heads = [];
  for (const sec of sections) {
    const nodes = ev.nodes.filter(n => secOf(n) === sec);
    const fed = new Set(nodes.flatMap(n => kids(n).map(k => k.key)));
    const roots = nodes.filter(n => !fed.has(n.key));
    let slot = 0;
    const secTop = top + (double ? BK.SEC_GAP : 0) + BK.HEAD;
    const place = n => {
      if (pos[n.key]) return pos[n.key].y;
      const ks = kids(n);
      const y = ks.length ? ks.map(place).reduce((a, b) => a + b, 0) / ks.length : secTop + (slot++) * BK.SLOT;
      pos[n.key] = { x: n.col * COLW, y };
      maxCol = Math.max(maxCol, n.col);
      return y;
    };
    roots.forEach(place);
    const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
    for (const c of cols) {
      const first = nodes.find(n => n.col === c && !hidden.has(n.key));
      if (!first) continue;
      const byDay = ev.kind === 'regional' || ev.kind === 'mcws' || ev.kind === 'de';
      heads.push({ x: c * COLW, y: secTop - BK.HEAD, text: byDay ? DAY_NAMES[first.day] || first.day : first.label.replace(/ \(.*\)$/, ''), day: byDay ? null : first.day });
    }
    if (double) heads.push({ x: 0, y: top, text: sec === 'W' ? 'Winners bracket' : 'Elimination bracket', section: true });
    top = secTop + slot * BK.SLOT;
  }
  // Championship column.
  const finals = ev.nodes.filter(n => secOf(n) === 'F');
  if (finals.length && !sections.length && stack) {
    // A best-of-three series stacked top to bottom (the WCWS Championship Series).
    finals.forEach((n, i) => {
      const step = BK.H + BK.HEAD + 12;
      pos[n.key] = { x: 0, y: BK.HEAD + i * step };
      heads.push({ x: 0, y: i * step, text: `Game ${i + 1}`, day: n.day });
    });
  } else if (finals.length && !sections.length) {
    // A lone best-of-three series: the games side by side, left to right.
    finals.forEach((n, i) => {
      pos[n.key] = { x: i * COLW, y: BK.HEAD };
      heads.push({ x: i * COLW, y: 0, text: `Game ${i + 1}`, day: n.day });
    });
    top = BK.HEAD + BK.SLOT;
  } else if (finals.length) {
    const x = sections.length ? (maxCol + 1) * COLW : 0;
    const feeders = [finals[0].a, finals[0].b].map(r => r && pos[r.w || r.l]).filter(Boolean);
    const mid = feeders.length ? feeders.reduce((a, p) => a + p.y, 0) / feeders.length : BK.HEAD;
    const start = Math.max(BK.HEAD, mid - ((finals.length - 1) * BK.SLOT) / 2);
    finals.forEach((n, i) => { pos[n.key] = { x, y: start + i * BK.SLOT }; });
    const finalsTitle = ev.kind === 'mcws' ? 'Championship Series' : ev.kind === 'series' ? 'Best of three' : ev.bracket ? 'Bracket final' : ev.kind === 'regional' || ev.kind === 'de' ? (ev.id.startsWith('reg') ? 'Regional final' : 'Final') : 'Championship';
    heads.push({ x, y: start - BK.HEAD, text: finalsTitle, day: ev.kind === 'series' ? null : finals[0].day });
    top = Math.max(top, start + finals.length * BK.SLOT);
  }
  const width = Math.max(...Object.values(pos).map(p => p.x)) + BK.CW;
  const height = Math.max(...Object.values(pos).map(p => p.y)) + BK.H + 4;

  // Connector lines: from each feeding game into the game it feeds.
  const lines = [];
  const link = (from, to) => {
    const x1 = from.x + BK.CW, y1 = from.y + BK.H / 2, x2 = to.x, y2 = to.y + BK.H / 2, mx = x1 + (x2 - x1) / 2;
    lines.push(`<path d="M${x1},${y1} H${mx} V${y2} H${x2}" />`);
  };
  for (const n of ev.nodes) {
    if (secOf(n) === 'F') continue;
    for (const k of kids(n)) if (!hidden.has(k.key)) link(pos[k.key], pos[n.key]);
  }
  if (finals.length) for (const r of [finals[0].a, finals[0].b]) { const f = r && pos[r.w]; if (f) link(f, pos[finals[0].key]); }

  const cell = node => {
    const label = node.code || node.label;
    if (node.gameId) { const g = s.games.find(x => x.id === node.gameId); if (g) return compactCard({ ...g, label }, seedFn); }
    const [a, b] = nodeTeams(ev, node);
    if (a === 'BYE' || b === 'BYE') {
      const t = a === 'BYE' ? b : a;
      return placeholderCard(label, [t, 'BYE'], seedFn, { faded: true, note: 'First-round bye', ranks: rankOn });
    }
    const needed = nodeNeeded(ev, node);
    const decidedBy = { g7: 'G6', f3: 'F2', s3: 'S2', ifnec: 'CH' }[node.cond];
    const decided = !!(decidedBy && byKey[decidedBy]?.winner);
    const slotText = (t, ref) => t || (refLabel(ev, ref) ? { text: refLabel(ev, ref) } : null);
    return placeholderCard(label, [slotText(a, node.a), slotText(b, node.b)], seedFn, { ranks: rankOn, faded: !!node.cond && !needed && !!decided, note: node.cond ? (decided && !needed ? 'Not needed' : 'If necessary') : '' });
  };
  return `<div class="bk-scroll"><div class="bk" style="width:${width}px;height:${height}px">
    <svg class="bk-lines" width="${width}" height="${height}" aria-hidden="true">${lines.join('')}</svg>
    ${heads.map(h => `<div class="bk-head ${h.section ? 'bk-sec' : ''}" style="left:${h.x}px;top:${h.y}px;${h.section ? '' : `width:${BK.CW}px`}">${esc(h.text)}${h.day ? ` <span class="muted">· ${esc(DAY_NAMES[h.day] || h.day)}</span>` : ''}</div>`).join('')}
    ${ev.nodes.map(n => pos[n.key] && !hidden.has(n.key) ? `<div class="bk-node" style="left:${pos[n.key].x}px;top:${pos[n.key].y}px;width:${BK.CW}px;height:${BK.H}px">${cell(n)}</div>` : '').join('')}
  </div></div>`;
}

// A link like #/postseason/2031/regionals/reg-3 opens that season's tab and
// scrolls to that bracket. The address then goes back to #/postseason so the
// season picker and tabs keep working.
export function renderPostseason(arg = '') {
  let focus = null;
  if (arg) {
    const [y, tab, ev] = arg.split('/');
    if (ctx.league.seasons[+y] && +y !== ctx.league.viewYear) { ctx.league.viewYear = +y; resetSeasonUi(); }
    if (tab) ui.postTab = tab;
    focus = ev || null;
    history.replaceState(null, '', '#/postseason');
  }
  renderPostseasonPage();
  // After the router's own scroll-to-top for a new page.
  if (focus) setTimeout(() => {
    const el = document.getElementById(`ev-${focus}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800);
  }, 0);
}

function renderPostseasonPage() {
  const s = S(), p = s.post || {};
  const cfg = ncaaConfig(s);
  const defaultTab = { regular: 'conf', conf: 'conf', selection: 'field', regionals: 'regionals', supers: 'supers', mcws: 'mcws', complete: 'mcws' }[s.phase];
  const tabs = { conf: 'Conference tournaments', field: 'Selection', regionals: 'Regionals', ...(hasSupers(cfg) ? { supers: 'Super Regionals' } : {}), participants: 'Participants', mcws: s.settings.mcwsName };
  if (!ui.postTab || !tabs[ui.postTab]) ui.postTab = defaultTab;
  const left = s.games.filter(g => g.type !== 'regular' && !isFinal(g)).length + (s.phase === 'regular' ? 1 : 0);
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Postseason</h1><span class="muted">${PHASE_TEXT[s.phase]}</span><span class="spacer"></span>
      ${s.phase !== 'complete' && s.phase !== 'regular' ? '<button class="btn" id="ps-all">🎲 Sim rest of postseason</button>' : ''}</div>
    ${p.champion ? `<div class="banner" style="background:linear-gradient(120deg, ${esc(teamInfo(p.champion).color)}, #0f2540)"><span class="trophy">🏆</span><div><div class="small" style="opacity:.8">${s.year} National Champion</div><div class="big">${esc(p.champion)}</div><div class="small" style="opacity:.8">Runner-up: ${esc(p.runnerUp)}</div></div></div><div style="height:16px"></div>` : ''}
    <div class="steps">${Object.entries(tabs).map(([k, l]) => `<a href="#/postseason" data-pt="${k}" class="${ui.postTab === k ? 'active' : ''}">${esc(l)}</a>`).join('')}</div>
    <div id="ps"></div>`;
  $$('[data-pt]').forEach(a => (a.onclick = e => { e.preventDefault(); ui.postTab = a.dataset.pt; renderPostseasonPage(); }));
  if ($('#ps-all')) $('#ps-all').onclick = () => {
    if (!confirm('Simulate the rest of the postseason? The NCAA field is announced as proposed if you haven\'t announced it yet.')) return;
    simAndReport(g => g.type !== 'regular', 'in the postseason', { autoLock: true });
  };
  const root = $('#ps');
  ({ conf: renderConfTourneys, field: renderField, regionals: renderRegionals, supers: renderSupers, participants: renderParticipants, mcws: renderMcws })[ui.postTab](root);
  bindGameCards(root);
}

function renderConfTourneys(root) {
  const s = S(), p = s.post || {};
  if (s.phase === 'regular') {
    const left = s.games.filter(g => g.type === 'regular' && !isFinal(g)).length;
    const confs = conferences(s);
    root.innerHTML = `<div class="hint">Conference tournaments are seeded and start automatically when the regular season ends (${left} game${left === 1 ? '' : 's'} left). Tournament sizes can be changed on the Standings page until then. Projected seeds:</div>
      <div class="grid" style="margin-top:14px">${confs.map(c => {
        const n = Object.values(s.teams).filter(t => t.conference === c).length;
        const size = Math.min(n, s.settings.confTourney?.[c] ?? defaultConfTourneySize(n));
        const seeds = confTourneySeeds(s, c).slice(0, size);
        return `<div class="card"><div class="row"><a href="${confHref(c)}">${confLogo(c, 26)}</a><h3 style="margin:0">${esc(c)} Tournament</h3><span class="spacer"></span><span class="muted small">${size ? `Top ${size}, ${confFormatName(confKind(s.settings.confFormat?.[c], size)).toLowerCase()}` : 'No tournament: regular-season champion gets the bid'}</span></div>
          ${size ? hostPicker(s, c) : ''}
          <ol class="seedlist">${seeds.map(t => `<li>${team(t)}</li>`).join('')}</ol></div>`;
      }).join('')}</div>`;
    bindHostPickers(root);
    return;
  }
  const evs = Object.values(p.confT || {});
  const anyOpen = s.games.some(g => g.type === 'conf' && !isFinal(g));
  root.innerHTML = `${anyOpen ? '<div class="row" style="margin-bottom:12px"><span class="spacer"></span><button class="btn primary" id="ct-sim">🎲 Sim conference tournaments</button></div>' : ''}
    ${evs.map(ev => {
      const started = ev.nodes.some(n => n.gameId && s.games.find(g => g.id === n.gameId && isFinal(g)));
      return `<div class="card"><div class="row" style="margin-bottom:10px"><a href="${confHref(ev.conf)}">${confLogo(ev.conf, 28)}</a><h2 style="margin:0">${esc(ev.conf)} Tournament</h2>
        ${ev.champion ? `<span class="badge gold">Champion: ${esc(ev.champion)}</span>` : ''}<span class="spacer"></span>
        ${started ? `<span class="muted small">${confFormatName(ev.kind)}</span>` : `${ev.size >= 3 ? `<select class="sm-select" data-cformat="${esc(ev.conf)}" aria-label="${esc(ev.conf)} tournament format">${CONF_FORMATS.filter(([k]) => k !== 'playin' || ev.size >= 5).map(([k, l]) => `<option value="${k}" ${ev.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}<button class="btn sm" data-reseed="${esc(ev.conf)}">Edit seeds</button>`}</div>
        ${hostPicker(s, ev.conf, ev)}
        <div class="small muted" style="margin-bottom:8px">Seeds: ${ev.seeds.map((t, i) => `${i + 1}. ${esc(t)}`).join(' · ')}</div>
        ${eventBracket(ev, t => ev.seeds.indexOf(t) + 1 || null)}</div>`;
    }).join('')}
    ${!evs.length ? '<div class="empty">No conference tournaments this season.</div>' : ''}`;
  if ($('#ct-sim', root)) $('#ct-sim', root).onclick = () => simAndReport(g => g.type === 'conf', 'in the conference tournaments');
  $$('[data-reseed]', root).forEach(b => (b.onclick = () => editSeeds(b.dataset.reseed)));
  bindHostPickers(root);
  $$('[data-cformat]', root).forEach(sel => (sel.onchange = () => {
    try { setConfFormat(s, sel.dataset.cformat, sel.value); } catch (e) { return toast(e.message, true); }
    changed(); toast(`${sel.dataset.cformat} Tournament is now ${sel.value} elimination.`);
  }));
}

// Tournament host: any school in the conference. It can be changed until
// the tournament is over; games already played stay where they were.
function hostPicker(s, conf, ev = null) {
  const host = ev?.host || confHost(s, conf);
  const teams = Object.values(s.teams).filter(t => t.conference === conf).map(t => t.school).sort();
  const locked = !!ev?.champion;
  const inField = !ev || ev.seeds.includes(host);
  return `<div class="row small host-row" style="margin:6px 0 8px;gap:8px">${logoImg(teamInfo(host), 18)}<span>Hosted by <b>${esc(host)}</b>${inField ? '' : ` <span class="muted">(didn't qualify; every game is still played there)</span>`}</span>
    ${locked ? '' : `<label class="muted" style="display:inline-flex;align-items:center;gap:6px">Change <select class="sm-select" data-host="${esc(conf)}" aria-label="${esc(conf)} tournament host">${teamOptions(host, { blank: false, list: teams })}</select></label>`}</div>`;
}
function bindHostPickers(root) {
  const s = S();
  $$('[data-host]', root).forEach(sel => (sel.onchange = () => {
    setConfHost(s, sel.dataset.host, sel.value);
    changed(); toast(`The ${sel.dataset.host} Tournament is now at ${sel.value}.`);
  }));
}

function editSeeds(conf) {
  const s = S(), ev = s.post.confT[conf];
  const teams = Object.values(s.teams).filter(t => t.conference === conf).map(t => t.school).sort();
  modal.innerHTML = `<div class="modal-head"><h2>${esc(conf)} Tournament seeds</h2><button class="btn ghost" data-x>✕</button></div>
    <div class="modal-body stack">${ev.seeds.map((t, i) => `<label class="field">Seed ${i + 1} <select data-seed="${i}">${teamOptions(t, { blank: false, list: teams })}</select></label>`).join('')}</div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" data-x>Cancel</button><button class="btn primary" id="sd-save">Save seeds</button></div>`;
  $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
  modal.onclose = () => ctx.render();
  $('#sd-save', modal).onclick = () => {
    const seeds = $$('[data-seed]', modal).map(x => x.value);
    if (new Set(seeds).size !== seeds.length) return toast('Each team can only have one seed.', true);
    try { reseedConfTourney(s, conf, seeds); } catch (e) { return toast(e.message, true); }
    modal.close(); changed(); toast('Seeds saved.');
  };
  modal.showModal();
}

function renderField(root) {
  const s = S(), p = s.post || {};
  if (!p.field) {
    const cfg = ncaaConfig(s);
    root.innerHTML = `<div class="empty">The ${fieldSize(cfg)}-team NCAA field is chosen once every conference tournament is finished. It has ${Object.keys(ctx.league.conferences).length ? 'one automatic bid per conference (the tournament champion, or the regular-season champion where there is no tournament)' : 'automatic bids'}, and the rest are at-large picks. The committee orders teams by RPI rank (50%), poll rank (30%) and strength-of-schedule rank (20%) as a starting point; you pick the at-large teams and set the seeds.<br><br>${formatSummary(cfg)} <a href="#/settings">Change the format in Settings.</a></div>`;
    return;
  }
  const r = rpi(s), pr = cache.ranks(), recs = cache.recs(), Q = quadrants(s, r);
  const editable = s.phase === 'selection';
  const confirmed = !editable || !!p.fieldConfirmed;
  const cfg = ncaaConfig(s);
  const B = selectionBoard(s);
  const field = [...p.field].sort((a, b) => a.seed - b.seed);
  const inField = new Set(field.map(f => f.team));
  const crank = Object.fromEntries(B.order.map((t, i) => [t, i + 1]));
  const autos = autoBids(s);
  const via = t => {
    const c = s.teams[t].conference;
    if (s.overrides?.autoBids?.[c]) return 'Commissioner';
    return s.post?.confT?.[c]?.champion === t ? 'Tournament' : 'Reg. season';
  };
  const qcell = (t, i) => { const x = Q[t].rec[i]; return `<td class="num${x.w + x.l ? '' : ' muted'}">${x.w}-${x.l}</td>`; };
  const stats = t => `<td class="num">${recs[t].w}-${recs[t].l}</td><td class="num">${r[t]?.rank ?? ''}</td><td class="num muted">${r[t]?.sosRank ?? ''}</td><td class="num muted">${pr[t] ?? ''}</td>${[0, 1, 2, 3].map(i => qcell(t, i)).join('')}`;
  const head = first => `<thead><tr>${first}<th>Team</th><th class="num">Rec</th><th class="num">RPI</th><th class="num">SOS</th><th class="num">Poll</th><th class="num" title="Record against Quadrant 1 teams (RPI top quarter)">Q1</th><th class="num">Q2</th><th class="num">Q3</th><th class="num">Q4</th></tr></thead>`;
  const teamCell = t => `<td><span class="sel-team">${confLogo(s.teams[t].conference, 16)}${team(t, { rank: false, size: 16 })}</span></td>`;
  const lastIn = new Set(p.lastIn || []), firstOut = new Set(p.firstOut || []);
  const autoRows = B.autos.map(t => `<tr><td class="num muted">${crank[t]}</td>${teamCell(t)}${stats(t)}<td class="small muted">${via(t)}</td></tr>`).join('');
  const boardRows = B.board.map((t, i) => {
    const on = inField.has(t);
    const tag = B.fill.includes(t) ? '<span class="badge manual" title="Not enough teams at .500 or better to fill the field">Below .500 · fills short field</span>' : lastIn.has(t) ? '<span class="badge">Last 4 in</span>' : firstOut.has(t) ? '<span class="badge">First 4 out</span>' : '';
    return `<tr class="${on ? 'sel-in' : ''}${i === B.spots - 1 ? ' cutline' : ''}"><td class="num"><input type="checkbox" data-al="${esc(t)}" ${on ? 'checked' : ''} ${confirmed ? 'disabled' : ''} aria-label="${esc(t)} in the field"></td>${teamCell(t)}${stats(t)}<td class="small">${tag}</td></tr>`;
  }).join('');
  const board = `<div class="card sel-board">
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">Automatic qualifiers · ${B.autos.length}</h2><span class="spacer"></span>${editable ? '<button class="btn sm" id="f-redo">Re-run selection</button>' : ''}</div>
    <div class="table-wrap"><table class="sel-table">${head('<th class="num" title="Committee order">#</th>')}<tbody>${autoRows}</tbody></table></div>
    <div class="row" style="margin:16px 0 6px"><h2 style="margin:0">At-large · ${B.chosen.length} of ${B.spots}</h2><span class="spacer"></span>
      ${editable && !confirmed ? `<button class="btn primary sm" id="f-confirm" ${B.chosen.length === B.spots ? '' : 'disabled'}>Confirm the ${B.size} teams</button>` : ''}</div>
    <div class="small muted" style="margin-bottom:6px">The ${B.spots} at-large spots plus the next 10 teams, in committee order (RPI 50%, poll 30%, SOS 20%). The line marks the committee's cut. Teams with a losing record can't take an at-large spot.${editable && !confirmed ? ' Check or uncheck teams to set the field.' : ''}</div>
    <div class="table-wrap"><table class="sel-table">${head('<th class="num">In</th>')}<tbody>${boardRows}</tbody></table></div>
    ${(() => { const cut = B.order.indexOf(B.board[B.board.length - 1]); const skipped = B.ineligible.filter(t => B.order.indexOf(t) < cut); return skipped.length ? `<p class="small muted" style="margin:8px 0 0"><b>Not eligible (losing record):</b> ${skipped.map(t => `${esc(t)} ${recs[t].w}-${recs[t].l}`).join(', ')}</p>` : ''; })()}
    <p class="small muted" style="margin:8px 0 0">Quadrants split every team into quarters by RPI rank: Q1 is the top ${Math.ceil(Object.keys(s.teams).length / 4)}. Q1–Q4 are each team's record against teams in that quadrant.</p>
  </div>`;
  const seedRows = field.map((f, i) => `<div class="seed-row${i < cfg.regionals ? ' host' : ''}"><span class="seed-n">${f.seed}</span><span class="seed-team">${team(f.team, { rank: false, size: 16 })}</span>${i < cfg.regionals ? '<span class="badge gold">Host</span>' : ''}
    ${editable ? `<span class="seed-btns"><button class="btn sm" data-fup="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button class="btn sm" data-fdown="${i}" ${i < field.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span>` : ''}</div>`).join('');
  const seeding = `<div class="card sel-seeds"><h2 style="margin:0 0 4px">Seeds 1–${field.length}</h2>
    ${confirmed ? `<div class="small muted" style="margin-bottom:8px">The top ${cfg.regionals} host. Regionals are built serpentine (seed 1 with seed ${cfg.regionals * 2}${cfg.perRegional > 2 ? `, ${cfg.regionals * 2 + 1}` : ''}…).</div><div class="seed-list">${seedRows}</div>
      ${editable ? '<div class="stack" style="margin-top:12px;gap:8px"><button class="btn primary" id="f-lock">Announce field & start regionals</button><button class="btn" id="f-unconfirm">Change teams</button></div>' : ''}`
      : `<p class="muted small">Pick the at-large teams and confirm them, then set the seeds here.</p>`}
  </div>`;
  const podList = pods(field, cfg.regionals);
  root.innerHTML = `
    ${editable ? `<div class="hint">1. Pick the at-large teams (automatic qualifiers are in). 2. Confirm the ${B.size} teams. 3. Order seeds 1–${B.size}; the regional preview updates as you go. 4. Announce the field.<br>${formatSummary(cfg)}</div>` : ''}
    <div class="sel-layout">${board}${seeding}${confirmed ? regionalPreview(s, field, podList, r) : '<div class="card reg-preview"><h2 style="margin:0 0 4px">Regional preview</h2><p class="muted small">Shows up once the teams are confirmed.</p></div>'}</div>`;
  if (!editable) return;
  const setField = list => { p.field = list.map((f, i) => ({ ...f, seed: i + 1 })); changed({ progress: false }); };
  $$('[data-al]', root).forEach(cb => (cb.onchange = () => {
    try { setAtLarge(s, cb.dataset.al, cb.checked); } catch (e) { cb.checked = !cb.checked; return toast(e.message, true); }
    changed({ progress: false });
  }));
  $$('[data-fup]', root).forEach(b => (b.onclick = () => { const i = +b.dataset.fup; [field[i - 1], field[i]] = [field[i], field[i - 1]]; setField(field); }));
  $$('[data-fdown]', root).forEach(b => (b.onclick = () => { const i = +b.dataset.fdown; [field[i + 1], field[i]] = [field[i], field[i + 1]]; setField(field); }));
  $('#f-redo', root).onclick = () => { if (confirm('Throw out your changes and re-run the committee selection?')) { proposeField(s); changed({ progress: false }); } };
  if ($('#f-confirm', root)) $('#f-confirm', root).onclick = () => { try { confirmField(s); } catch (e) { return toast(e.message, true); } changed({ progress: false }); toast('Teams confirmed. Now set the seeds.'); };
  if ($('#f-unconfirm', root)) $('#f-unconfirm', root).onclick = () => { unconfirmField(s); changed({ progress: false }); };
  if ($('#f-lock', root)) $('#f-lock', root).onclick = () => { lockField(s); ui.postTab = 'regionals'; changed(); toast('Field announced. Regionals are set.'); };
}

// Side panel on the Selection tab: each regional as it stands, with every
// team's conference, so the commissioner can keep regionals even. Teams from
// the same conference in one regional are flagged, and each regional's
// average OVR is compared with the field's.
function regionalPreview(s, field, podList, r) {
  const seedOf = t => field.find(f => f.team === t)?.seed;
  const avg = list => list.reduce((a, t) => a + ovr(s.teams[t]), 0) / (list.length || 1);
  const all = avg(field.map(f => f.team));
  const strengths = podList.map(avg);
  const spread = Math.max(...strengths) - Math.min(...strengths);
  const boxes = podList.map((teams, i) => {
    const confs = {};
    for (const t of teams) (confs[s.teams[t].conference] ||= []).push(t);
    const dupes = Object.entries(confs).filter(([, l]) => l.length > 1);
    const d = strengths[i] - all;
    return `<div class="reg-prev${dupes.length ? ' clash' : ''}">
      <div class="reg-prev-head"><span class="reg-prev-title">${esc(teams[0])} Regional</span><span class="reg-prev-ovr" title="Average OVR of the regional's teams, compared with the whole field">OVR ${strengths[i].toFixed(1)} <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}</span></span></div>
      ${teams.map((t, k) => { const c = s.teams[t].conference, dup = confs[c].length > 1; return `<div class="reg-prev-row${dup ? ' dup' : ''}">
        <span class="reg-prev-seed">${k + 1}</span><span class="reg-prev-team">${team(t, { rank: false, size: 16 })}</span>
        <span class="reg-prev-conf" title="${esc(c)}">${confLogo(c, 18)}${confInfo(c).logo ? `<span>${esc(confInfo(c).abbr || c)}</span>` : ''}</span>
        <span class="reg-prev-num" title="National seed / RPI rank">#${seedOf(t)} · ${r[t]?.rank ?? '–'}</span></div>`; }).join('')}
      ${dupes.length ? `<div class="reg-prev-warn">⚠ Same conference: ${dupes.map(([c, l]) => `${esc(c)} (${l.length})`).join(', ')}</div>` : ''}
    </div>`;
  }).join('');
  const clashes = podList.filter(teams => new Set(teams.map(t => s.teams[t].conference)).size < teams.length).length;
  return `<aside class="card reg-preview"><h2 style="margin:0 0 4px">Regional preview</h2>
    <div class="small muted" style="margin-bottom:10px">Seed in the regional, national seed · RPI rank. ${clashes ? `<b class="warn-text">${clashes} regional${clashes > 1 ? 's have' : ' has'} conference rivals together.</b>` : 'No conference rivals share a regional.'} Strongest to weakest regional: ${spread.toFixed(1)} OVR.</div>
    <div class="reg-prev-list">${boxes}</div></aside>`;
}

function renderRegionals(root) {
  const s = S(), p = s.post || {};
  if (!p.regionals) { root.innerHTML = '<div class="empty">Regionals begin once the NCAA field is announced.</div>'; return; }
  const open = s.games.some(g => g.type === 'regional' && !isFinal(g));
  const seed = t => shownSeed(s, t);
  const named = t => `${esc(t)}${seed(t) ? ` (${seed(t)})` : ''}`;
  root.innerHTML = `${open ? '<div class="row" style="margin-bottom:12px"><span class="spacer"></span><button class="btn primary" id="rg-sim">🎲 Sim regionals</button></div>' : ''}
    ${p.regionals.map(ev => `<div class="card" id="ev-${esc(ev.id)}"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">${esc(ev.name)}</h2>${ev.champion ? `<span class="badge gold">Champion: ${esc(ev.champion)}</span>` : ''}</div>
      <div class="small muted" style="margin-bottom:8px">${ev.seeds.map(named).join(' · ')} · ${ev.kind === 'series' ? 'best of three' : 'double elimination'}, hosted by ${esc(ev.host)}</div>
      ${eventBracket(ev, seed)}</div>`).join('')}`;
  if ($('#rg-sim', root)) $('#rg-sim', root).onclick = () => simAndReport(g => g.type === 'regional', 'in the regionals');
}

function renderSupers(root) {
  const s = S(), p = s.post || {};
  if (!p.supers) { root.innerHTML = '<div class="empty">Super regionals start once every regional is finished. Each one is a best-of-three series between two regional champions, hosted by the higher national seed.</div>'; return; }
  const open = s.games.some(g => g.type === 'super' && !isFinal(g));
  const seed = t => shownSeed(s, t);
  const named = t => `${esc(t)}${seed(t) ? ` (${seed(t)})` : ''}`;
  root.innerHTML = `${open ? '<div class="row" style="margin-bottom:12px"><span class="spacer"></span><button class="btn primary" id="sr-sim">🎲 Sim super regionals</button></div>' : ''}
    <div class="stack-cards">${p.supers.map(ev => `<div class="card" id="ev-${esc(ev.id)}"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">${esc(ev.name)}</h2>${ev.champion ? `<span class="badge gold">To the WCWS: ${esc(ev.champion)}</span>` : ''}</div>
      <div class="small muted" style="margin-bottom:8px">${ev.seeds.map(named).join(' vs ')} · best of three at ${esc(ev.host)}</div>
      ${eventBracket(ev, seed)}</div>`).join('')}</div>`;
  if ($('#sr-sim', root)) $('#sr-sim', root).onclick = () => simAndReport(g => g.type === 'super', 'in the super regionals');
}

// The WCWS field, like the "Participants" table on a tournament's encyclopedia
// page: each qualifier's record entering the WCWS, coach, the regional (or
// super regional) it won, and its WCWS history in this dynasty before this season.
const ordinal = n => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
function renderParticipants(root) {
  const s = S(), p = s.post || {}, cfg = ncaaConfig(s);
  const supers = hasSupers(cfg);
  const stage = (supers ? p.supers : p.regionals) || [];
  const stageName = supers ? 'Super Regional' : 'Regional';
  if (!stage.length) {
    root.innerHTML = `<div class="empty">The ${esc(s.settings.mcwsName)} field fills in as ${supers ? 'super regionals' : 'regionals'} finish. Each ${stageName.toLowerCase()} champion advances.</div>`;
    return;
  }
  const entering = records(s, g => g.type !== 'mcws');
  const order = [...stage].map((ev, i) => [ev.path ?? i, ev]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const coachCell = t => {
    const id = s.teams[t]?.coachId, c = id && ctx.league.coaches?.[id];
    return c ? `<a class="team-link" href="#/coach/${encodeURIComponent(id)}">${esc(c.name)}</a>` : '<span class="muted">—</span>';
  };
  const rows = order.map(ev => {
    const t = ev.champion;
    const where = esc(ev.name || `${ev.host} ${stageName}`);
    if (!t) return `<tr class="muted"><td colspan="4"><i>Winner of the ${where}</i></td><td>${where}</td><td colspan="3"></td></tr>`;
    const r = entering[t], c = s.teams[t].conference, h = mcwsHistory(ctx.league, t, s.year);
    const history = h.apps
      ? `<td class="c">${h.apps}<div class="small muted">(last: ${h.last})</div></td>
         <td class="c">${h.best ? `${h.best.tied ? 'T-' : ''}${ordinal(h.best.place)}<div class="small muted">(${h.bestYears.join(', ')})</div>` : '—'}</td>
         <td class="c">${h.w}–${h.l}</td>`
      : '<td colspan="3" class="c"><i>First appearance</i></td>';
    return `<tr><td>${team(t, { rank: false, seed: shownSeed(s, t) })}</td>
      <td><span class="row" style="gap:6px;flex-wrap:nowrap">${confLogo(c, 18)}<span>${esc(c)}</span></span></td>
      <td class="c">${r.w}–${r.l}<div class="small muted">(${r.cw}–${r.cl})</div></td>
      <td>${coachCell(t)}</td><td>${where}</td>${history}</tr>`;
  }).join('');
  const done = order.filter(ev => ev.champion).length;
  root.innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">${esc(s.settings.mcwsName)} participants</h2><span class="spacer"></span><span class="muted small">${done} of ${order.length} spots filled</span></div>
    <div class="table-wrap"><table class="participants"><thead><tr><th>School</th><th>Conference</th><th class="c">Record<div class="small">(Conf)</div></th><th>Head coach</th><th>${stageName}</th><th class="c">Previous WCWS<div class="small">appearances</div></th><th class="c">WCWS best<div class="small">finish</div></th><th class="c">WCWS W–L<div class="small">record</div></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">Records are before the ${esc(s.settings.mcwsName)}, with the conference record in parentheses. WCWS history counts seasons in this dynasty before ${s.year}.</p></div>`;
}

function renderMcws(root) {
  const s = S(), p = s.post || {}, cfg = ncaaConfig(s);
  const name = esc(s.settings.mcwsName);
  const v = mcwsVenue(s);
  const venueBar = `<div class="venue-bar"><span class="venue-kicker">Home of the ${name}</span><span class="venue-name">${esc(v.stadium)}</span>${v.city ? `<span class="venue-city">${esc(v.city)}</span>` : ''}</div>`;
  if (!p.mcws && !p.mcwsBrackets) {
    root.innerHTML = `${venueBar}<div class="empty">${cfg.wsSize === 8
      ? `Eight teams reach the ${name}. They split into Bracket A and Bracket B, each a four-team double elimination with an "if necessary" bracket final. The two bracket winners play a best-of-three Championship Series.`
      : `Four teams reach the ${name}: double elimination down to two teams, then a best-of-three Championship Series.`}</div>`;
    return;
  }
  const open = s.games.some(g => g.type === 'mcws' && !isFinal(g));
  const seed = t => shownSeed(s, t);
  const named = t => `${esc(t)}${seed(t) ? ` (${seed(t)})` : ''}`;
  const card = (ev, title, sub, opts) => `<div class="card"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">${title}</h2>${ev.champion ? `<span class="badge gold">${ev.id === 'ws-F' || ev.id === 'mcws' ? 'Champion' : 'Bracket winner'}: ${esc(ev.champion)}</span>` : ''}</div>
    <div class="small muted" style="margin-bottom:8px">${sub}</div>${eventBracket(ev, seed, opts)}</div>`;
  const list = ev => ev.seeds.map(named).join(' · ');
  // 8-team format: Bracket A and B on the left, the Championship Series
  // centered beside them on the right, its games stacked.
  const finals = p.mcwsFinals
    ? card(p.mcwsFinals, 'Championship Series', `${list(p.mcwsFinals)} · best of three`, { stack: true })
    : '<div class="card"><h2>Championship Series</h2><p class="muted">The Bracket A and Bracket B winners meet in a best-of-three series.</p></div>';
  root.innerHTML = `<div class="row venue-row">${venueBar}<span class="spacer"></span>${open ? '<button class="btn primary" id="mc-sim">🎲 Sim the WCWS</button>' : ''}</div>
    ${p.mcws ? card(p.mcws, name, list(p.mcws)) : ''}
    ${p.mcwsBrackets ? `<div class="ws-layout"><div class="ws-brackets">${p.mcwsBrackets.map(ev => card(ev, `${name} · ${esc(ev.name)}`, `${list(ev)} · double elimination`, { colw: 312 })).join('')}</div>
      <div class="ws-finals">${finals}</div></div>` : ''}`;
  if ($('#mc-sim', root)) $('#mc-sim', root).onclick = () => simAndReport(g => g.type === 'mcws', 'in the WCWS');
}
