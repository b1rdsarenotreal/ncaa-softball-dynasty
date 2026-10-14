// Postseason: conference tournaments (single elimination, double elimination,
// or a play-in round then double elimination), then
// an NCAA tournament whose shape comes from the season's settings:
//   - regionals: how many, and how many teams in each (2 = best-of-three
//     series; 3 to 6 = double elimination with an "if necessary" final;
//     4 uses the classic NCAA regional format),
//   - super regionals (best of three between two regional champions) when
//     there are twice as many regionals as WCWS spots,
//   - the WCWS: 4 teams (double elimination to two, then a best-of-three
//     Championship Series) or 8 teams (Bracket A and Bracket B, each a
//     4-team double elimination, then a best-of-three final between the
//     bracket winners).
// The format is locked into the season when the field is announced.

import { blankGame, DAY_ORDER } from './schedule.js?v=20261014163557';
import { records, rpi, confStandings, conferences, isFinal, winnerOf, loserOf, regularSeasonDone, regSeasonChamp, quadrants, quadScore } from './standings.js?v=20261014163557';
import { generatePoll } from './polls.js?v=20261014163557';
import { hashStr } from './util.js?v=20261014163557';

// ---------- tournament format ----------

export const DEFAULT_NCAA = { regionals: 16, perRegional: 4, wsSize: 8 };
export const fieldSize = cfg => cfg.regionals * cfg.perRegional;
export const hasSupers = cfg => cfg.regionals === cfg.wsSize * 2;

export function ncaaConfig(season) {
  return { ...DEFAULT_NCAA, ...(season.post?.cfg || season.settings?.ncaa || {}) };
}

// The national seed shown for a team: only the regional hosts (the top
// national seeds, one per regional) carry a seed on screen. Everyone else is
// still seeded for building the regionals, just not displayed.
export function shownSeed(season, team) {
  const p = season.post;
  const f = p?.field?.find(x => x.team === team);
  return f && f.seed <= ncaaConfig(season).regionals ? f.seed : null;
}

// Problems with a format, in plain words (empty when it works).
export function ncaaProblems(cfg, teamCount, confCount = 0) {
  const out = [];
  if (![4, 8].includes(cfg.wsSize)) out.push("The WCWS must have 4 or 8 teams.");
  if (cfg.regionals !== cfg.wsSize && cfg.regionals !== cfg.wsSize * 2) out.push(`With a ${cfg.wsSize}-team WCWS there must be ${cfg.wsSize} regionals (winners go straight to the WCWS) or ${cfg.wsSize * 2} (winners meet in super regionals).`);
  if (!(cfg.perRegional >= 2 && cfg.perRegional <= 6)) out.push('Each regional needs 2 to 6 teams.');
  if (fieldSize(cfg) > teamCount) out.push(`That's ${fieldSize(cfg)} qualifiers, but there are only ${teamCount} teams.`);
  if (confCount && fieldSize(cfg) < confCount) out.push(`That's ${fieldSize(cfg)} qualifiers, but ${confCount} conferences each get an automatic bid.`);
  return out;
}

// One-paragraph description of a tournament format.
export function formatSummary(cfg) {
  const reg = cfg.perRegional === 2 ? 'best-of-three series' : cfg.perRegional === 4 ? '4-team double elimination' : `${cfg.perRegional}-team double elimination`;
  const sup = hasSupers(cfg) ? ` Regional champions pair off in ${cfg.regionals / 2} best-of-three super regionals.` : '';
  const ws = cfg.wsSize === 8 ? '8-team WCWS in Bracket A and Bracket B, then a best-of-three final' : '4-team WCWS, double elimination to two, then a best-of-three final';
  return `<b>Format:</b> ${fieldSize(cfg)} qualifiers in ${cfg.regionals} regionals of ${cfg.perRegional} (${reg}).${sup} ${ws}.`;
}

// Weeks after the regular season, which runs weeks 1 to `regWeeks`.
export function regWeeksOf(season) { return season.regWeeks ?? 14; }
export function postWeeks(season) {
  const R = regWeeksOf(season), cfg = ncaaConfig(season);
  const w = { conf: R + 1, regional: R + 2 };
  let n = R + 3;
  if (hasSupers(cfg)) w.super = n++;
  w.mcws = n++;
  if (cfg.wsSize === 8) w.finals = n++;
  return w;
}

export function defaultConfTourneySize(n) { return n >= 9 ? 6 : n >= 4 ? 4 : 0; }

// ---------- bracket nodes ----------

function bracketOrder(p) {
  let order = [1, 2];
  while (order.length < p) { const n = order.length * 2; order = order.flatMap(s => [s, n + 1 - s]); }
  return order;
}

// Days for a tournament week: the deepest round lands on Sunday.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function assignDays(nodes) {
  const byKey = Object.fromEntries(nodes.map(n => [n.key, n]));
  const depth = n => n._d ??= 1 + Math.max(0, ...[n.a, n.b].map(r => (r && !('seed' in r) ? depth(byKey[r.w || r.l]) : 0)));
  const max = Math.max(...nodes.map(depth));
  for (const n of nodes) { n.day = WEEKDAYS[Math.max(0, 7 - max + n._d - 1)]; n.depth = n._d; delete n._d; }
  return nodes;
}

// Single elimination for `size` teams (byes for the top seeds when needed).
// sec / col place each game in the drawn bracket.
function singleElim(size) {
  const p = 2 ** Math.ceil(Math.log2(Math.max(2, size)));
  const order = bracketOrder(p);
  const rounds = Math.log2(p);
  const names = ['Final', 'Semifinal', 'Quarterfinal', 'First round'];
  const codes = ['F', 'SF', 'QF', 'R1'];
  const nodes = [];
  let refs = [];
  for (let i = 0; i < order.length; i += 2) refs.push({ seed: order[i] - 1 }, { seed: order[i + 1] - 1 });
  for (let r = 0; r < rounds; r++) {
    const next = [], fromEnd = rounds - 1 - r, count = refs.length / 2;
    for (let i = 0; i < refs.length; i += 2) {
      const key = `R${r + 1}-${i / 2 + 1}`;
      const code = fromEnd === 0 ? 'Final' : `${codes[fromEnd] || 'R' + (r + 1)}${count > 1 ? '-' + (i / 2 + 1) : ''}`;
      nodes.push({ key, code, a: refs[i], b: refs[i + 1], sec: 'W', col: r, label: names[fromEnd] || `Round ${r + 1}` });
      next.push({ w: key });
    }
    refs = next;
  }
  return assignDays(nodes);
}

