// Records, conference standings with tiebreakers, and the RPI.

import { pct, hashStr } from './util.js?v=20261014163557';

export const isFinal = g => g.final && g.homeR != null && g.awayR != null;
export const winnerOf = g => (g.homeR > g.awayR ? g.home : g.away);
export const loserOf = g => (g.homeR > g.awayR ? g.away : g.home);

function blank() {
  return { w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, nw: 0, nl: 0, rs: 0, ra: 0, streak: '', results: [] };
}

// filter(g) narrows which games count (e.g. through a given week).
export function records(season, filter = null) {
  const out = {};
  for (const t of Object.keys(season.teams)) out[t] = blank();
  const games = season.games.filter(g => isFinal(g) && (!filter || filter(g))).sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id);
  for (const g of games) {
    const hw = g.homeR > g.awayR;
    for (const [t, won, rs, ra, where] of [[g.home, hw, g.homeR, g.awayR, g.neutral ? 'n' : 'h'], [g.away, !hw, g.awayR, g.homeR, g.neutral ? 'n' : 'a']]) {
      const r = out[t];
      if (!r) continue;
      won ? r.w++ : r.l++;
      r[where + (won ? 'w' : 'l')]++;
      if (g.type === 'regular' && g.confGame) won ? r.cw++ : r.cl++;
      r.rs += rs; r.ra += ra;
      r.results.push(won ? 'W' : 'L');
    }
  }
  for (const r of Object.values(out)) {
    const res = r.results;
    if (res.length) {
      const last = res[res.length - 1];
      let n = 0;
      for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++;
      r.streak = `${last}${n}`;
    }
  }
  return out;
}

// Rating Percentage Index: 25% winning pct, 50% opponents' winning pct
// (excluding games against the team), 25% opponents' opponents' pct.
export function rpi(season, filter = null) {
  const games = season.games.filter(g => isFinal(g) && (!filter || filter(g)));
  const teams = Object.keys(season.teams);
  const opps = {}, wl = {}, vs = {};
  for (const t of teams) { opps[t] = []; wl[t] = { w: 0, n: 0 }; vs[t] = {}; }
  for (const g of games) {
    const w = winnerOf(g);
    for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) {
      if (!wl[t]) continue;
      wl[t].n++; if (w === t) wl[t].w++;
      opps[t].push(o);
      const v = (vs[t][o] ||= { w: 0, n: 0 });
      v.n++; if (w === t) v.w++;
    }
  }
  const wp = t => (wl[t]?.n ? wl[t].w / wl[t].n : 0);
  const wpExcl = (o, t) => {
    const a = wl[o]; if (!a) return 0;
    const v = vs[o][t] || { w: 0, n: 0 };
    const n = a.n - v.n;
    return n > 0 ? (a.w - v.w) / n : 0;
  };
  const owp = {};
  for (const t of teams) owp[t] = opps[t].length ? opps[t].reduce((s, o) => s + wpExcl(o, t), 0) / opps[t].length : 0;
  const out = {};
  for (const t of teams) {
    const oowp = opps[t].length ? opps[t].reduce((s, o) => s + (owp[o] ?? 0), 0) / opps[t].length : 0;
    // Strength of schedule: opponents' winning pct (2/3) and their
    // opponents' (1/3), the NCAA's usual SOS formula.
    let ow = 0, ol = 0;
    for (const o of new Set(opps[t])) {
      const times = opps[t].filter(x => x === o).length, a = wl[o], v = vs[o][t] || { w: 0, n: 0 };
      if (!a) continue;
      ow += times * (a.w - v.w); ol += times * ((a.n - v.n) - (a.w - v.w));
    }
    out[t] = { wp: wp(t), owp: owp[t], oowp, rpi: 0.25 * wp(t) + 0.5 * owp[t] + 0.25 * oowp, sos: (2 * owp[t] + oowp) / 3, oppW: ow, oppL: ol, games: wl[t].n };
  }
  const ranked = teams.filter(t => out[t].games).sort((a, b) => out[b].rpi - out[a].rpi);
  ranked.forEach((t, i) => { out[t].rank = i + 1; });
  teams.filter(t => out[t].games).sort((a, b) => out[b].sos - out[a].sos).forEach((t, i) => { out[t].sosRank = i + 1; });
  return out;
}

