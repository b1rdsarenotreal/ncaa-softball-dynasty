// Shared UI state and pieces used by every page: the league, saving,
// team labels and logos, game cards, and the game editor.

import { saveLeague } from './store.js?v=20261014163557';
import { logoFor } from './logos.js?v=20261014163557';
import { LOGO_ALIASES } from './data.js?v=20261014163557';
import { ovr, winProbability } from './sim.js?v=20261014163557';
import { records, isFinal, winnerOf } from './standings.js?v=20261014163557';
import { latestPoll, pollRankMap } from './polls.js?v=20261014163557';
import { afterChange, applyResult, clearResult, simResult, deleteGame, weekName, estimateHE } from './league.js?v=20261014163557';
import { regWeeksOf, shownSeed, mcwsVenue } from './postseason.js?v=20261014163557';
import { DAY_ORDER } from './schedule.js?v=20261014163557';
import { esc } from './util.js?v=20261014163557';

export { esc };
export const ctx = { league: null, render: () => {} };
export const app = document.getElementById('app');
export const modal = document.getElementById('modal');
export const S = () => ctx.league.seasons[ctx.league.viewYear];
export const $ = (sel, root = app) => root.querySelector(sel);
export const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
export const sum = a => a.reduce((s, x) => s + (Number(x) || 0), 0);
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

let saveTimer;
export function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveLeague(ctx.league), 200); }
export function flushSave() { clearTimeout(saveTimer); return saveLeague(ctx.league); }

// Save and redraw after a change to results.
export function changed({ progress = true } = {}) {
  if (progress) afterChange(S());
  cache.reset();
  persist();
  ctx.render();
}

export function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), error ? 5000 : 2600);
}

// Per-render caches.
export const cache = {
  _recs: null, _ranks: null,
  reset() { this._recs = null; this._ranks = null; this._at = {}; this._series = null; },
  recs() { return (this._recs ||= records(S())); },
  ranks() { return (this._ranks ||= pollRankMap(latestPoll(S()))); },
  // Ranks as they stood when a game in `week` was played: the most recent
  // poll released before that week (week 1 uses the preseason poll).
  // Games in weeks with no earlier poll yet use the latest one.
  _at: {},
  ranksAt(week) {
    const s = S();
    const key = Object.keys(s.polls || {}).filter(k => k !== 'final').map(Number).filter(w => w < week).sort((a, b) => b - a)[0];
    if (key === undefined) return this.ranks();
    return (this._at[key] ||= pollRankMap(s.polls[key]));
  },
};

// ---------- teams and logos ----------

export function teamInfo(name) {
  const s = S();
  if (s.teams[name]) return s.teams[name];
  const ys = Object.keys(ctx.league.seasons).map(Number).sort((a, b) => b - a);
  for (const y of ys) if (ctx.league.seasons[y].teams[name]) return ctx.league.seasons[y].teams[name];
  return null;
}
export const teamNames = () => Object.keys(S().teams).sort((a, b) => a.localeCompare(b));
export const teamHref = name => `#/team/${encodeURIComponent(name)}`;
export const confHref = c => `#/conference/${encodeURIComponent(c)}`;

