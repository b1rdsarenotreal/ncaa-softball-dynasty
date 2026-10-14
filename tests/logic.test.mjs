import { confWeeksFor } from '../js/schedule.js';
// Logic tests: run with `node tests/logic.test.mjs`
import assert from 'node:assert/strict';
import { estimateHE, backfillHitsErrors, applyResult, afterChange, newSeason, pointsLeft } from '../js/league.js';
import { newLeague, currentSeason, simGames, startNextSeason, addTeam, addConference, renameTeam, beginOffseason, draftRemoveTeam, draftWarnings, coachName, weekName, hireCoach, newCoach, availableCoaches } from '../js/league.js';
import { bracketology, selectionBoard, setAtLarge, confirmField, mcwsPlaces, mcwsHistory, setConfHost, shownSeed, setConfFormat, postWeeks, wsTeams, ncaaProblems, fieldSize } from '../js/postseason.js';
import { records, rpi, confStandings, isFinal, regSeasonChamps, regSeasonChamp, quadrants } from '../js/standings.js';

const t0 = Date.now();
const league = newLeague();
const s = currentSeason(league);
assert.equal(Object.keys(s.teams).length, 300);

// Schedule shape: 12 weeks, weekend series, two-game midweek sets
assert.equal(s.regWeeks, 12);
const reg = s.games.filter(g => g.type === 'regular');
assert.equal(Math.max(...reg.map(g => g.week)), 12);
assert.ok(reg.every(g => ['Fri', 'Sat', 'Sun', 'Tue', 'Wed', 'Thu'].includes(g.day)), 'games only on weekends, midweek and Thursdays');
// Conference rivals only meet in conference play; Thursday games are single
// games for teams without a weekend series, against another conference.
assert.ok(reg.every(g => g.confGame || s.teams[g.home].conference !== s.teams[g.away].conference), 'no non-conference games between conference rivals');
const thuGames = reg.filter(g => g.day === 'Thu');
assert.ok(thuGames.every(g => !g.series && !g.confGame), 'Thursday games are single non-conference games');
// Once a conference starts conference play, its teams play a conference series
// every weekend (or a Thursday game / weekend series in a bye week).
const confStart = {};
for (const g of reg.filter(g => g.confGame)) for (const t of [g.home, g.away]) confStart[t] = Math.min(confStart[t] ?? 99, g.week);
for (const [t, w0] of Object.entries(confStart)) {
  const byes = [];
  for (let w = w0; w <= 12; w++) if (!reg.some(g => g.week === w && g.day === 'Fri' && g.confGame && (g.home === t || g.away === t))) byes.push(w);
  assert.ok(byes.length <= 1, `${t} plays conference series every weekend once its conference play starts (${byes})`);
}
const lastConf = Object.values(s.teams).map(t => t.conference);
assert.ok(new Set(reg.filter(g => g.confGame && g.week === 12).flatMap(g => [s.teams[g.home].conference])).size === new Set(lastConf).size, 'every conference plays on the final weekend');
const mids = {};
for (const g of reg.filter(g => g.day === 'Tue' || g.day === 'Wed')) (mids[g.series] ||= []).push(g);
const midSets = Object.values(mids);
assert.ok(midSets.every(set => set.length === 2 && set[0].home === set[1].home && set[0].away === set[1].away), 'every midweek set is two games against one opponent');
const dh = midSets.filter(set => set.every(g => g.day === 'Tue')).length, split = midSets.filter(set => set.some(g => g.day === 'Wed')).length;
console.log(`midweek sets: ${dh} Tuesday doubleheaders, ${split} Tuesday/Wednesday`);
assert.ok(dh > 15 && split > 15, 'a mix of doubleheaders and Tue/Wed sets');
const per = {};
for (const g of reg) { per[g.home] = (per[g.home] || 0) + 1; per[g.away] = (per[g.away] || 0) + 1; assert.notEqual(g.home, g.away); }
const counts = Object.values(per);
const hist={}; counts.forEach(c=>hist[c]=(hist[c]||0)+1); console.log('games-per-team histogram', JSON.stringify(hist));
console.log('games per team', Math.min(...counts), '-', Math.max(...counts), 'total', reg.length);
assert.ok(Math.min(...counts) >= 46 && Math.max(...counts) <= 52, 'about 48-52 games per team');
assert.ok(counts.filter(c => c >= 48).length >= counts.length - 2, 'nearly every team plays 48-52');
assert.ok(!reg.some(g => (g.day === 'Tue' || g.day === 'Wed') && (g.week < 4 || g.week === 12)), 'midweek games run weeks 4-11');
for (const conf of ['Southern', 'Mountain West', 'Big South']) {
  const teams = Object.values(s.teams).filter(t => t.conference === conf).map(t => t.school);
  for (const t of teams) {
    const opps = new Set(reg.filter(g => g.confGame && (g.home === t || g.away === t)).map(g => (g.home === t ? g.away : g.home)));
    assert.equal(opps.size, teams.length - 1, `${t} plays everyone in the ${conf}`);
  }
}
// No team plays twice on the same day
const slot = new Set();
for (const g of reg) for (const t of [g.home, g.away]) { const k = `${t}|${g.week}|${g.day}|${g.order}`; assert.ok(!slot.has(k), k); slot.add(k); }
for (const g of reg) for (const t of [g.home, g.away]) assert.ok(!reg.some(x => x !== g && x.week === g.week && x.day === g.day && !x.series !== !g.series && (x.home === t || x.away === t) && x.series !== g.series), 'one opponent per day');