// NCAA team-sheet quadrants. A game's quadrant depends on the opponent's RPI
// rank and where it was played, as on the NCAA's own sheets. These are the
// cut-offs for a 300-team league; they scale with league size (quadCuts):
//   Q1: home 1-30, neutral 1-50, away 1-75
//   Q2: home 31-75, neutral 51-100, away 76-135
//   Q3: home 76-160, neutral 101-200, away 136-240
//   Q4: everything else
// `rec[i]` is each team's record in Quadrant i+1. `q` is the quadrant a home
// game against the team would count as (used for display).
export const QUAD_CUTS = { home: [30, 75, 160], neutral: [50, 100, 200], away: [75, 135, 240] };
export function gameLocation(g, t) {
  if (g.site) return g.site === t ? 'home' : 'away';
  if (g.neutral) return 'neutral';
  return g.home === t ? 'home' : 'away';
}
// The cut-offs for a league of `teamCount` teams, by location.
export function quadCuts(teamCount = 300) {
  const k = teamCount / 300;
  return Object.fromEntries(Object.entries(QUAD_CUTS).map(([loc, cuts]) => [loc, cuts.map(c => Math.max(1, Math.round(c * k)))]));
}
export function quadOf(rank, loc, teamCount = 300) {
  if (!rank) return 4;
  const all = quadCuts(teamCount), cuts = all[loc] || all.neutral;
  const i = cuts.findIndex(c => rank <= c);
  return i < 0 ? 4 : i + 1;
}
export function quadrants(season, r = rpi(season), filter = null) {
  const teams = Object.keys(season.teams), n = teams.length;
  const out = {};
  for (const t of teams) out[t] = { q: quadOf(r[t]?.rank, 'home', n), rec: [0, 1, 2, 3].map(() => ({ w: 0, l: 0 })) };
  for (const g of season.games) {
    if (!isFinal(g) || (filter && !filter(g))) continue;
    const w = winnerOf(g);
    for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) {
      if (!out[t] || !out[o]) continue;
      const x = out[t].rec[quadOf(r[o]?.rank, gameLocation(g, t), n) - 1];
      w === t ? x.w++ : x.l++;
    }
  }
  return out;
}

// One number for a team's quadrant résumé: wins count more the better the
// quadrant, losses cost more the worse the quadrant.
export const QUAD_WIN = [4, 2, 1, 0.25], QUAD_LOSS = [0, 0.5, 2, 4];
export function quadScore(x) {
  return x.rec.reduce((a, q, i) => a + q.w * QUAD_WIN[i] - q.l * QUAD_LOSS[i], 0);
}

// Conference games only: each team's record against a set of opponents.
function recordVs(season, teams, opps) {
  const tset = new Set(teams), oset = new Set(opps), res = {};
  for (const t of teams) res[t] = { w: 0, l: 0 };
  for (const g of season.games) {
    if (!isFinal(g) || g.type !== 'regular' || !g.confGame) continue;
    for (const [t, o] of [[g.home, g.away], [g.away, g.home]]) {
      if (!tset.has(t) || !oset.has(o) || t === o) continue;
      winnerOf(g) === t ? res[t].w++ : res[t].l++;
    }
  }
  return res;
}

// Split `group` into tiers by a score (higher first). Returns null when the
// score doesn't separate anyone.
function tiers(group, score) {
  const vals = new Map(group.map(t => [t, score(t)]));
  const distinct = [...new Set(vals.values())].sort((a, b) => b - a);
  if (distinct.length < 2) return null;
  return distinct.map(v => group.filter(t => vals.get(t) === v));
}

export const TIEBREAKERS = [
  'Conference winning percentage',
  'Head-to-head among all the tied teams (teams still tied start over with head-to-head among just them)',
  'Winning percentage against common conference opponents, starting with the highest-placed opponent and working down',
  'RPI',
  'Coin flip',
];

