// League pages: teams, team profiles, conferences, history, settings.

import { ctx, S, app, modal, $, $$, esc, toast, changed, persist, flushSave, cache, team, teamInfo, logoImg, teamOptions, teamHref, confLogo, confHref, confInfo, confColor, imageFileToDataUrl, readableOn, openGame, resultText } from './ui.js?v=20261014155521';
import { isFinal, winnerOf, records, rpi, confStandings, regSeasonChamp, regSeasonChamps } from './standings.js?v=20261014155521';
import { ovr } from './sim.js?v=20261014155521';
import { latestPoll, pollRankMap, pollSizeOf, POLL_SIZES, DEFAULT_POLL_SIZE } from './polls.js?v=20261014155521';
import { addTeam, removeTeam, renameTeam, addConference, renameConference, deleteConference, rebuildSchedule, startNextSeason, weekName, newLeague, beginOffseason, draftRemoveTeam, draftRestoreTeam, draftWarnings, coachName, coachSchool, hireCoach, newCoach, availableCoaches, backfillHitsErrors, placeRemaining, clearPoints, pointsLeft, migrateLeague } from './league.js?v=20261014155521';
import { hotSeat, HEAT } from './hotseat.js?v=20261014155521';
import { setRating } from './ratings.js?v=20261014155521';
import { confFormatName, postseasonFinish, postseasonDetail, wsTeams, postWeeks, regWeeksOf, ncaaConfig, ncaaProblems, fieldSize, hasSupers, formatSummary, proposeField, DEFAULT_NCAA } from './postseason.js?v=20261014155521';
import { MIDWEEK, DEFAULT_REG_WEEKS } from './schedule.js?v=20261014155521';
import { exportLeague, clearLeague } from './store.js?v=20261014155521';
import { clamp, fmtPct } from './util.js?v=20261014155521';
import { recordBook, teamPollHistory, headToHead } from './records.js?v=20261014155521';

const ui = { confFilter: '', ncaaDraft: null, teamSort: { k: 'ovr', dir: -1 }, coachSort: { k: 'now', dir: -1 }, teamTab: 'season', h2hSort: { k: 'g', dir: -1 }, h2hFilter: 'all' };

// Click-to-sort table headers. `state` is { k, dir }; clicking the sorted
// column flips the direction, clicking another starts high-to-low (A-Z for text).
function sortTh(state, k, label, { num = true, text = false, title = '' } = {}) {
  const on = state.k === k;
  return `<th class="${num ? 'num ' : ''}sortable${on ? ' sorted' : ''}" data-sort="${k}" data-text="${text ? 1 : ''}" ${title ? `title="${esc(title)}"` : ''} aria-sort="${on ? (state.dir < 0 ? 'descending' : 'ascending') : 'none'}">${label}${on ? (state.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`;
}
function bindSort(state, rerender) {
  $$('[data-sort]').forEach(th => (th.onclick = () => {
    const k = th.dataset.sort;
    if (state.k === k) state.dir *= -1; else { state.k = k; state.dir = th.dataset.text ? 1 : -1; }
    rerender();
  }));
}
function sortBy(list, state, val) {
  return [...list].sort((a, b) => {
    const x = val(a, state.k), y = val(b, state.k);
    const c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : (x ?? -Infinity) - (y ?? -Infinity);
    return c * state.dir;
  });
}
const rate = v => clamp(Math.round(Number(v) || 0), 40, 99);

function ratingBar(label, v, color, pre = null) {
  const pct = ((v - 40) / 59) * 100;
  const d = pre == null ? 0 : v - pre;
  return `<div class="rbar"><span class="rl">${label}</span><div class="rtrack"><div style="width:${pct}%;background:${esc(color)}"></div>${pre != null && d ? `<i class="rpre" style="left:${((pre - 40) / 59) * 100}%" title="Preseason ${pre}"></i>` : ''}</div><span class="rv">${v}</span><span class="rd ${d > 0 ? 'good' : d < 0 ? 'bad' : 'muted'}">${pre == null ? '' : d ? (d > 0 ? '+' : '') + d : '—'}</span></div>`;
}
const ovrOf = r => Math.round(r.off * 0.4 + r.pit * 0.4 + r.def * 0.2);

// ---------- Coaches (shared pieces) ----------