// Conference play is never longer than 9 weeks; size sets the start.
assert.equal(confWeeksFor(12, 11), 9); assert.equal(confWeeksFor(12, 9), 9); assert.equal(confWeeksFor(12, 5), 8); assert.equal(confWeeksFor(14, 13), 9);
// Bracketology: a full projected field with one bid per conference, even before league play.
{
  const B = bracketology(s);
  assert.equal(B.field.length, 64); assert.equal(B.regionals.length, 16);
  assert.ok(Object.values(B.autos).every(Boolean), 'every conference has a projected bid');
  assert.ok(Object.values(B.autos).every(t => B.field.some(f => f.team === t)), 'projected bids are in the field');
  assert.equal(s.post?.field, undefined, 'bracketology saves nothing');
}
// Hand-entered scores: hits and errors estimated from the line and ratings
{
  const g = reg.find(x => !isFinal(x));
  const e = estimateHE(s, g, [0, 2, 0, 0, 1, 0, null], [1, 0, 0, 0, 0, 1, 0]);
  assert.ok(e.home.H >= 2 && e.away.H >= 1 && e.home.H < 15, 'estimated hits fit the runs');
  applyResult(g, { homeLine: [0, 0, 0, 0, 0, 0, 0, 1], awayLine: [0, 0, 0, 0, 0, 0, 0, 0], home: { R: 1, H: 0, E: 0 }, away: { R: 0, H: 0, E: 0 } }, 'manual');
  assert.equal(backfillHitsErrors(s), 1, 'backfill finds the game with no hits or errors');
  assert.ok(g.homeH + g.homeE + g.awayE >= 0 && g.heEstimated);
  g.final = false; g.homeR = g.awayR = null; g.homeLine = []; g.awayLine = []; g.source = null; delete g.heEstimated;
}
// Conference tiebreakers: pct, head-to-head (restarting for teams still
// tied), common opponents from the top down, RPI, coin flip.
{
  const teams = {};
  for (const t of 'ABCDE') teams[t] = { school: t, conference: 'X' };
  for (const t of 'FG') teams[t] = { school: t, conference: 'Y' };
  const games = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['A', 'D'], ['D', 'B'], ['D', 'C'], ['E', 'A'], ['B', 'E'], ['C', 'E']]
    .map(([w, l], i) => ({ id: i, type: 'regular', confGame: true, final: true, week: 1, order: i, home: w, away: l, homeR: 2, awayR: 1 }));
  const mini = { year: 2030, teams, games };
  const st = confStandings(mini, 'X', records(mini), rpi(mini));
  assert.deepEqual(st.map(x => x.team), ['D', 'A', 'B', 'C', 'E'], 'three-way tie: common opponent D breaks it, then B beats C head-to-head');
  assert.equal(st[1].tb.step, 'common'); assert.equal(st[2].tb.step, 'h2h'); assert.equal(st[3].tb.step, 'h2h'); assert.equal(st[0].tb, null);
  const y = confStandings(mini, 'Y', records(mini), rpi(mini));
  assert.ok(y.every(x => x.tb.step === 'coin'), 'nothing else separates them: coin flip');
  assert.deepEqual(confStandings(mini, 'Y', records(mini), rpi(mini)).map(x => x.team), y.map(x => x.team), 'the coin flip is the same every time');
  // A tie at the top: both teams share the regular-season title; the
  // tiebreaker winner is the top seed.
  teams.H = { school: 'H', conference: 'Z' }; teams.I = { school: 'I', conference: 'Z' }; teams.J = { school: 'J', conference: 'Z' };
  games.push(...[['H', 'I'], ['I', 'H'], ['H', 'J'], ['I', 'J']].map(([w, l], i) => ({ id: 100 + i, type: 'regular', confGame: true, final: true, week: 2, order: i, home: w, away: l, homeR: 3, awayR: 1 })));
  const zc = regSeasonChamps(mini, 'Z');
  assert.deepEqual([...zc].sort(), ['H', 'I'], 'tied teams share the regular-season title');
  assert.equal(regSeasonChamp(mini, 'Z', records(mini, g => g.type === 'regular'), rpi(mini, g => g.type === 'regular')), confStandings(mini, 'Z', records(mini), rpi(mini))[0].team, 'the tiebreaker winner is the top seed');
  mini.overrides = { regChamps: { Z: 'I' } };
  assert.deepEqual(regSeasonChamps(mini, 'Z'), ['I'], 'a commissioner override names one champion');
}
// Only regional hosts show a national seed.
{
  const fake = { settings: { ncaa: { regionals: 4, perRegional: 4, wsSize: 4 } }, post: { field: Array.from({ length: 16 }, (_, i) => ({ team: 'T' + i, seed: i + 1 })) } };
  assert.equal(shownSeed(fake, 'T3'), 4); assert.equal(shownSeed(fake, 'T4'), null);
}
assert.ok(s.polls[0].ranks.length === 25, 'preseason poll is a Top 25');
assert.equal(Object.keys(s.polls[0].ballots).length, 23, '23 voters each turn in a ballot');
assert.ok(Object.values(s.polls[0].ballots).every(b => b.length === 25 && new Set(b).size === 25));

// Double elimination for the Big Ten (8 teams) and Horizon (top 6), single elsewhere
s.settings.confFormat = { 'Mountain West': 'double', 'Southern': 'double' };
s.settings.confTourney = { 'Mountain West': 8 };
const pre = Object.fromEntries(Object.entries(s.teams).map(([k, t]) => [k, { ...t.base }]));

