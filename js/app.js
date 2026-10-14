// App shell: loading the dynasty, the top bar, and page routing.

import { loadLeague, saveLeague } from './store.js?v=20261014155521';
import { loadLogoTable } from './logos.js?v=20261014155521';
import { newLeague, afterChange, migrateLeague } from './league.js?v=20261014155521';
import { ctx, app, cache, persist, esc } from './ui.js?v=20261014155521';
import { renderHome, renderSchedule, renderStandings, renderRankings, renderPostseason, resetSeasonUi } from './views-season.js?v=20261014155521';
import { renderRecords } from './views-records.js?v=20261014155521';
import { renderTeams, renderTeamPage, renderConferences, renderConferencePage, renderHistory, renderSettings, renderOffseason, renderCoaches, renderCoachPage } from './views-league.js?v=20261014155521';

const VIEWS = { home: 'Home', schedule: 'Schedule', standings: 'Standings', rankings: 'Rankings', postseason: 'Postseason', offseason: 'Offseason', teams: 'Teams', coaches: 'Coaches', conferences: 'Conferences', history: 'History', records: 'Records', settings: 'Settings' };
const SUBVIEWS = { team: 'teams', conference: 'conferences', coach: 'coaches' };
const RENDER = {
  home: renderHome, schedule: renderSchedule, standings: renderStandings, rankings: renderRankings, postseason: () => renderPostseason(routeArg()),
  offseason: renderOffseason, teams: renderTeams, coaches: renderCoaches, conferences: renderConferences, history: renderHistory, records: renderRecords, settings: renderSettings,
  team: () => renderTeamPage(routeArg()), coach: () => renderCoachPage(routeArg()), conference: () => renderConferencePage(routeArg()),
};

function currentView() { const v = location.hash.replace(/^#\/?/, '').split('/')[0]; return VIEWS[v] || SUBVIEWS[v] ? v : 'home'; }
function routeArg() { return decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/').slice(1).join('/')); }

function renderChrome() {
  const L = ctx.league;
  document.getElementById('league-name').textContent = L.name;
  document.title = L.name;
  const v = currentView();
  const offOpen = L.seasons[L.currentYear].phase === 'complete';
  document.getElementById('nav').innerHTML = Object.entries(VIEWS).filter(([k]) => k !== 'offseason' || offOpen || v === 'offseason').map(([k, label]) => `<a href="#/${k}" class="${k === v || SUBVIEWS[v] === k ? 'active' : ''}">${label}</a>`).join('');
  const years = Object.keys(L.seasons).map(Number).sort((a, b) => b - a);
  const picker = document.getElementById('season-picker');
  picker.innerHTML = `<select aria-label="Season">${years.map(y => `<option value="${y}" ${y === L.viewYear ? 'selected' : ''}>${y}${y === L.currentYear ? '' : ' (past)'}</option>`).join('')}</select>`;
  picker.querySelector('select').onchange = e => { L.viewYear = Number(e.target.value); resetSeasonUi(); persist(); render(); };
}

export function render() {
  cache.reset();
  renderChrome();
  try { RENDER[currentView()](); }
  catch (e) { console.error(e); app.innerHTML = `<div class="empty">Something went wrong drawing this page: ${esc(e.message)}</div>`; }
}

let lastView = null;
window.addEventListener('hashchange', () => { const v = currentView(); render(); if (v !== lastView) window.scrollTo(0, 0); lastView = v; });

async function boot() {
  ctx.render = render;
  let league = await loadLeague();
  if (!league || !league.seasons) {
    league = newLeague();
    await saveLeague(league);
  }
  migrateLeague(league);
  if (!league.seasons[league.viewYear]) league.viewYear = league.currentYear;
  ctx.league = league;
  afterChange(league.seasons[league.currentYear]);
  render();
  // Logos load in the background; redraw once they're in.
  loadLogoTable().then(() => render());
}

boot().catch(e => {
  console.error(e);
  app.innerHTML = `<div class="empty">The dynasty couldn't load: ${esc(e.message)}. Your saved league hasn't been changed. Try reloading the page.</div>`;
});
