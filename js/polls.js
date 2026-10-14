// Generated Top-N poll (15 by default; Settings changes the size). A fixed
// panel of 23 voters fills out ballots. Every voter starts from the same
// picture, built the way the CFB dynasty's poll is: team strength (power
// ratings from game scores, starting from OFF/PIT/DEF) blended with a
// season-long résumé (every win, worth more against strong teams; every
// loss, costing less against strong teams), with the résumé counting more
// as games are played. Each voter then
// leans a little according to a built-in personality: some trust talent,
// some trust numbers, some punish bad losses, some watch one conference
// closely. The leans are small, so the poll stays close to a consensus.
// Personalities live here in the code and aren't editable in the app.
// The commissioner can still edit any published poll.

import { rng, normal, hashStr, clamp } from './util.js?v=20261014163557';
import { records, rpi, isFinal, winnerOf } from './standings.js?v=20261014163557';

export const DEFAULT_POLL_SIZE = 25;
export const POLL_SIZES = [10, 15, 20, 25];
export const pollSizeOf = season => season?.settings?.pollSize ?? DEFAULT_POLL_SIZE;

// talent:  >0 keeps trusting rosters longer, <0 moves to the résumé sooner
// rpi:     share of the résumé from RPI (the rest is win-loss record)
// sos:     extra credit for a tough schedule
// loyalty: how much last week's ranking carries over (1 = consensus)
// recency: reaction to this week's results
// losses:  penalty for losing to teams outside last week's poll
// region:  the conference (by position in the league) this voter covers, with a small boost
// noise:   how much this voter's ballot wanders week to week
const P = (o) => ({ talent: 0, rpi: 0.5, sos: 0, loyalty: 1, recency: 0, losses: 0, region: null, regionBoost: 0, noise: 0.1, ...o });
export const VOTER_PANEL = [
  { id: 'v1', name: 'Hank Dobbins', outlet: 'Plains Ledger', style: 'Old school. Trusts proven programs and is slow to move teams.', ...P({ talent: 0.25, loyalty: 1.35, noise: 0.08 }) },
  { id: 'v2', name: 'Priya Raman', outlet: 'Diamond Analytics', style: 'Numbers first. Leans on the RPI and strength of schedule.', ...P({ talent: -0.2, rpi: 0.75, sos: 0.14, loyalty: 0.85 }) },
  { id: 'v3', name: 'Marcus Bell', outlet: 'Gulf Coast Gazette', style: 'Regional voter. Gives the {conf} a little extra credit.', ...P({ region: 0, regionBoost: 0.09 }) },
  { id: 'v4', name: 'Lena Kowalski', outlet: 'Great Lakes Sports Radio', style: 'Regional voter. Watches the {conf} closely.', ...P({ region: 1, regionBoost: 0.08 }) },
  { id: 'v5', name: 'Tom Whitfield', outlet: 'Desert Sun', style: 'Regional voter. Sees a lot of the {conf}.', ...P({ region: 2, regionBoost: 0.08 }) },
  { id: 'v6', name: 'Carla Mendes', outlet: 'National Wire', style: 'Middle of the road. Her ballot tracks the consensus.', ...P({ noise: 0.05 }) },
  { id: 'v7', name: 'Jake Orr', outlet: 'Grandstand Report', style: 'Reacts to last week. Big weeks move teams up fast.', ...P({ recency: 0.2, loyalty: 0.7, noise: 0.12 }) },
  { id: 'v8', name: 'Dana Pruitt', outlet: 'Heartland Herald', style: 'Punishes bad losses.', ...P({ losses: 0.12 }) },
  { id: 'v9', name: 'Russ Kemper', outlet: 'The Dugout Daily', style: 'Win-loss record above all.', ...P({ talent: -0.15, rpi: 0.25 }) },
  { id: 'v10', name: 'Mei Chen', outlet: 'Pacific Sports Journal', style: 'Rewards teams that play tough schedules.', ...P({ sos: 0.15, rpi: 0.6 }) },
  { id: 'v11', name: 'Gil Navarro', outlet: 'Fastpitch Insider', style: 'Talent evaluator. Ranks the best rosters, records aside.', ...P({ talent: 0.3, loyalty: 1.1 }) },
  { id: 'v12', name: 'Beth Abernathy', outlet: 'Mountain West Times', style: 'Steady. Rarely moves a team more than a spot or two.', ...P({ loyalty: 1.4, noise: 0.06 }) },
  { id: 'v13', name: 'Omar Haddad', outlet: 'Riverfront Press', style: 'Wildcard. His ballot is the hardest to predict.', ...P({ noise: 0.2 }) },
  { id: 'v14', name: 'Sully Grant', outlet: 'Hot Corner Podcast', style: 'Likes hot teams. Streaks and big weeks count.', ...P({ recency: 0.15, loyalty: 0.85 }) },
  { id: 'v15', name: 'Nora Lindqvist', outlet: 'North Star Tribune', style: 'Balanced and careful. Close to the consensus.', ...P({ noise: 0.07 }) },
  { id: 'v16', name: 'Pete Varga', outlet: 'Lakeshore Courier', style: 'Regional voter. Gives the {conf} the benefit of the doubt.', ...P({ region: 3, regionBoost: 0.09 }) },
  { id: 'v17', name: 'Alicia Brooks', outlet: 'Box Score Weekly', style: 'Leans on the RPI more than most.', ...P({ talent: -0.1, rpi: 0.68 }) },
  { id: 'v18', name: 'Ray Thibodeaux', outlet: 'Bayou Sports', style: 'Old school, and hard on teams that lose to unranked opponents.', ...P({ talent: 0.15, losses: 0.1, loyalty: 1.15 }) },
  { id: 'v19', name: 'Kim Sato', outlet: 'Collegiate Softball Today', style: 'Consensus voter. Rarely far from the field.', ...P({ noise: 0.05 }) },
  { id: 'v20', name: 'Walt Hensley', outlet: 'Valley Voice', style: 'Loyal to his preseason picks.', ...P({ talent: 0.2, loyalty: 1.3 }) },
  { id: 'v21', name: 'Jess Moreno', outlet: 'Southwest Sports Network', style: 'Résumé voter. Moves to results early in the season.', ...P({ talent: -0.25, rpi: 0.45 }) },
  { id: 'v22', name: 'Dev Patel', outlet: 'Ratings Lab', style: 'Schedule strength and RPI, with little attention to preseason hype.', ...P({ talent: -0.15, rpi: 0.7, sos: 0.12 }) },
  { id: 'v23', name: 'Frank Lacey', outlet: 'Coastal Chronicle', style: 'Regional voter. Keeps a close eye on the {conf}.', ...P({ region: 4, regionBoost: 0.08 }) },
];
export const VOTERS = VOTER_PANEL.length;