// Full season, stopping after the conference tournaments to check them
simGames(s, g => g.type === 'regular' || g.type === 'conf');
for (const [conf, ev] of Object.entries(s.post.confT)) {
  const gs = s.games.filter(g => g.event === ev.id);
  const titles = gs.filter(g => /Championship$|· Final$/.test(g.label));
  assert.equal(titles.length, 1, `${conf}: exactly one championship game`);
  assert.ok(!gs.some(g => /if necessary/i.test(g.label)), `${conf}: no if-necessary game`);
  const losses = {};
  for (const g of gs) { const l = g.homeR > g.awayR ? g.away : g.home; losses[l] = (losses[l] || 0) + 1; }
  if (ev.kind === 'double') {
    // Everyone but the champion and the title-game loser is out after two losses; nobody loses three times.
    assert.ok(Object.values(losses).every(n => n <= 2), `${conf}: no team loses three times`);
    const nonChampLosses = Object.entries(losses).filter(([t]) => t !== ev.champion);
    assert.ok(nonChampLosses.length >= ev.size - 1, `${conf}: every other team lost`);
  }
  // Tournament host: a school in the conference; the host is at home, every other game is at its site (neutral).
  assert.equal(s.teams[ev.host]?.conference, conf, `${conf}: host is in the conference`);
  for (const g of gs) assert.ok((g.home === ev.host || g.away === ev.host) ? (!g.neutral && g.home === ev.host) : g.neutral, `${conf}: game site follows the host`);
  console.log(`${conf} (${ev.kind}, ${ev.size} teams): ${gs.length} games, champion ${ev.champion}, at ${ev.host}`);
}
assert.equal(s.post.confT['Mountain West'].kind, 'double');
assert.equal(s.post.confT['Mountain West'].size, 8);
assert.equal(s.post.confT['West Coast'].kind, 'single');
assert.throws(() => setConfFormat(s, 'West Coast', 'double'), /already started/);
// Selection: automatic qualifiers fixed, at-large picks, confirm, then seeds.
{
  assert.equal(s.phase, 'selection');
  const B = selectionBoard(s);
  assert.equal(B.autos.length + B.spots, 64); assert.equal(B.board.length, Math.min(B.spots + 10, B.order.length - B.autos.length - B.ineligible.length));
  for (const t of B.board) { const rr = records(s)[t]; assert.ok(rr.w >= rr.l || B.fill.includes(t), `${t} below .500 on the at-large board`); }
  assert.equal(s.post.fieldConfirmed, false);
  const out = B.chosen[B.chosen.length - 1], inn = B.board.find(t => !B.chosen.includes(t));
  assert.throws(() => setAtLarge(s, inn, true), /spots are taken/);
  assert.throws(() => setAtLarge(s, B.autos[0], false), /automatic qualifier/);
  setAtLarge(s, out, false);
  assert.throws(() => confirmField(s), /Pick/);
  setAtLarge(s, inn, true);
  assert.ok(s.post.field.some(f => f.team === inn) && !s.post.field.some(f => f.team === out));
  assert.deepEqual(s.post.field.map(f => f.seed), Array.from({ length: 64 }, (_, i) => i + 1));
  confirmField(s); assert.ok(s.post.fieldConfirmed);
  assert.throws(() => setAtLarge(s, out, true), /Unlock/);
  const Q = quadrants(s);
  const q1 = Object.values(Q).filter(x => x.q === 1).length;
  assert.equal(q1, 30, 'a home game counts as Q1 against the RPI top 30');
  { const { quadOf, gameLocation, quadScore } = await import('../js/standings.js');
    assert.deepEqual([quadOf(30, 'home'), quadOf(31, 'home'), quadOf(50, 'neutral'), quadOf(75, 'away'), quadOf(76, 'away'), quadOf(240, 'away'), quadOf(241, 'away')], [1, 2, 1, 1, 2, 3, 4]);
    assert.equal(gameLocation({ home: 'A', away: 'B' }, 'B'), 'away');
    assert.equal(gameLocation({ home: 'A', away: 'B', neutral: true }, 'A'), 'neutral');
    assert.equal(gameLocation({ home: 'A', away: 'B', neutral: true, site: 'B' }, 'B'), 'home', "playing at your own field counts as home");
    assert.ok(quadScore({ rec: [{ w: 1, l: 0 }, { w: 0, l: 0 }, { w: 0, l: 0 }, { w: 0, l: 0 }] }) > quadScore({ rec: [{ w: 0, l: 0 }, { w: 0, l: 0 }, { w: 0, l: 0 }, { w: 4, l: 1 }] }), 'a Q1 win beats piling up Q4 wins with a Q4 loss');
    // Committee order follows RPI most of all
    const { committeeOrder } = await import('../js/postseason.js');
    const ord = committeeOrder(s), r = rpi(s);
    const avgGap = ord.slice(0, 64).reduce((a, t, i) => a + Math.abs(r[t].rank - (i + 1)), 0) / 64;
    console.log('committee order vs RPI rank, top 64: average gap', avgGap.toFixed(1));
    assert.ok(avgGap < 8, 'committee order stays close to the RPI'); }
  for (const t of Object.keys(s.teams)) { const g = Q[t].rec.reduce((n, x) => n + x.w + x.l, 0); assert.equal(g, s.games.filter(x => isFinal(x) && (x.home === t || x.away === t)).length, 'quadrant records cover every game'); }
}
simGames(s, undefined, { autoLock: true });
// Regionals keep their if-necessary Game 7 structure
for (const ev of s.post.regionals) assert.ok(ev.nodes.some(n => n.key === 'G7'), 'regional still has Game 7');
// "If necessary" games flip home and away from the final they follow (any season so far).
{
  let checked = 0;
  for (const se of Object.values(league.seasons)) for (const ev of [...(se.post?.regionals || []), ...(se.post?.mcwsBrackets || []), ...(se.post?.mcws ? [se.post.mcws] : [])]) {
    const gm = k => se.games.find(g => g.event === ev.id && g.node === k);
    const f = gm('G6') || gm('CH'), x = gm('G7') || gm('IF');
    if (f && x) { checked++; assert.ok(x.home === f.away && x.away === f.home, `${ev.name || ev.id}: if-necessary game flips home and away`); if (ev.host && (x.home === ev.host || x.away === ev.host)) assert.equal(x.site || x.home, ev.host, 'still at the host'); }
  }
  console.log('if-necessary games checked:', checked);
}
// Regional weekend: Fri G1-G2, Sat G3-G5, Sun final and if-necessary game (after the final).
for (const ev of s.post.regionals) {
  const day = Object.fromEntries(ev.nodes.map(n => [n.key, n.day]));
  assert.deepEqual(day, { G1: 'Fri', G2: 'Fri', G3: 'Sat', G4: 'Sat', G5: 'Sat', G6: 'Sun', G7: 'Sun' }, 'regional days');
  const gs = s.games.filter(g => g.event === ev.id).sort((a, b) => a.order - b.order);
  assert.deepEqual(gs.map(g => g.node), ev.nodes.filter(n => n.gameId).sort((a, b) => a.t - b.t).map(n => n.key), 'regional games in order');
}

