// Dynasty record book: program totals, best single seasons, single-game
// marks and coaching leaders, across every season in the league.

import { records, isFinal, winnerOf, regSeasonChamps, conferences } from './standings.js?v=20261014155521';
import { wsTeams } from './postseason.js?v=20261014155521';
import { pct } from './util.js?v=20261014155521';

export function recordBook(league) {
  const years = Object.keys(league.seasons).map(Number).sort((a, b) => a - b);
  const programs = {}, seasons = [], games = [], coaches = {};
  const prog = t => (programs[t] ||= { team: t, seasons: 0, w: 0, l: 0, reg: 0, conf: 0, ncaa: 0, mcws: 0, titles: 0, rs: 0, ra: 0 });
  for (const y of years) {
    const se = league.seasons[y];
    const played = se.games.filter(isFinal);
    if (!played.length) continue;
    const done = se.phase === 'complete';
    const recs = records(se);
    const reg = records(se, g => g.type === 'regular');
    const field = new Set((se.post?.field || []).map(f => f.team));
    const ws = new Set(wsTeams(se));
    // Regular-season titles count once the regular season is over.
    const regDone = se.games.some(g => g.type === 'regular') && se.games.filter(g => g.type === 'regular').every(isFinal);
    const regChamps = new Set(regDone ? conferences(se).flatMap(c => regSeasonChamps(se, c, reg)) : []);
    const confChamps = new Set(Object.values(se.post?.confT || {}).map(ev => ev.champion).filter(Boolean));
    for (const [t, r] of Object.entries(recs)) {
      if (!r.w && !r.l) continue;
      const p = prog(t);
      p.seasons++; p.w += r.w; p.l += r.l; p.rs += r.rs; p.ra += r.ra;
      if (regChamps.has(t)) p.reg++;
      if (confChamps.has(t)) p.conf++;
      if (field.has(t) && se.post?.regionals) p.ncaa++;
      if (ws.has(t)) p.mcws++;
      if (se.post?.champion === t) p.titles++;
      // Longest winning streak inside the season.
      let best = 0, run = 0;
      for (const x of r.results) { run = x === 'W' ? run + 1 : 0; best = Math.max(best, run); }
      seasons.push({ year: y, team: t, done, w: r.w, l: r.l, pct: pct(r.w, r.l), g: r.w + r.l, rs: r.rs, ra: r.ra, diff: r.rs - r.ra, cw: reg[t]?.cw ?? 0, cl: reg[t]?.cl ?? 0, streak: best, champ: se.post?.champion === t });
      const cid = se.teams[t]?.coachId;
      if (cid) {
        const c = (coaches[cid] ||= { id: cid, w: 0, l: 0, seasons: 0, titles: 0, mcws: 0, teams: new Set() });
        c.w += r.w; c.l += r.l; c.seasons++; c.teams.add(t);
        if (se.post?.champion === t) c.titles++;
        if (ws.has(t)) c.mcws++;
      }
    }
    for (const g of played) {
      const n = Math.max(g.homeLine?.length || 0, g.awayLine?.length || 0);
      const w = winnerOf(g), l = w === g.home ? g.away : g.home;
      games.push({ year: y, week: g.week, type: g.type, label: g.label, home: g.home, away: g.away, homeR: g.homeR, awayR: g.awayR, homeH: g.homeH, awayH: g.awayH, w, l, wR: Math.max(g.homeR, g.awayR), lR: Math.min(g.homeR, g.awayR), innings: n, source: g.source });
    }
  }
  return { programs: Object.values(programs), seasons, games, coaches: Object.values(coaches).map(c => ({ ...c, teams: [...c.teams] })), years };
}

// Top `n` by a score (higher first), with ties kept in order.
export const top = (list, score, n = 5, filter = () => true) => list.filter(filter).map(x => [x, score(x)]).filter(([, v]) => v != null && !Number.isNaN(v)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => x);

// ---------- Polls and head-to-head ----------

const sortedYears = league => Object.keys(league.seasons).map(Number).sort((a, b) => a - b);

// A season's polls in release order: [{ key, ranks: { team: rank }, size }].
export function pollSeries(season) {
  const ks = Object.keys(season.polls || {}).filter(k => k !== 'final').map(Number).sort((a, b) => a - b);
  const out = ks.map(k => ({ key: k, poll: season.polls[k] }));
  if (season.polls?.final) out.push({ key: 'final', poll: season.polls.final });
  return out.map(({ key, poll }) => {
    const ranks = {};
    poll.ranks.forEach((x, i) => { ranks[x.team] = i + 1; });
    return { key, ranks, size: poll.ranks.length, fp: Object.fromEntries(poll.ranks.map(x => [x.team, x.fp || 0])) };
  });
}

// Ranks going into a game played in `week`: the latest poll released before it.
function rankLookup(season) {
  const ks = Object.keys(season.polls || {}).filter(k => k !== 'final').map(Number).sort((a, b) => a - b);
  const maps = {};
  return week => {
    let k;
    for (const x of ks) if (x < week) k = x;
    if (k === undefined) return {};
    return (maps[k] ||= Object.fromEntries(season.polls[k].ranks.map((x, i) => [x.team, i + 1])));
  };
}