// The conference a regional voter covers this season (by position, so it
// still works after conferences are renamed or added).
export function voterConference(season, v) {
  if (v.region == null) return null;
  const confs = [...new Set(Object.values(season.teams).map(t => t.conference))].sort();
  return confs.length ? confs[v.region % confs.length] : null;
}
export function voterStyle(season, v) {
  return v.style.replace('{conf}', voterConference(season, v) || 'their region');
}

function zmap(obj) {
  const v = Object.values(obj), n = v.length || 1;
  const m = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
  return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, (x - m) / sd]));
}

export function previousPoll(season, week) {
  const weeks = Object.keys(season.polls || {}).filter(k => k !== 'final').map(Number).filter(w => w < week).sort((a, b) => b - a);
  return weeks.length ? season.polls[weeks[0]] : season.carryPoll || null;
}

// ---------- the consensus: strength + résumé (as in the CFB dynasty) ----------

// Power ratings from game scores: runs_i vs j = avg + off_i - def_j (± home).
// Each team is pulled toward a prior from its OFF/PIT/DEF ratings by
// PRIOR_GAMES games' worth of evidence, so early ratings lean on the roster
// and later ones on this season's results. Units are runs per game.
const PRIOR_GAMES = 10, HOME_RUNS = 0.15, RUN_CAP = 10;
const priorOf = t => { const b = t.base || t; return { off: 0.1 * (b.off - 70), def: 0.13 * (0.67 * b.pit + 0.33 * b.def - 70) }; };
export function powerRatings(season, filter = null) {
  const teams = Object.keys(season.teams);
  const played = season.games.filter(g => isFinal(g) && season.teams[g.home] && season.teams[g.away] && (!filter || filter(g)));
  let tot = 0, c = 0;
  for (const g of played) { tot += Math.min(g.homeR, RUN_CAP) + Math.min(g.awayR, RUN_CAP); c += 2; }
  const avg = c ? tot / c : 4;
  const prior = Object.fromEntries(teams.map(t => [t, priorOf(season.teams[t])]));
  const off = {}, def = {}, n = {};
  for (const t of teams) { off[t] = prior[t].off; def[t] = prior[t].def; n[t] = 0; }
  for (const g of played) { n[g.home]++; n[g.away]++; }
  for (let it = 0; it < 40; it++) {
    const so = {}, sd = {};
    for (const t of teams) { so[t] = 0; sd[t] = 0; }
    for (const g of played) {
      const h = g.neutral ? 0 : HOME_RUNS / 2, hr = Math.min(g.homeR, RUN_CAP), ar = Math.min(g.awayR, RUN_CAP);
      so[g.home] += hr - avg - h + def[g.away]; so[g.away] += ar - avg + h + def[g.home];
      sd[g.away] += avg + off[g.home] + h - hr; sd[g.home] += avg + off[g.away] - h - ar;
    }
    for (const t of teams) { off[t] = (so[t] + PRIOR_GAMES * prior[t].off) / (n[t] + PRIOR_GAMES); def[t] = (sd[t] + PRIOR_GAMES * prior[t].def) / (n[t] + PRIOR_GAMES); }
  }
  return Object.fromEntries(teams.map(t => [t, { off: off[t], def: def[t], rating: off[t] + def[t], games: n[t] }]));
}