// Double elimination for a conference tournament: a winners bracket, an
// elimination (losers) bracket, and ONE championship game between the two
// bracket winners — no "if necessary" game.
function doubleElimConf(size) {
  const p = 2 ** Math.ceil(Math.log2(Math.max(2, size)));
  const k = Math.log2(p);
  if (k < 2) return singleElim(size);
  const order = bracketOrder(p);
  const nodes = [];
  const W = []; // W[r] = keys of winners round r (1-based)
  let refs = [];
  for (let i = 0; i < order.length; i += 2) refs.push({ seed: order[i] - 1 }, { seed: order[i + 1] - 1 });
  for (let r = 1; r <= k; r++) {
    W[r] = [];
    const next = [], count = refs.length / 2;
    for (let i = 0; i < refs.length; i += 2) {
      const key = `W${r}-${i / 2 + 1}`;
      nodes.push({ key, code: count > 1 ? key : 'W-Final', a: refs[i], b: refs[i + 1], sec: 'W', col: r - 1, label: r === k ? 'Winners final' : `Winners round ${r}` });
      W[r].push(key); next.push({ w: key });
    }
    refs = next;
  }
  // Elimination bracket.
  let lr = 1, prevL = [];
  const addL = (pairs, label) => {
    const keys = [];
    pairs.forEach(([a, b], i) => {
      const key = `L${lr}-${i + 1}`;
      nodes.push({ key, code: pairs.length > 1 ? key : `L${lr}`, a, b, sec: 'L', col: lr - 1, label });
      keys.push(key);
    });
    lr++;
    return keys;
  };
  const w1 = W[1];
  prevL = addL(Array.from({ length: w1.length / 2 }, (_, i) => [{ l: w1[2 * i] }, { l: w1[2 * i + 1] }]), 'Elimination round 1');
  for (let j = 1; j <= k - 1; j++) {
    const drop = [...W[j + 1]].reverse(); // cross the drop-ins to avoid quick rematches
    const last = j === k - 1;
    prevL = addL(prevL.map((key, i) => [{ w: key }, { l: drop[i] }]), last ? 'Elimination final' : `Elimination round ${lr}`);
    if (!last) prevL = addL(Array.from({ length: prevL.length / 2 }, (_, i) => [{ w: prevL[2 * i] }, { w: prevL[2 * i + 1] }]), `Elimination round ${lr}`);
  }
  nodes.push({ key: 'CH', code: 'Final', a: { w: W[k][0] }, b: { w: prevL[0] }, sec: 'F', col: 0, label: 'Championship' });
  return assignDays(nodes);
}

// Best of three between seeds[0] and seeds[1] (higher seed first).
function seriesNodes(days = ['Fri', 'Sat', 'Sun']) {
  return [
    { key: 'S1', code: 'Game 1', a: { seed: 0 }, b: { seed: 1 }, day: days[0], t: 1, label: 'Game 1', sec: 'F', col: 0 },
    { key: 'S2', code: 'Game 2', a: { seed: 1 }, b: { seed: 0 }, day: days[1], t: 2, label: 'Game 2', sec: 'F', col: 0, after: 'S1' },
    { key: 'S3', code: 'Game 3', a: { seed: 0 }, b: { seed: 1 }, day: days[2], t: 3, label: 'Game 3 (if necessary)', cond: 's3', sec: 'F', col: 0 },
  ];
}

// Double elimination with an "if necessary" final: the elimination-bracket
// winner has to beat the winners-bracket winner twice.
function doubleElimIfNec(size) {
  const nodes = doubleElimConf(size);
  const ch = nodes.find(n => n.key === 'CH');
  ch.label = 'Final';
  for (const n of nodes) n.t = n.depth;
  nodes.push({ key: 'IF', code: 'Final (if necessary)', a: ch.a, b: ch.b, sec: 'F', col: 0, label: 'Final (if necessary)', cond: 'ifnec', day: 'Mon', t: ch.depth + 1 });
  return nodes;
}

function regionalNodes(size) {
  if (size === 2) return seriesNodes();
  if (size === 4) return fourTeamRegional(doubleElim('g7'));
  return doubleElimIfNec(size);
}
// Four-team regional weekend: Friday G1 and G2; Saturday G3, G4 and G5;
// Sunday the regional final and, if needed, the second final.
const REGIONAL_DAYS = { G1: ['Fri', 1], G2: ['Fri', 1.1], G3: ['Sat', 2], G4: ['Sat', 2.1], G5: ['Sat', 2.2], G6: ['Sun', 3], G7: ['Sun', 3.1] };
function fourTeamRegional(nodes) {
  for (const n of nodes) if (REGIONAL_DAYS[n.key]) [n.day, n.t] = REGIONAL_DAYS[n.key];
  return nodes;
}
// Regionals built by older versions played G5 on Sunday and G7 on Monday.
// Move any game not yet played to the current weekend.
function fixRegionalDays(season, ev) {
  if (ev.kind !== 'regional') return;
  for (const n of ev.nodes) {
    const want = REGIONAL_DAYS[n.key];
    if (!want || (n.day === want[0] && n.t === want[1])) continue;
    const g = n.gameId && season.games.find(x => x.id === n.gameId);
    if (g && isFinal(g)) continue;
    [n.day, n.t] = want;
    if (g) { g.day = want[0]; g.order = want[1]; }
  }
}
const regionalKind = size => (size === 2 ? 'series' : size === 4 ? 'regional' : 'de');

// Play-in, then double elimination: the lowest seeds play a single-
// elimination first round (lose and you're out) while the top seeds have a
// bye. The play-in winners and the bye teams then play a double-elimination
// bracket of 4 (or 8) with one championship game. A top 6 is 3 vs 6 and
// 4 vs 5, then 1, 2 and the two winners in double elimination; a top 8 has
// no byes, so all eight play in.
function playInDoubleConf(size) {
  if (size < 5) return doubleElimConf(size);
  const D = 2 ** Math.floor(Math.log2(size - 1)); // double-elimination field
  const order = bracketOrder(2 * D);
  const pre = [], slot = {};
  let k = 0;
  for (let i = 0; i < order.length; i += 2) {
    const hi = Math.min(order[i], order[i + 1]) - 1, lo = Math.max(order[i], order[i + 1]) - 1;
    const real = lo < size;
    const key = `P-${i / 2 + 1}`;
    pre.push({ key, code: real ? `Play-in ${++k}` : 'Bye', a: { seed: hi }, b: { seed: lo }, sec: 'W', col: 0, label: 'Play-in round' });
    slot[hi] = key;
  }
  if (k === 1) pre.find(n => n.code === 'Play-in 1').code = 'Play-in';
  const de = doubleElimConf(D);
  for (const n of de) {
    for (const side of ['a', 'b']) if (n[side] && 'seed' in n[side]) n[side] = { w: slot[n[side].seed] };
    if (n.sec !== 'F') n.col += 1;
    delete n.day; delete n.depth;
  }
  return assignDays([...pre, ...de]);
}

// The format a conference tournament of `size` teams actually uses.
export function confKind(want, size) {
  if (want === 'playin' && size >= 5) return 'playin';
  if ((want === 'double' || want === 'playin') && size >= 3) return 'double';
  return 'single';
}
export const CONF_FORMATS = [['single', 'Single elimination'], ['double', 'Double elimination'], ['playin', 'Play-in, then double elimination']];
export const confFormatName = kind => (CONF_FORMATS.find(([k]) => k === kind) || CONF_FORMATS[0])[1];