// Order teams tied on conference winning percentage. Each step that splits
// the group sends every smaller group that is still tied back to
// head-to-head. `why[t]` records the step that last separated a team.
function breakTie(season, conf, group, others, r, why) {
  if (group.length < 2) return group;
  const recurse = (split, label) => split.flatMap(sub => {
    if (sub.length === 1) { why[sub[0]] = label; return sub; }
    for (const t of sub) why[t] = label;
    return breakTie(season, conf, sub, others, r, why);
  });
  // Head-to-head, only when every tied team has played the others.
  const hh = recordVs(season, group, group);
  if (group.every(t => hh[t].w + hh[t].l > 0)) {
    const split = tiers(group, t => pct(hh[t].w, hh[t].l));
    if (split) return recurse(split, { step: 'h2h', text: 'Head-to-head' });
  }
  // Common opponents, from the top of the standings down. Opponents tied
  // with each other are taken together.
  const vs = t => new Set(season.games.filter(g => isFinal(g) && g.type === 'regular' && g.confGame && (g.home === t || g.away === t)).map(g => (g.home === t ? g.away : g.home)));
  const played = group.map(vs);
  for (const block of others) {
    const common = block.filter(o => played.every(p => p.has(o)));
    if (!common.length) continue;
    const rec = recordVs(season, group, common);
    const split = tiers(group, t => pct(rec[t].w, rec[t].l));
    if (split) return recurse(split, { step: 'common', text: `Record vs ${common.join(', ')}` });
  }
  const byRpi = tiers(group, t => r[t]?.rpi ?? 0);
  if (byRpi) return recurse(byRpi, { step: 'rpi', text: 'RPI' });
  // Coin flip: fixed for the season, so the order doesn't change on reload.
  const flip = t => hashStr(`${season.year}|${conf}|${[...group].sort().join('|')}|${t}`);
  for (const t of group) why[t] = { step: 'coin', text: 'Coin flip' };
  return [...group].sort((a, b) => flip(a) - flip(b));
}

// Conference table, best first, with games-back. Each row's `tb` says which
// tiebreaker placed it, when it was tied.
export function confStandings(season, conf, recs = records(season), r = rpi(season)) {
  const teams = Object.values(season.teams).filter(t => t.conference === conf).map(t => t.school);
  const cp = t => pct(recs[t].cw, recs[t].cl);
  const groups = [];
  for (const t of [...teams].sort((a, b) => cp(b) - cp(a) || a.localeCompare(b))) {
    const last = groups[groups.length - 1];
    if (last && cp(last[0]) === cp(t)) last.push(t); else groups.push([t]);
  }
  const why = {};
  const out = groups.flatMap(g => breakTie(season, conf, g, groups.filter(x => x !== g), r, why));
  const lead = out[0];
  return out.map(t => ({
    team: t, ...recs[t],
    gb: lead ? ((recs[lead].cw - recs[t].cw) + (recs[t].cl - recs[lead].cl)) / 2 : 0,
    rpiRank: r[t]?.rank ?? null,
    tb: why[t] || null,
  }));
}

export function conferences(season) {
  return [...new Set(Object.values(season.teams).map(t => t.conference))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function regularSeasonDone(season) {
  return season.games.filter(g => g.type === 'regular').every(isFinal);
}

// Regular-season champions: every team tied for the best conference winning
// percentage shares the title (a commissioner override names one champion).
export function regSeasonChamps(season, conf, recs = records(season, g => g.type === 'regular'), r = rpi(season, g => g.type === 'regular')) {
  if (season.overrides?.regChamps?.[conf]) return [season.overrides.regChamps[conf]];
  const st = confStandings(season, conf, recs, r);
  if (!st.length || st[0].cw + st[0].cl === 0) return [];
  const best = pct(st[0].cw, st[0].cl);
  return st.filter(x => x.cw + x.cl > 0 && pct(x.cw, x.cl) === best).map(x => x.team);
}

// The one team that takes the top spot: the regular-season champion, or the
// co-champion that wins the tiebreakers (commissioner override wins). This is
// the tournament's top seed and, with no tournament, the automatic bid.
export function regSeasonChamp(season, conf, recs, r) {
  if (season.overrides?.regChamps?.[conf]) return season.overrides.regChamps[conf];
  const st = confStandings(season, conf, recs, r);
  return st.length && (st[0].cw + st[0].cl) > 0 ? st[0].team : null;
}
