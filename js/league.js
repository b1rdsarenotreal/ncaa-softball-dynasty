// League (dynasty) lifecycle: creating the league, saving results,
// simulating, adding teams and conferences, and rolling into new seasons.

import { START_YEAR, CONFERENCES, COACHES, seedTeams, makeTeam } from './data.js?v=20261014163557';
import { generateSchedule, blankGame, DAY_ORDER, DEFAULT_REG_WEEKS, confWeeksFor } from './schedule.js?v=20261014163557';
import { simulateGame, estimateHitsErrors } from './sim.js?v=20261014163557';
import { generatePoll, releaseDuePolls } from './polls.js?v=20261014163557';
import { replayRatings, ensureBase } from './ratings.js?v=20261014163557';
import { progress, lockField, postWeeks, allEvents, regWeeksOf, DEFAULT_NCAA, pickConfHosts, postseasonFinish } from './postseason.js?v=20261014163557';
import { isFinal, records } from './standings.js?v=20261014163557';
import { rng, normal, clamp, hashStr } from './util.js?v=20261014163557';

export const SCHEMA_VERSION = 4;

export function defaultSettings() {
  return {
    volatility: 1, runRule: true, tiebreaker: true, confTourney: {}, confFormat: {}, mcwsName: "Women's College World Series", mcwsVenue: 'Devon Park', mcwsCity: 'Oklahoma City, Oklahoma', development: 'normal', form: 'normal',
    regWeeks: DEFAULT_REG_WEEKS, midweek: 'mixed', midweekStart: 4, midweekSkipLast: true, ncaa: { ...DEFAULT_NCAA },
  };
}

export function newSeason(year, teams, settings = defaultSettings(), prev = null) {
  const season = {
    year, teams, games: [], polls: {}, post: {}, phase: 'regular', nextId: 1,
    settings: JSON.parse(JSON.stringify(settings)), overrides: { regChamps: {}, autoBids: {} }, carryPoll: null,
  };
  season.games = generateSchedule(season, undefined, prev);
  pickConfHosts(season, prev);
  return season;
}

export function newLeague({ name = 'NCAA Softball Dynasty', year = START_YEAR, teams = seedTeams(), conferences = CONFERENCES } = {}) {
  const season = newSeason(year, teams);
  season.polls[0] = generatePoll(season, 0);
  const league = {
    schema: SCHEMA_VERSION, name, currentYear: year,
    conferences: JSON.parse(JSON.stringify(conferences)),
    coaches: {}, nextCoachId: 1,
    seasons: { [year]: season },
  };
  for (const t of Object.values(teams)) { t.coachId = t.coach ? newCoach(league, t.coach) : null; delete t.coach; }
  return league;
}

// ---------- coaches ----------
// Coaches are people in the dynasty: league.coaches[id] = { id, name }, and
// each season's team points at one with coachId. Hiring a coach who is at
// another program leaves that program's job open.

export function newCoach(league, name) {
  name = String(name || '').trim();
  if (!name) throw new Error('Give the coach a name.');
  league.coaches ||= {};
  league.nextCoachId ||= 1;
  const id = `c${league.nextCoachId++}`;
  league.coaches[id] = { id, name };
  return id;
}

export const coachName = (league, id) => (id && league.coaches?.[id]?.name) || '';

// The school a coach leads in a set of teams, if any.
export function coachSchool(teams, id) {
  return id ? Object.values(teams).find(t => t.coachId === id)?.school || null : null;
}

// Put coach `id` (or nobody, with null) in charge of `school`. Returns the
// school the coach left, if any; that job is now open.
export function hireCoach(teams, school, id) {
  const from = coachSchool(teams, id);
  if (from && from !== school) teams[from].coachId = null;
  teams[school].coachId = id || null;
  return from && from !== school ? from : null;
}

