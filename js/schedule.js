// Regular-season schedule. Its length comes from the season's settings
// (12 weeks by default). The last weeks are conference series (round robin,
// three games each). A conference's size sets when its conference play
// starts: one week per round of its round robin, up to 9 weeks, all ending on
// the final weekend. The weeks before are non-conference weekend series. From week 4
// (a setting) until the week before the last, every team also plays a
// two-game midweek set: a Tuesday doubleheader or a
// Tuesday and Wednesday game against the same opponent (or, in older
// seasons, a single Tuesday game). Teams without a conference series in a
// week get a non-conference series.
// When `prev` (last season) is given, conference opponents who met last year
// swap home and away.

import { rng, shuffle, hashStr } from './util.js?v=20261014163557';

export const DEFAULT_REG_WEEKS = 12;
export const DEFAULT_MIDWEEK_START = 4;
export const MIDWEEK = { single: 'One game on Tuesday', doubleheader: 'Tuesday doubleheader', split: 'Tuesday and Wednesday', mixed: 'Mix of both' };

// Conference weeks for a season of `regWeeks` weeks whose largest
// conference round robin needs `rounds` weeks.
// No conference plays more than 9 weeks of conference series. A conference
// with more than 10 teams plays 9 of its members each season (which ones
// changes every year); smaller conferences start conference play later.
export const MAX_CONF_WEEKS = 9;
export function confWeeksFor(regWeeks, rounds) { return Math.max(1, Math.min(regWeeks - 2, MAX_CONF_WEEKS, Math.max(rounds, regWeeks - 4))); }
const rrRounds = n => (n < 2 ? 0 : n % 2 ? n : n - 1);
export const DAY_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function blankGame(season, fields) {
  return {
    id: season.nextId++, type: 'regular', week: 1, day: 'Fri', order: DAY_ORDER.Fri,
    home: null, away: null, neutral: false, confGame: false, series: null, label: '',
    final: false, homeLine: [], awayLine: [], homeR: null, homeH: null, homeE: null, awayR: null, awayH: null, awayE: null,
    pitching: null, source: null, ...fields,
  };
}