function initials(name) { return name.replace(/[^A-Za-z0-9 &–-]/g, '').split(/[\s&–-]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase(); }

export function logoImg(t, size = 18) {
  if (!t) return `<span class="dot" style="background:#999"></span>`;
  const url = logoFor(t, LOGO_ALIASES);
  const badge = `<span class="tbadge" style="width:${size}px;height:${size}px;font-size:${Math.max(7, size * 0.38)}px;background:${esc(t.color)};color:${esc(readableOn(t.color, t.altColor))}">${esc(t.abbr || initials(t.school))}</span>`;
  if (!url) return badge;
  return `<span class="logo" style="width:${size}px;height:${size}px"><img src="${esc(url)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.parentNode.outerHTML=this.parentNode.dataset.fb" ></span>`.replace('class="logo"', `class="logo" data-fb="${esc(badge)}"`);
}

// Pick the alt color for text on the primary color if it contrasts; else white or black.
export function readableOn(bg, alt) {
  const lum = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return 0.5; const n = parseInt(m[1], 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const lb = lum(bg);
  if (alt && ratio(lb, lum(alt)) >= 3) return alt;
  return ratio(lb, 1) >= ratio(lb, 0) ? '#ffffff' : '#000000';
}

export function team(name, { rank = true, record = false, seed = null, link = true, size = 18, abbrAlt = false, ranks = null } = {}) {
  if (!name) return '<span class="muted">TBD</span>';
  const t = teamInfo(name);
  const rk = (ranks || cache.ranks())[name];
  // Seed in parentheses, then the poll ranking, both right before the name.
  const r = (seed ? `<span class="rank seed" title="Seed">(${seed})</span>` : '') + (rank && rk ? `<span class="rank" title="Poll ranking">${rk}</span>` : '');
  let rec = '';
  if (record && S().teams[name]) { const x = cache.recs()[name]; rec = ` <span class="muted small">${x.w}-${x.l}</span>`; }
  // abbrAlt: also carry the abbreviation, shown instead when the card is narrow.
  const text = abbrAlt && t?.abbr ? `<span class="tn-full">${esc(name)}</span><span class="tn-abbr">${esc(t.abbr)}</span>` : esc(name);
  const label = t && link ? `<a class="team-link" href="${teamHref(name)}" title="${esc(name)}">${text}</a>` : text;
  return `<span class="team">${logoImg(t, size)}${r}${label}${rec}</span>`;
}

export function teamOptions(selected, { blank = true, list = teamNames(), blankLabel = '—' } = {}) {
  return (blank ? `<option value="">${esc(blankLabel)}</option>` : '') + list.map(t => `<option ${t === selected ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

// ---------- conferences ----------

export function confInfo(c) { return ctx.league.conferences[c] || { abbr: initials(c), color: '#555555' }; }
export function confColor(c) { return confInfo(c).color || '#555555'; }
export function confLogo(c, size = 24) {
  const info = confInfo(c);
  const badge = `<span class="conf-badge" style="width:${size}px;height:${size}px;font-size:${Math.max(8, size * 0.34)}px;background:${esc(info.color)}">${esc(info.abbr || initials(c))}</span>`;
  if (!info.logo) return badge;
  return `<span class="conf-logo" style="width:${size}px;height:${size}px"><img src="${esc(info.logo)}" alt="" onerror="this.parentNode.classList.add('broken')">${badge}</span>`;
}

// Read an image file and shrink it to at most `max` pixels, as a data URL.
export function imageFileToDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick an image file (PNG, JPG, SVG, GIF or WebP).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const w = img.naturalWidth || max, h = img.naturalHeight || max, k = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- game cards ----------

// Seed shown on a postseason game: the conference tournament seed, or the
// national seed for NCAA regional hosts only.
export function seedOf(g, t) {
  const s = S();
  if (g.type === 'conf') { const ev = Object.values(s.post?.confT || {}).find(e => e.id === g.event); const i = ev ? ev.seeds.indexOf(t) : -1; return i >= 0 ? i + 1 : null; }
  if (!['regional', 'super', 'mcws'].includes(g.type)) return null;
  return shownSeed(s, t);
}

export function resultText(g) {
  const w = winnerOf(g), l = w === g.home ? g.away : g.home;
  const extra = g.homeLine.length > 7 || g.awayLine.length > 7 ? ` (${Math.max(g.homeLine.length, g.awayLine.length)})` : g.runRule ? ` (${Math.max(g.homeLine.length, g.awayLine.length)}, run rule)` : '';
  return `${w} ${Math.max(g.homeR, g.awayR)}, ${l} ${Math.min(g.homeR, g.awayR)}${extra}`;
}

// A scoreboard tile: away team on the left, home team on the right, each
// with its logo, abbreviation and rank; the score in the middle. A played
// game takes a light wash of the winner's color, strongest on its side, and
// keeps the inning-by-inning line score in a quiet strip underneath.
export function gameCard(g) {
  const s = S();
  const n = Math.max(7, g.homeLine.length, g.awayLine.length);
  const fin = isFinal(g);
  const w = fin ? winnerOf(g) : null;
  const confGame = g.type === 'regular' && g.confGame;
  const conf = confGame ? s.teams[g.home]?.conference : g.type === 'conf' ? g.event.replace(/^ct-/, '') : null;
  const recs = cache.recs();
  const ranks = showsRank(g.type) ? (fin ? cache.ranksAt(g.week) : cache.ranks()) : {};
  const inn = Math.max(g.homeLine.length, g.awayLine.length);
  const side = (t, R, where) => {
    const info = teamInfo(t);
    const seed = seedOf(g, t), rk = ranks[t];
    const rec = recs[t] && !fin ? `${recs[t].w}-${recs[t].l}${confGame ? ` <span class="gc-conf">(${recs[t].cw}-${recs[t].cl})</span>` : ''}` : '';
    const label = `${seed ? `<span class="gc-seed" title="Seed">(${seed})</span>` : ''}${rk ? `<span class="gc-rank" title="Poll ranking">${rk}</span>` : ''}<span class="gc-abbr">${esc(info?.abbr || t || 'TBD')}</span>`;
    return `<div class="gc-side gc-${where} ${fin ? (w === t ? 'is-win' : 'is-loss') : ''}">
      ${t ? `<a class="gc-logo" href="${teamHref(t)}" title="${esc(t)}">${logoImg(info, 44)}</a>` : '<span class="gc-logo"></span>'}
      <a class="gc-name" href="${t ? teamHref(t) : '#'}" title="${esc(t || '')}">${label}</a>
      ${rec ? `<span class="gc-rec">${rec}</span>` : ''}</div>`;
  };
  let center;
  if (fin) {
    const a = `<span class="gc-r ${w === g.away ? 'is-win' : ''}">${g.awayR}</span>`, h = `<span class="gc-r ${w === g.home ? 'is-win' : ''}">${g.homeR}</span>`;
    center = `<div class="gc-mid"><div class="gc-score">${a}<span class="gc-dash">–</span>${h}</div><div class="gc-status">Final${inn !== 7 ? `/${inn}` : ''}</div></div>`;
  } else {
    let sub = '';
    if (g.home && g.away && s.teams[g.home] && s.teams[g.away]) {
      const wp = winProbability(s.teams[g.home], s.teams[g.away], g, { volatility: s.settings.volatility });
      const fav = wp >= 0.5 ? g.home : g.away;
      sub = `${esc(s.teams[fav].abbr)} ${Math.round(Math.max(wp, 1 - wp) * 100)}%`;
    }
    center = `<div class="gc-mid"><div class="gc-at">${g.neutral ? 'vs' : 'at'}</div>${sub ? `<div class="gc-status" title="Win probability">${sub}</div>` : ''}</div>`;
  }
  // Line score strip.
  const cell = (arr, i) => (i < arr.length ? (arr[i] === null ? 'X' : arr[i]) : '');
  const lrow = (t, arr, R, H, E) => `<div class="gc-lrow ${w === t ? 'is-win' : ''}"><span class="gc-lt">${esc(teamInfo(t)?.abbr || t)}</span>${Array.from({ length: n }, (_, i) => `<span>${cell(arr, i)}</span>`).join('')}<b>${R}</b><span>${H}</span><span>${E}</span></div>`;
  const lines = fin ? `<div class="gc-lines" style="--q:${n}"><div class="gc-lrow gc-lhead"><span></span>${Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('')}<b>R</b><span>H</span><span>E</span></div>${lrow(g.away, g.awayLine, g.awayR, g.awayH, g.awayE)}${lrow(g.home, g.homeLine, g.homeR, g.homeH, g.homeE)}</div>` : '';
  // Top: conference logo and series standing; bottom: label, venue, sim.
  const series = seriesStatus(g, 34);
  const top = `<div class="gc-top">${conf ? `<a class="gc-conflogo" href="${confHref(conf)}" title="${esc(conf)}${confGame ? ' game' : ' Tournament'}">${confLogo(conf, 18)}</a>` : ''}<span class="series-tag">${series}</span></div>`;
  let meta = '';
  if (g.label) meta += `<span class="badge gold">${esc(g.midweek ? g.label.replace(' · ', ' ') : g.label.split(' · ').slice(-1)[0])}</span>`;
  const venue = g.type === 'mcws' ? mcwsVenue(s) : null;
  if (venue) meta += `<span class="venue" title="${esc(venue.city)}">${esc(venue.stadium)}</span>`;
  if (!fin && g.home && g.away && s.teams[g.home] && s.teams[g.away]) {
    if (g.site && g.site !== g.home) meta += `<span>at ${esc(teamInfo(g.site)?.abbr || g.site)}</span>`;
    else if (g.type === 'conf' && g.event) {
      const host = Object.values(s.post?.confT || {}).find(e => e.id === g.event)?.host;
      if (host && g.neutral) meta += `<span>at ${esc(teamInfo(host)?.abbr || host)}</span>`;
      else if (g.neutral) meta += '<span>Neutral site</span>';
    } else if (g.neutral && !venue) meta += '<span>Neutral site</span>';
    meta += `<button class="btn sm" data-simgame="${g.id}" title="Simulate this game and save the result">🎲 Sim</button>`;
  }
  const wc = fin ? teamInfo(w)?.color : null;
  const style = [conf ? `--cc:${esc(confColor(conf))}` : '', /^#[0-9a-f]{6}$/i.test(wc || '') ? `--wc:${esc(wc)}` : ''].filter(Boolean).join(';');
  const cls = ['game', 'gc', conf ? 'conf-game' : '', fin ? `won-${w === g.home ? 'home' : 'away'}` : 'upcoming'].filter(Boolean).join(' ');
  return `<div class="${cls}"${style ? ` style="${style}"` : ''} data-game="${g.id}" tabindex="0">${top}
    <div class="gc-match">${side(g.away, g.awayR, 'away')}${center}${side(g.home, g.homeR, 'home')}</div>
    ${lines}${meta ? `<div class="meta gc-meta">${meta}</div>` : ''}</div>`;
}

// ---------- series tally ----------
// Weekend series (and the WCWS Championship Series): where it stands after
// this game, or going into it if it hasn't been played.
function seriesKey(g) {
  if (g.series) return g.series;
  if (g.type === 'mcws' && /^F\d/.test(g.node || '')) return `${g.event}-finals`;
  return null;
}
export function seriesStatus(g, maxChars = 31) {
  const key = seriesKey(g);
  if (!key) return '';
  const s = S();
  cache._series ||= {};
  const all = (cache._series[key] ||= s.games.filter(x => seriesKey(x) === key).sort((a, b) => a.order - b.order || a.id - b.id));
  const bestOf = g.bestOf || (g.type === 'mcws' && /^F\d/.test(g.node || '') ? 3 : null);
  if (all.length < 2 && !bestOf) return '';
  const idx = all.indexOf(g);
  const fin = isFinal(g);
  const upto = all.slice(0, fin ? idx + 1 : idx).filter(isFinal);
  const wins = {};
  for (const x of upto) { const w = winnerOf(x); wins[w] = (wins[w] || 0) + 1; }
  const wa = wins[g.home] || 0, wb = wins[g.away] || 0;
  const leader = wa > wb ? g.home : g.away, hi = Math.max(wa, wb), lo = Math.min(wa, wb);
  // Full school name when the sentence fits the corner; the abbreviation when it doesn't.
  const fits = t => `${t} leads series 10-10`.length <= maxChars;
  const name = t => (fits(t) ? `<span class="tn-full">${esc(t)}</span><span class="tn-abbr">${esc(teamInfo(t)?.abbr || t)}</span>` : esc(teamInfo(t)?.abbr || t));
  // Weekend and midweek sets play every game; best-of-three series stop at two wins.
  const total = bestOf || all.length;
  const left = total - upto.length;
  const clinched = bestOf ? hi > bestOf / 2 : hi > lo + left;
  const over = bestOf ? clinched : left === 0;
  let text;
  if (!upto.length) text = bestOf ? 'Best of 3' : `Game 1 of ${total}`;
  else if (wa === wb) text = over ? `Series split ${wa}-${wb}` : `Series tied ${wa}-${wb}`;
  else if (clinched) text = `${name(leader)} wins series ${hi}-${lo}`;
  else text = `${name(leader)} leads series ${hi}-${lo}`;
  const prefix = !fin && upto.length ? `Game ${idx + 1} · ` : '';
  const plain = (prefix + text.replace(/<span class="tn-full">([^<]*)<\/span><span class="tn-abbr">[^<]*<\/span>/g, '$1')).replace(/<[^>]+>/g, '');
  return `<span class="series-text" title="${esc(plain)}">${prefix}${text}</span>`;
}

export function bindGameCards(root = app) {
  $$('[data-simgame]', root).forEach(b => (b.onclick = e => {
    e.stopPropagation();
    const g = S().games.find(x => x.id === Number(b.dataset.simgame));
    if (!g || isFinal(g)) return;
    applyResult(g, simResult(S(), g));
    toast(resultText(g));
    changed();
  }));
  $$('.game[data-game], .bgame[data-game]', root).forEach(el => {
    el.onclick = e => { if (!e.target.closest('a, button')) openGame(Number(el.dataset.game)); };
    el.onkeydown = e => { if (e.key === 'Enter') openGame(Number(el.dataset.game)); };
  });
}

// ---------- game editor ----------

export function openGame(id, { isNew = false } = {}) {
  const s = S(), g = s.games.find(x => x.id === id);
  if (!g) return;
  let source = g.source;
  // Hits and errors that came from a simulation or an estimate (not typed in)
  // are cleared when the runs change, so they get estimated again.
  let autoHE = g.source === 'sim' || !!g.heEstimated;
  let n = isFinal(g) ? Math.max(g.homeLine.length, g.awayLine.length) : 7;
  const regular = g.type === 'regular';
  const cellVal = (arr, i) => (isFinal(g) && i < arr.length ? (arr[i] === null ? '' : arr[i]) : '');

  modal.innerHTML = `
    <div class="modal-head"><h2>${esc(g.label || `${weekName(g.week, s)} · ${DAY_NAMES[g.day] || g.day}`)}</h2><button class="btn ghost" data-x>✕</button></div>
    <div class="modal-body stack">
      ${g.type === 'mcws' ? (v => `<div class="small muted venue-line">${esc(v.stadium)}${v.city ? ` · ${esc(v.city)}` : ''}</div>`)(mcwsVenue(s)) : ''}
      ${regular ? `<div class="row">
        <label class="field" style="flex:1;min-width:140px">Away <select id="m-away">${teamOptions(g.away)}</select></label>
        <label class="field" style="flex:1;min-width:140px">Home <select id="m-home">${teamOptions(g.home)}</select></label>
        <label class="field" style="width:64px">Week <input type="number" id="m-week" min="1" max="${regWeeksOf(s)}" value="${g.week}"></label>
        <label class="field" style="width:84px">Day <select id="m-day">${DAYS.map(d => `<option ${d === g.day ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="m-neutral" ${g.neutral ? 'checked' : ''}> Neutral site</label>
        <label class="check"><input type="checkbox" id="m-conf" ${g.confGame ? 'checked' : ''}> Conference game</label></div>` : ''}
      <div class="table-wrap"><div class="lsgrid" id="m-grid"></div></div>
      <div class="row"><button class="btn sm" id="m-addinn">+ Extra inning</button><button class="btn sm" id="m-delinn">− Inning</button>
        <button class="btn sm" id="m-est" title="Fill hits and errors from the line score and the teams' ratings">⚾ Estimate H &amp; E</button>
        <span class="small muted">Leave the home team's last inning blank for an "X" (they didn't need to bat). Hits and errors left blank are estimated from the line score and the teams' ratings when you save.</span></div>
      <div id="m-preview"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="m-sim">🎲 Simulate</button>
      ${isFinal(g) ? '<button class="btn" id="m-clear">Clear result</button>' : ''}
      ${regular ? '<button class="btn danger" id="m-del">Delete game</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" data-x>Cancel</button>
      <button class="btn primary" id="m-save">Save final</button>
    </div>`;

  const cur = () => ({
    home: regular ? $('#m-home', modal).value : g.home,
    away: regular ? $('#m-away', modal).value : g.away,
    neutral: regular ? $('#m-neutral', modal).checked : g.neutral,
  });

  // Line score grid. Values are kept across redraws (adding innings).
  const values = { away: g.awayLine.map((_, i) => cellVal(g.awayLine, i)), home: g.homeLine.map((_, i) => cellVal(g.homeLine, i)), awayH: g.awayH ?? '', awayE: g.awayE ?? '', homeH: g.homeH ?? '', homeE: g.homeE ?? '' };
  const readGrid = () => {
    $$('input[data-inn]', modal).forEach(i => { values[i.dataset.side][Number(i.dataset.inn)] = i.value; });
    for (const k of ['awayH', 'awayE', 'homeH', 'homeE']) { const el = $(`#m-${k}`, modal); if (el) values[k] = el.value; }
  };
  const drawGrid = () => {
    const t = cur();
    const cols = `minmax(110px,1fr) repeat(${n}, 34px) 40px 38px 38px`;
    let h = `<div class="lsrow head" style="grid-template-columns:${cols}"><div></div>${Array.from({ length: n }, (_, i) => `<div>${i + 1}</div>`).join('')}<div>R</div><div>H</div><div>E</div></div>`;
    for (const side of ['away', 'home']) {
      h += `<div class="lsrow" style="grid-template-columns:${cols}"><div class="team-cell">${team(t[side], { link: false, rank: false })}</div>
        ${Array.from({ length: n }, (_, i) => `<input type="text" inputmode="numeric" maxlength="2" autocomplete="off" data-side="${side}" data-inn="${i}" value="${esc(values[side][i] ?? '')}" aria-label="${side} inning ${i + 1}">`).join('')}
        <div class="tot" id="m-${side}-R"></div>
        <input type="text" inputmode="numeric" maxlength="2" id="m-${side}H" value="${esc(values[side + 'H'])}" aria-label="${side} hits">
        <input type="text" inputmode="numeric" maxlength="2" id="m-${side}E" value="${esc(values[side + 'E'])}" aria-label="${side} errors"></div>`;
    }
    $('#m-grid', modal).innerHTML = h;
    $$('#m-grid input', modal).forEach(i => (i.oninput = () => {
      source = 'manual';
      if (i.dataset.inn != null) {
        if (autoHE) { autoHE = false; for (const k of ['awayH', 'awayE', 'homeH', 'homeE']) { values[k] = ''; $(`#m-${k}`, modal).value = ''; } }
      } else autoHE = false;
      readGrid(); totals();
    }));
    for (const k of ['awayH', 'awayE', 'homeH', 'homeE']) $(`#m-${k}`, modal).placeholder = 'auto';
    // Tab follows the game: top 1st, bottom 1st, top 2nd, … then hits and
    // errors. Shift+Tab goes back. Each box's number is selected so typing replaces it.
    const order = [];
    for (let i = 0; i < n; i++) order.push($(`input[data-side="away"][data-inn="${i}"]`, modal), $(`input[data-side="home"][data-inn="${i}"]`, modal));
    order.push($('#m-awayH', modal), $('#m-awayE', modal), $('#m-homeH', modal), $('#m-homeE', modal));
    order.forEach((el, idx) => {
      el.onfocus = () => el.select();
      el.onkeydown = e => {
        if (e.key !== 'Tab') return;
        const next = order[idx + (e.shiftKey ? -1 : 1)];
        if (!next) return; // leave the grid normally at either end
        e.preventDefault();
        next.focus();
      };
    });
    totals();
  };
  const totals = () => { for (const side of ['away', 'home']) $(`#m-${side}-R`, modal).textContent = sum(values[side].slice(0, n)); };
  const refresh = () => {
    const t = cur(), prev = $('#m-preview', modal);
    if (t.home && t.away && s.teams[t.home] && s.teams[t.away] && t.home !== t.away) {
      const wp = winProbability(s.teams[t.home], s.teams[t.away], { ...g, home: t.home, away: t.away, neutral: t.neutral }, { volatility: s.settings.volatility });
      const ch = c => s.teams[c]?.color || '#999';
      prev.innerHTML = `<div class="small muted" style="margin-bottom:4px">Pre-game: ${esc(t.home)} wins ${Math.round(wp * 100)}%, ${esc(t.away)} ${Math.round((1 - wp) * 100)}% · OVR ${ovr(s.teams[t.away])} vs ${ovr(s.teams[t.home])}</div>
        <div class="wpbar"><div style="width:${(1 - wp) * 100}%;background:${esc(ch(t.away))}"></div><div style="width:${wp * 100}%;background:${esc(ch(t.home))}"></div></div>`;
    } else prev.innerHTML = '';
  };
  drawGrid(); refresh();

  if (regular) {
    const onTeams = () => {
      const t = cur();
      if (t.home && t.away && s.teams[t.home] && s.teams[t.away]) $('#m-conf', modal).checked = s.teams[t.home].conference === s.teams[t.away].conference;
      drawGrid(); refresh();
    };
    $('#m-home', modal).onchange = onTeams; $('#m-away', modal).onchange = onTeams;
    $('#m-neutral', modal).onchange = refresh;
  }
  $('#m-addinn', modal).onclick = () => { readGrid(); n++; drawGrid(); };
  $('#m-delinn', modal).onclick = () => { readGrid(); if (n > 1) { n--; values.home.length = Math.min(values.home.length, n); values.away.length = Math.min(values.away.length, n); } drawGrid(); };
  $$('[data-x]', modal).forEach(b => (b.onclick = () => modal.close()));
  modal.onclose = () => {
    if (isNew && !isFinal(g) && (!g.home || !g.away)) deleteGame(s, g.id);
    ctx.render();
  };

  $('#m-sim', modal).onclick = () => {
    const t = cur();
    if (!t.home || !t.away || t.home === t.away) return toast('Pick two different teams first.', true);
    const res = simResult(s, { ...g, ...t });
    n = Math.max(res.homeLine.length, res.awayLine.length);
    values.away = res.awayLine.map(v => (v === null ? '' : v));
    values.home = res.homeLine.map(v => (v === null ? '' : v));
    Object.assign(values, { awayH: res.away.H, awayE: res.away.E, homeH: res.home.H, homeE: res.home.E });
    source = 'sim'; autoHE = true;
    drawGrid(); refresh();
  };
  if ($('#m-clear', modal)) $('#m-clear', modal).onclick = () => { clearResult(g); modal.close(); changed(); toast('Result cleared.'); };
  if ($('#m-del', modal)) $('#m-del', modal).onclick = () => {
    if (!confirm('Delete this game from the schedule?')) return;
    deleteGame(s, g.id); isNew = false; modal.close(); changed();
  };

  const num = v => /^\d+$/.test(String(v).trim());
  // Check the grid; returns the line scores, or shows what's wrong.
  const readLines = () => {
    readGrid();
    const t = cur();
    if (!t.home || !t.away) return toast('Pick both teams.', true);
    if (t.home === t.away) return toast("A team can't play itself.", true);
    const away = values.away.slice(0, n), home = values.home.slice(0, n);
    while (away.length < n) away.push(''); while (home.length < n) home.push('');
    if (away.some(v => !num(v))) return toast('Fill in every inning for the away team (0 is fine).', true);
    if (home.slice(0, n - 1).some(v => !num(v))) return toast('Fill in every home inning; only the last one can be blank.', true);
    if (home[n - 1] !== '' && !num(home[n - 1])) return toast('Runs must be whole numbers.', true);
    for (const k of ['awayH', 'awayE', 'homeH', 'homeE']) if (values[k] !== '' && !num(values[k])) return toast('Hits and errors must be whole numbers.', true);
    const awayLine = away.map(Number), homeLine = home.map((v, i) => (i === n - 1 && v === '' ? null : Number(v)));
    const hr = sum(homeLine), ar = sum(awayLine);
    if (hr === ar) return toast("Games can't end tied. Add an extra inning.", true);
    if (homeLine[n - 1] === null && hr <= ar) return toast('The home team only skips its last at-bat when it is already ahead.', true);
    return { t, homeLine, awayLine, hr, ar };
  };
  // Fill hits and errors from the ratings: all four, or only the blank ones.
  const fillHE = (L, onlyBlank) => {
    const e = estimateHE(s, { ...g, ...L.t }, L.homeLine, L.awayLine);
    const est = { awayH: e.away.H, awayE: e.away.E, homeH: e.home.H, homeE: e.home.E };
    let filled = 0;
    for (const k of Object.keys(est)) if (!onlyBlank || values[k] === '') { values[k] = est[k]; filled++; }
    return filled;
  };
  $('#m-est', modal).onclick = () => {
    const L = readLines(); if (!L) return;
    fillHE(L, false); autoHE = true; drawGrid();
    toast('Hits and errors estimated. Change any of them before saving.');
  };

  $('#m-save', modal).onclick = () => {
    const L = readLines(); if (!L) return;
    const { t, homeLine, awayLine, hr, ar } = L;
    const nEst = source !== 'sim' ? fillHE(L, true) : 0, estimated = nEst > 0;
    if (regular) {
      g.home = t.home; g.away = t.away; g.neutral = t.neutral; g.confGame = $('#m-conf', modal).checked;
      g.week = Math.max(1, Math.min(regWeeksOf(s), Number($('#m-week', modal).value) || g.week));
      g.day = $('#m-day', modal).value; g.order = DAY_ORDER[g.day];
    }
    applyResult(g, {
      homeLine, awayLine,
      home: { R: hr, H: Number(values.homeH || 0), E: Number(values.homeE || 0) },
      away: { R: ar, H: Number(values.awayH || 0), E: Number(values.awayE || 0) },
      runRule: n < 7,
    }, source === 'sim' ? 'sim' : 'manual');
    if (nEst === 4 || (autoHE && source !== 'sim')) g.heEstimated = true; else delete g.heEstimated;
    isNew = false; modal.close(); changed(); toast(estimated ? 'Result saved. Blank hits and errors were estimated from the ratings.' : 'Result saved.');
  };
  modal.showModal();
}

// ---------- compact bracket cards (team, R, H, E) ----------

// Poll rankings show on regular-season and conference tournament games; NCAA
// games show only the regional hosts' national seeds.
const showsRank = type => type !== 'regional' && type !== 'super' && type !== 'mcws';
// A winner's row in a bracket card: a gradient in the team's color, with
// black or white text, whichever reads better on that color.
function winTint(t) {
  const c = teamInfo(t)?.color;
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return '';
  const fg = readableOn(c);
  const end = fg === '#ffffff' ? `color-mix(in srgb, ${c} 62%, #000)` : `color-mix(in srgb, ${c} 70%, #fff)`;
  return ` style="--tint:${esc(c)};--tint-end:${end};--tint-fg:${fg}"`;
}
export function compactCard(g, seedFn = () => null) {
  const s = S();
  const fin = isFinal(g);
  const w = fin ? winnerOf(g) : null;
  const inn = Math.max(g.homeLine.length, g.awayLine.length);
  const row = (t, R, H, E) => `<div class="bg-row ${fin ? (w === t ? 'winner win-tint' : 'loser') : ''}"${fin && w === t ? winTint(t) : ''}>
      <span class="bg-team">${team(t, { seed: seedFn(t), size: 16, rank: showsRank(g.type), ranks: fin ? cache.ranksAt(g.week) : null })}</span>
      <span class="bg-n bg-r">${fin ? R : ''}</span></div>`;
  let status = '';
  if (fin) status = `<span class="badge final">Final${inn !== 7 ? '/' + inn : ''}</span>`;
  else if (s.teams[g.home] && s.teams[g.away]) {
    const wp = winProbability(s.teams[g.home], s.teams[g.away], g, { volatility: s.settings.volatility });
    const fav = wp >= 0.5 ? g.home : g.away;
    status = `<span class="muted">${esc(s.teams[fav].abbr)} ${Math.round(Math.max(wp, 1 - wp) * 100)}%</span><button class="btn sm bg-sim" data-simgame="${g.id}" title="Simulate this game and save the result" aria-label="Simulate this game">🎲</button>`;
  }
  const label = g.label ? g.label.split(' · ').slice(-1)[0] : '';
  return `<div class="bgame" data-game="${g.id}" tabindex="0" title="Click for the full line score">
    <div class="bg-row bg-head"><span class="bg-label">${esc(label)}</span><span class="bg-status">${status}</span></div>
    ${row(g.away, g.awayR, g.awayH, g.awayE)}${row(g.home, g.homeR, g.homeH, g.homeE)}</div>`;
}
export function placeholderCard(label, teams, seedFn = () => null, { faded = false, note = '', ranks = true } = {}) {
  const row = t => {
    let inner;
    if (t === 'BYE') inner = '<span class="muted">Bye</span>';
    else if (t && typeof t === 'object') inner = `<span class="muted slot-ref">${esc(t.text)}</span>`;
    else if (t) inner = team(t, { seed: seedFn(t), size: 16, rank: ranks });
    else inner = '<span class="muted">TBD</span>';
    return `<div class="bg-row"><span class="bg-team">${inner}</span><span class="bg-n"></span></div>`;
  };
  return `<div class="bgame placeholder ${faded ? 'faded' : ''}">
    <div class="bg-row bg-head"><span class="bg-label">${esc(label)}</span><span class="bg-status muted">${esc(note)}</span></div>
    ${row(teams[0])}${row(teams[1])}</div>`;
}