// Coaches not leading any team in `teams`.
export function availableCoaches(league, teams) {
  const busy = new Set(Object.values(teams).map(t => t.coachId).filter(Boolean));
  return Object.values(league.coaches || {}).filter(c => !busy.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export const currentSeason = league => league.seasons[league.currentYear];

// ---------- results ----------

export function applyResult(g, res, source = 'sim') {
  g.homeLine = res.homeLine; g.awayLine = res.awayLine;
  g.homeR = res.home.R; g.homeH = res.home.H; g.homeE = res.home.E;
  g.awayR = res.away.R; g.awayH = res.away.H; g.awayE = res.away.E;
  g.runRule = !!res.runRule;
  g.final = true; g.source = source;
}

export function clearResult(g) {
  Object.assign(g, { final: false, homeLine: [], awayLine: [], homeR: null, homeH: null, homeE: null, awayR: null, awayH: null, awayE: null, source: null, runRule: false });
  delete g.heEstimated;
}

// Hits and errors for a hand-entered line score, from the teams' ratings.
export function estimateHE(season, g, homeLine, awayLine) {
  const s = season.settings;
  return estimateHitsErrors(season.teams[g.home], season.teams[g.away], g, homeLine, awayLine, {
    seed: hashStr(`${season.year}|${g.id}|${homeLine.join(',')}|${awayLine.join(',')}`), volatility: s.volatility, tiebreaker: s.tiebreaker,
  });
}

// Hand-entered games saved before hits and errors were estimated have 0 hits
// and 0 errors for both teams. Fill those in. Returns how many were updated.
export function backfillHitsErrors(season) {
  let n = 0;
  for (const g of season.games) {
    if (!g.final || g.source !== 'manual' || !season.teams[g.home] || !season.teams[g.away]) continue;
    if (g.homeH || g.awayH || g.homeE || g.awayE || (g.homeR + g.awayR) === 0) continue;
    const e = estimateHE(season, g, g.homeLine, g.awayLine);
    g.homeH = e.home.H; g.homeE = e.home.E; g.awayH = e.away.H; g.awayE = e.away.E; g.heEstimated = true;
    n++;
  }
  return n;
}

export function simResult(season, g, seed) {
  const s = season.settings;
  return simulateGame(season.teams[g.home], season.teams[g.away], g, { seed, volatility: s.volatility, runRule: s.runRule, tiebreaker: s.tiebreaker });
}

// After any change: advance brackets and release polls that are due.
export function afterChange(season) {
  replayRatings(season);
  progress(season);
  releaseDuePolls(season, postWeeks(season).conf);
}

// Simulate unplayed games matching `filter`, in calendar order. Postseason
// games appear as earlier rounds finish, so keep going until none are left.
export function simGames(season, filter = () => true, { max = 50000, autoLock = false } = {}) {
  let n = 0;
  for (;;) {
    afterChange(season);
    if (autoLock && season.phase === 'selection') { lockField(season); afterChange(season); }
    const next = season.games.filter(g => !isFinal(g) && filter(g)).sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id)[0];
    if (!next || n >= max) break;
    // Games in the same time slot don't depend on each other (a team plays
    // once per slot, and later rounds only appear once earlier ones finish),
    // so a whole slate is played from the same ratings before they're
    // recalculated. With 300 teams this keeps a season sim fast.
    const slate = season.games.filter(g => !isFinal(g) && filter(g) && g.home && g.away && g.week === next.week && g.order === next.order && g.day === next.day).slice(0, max - n);
    if (!slate.includes(next)) slate.unshift(next);
    const results = slate.map(g => [g, simResult(season, g)]);
    for (const [g, r] of results) applyResult(g, r);
    n += slate.length;
  }
  afterChange(season);
  return n;
}

// ---------- editing ----------

export function addGame(season, fields) {
  const g = blankGame(season, { ...fields, order: DAY_ORDER[fields.day] ?? 4 });
  season.games.push(g);
  return g;
}

export function deleteGame(season, id) { season.games = season.games.filter(g => g.id !== id); }

// Adds a team to a set of teams (a season's, or the offseason draft's).
export function addTeam(league, teams, fields) {
  fields = { ...fields, school: fields.school?.trim() };
  if (!fields.school) throw new Error('Give the team a name.');
  if (teams[fields.school]) throw new Error('There is already a team with that name.');
  if (!league.conferences[fields.conference]) throw new Error('Pick a conference.');
  const { coachId = null, coachName: newName = '' } = fields;
  delete fields.coach;
  teams[fields.school] = makeTeam({ ...fields, coachId: null });
  delete teams[fields.school].coach;
  if (coachId) hireCoach(teams, fields.school, coachId);
  else if (newName.trim()) teams[fields.school].coachId = newCoach(league, newName);
  return teams[fields.school];
}

// Removes the team and its unplayed games. Played games stay in the record.
export function removeTeam(season, school) {
  delete season.teams[school];
  season.games = season.games.filter(g => isFinal(g) || (g.home !== school && g.away !== school));
}

export function renameTeam(league, season, from, to) {
  to = to.trim();
  if (!to || to === from) return;
  if (season.teams[to]) throw new Error('There is already a team with that name.');
  for (const s of Object.values(league.seasons)) {
    if (!s.teams[from]) continue;
    s.teams[to] = { ...s.teams[from], school: to };
    delete s.teams[from];
    const swap = x => (x === from ? to : x);
    for (const g of s.games) { g.home = swap(g.home); g.away = swap(g.away); }
    for (const p of Object.values(s.polls || {})) { for (const r of p.ranks) r.team = swap(r.team); for (const r of p.others || []) r.team = swap(r.team); }
    const post = s.post || {};
    for (const k of Object.keys(post.sigs || {})) if (post.sigs[k]) post.sigs[k] = post.sigs[k].split('|').map(swap).join('|');
    for (const ev of allEvents(s)) {
      ev.seeds = ev.seeds.map(swap); ev.champion = swap(ev.champion); if (ev.host) ev.host = swap(ev.host);
      for (const n of ev.nodes) { n.winner = swap(n.winner); n.loser = swap(n.loser); }
    }
    if (post.field) for (const f of post.field) f.team = swap(f.team);
    post.champion = swap(post.champion); post.runnerUp = swap(post.runnerUp);
    for (const c of Object.keys(s.confHosts || {})) s.confHosts[c] = swap(s.confHosts[c]);
  }
}

// Keep conferences (and each season's conference tournaments) in A–Z order,
// so every list built from them reads alphabetically.
export function sortConferences(league) {
  const az = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => az(a, b)));
  if (league.conferences) league.conferences = sortObj(league.conferences);
  for (const s of Object.values(league.seasons || {})) if (s.post?.confT) s.post.confT = sortObj(s.post.confT);
  return league;
}