// Résumé: every win counts, more against a strong opponent; every loss costs,
// less against a strong opponent, but losses weigh as much as wins. Covers
// the whole season to date.
const INERTIA = 0.2;
const quality = r => Math.max(0, Math.min(2.5, (r + 1.5) / 2.5));
export function resumeScores(season, power, filter = null) {
  const out = Object.fromEntries(Object.keys(season.teams).map(t => [t, 0]));
  for (const g of season.games) {
    if (!isFinal(g) || (filter && !filter(g))) continue;
    const w = winnerOf(g), l = w === g.home ? g.away : g.home;
    const rw = power[w]?.rating ?? -2, rl = power[l]?.rating ?? -2;
    // A loss always costs at least half of the best possible win, so losing
    // a series never adds to a résumé (taking one of three from a top team
    // breaks even; against anyone else it hurts).
    if (w in out) out[w] += 1 + 1.6 * quality(rl);
    if (l in out) out[l] -= 2.5 + 0.6 * (2.5 - quality(rw));
  }
  return out;
}

// The pieces every voter looks at, through `week`.
function pollInputs(season, week) {
  const filter = g => g.week <= week;
  const recs = records(season, filter), r = rpi(season, filter);
  const teams = Object.keys(season.teams);
  const power = powerRatings(season, filter);
  const res = resumeScores(season, power, filter);
  const zP = zmap(Object.fromEntries(teams.map(t => [t, power[t].rating])));
  const zQ = zmap(res);
  const zR = zmap(Object.fromEntries(teams.map(t => [t, r[t].rpi])));
  const zS = zmap(Object.fromEntries(teams.map(t => [t, r[t].sos || 0])));
  const played = teams.reduce((n, t) => n + recs[t].w + recs[t].l, 0) / (teams.length || 1);
  // Strength carries most of the weight early, résumé more as games are played.
  const strengthW = Math.max(0.35, 0.7 - played * 0.015);
  return { teams, recs, r, power, res, zP, zQ, zR, zS, played, strengthW };
}

// Consensus strength-plus-résumé score.
export function teamScores(season, week, { postBonus = null } = {}) {
  const { teams, recs, r, zP, zQ, played, strengthW } = pollInputs(season, week);
  const out = {};
  for (const t of teams) out[t] = strengthW * zP[t] + (1 - strengthW) * (played ? zQ[t] : 0) + (postBonus?.[t] || 0);
  return { scores: out, recs, rpi: r };
}