// Changing a host rebuilds the games not yet played at the new site.
{
  const L2 = newLeague(), s2 = currentSeason(L2);
  simGames(s2, g => g.type === 'regular');
  const ev = s2.post.confT['Mountain West'];
  const other = Object.values(s2.teams).find(t => t.conference === 'Mountain West' && t.school !== ev.host && ev.seeds.includes(t.school)).school;
  setConfHost(s2, 'Mountain West', other); afterChange(s2);
  assert.equal(ev.host, other);
  const gs = s2.games.filter(g => g.event === ev.id);
  assert.ok(gs.length && gs.every(g => (g.home === other || g.away === other) ? g.home === other && !g.neutral : g.neutral), 'new host is home, others at its site');
  // Next season picks new hosts, not last year's when there's a choice.
  const nxt = newSeason(s2.year + 1, JSON.parse(JSON.stringify(s2.teams)), s2.settings, s2);
  for (const c of Object.keys(s2.confHosts)) assert.notEqual(nxt.confHosts[c], s2.confHosts[c], `${c}: new host next year`);
}

// Strength of schedule is computed and ranked for every team
const rr = rpi(s);
assert.ok(Object.values(rr).every(x => x.sos > 0 && x.sosRank >= 1), 'every team has an SOS rank');
const sosTop = Object.keys(rr).sort((a, b) => rr[a].sosRank - rr[b].sosRank).slice(0, 3);
console.log('toughest schedules:', sosTop.map(t => `${t} (${s.teams[t].conference}, opp ${rr[t].oppW}-${rr[t].oppL})`).join('; '));

// Ratings moved with results
const moved = Object.entries(s.teams).filter(([k, t]) => t.off !== pre[k].off || t.pit !== pre[k].pit || t.def !== pre[k].def).length;
const drift = Object.entries(s.teams).map(([k, t]) => Math.abs(t.off - pre[k].off) + Math.abs(t.pit - pre[k].pit) + Math.abs(t.def - pre[k].def));
console.log(`ratings moved for ${moved} of ${Object.keys(s.teams).length} teams; biggest total change ${Math.max(...drift)}`);
assert.ok(moved > 30, 'ratings change during the season');
assert.ok(Math.max(...drift) <= 30, 'changes stay modest');
assert.equal(s.phase, 'complete');
assert.ok(s.games.every(isFinal));
for (let w = 1; w <= postWeeks(s).conf; w++) assert.ok(s.polls[w], `poll week ${w}`);
// Voters differ a little, but not wildly, from the published poll
const p6 = s.polls[6], r6 = Object.fromEntries(p6.ranks.map((x, i) => [x.team, i + 1]));
const spread = Object.values(p6.ballots).map(b => b.reduce((acc, t, i) => acc + (r6[t] ? Math.abs(r6[t] - (i + 1)) : 6), 0) / b.length);
console.log('week 6: ballots differ from the poll by', Math.min(...spread).toFixed(2), 'to', Math.max(...spread).toFixed(2), 'spots on average');
assert.ok(Math.max(...spread) < 5 && Math.max(...spread) > 0, 'voters disagree a little, not wildly');
// Poll rules: a ranked team with a losing week never moves up; one that wins every game never drops.
{
  const ws = Object.keys(s.polls).filter(k => k !== 'final').map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ws.length; i++) {
    const a = s.polls[ws[i - 1]].ranks.map(x => x.team), b = s.polls[ws[i]].ranks.map(x => x.team);
    const W = {}, Lo = {};
    for (const g of s.games.filter(g => g.week === ws[i] && isFinal(g))) { const w = g.homeR > g.awayR ? g.home : g.away; const l = w === g.home ? g.away : g.home; W[w] = (W[w] || 0) + 1; Lo[l] = (Lo[l] || 0) + 1; }
    for (const t of a) {
      const now = b.includes(t) ? b.indexOf(t) : 99;
      if ((Lo[t] || 0) > (W[t] || 0)) assert.ok(now >= a.indexOf(t), `week ${ws[i]}: ${t} lost the week but moved up`);
      if ((W[t] || 0) > 0 && !Lo[t]) assert.ok(now <= a.indexOf(t), `week ${ws[i]}: ${t} won every game but dropped`);
    }
  }
}
// By the end of the regular season the poll tracks the résumé: the top 5 are all top-12 RPI teams.
{
  const lastW = Math.max(...Object.keys(s.polls).filter(k => k !== 'final').map(Number).filter(w => w <= 12));
  const rr = rpi(s, g => g.week <= lastW);
  assert.ok(s.polls[lastW].ranks.slice(0, 5).every(x => rr[x.team].rank <= 12), 'late-season poll follows results');
}
assert.ok(s.polls.final);
assert.equal(s.polls.final.ranks[0].team, s.post.champion);
assert.equal(s.post.field.length, 64);
assert.equal(new Set(s.post.field.map(f => f.team)).size, 64);
for (const ev of Object.values(s.post.confT)) assert.ok(s.post.field.some(f => f.team === ev.champion), 'auto bid in field');
const recs = records(s), r = rpi(s);
console.log('champion', s.post.champion, recs[s.post.champion].w + '-' + recs[s.post.champion].l, 'runner-up', s.post.runnerUp);
console.log('WCWS', wsTeams(s).join(', '));
console.log('final top 5', s.polls.final.ranks.slice(0, 5).map(x => `${x.team} ${x.record}`).join(' | '));
console.log('Mountain West', confStandings(s, 'Mountain West').map(x => `${x.team} ${x.cw}-${x.cl}`).join(', '));
const g = s.games.filter(x => x.type === 'regular');
const avg = k => (g.reduce((a, x) => a + x['home' + k] + x['away' + k], 0) / g.length / 2).toFixed(2);
console.log('per team per game: R', avg('R'), 'H', avg('H'), 'E', avg('E'), 'run-rule', (g.filter(x => x.runRule).length / g.length).toFixed(3), 'extras', (g.filter(x => x.awayLine.length > 7).length / g.length).toFixed(3));
for (const x of s.games) { assert.equal(x.homeLine.reduce((a, b) => a + (b || 0), 0), x.homeR); }