export function addConference(league, name, { abbr, color = '#555555' } = {}) {
  name = name.trim();
  if (!name) throw new Error('Give the conference a name.');
  if (league.conferences[name]?.retired) { delete league.conferences[name].retired; league.conferences[name].color = color; return; }
  if (league.conferences[name]) throw new Error('That conference already exists.');
  league.conferences[name] = { abbr: abbr || name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4), color };
  sortConferences(league);
}

export function renameConference(league, from, to) {
  to = to.trim();
  if (!to || to === from) return;
  if (league.conferences[to]) throw new Error('That conference already exists.');
  league.conferences[to] = league.conferences[from];
  delete league.conferences[from];
  for (const s of Object.values(league.seasons)) {
    for (const t of Object.values(s.teams)) if (t.conference === from) t.conference = to;
    if (s.settings.confTourney?.[from] != null) { s.settings.confTourney[to] = s.settings.confTourney[from]; delete s.settings.confTourney[from]; }
    for (const k of ['regChamps', 'autoBids']) if (s.overrides?.[k]?.[from]) { s.overrides[k][to] = s.overrides[k][from]; delete s.overrides[k][from]; }
    if (s.post?.confT?.[from]) { s.post.confT[to] = { ...s.post.confT[from], conf: to }; delete s.post.confT[from]; }
    for (const f of s.post?.field || []) if (f.conf === from) f.conf = to;
  }
  sortConferences(league);
}

export function deleteConference(league, season, name) {
  if (Object.values(season.teams).some(t => t.conference === name)) throw new Error('Move its teams to another conference first.');
  const usedEarlier = Object.values(league.seasons).some(s => Object.values(s.teams).some(t => t.conference === name));
  if (!usedEarlier) delete league.conferences[name];
  else league.conferences[name].retired = true;
}

// Rebuild the regular-season schedule (only before any regular-season game is played).
export function rebuildSchedule(season, prev = null) {
  if (season.games.some(g => g.type === 'regular' && isFinal(g))) throw new Error('Games have already been played this season.');
  season.games = season.games.filter(g => g.type !== 'regular');
  season.games.push(...generateSchedule(season, hashStr(`${season.year}-${Date.now()}`), prev));
  season.polls = {};
  season.polls[0] = generatePoll(season, 0);
}

// ---------- next season ----------