export function generatePoll(season, week, { final = false, postBonus = null } = {}) {
  const size = pollSizeOf(season);
  const wk = final ? 99 : week;
  const inp = pollInputs(season, wk);
  const { teams, recs, zP, zQ, zR, zS, played, strengthW } = inp;
  const prev = final ? season.polls?.[Math.max(...Object.keys(season.polls).filter(k => k !== 'final').map(Number))] : previousPoll(season, week);
  const prevRank = {};
  prev?.ranks.forEach((x, i) => { prevRank[x.team] = i + 1; });
  const prevSize = prev?.ranks.length || size;

  // This week's results, for the voters who react to them.
  const weekNet = {}, badLosses = {};
  for (const t of teams) { weekNet[t] = 0; badLosses[t] = 0; }
  if (!final && week > 0) {
    for (const g of season.games) {
      if (g.week !== week || !isFinal(g)) continue;
      const w = winnerOf(g), l = w === g.home ? g.away : g.home;
      if (weekNet[w] !== undefined) weekNet[w]++;
      if (weekNet[l] !== undefined) { weekNet[l]--; if (!prevRank[w]) badLosses[l]++; }
    }
  }
  const zWeek = zmap(weekNet);
  const weekW = {}, weekL = {};
  if (!final && week > 0) for (const g of season.games) {
    if (g.week !== week || !isFinal(g)) continue;
    const w = winnerOf(g), l = w === g.home ? g.away : g.home;
    weekW[w] = (weekW[w] || 0) + 1; weekL[l] = (weekL[l] || 0) + 1;
  }

  const pts = {}, fp = {}, ballots = {};
  for (const v of VOTER_PANEL) {
    const vconf = voterConference(season, v);
    const noise = rng(hashStr(`${v.id}|${season.year}|${final ? 'final' : week}`));
    // Personality: how much strength vs résumé, and how much of the résumé is RPI.
    const sw = clamp(strengthW + v.talent * 0.3, 0.2, 0.92);
    const rpiMix = clamp(v.rpi - 0.35, 0, 0.5);
    const full = teams.map(t => {
      const resume = played ? (1 - rpiMix) * zQ[t] + rpiMix * zR[t] : 0;
      let sc = sw * zP[t] + (1 - sw) * resume;
      sc += v.sos * zS[t] * Math.min(1, played / 20);
      // Voters remember last week's poll a little (loyal ones more).
      if (prevRank[t]) sc += INERTIA * v.loyalty * (prevSize + 1 - prevRank[t]) / prevSize;
      sc += v.recency * zWeek[t];
      sc -= v.losses * badLosses[t];
      if (vconf && season.teams[t].conference === vconf) sc += v.regionBoost;
      sc += postBonus?.[t] || 0;
      sc += normal(noise) * v.noise;
      return [t, sc];
    }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    // No voter moves a ranked team up after a losing week.
    const ballot = holdLosers(full, prevRank, weekW, weekL).slice(0, size);
    ballots[v.id] = ballot;
    ballot.forEach((t, i) => { pts[t] = (pts[t] || 0) + size - i; if (i === 0) fp[t] = (fp[t] || 0) + 1; });
  }
  // Ties in points go to the consensus score.
  const cons = teamScores(season, wk, { postBonus }).scores;
  let order = holdLosers(Object.keys(pts).sort((a, b) => pts[b] - pts[a] || cons[b] - cons[a]), prevRank, weekW, weekL);
  for (let i = 1; i < order.length; i++) if (pts[order[i]] > pts[order[i - 1]]) pts[order[i]] = pts[order[i - 1]];
  // The champion is the unanimous #1 in the final poll.
  if (final && season.post?.champion) {
    const c = season.post.champion;
    order = [c, ...order.filter(t => t !== c)];
    pts[c] = VOTERS * size; fp[c] = VOTERS;
    for (const t of Object.keys(fp)) if (t !== c) fp[t] = 0;
    for (const id of Object.keys(ballots)) ballots[id] = [c, ...ballots[id].filter(t => t !== c)].slice(0, size);
  }
  const rec = t => `${recs[t].w}-${recs[t].l}`;
  return {
    week: final ? 'final' : week, voters: VOTERS, size, edited: false, ballots,
    ranks: order.slice(0, size).map(t => ({ team: t, pts: pts[t], fp: fp[t] || 0, record: rec(t) })),
    others: order.slice(size).filter(t => pts[t] > 0).map(t => ({ team: t, pts: pts[t], record: rec(t) })),
  };
}

// A team ranked last week that lost more games than it won this week can't
// be placed above its old spot; it's moved back down to it.
// A ranked team that won every game it played this week can't drop.
function holdLosers(order, prevRank, weekW, weekL) {
  const list = [...order];
  const losers = Object.keys(prevRank).filter(t => (weekL[t] || 0) > (weekW[t] || 0)).sort((a, b) => prevRank[a] - prevRank[b]);
  const unbeaten = Object.keys(prevRank).filter(t => (weekW[t] || 0) > 0 && !weekL[t]).sort((a, b) => prevRank[a] - prevRank[b]);
  // Moving one team shifts the others, so repeat until every rule holds.
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (const t of losers) {
      const i = list.indexOf(t), floor = prevRank[t] - 1;
      if (i >= 0 && i < floor) { list.splice(i, 1); list.splice(floor, 0, t); moved = true; }
    }
    for (const t of unbeaten) {
      const i = list.indexOf(t), ceil = prevRank[t] - 1;
      if (i > ceil) { list.splice(i, 1); list.splice(ceil, 0, t); moved = true; }
    }
    if (!moved) break;
  }
  return list;
}

// A week's poll comes out once all of that week's games are final.
export function weekComplete(season, week) {
  const gs = season.games.filter(g => g.week === week);
  return gs.length > 0 && gs.every(isFinal);
}

// Release any polls that are now due. Returns the weeks released.
export function releaseDuePolls(season, lastPollWeek) {
  const released = [];
  season.polls ||= {};
  for (let w = 1; w <= lastPollWeek; w++) {
    if (season.polls[w]) continue;
    if (!weekComplete(season, w)) break;
    season.polls[w] = generatePoll(season, w);
    released.push(w);
  }
  return released;
}

export function latestPoll(season) {
  if (season.polls?.final) return season.polls.final;
  const weeks = Object.keys(season.polls || {}).filter(k => k !== 'final').map(Number);
  return weeks.length ? season.polls[Math.max(...weeks)] : null;
}

export function pollRankMap(poll) {
  const m = {};
  poll?.ranks.forEach((x, i) => { m[x.team] = i + 1; });
  return m;
}