// Circle-method round robin. Returns rounds of [a, b] pairs (null = bye).
export function roundRobin(teams, r) {
  const list = shuffle(teams, r);
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      pairs.push(k % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

// Pair teams across conferences, avoiding repeat opponents when possible.
function crossPairs(pool, teams, met, r, played = null, sat = null) {
  // With an odd number, one team sits out: whoever has played the most,
  // then whoever has sat out least.
  let idle = [];
  if (pool.length % 2 && played) {
    const most = Math.max(...pool.map(t => played[t]));
    const top = pool.filter(t => played[t] === most);
    const fewest = Math.min(...top.map(t => sat?.[t] || 0));
    const cands = top.filter(t => (sat?.[t] || 0) === fewest);
    idle = [cands[Math.floor(r() * cands.length)]];
    pool = pool.filter(t => t !== idle[0]);
    if (sat) sat[idle[0]] = (sat[idle[0]] || 0) + 1;
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const left = shuffle(pool, r), pairs = [];
    let ok = true;
    while (left.length > 1) {
      const a = left.shift();
      let j = left.findIndex(b => teams[b].conference !== teams[a].conference && !met.has(key(a, b)));
      if (j < 0 && attempt > 120) j = left.findIndex(b => teams[b].conference !== teams[a].conference);
      if (j < 0) { ok = false; break; }
      pairs.push([a, left.splice(j, 1)[0]]);
    }
    if (ok) return { pairs, idle: [...idle, ...left] };
  }
  return { pairs: [], idle: [...idle, ...pool] };
}
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function generateSchedule(season, seed = hashStr(String(season.year)), prev = null) {
  const r = rng(seed);
  const teams = season.teams;
  const names = Object.keys(teams);
  const homeCount = Object.fromEntries(names.map(n => [n, 0]));
  const played = Object.fromEntries(names.map(n => [n, 0]));
  const metSeries = new Set(), metMid = new Set(), metThu = new Set();
  const games = [];
  let seriesNo = 1;

  // Who hosted each conference series last season.
  const lastHost = new Map();
  for (const g of prev?.games || []) if (g.type === 'regular' && g.confGame) lastHost.set(key(g.home, g.away), g.home);
  const orientConf = (a, b) => {
    const h = lastHost.get(key(a, b));
    if (h === a) return [b, a];
    if (h === b) return [a, b];
    return orient(a, b);
  };
  const orient = (a, b) => {
    if (homeCount[a] > homeCount[b]) return [b, a];
    if (homeCount[a] < homeCount[b]) return [a, b];
    return r() < 0.5 ? [a, b] : [b, a];
  };
  const addSeries = (week, home, away, conf) => {
    const sid = `${season.year}-${seriesNo++}`;
    for (const day of ['Fri', 'Sat', 'Sun']) {
      games.push(blankGame(season, { week, day, order: DAY_ORDER[day], home, away, confGame: conf, series: sid }));
    }
    homeCount[home] += 3; played[home] += 3; played[away] += 3;
    metSeries.add(key(home, away));
  };

  const REG = season.settings?.regWeeks ?? DEFAULT_REG_WEEKS;
  const midweek = season.settings?.midweek ?? 'mixed';
  const midStart = season.settings?.midweekStart ?? DEFAULT_MIDWEEK_START;
  const midSkipLast = season.settings?.midweekSkipLast ?? true;
  season.regWeeks = REG;
  const byConf = {};
  for (const n of names) (byConf[teams[n].conference] ||= []).push(n);
  // Conference rounds go in the last weeks of the season.
  const confWeeks = confWeeksFor(REG, Math.max(0, ...Object.values(byConf).map(l => rrRounds(l.length))));
  const weekPairs = {}; // week -> conference pairs
  // A conference that needs fewer rounds than there are conference weeks
  // starts its conference play later: its open weeks come first, so once a
  // conference starts it plays every weekend until the end of the season.
  for (const [conf, list] of Object.entries(byConf).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length < 2) continue;
    let rounds = roundRobin(list, r);
    if (rounds.length > confWeeks) rounds = rounds.slice(0, confWeeks);
    const first = REG - rounds.length + 1;
    rounds.forEach((pairs, i) => { (weekPairs[first + i] ||= []).push(...pairs.filter(([a, b]) => a && b).map(p => [...p, conf])); });
  }

  let midNo = 1;
  const satWeekend = {}, satMid = {};
  for (let week = 1; week <= REG; week++) {
    const busy = new Set();
    for (const [a, b] of weekPairs[week] || []) {
      const [h, aw] = orientConf(a, b);
      addSeries(week, h, aw, true); busy.add(a); busy.add(b);
    }
    const free = names.filter(n => !busy.has(n));
    const { pairs, idle } = crossPairs(free, teams, metSeries, r, played, satWeekend);
    for (const [a, b] of pairs) { const [h, aw] = orient(a, b); addSeries(week, h, aw, false); }
    // A team without a weekend series (a conference bye with nobody else free,
    // or the odd team out) plays one Thursday game against a team from
    // another conference, preferably one it hasn't played and one with
    // fewer games so far.
    const thu = new Set();
    for (const a of shuffle(idle, r)) {
      const opts = names.filter(b => b !== a && !thu.has(b) && !idle.includes(b) && teams[b].conference !== teams[a].conference);
      if (!opts.length) continue;
      const score = b => (metThu.has(key(a, b)) ? 100 : 0) + (metSeries.has(key(a, b)) ? 10 : 0) + played[b] + r();
      const b = opts.reduce((x, y) => (score(y) < score(x) ? y : x));
      const [h, aw] = orient(a, b);
      games.push(blankGame(season, { week, day: 'Thu', order: DAY_ORDER.Thu, home: h, away: aw }));
      homeCount[h]++; played[a]++; played[b]++;
      thu.add(a); thu.add(b); metThu.add(key(a, b));
    }

    if (week >= midStart && week <= REG - (midSkipLast ? 1 : 0)) {
      const { pairs: mids } = crossPairs(names, teams, metMid, r, played, satMid);
      for (const [a, b] of mids) {
        const [h, aw] = orient(a, b);
        const fmt = midweek === 'mixed' ? (r() < 0.5 ? 'doubleheader' : 'split') : midweek;
        if (fmt === 'single') {
          games.push(blankGame(season, { week, day: 'Tue', order: DAY_ORDER.Tue, home: h, away: aw }));
          homeCount[h]++; played[a]++; played[b]++;
        } else {
          const sid = `${season.year}-m${midNo++}`;
          const two = fmt === 'doubleheader'
            ? [{ day: 'Tue', order: DAY_ORDER.Tue, label: 'Doubleheader · Game 1' }, { day: 'Tue', order: DAY_ORDER.Tue + 0.5, label: 'Doubleheader · Game 2' }]
            : [{ day: 'Tue', order: DAY_ORDER.Tue }, { day: 'Wed', order: DAY_ORDER.Wed }];
          for (const x of two) games.push(blankGame(season, { week, home: h, away: aw, series: sid, midweek: fmt, ...x }));
          homeCount[h] += 2; played[a] += 2; played[b] += 2;
        }
        metMid.add(key(a, b));
      }
    }
  }
  return games;
}