// Offseason development. Each team gets an allotment of rating points for
// next season: more after a winning season, more again for beating what its
// ratings predicted and for a deep postseason run, fewer for a team already
// near the top (graduation pulls everyone toward 70), plus some luck. The points are spread across OFF, PIT and DEF automatically, and
// the commissioner can move them around (or overrule them) in the Offseason.
const DEV_LUCK = { none: 0, small: 3, normal: 5, big: 8 };
const FINISH_BONUS = { 'National champion': 4.5, 'National runner-up': 3.5, 'WCWS': 3, 'Super Regional': 2, 'Regional champion': 2, 'NCAA Regional': 1.5 };
export const RATING_KEYS = ['off', 'pit', 'def'];
export function devPoints(team, season, r, level = 'normal', avgO = 70) {
  if (level === 'none') return 0;
  const rec = season ? records(season)[team.school] : null;
  const o = 0.4 * team.off + 0.4 * team.pit + 0.2 * team.def;
  const played = rec ? rec.w + rec.l : 0;
  const wp = played ? rec.w / played : 0.5;
  // What the ratings said this team should have won, against an average schedule.
  const expected = 1 / (1 + Math.exp(-0.126 * (o - avgO)));
  const finish = season ? FINISH_BONUS[postseasonFinish(season, team.school)] || 0 : 0;
  const pts = (played ? (wp - 0.5) * 8 + (wp - expected) * 18 : 0) + finish * 1.5 - 0.3 * (o - 70) + normal(r) * (DEV_LUCK[level] ?? DEV_LUCK.normal);
  return clamp(Math.round(pts), -15, 15);
}
// Spread `pts` one point at a time across the three ratings.
export function spreadPoints(t, r) {
  const d = t.dev;
  for (const k of RATING_KEYS) t[k] = d.start[k];
  for (let i = 0; i < Math.abs(d.pts); i++) {
    const k = RATING_KEYS[Math.floor(r() * 3)];
    t[k] = clamp(t[k] + Math.sign(d.pts), 40, 99);
  }
  t.base = { off: t.off, pit: t.pit, def: t.def };
}
// Points the commissioner still has to place (negative = over budget).
// Put a team's ratings back where they started the offseason.
export function clearPoints(t) {
  if (!t.dev) return;
  for (const k of RATING_KEYS) t[k] = t.dev.start[k];
  t.base = { off: t.off, pit: t.pit, def: t.def };
}
// Place only the points still unplaced, keeping the commissioner's changes.
export function placeRemaining(t, r) {
  let left = pointsLeft(t), guard = 0;
  while (left !== 0 && guard++ < 200) {
    const k = RATING_KEYS[Math.floor(r() * 3)];
    const v = clamp(t[k] + Math.sign(left), 40, 99);
    if (v !== t[k]) { t[k] = v; left -= Math.sign(left); }
  }
  t.base = { off: t.off, pit: t.pit, def: t.def };
}
export function pointsLeft(t) {
  if (!t.dev) return 0;
  return t.dev.pts - RATING_KEYS.reduce((n, k) => n + (t[k] - t.dev.start[k]), 0);
}
// Points start unplaced (the commissioner places them in the offseason);
// `spread: true` places them at random, for seasons started without one.
export function developTeams(teams, year, level = 'normal', season = null, { spread = false } = {}) {
  const r = rng(hashStr(`dev-${year}`));
  const out = JSON.parse(JSON.stringify(teams));
  const list = Object.values(out), avgO = list.reduce((n, t) => n + 0.4 * t.off + 0.4 * t.pit + 0.2 * t.def, 0) / (list.length || 1);
  for (const t of list) {
    t.dev = { pts: devPoints(t, season, r, level, avgO), start: { off: t.off, pit: t.pit, def: t.def } };
    if (spread) spreadPoints(t, r);
  }
  return out;
}

// ---------- offseason ----------
// Once the champion is crowned, next season's teams live in a draft the
// commissioner can change: move teams between conferences, add or remove
// teams, change coaches and ratings. Starting the season builds the schedule.

export function beginOffseason(league) {
  const prev = currentSeason(league);
  if (prev.phase !== 'complete') throw new Error('Finish the season first.');
  if (!league.draft || league.draft.year !== prev.year + 1) {
    league.draft = { year: prev.year + 1, teams: developTeams(prev.teams, prev.year + 1, prev.settings.development, prev), removed: {}, moves: [] };
  }
  return league.draft;
}

export function draftRemoveTeam(league, school) {
  const d = league.draft;
  d.removed[school] = d.teams[school];
  delete d.teams[school];
}

export function draftRestoreTeam(league, school) {
  const d = league.draft;
  if (!d.removed[school]) return;
  if (!league.conferences[d.removed[school].conference] || league.conferences[d.removed[school].conference].retired) {
    d.removed[school].conference = Object.keys(league.conferences).find(c => !league.conferences[c].retired);
  }
  d.teams[school] = d.removed[school];
  delete d.removed[school];
}