// Dropdown for a team's head coach. Choosing a coach who leads another
// program hires them away and leaves that job open.
function coachSelect(teams, school, attr) {
  const L = ctx.league, cur = teams[school]?.coachId;
  const avail = availableCoaches(L, teams);
  const others = Object.values(teams).filter(t => t.school !== school && t.coachId).sort((a, b) => coachName(L, a.coachId).localeCompare(coachName(L, b.coachId)));
  return `<select class="coach-sel ${cur ? '' : 'vacant'}" ${attr}="${esc(school)}" aria-label="${esc(school)} head coach">
    ${cur ? `<option value="${cur}" selected>${esc(coachName(L, cur))}</option>` : ''}
    <option value="" ${cur ? '' : 'selected'}>— Vacant —</option>
    ${avail.length ? `<optgroup label="Available">${avail.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>` : ''}
    ${others.length ? `<optgroup label="Hire from another program">${others.map(t => `<option value="${t.coachId}">${esc(coachName(L, t.coachId))} (${esc(t.school)})</option>`).join('')}</optgroup>` : ''}
    <option value="__new">+ New coach…</option></select>`;
}

function askCoachName(title, value = '') {
  return new Promise(resolve => {
    modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost" data-x>✕</button></div>
      <div class="modal-body stack"><label class="field">Coach's name <input type="text" id="cn-name" value="${esc(value)}" autocomplete="off"></label></div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn" data-x>Cancel</button><button class="btn primary" id="cn-save">Save</button></div>`;
    let result = null;
    $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
    modal.onclose = () => resolve(result);
    const save = () => { const v = $('#cn-name', modal).value.trim(); if (!v) return toast("Type the coach's name.", true); result = v; modal.close(); };
    $('#cn-save', modal).onclick = save;
    $('#cn-name', modal).onkeydown = e => { if (e.key === 'Enter') save(); };
    modal.showModal();
    $('#cn-name', modal).focus();
  });
}

function bindCoachSelects(teams, attr) {
  $$(`[${attr}]`).forEach(sel => (sel.onchange = async () => {
    const school = sel.getAttribute(attr), L = ctx.league;
    let id = sel.value;
    if (id === '__new') {
      const name = await askCoachName(`New head coach for ${school}`);
      if (!name) return ctx.render();
      id = newCoach(L, name);
    }
    const from = hireCoach(teams, school, id || null);
    changed({ progress: false });
    toast(from ? `${coachName(L, id)} leaves ${from} for ${school}. ${from} needs a new coach.` : id ? `${coachName(L, id)} is ${school}'s head coach.` : `${school}'s head coach job is open.`);
  }));
}

// ---------- Teams ----------

export function renderTeams() {
  const s = S(), recs = cache.recs(), pr = cache.ranks();
  const confs = Object.keys(ctx.league.conferences).filter(c => !ctx.league.conferences[c].retired);
  const st = ui.teamSort;
  const pct = t => { const r = recs[t.school]; return r.w + r.l ? r.w / (r.w + r.l) : 0; };
  const val = (t, k) => ({ team: t.school, coach: coachName(ctx.league, t.coachId) || '~', conf: t.conference, off: t.off, pit: t.pit, def: t.def, ovr: t.off * 0.4 + t.pit * 0.4 + t.def * 0.2, rec: pct(t), poll: pr[t.school] ? -pr[t.school] : null })[k];
  const list = sortBy(Object.values(s.teams).filter(t => !ui.confFilter || t.conference === ui.confFilter), st, val);
  app.innerHTML = `
    <div class="section-head"><h1>${s.year} Teams</h1><span class="muted">${Object.keys(s.teams).length} teams</span><span class="spacer"></span><button class="btn primary" id="t-add">+ Add team</button></div>
    <div class="chips"><button class="chip ${!ui.confFilter ? 'active' : ''}" data-cf="">All</button>${confs.map(c => `<button class="chip ${ui.confFilter === c ? 'active' : ''}" data-cf="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="card"><div class="table-wrap"><table class="teams-table">
      <thead><tr><th class="num">#</th>${sortTh(st, 'team', 'Team', { num: false, text: true })}${sortTh(st, 'coach', 'Head coach', { num: false, text: true })}${sortTh(st, 'conf', 'Conference', { num: false, text: true })}${sortTh(st, 'off', 'OFF')}${sortTh(st, 'pit', 'PIT')}${sortTh(st, 'def', 'DEF')}${sortTh(st, 'ovr', 'OVR')}${sortTh(st, 'rec', 'Record', { title: 'Sort by winning percentage' })}${sortTh(st, 'poll', 'Poll')}</tr></thead>
      <tbody>${list.map((t, i) => `<tr><td class="num muted">${i + 1}</td><td>${team(t.school, { rank: false })}</td>
        <td>${coachSelect(s.teams, t.school, 'data-coach')}</td>
        <td><select data-conf="${esc(t.school)}">${confs.map(c => `<option ${c === t.conference ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        ${['off', 'pit', 'def'].map(k => `<td class="num"><input type="number" min="40" max="99" class="rin" data-rate="${k}" data-team="${esc(t.school)}" value="${t[k]}"></td>`).join('')}
        <td class="num"><b data-ovr="${esc(t.school)}">${ovr(t)}</b>${t.base && ovr(t) !== ovrOf(t.base) ? ` <span class="rd ${ovr(t) > ovrOf(t.base) ? 'good' : 'bad'}" title="Since preseason">${ovr(t) > ovrOf(t.base) ? '▲' : '▼'}${Math.abs(ovr(t) - ovrOf(t.base))}</span>` : ''}</td><td class="num">${recs[t.school].w}-${recs[t.school].l}</td><td class="num muted">${pr[t.school] ?? ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Click a column header to sort (click again to flip it). Ratings run 40–99. OVR = 40% OFF (hitting) + 40% PIT (pitching) + 20% DEF (fielding). Ratings also move during the season with results (▲▼ shows the change since preseason); Settings controls how much. Changes you make apply to games simulated from now on. Moving a team to another conference doesn't change games already scheduled; rebuild the schedule in Settings before the season starts, or edit games on the Schedule page.</p></div>`;
  $$('[data-cf]').forEach(b => (b.onclick = () => { ui.confFilter = b.dataset.cf; renderTeams(); }));
  bindSort(st, renderTeams);
  $$('[data-rate]').forEach(inp => (inp.onchange = () => {
    const t = s.teams[inp.dataset.team];
    setRating(t, inp.dataset.rate, rate(inp.value)); inp.value = t[inp.dataset.rate];
    $(`[data-ovr="${CSS.escape(t.school)}"]`).textContent = ovr(t);
    persist();
  }));
  $$('[data-conf]').forEach(sel => (sel.onchange = () => { s.teams[sel.dataset.conf].conference = sel.value; changed({ progress: false }); }));
  bindCoachSelects(s.teams, 'data-coach');
  $('#t-add').onclick = () => teamForm(s.teams, {
    note: !s.games.some(g => g.type === 'regular' && isFinal(g)) ? 'rebuild' : 'played',
    after: f => { if (f.rebuild) rebuildSchedule(s, ctx.league.seasons[s.year - 1] || null); },
  });
}

// Add-team form. `teams` is where the team goes: the current season's teams
// or next season's (offseason).
function teamForm(teams, { note = null, after = () => {}, conference = null } = {}) {
  const confs = Object.keys(ctx.league.conferences).filter(c => !ctx.league.conferences[c].retired);
  modal.innerHTML = `<div class="modal-head"><h2>Add a team</h2><button class="btn ghost" data-x>✕</button></div>
    <div class="modal-body stack">
      <div class="row"><label class="field" style="flex:2;min-width:160px">School <input type="text" id="f-school" placeholder="e.g. Oregon State"></label>
        <label class="field" style="flex:1;min-width:110px">Mascot <input type="text" id="f-mascot" placeholder="Beavers"></label>
        <label class="field" style="width:90px">Abbr. <input type="text" id="f-abbr" maxlength="5" placeholder="ORST"></label></div>
      <div class="row"><label class="field" style="flex:1;min-width:160px">Head coach <select id="f-coachsel"><option value="__new">New coach (type the name)</option>${availableCoaches(ctx.league, teams).map(c => `<option value="${c.id}">${esc(c.name)} (available)</option>`).join('')}</select></label>
        <label class="field" style="flex:1;min-width:160px" id="f-coachname-wrap">New coach's name <input type="text" id="f-coach" placeholder="Coach's name"></label></div>
      <div class="row">
        <label class="field" style="flex:1;min-width:160px">Conference <select id="f-conf">${confs.map(c => `<option ${c === conference ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field">Color <input type="color" id="f-color" value="#DC4405"></label><label class="field">Alt color <input type="color" id="f-alt" value="#000000"></label>
        ${['off', 'pit', 'def'].map(k => `<label class="field" style="width:80px">${k.toUpperCase()} <input type="number" min="40" max="99" id="f-${k}" value="65"></label>`).join('')}</div>
      ${note === 'rebuild' ? '<label class="check"><input type="checkbox" id="f-rebuild" checked> Rebuild this season\'s schedule to include the new team</label>'
        : note === 'played' ? '<p class="small muted">Games have been played this season, so the new team starts with an empty schedule. Add its games on the Schedule page, or add teams in the offseason so they get a full schedule.</p>' : ''}
    </div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" data-x>Cancel</button><button class="btn primary" id="f-save">Add team</button></div>`;
  $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
  modal.onclose = () => ctx.render();
  $('#f-coachsel', modal).onchange = e => { $('#f-coachname-wrap', modal).style.display = e.target.value === '__new' ? '' : 'none'; };
  $('#f-save', modal).onclick = () => {
    const v = id => $(id, modal).value.trim();
    try {
      const pick = v('#f-coachsel');
      addTeam(ctx.league, teams, { school: v('#f-school'), mascot: v('#f-mascot'), coachId: pick === '__new' ? null : pick, coachName: pick === '__new' ? v('#f-coach') : '', abbr: v('#f-abbr').toUpperCase() || undefined, conference: v('#f-conf'), color: v('#f-color'), altColor: v('#f-alt'), off: rate(v('#f-off')), pit: rate(v('#f-pit')), def: rate(v('#f-def')) });
      after({ rebuild: !!$('#f-rebuild', modal)?.checked });
    } catch (e) { return toast(e.message, true); }
    modal.close(); changed({ progress: false }); toast('Team added.');
  };
  modal.showModal();
}

function conferenceForm(after = () => {}) {
  modal.innerHTML = `<div class="modal-head"><h2>Add a conference</h2><button class="btn ghost" data-x>✕</button></div>
    <div class="modal-body stack"><div class="row"><label class="field" style="flex:1;min-width:160px">Name <input type="text" id="cf-name" placeholder="e.g. West Coast"></label>
      <label class="field" style="width:90px">Abbr. <input type="text" id="cf-abbr" maxlength="5"></label><label class="field">Color <input type="color" id="cf-color" value="#2C5F8A"></label></div>
      <p class="small muted">Then move teams into it. Each conference gets an automatic NCAA bid.</p></div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" data-x>Cancel</button><button class="btn primary" id="cf-save">Add conference</button></div>`;
  $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
  modal.onclose = () => ctx.render();
  $('#cf-save', modal).onclick = () => {
    try { addConference(ctx.league, $('#cf-name', modal).value, { abbr: $('#cf-abbr', modal).value.trim().toUpperCase() || undefined, color: $('#cf-color', modal).value }); }
    catch (e) { return toast(e.message, true); }
    after(); modal.close(); changed({ progress: false }); toast('Conference added.');
  };
  modal.showModal();
}

// ---------- Offseason ----------

// The hot-seat list for a finished season. Past results don't change in the
// offseason, so it's worked out once per season.
const hotSeatCache = new WeakMap();
function hotSeatFor(L) {
  const se = L.seasons[L.currentYear];
  if (!hotSeatCache.has(se)) hotSeatCache.set(se, hotSeat(L));
  return hotSeatCache.get(se);
}
const ordinalWord = n => ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][n - 1] || `${n}th`;

export function renderOffseason() {
  const L = ctx.league, cur = L.seasons[L.currentYear];
  if (cur.phase !== 'complete') {
    app.innerHTML = `<div class="section-head"><h1>Offseason</h1></div><div class="empty">The offseason opens once the ${cur.year} national champion is crowned. Then you can add teams and conferences and realign before the ${cur.year + 1} season.</div>`;
    return;
  }
  const d = beginOffseason(L);
  d.moves ||= [];
  persist();
  const prev = cur.teams, prevRecs = records(cur);
  const confs = Object.keys(L.conferences).filter(c => !L.conferences[c].retired);
  const teams = Object.values(d.teams);
  const warnings = draftWarnings(L);
  const moved = t => prev[t.school] && prev[t.school].conference !== t.conference;
  const careers = coachCareers();
  const rec = t => prevRecs[t] ? `${prevRecs[t].w}-${prevRecs[t].l}` : '';
  // A rating with − and + buttons and its change since last season.
  const ratingCell = (t, k) => {
    const from = t.dev?.start?.[k] ?? prev[t.school]?.[k];
    const x = from != null ? t[k] - from : 0;
    return `<td class="num"><span class="rstep"><button class="btn sm" data-step="-1" data-k="${k}" data-team="${esc(t.school)}" aria-label="Lower ${k.toUpperCase()}">−</button><input type="number" min="40" max="99" class="rin" data-drate="${k}" data-team="${esc(t.school)}" value="${t[k]}" aria-label="${esc(t.school)} ${k.toUpperCase()}"><button class="btn sm" data-step="1" data-k="${k}" data-team="${esc(t.school)}" aria-label="Raise ${k.toUpperCase()}">+</button></span><span class="delta ${x > 0 ? 'good' : x < 0 ? 'bad' : ''}" data-delta="${k}">${x ? (x > 0 ? '+' : '') + x : ''}</span></td>`;
  };
  const pointsCell = t => {
    if (!t.dev) return '<td class="num muted small">New</td>';
    const left = pointsLeft(t), p = t.dev.pts;
    // For negative points, "left" counts down toward zero as ratings are lowered.
    const label = left === 0 ? 'all placed' : Math.sign(left) === Math.sign(p) && p !== 0 ? `${Math.abs(left)} ${p < 0 ? 'to take off' : 'to place'}` : `${Math.abs(left)} over`;
    return `<td class="num pts-cell"><b class="pts-big ${p > 0 ? 'good' : p < 0 ? 'bad' : ''}" title="Points earned this offseason">${p > 0 ? '+' : ''}${p}</b>
      <div class="small ${left ? 'warn-text' : 'muted'}">${label}</div>
      <div class="pts-btns">${left ? `<button class="btn sm" data-auto="${esc(t.school)}" title="Place the remaining points at random">Auto</button>` : ''}${left !== p ? `<button class="btn sm ghost" data-clear="${esc(t.school)}" title="Undo this team's placements">Reset</button>` : ''}</div></td>`;
  };
  const coachCell = t => {
    const id = t.coachId;
    return `<td><div class="coach-cell">${id ? `<a class="team-link" href="${coachHref(id)}">${esc(coachName(L, id))}</a>` : '<span class="badge manual">Vacant</span>'}
      <button class="btn sm" data-hire="${esc(t.school)}">${id ? 'Change' : 'Hire'}</button>${id ? `<button class="btn sm ghost" data-fire="${esc(t.school)}" title="Fire ${esc(coachName(L, id))}" aria-label="Fire coach">✕</button>` : ''}</div></td>`;
  };
  const card = c => {
    const list = teams.filter(t => t.conference === c).sort((a, b) => a.school.localeCompare(b.school));
    return `<div class="card off-conf"><div class="row" style="margin-bottom:8px">${confLogo(c, 28)}<h2 style="margin:0">${esc(c)}</h2><span class="muted small">${list.length} team${list.length === 1 ? '' : 's'}</span><span class="spacer"></span><button class="btn sm" data-addto="${esc(c)}">+ Team</button></div>
      ${list.length ? `<div class="table-wrap"><table class="off-table"><thead><tr><th>Team</th><th>Head coach</th><th class="num" title="Rating points earned from last season's results, plus luck">Points</th><th class="num">OFF</th><th class="num">PIT</th><th class="num">DEF</th><th class="num">OVR</th><th>Conference</th><th></th></tr></thead><tbody>
        ${list.map(t => `<tr data-row="${esc(t.school)}"><td><span class="team">${logoImg(t, 18)}${prev[t.school] ? `<a class="team-link" href="${teamHref(t.school)}">${esc(t.school)}</a>` : esc(t.school)}</span>${!prev[t.school] ? ' <span class="badge real">New</span>' : moved(t) ? ` <span class="badge manual" title="From ${esc(prev[t.school].conference)}">Moved</span>` : ''}${prev[t.school] ? `<div class="small muted">${rec(t.school)} in ${cur.year}</div>` : ''}</td>
          ${coachCell(t)}${pointsCell(t)}
          ${['off', 'pit', 'def'].map(k => ratingCell(t, k)).join('')}
          <td class="num ovr-cell"><b>${ovr(t)}</b></td>
          <td><select data-dconf="${esc(t.school)}" aria-label="Move ${esc(t.school)}">${confs.map(x => `<option ${x === c ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
          <td><button class="btn sm danger" data-drm="${esc(t.school)}" title="Leave the dynasty">✕</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">No teams yet. Move teams in with the Conference menus, or add a new one.</p>'}
      ${!list.length ? `<button class="btn sm danger" data-delconf="${esc(c)}">Delete conference</button>` : ''}</div>`;
  };
  // ---- coaching carousel ----
  const open = teams.filter(t => !t.coachId).sort((a, b) => a.school.localeCompare(b.school));
  const avail = availableCoaches(L, d.teams).map(c => ({ ...c, ...careers[c.id] })).sort((a, b) => b.w - a.w || a.name.localeCompare(b.name));
  const cline = c => `${c.w}-${c.l}${c.titles ? ` · ${c.titles} title${c.titles > 1 ? 's' : ''}` : ''}${c.mcws ? ` · ${c.mcws} National Championship trip${c.mcws > 1 ? 's' : ''}` : ''}`;
  const moveLine = m => {
    const who = `<a class="team-link" href="${coachHref(m.coach)}">${esc(coachName(L, m.coach))}</a>`;
    if (m.type === 'fire') return `<span class="mv-tag fire">Out</span><span>${who} out at <b>${esc(m.school)}</b></span>`;
    if (m.from) return `<span class="mv-tag poach">Poached</span><span>${who} leaves ${esc(m.from)} for <b>${esc(m.school)}</b></span>`;
    return `<span class="mv-tag hire">Hired</span><span>${who} takes over at <b>${esc(m.school)}</b></span>`;
  };
  // ---- hot seat: suggested firings (the commissioner decides) ----
  const T0 = d.teams;
  d.kept ||= {};
  const hs = hotSeatFor(L);
  const hsRow = x => {
    const t = T0[x.school], gone = !t ? 'Left the dynasty' : t.coachId !== x.coachId ? (t.coachId ? 'Replaced' : 'Fired') : null;
    const kept = !gone && d.kept[x.school];
    return `<div class="hs-row hs-${x.level}${gone || kept ? ' hs-done' : ''}">
      <span class="team">${logoImg(t || prev[x.school], 22)}<span><b>${esc(x.school)}</b><div class="small"><a class="team-link" href="${coachHref(x.coachId)}">${esc(coachName(L, x.coachId))}</a> <span class="muted">· ${ordinalWord(x.seasons)} season · ${x.w}-${x.l} there</span></div></span></span>
      <span class="hs-why small">${x.reasons.map(esc).join(' · ') || '<span class="muted">Below expectations</span>'}${x.cool.length ? `<div class="muted">In their favor: ${x.cool.map(esc).join(' · ')}</div>` : ''}</span>
      <span class="hs-act"><span class="badge heat-${x.level}" title="Heat score ${x.score}">${HEAT[x.level].label}</span>
        ${gone ? `<span class="badge">${gone}</span>` : kept ? `<span class="badge">Kept</span><button class="btn sm ghost" data-unkeep="${esc(x.school)}">Undo</button>` : `<button class="btn sm danger" data-fire="${esc(x.school)}">Fire</button><button class="btn sm" data-keep="${esc(x.school)}">Keep</button>`}</span></div>`;
  };
  const hsMain = hs.filter(x => x.level !== 'warm'), hsWarm = hs.filter(x => x.level === 'warm');
  const hotSeatCard = `<div class="card hotseat"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">Hot seat</h2><span class="muted small">${hs.filter(x => x.level === 'fire').length} firing${hs.filter(x => x.level === 'fire').length === 1 ? '' : 's'} suggested · ${hs.filter(x => x.level === 'hot').length} on the hot seat · ${hsWarm.length} warm</span></div>
    <p class="small muted" style="margin:0 0 10px">Suggestions only, based on each coach's results at the school against what the roster should have done, recent trend, losing streaks, missed NCAA tournaments and conference finish. Titles, deep runs and a new coach's first seasons count in their favor. Nothing changes unless you fire someone.</p>
    ${hsMain.length ? hsMain.map(hsRow).join('') : '<p class="muted small">No coach is on the hot seat this offseason.</p>'}
    ${hsWarm.length ? `<details class="hs-warm"><summary class="small">Warm seats (${hsWarm.length})</summary>${hsWarm.map(hsRow).join('')}</details>` : ''}</div>`;
  const carousel = `${hotSeatCard}<div class="card carousel" style="margin-top:14px">
    <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Coaching carousel</h2><span class="muted small">${open.length} open job${open.length === 1 ? '' : 's'} · ${avail.length} available coach${avail.length === 1 ? '' : 'es'} · ${d.moves.length} move${d.moves.length === 1 ? '' : 's'}</span><span class="spacer"></span><button class="btn sm" id="o-newcoach">+ New coach</button></div>
    <div class="carousel-grid">
      <section><h3>Open jobs</h3>${open.length ? open.map(t => `<div class="job"><span class="team">${logoImg(t, 22)}<b>${esc(t.school)}</b></span><span class="muted small">${esc(t.conference)}${prev[t.school] ? ` · ${rec(t.school)}` : ''}</span><button class="btn sm primary" data-hire="${esc(t.school)}">Find a coach</button></div>`).join('') : '<p class="muted small">Every program has a head coach. Use ✕ next to a coach to open a job, or "Change" to hire someone away.</p>'}</section>
      <section><h3>Available</h3>${avail.length ? avail.slice(0, 12).map(c => `<div class="cand-mini"><a class="team-link" href="${coachHref(c.id)}"><b>${esc(c.name)}</b></a><span class="muted small">${c.seasons?.length ? cline(c) : 'No seasons yet'}</span></div>`).join('') + (avail.length > 12 ? `<p class="muted small">+${avail.length - 12} more on the Coaches page.</p>` : '') : '<p class="muted small">No coaches without a job.</p>'}</section>
      <section><h3>Moves this offseason</h3>${d.moves.length ? `<ol class="moves">${[...d.moves].reverse().map(m => `<li>${moveLine(m)}</li>`).join('')}</ol>` : '<p class="muted small">No changes yet.</p>'}</section>
    </div></div>`;
  const removed = Object.keys(d.removed || {});
  let unplaced = teams.filter(t => t.dev && pointsLeft(t) !== 0).length;
  const ptsStatus = n => n ? `${n} team${n === 1 ? ' has' : 's have'} points to place or ${n === 1 ? 'is' : 'are'} over budget` : 'Every team\'s points are placed';
  app.innerHTML = `
    <div class="section-head"><h1>${d.year} Offseason</h1><span class="muted">${teams.length} teams in ${new Set(teams.map(t => t.conference)).size} conferences</span><span class="spacer"></span>
      <button class="btn" id="o-conf">+ Add conference</button><button class="btn" id="o-team">+ Add team</button><button class="btn primary" id="o-start">Start the ${d.year} season</button></div>
    <div class="hint">Set up the ${d.year} season. Each team earned <b>rating points</b> from last season (a winning record and a deep postseason run earn more; teams near the top lose some to graduation; plus some luck). The <b>Points</b> column shows what each team has to place: use − and + on OFF, PIT and DEF to put them where they make sense (a team with negative points takes them off). <b>Auto</b> places a team's remaining points at random, and <b>Reset</b> undoes its placements. Move teams with the <b>Conference</b> menus, add teams or conferences, and run the coaching carousel. Nothing is scheduled until you start the season.</div>
    ${warnings.length ? `<div class="hint warn" style="margin-top:10px">${warnings.map(esc).join('<br>')}</div>` : ''}
    ${removed.length ? `<div class="card" style="margin-top:14px"><b>Leaving the dynasty:</b> ${removed.map(t => `<span class="chip-static">${esc(t)} <button class="btn sm" data-restore="${esc(t)}">Bring back</button></span>`).join(' ')}</div>` : ''}
    <div style="margin-top:14px">${carousel}</div>
    <div class="row" style="margin:16px 0 0"><h2 style="margin:0">Teams</h2><span class="muted small" id="o-ptsstatus">${ptsStatus(unplaced)}</span><span class="spacer"></span><button class="btn sm" id="o-autoall" ${unplaced ? '' : 'disabled'}>Auto-place all remaining</button><button class="btn sm ghost" id="o-clearall">Reset all</button></div>
    <div class="off-grid" style="margin-top:10px">${confs.map(card).join('')}</div>`;
  const T = d.teams;
  const setRate = (t, k, v) => { t[k] = rate(v); t.base = { ...(t.base || {}), [k]: t[k] }; };
  // Rating changes update their own row in place, so the page doesn't jump.
  const refreshRow = school => {
    const t = T[school], tr = app.querySelector(`tr[data-row="${CSS.escape(school)}"]`);
    if (!tr) return;
    for (const k of ['off', 'pit', 'def']) {
      const inp = tr.querySelector(`[data-drate="${k}"]`);
      if (inp && document.activeElement !== inp) inp.value = t[k];
      const from = t.dev?.start?.[k] ?? prev[school]?.[k], x = from != null ? t[k] - from : 0;
      const sp = tr.querySelector(`[data-delta="${k}"]`);
      if (sp) { sp.textContent = x ? (x > 0 ? '+' : '') + x : ''; sp.className = `delta ${x > 0 ? 'good' : x < 0 ? 'bad' : ''}`; }
    }
    const pc = tr.querySelector('.pts-cell');
    if (pc) pc.outerHTML = pointsCell(t);
    tr.querySelector('.ovr-cell').innerHTML = `<b>${ovr(t)}</b>`;
    unplaced = Object.values(T).filter(x => x.dev && pointsLeft(x) !== 0).length;
    $('#o-ptsstatus').textContent = ptsStatus(unplaced);
    $('#o-autoall').disabled = !unplaced;
    persist();
  };
  const grid = $('.off-grid');
  grid.addEventListener('click', e => {
    const b = e.target.closest('[data-step], [data-auto], [data-clear]');
    if (!b) return;
    if (b.dataset.step) { const t = T[b.dataset.team], k = b.dataset.k; setRate(t, k, t[k] + Number(b.dataset.step)); refreshRow(t.school); }
    else if (b.dataset.auto) { placeRemaining(T[b.dataset.auto], Math.random); refreshRow(b.dataset.auto); }
    else if (b.dataset.clear) { clearPoints(T[b.dataset.clear]); refreshRow(b.dataset.clear); }
  });
  grid.addEventListener('change', e => {
    const inp = e.target.closest('[data-drate]');
    if (!inp) return;
    setRate(T[inp.dataset.team], inp.dataset.drate, inp.value); inp.value = T[inp.dataset.team][inp.dataset.drate]; refreshRow(inp.dataset.team);
  });
  $('#o-autoall').onclick = () => { if (!confirm(`Place the remaining points at random for ${unplaced} team${unplaced === 1 ? '' : 's'}? Points you've already placed stay put.`)) return; for (const t of Object.values(T)) if (t.dev) placeRemaining(t, Math.random); changed({ progress: false }); };
  $('#o-clearall').onclick = () => { if (!confirm('Undo every team\'s point placements? Ratings go back to last season\'s.')) return; for (const t of Object.values(T)) clearPoints(t); changed({ progress: false }); };
  $$('[data-hire]').forEach(b => (b.onclick = () => hireModal(d, b.dataset.hire)));
  $$('[data-fire]').forEach(b => (b.onclick = () => {
    const t = T[b.dataset.fire], id = t.coachId;
    if (!confirm(`Fire ${coachName(L, id)} at ${t.school}? They stay in the dynasty as an available coach.`)) return;
    t.coachId = null; d.moves.push({ type: 'fire', coach: id, school: t.school });
    changed({ progress: false }); toast(`${t.school}'s head coach job is open.`);
  }));
  $$('[data-keep]').forEach(b => (b.onclick = () => { d.kept[b.dataset.keep] = true; changed({ progress: false }); toast(`${b.dataset.keep} keeps its coach.`); }));
  $$('[data-unkeep]').forEach(b => (b.onclick = () => { delete d.kept[b.dataset.unkeep]; changed({ progress: false }); }));
  $('#o-newcoach').onclick = async () => { const n = await askCoachName('Add a coach'); if (n) { newCoach(L, n); changed({ progress: false }); toast(`${n} added as an available coach.`); } else ctx.render(); };
  $$('[data-dconf]').forEach(sel => (sel.onchange = () => { T[sel.dataset.dconf].conference = sel.value; changed({ progress: false }); toast(`${sel.dataset.dconf} moves to the ${sel.value}.`); }));
  $$('[data-drm]').forEach(b => (b.onclick = () => { if (confirm(`Remove ${b.dataset.drm} from the dynasty starting in ${d.year}? Its history stays.`)) { draftRemoveTeam(L, b.dataset.drm); changed({ progress: false }); } }));
  $$('[data-restore]').forEach(b => (b.onclick = () => { draftRestoreTeam(L, b.dataset.restore); changed({ progress: false }); }));
  $$('[data-addto]').forEach(b => (b.onclick = () => teamForm(T, { conference: b.dataset.addto })));
  $$('[data-delconf]').forEach(b => (b.onclick = () => { try { deleteConference(L, { teams: T }, b.dataset.delconf); changed({ progress: false }); } catch (e) { toast(e.message, true); } }));
  $('#o-team').onclick = () => teamForm(T);
  $('#o-conf').onclick = () => conferenceForm();
  $('#o-start').onclick = () => {
    const extra = unplaced ? ` ${unplaced} team${unplaced === 1 ? ' still has' : 's still have'} rating points not placed. Unplaced points are lost; ratings stay as they are now.` : '';
    if (!confirm(`Start the ${d.year} season with ${Object.keys(T).length} teams? The schedule is built from this alignment.${extra}`)) return;
    try { const ns = startNextSeason(L); L.viewYear = ns.year; } catch (e) { return toast(e.message, true); }
    location.hash = '#/home'; changed({ progress: false }); toast(`Welcome to ${d.year}.`);
  };
}

// Hiring for one program: every candidate (available coaches first, then
// coaches at other programs, who would leave for this job) with their résumé.
function hireModal(d, school) {
  const L = ctx.league, T = d.teams, careers = coachCareers();
  const current = T[school].coachId;
  const cands = Object.values(L.coaches || {}).filter(c => c.id !== current).map(c => {
    const k = careers[c.id] || { w: 0, l: 0, seasons: [], titles: 0, mcws: 0, ncaa: 0 };
    return { ...c, ...k, at: coachSchool(T, c.id), pct: k.w + k.l ? k.w / (k.w + k.l) : 0 };
  }).sort((a, b) => (a.at ? 1 : 0) - (b.at ? 1 : 0) || b.titles - a.titles || b.mcws - a.mcws || b.pct - a.pct || a.name.localeCompare(b.name));
  const row = c => `<div class="cand"><div class="cand-main"><b>${esc(c.name)}</b>
      <div class="small muted">${c.at ? `Head coach at ${esc(c.at)}` : 'Available'}${c.seasons.length ? ` · ${c.seasons.length} season${c.seasons.length > 1 ? 's' : ''}` : ' · No seasons yet'}</div></div>
    <div class="cand-stats"><span><b>${c.w}-${c.l}</b><span class="muted small">${c.w + c.l ? fmtPctLocal(c.pct) : ''}</span></span><span title="NCAA tournaments"><b>${c.ncaa}</b><span class="muted small">NCAA</span></span><span title="National Championship trips"><b>${c.mcws}</b><span class="muted small">WCWS</span></span><span title="National titles"><b>${c.titles}</b><span class="muted small">Titles</span></span></div>
    <button class="btn sm ${c.at ? '' : 'primary'}" data-pick="${c.id}">${c.at ? 'Hire away' : 'Hire'}</button></div>`;
  modal.innerHTML = `<div class="modal-head"><h2>${esc(school)} head coach</h2><button class="btn ghost" data-x>✕</button></div>
    <div class="modal-body"><p class="small muted" style="margin-top:0">${current ? `Replacing ${esc(coachName(L, current))}, who becomes available.` : 'This job is open.'} Hiring a coach from another program opens that job.</p>
      <div class="cand-list">${cands.map(row).join('') || '<p class="muted">No other coaches in the dynasty yet.</p>'}</div></div>
    <div class="modal-foot"><button class="btn" id="hm-new">+ New coach</button><span class="spacer"></span><button class="btn" data-x>Cancel</button></div>`;
  $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
  modal.onclose = () => ctx.render();
  const hire = id => {
    const was = T[school].coachId;
    const from = hireCoach(T, school, id);
    if (was && was !== id) d.moves.push({ type: 'fire', coach: was, school });
    d.moves.push({ type: 'hire', coach: id, school, from });
    modal.close(); changed({ progress: false });
    toast(from ? `${coachName(L, id)} leaves ${from} for ${school}. ${from} needs a new coach.` : `${coachName(L, id)} is ${school}'s head coach.`);
  };
  $$('[data-pick]', modal).forEach(b => (b.onclick = () => hire(b.dataset.pick)));
  $('#hm-new', modal).onclick = async () => { modal.onclose = null; modal.close(); await new Promise(r => setTimeout(r, 0)); const n = await askCoachName(`New head coach for ${school}`); if (n) hire(newCoach(L, n)); else ctx.render(); };
  modal.showModal();
}

// ---------- Team profile ----------

// Line chart of a team's poll rank by week (1 at the top; unranked weeks
// sit on the "NR" line and break the line).
function pollChart(pts, color) {
  const W = 760, H = 210, L = 36, R = 12, T = 12, B = 30;
  const n = pts.length, step = n > 1 ? (W - L - R) / (n - 1) : 0;
  const x = i => L + (n > 1 ? i * step : (W - L - R) / 2);
  const SIZE = Math.max(pollSizeOf(S()), ...pts.map(p => p.rank || 0));
  const y = rk => T + ((rk ?? SIZE + 3) - 1) / (SIZE + 2) * (H - T - B);
  const grid = [1, 5, 10, 15, 20, 25].filter(v => v <= SIZE).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="pc-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="pc-yl">${v}</text>`).join('')
    + `<line x1="${L}" x2="${W - R}" y1="${y(null)}" y2="${y(null)}" class="pc-grid pc-nr"/><text x="${L - 8}" y="${y(null) + 4}" class="pc-yl">NR</text>`;
  let path = '', open = false;
  pts.forEach((p, i) => { if (p.rank) { path += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rank).toFixed(1)}`; open = true; } else open = false; });
  const dots = pts.map((p, i) => `<g><title>${esc(p.title)}: ${p.rank ? '#' + p.rank : 'unranked'}</title><circle cx="${x(i)}" cy="${y(p.rank)}" r="${p.rank ? 4.5 : 3}" class="${p.rank ? 'pc-dot' : 'pc-nrdot'}" style="${p.rank ? `fill:${esc(color)}` : ''}"/>${p.rank && (n <= 12 || i % 2 === 0 || i === n - 1) ? `<text x="${x(i)}" y="${y(p.rank) - 9}" class="pc-val">${p.rank}</text>` : ''}</g>`).join('');
  const xl = pts.map((p, i) => `<text x="${x(i)}" y="${H - 10}" class="pc-xl">${esc(p.label)}</text>`).join('');
  return `<div class="pc-wrap"><svg class="pollchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poll rank by week">${grid}<path d="${path}" class="pc-line" style="stroke:${esc(color)}"/>${dots}${xl}</svg></div>
    <p class="small muted">P = preseason, CT = after conference tournaments, F = final poll.</p>`;
}

// Link to the bracket where a team's postseason ended.
export const postseasonHref = (year, d) => `#/postseason/${year}/${d.tab}${d.ev ? `/${d.ev}` : ''}`;
function finishCell(year, h) {
  const d = h.detail;
  if (!d) return h.finish ? esc(h.finish) : '<span class="muted">—</span>';
  return `<a href="${postseasonHref(year, d)}">${esc(d.text)}</a>`;
}

function seasonSummary(season, name) {
  const recs = records(season), reg = records(season, g => g.type === 'regular');
  if (!recs[name]) return null;
  const st = confStandings(season, season.teams[name].conference, reg);
  const pos = st.findIndex(x => x.team === name) + 1;
  const fp = season.polls?.final ? pollRankMap(season.polls.final)[name] : null;
  return { rec: recs[name], pos, confSize: st.length, tChamp: season.post?.confT?.[season.teams[name].conference]?.champion === name, ...(() => { const cs = regSeasonChamps(season, season.teams[name].conference, reg, rpi(season, g => g.type === 'regular')); return { regChamp: cs.includes(name), regShared: cs.includes(name) && cs.length > 1 }; })(), finish: postseasonFinish(season, name), detail: postseasonDetail(season, name), finalRank: fp };
}

// Program history: all-time totals, poll history by season, dynasty record.
function teamHistoryTab(name, t, history) {
  const L = ctx.league;
  const prog = recordBook(L).programs.find(p => p.team === name) || { seasons: 0, w: 0, l: 0, reg: 0, conf: 0, ncaa: 0, mcws: 0, titles: 0 };
  const ph = teamPollHistory(L, name);
  const sum = k => ph.reduce((a, x) => a + x[k], 0);
  const finals = ph.filter(x => x.done);
  const best = Math.min(...ph.map(x => x.high).filter(Boolean));
  const color = t.color === '#000000' || t.color === '#FFFFFF' ? t.altColor : t.color;
  const kpi = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const nr = v => v ?? '<span class="muted">NR</span>';
  const chartPts = finals.map(x => ({ label: `'${String(x.year).slice(-2)}`, title: `${x.year} final poll`, rank: x.final }));
  return `
    <div class="card"><h2>All-time</h2><div class="kpis kpis-sm">
      ${kpi(prog.seasons, 'Seasons')}${kpi(`${prog.w}-${prog.l}`, 'Record')}${kpi(fmtPct(prog.w / ((prog.w + prog.l) || 1)), 'Win pct')}
      ${kpi(prog.reg, 'Reg. season titles')}${kpi(prog.conf, 'Tournament titles')}${kpi(prog.ncaa, 'NCAA')}${kpi(prog.mcws, 'Nat. Championships')}${kpi(prog.titles, 'National titles')}
    </div></div>
    <div class="card" style="margin-top:16px"><h2>Ranking history</h2>
      <div class="kpis kpis-sm">
        ${kpi(`${sum('ranked')}<span class="kpi-sep">/</span>${sum('polls')}`, 'Polls ranked')}${kpi(sum('at1'), 'Polls at #1')}${kpi(Number.isFinite(best) ? '#' + best : '—', 'Highest rank')}
        ${kpi(finals.filter(x => x.final && x.final <= 10).length, 'Final top-10s')}${kpi(finals.filter(x => x.final).length, 'Final ranked')}${kpi(sum('fp'), 'First-place votes')}
      </div>
      ${chartPts.length > 1 ? `<h3 style="margin-top:14px">Final poll by season</h3>${pollChart(chartPts, color).replace(/<p class="small muted">[^<]*<\/p>/, '')}` : ''}
      <div class="table-wrap"><table><thead><tr><th>Season</th><th class="num">Preseason</th><th class="num">Highest</th><th class="num">Lowest</th><th class="num">Final</th><th class="num">Polls ranked</th><th class="num">At #1</th><th class="num" title="First-place votes across the season">1st-place votes</th></tr></thead><tbody>
        ${[...ph].reverse().map(x => `<tr><td>${x.year}${x.done ? '' : '<span class="muted">*</span>'}</td><td class="num">${nr(x.pre)}</td><td class="num">${nr(x.high)}</td><td class="num">${nr(x.low)}</td><td class="num">${x.done ? `<b>${nr(x.final)}</b>` : '<span class="muted">—</span>'}</td><td class="num">${x.ranked} of ${x.polls}</td><td class="num">${x.at1 || ''}</td><td class="num">${x.fp || ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No polls yet.</td></tr>'}
      </tbody></table></div>
      <p class="small muted">"Lowest" is the lowest rank while ranked. * season in progress.</p></div>
    <div class="card" style="margin-top:16px"><h2>Dynasty record</h2><div class="table-wrap"><table><thead><tr><th>Season</th><th>Conference</th><th>Coach</th><th class="num">Record</th><th class="num">Conf</th><th>Conference finish</th><th>Postseason</th><th class="num">Final rank</th></tr></thead><tbody>       ${history.map(([y, h]) => `<tr><td>${y}</td><td>${(() => { const c = ctx.league.seasons[y].teams[name].conference; return `<a class="conf-cell" href="${confHref(c)}">${confLogo(c, 18)}<span>${esc(c)}</span></a>`; })()}</td><td>${coachLink(ctx.league.seasons[y].teams[name].coachId) || '—'}</td><td class="num">${h.rec.w}-${h.rec.l}</td><td class="num">${h.rec.cw}-${h.rec.cl}</td><td>${h.pos ? `${h.pos} of ${h.confSize}` : ''}${h.regChamp ? ` <span class="badge">Reg. season ${h.regShared ? 'co-champ' : 'champ'}</span>` : ''}${h.tChamp ? ' <span class="badge gold">Tournament champ</span>' : ''}</td><td>${finishCell(y, h)}</td><td class="num">${h.finalRank ?? '<span class="muted">NR</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
}

// All-time head-to-head against every opponent.
function teamH2HTab(name) {
  const f = ui.h2hFilter;
  let rows = headToHead(ctx.league, name);
  if (f === 'conf') rows = rows.filter(r => r.cw + r.cl).map(r => ({ ...r, w: r.cw, l: r.cl, g: r.cw + r.cl, pct: r.cw / (r.cw + r.cl) }));
  if (f === 'post') rows = rows.filter(r => r.pw + r.pl).map(r => ({ ...r, w: r.pw, l: r.pl, g: r.pw + r.pl, pct: r.pw / (r.pw + r.pl) }));
  const st = ui.h2hSort;
  const val = (r, k) => k === 'opp' ? r.opp : k === 'last' ? r.last.year * 1000 + r.last.week : k === 'streak' ? r.streakN : k === 'conf' ? (teamInfo(r.opp)?.conference || '') : r[k];
  rows = st.k === 'g' ? [...rows].sort((a, b) => st.dir * (a.g - b.g) || b.w - a.w || a.opp.localeCompare(b.opp)) : sortBy(rows, st, val);
  const tot = rows.reduce((a, r) => ({ w: a.w + r.w, l: a.l + r.l }), { w: 0, l: 0 });
  const winning = rows.filter(r => r.w > r.l).length, losing = rows.filter(r => r.w < r.l).length;
  const last = r => { const x = r.last; return `<span class="small"><b class="${x.won ? 'good' : 'bad'}">${x.won ? 'W' : 'L'}</b> ${x.us}-${x.them} · ${x.year} ${x.type === 'regular' ? `Wk ${x.week}` : esc((x.label || '').split(' · ')[0])}${x.oppRank ? ` <span class="muted">vs #${x.oppRank}</span>` : ''}</span>`; };
  return `<div class="card">
    <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Head-to-head</h2><span class="spacer"></span>
      <div class="seg">${[['all', 'All games'], ['conf', 'Conference'], ['post', 'Postseason']].map(([k, l]) => `<button class="btn sm ${f === k ? 'primary' : ''}" data-h2hf="${k}">${l}</button>`).join('')}</div></div>
    <div class="kpis kpis-sm">
      <div class="kpi"><div class="v">${rows.length}</div><div class="l">Opponents</div></div>
      <div class="kpi"><div class="v">${tot.w}-${tot.l}</div><div class="l">Record</div></div>
      <div class="kpi"><div class="v">${winning}</div><div class="l">Winning records vs</div></div>
      <div class="kpi"><div class="v">${losing}</div><div class="l">Losing records vs</div></div>
    </div>
    <div class="table-wrap"><table class="h2h-table"><thead><tr>${sortTh(st, 'opp', 'Opponent', { num: false, text: true })}${sortTh(st, 'conf', 'Conference', { num: false, text: true })}${sortTh(st, 'g', 'G')}${sortTh(st, 'w', 'W')}${sortTh(st, 'l', 'L')}${sortTh(st, 'pct', 'Pct')}${f === 'all' ? sortTh(st, 'diff', 'Run diff', { title: 'Runs scored minus runs allowed, all meetings' }) : ''}${sortTh(st, 'streak', 'Streak')}${sortTh(st, 'first', 'First met')}${sortTh(st, 'last', 'Last meeting', { num: false })}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.w > r.l ? 'h2h-up' : r.w < r.l ? 'h2h-down' : ''}"><td>${team(r.opp, { rank: false, size: 18 })}</td><td class="small muted">${esc(teamInfo(r.opp)?.conference || '')}</td><td class="num">${r.g}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num"><b>${fmtPct(r.pct)}</b></td>${f === 'all' ? `<td class="num ${r.diff > 0 ? 'good' : r.diff < 0 ? 'bad' : ''}">${r.diff > 0 ? '+' : ''}${r.diff}</td>` : ''}<td class="num">${r.streak}</td><td class="num">${r.first}</td><td>${last(r)}</td></tr>`).join('') || `<tr><td colspan="10" class="muted">No ${f === 'post' ? 'postseason ' : f === 'conf' ? 'conference ' : ''}games yet.</td></tr>`}</tbody></table></div>
    <p class="small muted">Every meeting in the dynasty, postseason included under All games. Streak and last meeting count all games. Ranks are from the poll in effect at the time.</p></div>`;
}

export function renderTeamPage(name) {
  const s = S(), t = s.teams[name] || teamInfo(name);
  if (!t) { app.innerHTML = `<div class="empty">No team called ${esc(name)}. <a href="#/teams">All teams</a></div>`; return; }
  const inSeason = !!s.teams[name];
  const recs = cache.recs(), r = rpi(s), pr = cache.ranks();
  const rec = recs[name] || { w: 0, l: 0, cw: 0, cl: 0, rs: 0, ra: 0, streak: '', hw: 0, hl: 0, aw: 0, al: 0 };
  const games = s.games.filter(g => g.home === name || g.away === name).sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id);
  const pollPts = Object.entries(s.polls || {}).sort((a, b) => (a[0] === 'final' ? 99 : +a[0]) - (b[0] === 'final' ? 99 : +b[0]))
    .map(([w, p]) => ({ label: w === 'final' ? 'F' : w === '0' ? 'P' : +w === postWeeks(s).conf ? 'CT' : w, title: w === 'final' ? 'Final poll' : w === '0' ? 'Preseason' : +w === postWeeks(s).conf ? 'After conference tournaments' : `Week ${w}`, rank: pollRankMap(p)[name] ?? null }));
  const history = Object.keys(ctx.league.seasons).map(Number).sort((a, b) => b - a).map(y => [y, ctx.league.seasons[y]]).filter(([, se]) => se.teams[name]).map(([y, se]) => [y, seasonSummary(se, name)]);
  const confs = Object.keys(ctx.league.conferences).filter(c => !ctx.league.conferences[c].retired);
  const tab = !inSeason && ui.teamTab === 'season' ? 'history' : ui.teamTab;
  app.innerHTML = `
    <div class="team-hero" style="--tc:${esc(t.color)};--ta:${esc(t.altColor)};color:${esc(readableOn(t.color, null))}">
      <div class="team-hero-logo">${logoImg(t, 64)}</div>
      <div style="flex:1;min-width:200px">
        <div class="team-hero-name">${pr[name] ? `<span class="team-hero-rank">#${pr[name]}</span> ` : ''}${esc(name)}</div>
        <div class="team-hero-sub">${t.coachId ? `Head coach ${coachLink(t.coachId, 'color:inherit;text-decoration:underline')} · ` : 'Head coach job open · '}${esc(t.mascot || '')} · <a href="${confHref(t.conference)}" style="color:inherit">${esc(t.conference)}</a> · ${rec.w}-${rec.l} (${rec.cw}-${rec.cl} conf) · OVR ${ovr(t)}</div>
      </div>
      <a class="btn" href="#/teams">All teams</a>
    </div>
    <div class="steps">${Object.entries({ season: `${s.year} season`, history: 'Program history', h2h: 'Head-to-head' }).map(([k, l]) => `<a href="${teamHref(name)}" data-ttab="${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>
    ${tab === 'history' ? teamHistoryTab(name, t, history) : tab === 'h2h' ? teamH2HTab(name) : `
    ${inSeason ? '' : `<div class="hint" style="margin-bottom:14px">${esc(name)} isn't in the ${s.year} season. See Program history for its dynasty record.</div>`}
    <div class="grid">
      <div class="card"><h2>Ratings</h2>
        ${ratingBar('OFF', t.off, t.color, t.base?.off)}${ratingBar('PIT', t.pit, t.color, t.base?.pit)}${ratingBar('DEF', t.def, t.color, t.base?.def)}${ratingBar('OVR', ovr(t), t.color, t.base ? ovrOf(t.base) : null)}
        <p class="small muted" style="margin:6px 0 0">Change since the preseason, from results so far. Ratings rise with wins over better teams and fall with losses to weaker ones.</p>
        ${inSeason ? `<div class="row" style="margin-top:10px">${['off', 'pit', 'def'].map(k => `<label class="field" style="width:80px">${k.toUpperCase()} <input type="number" min="40" max="99" data-r="${k}" value="${t[k]}"></label>`).join('')}</div>` : ''}
      </div>
      <div class="card"><h2>${s.year} season</h2>
        <div class="kpis kpis-sm">
          <div class="kpi"><div class="v">${rec.w}-${rec.l}</div><div class="l">Overall</div></div>
          <div class="kpi"><div class="v">${rec.cw}-${rec.cl}</div><div class="l">Conference</div></div>
          <div class="kpi"><div class="v">${r[name]?.rank ?? '—'}</div><div class="l">RPI rank</div></div>
          <div class="kpi"><div class="v">${rec.rs}<span class="kpi-sep">–</span>${rec.ra}</div><div class="l">Runs for–against</div></div>
          <div class="kpi"><div class="v">${rec.hw}-${rec.hl}</div><div class="l">Home</div></div>
          <div class="kpi"><div class="v">${rec.aw}-${rec.al}</div><div class="l">Away</div></div>
          <div class="kpi"><div class="v">${rec.streak || '—'}</div><div class="l">Streak</div></div>
        </div>
        ${(() => { const d = postseasonDetail(s, name); return d ? `<p><a class="badge gold" href="${postseasonHref(s.year, d)}">${esc(d.text)}</a></p>` : ''; })()}
      </div>
    </div>
    ${pollPts.length ? `<div class="card" style="margin-top:16px"><h2>Poll history</h2>${pollChart(pollPts, t.color === '#000000' || t.color === '#FFFFFF' ? t.altColor : t.color)}</div>` : ''}
    <div class="card" style="margin-top:16px"><h2>Schedule & results</h2><div class="table-wrap"><table><thead><tr><th>Wk</th><th>Day</th><th class="num" title="${esc(name)}'s rank going into the game">Rank</th><th>Opponent</th><th>Result</th></tr></thead><tbody>
        ${games.map(g => {
          const home = g.home === name, opp = home ? g.away : g.home;
          const fin = isFinal(g), won = fin && winnerOf(g) === name;
          const inn = Math.max(g.homeLine.length, g.awayLine.length);
          const res = fin ? `<b class="${won ? 'good' : 'bad'}">${won ? 'W' : 'L'}</b> ${home ? g.homeR : g.awayR}-${home ? g.awayR : g.homeR}${inn !== 7 ? ` <span class="muted small">(${inn})</span>` : ''}` : '<span class="muted">—</span>';
          return `<tr class="clickable" data-g="${g.id}"><td class="small">${g.week > regWeeksOf(s) ? esc(weekName(g.week, s).replace('Conf. Tournaments', 'Conf T')) : g.week}</td><td class="small">${esc(g.day)}</td>
            <td class="num muted small">${fin && cache.ranksAt(g.week)[name] ? '#' + cache.ranksAt(g.week)[name] : ''}</td>
            <td>${g.site ? (g.site === name ? '' : '@') : g.neutral ? 'vs' : home ? '' : '@'} ${team(opp, { ranks: fin ? cache.ranksAt(g.week) : null })}${g.label ? ` <span class="muted small">${esc(g.label.split(' · ')[0])}</span>` : g.confGame ? ' <span class="muted small">*</span>' : ''}</td><td>${res}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="muted">No games.</td></tr>'}</tbody></table></div><p class="small muted">* conference game. Ranks on played games are from the poll in effect when the game was played.</p></div>
    ${inSeason ? `<div class="card" style="margin-top:16px"><h2>Commissioner edits</h2>
      <div class="row"><label class="field" style="flex:2;min-width:160px">School <input type="text" id="e-school" value="${esc(name)}"></label>
        <label class="field" style="flex:1;min-width:120px">Mascot <input type="text" id="e-mascot" value="${esc(t.mascot || '')}"></label>
        <label class="field" style="flex:1;min-width:180px">Head coach ${coachSelect(s.teams, name, 'data-ecoach')}</label>
        <label class="field" style="width:90px">Abbr. <input type="text" id="e-abbr" maxlength="5" value="${esc(t.abbr || '')}"></label>
        <label class="field" style="flex:1;min-width:140px">Conference <select id="e-conf">${confs.map(c => `<option ${c === t.conference ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field">Color <input type="color" id="e-color" value="${esc(t.color)}"></label><label class="field">Alt color <input type="color" id="e-alt" value="${esc(t.altColor)}"></label></div>
      <div class="row" style="margin-top:10px"><label class="field" style="flex:1;min-width:220px">Logo image link <input type="text" id="e-logo" placeholder="https://…" value="${esc(t.logoOverride && !t.logoOverride.startsWith('data:') ? t.logoOverride : '')}"></label>
        <label class="btn" style="align-self:flex-end">Upload logo <input type="file" id="e-file" accept="image/*" hidden></label>
        ${t.logoOverride ? '<button class="btn" id="e-clearlogo" style="align-self:flex-end">Use default logo</button>' : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="e-save">Save changes</button><span class="spacer"></span><button class="btn danger" id="e-remove">Remove from ${s.year}</button></div>
    </div>` : ''}`}`;

  $$('[data-ttab]').forEach(a => (a.onclick = e => { e.preventDefault(); ui.teamTab = a.dataset.ttab; renderTeamPage(name); }));
  $$('[data-g]').forEach(rw => (rw.onclick = e => { if (!e.target.closest('a')) openGame(Number(rw.dataset.g)); }));
  if (tab === 'h2h') {
    bindSort(ui.h2hSort, () => renderTeamPage(name));
    $$('[data-h2hf]').forEach(b => (b.onclick = () => { ui.h2hFilter = b.dataset.h2hf; renderTeamPage(name); }));
  }
  if (!inSeason || tab !== 'season') return;
  $$('[data-r]').forEach(inp => (inp.onchange = () => { setRating(t, inp.dataset.r, rate(inp.value)); changed(); }));
  bindCoachSelects(s.teams, 'data-ecoach');
  const applyLogo = url => { for (const se of Object.values(ctx.league.seasons)) if (se.teams[name]) se.teams[name].logoOverride = url; };
  $('#e-file').onchange = async e => {
    try { applyLogo(await imageFileToDataUrl(e.target.files[0])); changed({ progress: false }); toast('Logo updated.'); } catch (err) { toast(err.message, true); }
  };
  if ($('#e-clearlogo')) $('#e-clearlogo').onclick = () => { applyLogo(null); changed({ progress: false }); };
  $('#e-save').onclick = () => {
    const v = id => $(id).value.trim();
    Object.assign(t, { mascot: v('#e-mascot'), abbr: v('#e-abbr').toUpperCase() || t.abbr, conference: v('#e-conf'), color: v('#e-color'), altColor: v('#e-alt') });
    if (v('#e-logo')) applyLogo(v('#e-logo'));
    const newName = v('#e-school');
    try { if (newName !== name) { renameTeam(ctx.league, s, name, newName); location.hash = teamHref(newName); } } catch (e) { return toast(e.message, true); }
    changed({ progress: false }); toast('Saved.');
  };
  $('#e-remove').onclick = () => {
    if (!confirm(`Remove ${name} from the ${s.year} season? Its unplayed games are deleted; games already played stay in the record.`)) return;
    removeTeam(s, name); location.hash = '#/teams'; changed();
  };
}

// ---------- Coaches ----------

function coachCareers() {
  const L = ctx.league, out = {};
  for (const c of Object.values(L.coaches || {})) out[c.id] = { ...c, w: 0, l: 0, seasons: [], ct: 0, ncaa: 0, mcws: 0, titles: 0 };
  for (const y of Object.keys(L.seasons).map(Number).sort((a, b) => a - b)) {
    const se = L.seasons[y], recs = records(se);
    for (const t of Object.values(se.teams)) {
      const c = out[t.coachId];
      if (!c) continue;
      c.w += recs[t.school].w; c.l += recs[t.school].l;
      c.seasons.push({ y, school: t.school });
      if (se.post?.confT?.[t.conference]?.champion === t.school) c.ct++;
      if (se.post?.field?.some(f => f.team === t.school)) c.ncaa++;
      if (wsTeams(se).includes(t.school)) c.mcws++;
      if (se.post?.champion === t.school) c.titles++;
    }
  }
  return out;
}

function stints(seasons) {
  const out = [];
  for (const x of seasons) {
    const last = out[out.length - 1];
    if (last && last.school === x.school && last.to === x.y - 1) last.to = x.y; else out.push({ school: x.school, from: x.y, to: x.y });
  }
  return out.map(s => `${esc(s.school)} (${s.from === s.to ? s.from : `${s.from}–${String(s.to).slice(-2)}`})`).join(', ');
}

const fmtPctLocal = x => x.toFixed(3).replace(/^0/, '');

export const coachHref = id => `#/coach/${encodeURIComponent(id)}`;
const coachLink = (id, style = '') => id && ctx.league.coaches?.[id] ? `<a class="team-link" href="${coachHref(id)}"${style ? ` style="${style}"` : ''}>${esc(coachName(ctx.league, id))}</a>` : '';

export function renderCoachPage(id) {
  const L = ctx.league, c = L.coaches?.[id];
  if (!c) { app.innerHTML = `<div class="empty">That coach isn't in this dynasty. <a href="#/coaches">All coaches</a></div>`; return; }
  const cur = L.seasons[L.currentYear];
  const teamsNow = L.draft && cur.phase === 'complete' ? L.draft.teams : cur.teams;
  const now = coachSchool(teamsNow, id);
  const nowTeam = now ? teamsNow[now] : null;
  const rows = [];
  const tot = { w: 0, l: 0, cw: 0, cl: 0, reg: 0, ct: 0, ncaa: 0, mcws: 0, titles: 0, top: 0 };
  for (const y of Object.keys(L.seasons).map(Number).sort((a, b) => b - a)) {
    const se = L.seasons[y];
    const t = Object.values(se.teams).find(x => x.coachId === id);
    if (!t) continue;
    const h = seasonSummary(se, t.school);
    if (!h) continue;
    tot.w += h.rec.w; tot.l += h.rec.l; tot.cw += h.rec.cw; tot.cl += h.rec.cl;
    if (h.regChamp) tot.reg++; if (h.tChamp) tot.ct++;
    if (se.post?.field?.some(f => f.team === t.school)) tot.ncaa++;
    if (wsTeams(se).includes(t.school)) tot.mcws++;
    if (se.post?.champion === t.school) tot.titles++;
    if (h.finalRank) tot.top++;
    rows.push({ y, t, h, inProgress: se.phase !== 'complete' });
  }
  const pctTxt = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '—');
  const color = nowTeam?.color || '#2c3442';
  app.innerHTML = `
    <div class="team-hero" style="--tc:${esc(color)};--ta:${esc(nowTeam?.altColor || '#8892a0')};color:${esc(readableOn(color, null))}">
      <div class="team-hero-logo">${nowTeam ? logoImg(nowTeam, 64) : '<span class="coach-initials">' + esc(c.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2)) + '</span>'}</div>
      <div style="flex:1;min-width:200px">
        <div class="team-hero-name">${esc(c.name)}</div>
        <div class="team-hero-sub">${now ? `Head coach, <a href="${teamHref(now)}" style="color:inherit">${esc(now)}</a>` : 'Available — not leading a program'} · ${rows.length} season${rows.length === 1 ? '' : 's'} · ${tot.w}-${tot.l} career</div>
      </div>
      <a class="btn" href="#/coaches">All coaches</a>
    </div>
    <div class="kpis kpis-sm">
      <div class="kpi"><div class="v">${tot.w}-${tot.l}</div><div class="l">Career record</div></div>
      <div class="kpi"><div class="v">${pctTxt(tot.w, tot.l)}</div><div class="l">Win pct</div></div>
      <div class="kpi"><div class="v">${tot.cw}-${tot.cl}</div><div class="l">Conference record</div></div>
      <div class="kpi"><div class="v">${tot.reg}</div><div class="l">Regular-season titles</div></div>
      <div class="kpi"><div class="v">${tot.ct}</div><div class="l">Conf. tournament titles</div></div>
      <div class="kpi"><div class="v">${tot.ncaa}</div><div class="l">NCAA tournaments</div></div>
      <div class="kpi"><div class="v">${tot.mcws}</div><div class="l">National Championship trips</div></div>
      <div class="kpi"><div class="v">${tot.titles}${tot.titles ? ' 🏆' : ''}</div><div class="l">National titles</div></div>
    </div>
    <div class="card"><h2>Season by season</h2><div class="table-wrap"><table>
      <thead><tr><th>Season</th><th>Program</th><th>Conference</th><th class="num">Record</th><th class="num">Conf</th><th>Conference finish</th><th>Postseason</th><th class="num">Final rank</th></tr></thead>
      <tbody>${rows.map(({ y, t, h, inProgress }) => `<tr><td>${y}${inProgress ? ' <span class="muted small">(in progress)</span>' : ''}</td><td>${team(t.school, { rank: false })}</td><td>${confLogo(t.conference, 18)} <span class="small">${esc(t.conference)}</span></td>
        <td class="num">${h.rec.w}-${h.rec.l}</td><td class="num">${h.rec.cw}-${h.rec.cl}</td>
        <td>${h.pos && h.rec.cw + h.rec.cl ? `${h.pos} of ${h.confSize}` : ''}${h.regChamp && !inProgress ? ` <span class="badge">Reg. season ${h.regShared ? 'co-champ' : 'champ'}</span>` : ''}${h.tChamp ? ' <span class="badge gold">Tournament champ</span>' : ''}</td>
        <td>${finishCell(y, h)}</td><td class="num">${h.finalRank ?? '<span class="muted">NR</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No seasons as a head coach yet.</td></tr>'}</tbody></table></div></div>
    <div class="card" style="margin-top:16px"><h2>Commissioner edits</h2>
      <div class="row"><button class="btn" id="cp-rename">Rename coach</button>
      ${now ? '' : `<label class="field" style="min-width:220px">Hire as head coach of <select id="cp-hire"><option value="">Choose a program…</option>${Object.values(teamsNow).sort((a, b) => a.school.localeCompare(b.school)).map(t => `<option value="${esc(t.school)}">${esc(t.school)}${t.coachId ? ` (replaces ${esc(coachName(L, t.coachId))})` : ' (open job)'}</option>`).join('')}</select></label>`}</div>
      <p class="small muted">${L.draft && cur.phase === 'complete' ? `Hiring here applies to the ${L.draft.year} season being set up in the Offseason.` : 'Hiring here applies to the current season.'}</p></div>`;
  $('#cp-rename').onclick = async () => { const n = await askCoachName('Rename coach', c.name); if (n) { c.name = n; changed({ progress: false }); } else ctx.render(); };
  if ($('#cp-hire')) $('#cp-hire').onchange = e => {
    const school = e.target.value; if (!school) return;
    const replaced = teamsNow[school].coachId;
    hireCoach(teamsNow, school, id);
    changed({ progress: false });
    toast(`${c.name} is now ${school}'s head coach${replaced ? `; ${coachName(L, replaced)} is available` : ''}.`);
  };
}

export function renderCoaches() {
  const L = ctx.league, cur = L.seasons[L.currentYear];
  const teamsNow = L.draft && cur.phase === 'complete' ? L.draft.teams : cur.teams;
  const st = ui.coachSort;
  const all = Object.values(coachCareers()).map(c => ({ ...c, now: coachSchool(teamsNow, c.id) }));
  const val = (c, k) => ({ name: c.name, now: c.now ? 1e6 + c.w : c.w, seasons: c.seasons.length, w: c.w, pct: c.w + c.l ? c.w / (c.w + c.l) : null, ct: c.ct, ncaa: c.ncaa, mcws: c.mcws, titles: c.titles })[k];
  const careers = sortBy(all.sort((a, b) => a.name.localeCompare(b.name)), st, val);
  app.innerHTML = `
    <div class="section-head"><h1>Coaches</h1><span class="muted">${careers.filter(c => c.now).length} head coaches · ${careers.filter(c => !c.now).length} available</span><span class="spacer"></span><button class="btn primary" id="co-add">+ Add coach</button></div>
    <div class="hint">Coaches are people in the dynasty. Change a program's coach from the Teams page, the team's page, or the Offseason. Picking a coach who leads another program hires them away and leaves that job open. Coaches without a job stay here as available.</div>
    <div class="card" style="margin-top:14px"><div class="table-wrap"><table>
      <thead><tr>${sortTh(st, 'name', 'Coach', { num: false, text: true })}${sortTh(st, 'now', 'Now', { num: false, title: 'Head coaches first, then available' })}${sortTh(st, 'seasons', 'Seasons')}${sortTh(st, 'w', 'W-L', { title: 'Sort by wins' })}${sortTh(st, 'pct', 'Pct')}${sortTh(st, 'ct', 'Conf. tourney titles')}${sortTh(st, 'ncaa', 'NCAA')}${sortTh(st, 'mcws', 'WCWS')}${sortTh(st, 'titles', 'Natl. titles')}<th>Career</th><th></th></tr></thead>
      <tbody>${careers.map(c => `<tr><td><b>${coachLink(c.id)}</b></td><td>${c.now ? team(c.now, { rank: false }) : '<span class="badge">Available</span>'}</td>
        <td class="num">${c.seasons.length}</td><td class="num">${c.w}-${c.l}</td><td class="num">${c.w + c.l ? fmtPctLocal(c.w / (c.w + c.l)) : '—'}</td>
        <td class="num">${c.ct || ''}</td><td class="num">${c.ncaa || ''}</td><td class="num">${c.mcws || ''}</td><td class="num">${c.titles ? `<b>${c.titles}</b> 🏆` : ''}</td>
        <td class="small muted">${stints(c.seasons) || 'No seasons yet'}</td>
        <td class="num" style="white-space:nowrap"><button class="btn sm" data-rename="${c.id}">Rename</button>${!c.now && !c.seasons.length ? ` <button class="btn sm danger" data-cdel="${c.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  bindSort(st, renderCoaches);
  $('#co-add').onclick = async () => { const n = await askCoachName('Add a coach'); if (n) { newCoach(L, n); changed({ progress: false }); toast(`${n} added as an available coach.`); } else ctx.render(); };
  $$('[data-rename]').forEach(b => (b.onclick = async () => { const c = L.coaches[b.dataset.rename]; const n = await askCoachName('Rename coach', c.name); if (n) { c.name = n; changed({ progress: false }); } else ctx.render(); }));
  $$('[data-cdel]').forEach(b => (b.onclick = () => { delete L.coaches[b.dataset.cdel]; changed({ progress: false }); }));
}

// ---------- Conferences ----------

export function renderConferences() {
  const s = S(), recs = cache.recs();
  const confs = Object.keys(ctx.league.conferences).filter(c => !ctx.league.conferences[c].retired);
  app.innerHTML = `
    <div class="section-head"><h1>Conferences</h1><span class="spacer"></span><button class="btn primary" id="c-add">+ Add conference</button></div>
    <div class="grid">${confs.map(c => {
      const ts = Object.values(s.teams).filter(t => t.conference === c);
      const avg = ts.length ? Math.round(ts.reduce((a, t) => a + ovr(t), 0) / ts.length) : '—';
      const st = ts.length ? confStandings(s, c, records(s, g => g.type === 'regular')) : [];
      const ch = s.post?.confT?.[c]?.champion;
      return `<a class="card conf-card" href="${confHref(c)}"><div class="row">${confLogo(c, 44)}<div><h2 style="margin:0">${esc(c)}</h2><div class="muted small">${ts.length} teams · avg OVR ${avg}</div></div></div>
        <div class="small" style="margin-top:10px">${st[0] && st[0].cw + st[0].cl ? `Leader: <b>${esc(st[0].team)}</b> ${st[0].cw}-${st[0].cl}` : 'No conference games yet'}${ch ? ` · Tournament champion: <b>${esc(ch)}</b>` : ''}</div></a>`;
    }).join('')}</div>`;
  $('#c-add').onclick = () => conferenceForm();
}

export function renderConferencePage(c) {
  const s = S(), info = ctx.league.conferences[c];
  if (!info) { app.innerHTML = `<div class="empty">No conference called ${esc(c)}. <a href="#/conferences">All conferences</a></div>`; return; }
  const recs = cache.recs(), reg = records(s, g => g.type === 'regular');
  const st = confStandings(s, c, reg);
  const years = Object.keys(ctx.league.seasons).map(Number).sort((a, b) => b - a);
  const NCAA_TYPES = new Set(['regional', 'super', 'mcws']);
  const members = {}, vsConf = {};
  let ncW = 0, ncL = 0, totBids = 0, titles = 0;
  const hist = years.map(y => {
    const se = ctx.league.seasons[y];
    const inC = new Set(Object.values(se.teams).filter(t => t.conference === c).map(t => t.school));
    if (!inC.size) return null;
    const rg = records(se, g => g.type === 'regular');
    const all = records(se);
    const bids = (se.post?.field || []).filter(f => f.conf === c);
    const finishes = bids.map(f => ({ team: f.team, finish: postseasonFinish(se, f.team) })).filter(x => x.finish);
    const order = ['National champion', 'National runner-up', 'WCWS', 'Super Regional', 'Regional champion', 'NCAA Regional'];
    finishes.sort((x, z) => order.indexOf(x.finish) - order.indexOf(z.finish));
    // Results against other conferences, and in the NCAA tournament.
    let w = 0, l = 0, nw = 0, nl = 0;
    for (const g of se.games) {
      if (!isFinal(g)) continue;
      const hIn = inC.has(g.home), aIn = inC.has(g.away);
      if (hIn === aIn) continue;
      const mine = hIn ? g.home : g.away, opp = hIn ? g.away : g.home;
      const won = winnerOf(g) === mine;
      won ? w++ : l++;
      if (NCAA_TYPES.has(g.type)) won ? nw++ : nl++;
      const oc = se.teams[opp]?.conference || 'Other';
      const v = (vsConf[oc] ||= { w: 0, l: 0 }); won ? v.w++ : v.l++;
    }
    ncW += w; ncL += l; totBids += bids.length;
    if (se.post?.champion && inC.has(se.post.champion)) titles++;
    const regChamps = regSeasonChamps(se, c, rg, rpi(se, g => g.type === 'regular'));
    const regDone = se.games.some(g => g.type === 'regular') && se.games.filter(g => g.type === 'regular').every(isFinal);
    const tChamp = se.post?.confT?.[c]?.champion;
    for (const t of inC) {
      const m = (members[t] ||= { team: t, seasons: 0, cw: 0, cl: 0, w: 0, l: 0, reg: 0, tour: 0, ncaa: 0, mcws: 0 });
      m.seasons++; m.cw += rg[t]?.cw || 0; m.cl += rg[t]?.cl || 0; m.w += all[t]?.w || 0; m.l += all[t]?.l || 0;
      if (regDone && regChamps.includes(t)) m.reg++;
      if (tChamp === t) m.tour++;
      if (bids.some(f => f.team === t) && se.post?.regionals) m.ncaa++;
      if (wsTeams(se).includes(t)) m.mcws++;
    }
    return { y, reg: regDone ? regChamps : [], regRec: t => `${rg[t].cw}-${rg[t].cl}`, t: tChamp, host: se.post?.confT?.[c]?.host || se.confHosts?.[c], tKind: se.post?.confT?.[c]?.kind,
      w, l, nw, nl, bids: bids.length, best: finishes[0], size: inC.size, inProgress: se.phase !== 'complete' };
  }).filter(Boolean);
  const wl = (w, l) => `${w}-${l}${w + l ? ` <span class="muted small">${fmtPct(w / (w + l))}</span>` : ''}`;
  const memberRows = Object.values(members).sort((x, z) => (z.reg + z.tour) - (x.reg + x.tour) || (z.cw / ((z.cw + z.cl) || 1)) - (x.cw / ((x.cw + x.cl) || 1)) || x.team.localeCompare(z.team));
  const vsRows = Object.entries(vsConf).sort((x, z) => (z[1].w + z[1].l) - (x[1].w + x[1].l));
  app.innerHTML = `
    <div class="conf-hero" style="border-bottom-color:${esc(info.color)}"><div class="conf-hero-logo">${confLogo(c, 76)}</div><div style="flex:1"><div class="team-hero-name">${esc(c)}</div><div class="team-hero-sub">${st.length} teams</div></div><a class="btn" href="#/conferences">All conferences</a></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${hist.length}</div><div class="l">Season${hist.length === 1 ? '' : 's'} in the dynasty</div></div>
      <div class="kpi"><div class="v">${ncW}-${ncL}</div><div class="l">Against other conferences${ncW + ncL ? ` (${fmtPct(ncW / (ncW + ncL))})` : ''}</div></div>
      <div class="kpi"><div class="v">${totBids}</div><div class="l">NCAA bids</div></div>
      <div class="kpi"><div class="v">${titles}</div><div class="l">National title${titles === 1 ? '' : 's'}</div></div>
    </div>
    <div class="grid">
      <div class="card"><h2>${s.year} standings</h2><div class="table-wrap"><table><thead><tr><th></th><th>Team</th><th class="num">Conf</th><th class="num">Overall</th><th class="num">OVR</th></tr></thead><tbody>
        ${st.map((x, i) => `<tr><td class="num muted">${i + 1}</td><td>${team(x.team)}</td><td class="num"><b>${x.cw}-${x.cl}</b></td><td class="num">${recs[x.team].w}-${recs[x.team].l}</td><td class="num">${ovr(s.teams[x.team])}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2>Against other conferences</h2>${vsRows.length ? `<div class="table-wrap"><table><thead><tr><th>Opponent</th><th class="num">W-L</th><th class="num">Pct</th></tr></thead><tbody>
        ${vsRows.map(([oc, v]) => `<tr><td>${ctx.league.conferences[oc] ? `<a class="conf-cell" href="${confHref(oc)}">${confLogo(oc, 18)}<span>${esc(oc)}</span></a>` : esc(oc)}</td><td class="num">${v.w}-${v.l}</td><td class="num">${fmtPct(v.w / ((v.w + v.l) || 1))}</td></tr>`).join('')}</tbody></table></div>
        <p class="small muted">Every game against a team from another conference, postseason included, all seasons.</p>` : '<p class="muted">No games against other conferences yet.</p>'}</div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Champions by season</h2><div class="table-wrap"><table class="champ-table"><thead><tr><th>Season</th><th>Regular season</th><th>Tournament</th><th>Host</th><th class="num">vs. other conf.</th><th class="num">NCAA bids</th><th class="num">NCAA W-L</th><th>Best finish</th></tr></thead><tbody>
      ${hist.map(h => `<tr><td><b>${h.y}</b>${h.inProgress ? '<div class="small muted">In progress</div>' : ''}</td>
        <td>${h.reg.length ? `<div class="stack-tight">${h.reg.map(t => `<span>${team(t, { rank: false })} <span class="muted small">${h.regRec(t)}</span></span>`).join('')}</div>${h.reg.length > 1 ? '<div class="small muted">Shared</div>' : ''}` : '<span class="muted">—</span>'}</td>
        <td>${h.t ? team(h.t, { rank: false }) : '<span class="muted">—</span>'}${h.tKind ? `<div class="small muted">${confFormatName(h.tKind)}</div>` : ''}</td>
        <td class="small">${h.host ? esc(h.host) : '<span class="muted">—</span>'}</td>
        <td class="num">${wl(h.w, h.l)}</td><td class="num">${h.bids || '<span class="muted">0</span>'}</td><td class="num">${h.nw + h.nl ? `${h.nw}-${h.nl}` : '<span class="muted">—</span>'}</td>
        <td>${h.best ? `${team(h.best.team, { rank: false, size: 16 })}<div class="small muted">${esc(h.best.finish)}</div>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card" style="margin-top:16px"><h2>Members, all-time</h2><div class="table-wrap"><table><thead><tr><th>Team</th><th class="num">Seasons</th><th class="num">Conf W-L</th><th class="num">Overall</th><th class="num">Reg. titles</th><th class="num">Tourn. titles</th><th class="num">NCAA</th><th class="num">WCWS</th></tr></thead><tbody>
      ${memberRows.map(m => `<tr><td>${team(m.team, { rank: false })}${s.teams[m.team]?.conference !== c ? ' <span class="muted small">(former)</span>' : ''}</td><td class="num">${m.seasons}</td><td class="num"><b>${m.cw}-${m.cl}</b> <span class="muted small">${m.cw + m.cl ? fmtPct(m.cw / (m.cw + m.cl)) : ''}</span></td><td class="num">${m.w}-${m.l}</td><td class="num">${m.reg || ''}</td><td class="num">${m.tour || ''}</td><td class="num">${m.ncaa || ''}</td><td class="num">${m.mcws || ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Counts only the seasons each team spent in the ${esc(c)}. Shared regular-season titles count for each co-champion.</p></div>
    <div class="card" style="margin-top:16px"><h2>Commissioner edits</h2>
      <div class="row"><label class="field" style="flex:1;min-width:160px">Name <input type="text" id="ce-name" value="${esc(c)}"></label>
        <label class="field" style="width:90px">Abbr. <input type="text" id="ce-abbr" maxlength="5" value="${esc(info.abbr || '')}"></label>
        <label class="field">Color <input type="color" id="ce-color" value="${esc(info.color || '#555555')}"></label>
        <label class="field" style="flex:2;min-width:220px">Logo image link <input type="text" id="ce-logo" placeholder="https://…" value="${esc(info.logo && !info.logo.startsWith('data:') ? info.logo : '')}"></label>
        <label class="btn" style="align-self:flex-end">Upload logo <input type="file" id="ce-file" accept="image/*" hidden></label>
        ${info.logo ? '<button class="btn" id="ce-clear" style="align-self:flex-end">Remove logo</button>' : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="ce-save">Save changes</button><span class="spacer"></span><button class="btn danger" id="ce-del">Delete conference</button></div></div>`;
  $('#ce-file').onchange = async e => { try { info.logo = await imageFileToDataUrl(e.target.files[0]); changed({ progress: false }); toast('Logo updated.'); } catch (err) { toast(err.message, true); } };
  if ($('#ce-clear')) $('#ce-clear').onclick = () => { delete info.logo; changed({ progress: false }); };
  $('#ce-save').onclick = () => {
    info.abbr = $('#ce-abbr').value.trim().toUpperCase() || info.abbr;
    info.color = $('#ce-color').value;
    if ($('#ce-logo').value.trim()) info.logo = $('#ce-logo').value.trim();
    const nn = $('#ce-name').value.trim();
    try { if (nn !== c) { renameConference(ctx.league, c, nn); location.hash = confHref(nn); } } catch (e) { return toast(e.message, true); }
    changed({ progress: false }); toast('Saved.');
  };
  $('#ce-del').onclick = () => {
    try { deleteConference(ctx.league, s, c); } catch (e) { return toast(e.message, true); }
    location.hash = '#/conferences'; changed({ progress: false });
  };
}

// ---------- History ----------

export function renderHistory() {
  const years = Object.keys(ctx.league.seasons).map(Number).sort((a, b) => b - a);
  app.innerHTML = `<div class="section-head"><h1>Dynasty history</h1></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Season</th><th>National champion</th><th>Runner-up</th><th>WCWS</th><th>Final top 5</th><th>Conference tournament champions</th></tr></thead><tbody>
    ${years.map(y => {
      const se = ctx.league.seasons[y], p = se.post || {};
      const top5 = se.polls?.final?.ranks.slice(0, 5).map(x => x.team) || [];
      return `<tr><td><b>${y}</b></td><td>${p.champion ? team(p.champion, { rank: false }) : '<span class="muted">In progress</span>'}</td><td>${p.runnerUp ? esc(p.runnerUp) : ''}</td>
        <td class="small">${wsTeams(se).map(esc).join(', ')}</td><td class="small">${top5.map((t, i) => `${i + 1}. ${esc(t)}`).join('<br>')}</td>
        <td class="small">${Object.values(p.confT || {}).map(ev => `${esc(ev.conf)}: ${esc(ev.champion || '—')}`).join('<br>')}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

// ---------- Settings ----------

// Rough games per team for the schedule settings (a week off here and there
// for teams left without a weekend opponent).
function gamesEstimate(cs) {
  const R = cs.regWeeks ?? 12, start = cs.midweekStart ?? 4, skip = (cs.midweekSkipLast ?? true) ? 1 : 0;
  const mid = Math.max(0, R - skip - start + 1) * ((cs.midweek ?? 'mixed') === 'single' ? 1 : 2);
  const top = R * 3 + mid;
  return `${top - 3}–${top}`;
}

export function renderSettings() {
  const L = ctx.league, s = S(), st = s.settings;
  const isCurrent = L.viewYear === L.currentYear;
  const cur = L.seasons[L.currentYear], cs = cur.settings;
  const saved = { ...DEFAULT_NCAA, ...(cs.ncaa || {}) };
  const nc = ui.ncaaDraft || saved;
  const ncDirty = ['regionals', 'perRegional', 'wsSize'].some(k => nc[k] !== saved[k]);
  const probs = ncaaProblems(nc, Object.keys(cur.teams).length, new Set(Object.values(cur.teams).map(t => t.conference)).size);
  const canRebuild = !s.games.some(g => g.type === 'regular' && isFinal(g));
  const missingHE = s.games.filter(g => g.final && g.source === 'manual' && s.teams[g.home] && s.teams[g.away] && !g.homeH && !g.awayH && !g.homeE && !g.awayE && (g.homeR + g.awayR) > 0).length;
  app.innerHTML = `<div class="section-head"><h1>Settings</h1></div>
    <div class="grid">
      <div class="card stack"><h2>League</h2>
        <label class="field">League name <input type="text" id="s-name" value="${esc(L.name)}"></label>
        <label class="field">${s.year} championship name <input type="text" id="s-mcws" value="${esc(st.mcwsName)}"></label>
        <div class="row"><label class="field" style="flex:1;min-width:160px">WCWS stadium <input type="text" id="s-venue" value="${esc(st.mcwsVenue || 'Devon Park')}"></label>
          <label class="field" style="flex:1;min-width:140px">City <input type="text" id="s-city" value="${esc(st.mcwsCity ?? 'Oklahoma City, Oklahoma')}"></label></div>
        <label class="field">Poll size <select id="s-poll">${POLL_SIZES.map(n => `<option value="${n}" ${pollSizeOf(cur) === n ? 'selected' : ''}>Top ${n}</option>`).join('')}</select></label>
        <p class="small muted" style="margin-top:-6px">Polls released from now on rank this many teams. Polls already out keep their size; regenerate one on the Rankings page to resize it.</p>
        <label class="field">Ratings between seasons <select id="s-dev">${Object.entries({ none: 'Stay the same', small: 'Small changes', normal: 'Normal changes', big: 'Big changes' }).map(([k, l]) => `<option value="${k}" ${st.development === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="small muted">Each new season moves every rating a little toward 70 with some random growth, and you can edit any rating in the offseason.</p>
      </div>
      <div class="card stack"><h2>Simulation (${s.year})</h2>
        <label class="field">Upsets in simulated games <select id="s-vol">${[[0.8, 'Fewer'], [1, 'Realistic'], [1.3, 'More'], [1.8, 'Chaos']].map(([v, l]) => `<option value="${v}" ${Number(st.volatility) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Ratings move with results during the season <select id="s-form">${[['none', 'No — ratings stay put'], ['small', 'A little'], ['normal', 'Normal'], ['big', 'A lot']].map(([v, l]) => `<option value="${v}" ${(st.form || 'normal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="s-rr" ${st.runRule ? 'checked' : ''}> 8-run rule after 5 innings</label>
        <label class="check"><input type="checkbox" id="s-tb" ${st.tiebreaker ? 'checked' : ''}> Extra innings start with a runner on second (8th inning on)</label>
        <button class="btn" id="s-backfill" ${missingHE ? '' : 'disabled'}>Estimate missing hits &amp; errors${missingHE ? ` (${missingHE} game${missingHE > 1 ? 's' : ''})` : ''}</button>
        <p class="small muted" style="margin-top:-6px">Scores you enter by hand get hits and errors from the line score and the teams' ratings when those boxes are left blank. This fills in ${s.year} games entered earlier with 0 hits and 0 errors for both teams.</p>
      </div>
      <div class="card stack"><h2>Season</h2>
        ${isCurrent ? `<a class="btn ${s.phase === 'complete' ? 'primary' : 'disabled'}" href="#/offseason">Go to the ${s.year + 1} offseason</a>
          <p class="small muted">${s.phase === 'complete' ? 'Add teams and conferences, realign, update coaches, then start the new season. The final poll seeds the new preseason poll.' : 'Opens once the national champion is crowned.'}</p>` : `<p class="muted">You're viewing a past season. Switch to ${L.currentYear} at the top to start a new one.</p>`}
        <button class="btn" id="s-rebuild" ${canRebuild ? '' : 'disabled'}>Rebuild ${s.year} schedule</button>
        <p class="small muted">${canRebuild ? 'Makes a new regular-season schedule from the current teams and conferences.' : 'Locked: regular-season games have been played.'}</p>
      </div>
      <div class="card stack"><h2>Schedule format</h2>
        <label class="field">Regular-season weeks <input type="number" id="s-weeks" min="8" max="16" value="${cs.regWeeks ?? DEFAULT_REG_WEEKS}"></label>
        <label class="field">Midweek games <select id="s-mid">${Object.entries(MIDWEEK).map(([k, l]) => `<option value="${k}" ${(cs.midweek ?? 'mixed') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Midweek games start in <select id="s-midstart">${Array.from({ length: 6 }, (_, i) => i + 1).map(w => `<option value="${w}" ${(cs.midweekStart ?? 4) === w ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="s-midskip" ${(cs.midweekSkipLast ?? true) ? 'checked' : ''}> No midweek games in the last regular-season week</label>
        <p class="small">About <b>${gamesEstimate(cs)}</b> games per team.</p>
        <p class="small muted">Used for every new schedule: the next season, or "Rebuild schedule" before any games are played. ${cur.year} runs ${regWeeksOf(cur)} weeks. Weekends are three-game series; midweek sets are two games against one opponent (a Tuesday doubleheader or Tuesday and Wednesday games). Conference play fills the last weeks. A conference's size sets when it starts (one week per round of its round robin, at most 9 weeks; bigger conferences play 9 of their members), and everyone finishes on the final weekend and nobody plays a non-conference weekend series once their conference season starts. A team with a conference bye plays a single Thursday game against another conference instead.</p>
      </div>
      <div class="card stack ncaa-card"><h2>NCAA tournament</h2>
        <label class="field">WCWS <select id="n-ws">${[[4, '4 teams: double elimination to two, then a best-of-three final'], [8, '8 teams: Bracket A and Bracket B, then a best-of-three final']].map(([v, l]) => `<option value="${v}" ${nc.wsSize === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Regionals <select id="n-reg">${[nc.wsSize, nc.wsSize * 2].map(v => `<option value="${v}" ${nc.regionals === v ? 'selected' : ''}>${v} regionals${v === nc.wsSize ? ': champions go straight to the WCWS' : `: champions meet in ${v / 2} best-of-three super regionals`}</option>`).join('')}</select></label>
        <label class="field">Teams per regional <select id="n-per">${[[2, '2: best-of-three series'], [3, '3: double elimination'], [4, '4: double elimination (classic NCAA)'], [5, '5: double elimination'], [6, '6: double elimination']].map(([v, l]) => `<option value="${v}" ${nc.perRegional === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="kpis kpis-sm" style="margin:0"><div class="kpi"><div class="v">${fieldSize(nc)}</div><div class="l">Qualifiers</div></div><div class="kpi"><div class="v">${Object.keys(ctx.league.conferences).filter(c => Object.values(cur.teams).some(t => t.conference === c)).length}</div><div class="l">Automatic bids</div></div><div class="kpi"><div class="v">${Math.max(0, fieldSize(nc) - Object.keys(ctx.league.conferences).filter(c => Object.values(cur.teams).some(t => t.conference === c)).length)}</div><div class="l">At-large</div></div></div>
        <p class="small">${formatSummary(nc)}</p>
        ${probs.length ? `<div class="hint warn">${probs.map(esc).join('<br>')}</div>` : ''}
        <div class="row"><button class="btn primary" id="n-save" ${probs.length || !ncDirty ? 'disabled' : ''}>Save tournament format</button>${ncDirty ? '<button class="btn" id="n-cancel">Undo changes</button>' : ''}</div>
        <p class="small muted">${cur.post?.cfg ? `The ${cur.year} field is already announced, so a new format starts in ${cur.year + 1}.` : `Applies to the ${cur.year} tournament and every season after.`} Each conference champion gets an automatic bid; the committee picks the rest and seeds the field. The top national seeds host the regionals.</p>
      </div>
      <div class="card stack"><h2>Backups</h2>
        <p class="small muted">The dynasty is saved in this browser. Download a backup to keep a copy or move it to another device.</p>
        <div class="row"><button class="btn" id="s-export">Download backup</button><label class="btn">Restore backup <input type="file" id="s-import" accept="application/json,.json" hidden></label></div>
        <button class="btn danger" id="s-reset">Start over with a new league</button>
      </div>
    </div>`;
  $('#s-poll').onchange = e => { cs.pollSize = +e.target.value; changed({ progress: false }); toast(`Polls from now on will be a Top ${cs.pollSize}.`); };
  $('#s-weeks').onchange = e => { cs.regWeeks = Math.max(8, Math.min(16, Math.round(Number(e.target.value) || DEFAULT_REG_WEEKS))); changed({ progress: false }); toast(`New schedules will run ${cs.regWeeks} weeks.`); };
  $('#s-mid').onchange = e => { cs.midweek = e.target.value; changed({ progress: false }); };
  $('#s-midstart').onchange = e => { cs.midweekStart = +e.target.value; changed({ progress: false }); };
  $('#s-midskip').onchange = e => { cs.midweekSkipLast = e.target.checked; changed({ progress: false }); };
  const draft = () => (ui.ncaaDraft ||= { ...nc });
  $('#n-ws').onchange = e => { const d = draft(); d.wsSize = +e.target.value; if (d.regionals !== d.wsSize && d.regionals !== d.wsSize * 2) d.regionals = d.wsSize === 8 ? 8 : 4; renderSettings(); };
  $('#n-reg').onchange = e => { draft().regionals = +e.target.value; renderSettings(); };
  $('#n-per').onchange = e => { draft().perRegional = +e.target.value; renderSettings(); };
  if ($('#n-cancel')) $('#n-cancel').onclick = () => { ui.ncaaDraft = null; renderSettings(); };
  $('#n-save').onclick = () => {
    cs.ncaa = { regionals: nc.regionals, perRegional: nc.perRegional, wsSize: nc.wsSize };
    ui.ncaaDraft = null;
    if (cur.phase === 'selection') proposeField(cur); // resize the proposed field to the new format
    changed();
    toast(cur.post?.cfg ? `Saved. The new format starts in ${cur.year + 1}.` : `Saved. The ${cur.year} tournament will use ${fieldSize(cs.ncaa)} qualifiers.`);
  };
  $('#s-name').onchange = e => { L.name = e.target.value.trim() || L.name; changed({ progress: false }); };
  $('#s-venue').onchange = e => { st.mcwsVenue = e.target.value.trim() || 'Devon Park'; changed({ progress: false }); };
  $('#s-city').onchange = e => { st.mcwsCity = e.target.value.trim(); changed({ progress: false }); };
  $('#s-mcws').onchange = e => { st.mcwsName = e.target.value.trim() || "Women's College World Series"; changed({ progress: false }); };
  $('#s-dev').onchange = e => { st.development = e.target.value; persist(); };
  $('#s-vol').onchange = e => { st.volatility = Number(e.target.value); persist(); };
  $('#s-backfill').onclick = () => {
    if (!confirm(`Estimate hits and errors for ${missingHE} hand-entered ${s.year} game${missingHE > 1 ? 's' : ''} that show 0 hits and 0 errors?`)) return;
    const k = backfillHitsErrors(s); changed({ progress: false }); toast(`Hits and errors estimated for ${k} game${k === 1 ? '' : 's'}.`);
  };
  $('#s-form').onchange = e => { st.form = e.target.value; changed(); };
  $('#s-rr').onchange = e => { st.runRule = e.target.checked; persist(); };
  $('#s-tb').onchange = e => { st.tiebreaker = e.target.checked; persist(); };
  $('#s-rebuild').onclick = () => {
    if (!confirm(`Replace the ${s.year} regular-season schedule with a new one?`)) return;
    try { rebuildSchedule(s, L.seasons[s.year - 1] || null); } catch (e) { return toast(e.message, true); }
    changed(); toast('New schedule built.');
  };
  $('#s-export').onclick = () => exportLeague(L);
  $('#s-import').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!data.seasons || !data.conferences) throw new Error('That file is not an NCAA Softball Dynasty backup.');
      if (!confirm('Replace the current dynasty with this backup?')) return;
      data.viewYear = data.currentYear;
      migrateLeague(data);
      ctx.league = data; await flushSave(); location.hash = '#/home'; ctx.render(); toast('Backup restored.');
    } catch (err) { toast(err.message, true); }
  };
  $('#s-reset').onclick = async () => {
    if (!confirm('Delete this dynasty and start over from 2030? Download a backup first if you want to keep it.')) return;
    await clearLeague();
    ctx.league = newLeague(); ctx.league.viewYear = ctx.league.currentYear;
    await flushSave(); location.hash = '#/home'; ctx.render(); toast('New league created.');
  };
}