// Coaches are people with ids
assert.equal(coachName(league, s.teams['San Diego State'].coachId), 'Stacey Nuveman Deniz');
assert.ok(Object.values(s.teams).every(t => t.coachId), 'every team has a coach');
assert.ok(Object.values(s.teams).every(t => !t.staff), 'no pitching staffs');
assert.ok(s.games.every(g => !g.pitching && !g.wp), 'no pitching stats');

// Offseason: new conference, new team, realignment, a team leaves
const d = beginOffseason(league);
assert.equal(d.year, 2027);
addConference(league, 'Summit', { color: '#123456' });
addTeam(league, d.teams, { school: 'Lindenwood', conference: 'Summit', coachName: 'Pat Casey' });
// Coaching carousel: San Diego State hires Mercer's coach; Mercer hires a new one
const foore = d.teams['Mercer'].coachId, gasso = d.teams['San Diego State'].coachId;
assert.equal(hireCoach(d.teams, 'San Diego State', foore), 'Mercer');
assert.equal(d.teams['Mercer'].coachId, null);
assert.ok(draftWarnings(league).some(w => /Mercer/.test(w)), 'vacancy is flagged');
assert.ok(availableCoaches(league, d.teams).some(c => c.id === gasso), 'Stacey Nuveman Deniz is now available');
hireCoach(d.teams, 'Mercer', newCoach(league, 'Sam New'));
for (const t of ['Seattle U', 'Pacific', 'San Diego']) d.teams[t].conference = 'Summit';
d.teams['Fresno State'].conference = 'West Coast';
draftRemoveTeam(league, 'Coppin State');
assert.deepEqual(draftWarnings(league).filter(w => !/is capped at/.test(w)), []);
// Offseason rating points: earned from results plus luck, spread automatically, adjustable.
{
  const withDev = Object.values(d.teams).filter(t => t.dev);
  assert.ok(withDev.length >= 40, 'returning teams get rating points');
  assert.ok(withDev.every(t => pointsLeft(t) === t.dev.pts), 'points start unplaced');
  { const { placeRemaining, clearPoints } = await import('../js/league.js');
    const u = withDev.find(x => x.dev.pts > 2 && x.off < 90 && x.pit < 90 && x.def < 90);
    if (u) { u.off += 1; placeRemaining(u, Math.random); assert.equal(pointsLeft(u), 0, 'auto places the rest'); assert.ok(u.off >= u.dev.start.off + 1, 'keeps manual placement');
      clearPoints(u); assert.equal(pointsLeft(u), u.dev.pts, 'reset'); } }
  const champ = d.teams[s.post.champion];
  const recs = records(s), byWp = withDev.filter(t => recs[t.school]).sort((a, b) => recs[b.school].w / (recs[b.school].w + recs[b.school].l) - recs[a.school].w / (recs[a.school].w + recs[a.school].l));
  const avg = l => l.reduce((n, t) => n + t.dev.pts, 0) / l.length;
  console.log('dev points: best third avg', avg(byWp.slice(0, 15)).toFixed(1), 'worst third avg', avg(byWp.slice(-15)).toFixed(1), 'champion', champ.dev.pts);
  const t = withDev.find(x => x.off < 95), before = pointsLeft(t);
  t.off += 1; assert.equal(pointsLeft(t), before - 1, 'raising a rating spends a point');
  t.off -= 1;
}
assert.ok(s.teams['Coppin State'], 'history keeps the team');
const s2 = startNextSeason(league);
assert.equal(s2.year, 2027);
assert.ok(!league.draft);
assert.ok(s2.teams['Lindenwood'] && !s2.teams['Coppin State']);
assert.equal(s2.teams['Fresno State'].conference, 'West Coast');
assert.equal(coachName(league, s2.teams['Lindenwood'].coachId), 'Pat Casey');
assert.equal(coachName(league, s2.teams['San Diego State'].coachId), 'Chris Kuhlmeyer');
// New schedule each season, with conference series flipping home and away
assert.ok(s2.games.some(g => g.type === 'regular') && s2.games.every(g => !g.final || g.type !== 'regular' || true));
const host16 = new Map(s.games.filter(g => g.type === 'regular' && g.confGame).map(g => [[g.home, g.away].sort().join('|'), g.home]));
let flipped = 0, same = 0;
for (const g of s2.games.filter(g => g.type === 'regular' && g.confGame && g.day === 'Fri')) {
  const h = host16.get([g.home, g.away].sort().join('|'));
  if (h) (h === g.home ? same++ : flipped++);
}
console.log(`conference series that met in both years: ${flipped} flipped, ${same} same host`);
assert.equal(same, 0, 'every repeat conference series switches sites');
const summit = Object.values(s2.teams).filter(t => t.conference === 'Summit').map(t => t.school);
assert.equal(summit.length, 4);
for (const t of summit) {
  const opps = new Set(s2.games.filter(g => g.confGame && (g.home === t || g.away === t)).map(g => (g.home === t ? g.away : g.home)));
  assert.equal(opps.size, 3, `${t} plays its new Summit rivals`);
}
assert.ok(s2.games.some(g => g.home === 'Utah' || g.away === 'Utah'));
assert.ok(s2.carryPoll);
renameTeam(league, s2, 'Utah', 'Utah Utes');
assert.ok(s2.teams['Utah Utes']);
simGames(s2, undefined, { autoLock: true });
assert.equal(s2.phase, 'complete');
console.log('2027 champion', s2.post.champion);