// Problems that would make next season's schedule lopsided.
export function draftWarnings(league) {
  const out = [];
  const count = {};
  for (const t of Object.values(league.draft.teams)) count[t.conference] = (count[t.conference] || 0) + 1;
  for (const [c, n] of Object.entries(count)) {
    if (n === 1) out.push(`${c} has only one team, so it has no conference games. It still gets an automatic bid.`);
    const R = currentSeason(league).settings.regWeeks ?? DEFAULT_REG_WEEKS;
    const rounds = n % 2 ? n : n - 1, fits = confWeeksFor(R, rounds);
    if (rounds > fits) out.push(`${c} has ${n} teams. Conference play is capped at ${fits} weeks, so each team plays about ${fits} of its ${n - 1} conference opponents (which ones changes every season).`);
  }
  if (Object.keys(league.draft.teams).length < 16) out.push('The NCAA field needs at least 16 teams.');
  const open = Object.values(league.draft.teams).filter(t => !t.coachId).map(t => t.school).sort();
  if (open.length) out.push(`No head coach yet: ${open.join(', ')}.`);
  return out;
}

export function startNextSeason(league) {
  const prev = currentSeason(league);
  const year = prev.year + 1;
  const teams = league.draft?.year === year ? league.draft.teams : developTeams(prev.teams, year, prev.settings.development, prev, { spread: true });
  if (Object.keys(teams).length < 16) throw new Error('The NCAA field needs at least 16 teams.');
  const moves = league.draft?.moves || [];
  delete league.draft;
  for (const t of Object.values(teams)) delete t.dev;
  const season = newSeason(year, teams, prev.settings, prev);
  season.coachMoves = moves;
  season.carryPoll = prev.polls.final || null;
  season.polls[0] = generatePoll(season, 0);
  league.seasons[year] = season;
  league.currentYear = year;
  return season;
}

export function seasonWeeks(season) {
  const weeks = [...new Set(season.games.map(g => g.week))].sort((a, b) => a - b);
  return weeks;
}

// Name of a week in `season`: regular-season weeks are "Week n"; the weeks
// after are named for their stage.
export function weekName(w, season) {
  if (season) {
    const W = postWeeks(season);
    const names = { [W.conf]: 'Conf. Tournaments', [W.regional]: 'Regionals', [W.mcws]: 'WCWS' };
    if (W.super) names[W.super] = 'Super Regionals';
    if (W.finals) names[W.finals] = 'Championship Finals';
    if (names[w]) return names[w];
  }
  return `Week ${w}`;
}
export const isRegularWeek = (w, season) => w <= regWeeksOf(season);

// Bring an older save up to date: no pitching staffs (v2), coaches as
// people and preseason ratings for in-season movement (v3), season length,
// midweek format and NCAA tournament format as settings (v4).
export function migrateLeague(league) {
  sortConferences(league);
  const v = league.schema || 1;
  if (v >= SCHEMA_VERSION) return league;
  if (v < 4) {
    for (const se of Object.values(league.seasons)) {
      // Seasons already scheduled keep their length; new schedules use the settings.
      se.regWeeks ??= Math.max(1, ...se.games.filter(g => g.type === 'regular').map(g => g.week)) || 14;
      se.settings.regWeeks ??= DEFAULT_REG_WEEKS;
      se.settings.midweek ??= 'mixed';
      se.settings.ncaa ??= { ...DEFAULT_NCAA };
      if (se.post?.regionals && !se.post.cfg) se.post.cfg = { ...DEFAULT_NCAA };
      (se.post?.regionals || []).forEach((ev, i) => { ev.path ??= i; });
    }
  }
  const allTeams = () => [...Object.keys(league.seasons).map(Number).sort((a, b) => a - b).map(y => league.seasons[y].teams), ...(league.draft ? [league.draft.teams] : [])];
  for (const se of Object.values(league.seasons)) {
    for (const g of se.games) { for (const k of ['pitching', 'wp', 'lp', 'sv', 'homeStarter', 'awayStarter', 'homeSlot', 'awaySlot']) delete g[k]; }
    se.settings.form ??= 'normal';
    se.settings.confFormat ??= {};
  }
  if (v < 3) {
    league.coaches ||= {};
    league.nextCoachId ||= 1;
    const ids = new Map(); // "school|name" -> id, so a coach stays one person across seasons
    for (const teams of allTeams()) {
      for (const t of Object.values(teams)) {
        delete t.staff;
        const name = (t.coach ?? COACHES[t.school] ?? '').trim();
        if (name && !t.coachId) {
          const k = `${t.school}|${name}`;
          if (!ids.has(k)) ids.set(k, newCoach(league, name));
          t.coachId = ids.get(k);
        }
        t.coachId ??= null;
        delete t.coach;
        ensureBase(t);
      }
    }
  }
  league.schema = SCHEMA_VERSION;
  return league;
}
