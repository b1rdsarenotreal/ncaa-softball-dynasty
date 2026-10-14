# NCAA Softball Dynasty

A commissioner-style **college softball** dynasty for the real NCAA Division I: 300 programs in 31 conferences, with their 2026 head coaches. It plays like the real game: 7-inning line scores, weekend series, the RPI, a Top 25 poll, conference tournaments with automatic bids, a 64-team field in sixteen regionals, super regionals and the Women's College World Series (WCWS) in Oklahoma City. You have the final say on every result.

It is a static site with no build step and no server, so it runs on GitHub Pages as-is. It runs the same engine as the [MCS Dynasty](https://github.com/b1rdsarenotreal/mcs-dyansty) and [SACAA Dynasty](https://github.com/b1rdsarenotreal/sacaa-dynasty) apps, with the real NCAA teams.

## The league

The dynasty starts in **2026** with 300 teams in 31 conferences: ACC (15), ASUN (10), America East (6), American Athletic (10), Atlantic 10 (10), Big 12 (11), Big East (9), Big Sky (6), Big South (7), Big Ten (17), Big West (10), Coastal Athletic (11), Conference USA (12), Horizon League (9), Ivy League (8), MAAC (13), MEAC (8), Mid-American (11), Missouri Valley (11), Mountain West (10), Northeast (5), Ohio Valley (8), Patriot League (7), SEC (15), SWAC (12), Southern (8), Southland (9), Summit League (6), Sun Belt (12), West Coast (7), Western Athletic (7). Conferences are as of the 2026 season, so the July 2025 moves are in (Grand Canyon to the Mountain West, Seattle U to the West Coast, Delaware and Missouri State to Conference USA). Head coaches are the ones who led each program in 2026, from school and conference announcements (`data/teams.txt`). Every team has its school's colors and mascot. Teams, coaches, conferences, colors, logos and ratings can all be changed in the app.

The teams are the 300 programs in the ratings file the league was built from (`data/ratings.csv`). Schools moving up to Division I (Le Moyne, Lindenwood, Queens, West Georgia and others) aren't in it; add them on the Teams page if you want them.

## Ratings

Every team has three ratings from 40 to 99:

| Rating | What it covers |
|---|---|
| **OFF** | Hitting: contact, power, plate discipline |
| **PIT** | Pitching |
| **DEF** | Fielding: errors and turning batted balls into outs |

**OVR = 40% OFF + 40% PIT + 20% DEF.** Starting ratings come from the ratings file (`data/ratings.csv`): each team's strength blends its ELO (50%), TSR (35%) and PCR (15%), and is turned into an overall rating so that a gap between two teams gives about the same win chance as the ELO gap (about 22 ELO points per rating point). That puts Oklahoma and Texas near 90 and the lowest teams in the mid 40s. The file has no hitting/pitching split, so each school's OFF, PIT and DEF lean a few points either way around its overall rating. `tools/build_data.py` rebuilds `js/data.js` from the two files. Edit any rating on the Teams page or a team's profile.

**Ratings move during the season.** Every result counts: beating a better team raises a team's ratings, and losing to a weaker one lowers them. The part of the game that decided it gets most of the change. Scoring a lot moves OFF, holding the other team down moves PIT, and clean fielding moves DEF. A team can move at most 10 points from its preseason rating in any category. Team pages show the change since the preseason. Settings lets you choose how much ratings move, or turn it off. Because ratings are recalculated from all results in order, editing or clearing a result keeps everything consistent.

## The box score simulator

Simulated games play out every plate appearance. Hitting (OFF) faces pitching (PIT) and fielding (DEF), and each plate appearance ends in a strikeout, walk, hit-by-pitch, single, double, triple, home run, error or out. Runners advance, double plays happen and sacrifice flies score runs.

- **NCAA rules:** 7 innings, the home team skips its last at-bat when already ahead, walk-offs, the **8-run rule after 5 innings**, and extra innings starting with a **runner on second** from the 8th inning. Both rules can be turned off in Settings.
- **Game boxes:** each game is a scoreboard tile, with the away team on the left and the home team on the right. Each side has its logo, its abbreviation with poll rank (and seed in the postseason) and, before the game, its record. The score sits in the middle with the winner's runs in bold, and a played game takes a light wash of the winner's color, strongest on the winner's side. The inning-by-inning line score with R/H/E runs along the bottom; a finished game has nothing else underneath, so the box stays compact. Conference games carry a thin stripe and the conference's logo in their color. The home page shows the latest results as small scoreboards.
- **Results:** a full line score: runs by inning plus R/H/E. Teams average about 4 runs, 7 hits and 1 error a game. A team 10 points better wins about 78% of the time, and one 20 points better about 93% (on "Fewer" upsets: about 82% and 96%). Settings has an **Upsets** option (Fewer, Realistic, More, Chaos).
- **Series tally:** each weekend game shows where its series stands in the box's top corner, for example "Wisconsin leads series 1-0", "Series tied 1-1" or "Ohio State wins series 3-0". Games not yet played show the standing going in. The WCWS Championship Series works the same way. Long school names switch to their abbreviation so the score always fits.
- **Fast score entry:** in the game editor, Tab moves through the line score in game order: top of the 1st, bottom of the 1st, top of the 2nd, and so on. After the last inning it goes to hits and errors, and Shift+Tab goes back. Each box's number is selected when you land on it, so typing replaces it.
- **Simulations are suggestions:** in the game editor you can simulate, change anything, and then save. You can also type in a line score by hand.
- **Hits and errors for hand-entered scores:** leave the H and E boxes blank and they're filled in when you save, based on the line score and both teams' ratings. Each half inning is replayed from the ratings until it produces exactly the runs you entered, so a 6-run inning comes with a believable number of hits, and a team that's bad in the field makes more errors. **Estimate H & E** fills them in early so you can adjust them, and anything you type yourself is kept. If you change the runs after an estimate, the estimate is cleared and redone. Settings → Simulation can also fill in hand-entered games saved earlier with 0 hits and 0 errors.

## The season

- **Schedule:** a new one is built every season, **12 weeks** by default (Settings → Schedule format). Weekends are three-game series. From **week 4** through the next-to-last week (the last week before conference tournaments has no midweek games), each team also plays a **two-game midweek set** against one opponent: a **Tuesday doubleheader** or a **Tuesday and Wednesday** pair (Settings can pick one or mix both). Conference play fills the last weeks, and **a conference's size sets when it starts**: one week per round of its round robin (a 6-team conference plays 5 weeks, an 8-team conference 7, a 10-team conference 9), all finishing on the final weekend. **No conference plays more than 9 weeks**, so a conference of 11 or more teams plays 9 of its members each season (which ones changes every year) and a team never plays a non-conference weekend series once its conference season has begun. Conference rivals never meet outside conference play. Teams with a **conference bye** (odd-sized conferences) play a non-conference weekend series against each other. When a bye team has nobody else free, it plays a **single Thursday game** against another conference instead. Conference opponents who met the year before **swap home and away**. That's about **48–52 games per team**. The start week and the rest week are settings too. A season keeps the length it was scheduled with, so changing the setting affects the next schedule.
- **Schedule filter:** the Schedule page shows **All games** by default. Filter buttons above the games narrow a week to **Ranked teams** (at least one ranked team, using the poll in effect when the game was played), **Ranked vs. ranked**, or one conference (every game with one of its teams). Day headers show how many of the day's games match. The filter stays as you switch weeks and goes back to All games when the page is reloaded. The Sim buttons still cover the whole week.
- **Standings:** ordered by conference winning percentage. Ties are broken in this order, and the same order seeds the conference tournaments:
  1. Head-to-head among all the tied teams. If that separates some teams but leaves others still tied, those teams start over with head-to-head among just themselves.
  2. Winning percentage against common conference opponents, starting with the highest-placed opponent and working down (opponents tied with each other count together). Teams still tied after a split go back to head-to-head.
  3. RPI.
  4. Coin flip (fixed for the season, so it doesn't change on reload).
  
  The Standings page lists these in a collapsible Tiebreakers box. Teams tied for the best conference record **share the regular-season title** (co-champions on team, coach and conference pages); the tiebreakers still decide the tournament's top seed and, with no tournament, the automatic bid. You can override the regular-season champion to name a single one.
- **RPI:** 25% winning percentage, 50% opponents' winning percentage (not counting games against the team) and 25% opponents' opponents' winning percentage.
- **Rankings page:** the Top 25 poll (with a **Dropped out** list showing who fell out, their old rank and that week's record), the RPI, **strength of schedule** and power ratings. Strength of schedule is ⅔ opponents' winning percentage plus ⅓ opponents' opponents', with each team's opponents' combined record.
- **WCWS venue:** every WCWS game is played at **Devon Park in Oklahoma City, Oklahoma**. The venue shows at the top of the WCWS tab, on each WCWS game card and in the game window. Change the stadium or city in Settings → League (it applies to the current season and carries forward).
- **Polls** show each ranked team's record for that week (NCAA tournament record in the final poll), in green or red.
- **Bracketology** (Rankings → Bracketology): from the end of Week 4 until the real field is announced, a projection of the NCAA field and regionals as if the season ended that day. Automatic bids go to each conference's current leader (its best team in the committee order before league play starts, its tournament champion once there is one); at-large spots and seeds follow the committee order. It shows each projected regional (host, teams, conferences, records and RPI ranks), the projected automatic bids, and the last four in, first four out and next four out. Nothing is saved, so it updates as games are played.
- **Top 25 poll** (Settings → Poll size can make it a Top 10, 15 or 20): a fixed panel of **23 voters** (fictional writers and outlets) fills out ballots every week, starting with a preseason poll. Every voter starts from the same picture, built like the CFB dynasty's poll: **team strength** (power ratings worked out from every game's score, starting from the teams' OFF/PIT/DEF ratings) blended with a **season-long résumé** (every win counts, more against a strong opponent; every loss costs, less against a strong opponent). Strength carries most of the weight early; the résumé takes over as games are played. Losses weigh as much as wins: losing a series never helps a résumé. Voters also remember last week's poll a little, and two rules always hold: **a ranked team that loses more games than it wins in a week never moves up**, and **a ranked team that wins every game it plays in a week never drops**. Each then leans a little by personality. Some trust talent and are slow to move teams, some go by the numbers or schedule strength, some react to last week or punish bad losses, and a few regional voters give the conference they cover a small boost. The leans are small, so the poll stays close to a consensus. Personalities are built in and can't be edited. The Rankings page lists the voters, each one's #1 vote, and any voter's full ballot next to the poll. Each poll shows points and first-place votes, and you can edit or regenerate any poll.
- **Ranks at game time:** played games on the Schedule and team pages show each team's rank from the poll in effect when the game was played. Week 1 games use the preseason poll. Games not yet played show the latest poll and each team's current record, with the conference record in parentheses for conference games (for example **22-3 (3-0)**).

## The postseason

The NCAA tournament's shape is set in **Settings → NCAA tournament**, so it can change without touching the code:

- **Regionals:** how many, and how many teams in each. Two-team regionals are a best-of-three series. Three to six teams play double elimination with an "if necessary" final; four is the classic NCAA format: Friday Games 1 and 2, Saturday Games 3, 4 and 5, Sunday the regional final and, if needed, a second final. The top national seeds host, and the field is placed serpentine (with 4 regionals: 1-8-9-16, 2-7-10-15 and so on).
- **Qualifiers:** regionals × teams per regional. Each conference champion gets an automatic bid and the committee picks the rest.
- **Super regionals:** used when there are twice as many regionals as WCWS spots. Two regional champions play a best-of-three series at the higher seed (the 1 seed's regional meets the last host's).
- **WCWS:** **4 teams** play double elimination down to two, then a best-of-three Championship Series. **8 teams** split into **Bracket A** (paths 1, 4, 5, 8) and **Bracket B** (2, 3, 6, 7), each a four-team double elimination with an "if necessary" bracket final. The two bracket winners then play a **best-of-three final**, as in today's baseball and softball World Series.

The editor checks that the format works: the WCWS needs as many regionals as teams, or twice as many with super regionals, and the field can't be bigger than the league. A new format applies to the current season's tournament if its field hasn't been announced, and otherwise starts the next season. Once the field is announced, that season's format is locked in.

The default is the real NCAA format: a 64-team field (31 automatic bids and 33 at-large) in sixteen 4-team regionals hosted by the top 16 national seeds, eight best-of-three super regionals and an 8-team WCWS. The field always has room for every automatic bid. Each stage runs in the week after the last:

1. **Conference tournaments:** each conference picks a format and how many teams make it. The formats are **single elimination**, **double elimination**, and **play-in, then double elimination**. By default, conferences with 9 or more teams take their top 6 and the rest take their top 4. Both are set on the Standings page. You can also switch a tournament's format or edit its seeds on the Postseason page until its first game. Double elimination has a winners bracket and an elimination bracket. The two bracket winners then meet in **one championship game, with no "if necessary" game**. **Play-in, then double elimination** (5 to 8 teams) starts with a single-elimination play-in round on Wednesday, so a play-in loser is out. The top seeds skip it. The four teams left then play the double-elimination bracket. In a top 6, seeds 3 vs 6 and 4 vs 5 play in, and seeds 1 and 2 wait. In a top 5, only 4 vs 5 plays in. In a top 8, all eight play in. With fewer than 5 teams, this format is played as plain double elimination. The champion gets the automatic bid.
2. **Selection:** three panels side by side.
   - **Left:** the **automatic qualifiers** (with how they got the bid), then the **at-large board**: every at-large spot plus the next 10 teams, in committee order (RPI rank 50%, poll rank 30%, strength-of-schedule rank 20%). A line marks the committee's cut, and last four in / first four out are tagged. Each row shows record, RPI, SOS, poll and **quadrant records (Q1–Q4)**. Check and uncheck teams to pick the at-large field, then **Confirm** the teams. **Teams below .500 can't take an at-large spot** (they only get in as an automatic qualifier); in the rare case there aren't enough .500 teams to fill the field, the best of the rest fill the last spots and are tagged. The same rule applies to Bracketology.
   - **Middle:** once confirmed, order **seeds 1–16** (or the field size) with the arrows. The top seeds host. "Change teams" goes back to picking.
   - **Right:** the **regional preview** (teams, conferences, national seed and RPI rank, average OVR) updates as you move seeds and flags conference rivals in the same regional. Then announce the field.
   - **Quadrants:** every team is placed in Q1–Q4 by RPI rank (Q1 is the top quarter), and Q1–Q4 are its record against each quadrant. They're also on Rankings → RPI.
- **Conference tournament hosts:** every conference tournament is played at one of the conference's schools, picked at random each season (never last year's host when there's another choice). Change it on Postseason → Conference tournaments any time before the tournament ends; games already played stay where they were. Hosting doesn't change the bracket: the host plays its games at home, every other game is at the host's site, and a host that doesn't qualify still hosts.
- **Bracket cards** show each team's seed (in parentheses) and poll ranking right before its name. Conference tournaments show every seed and the poll ranking; NCAA games show only the regional hosts' seeds (no poll rankings, so the only numbers are the host seeds). Played games use the ranking from that week's poll.
- **Participants tab** (between the regionals/super regionals and the WCWS): the WCWS field as it fills in, with each team's record entering the WCWS (conference record in parentheses), head coach, the regional or super regional it won, previous WCWS appearances (and the last one), best WCWS finish (with the years) and all-time WCWS win–loss record. History counts seasons in this dynasty. Places: champion 1st, runner-up 2nd, then by the round a team went out (ties like T-3rd in an 8-team WCWS).
- **Postseason scoreboard:** on the Schedule page each postseason day mixes the tournaments together like a real scoreboard. Each event's games stay in order.
3. **Regionals**, then **Super Regionals** if the format has them.
4. **WCWS**: opening games Friday, Game 4 Saturday, Games 3 and 5 Sunday, and the bracket finals Monday (both brackets in the 8-team format, which adds an **WCWS Finals** week for the Championship Series). In the 4-team format the Championship Series is Monday through Wednesday. On the WCWS tab, the 8-team format shows Bracket A and Bracket B docked on the left with the Championship Series centered beside them, its games stacked top to bottom.

The final poll comes out after the championship, with the national champion at #1.

The Postseason page draws each event as a real bracket. Rounds are columns, each game sits between the two games that feed it, and lines join them. Double elimination shows the winners bracket on top and the elimination bracket underneath. Each card shows runs, hits and errors. Click a game, or open the Schedule page, for the full inning-by-inning line score.

## The offseason

Once the national champion is crowned, an **Offseason** page opens. Next season's teams are set up there before any games are scheduled:

- **Realign conferences:** move any team with its Conference menu. Moved teams are marked.
- **Add teams:** each new team gets a full schedule in the new season.
- **Add conferences** or delete empty ones.
- **Remove teams** from the dynasty. Their history stays, and you can bring them back before the season starts.
- **Hot seat:** at the top of the offseason page, a list of suggested firings. Each head coach is measured against what the roster should have done: the team's preseason ratings set an expected winning percentage for that season, and the coach's results this season and over the last three seasons at the school are compared with it. Losing streaks, missing the NCAA tournament with a roster that should have made it, and finishing at the bottom of the conference add heat. A national title (especially a recent one), a deep postseason run, a conference title, and a coach's first or second season at the school count in their favor. Coaches are marked **Fire suggested**, **Hot seat** or **Warm** (warm seats are folded away), with the reasons listed. It's only advice: **Fire** opens the job, **Keep** marks the coach as kept for this offseason, and nothing happens on its own.
- **Coaching carousel:** a panel at the top lists open jobs, available coaches, and every move made this offseason (hires, coaches hired away from another program, firings). "Find a coach" or "Change" opens a candidate list with each coach's career record, NCAA and WCWS trips and titles; hiring a coach from another program opens that job. ✕ fires a coach, who stays in the dynasty as available.
- **Rating points:** each returning team earns an allotment of rating points for the new season. A winning record earns points, beating what the team's ratings predicted earns more, and a deep postseason run earns more again. Teams already near the top lose some to graduation (everyone is pulled a little toward 70), and there's some luck. Points start unplaced: the Points column lists what each team has to place (or take off, for negative points), and you use − and + on OFF, PIT and DEF to place them. **Auto** places a team's remaining points at random (keeping what you've placed), **Reset** undoes its placements, and the buttons above the teams do the same for everyone. Points not placed when the season starts are lost.

**Start the season** builds the new schedule from the new alignment. The final poll seeds the next preseason poll.

## Coaches

Coaches are people in the dynasty, not just names on a team. Each coach has a **profile page** with their career record, titles, a season-by-season table across every program they have led, and a way to hire them if they're available. The **Coaches** page lists every coach with his current program, seasons, record, conference tournament titles, NCAA trips, WCWS trips, national titles and career path. Coaches without a job stay on the list as available, so another program can hire them later. You can add or rename coaches there. Click any column header to sort by it (click again to flip the order).

The **Teams** page lists every team ranked by OVR, with a # column. Click any header (team, coach, conference, OFF, PIT, DEF, OVR, record, poll) to re-sort.

## Conference and team history

- **Conference pages** show the conference's all-time record against other conferences (and against each one), NCAA bids and national titles, then a full-width **Champions by season** table: regular-season champions with their conference records (shared titles listed together), the tournament champion, format and host, the conference's record against other conferences that year, NCAA bids, NCAA win–loss and its best finish. **Members, all-time** lists every team that has played in the conference with its conference and overall record there, titles, NCAA trips and WCWS trips (former members are marked).
- **Team pages:** the dynasty record shows which conference the team was in each season, and where its postseason ended: the regional it played in and the round it went out (for example **UCLA Regional · out in Game 5**), a super regional and the series score, or how far it went in the WCWS. Click it to open that season's bracket on the Postseason page. Coach pages show the same.
- **Brackets** are drawn with long, thin game cards showing just the final score (click a game for the full line score with hits and errors). The game's status (final, or the favorite and a sim button) sits in the card's top row, and each winner's row is shaded, starting just after the logo, in a gradient of its team color with black or white text, whichever reads better.

## Records

The **Records** page is the dynasty's record book, covering every season in the league (a season still in progress is marked *):

- **Programs, all-time:** seasons, wins, winning percentage, regular-season titles (shared titles count), conference tournament titles, NCAA appearances, WCWS appearances and national titles. Click any column to sort.
- **Single season:** most wins, best winning percentage, most runs scored, fewest runs allowed, best run differential, longest winning streak, best conference record, and most losses by a national champion.
- **Single game:** most runs, most hits, largest margin of victory, most combined runs, longest games (extra innings) and every no-hitter.
- **Coaches:** career wins, career winning percentage, national titles and WCWS appearances.

Everything is worked out from the games, so it updates as you play and includes the postseason.

## Commissioner controls

| Want to… | Where |
|---|---|
| Enter or change a score | Click the game (Schedule, Postseason, team page) |
| Change ratings | Teams page, or the team's profile |
| Add a team | Offseason (full schedule), or Teams → + Add team mid-season |
| Realign conferences | Offseason → Conference menus |
| Change a head coach | Teams page, team profile, or Offseason (dropdown) |
| Pick a conference tournament format | Standings → Commissioner, or Postseason before it starts |
| Rename a team, change colors, logo or conference | Team profile → Commissioner edits |
| Add or rename a conference, set its logo | Conferences |
| Add a game | Schedule → + Add game |
| Override a conference champion or tournament size | Standings → Commissioner |
| Edit tournament seeds | Postseason → Conference tournaments |
| Change the NCAA field or seeds | Postseason → Selection |
| Edit a poll | Rankings → Edit poll |
| New schedule (before any games) | Settings → Rebuild schedule |
| Season length, midweek format | Settings → Schedule format |
| Regionals, qualifiers, super regionals, WCWS size | Settings → NCAA tournament |

## Logos

Logos come from [this college logo list](https://gist.github.com/saiemgilani/c6596f0e1c8b148daabc2b7f1e6f6add), which points to ESPN's images, and are cached in your browser. Schools it doesn't cover, mostly ones without football (most of the CCAA, GNAC and PacWest), show a badge in their colors with their abbreviation. You can give any team or conference its own logo by pasting an image link or uploading a file on its page.

## Run it on GitHub Pages

1. Put these files in the repository's `main` branch, keeping the folders (`index.html`, `css/`, `js/`, `.nojekyll`).
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` and `/ (root)`.
3. After a minute, the site is live at `https://<your-username>.github.io/<repo-name>/`.

To run it locally, serve the folder with any static server. Opening `index.html` straight from disk won't work.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Where your data lives

The dynasty is saved in your browser (IndexedDB). **Settings → Download backup** saves the whole league as a JSON file, and **Restore backup** loads one, which is also how you move to another device.

## Project layout

```
index.html              app shell
css/styles.css          styles (light and dark)
js/app.js               loading, top bar, routing
js/ui.js                shared pieces: team labels, logos, game cards, game editor
js/views-season.js      home, schedule, standings, rankings, postseason pages
js/views-league.js      teams, team profiles, conferences, history, settings
js/views-records.js     records page
js/records.js           record book (programs, seasons, games, coaches)
js/data.js              the NCAA teams and conferences, coaches, colors, starting ratings (built by tools/build_data.py)
js/sim.js               plate-appearance game simulator and win probability
js/schedule.js          schedule generator
js/standings.js         records, standings, tiebreakers, RPI
js/polls.js             voter panel and generated polls
js/ratings.js           in-season rating movement
js/postseason.js        conference tournaments, selection, regionals, WCWS
js/league.js            league lifecycle, editing, simulation, new seasons
js/store.js             saving and backups
js/logos.js             logo list loading and lookup
tests/                  logic test (Node) and UI test (Playwright)
tools/stamp.py          version-stamps file links before each release
tools/check.sh          checks every module parses before a release
```

Before committing changes, run `python3 tools/stamp.py`. It adds a version to every script and stylesheet link so browsers load a matching set of files after an update instead of mixing cached old files with new ones.

Run the tests with `node tests/logic.test.mjs` and `python3 tests/ui_test.py`. The UI test needs `pip install playwright` and `playwright install chromium`.