function buildConfNodes(kind, size) {
  if (kind === 'playin') return playInDoubleConf(size);
  return kind === 'double' && size >= 3 ? doubleElimConf(size) : singleElim(size);
}

function doubleElim(final = 'g7') {
  const n = [
    { key: 'G1', code: 'G1', a: { seed: 0 }, b: { seed: 3 }, day: 'Fri', label: 'Game 1', sec: 'W', col: 0 },
    { key: 'G2', code: 'G2', a: { seed: 1 }, b: { seed: 2 }, day: 'Fri', label: 'Game 2', sec: 'W', col: 0 },
    { key: 'G3', code: 'G3', a: { l: 'G1' }, b: { l: 'G2' }, day: 'Sat', label: 'Game 3 (elimination)', sec: 'L', col: 0 },
    { key: 'G4', code: 'G4', a: { w: 'G1' }, b: { w: 'G2' }, day: 'Sat', label: 'Game 4', sec: 'W', col: 1 },
    { key: 'G5', code: 'G5', a: { w: 'G3' }, b: { l: 'G4' }, day: 'Sun', label: 'Game 5 (elimination)', sec: 'L', col: 1 },
  ];
  if (final === 'g7') {
    n.push({ key: 'G6', code: 'G6', a: { w: 'G4' }, b: { w: 'G5' }, day: 'Sun', label: 'Regional final', sec: 'F', col: 0 });
    n.push({ key: 'G7', code: 'G7', a: { w: 'G4' }, b: { w: 'G5' }, day: 'Mon', label: 'Regional final (if necessary)', cond: 'g7', sec: 'F', col: 0 });
  } else {
    for (const x of n) x.day = { Fri: 'Thu', Sat: 'Fri', Sun: 'Sat' }[x.day];
    n.push({ key: 'F1', code: 'Finals G1', a: { w: 'G4' }, b: { w: 'G5' }, day: 'Sun', label: 'Championship Series · Game 1', after: 'G5', sec: 'F', col: 0 });
    n.push({ key: 'F2', code: 'Finals G2', a: { w: 'G5' }, b: { w: 'G4' }, day: 'Mon', label: 'Championship Series · Game 2', after: 'F1', sec: 'F', col: 0 });
    n.push({ key: 'F3', code: 'Finals G3', a: { w: 'G4' }, b: { w: 'G5' }, day: 'Tue', label: 'Championship Series · Game 3 (if necessary)', cond: 'f3', sec: 'F', col: 0 });
  }
  return n;
}

// One WCWS bracket (Bracket A or B): the 4-team NCAA double elimination,
// shifted a day for Bracket B so the two brackets alternate.
// WCWS days (both brackets play the same days): opening games Friday, Game 4
// Saturday, Games 3 and 5 Sunday, bracket finals Monday. In a 4-team WCWS
// the Championship Series follows on Monday, Tuesday and Wednesday.
const WS_DAYS = { G1: ['Fri', 1], G2: ['Fri', 1.1], G4: ['Sat', 2], G3: ['Sun', 3], G5: ['Sun', 3.1], G6: ['Mon', 4], G7: ['Mon', 4.1], F1: ['Mon', 4], F2: ['Tue', 5], F3: ['Wed', 6] };
function wsDays(nodes) {
  for (const n of nodes) if (WS_DAYS[n.key]) [n.day, n.t] = WS_DAYS[n.key];
  return nodes;
}
function wsBracketNodes() {
  const n = wsDays(doubleElim('g7'));
  for (const x of n) {
    if (x.key === 'G6') x.label = 'Bracket final';
    if (x.key === 'G7') x.label = 'Bracket final (if necessary)';
  }
  return n;
}
// WCWS events built by older versions: move games not yet played to these days.
function fixWsDays(season, ev) {
  for (const n of ev.nodes) {
    const want = WS_DAYS[n.key];
    if (!want || (n.day === want[0] && n.t === want[1])) continue;
    const g = n.gameId && season.games.find(x => x.id === n.gameId);
    if (g && isFinal(g)) continue;
    [n.day, n.t] = want;
    if (g) { g.day = want[0]; g.order = want[1]; }
  }
}

// Brackets saved by older versions lack the layout fields (sec, col, code,
// depth) that the drawn bracket needs; fill them in from the node keys.
const FIXED_LAYOUT = { G1: ['W', 0], G2: ['W', 0], G3: ['L', 0], G4: ['W', 1], G5: ['L', 1], G6: ['F', 0], G7: ['F', 0], F1: ['F', 0], F2: ['F', 0], F3: ['F', 0] };
export function ensureLayout(ev) {
  if (!ev?.nodes?.length || ev.nodes.every(n => n.sec && Number.isFinite(n.col) && n.code)) return ev;
  const rounds = Math.max(1, ...ev.nodes.map(n => +(/^R(\d+)-/.exec(n.key)?.[1] || 0)));
  for (const n of ev.nodes) {
    let m;
    if ((m = /^R(\d+)-(\d+)$/.exec(n.key))) {
      const r = +m[1], fromEnd = rounds - r, count = ev.nodes.filter(x => x.key.startsWith(`R${r}-`)).length;
      n.sec ||= 'W'; if (!Number.isFinite(n.col)) n.col = r - 1;
      n.code ||= fromEnd === 0 ? 'Final' : `${['F', 'SF', 'QF', 'R1'][fromEnd] || 'R' + r}${count > 1 ? '-' + m[2] : ''}`;
    } else if (FIXED_LAYOUT[n.key]) {
      const [sec, col] = FIXED_LAYOUT[n.key];
      n.sec ||= sec; if (!Number.isFinite(n.col)) n.col = col;
      n.code ||= /^F\d/.test(n.key) ? `Finals G${n.key[1]}` : n.key;
    } else if ((m = /^([WL])(\d+)-/.exec(n.key))) {
      n.sec ||= m[1]; if (!Number.isFinite(n.col)) n.col = +m[2] - 1; n.code ||= n.key;
    } else {
      n.sec ||= 'F'; if (!Number.isFinite(n.col)) n.col = 0; n.code ||= n.key;
    }
  }
  return ev;
}

const nodeOf = (ev, k) => ev.nodes.find(n => n.key === k);
const BYE = '__bye__';

function resolve(ev, ref) {
  if (!ref) return null;
  if ('seed' in ref) return ev.seeds[ref.seed] ?? BYE;
  const n = nodeOf(ev, ref.w || ref.l);
  if (!n) return null;
  return ref.w ? n.winner : n.loser;
}