// Poll size from the settings
s2.settings.pollSize = 20;
// ---------- Tournament formats ----------
// Each season after this one uses a different format set in the editor.
assert.deepEqual(ncaaProblems({ regionals: 4, perRegional: 4, wsSize: 8 }, 46).length, 1, 'an 8-team WCWS needs 8 or 16 regionals');
assert.ok(ncaaProblems({ regionals: 16, perRegional: 4, wsSize: 8 }, 46).some(x => /only 46 teams/.test(x)), 'too many qualifiers');
function runFormat(cfg, check) {
  currentSeason(league).settings.ncaa = cfg;
  beginOffseason(league);
  const se = startNextSeason(league);
  assert.equal(se.regWeeks, 12);
  se.settings.confFormat = {};
  simGames(se, undefined, { autoLock: true });
  assert.equal(se.phase, 'complete', `${se.year} finishes`);
  assert.ok(se.games.every(isFinal), `${se.year}: every game played`);
  assert.equal(se.post.field.length, fieldSize(cfg));
  assert.equal(new Set(se.post.field.map(f => f.team)).size, fieldSize(cfg));
  assert.equal(se.post.regionals.length, cfg.regionals);
  assert.ok(se.post.regionals.every(ev => ev.seeds.length === cfg.perRegional && ev.champion));
  assert.equal(wsTeams(se).length, cfg.wsSize);
  assert.equal(se.polls.final.ranks[0].team, se.post.champion);
  const W = postWeeks(se);
  const weeks = [...new Set(se.games.filter(g => g.type !== 'regular').map(g => weekName(g.week, se)))];
  console.log(`${se.year}: ${fieldSize(cfg)} qualifiers, ${cfg.regionals}×${cfg.perRegional}, WCWS ${cfg.wsSize} → champion ${se.post.champion} over ${se.post.runnerUp} · weeks: ${weeks.join(', ')}`);
  assert.equal(se.polls[1].ranks.length, 20, 'a Top 20 after changing the setting');
  check(se, W);
}
// 8-team WCWS: Bracket A and B, then a best-of-three final
runFormat({ regionals: 8, perRegional: 4, wsSize: 8 }, (se, W) => {
  const [A, B] = se.post.mcwsBrackets;
  const q = se.post.regionals.map(ev => ev.champion);
  assert.deepEqual(A.seeds, [q[0], q[3], q[4], q[7]], 'Bracket A: paths 1, 4, 5, 8');
  assert.deepEqual(B.seeds, [q[1], q[2], q[5], q[6]], 'Bracket B: paths 2, 3, 6, 7');
  assert.ok(A.champion && B.champion);
  assert.deepEqual([...se.post.mcwsFinals.seeds].sort(), [A.champion, B.champion].sort());
  const fin = se.games.filter(g => g.event === 'ws-F');
  assert.ok(fin.length >= 2 && fin.length <= 3, 'finals are best of three');
  assert.ok(fin.every(g => g.week === W.finals));
  assert.ok(!se.post.supers, 'no super regionals');
  assert.ok([A.champion, B.champion].includes(se.post.champion));
});
// Super regionals into a 4-team WCWS, with 5-team regionals (40 teams: every
// conference's automatic bid fits)
runFormat({ regionals: 8, perRegional: 5, wsSize: 4 }, (se, W) => {
  assert.equal(se.post.supers.length, 4);
  for (const ev of se.post.supers) {
    const gs = se.games.filter(g => g.event === ev.id);
    assert.ok(gs.length >= 2 && gs.length <= 3 && gs.every(g => (g.site || g.home) === ev.host && g.week === W.super), 'supers: best of three at the higher seed');
    assert.ok(ev.seeds.includes(ev.champion));
  }
  assert.deepEqual([...wsTeams(se)].sort(), se.post.supers.map(ev => ev.champion).sort());
  for (const g of se.games.filter(g => g.event === 'mcws')) assert.equal(g.day, { G1: 'Fri', G2: 'Fri', G4: 'Sat', G3: 'Sun', G5: 'Sun', F1: 'Mon', F2: 'Tue', F3: 'Wed' }[g.node], `4-team WCWS ${g.node} day`);
  // A 5-team double elimination never makes a team lose three times
  for (const ev of se.post.regionals) {
    const losses = {};
    for (const g of se.games.filter(g => g.event === ev.id)) { const l = g.homeR > g.awayR ? g.away : g.home; losses[l] = (losses[l] || 0) + 1; }
    assert.ok(Object.values(losses).every(n => n <= 2));
    assert.ok((losses[ev.champion] || 0) <= 1);
  }
});
// 32 teams, 16 two-team regionals, 8 supers, 8-team WCWS
runFormat({ regionals: 16, perRegional: 2, wsSize: 8 }, se => {
  assert.equal(se.post.supers.length, 8);
  // WCWS days: openers Friday, G4 Saturday, G3 and G5 Sunday, bracket finals Monday (both brackets).
  for (const ev of se.post.mcwsBrackets) for (const g of se.games.filter(g => g.event === ev.id)) {
    assert.equal(g.day, { G1: 'Fri', G2: 'Fri', G4: 'Sat', G3: 'Sun', G5: 'Sun', G6: 'Mon', G7: 'Mon' }[g.node], `${ev.name} ${g.node} day`);
  }
  // Super regional Game 2: still at the host's field, but the visitor is the home team.
  for (const ev of se.post.supers) {
    const g2 = se.games.find(g => g.event === ev.id && g.node === 'S2'), g1 = se.games.find(g => g.event === ev.id && g.node === 'S1');
    assert.equal(g1.home, ev.host); assert.ok(!g1.neutral);
    assert.notEqual(g2.home, ev.host, 'Game 2 flips home and away'); assert.equal(g2.site, ev.host, 'Game 2 is still at the host');
  }
  assert.equal(se.post.mcwsBrackets.length, 2);
});
// WCWS places and history (Participants tab)
{
  const done = Object.values(league.seasons).filter(se => se.post?.champion);
  for (const se of done) {
    const pl = mcwsPlaces(se), ws = wsTeams(se);
    assert.equal(Object.keys(pl).length, ws.length, `${se.year}: every WCWS team has a place`);
    assert.equal(pl[se.post.champion].place, 1); assert.equal(pl[se.post.runnerUp].place, 2);
    if (ws.length === 8) assert.deepEqual(Object.values(pl).map(x => x.place).sort((a, b) => a - b), [1, 2, 3, 3, 5, 5, 7, 7], '8-team WCWS places tie');
    if (ws.length === 4) assert.deepEqual(Object.values(pl).map(x => x.place).sort((a, b) => a - b), [1, 2, 3, 4], '4-team WCWS places');
  }
  const last = Math.max(...done.map(se => se.year));
  const champ = league.seasons[last].post.champion;
  const h = mcwsHistory(league, champ, last + 1);
  assert.ok(h.apps >= 1 && h.last === last && h.best.place === 1 && h.bestYears.includes(last) && h.w > 0, 'history counts the title');
  const games = done.reduce((n, se) => n + se.games.filter(g => g.type === 'mcws' && (g.home === champ || g.away === champ)).length, 0);
  assert.equal(h.w + h.l, games, 'WCWS W-L counts every WCWS game');
  assert.equal(mcwsHistory(league, champ, done[0].year).apps, 0, 'nothing before the first season');
}
// Team history: head-to-head, poll history, poll records; conferences A-Z
{
  const { headToHead, teamPollHistory, pollRecords, recordBook } = await import('../js/records.js');
  const { sortConferences } = await import('../js/league.js');
  const t = Object.keys(league.seasons[league.currentYear].teams)[0];
  const h = headToHead(league, t);
  const all = Object.values(league.seasons).flatMap(se => se.games.filter(g => isFinal(g) && (g.home === t || g.away === t)));
  assert.equal(h.reduce((a, r) => a + r.g, 0), all.length, 'H2H covers every game');
  const prog = recordBook(league).programs.find(p => p.team === t);
  assert.equal(h.reduce((a, r) => a + r.w, 0), prog.w, 'H2H wins match program wins');
  for (const r of h) assert.equal(r.w + r.l, r.g);
  const ph = teamPollHistory(league, t);
  for (const x of ph) { assert.ok(x.ranked <= x.polls); if (x.high) assert.ok(x.high <= x.low); }
  const PR = pollRecords(league);
  const p1 = PR.programs.reduce((a, p) => a + p.at1, 0);
  const polls = Object.values(league.seasons).reduce((a, se) => a + Object.keys(se.polls || {}).length, 0);
  assert.equal(p1, polls, 'exactly one #1 per poll');
  for (const m of PR.moves.filter(m => m.to)) assert.equal(m.delta, m.from - m.to);
  const L2 = { conferences: { 'West Coast': {}, ACC: {}, 'big West': {} }, seasons: {} };
  sortConferences(L2);
  assert.deepEqual(Object.keys(L2.conferences), ['ACC', 'big West', 'West Coast'], 'conferences A-Z');
}
// At-large teams need a .500 record or better
{
  const { atLargeEligible } = await import('../js/postseason.js');
  let checked = 0;
  for (const se of Object.values(league.seasons)) {
    const r = records(se, g => g.type === 'regular' || g.type === 'conf');
    const inF = new Set((se.post?.field || []).map(f => f.team));
    const allEligibleIn = Object.keys(se.teams).every(t => r[t].w < r[t].l || inF.has(t));
    for (const f of se.post?.field || []) if (f.bid === 'at-large') { checked++; assert.ok(r[f.team].w >= r[f.team].l || allEligibleIn, `${se.year} ${f.team} at-large with a losing record while a .500 team sat out`); }
  }
  assert.ok(checked > 0);
  // Force a losing team high in the order and check it is skipped.
  const se = league.seasons[league.currentYear];
  const recs = records(se);
  const loser = Object.keys(se.teams).find(t => recs[t].w < recs[t].l);
  if (loser) {
    assert.equal(atLargeEligible(se, loser), false);
    const B = bracketology(se);
    const f = B.field.find(x => x.team === loser);
    assert.ok(!f || f.bid === 'auto' || B.fill.includes(loser), 'losing team only in as an automatic bid (or to fill a short field)');
    assert.ok(!B.firstOut.includes(loser) && !B.nextOut.includes(loser));
  }
}
{ const { mcwsVenue } = await import('../js/postseason.js');
  assert.deepEqual(mcwsVenue(league.seasons[league.currentYear]), { stadium: 'Devon Park', city: 'Oklahoma City, Oklahoma' });
  assert.deepEqual(mcwsVenue({ settings: {} }), { stadium: 'Devon Park', city: 'Oklahoma City, Oklahoma' }, 'older saves default to Oklahoma City'); }