const gameOrder = (a, b) => a.week - b.week || (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;

// One team's poll story, season by season.
export function teamPollHistory(league, team) {
  const out = [];
  for (const y of sortedYears(league)) {
    const se = league.seasons[y];
    if (!se.teams[team]) continue;
    const ser = pollSeries(se);
    if (!ser.length) continue;
    const ranks = ser.map(p => p.ranks[team] ?? null);
    const on = ranks.filter(Boolean);
    out.push({
      year: y, polls: ser.length, ranked: on.length, at1: ranks.filter(r => r === 1).length,
      pre: ser[0].key === 0 ? ranks[0] : null, high: on.length ? Math.min(...on) : null, low: on.length ? Math.max(...on) : null,
      final: ser[ser.length - 1].key === 'final' ? ranks[ranks.length - 1] : null, done: !!se.polls?.final,
      fp: ser.reduce((a, p) => a + (p.fp[team] || 0), 0),
    });
  }
  return out;
}

// All-time results against every opponent.
export function headToHead(league, team) {
  const opp = {};
  for (const y of sortedYears(league)) {
    const se = league.seasons[y], rankAt = rankLookup(se);
    const games = se.games.filter(g => (g.home === team || g.away === team) && isFinal(g)).sort(gameOrder);
    for (const g of games) {
      const o = g.home === team ? g.away : g.home;
      const won = winnerOf(g) === team;
      const us = g.home === team ? g.homeR : g.awayR, them = g.home === team ? g.awayR : g.homeR;
      const r = (opp[o] ||= { opp: o, w: 0, l: 0, rs: 0, ra: 0, pw: 0, pl: 0, cw: 0, cl: 0, first: y, results: [], last: null, rankedW: 0 });
      r[won ? 'w' : 'l']++; r.rs += us; r.ra += them;
      if (g.type !== 'regular') r[won ? 'pw' : 'pl']++;
      if (g.confGame) r[won ? 'cw' : 'cl']++;
      r.results.push(won ? 'W' : 'L');
      r.last = { year: y, week: g.week, type: g.type, label: g.label, won, us, them, oppRank: rankAt(g.week)[o] ?? null, id: g.id };
    }
  }
  return Object.values(opp).map(r => {
    let n = 0;
    const lastRes = r.results[r.results.length - 1];
    for (let i = r.results.length - 1; i >= 0 && r.results[i] === lastRes; i--) n++;
    const g = r.w + r.l;
    return { ...r, g, pct: g ? r.w / g : 0, streak: g ? `${lastRes}${n}` : '', streakN: lastRes === 'W' ? n : -n, diff: r.rs - r.ra };
  });
}

// League-wide poll records.
export function pollRecords(league) {
  const prog = {}, moves = [], debuts = [], bigWins = [], seasonRuns = [];
  const P = t => (prog[t] ||= { team: t, polls: 0, ranked: 0, at1: 0, final1: 0, top5: 0, top10: 0, pre1: 0, streak: 0, run: 0, vsRanked: 0, vsTop5: 0, vs1: 0, fp: 0 });
  for (const y of sortedYears(league)) {
    const se = league.seasons[y], ser = pollSeries(se);
    for (const x of Object.values(prog)) if (!se.teams[x.team]) x.run = 0;
    for (const t of Object.keys(se.teams)) P(t);
    ser.forEach((p, i) => {
      for (const t of Object.keys(se.teams)) {
        const r = p.ranks[t], x = P(t);
        x.polls++;
        if (r) { x.ranked++; x.run++; x.streak = Math.max(x.streak, x.run); } else x.run = 0;
        if (r === 1) x.at1++;
        x.fp += p.fp[t] || 0;
        if (p.key === 'final' && r) { if (r === 1) x.final1++; if (r <= 5) x.top5++; if (r <= 10) x.top10++; }
        if (p.key === 0 && r === 1) x.pre1++;
      }
      if (!i) return;
      const prev = ser[i - 1];
      for (const [t, r] of Object.entries(p.ranks)) {
        const was = prev.ranks[t];
        if (was) { if (was !== r) moves.push({ team: t, year: y, key: p.key, from: was, to: r, delta: was - r }); }
        else debuts.push({ team: t, year: y, key: p.key, to: r });
      }
      for (const [t, was] of Object.entries(prev.ranks)) if (!p.ranks[t]) moves.push({ team: t, year: y, key: p.key, from: was, to: null, delta: -(prev.size + 1 - was) });
    });
    // Most polls at #1 in one season.
    for (const t of Object.keys(se.teams)) { const n = ser.filter(p => p.ranks[t] === 1).length; if (n) seasonRuns.push({ team: t, year: y, n, of: ser.length }); }
    // Wins over ranked teams, judged by the poll in effect at game time.
    const rankAt = rankLookup(se);
    for (const g of se.games.filter(isFinal)) {
      const w = winnerOf(g), l = w === g.home ? g.away : g.home, rk = rankAt(g.week);
      const lr = rk[l];
      if (!lr) continue;
      P(w).vsRanked++;
      if (lr <= 5) P(w).vsTop5++;
      if (lr === 1) { P(w).vs1++; bigWins.push({ team: w, year: y, week: g.week, type: g.type, label: g.label, opp: l, winRank: rk[w] ?? null, score: `${Math.max(g.homeR, g.awayR)}–${Math.min(g.homeR, g.awayR)}` }); }
    }
  }
  return { programs: Object.values(prog).filter(p => p.polls), moves, debuts, bigWins, seasonRuns };
}
