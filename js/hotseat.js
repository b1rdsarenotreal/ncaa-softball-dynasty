// Suggested coach firings ("hot seat"). After a season, every head coach is
// judged against what the roster should have done: a team's preseason
// ratings set an expected winning percentage, and results above or below it,
// this season and over the coach's recent seasons at the school, move the
// coach up or down the list. Losing streaks, missed NCAA tournaments and
// last-place finishes add heat; titles, deep runs and a new coach's first
// season cool it. These are suggestions only: nothing changes until the
// commissioner fires someone.

import { records, rpi, confStandings, regSeasonChamps } from './standings.js?v=20261014163557';
import { wsTeams } from './postseason.js?v=20261014163557';
import { ovr } from './sim.js?v=20261014163557';

export const HEAT = {
  fire: { label: 'Fire suggested', min: 2.6 },
  hot: { label: 'Hot seat', min: 1.6 },
  warm: { label: 'Warm', min: 0.9 },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
const pct = (w, l) => (w + l ? w / (w + l) : 0.5);

// What one season looked like for every team (worked out once per season).
function seasonFacts(season, memo) {
  if (memo.has(season)) return memo.get(season);
  const all = records(season), reg = records(season, g => g.type === 'regular'), r = rpi(season, g => g.type === 'regular');
  const pre = Object.fromEntries(Object.values(season.teams).map(t => [t.school, ovr(t.base || t)]));
  const vals = Object.values(pre), avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const confPlace = {}, regTitle = new Set();
  for (const c of new Set(Object.values(season.teams).map(t => t.conference))) {
    const st = confStandings(season, c, reg, r);
    st.forEach((x, i) => { confPlace[x.team] = { pos: i + 1, of: st.length }; });
    for (const t of regSeasonChamps(season, c, reg, r)) regTitle.add(t);
  }
  const field = new Set((season.post?.field || []).map(f => f.team));
  const ws = new Set(wsTeams(season));
  const confT = new Set(Object.values(season.post?.confT || {}).map(ev => ev.champion).filter(Boolean));
  // Fit winning percentage to preseason OVR across the league this season, so
  // "expected" means what teams with that roster actually did this year.
  const pts = Object.keys(pre).filter(k => all[k] && all[k].w + all[k].l).map(k => [pre[k], pct(all[k].w, all[k].l)]);
  const mx = pts.reduce((a, p) => a + p[0], 0) / (pts.length || 1), my = pts.reduce((a, p) => a + p[1], 0) / (pts.length || 1);
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const slope = sxx ? clamp(sxy / sxx, 0.005, 0.06) : 0.025;
  const f = { all, pre, avg, fit: { mx, my, slope }, confPlace, regTitle, field, ws, confT, champion: season.post?.champion || null };
  memo.set(season, f);
  return f;
}

// Expected winning percentage from preseason OVR, on that season's fit.
const expectedPct = (f, team) => clamp(f.fit.my + (f.pre[team] - f.fit.mx) * f.fit.slope, 0.05, 0.95);

// The hot-seat list for the season just finished. Returns one entry per
// coach with heat > 0, hottest first:
// { school, coachId, score, level, seasons, w, l, reasons: [...], cool: [...] }
export function hotSeat(league, year = league.currentYear) {
  const season = league.seasons[year];
  if (!season) return [];
  const memo = new Map();
  const years = Object.keys(league.seasons).map(Number).filter(y => y <= year).sort((a, b) => b - a);
  const out = [];
  for (const t of Object.values(season.teams)) {
    const id = t.coachId;
    if (!id) continue;
    // This coach's run at this school, most recent season first.
    const run = [];
    for (const y of years) {
      const se = league.seasons[y], tt = se.teams[t.school];
      if (!tt || tt.coachId !== id) break;
      const f = seasonFacts(se, memo), rec = f.all[t.school] || { w: 0, l: 0 };
      run.push({ y, f, w: rec.w, l: rec.l, p: pct(rec.w, rec.l), exp: expectedPct(f, t.school), place: f.confPlace[t.school] });
    }
    if (!run.length) continue;
    const now = run[0], recent = run.slice(0, 3);
    let score = 0;
    const reasons = [], cool = [];
    // Results against expectations, this season and recently.
    const gap = now.exp - now.p;
    score += gap * 9;
    if (gap >= 0.08) reasons.push(`Went ${now.w}-${now.l} with a roster expected to win about ${Math.round(now.exp * 100)}%`);
    if (gap <= -0.08) cool.push(`Beat expectations (${now.w}-${now.l})`);
    if (recent.length >= 2) {
      const avgGap = recent.reduce((a, s) => a + (s.exp - s.p), 0) / recent.length;
      score += avgGap * 6;
      if (avgGap >= 0.06) reasons.push(`Under expectations over the last ${recent.length} seasons`);
    }
    // Losing seasons in a row.
    let losing = 0;
    for (const s of run) { if (s.w < s.l) losing++; else break; }
    // Losing hurts most where winning was expected.
    const lose = now.exp >= 0.5 ? 1 : now.exp >= 0.4 ? 0.5 : 0.2;
    score += ([0, 0.5, 1.3, 2.1][Math.min(losing, 3)] + Math.max(0, losing - 3) * 0.4) * lose;
    if (losing >= 2) reasons.push(`${losing} straight losing seasons`);
    else if (losing === 1) reasons.push('Losing season');
    // Missed the NCAA tournament with a roster that should have made it.
    let missed = 0;
    for (const s of run) { if (!s.f.field.has(t.school)) missed++; else break; }
    if (missed && now.exp >= 0.6) { score += 0.8 + Math.min(missed - 1, 2) * 0.4; reasons.push(missed > 1 ? `Missed the NCAA tournament ${missed} years running` : 'Missed the NCAA tournament'); }
    // Bottom of the conference.
    if (now.place && now.place.of >= 4) {
      if (now.place.pos === now.place.of) { score += 0.7 * lose; reasons.push(`Last in the ${t.conference}`); }
      else if (now.place.pos > now.place.of * 0.75) { score += 0.3 * lose; reasons.push(`${ordinal(now.place.pos)} of ${now.place.of} in the ${t.conference}`); }
    }
    // What keeps a coach safe.
    if (run.length === 1) { score -= 1.6; cool.push('First season at the school'); }
    else if (run.length === 2) { score -= 0.5; cool.push('Second season at the school'); }
    const titleYears = run.filter(s => s.f.champion === t.school).map(s => s.y);
    if (titleYears.length) { score -= 2.2 + (titleYears[0] >= year - 2 ? 1.5 : 0); cool.push(`National title${titleYears.length > 1 ? 's' : ''} (${titleYears.join(', ')})`); }
    if (now.f.ws.has(t.school) && now.f.champion !== t.school) { score -= 1.6; cool.push(`Reached the ${now.y && league.seasons[now.y].settings?.mcwsName || 'WCWS'}`); }
    else if (now.f.field.has(t.school)) { score -= 0.7; cool.push('Made the NCAA tournament'); }
    if (now.f.confT.has(t.school)) { score -= 0.8; cool.push('Won the conference tournament'); }
    if (now.f.regTitle.has(t.school)) { score -= 0.8; cool.push('Won the regular-season title'); }
    if (!reasons.length && !cool.length) reasons.push(gap > 0 ? `Went ${now.w}-${now.l}, a little under the roster's expected ${Math.round(now.exp * 100)}%` : `Went ${now.w}-${now.l}`);
    score = Math.round(score * 10) / 10;
    let level = score >= HEAT.fire.min ? 'fire' : score >= HEAT.hot.min ? 'hot' : score >= HEAT.warm.min ? 'warm' : null;
    // One season is never enough to recommend a firing.
    if (level === 'fire' && run.length === 1) level = 'hot';
    if (!level) continue;
    const tot = run.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l }), { w: 0, l: 0 });
    out.push({ school: t.school, coachId: id, score, level, seasons: run.length, w: tot.w, l: tot.l, reasons: reasons.slice(0, 3), cool: cool.slice(0, 2) });
  }
  return out.sort((a, b) => b.score - a.score || a.school.localeCompare(b.school));
}