// Play-in, then double elimination: play-in losers are out after one game;
// everyone else needs two losses (the single championship game aside).
{ const { confKind } = await import('../js/postseason.js');
  assert.equal(confKind('playin', 4), 'double', 'play-in needs 5 or more teams');
  assert.equal(confKind('playin', 2), 'single');
  for (let run = 0; run < 3; run++) {
    const Lp = newLeague(), sp = Lp.seasons[Lp.currentYear];
    sp.settings.confFormat = { 'Mountain West': 'playin', 'Southern': 'playin', 'Big South': 'playin', 'West Coast': 'playin' };
    sp.settings.confTourney = { 'Mountain West': 8, 'Southern': 6, 'Big South': 5, 'West Coast': 7 };
    simGames(sp, g => g.type === 'regular' || g.type === 'conf');
    for (const [c, size] of [['Mountain West', 8], ['Southern', 6], ['Big South', 5], ['West Coast', 7]]) {
      const ev = sp.post.confT[c];
      assert.equal(ev.kind, 'playin', `${c} plays a play-in`);
      const gs = sp.games.filter(g => g.event === ev.id);
      const pre = gs.filter(g => g.node.startsWith('P-'));
      assert.equal(pre.length, size - 4, `${c}: ${size - 4} play-in games`);
      const byes = ev.seeds.slice(0, 8 - size);
      assert.ok(pre.every(g => !byes.includes(g.home) && !byes.includes(g.away)), `${c}: top ${8 - size} seeds have byes`);
      assert.ok(pre.every(g => g.day === 'Wed') && gs.find(g => g.node === 'CH').day === 'Sun', `${c}: play-in Wednesday, final Sunday`);
      const out = pre.map(g => (g.homeR > g.awayR ? g.away : g.home));
      for (const t of out) assert.equal(gs.filter(g => g.home === t || g.away === t).length, 1, `${t} is out after the play-in`);
      const losses = {}; for (const g of gs) { const l = g.homeR > g.awayR ? g.away : g.home; losses[l] = (losses[l] || 0) + 1; }
      const finalLoser = ev.nodes.find(n => n.key === 'CH').loser;
      for (const t of ev.seeds.filter(t => !out.includes(t) && t !== ev.champion && t !== finalLoser)) assert.equal(losses[t], 2, `${c}: ${t} out after two losses`);
      assert.ok(ev.seeds.includes(ev.champion) && !out.includes(ev.champion));
    }
  }
}
// Team histories: where each NCAA team's season ended
{ const { postseasonDetail } = await import('../js/postseason.js');
  const Ld = newLeague(), sd = Ld.seasons[Ld.currentYear];
  simGames(sd, undefined, { autoLock: true });
  const ds = sd.post.field.map(f => [f.team, postseasonDetail(sd, f.team)]);
  for (const [t, d] of ds) {
    assert.ok(d && d.text && d.tab, `${t} has a postseason detail`);
    if (d.tab === 'regionals') {
      const ev = sd.post.regionals.find(e => e.id === d.ev);
      assert.ok(ev.seeds.includes(t) && d.text.startsWith(ev.name), `${t}: ${d.text}`);
      if (ev.champion !== t) assert.match(d.text, / · (out in (Game \d|Regional final)|lost series \d-\d)$/, d.text);
    }
  }
  assert.equal(ds.filter(([, d]) => d.text === 'National champion').length, 1);
  assert.equal(ds.filter(([, d]) => d.text.startsWith('National runner-up')).length, 1);
  assert.ok(ds.filter(([, d]) => d.tab === 'mcws').length === wsTeams(sd).length, 'every WCWS team links there');
  console.log('history example:', ds.find(([, d]) => d.tab === 'regionals' && d.text.includes('out in'))?.[1].text);
  }