function condMet(ev, node) {
  if (node.after && !nodeOf(ev, node.after)?.winner) return false;
  if (node.cond === 'g7') { const g6 = nodeOf(ev, 'G6'); return !!g6.winner && g6.winner !== resolve(ev, { w: 'G4' }); }
  if (node.cond === 'f3') { const a = nodeOf(ev, 'F1'), b = nodeOf(ev, 'F2'); return !!a.winner && !!b.winner && a.winner !== b.winner; }
  if (node.cond === 's3') { const a = nodeOf(ev, 'S1'), b = nodeOf(ev, 'S2'); return !!a.winner && !!b.winner && a.winner !== b.winner; }
  if (node.cond === 'ifnec') { const ch = nodeOf(ev, 'CH'); return !!ch.winner && ch.winner !== resolve(ev, ch.a); }
  return true;
}

// Games that switch home and away from the game they follow.
const FLIP_OF = { S2: 'S1', F2: 'F1', G7: 'G6', IF: 'CH' };

// Create games whose teams are known; record winners of finished games.
function advanceEvent(season, ev, { type, week, name }) {
  // Re-derive winners from the games, so edited results flow through. Games
  // not yet played whose matchup no longer fits the bracket are removed.
  for (const n of ev.nodes) { n.winner = null; n.loser = null; }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of ev.nodes) {
      if (node.winner || !node.gameId) continue;
      const g = season.games.find(x => x.id === node.gameId);
      if (!g) { node.gameId = null; continue; }
      const a = resolve(ev, node.a), b = resolve(ev, node.b);
      if (!a || !b) continue;
      const fits = condMet(ev, node) && new Set([a, b, g.home, g.away]).size === 2;
      if (!fits && !isFinal(g)) { season.games = season.games.filter(x => x !== g); node.gameId = null; continue; }
      // Older saves: a flipped game not yet played that has the same home team
      // as the game it follows gets switched.
      const ref = FLIP_OF[node.key] && ev.nodes.find(x => x.key === FLIP_OF[node.key]);
      const refGame = ref?.gameId && season.games.find(x => x.id === ref.gameId);
      if (!isFinal(g) && refGame && g.home === refGame.home && g.away === refGame.away) {
        [g.home, g.away] = [g.away, g.home];
        if (ev.host && (g.home === ev.host || g.away === ev.host)) { g.neutral = true; g.site = ev.host; }
      }
      if (isFinal(g)) { node.winner = winnerOf(g); node.loser = loserOf(g); changed = true; }
    }
  }
  changed = true;
  while (changed) {
    changed = false;
    for (const node of ev.nodes) {
      if (node.winner) continue;
      if (node.gameId) {
        const g = season.games.find(x => x.id === node.gameId);
        if (!g) { node.gameId = null; changed = true; continue; }
        if (isFinal(g)) { node.winner = winnerOf(g); node.loser = loserOf(g); changed = true; }
        continue;
      }
      if (!condMet(ev, node)) continue;
      const a = resolve(ev, node.a), b = resolve(ev, node.b);
      if (!a || !b) continue;
      if (a === BYE || b === BYE) { node.winner = a === BYE ? b : a; node.loser = BYE; changed = true; continue; }
      const ia = ev.seeds.indexOf(a), ib = ev.seeds.indexOf(b);
      let home = ia <= ib ? a : b, away = home === a ? b : a;
      const hosted = ev.host && (home === ev.host || away === ev.host);
      if (hosted && away === ev.host) [home, away] = [away, home];
      // Game 2 of a series, and the "if necessary" game after a double-
      // elimination final, flip home and away. At a host's field the game is
      // still played there; the visitor is the home team (bats last).
      const flip = FLIP_OF[node.key] != null;
      if (flip) [home, away] = [away, home];
      const atHostAsVisitor = hosted && flip;
      const g = blankGame(season, {
        type, week, day: node.day,
        order: node.t != null ? node.t : DAY_ORDER[node.day] + (type !== 'conf' && ['Mon', 'Tue', 'Wed'].includes(node.day) ? 7 : 0) + (node.key === 'G6' ? 0.5 : 0) + (node.depth || 0) * 0.01,
        home, away, neutral: !hosted || atHostAsVisitor, ...(atHostAsVisitor ? { site: ev.host } : {}), event: ev.id, node: node.key,
        label: `${name} · ${node.label}`,
        ...(ev.kind === 'series' ? { series: ev.id, bestOf: 3 } : node.key[0] === 'F' && ev.kind === 'mcws' ? { series: `${ev.id}-finals`, bestOf: 3 } : {}),
      });
      season.games.push(g);
      node.gameId = g.id;
      changed = true;
    }
  }
  ev.champion = eventChampion(ev);
  return ev.champion;
}

function seriesChampion(ev, keys) {
  const wins = {};
  for (const k of keys) { const w = nodeOf(ev, k)?.winner; if (w) wins[w] = (wins[w] || 0) + 1; }
  return Object.keys(wins).find(t => wins[t] >= 2) || null;
}

function eventChampion(ev) {
  if (ev.kind === 'single' || ev.kind === 'double' || ev.kind === 'playin') { const w = ev.nodes[ev.nodes.length - 1].winner; return w && w !== BYE ? w : null; }
  if (ev.kind === 'regional') {
    const g6 = nodeOf(ev, 'G6'), g7 = nodeOf(ev, 'G7');
    if (g7.winner) return g7.winner;
    if (g6.winner && g6.winner === resolve(ev, { w: 'G4' })) return g6.winner;
    return null;
  }
  if (ev.kind === 'de') {
    const ch = nodeOf(ev, 'CH'), ifn = nodeOf(ev, 'IF');
    if (ifn.winner) return ifn.winner;
    if (ch.winner && ch.winner === resolve(ev, ch.a)) return ch.winner;
    return null;
  }
  if (ev.kind === 'series') return seriesChampion(ev, ['S1', 'S2', 'S3']);
  return seriesChampion(ev, ['F1', 'F2', 'F3']);
}

export function runnerUp(ev) {
  if (!ev?.champion) return null;
  if (ev.kind === 'series') return ev.seeds.find(t => t !== ev.champion) || null;
  const finalKey = ev.kind === 'mcws' ? 'F1' : ev.kind === 'regional' ? 'G6' : ev.kind === 'de' ? 'CH' : ev.nodes[ev.nodes.length - 1].key;
  const n = nodeOf(ev, finalKey);
  return n.winner === ev.champion ? n.loser : n.winner;
}

// ---------- conference tournaments ----------

export function confTourneySeeds(season, conf) {
  const recs = records(season, g => g.type === 'regular'), r = rpi(season, g => g.type === 'regular');
  return confStandings(season, conf, recs, r).map(x => x.team);
}

// Conference tournament hosts. Each season every conference's tournament is
// played at one of its schools, picked at random (not last year's host when
// there's a choice). The commissioner can change it. Hosting doesn't change
// the bracket: the host plays its games at home and every other game is at
// the host's site.
export function pickConfHosts(season, prev = null) {
  season.confHosts ||= {};
  for (const conf of conferences(season)) confHost(season, conf, prev?.confHosts?.[conf]);
  return season.confHosts;
}
export function confHost(season, conf, avoid = null) {
  season.confHosts ||= {};
  const teams = Object.values(season.teams).filter(t => t.conference === conf).map(t => t.school).sort();
  if (!teams.length) return null;
  let h = season.confHosts[conf];
  if (!h || !teams.includes(h)) {
    const pool = teams.length > 1 && avoid ? teams.filter(t => t !== avoid) : teams;
    h = pool[hashStr(`${season.year}|${conf}|host`) % pool.length];
    season.confHosts[conf] = h;
  }
  return h;
}
// Change a tournament's host. Games already played keep their site; games
// not yet played are rebuilt at the new host.
export function setConfHost(season, conf, team) {
  season.confHosts ||= {};
  season.confHosts[conf] = team;
  const ev = season.post?.confT?.[conf];
  if (ev) moveConfTourney(season, ev, team);
}
function moveConfTourney(season, ev, host) {
  ev.host = host;
  const ids = new Set(ev.nodes.map(n => n.gameId).filter(Boolean));
  season.games = season.games.filter(g => !ids.has(g.id) || isFinal(g));
}

export function setupConfTourneys(season) {
  season.post ||= {};
  season.post.confT = {};
  for (const conf of conferences(season)) {
    const n = Object.values(season.teams).filter(t => t.conference === conf).length;
    const size = Math.min(n, season.settings.confTourney?.[conf] ?? defaultConfTourneySize(n));
    if (size < 2) continue;
    const seeds = confTourneySeeds(season, conf).slice(0, size);
    const kind = confKind(season.settings.confFormat?.[conf], size);
    season.post.confT[conf] = { id: `ct-${conf}`, kind, conf, size, seeds, nodes: buildConfNodes(kind, size), champion: null, host: confHost(season, conf) };
  }
  season.phase = 'conf';
}

// Replace a conference tournament's seeds (only before any of its games are played).
export function reseedConfTourney(season, conf, seeds) {
  const ev = season.post.confT[conf];
  const ids = new Set(ev.nodes.map(n => n.gameId).filter(Boolean));
  if (season.games.some(g => ids.has(g.id) && isFinal(g))) throw new Error('That tournament has already started.');
  season.games = season.games.filter(g => !ids.has(g.id));
  ev.seeds = seeds;
  ev.nodes = buildConfNodes(ev.kind, ev.size);
  ev.champion = null;
}

// Where the WCWS is played. Every WCWS game is at this neutral site.
export const DEFAULT_WCWS_VENUE = { stadium: 'Devon Park', city: 'Oklahoma City, Oklahoma' };
export function mcwsVenue(season) {
  const st = season?.settings || {};
  return { stadium: st.mcwsVenue || DEFAULT_WCWS_VENUE.stadium, city: st.mcwsCity ?? DEFAULT_WCWS_VENUE.city };
}

// ---------- selection ----------

// The committee's order, used to pick at-large teams and seed the field:
// RPI rank 60%, quadrant rank 25% (wins against Quadrant 1 and 2 teams count
// most, Quadrant 3 and 4 losses hurt most; see quadScore) and
// strength-of-schedule rank 15%. The poll isn't used.
export const COMMITTEE_WEIGHTS = { rpi: 0.6, quad: 0.25, sos: 0.15 };
export function quadRanks(season, r = rpi(season), Q = quadrants(season, r)) {
  const teams = Object.keys(season.teams);
  const sc = Object.fromEntries(teams.map(t => [t, quadScore(Q[t])]));
  const sorted = [...teams].sort((a, b) => sc[b] - sc[a] || (r[a].rank ?? 999) - (r[b].rank ?? 999));
  return Object.fromEntries(sorted.map((t, i) => [t, { rank: i + 1, score: sc[t] }]));
}
export function committeeOrder(season) {
  const r = rpi(season);
  const qr = quadRanks(season, r);
  const teams = Object.keys(season.teams);
  const W = COMMITTEE_WEIGHTS;
  const score = t => W.rpi * (r[t].rank ?? 999) + W.quad * qr[t].rank + W.sos * (r[t].sosRank ?? 999);
  return teams.sort((a, b) => score(a) - score(b) || r[b].rpi - r[a].rpi);
}

// At-large teams need a winning or .500 record (every game so far counts).
// Teams below .500 only get in as their conference's automatic qualifier.
export function atLargeEligible(season, t, recs = records(season)) {
  const r = recs[t];
  return !!r && r.w >= r.l;
}

// The teams that may take at-large spots, in committee order. If too few
// teams are .500 or better to fill the field, the best of the rest fill the
// remaining spots (listed in `fill`) so the bracket still works.
export function atLargePool(season, order = committeeOrder(season), autoSet = new Set(Object.values(autoBids(season)).filter(Boolean))) {
  const size = Math.min(fieldSize(ncaaConfig(season)), Object.keys(season.teams).length);
  const recs = records(season);
  const rest = order.filter(t => !autoSet.has(t));
  const eligible = rest.filter(t => atLargeEligible(season, t, recs));
  const ineligible = rest.filter(t => !atLargeEligible(season, t, recs));
  const spots = Math.max(0, size - autoSet.size);
  const fill = ineligible.slice(0, Math.max(0, spots - eligible.length));
  const allowed = new Set([...eligible, ...fill]);
  return { size, spots, eligible, ineligible, fill, pool: rest.filter(t => allowed.has(t)) };
}

export function autoBids(season) {
  const out = {};
  const recs = records(season, g => g.type === 'regular'), r = rpi(season, g => g.type === 'regular');
  for (const conf of conferences(season)) {
    const ev = season.post?.confT?.[conf];
    out[conf] = season.overrides?.autoBids?.[conf] || ev?.champion || regSeasonChamp(season, conf, recs, r);
  }
  return out;
}

export function proposeField(season, size = Math.min(fieldSize(ncaaConfig(season)), Object.keys(season.teams).length)) {
  const order = committeeOrder(season);
  const autos = autoBids(season);
  const autoSet = new Set(Object.values(autos).filter(Boolean));
  const recs = records(season);
  const { pool } = atLargePool(season, order, autoSet);
  const field = [...autoSet];
  for (const t of pool) { if (field.length >= size) break; if (!field.includes(t)) field.push(t); }
  const seeded = order.filter(t => field.includes(t));
  season.post.field = seeded.map((t, i) => ({ team: t, seed: i + 1, bid: autoSet.has(t) ? 'auto' : 'at-large', conf: season.teams[t].conference }));
  season.post.lastIn = order.filter(t => field.includes(t) && !autoSet.has(t)).slice(-4);
  season.post.firstOut = order.filter(t => !field.includes(t) && atLargeEligible(season, t, recs)).slice(0, 4);
  season.post.fieldConfirmed = false;
  season.phase = 'selection';
}