// Hot seat: suggested firings after a season (suggestions only)
{ const { hotSeat } = await import('../js/hotseat.js');
  const Lh = newLeague();
  simGames(Lh.seasons[Lh.currentYear], undefined, { autoLock: true });
  const first = hotSeat(Lh);
  assert.ok(first.every(x => x.level !== 'fire'), 'nobody is told to fire a first-year coach');
  beginOffseason(Lh); startNextSeason(Lh);
  simGames(Lh.seasons[Lh.currentYear], undefined, { autoLock: true });
  beginOffseason(Lh); startNextSeason(Lh);
  const sh = Lh.seasons[Lh.currentYear];
  simGames(sh, undefined, { autoLock: true });
  const before = JSON.stringify(Object.values(sh.teams).map(t => t.coachId));
  const hs = hotSeat(Lh);
  assert.equal(JSON.stringify(Object.values(sh.teams).map(t => t.coachId)), before, 'the list never fires anyone');
  const n = Object.keys(sh.teams).length, fire = hs.filter(x => x.level === 'fire').length;
  console.log('hot seat after 3 seasons:', fire, 'fire,', hs.filter(x => x.level === 'hot').length, 'hot,', hs.filter(x => x.level === 'warm').length, 'warm; top:', hs[0] && `${hs[0].school} (${hs[0].reasons.join('; ')})`);
  assert.ok(fire <= Math.ceil(n * 0.2), 'only a handful of firings suggested');
  assert.ok(hs.every((x, i) => i === 0 || hs[i - 1].score >= x.score), 'hottest first');
  assert.ok(hs.every(x => x.reasons.length || x.cool.length), 'every entry says why');
  assert.ok(!hs.some(x => x.school === sh.post.champion && x.level !== 'warm'), 'the national champion is safe');
  for (const x of hs) assert.equal(sh.teams[x.school].coachId, x.coachId); }
console.log(`ok in ${Date.now() - t0} ms`);