// Bracketology: the field and regionals as they would look if the season
// ended today. Projected automatic bids go to each conference's current
// leader (or its tournament champion once there is one); the rest follow the
// committee order. Nothing is saved.
export const BRACKETOLOGY_FROM_WEEK = 4;
export function bracketology(season) {
  const cfg = ncaaConfig(season);
  const size = Math.min(fieldSize(cfg), Object.keys(season.teams).length);
  const order = committeeOrder(season);
  const autos = autoBids(season);
  // Before a conference has played league games, its projected bid goes to
  // its best team in the committee order.
  for (const c of Object.keys(autos)) if (!autos[c]) autos[c] = order.find(t => season.teams[t].conference === c) || null;
  const autoSet = new Set(Object.values(autos).filter(Boolean));
  const recs = records(season);
  const { pool, fill } = atLargePool(season, order, autoSet);
  const chosen = [...autoSet];
  for (const t of pool) { if (chosen.length >= size) break; if (!chosen.includes(t)) chosen.push(t); }
  const field = order.filter(t => chosen.includes(t)).map((t, i) => ({ team: t, seed: i + 1, bid: autoSet.has(t) ? 'auto' : 'at-large', conf: season.teams[t].conference }));
  const atLarge = order.filter(t => chosen.includes(t) && !autoSet.has(t));
  const out = order.filter(t => !chosen.includes(t) && !autoSet.has(t) && atLargeEligible(season, t, recs));
  return { cfg, field, autos, fill, regionals: pods(field, cfg.regionals), lastIn: atLarge.slice(-4), firstOut: out.slice(0, 4), nextOut: out.slice(4, 8) };
}

// Selection, step 1: the commissioner settles which teams are in. Automatic
// qualifiers are fixed; at-large spots go to any non-automatic team.
export function selectionBoard(season, extra = 10) {
  const order = committeeOrder(season);
  const autoSet = new Set(Object.values(autoBids(season)).filter(Boolean));
  const autos = order.filter(t => autoSet.has(t));
  const { size, spots, pool, ineligible, fill } = atLargePool(season, order, autoSet);
  const inField = new Set((season.post?.field || []).map(f => f.team));
  // Show the at-large spots plus the next `extra` teams, and never hide a team that's in.
  let board = pool.slice(0, spots + extra);
  for (const t of pool) if (inField.has(t) && !board.includes(t)) board.push(t);
  return { size, autos, spots, board, order, pool, ineligible: ineligible.filter(t => !fill.includes(t)), fill, chosen: pool.filter(t => inField.has(t)) };
}
function reseedByCommittee(season, teams) {
  const order = committeeOrder(season);
  const autoSet = new Set(Object.values(autoBids(season)).filter(Boolean));
  const field = order.filter(t => teams.includes(t));
  season.post.field = field.map((t, i) => ({ team: t, seed: i + 1, bid: autoSet.has(t) ? 'auto' : 'at-large', conf: season.teams[t].conference }));
  season.post.lastIn = order.filter(t => field.includes(t) && !autoSet.has(t)).slice(-4);
  const recs = records(season);
  season.post.firstOut = order.filter(t => !field.includes(t) && !autoSet.has(t) && atLargeEligible(season, t, recs)).slice(0, 4);
}
export function setAtLarge(season, team, on) {
  const p = season.post;
  if (p.fieldConfirmed) throw new Error('Unlock the field to change teams.');
  const b = selectionBoard(season);
  if (b.autos.includes(team)) throw new Error(`${team} is an automatic qualifier.`);
  if (on && !b.pool.includes(team)) throw new Error(`${team} has a losing record and can only get in as an automatic qualifier.`);
  let teams = p.field.map(f => f.team);
  if (on && !teams.includes(team)) {
    if (b.chosen.length >= b.spots) throw new Error(`All ${b.spots} at-large spots are taken. Take a team out first.`);
    teams.push(team);
  } else if (!on) teams = teams.filter(t => t !== team);
  reseedByCommittee(season, teams);
}
// Step 2: confirm the teams, then order the seeds.
export function confirmField(season) {
  const b = selectionBoard(season);
  if (season.post.field.length !== b.size) throw new Error(`Pick ${b.spots} at-large teams (${b.chosen.length} picked).`);
  season.post.fieldConfirmed = true;
}
export function unconfirmField(season) { season.post.fieldConfirmed = false; }

// Serpentine pods: with 4 regionals, regional 1 gets seeds 1, 8, 9, 16,
// regional 2 gets 2, 7, 10, 15, and so on. Regional k is hosted by seed k+1.
export function pods(field, regionals = 4) {
  const n = regionals, out = Array.from({ length: n }, () => []);
  field.forEach((f, i) => { const rnd = Math.floor(i / n); const k = rnd % 2 === 0 ? i % n : n - 1 - (i % n); out[k].push(f.team); });
  return out;
}

export function lockField(season) {
  const p = season.post;
  p.cfg = { ...DEFAULT_NCAA, ...(season.settings.ncaa || {}) };
  const field = [...p.field].sort((a, b) => a.seed - b.seed);
  p.regionals = pods(field, p.cfg.regionals).map((teams, i) => ({
    id: `reg-${i + 1}`, kind: regionalKind(teams.length), seeds: teams, host: teams[0], nodes: regionalNodes(teams.length), champion: null,
    name: `${teams[0]} Regional`, path: i,
  }));
  season.phase = 'regionals';
}

const nationalSeed = (season, t) => season.post.field?.find(f => f.team === t)?.seed ?? 99;

// Super regionals: regional k meets regional (n-1-k), so the 1 seed's
// regional pairs with the last host's. The higher national seed hosts.
function buildSupers(season) {
  const regs = season.post.regionals, n = regs.length;
  return Array.from({ length: n / 2 }, (_, i) => {
    const pair = [regs[i].champion, regs[n - 1 - i].champion].sort((a, b) => nationalSeed(season, a) - nationalSeed(season, b));
    return { id: `sup-${i + 1}`, kind: 'series', seeds: pair, host: pair[0], nodes: seriesNodes(), champion: null, name: `${pair[0]} Super Regional`, path: i };
  });
}

// Teams reaching the WCWS, in bracket-path order (path k = national seed k+1's side).
function wsQualifiers(season) {
  const p = season.post, cfg = ncaaConfig(season);
  const stage = hasSupers(cfg) ? p.supers : p.regionals;
  if (!stage?.length || !stage.every(ev => ev.champion)) return null;
  return stage.map((ev, i) => [ev.path ?? i, ev.champion]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

// 8-team WCWS brackets: Bracket A holds paths 1, 4, 5, 8 (games 1 vs 8 and
// 4 vs 5); Bracket B holds paths 2, 3, 6, 7 (2 vs 7 and 3 vs 6).
function buildWsBrackets(q) {
  return [
    { id: 'ws-A', kind: 'regional', bracket: 'A', seeds: [q[0], q[3], q[4], q[7]], host: null, nodes: wsBracketNodes(), champion: null, name: 'Bracket A' },
    { id: 'ws-B', kind: 'regional', bracket: 'B', seeds: [q[1], q[2], q[5], q[6]], host: null, nodes: wsBracketNodes(), champion: null, name: 'Bracket B' },
  ];
}

// ---------- driver ----------

// Keep a stage (super regionals, the WCWS, its finals) in step with the
// stage before it. `sig` names the teams that should be in it, or is null
// while the earlier stage is unfinished. A stage whose teams no longer match
// is rebuilt, unless it already has results (the commissioner's call).
function syncStage(season, key, sig, build) {
  const p = season.post;
  p.sigs ||= {};
  if (p[key] && p.sigs[key] !== sig) {
    const evs = Array.isArray(p[key]) ? p[key] : [p[key]];
    const ids = new Set(evs.map(e => e.id));
    const played = season.games.some(g => ids.has(g.event) && isFinal(g));
    if (!played) {
      season.games = season.games.filter(g => !ids.has(g.event));
      delete p[key]; delete p.sigs[key];
    } else if (p.sigs[key] === undefined) p.sigs[key] = sig; // saved before stages were tracked: keep it as is
  }
  if (!p[key] && sig) { p[key] = build(); p.sigs[key] = sig; }
  return p[key];
}

// Advance everything that can advance. Call after any result changes.
export function progress(season) {
  if (!season.post) season.post = {};
  const p = season.post;
  for (const ev of allEvents(season)) ensureLayout(ev);
  const W = postWeeks(season);
  if (season.phase === 'regular' && regularSeasonDone(season) && season.games.some(g => g.type === 'regular')) setupConfTourneys(season);
  // Tournaments set up before hosts existed get one now.
  if (p.confT) for (const ev of Object.values(p.confT)) if (ev.host === undefined) moveConfTourney(season, ev, confHost(season, ev.conf));
  if (p.confT) for (const ev of Object.values(p.confT)) advanceEvent(season, ev, { type: 'conf', week: W.conf, name: `${ev.conf} Tournament` });
  if (season.phase === 'conf' && Object.values(p.confT || {}).every(ev => ev.champion)) proposeField(season);
  if (!p.regionals) return;

  const cfg = ncaaConfig(season);
  for (const ev of p.regionals) { fixRegionalDays(season, ev); advanceEvent(season, ev, { type: 'regional', week: W.regional, name: ev.name }); }

  if (hasSupers(cfg)) {
    const done = p.regionals.every(ev => ev.champion);
    syncStage(season, 'supers', done ? p.regionals.map(ev => ev.champion).join('|') : null, () => buildSupers(season));
    for (const ev of p.supers || []) advanceEvent(season, ev, { type: 'super', week: W.super, name: ev.name });
  }

  const q = wsQualifiers(season);
  const wsName = season.settings.mcwsName || "Women's College World Series";
  if (cfg.wsSize === 8) {
    syncStage(season, 'mcwsBrackets', q ? q.join('|') : null, () => buildWsBrackets(q));
    for (const ev of p.mcwsBrackets || []) fixWsDays(season, ev);
    for (const ev of p.mcwsBrackets || []) advanceEvent(season, ev, { type: 'mcws', week: W.mcws, name: `${wsName} · ${ev.name}` });
    const bw = p.mcwsBrackets?.every(ev => ev.champion) ? p.mcwsBrackets.map(ev => ev.champion).sort((a, b) => nationalSeed(season, a) - nationalSeed(season, b)) : null;
    syncStage(season, 'mcwsFinals', bw ? bw.join('|') : null, () => ({ id: 'ws-F', kind: 'series', seeds: bw, host: null, nodes: seriesNodes(), champion: null, name: 'Championship Series' }));
    if (p.mcwsFinals) advanceEvent(season, p.mcwsFinals, { type: 'mcws', week: W.finals, name: `${wsName} Finals` });
  } else {
    const seeded = q ? [...q].sort((a, b) => nationalSeed(season, a) - nationalSeed(season, b)) : null;
    syncStage(season, 'mcws', seeded ? seeded.join('|') : null, () => ({ id: 'mcws', kind: 'mcws', seeds: seeded, host: null, nodes: wsDays(doubleElim('series')), champion: null }));
    if (p.mcws) fixWsDays(season, p.mcws);
    if (p.mcws) advanceEvent(season, p.mcws, { type: 'mcws', week: W.mcws, name: wsName });
  }

  // Phase and champion follow from the stages.
  const finalEv = cfg.wsSize === 8 ? p.mcwsFinals : p.mcws;
  const champ = finalEv?.champion || null;
  const wasComplete = season.phase === 'complete';
  p.champion = champ;
  p.runnerUp = champ ? runnerUp(finalEv) : null;
  season.phase = champ ? 'complete' : (p.mcws || p.mcwsBrackets) ? 'mcws' : p.supers ? 'supers' : 'regionals';
  if (champ && (!wasComplete || !season.polls.final)) season.polls.final = generatePoll(season, 'final', { final: true, postBonus: postseasonBonus(season) });
  if (!champ && season.polls.final) delete season.polls.final;
}

// Teams in the WCWS (either format).
export function wsTeams(season) {
  const p = season.post || {};
  return p.mcws?.seeds || (p.mcwsBrackets || []).flatMap(ev => ev.seeds);
}

export function postseasonBonus(season) {
  const p = season.post, b = {};
  const add = (t, x) => { if (t) b[t] = Math.max(b[t] || 0, x); };
  for (const ev of Object.values(p.confT || {})) add(ev.champion, 0.3);
  for (const ev of p.regionals || []) { for (const t of ev.seeds) add(t, 0.6); add(ev.champion, 2); }
  for (const ev of p.supers || []) { for (const t of ev.seeds) add(t, 2); }
  for (const t of wsTeams(season)) add(t, 5);
  for (const ev of p.mcwsBrackets || []) add(ev.champion, 7);
  add(p.runnerUp, 8); add(p.champion, 10);
  return b;
}

// How far each team got (for team pages and history).
// Final WCWS places for a finished season: { team: { place, tied } }.
// Champion 1st, runner-up 2nd; everyone else by the round they went out in
// (teams knocked out in the same round tie, e.g. T-3rd in an 8-team WCWS).
const ELIM_ROUND = { G6: 3, G7: 3, G5: 2, G3: 1 };
export function mcwsPlaces(season) {
  const p = season.post || {}, out = {};
  const teams = wsTeams(season);
  if (!p.champion || !teams.length) return out;
  out[p.champion] = { place: 1, tied: false };
  if (p.runnerUp) out[p.runnerUp] = { place: 2, tied: false };
  const ws = season.games.filter(g => g.type === 'mcws' && isFinal(g)).sort((a, b) => a.week - b.week || a.order - b.order || a.id - b.id);
  const round = {};
  for (const t of teams) {
    if (out[t]) continue;
    const lost = ws.filter(g => loserOf(g) === t);
    round[t] = ELIM_ROUND[lost[lost.length - 1]?.node] ?? 0;
  }
  const others = Object.keys(round);
  for (const t of others) {
    const better = others.filter(o => round[o] > round[t]).length;
    out[t] = { place: 3 + better, tied: others.filter(o => round[o] === round[t]).length > 1 };
  }
  return out;
}
// A team's WCWS history before `year`: appearances, last one, best finish
// (and the years it came), and wins and losses in WCWS games.
export function mcwsHistory(league, team, year) {
  const h = { apps: 0, last: null, best: null, bestYears: [], w: 0, l: 0 };
  for (const [y, se] of Object.entries(league.seasons).map(([y, se]) => [Number(y), se]).sort((a, b) => a[0] - b[0])) {
    if (y >= year || !wsTeams(se).includes(team)) continue;
    h.apps++; h.last = y;
    for (const g of se.games) if (g.type === 'mcws' && isFinal(g) && (g.home === team || g.away === team)) winnerOf(g) === team ? h.w++ : h.l++;
    const pl = mcwsPlaces(se)[team];
    if (!pl) continue;
    if (!h.best || pl.place < h.best.place) { h.best = pl; h.bestYears = [y]; }
    else if (pl.place === h.best.place) h.bestYears.push(y);
  }
  return h;
}

export function postseasonFinish(season, team) {
  const p = season.post || {};
  if (p.champion === team) return 'National champion';
  if (p.runnerUp === team) return 'National runner-up';
  if (wsTeams(season).includes(team)) return 'WCWS';
  if (p.supers?.some(ev => ev.seeds.includes(team))) return 'Super Regional';
  const reg = p.regionals?.find(ev => ev.seeds.includes(team));
  if (reg) return reg.champion === team ? 'Regional champion' : 'NCAA Regional';
  return null;
}

// Where a team's postseason ended, for team and coach histories:
// { text, tab, ev } where tab/ev point at the bracket on the Postseason page.
// "UCLA Regional · out in Game 5", "Oregon Super Regional · lost series 1-2".
export function postseasonDetail(season, team) {
  const p = season.post || {};
  const finish = postseasonFinish(season, team);
  if (!finish) return null;
  const gamesIn = ev => season.games.filter(g => g.event === ev.id && (g.home === team || g.away === team) && isFinal(g));
  const lastLoss = evs => {
    const gs = evs.flatMap(ev => gamesIn(ev).map(g => ({ g, ev }))).filter(x => loserOf(x.g) === team);
    gs.sort((a, b) => a.g.week - b.g.week || a.g.order - b.g.order || a.g.id - b.g.id);
    return gs[gs.length - 1] || null;
  };
  const roundOf = x => (nodeOf(x.ev, x.g.node)?.label || '').replace(/ \(.*\)$/, '');
  const seriesScore = ev => { const gs = gamesIn(ev); const w = gs.filter(g => winnerOf(g) === team).length; return `${w}-${gs.length - w}`; };
  const wsEvents = [...(p.mcwsBrackets || []), ...(p.mcwsFinals ? [p.mcwsFinals] : []), ...(p.mcws ? [p.mcws] : [])];
  const wsName = season.settings?.mcwsName || "Women's College World Series";
  if (finish === 'National champion') return { text: 'National champion', tab: 'mcws', ev: null };
  if (finish === 'National runner-up') {
    const fin = p.mcwsFinals || p.mcws;
    return { text: `National runner-up${fin ? ` · lost Championship Series ${seriesScoreFinals(season, fin, team)}` : ''}`, tab: 'mcws', ev: null };
  }
  if (finish === 'WCWS') {
    // Short of the final, double elimination: out after a second loss.
    const bracketEvs = wsEvents.filter(ev => ev.kind !== 'series');
    const losses = bracketEvs.flatMap(ev => gamesIn(ev).filter(g => loserOf(g) === team && !/^F\d/.test(g.node || '')));
    const x = losses.length >= 2 ? lastLoss(bracketEvs) : null;
    const where = x && x.ev.bracket ? `${x.ev.name}, ` : '';
    return { text: `${wsName}${x ? ` · out in ${where}${roundOf(x)}` : ''}`, tab: 'mcws', ev: null };
  }
  if (finish === 'Super Regional') {
    const ev = p.supers.find(e => e.seeds.includes(team));
    return { text: `${ev.name}${ev.champion && ev.champion !== team ? ` · lost series ${seriesScore(ev)}` : ''}`, tab: 'supers', ev: ev.id };
  }
  const ev = p.regionals.find(e => e.seeds.includes(team));
  if (ev.champion === team) return { text: `${ev.name} champion`, tab: 'regionals', ev: ev.id };
  if (!ev.champion) return { text: ev.name, tab: 'regionals', ev: ev.id };
  if (ev.kind === 'series') return { text: `${ev.name} · lost series ${seriesScore(ev)}`, tab: 'regionals', ev: ev.id };
  const x = lastLoss([ev]);
  return { text: `${ev.name}${x ? ` · out in ${roundOf(x)}` : ''}`, tab: 'regionals', ev: ev.id };
}
function seriesScoreFinals(season, ev, team) {
  const gs = season.games.filter(g => g.event === ev.id && isFinal(g) && (g.home === team || g.away === team) && (ev.kind === 'series' || /^F\d/.test(g.node || '')));
  const w = gs.filter(g => winnerOf(g) === team).length;
  return `${w}-${gs.length - w}`;
}

export function allEvents(season) {
  const p = season.post || {};
  return [...Object.values(p.confT || {}), ...(p.regionals || []), ...(p.supers || []), ...(p.mcws ? [p.mcws] : []), ...(p.mcwsBrackets || []), ...(p.mcwsFinals ? [p.mcwsFinals] : [])];
}

// The two teams a bracket node will have (null where still undecided).
export function nodeTeams(ev, node) {
  const f = ref => { const t = resolve(ev, ref); return t === BYE ? 'BYE' : t; };
  return [f(node.a), f(node.b)];
}
export function nodeNeeded(ev, node) { return !node.cond || condMet(ev, node); }

// "Winner of SF-1" style text for an undecided slot.
export function refLabel(ev, ref) {
  if (!ref || 'seed' in ref) return null;
  const n = nodeOf(ev, ref.w || ref.l);
  return `${ref.w ? 'Winner' : 'Loser'} of ${n?.code || n?.key || '?'}`;
}

// Change a conference tournament's format before it starts.
export function setConfFormat(season, conf, kind) {
  season.settings.confFormat ||= {};
  season.settings.confFormat[conf] = kind;
  const ev = season.post?.confT?.[conf];
  if (!ev) return;
  const ids = new Set(ev.nodes.map(n => n.gameId).filter(Boolean));
  if (season.games.some(g => ids.has(g.id) && isFinal(g))) throw new Error('That tournament has already started.');
  season.games = season.games.filter(g => !ids.has(g.id));
  ev.kind = confKind(kind, ev.size);
  ev.nodes = buildConfNodes(ev.kind, ev.size);
  ev.champion = null;
}
