"""UI smoke test: drives the app in headless Chromium through a full season.
Run from the repo root:  python3 tests/ui_test.py   (needs: pip install playwright; playwright install chromium)
Screenshots go to $SHOTS (default ./shots)."""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("SHOTS", os.path.join(ROOT, "shots"))
os.makedirs(OUT, exist_ok=True)
PORT = 8766
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": int(os.environ.get("VW", "1400")), "height": 1000})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
        pg.route("**/gist.githubusercontent.com/**", lambda r: r.fulfill(status=404, body=""))
        url = f"http://localhost:{PORT}/"
        pg.goto(url + "#/home"); pg.wait_for_selector(".kpis")
        pg.screenshot(path=f"{OUT}/01-home.png", full_page=True)
        # Mountain West: 8-team double elimination; Southern: double elimination
        pg.goto(url + "#/standings"); pg.wait_for_selector("[data-format]", state="attached")
        open_all = "document.querySelectorAll('details').forEach(d => d.open = true)"
        for sel, val in [("select[data-format='Mountain West']", "double"), ("select[data-size='Mountain West']", "8"), ("select[data-format='Southern']", "double")]:
            pg.evaluate(open_all); pg.select_option(sel, val); pg.wait_for_timeout(200)
        pg.goto(url + "#/schedule"); pg.wait_for_selector(".game")
        pg.click("#w-sim"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/02-schedule.png", full_page=False)
        # open a game and simulate in the editor, then save
        pg.goto(url + "#/schedule"); pg.click(".chip[data-week='2']"); pg.wait_for_timeout(200)
        pg.locator(".game:not(.placeholder)").first.click(); pg.wait_for_selector("dialog[open]")
        pg.click("#m-sim"); pg.wait_for_timeout(100)
        pg.screenshot(path=f"{OUT}/03-editor.png")
        pg.click("#m-save"); pg.wait_for_timeout(200)
        # manual entry with extra inning
        pg.locator(".game:not(.placeholder)").nth(3).click(); pg.wait_for_selector("dialog[open]")
        pg.click("#m-addinn")
        vals = {"away": [0,1,0,0,2,0,0,1], "home": [0,0,2,0,0,1,0,0]}
        for side, arr in vals.items():
            for i, v in enumerate(arr):
                pg.fill(f"input[data-side={side}][data-inn='{i}']", str(v))
        pg.fill("#m-awayH", "7"); pg.fill("#m-homeH", "6"); pg.fill("#m-awayE", "1"); pg.fill("#m-homeE", "0")
        pg.click("#m-save"); pg.wait_for_timeout(200)
        assert not pg.locator("dialog[open]").count(), "manual save closed the editor"
        # manual entry with hits and errors left blank: estimated on save
        pg.locator(".game:not(.placeholder)").nth(4).click(); pg.wait_for_selector("dialog[open]")
        vals = {"away": [1,0,0,3,0,0,0], "home": [0,2,0,0,0,0,1]}
        for side, arr in vals.items():
            for i, v in enumerate(arr):
                pg.fill(f"input[data-side={side}][data-inn='{i}']", str(v))
        pg.click("#m-est"); pg.wait_for_timeout(100)
        est = [pg.input_value(f"#m-{k}") for k in ("awayH", "homeH")]
        assert all(v.isdigit() and int(v) > 0 for v in est), f"estimate button fills hits {est}"
        pg.fill("input[data-side=home][data-inn='6']", "3")  # changing runs clears the estimate
        assert pg.input_value("#m-awayH") == "", "changing runs clears estimated hits"
        pg.click("#m-save"); pg.wait_for_timeout(200)
        pg.locator(".game:not(.placeholder)").nth(4).click(); pg.wait_for_selector("dialog[open]")
        saved = [pg.input_value(f"#m-{k}") for k in ("awayH", "homeH", "awayE", "homeE")]
        print("estimated H/E on save:", saved)
        assert int(saved[0]) > 0 and int(saved[1]) > 0, "blank hits estimated on save"
        pg.click("dialog[open] [data-x]"); pg.wait_for_timeout(100)
        pg.click("#w-rest") if pg.locator("#w-rest").count() else None
        pg.on("dialog", lambda d: d.accept())
        pg.goto(url + "#/schedule"); pg.wait_for_selector(".chip")
        if pg.locator("#w-rest").count(): pg.click("#w-rest"); pg.wait_for_timeout(1500)
        pg.goto(url + "#/standings"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/04-standings.png", full_page=True)
        pg.goto(url + "#/rankings"); pg.wait_for_timeout(300)
        pg.click("tr[data-voter='v2']"); pg.wait_for_timeout(200)
        assert "Priya Raman's ballot" in pg.content()
        pg.screenshot(path=f"{OUT}/05-poll.png", full_page=True)
        assert pg.locator(".dropped").count() + pg.get_by_text("No teams dropped out").count() >= 1, "dropped-out list shown"
        pg.click("[data-tab=rpi]"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/06-rpi.png")
        pg.click("[data-tab=sos]"); pg.wait_for_timeout(200)
        assert "Strength of schedule =" in pg.content()
        pg.screenshot(path=f"{OUT}/06b-sos.png")
        pg.click("[data-tab=bracket]"); pg.wait_for_timeout(300)
        assert pg.locator(".bo-reg").count() == 16 and "Last four in" in pg.content(), "bracketology shows sixteen projected regionals"
        pg.screenshot(path=f"{OUT}/06c-bracketology.png", full_page=True)
        pg.click("[data-tab=poll]"); pg.wait_for_timeout(200)
        pg.goto(url + "#/postseason"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/07-conf-tourneys.png", full_page=True)
        # change a tournament host
        sel = pg.locator("select[data-host='Big South']")
        opts = sel.locator("option").all_inner_texts(); cur = sel.input_value()
        new_host = next(o for o in opts if o != cur)
        sel.select_option(new_host); pg.wait_for_timeout(300)
        assert f"Hosted by {new_host}" in pg.locator(".card", has_text="Big South Tournament").first.inner_text().replace("\n", " "), "host changed"
        pg.click("#ct-sim"); pg.wait_for_timeout(800)
        pg.goto(url + "#/postseason"); pg.click("[data-pt=conf]"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/07b-conf-brackets.png", full_page=True)
        pg.goto(url + "#/postseason"); pg.click("[data-pt=field]"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/08a-field-pick.png", full_page=True)
        assert pg.locator("#f-lock").count() == 0, "can't announce before confirming"
        # swap an at-large team: uncheck the last one in, check the first one out
        boxes = pg.locator("input[data-al]")
        checked = [i for i in range(boxes.count()) if boxes.nth(i).is_checked()]
        unchecked = [i for i in range(boxes.count()) if not boxes.nth(i).is_checked()]
        out_team = boxes.nth(checked[-1]).get_attribute("data-al"); in_team = boxes.nth(unchecked[0]).get_attribute("data-al")
        boxes.nth(checked[-1]).uncheck(); pg.wait_for_timeout(200)
        assert pg.locator("#f-confirm").is_disabled(), "confirm needs every spot filled"
        pg.locator(f"input[data-al='{in_team}']").check(); pg.wait_for_timeout(200)
        pg.click("#f-confirm"); pg.wait_for_timeout(300)
        seeds = pg.evaluate("[...document.querySelectorAll('.seed-row .team-link')].map(a => a.title)")
        assert len(seeds) == 64 and in_team in seeds and out_team not in seeds, f"field follows the picks {in_team} {out_team} {seeds}"
        heads = pg.locator(".seed-table thead").inner_text().split()
        assert heads[:9] == ["Seed", "Team", "Rec", "RPI", "Q1", "Q2", "Q3", "Q4", "SOS"], f"seed table columns {heads}"
        board_heads = pg.evaluate("[...document.querySelector('.sel-board .sel-table thead').querySelectorAll('th')].map(th => th.textContent.trim())")
        assert board_heads.index("RPI") < board_heads.index("Q1") < board_heads.index("SOS") < board_heads.index("Poll"), f"board puts RPI, quadrants, then SOS {board_heads}"
        # Drag seed 1 down below seed 3 with the mouse
        order0 = pg.evaluate("[...document.querySelectorAll('.seed-row .team-link')].map(a => a.title)")
        pg.locator("[data-drag='0']").scroll_into_view_if_needed(); pg.wait_for_timeout(100)
        h = pg.locator("[data-drag='0']").bounding_box(); target = pg.locator(".seed-row").nth(2).bounding_box()
        pg.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2); pg.mouse.down()
        pg.mouse.move(h["x"] + 5, target["y"] + target["height"] * 0.6, steps=8); pg.wait_for_timeout(100)
        assert pg.locator(".seed-row.dragging").count() == 1 and pg.locator(".seed-row.drop-after").count() == 1, "drag shows where the team lands"
        pg.mouse.up(); pg.wait_for_timeout(300)
        order1 = pg.evaluate("[...document.querySelectorAll('.seed-row .team-link')].map(a => a.title)")
        assert order1[:3] == [order0[1], order0[2], order0[0]] and order1[3:] == order0[3:], f"drag moved seed 1 to seed 3 {order0[:4]} -> {order1[:4]}"
        # Keyboard: arrow up on the handle moves it back up one spot and keeps focus
        pg.locator("[data-drag='2']").focus(); pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(300)
        order2 = pg.evaluate("[...document.querySelectorAll('.seed-row .team-link')].map(a => a.title)")
        assert order2[1] == order0[0] and order2[2] == order0[2], "arrow key moves a seed"
        assert pg.evaluate("document.activeElement.dataset.drag") == "1", "focus follows the moved team"
        pg.screenshot(path=f"{OUT}/08-field.png", full_page=True)
        assert pg.locator(".reg-preview .reg-prev").count() == 16, "regional preview shows every regional"
        for w in (1024, 390):
            pg.set_viewport_size({"width": w, "height": 900}); pg.wait_for_timeout(150)
            pg.screenshot(path=f"{OUT}/08-field-{w}.png", full_page=True)
        pg.set_viewport_size({"width": 1400, "height": 1000})
        pg.click("#f-lock"); pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/09-regionals.png", full_page=True)
        pg.click("#ps-all"); pg.wait_for_timeout(1500)
        pg.goto(url + "#/postseason"); pg.click("[data-pt=mcws]"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/10-mcws.png", full_page=True)
        assert "Devon Park" in pg.content() and "Oklahoma City, Oklahoma" in pg.content(), "WCWS venue"
        champ = pg.locator(".banner .big").first.text_content()
        print("champion:", champ)
        pg.goto(url + "#/team/" + champ); pg.wait_for_timeout(400)
        pg.screenshot(path=f"{OUT}/11-team.png", full_page=True)
        pg.click("[data-ttab=history]"); pg.wait_for_timeout(250)
        assert "Ranking history" in pg.content() and "Dynasty record" in pg.content() and "Polls at #1" in pg.content(), "team history tab"
        pg.screenshot(path=f"{OUT}/11b-team-history.png", full_page=True)
        pg.click("[data-ttab=h2h]"); pg.wait_for_timeout(250)
        assert pg.locator(".h2h-table tbody tr").count() > 3, "head-to-head rows"
        pg.click(".h2h-table th[data-sort='w']"); pg.wait_for_timeout(200)
        ws = pg.evaluate("[...document.querySelectorAll('.h2h-table tbody tr')].map(r => +r.children[3].textContent)")
        assert ws == sorted(ws, reverse=True), "H2H sorted by wins"
        pg.click("[data-h2hf=post]"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/11c-team-h2h.png", full_page=True)
        pg.click("[data-h2hf=all]"); pg.click("[data-ttab=season]"); pg.wait_for_timeout(200)
        pg.goto(url + "#/teams"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/12-teams.png")
        pg.click("th[data-sort='pit']"); pg.wait_for_timeout(200)
        pits = pg.evaluate("[...document.querySelectorAll('input[data-rate=pit]')].map(i => +i.value)")
        assert pits == sorted(pits, reverse=True), "teams sorted by PIT"
        pg.click("th[data-sort='pit']"); pg.wait_for_timeout(200)
        pits = pg.evaluate("[...document.querySelectorAll('input[data-rate=pit]')].map(i => +i.value)")
        assert pits == sorted(pits), "second click flips the order"
        pg.click("#t-add"); pg.fill("#f-school", "Lindenwood"); pg.fill("#f-mascot", "Beavers"); pg.click("#f-save"); pg.wait_for_timeout(300)
        assert "Lindenwood" in pg.content()
        pg.goto(url + "#/conferences"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/13-conferences.png")
        pg.goto(url + "#/conference/Southern"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/14-conference.png", full_page=True)
        # NCAA tournament editor: 16 two-team regionals, super regionals, 8-team WCWS for next season
        pg.goto(url + "#/settings"); pg.wait_for_selector("#n-ws")
        pg.select_option("#n-ws", "8"); pg.wait_for_timeout(150)
        pg.select_option("#n-reg", "16"); pg.wait_for_timeout(150)
        pg.select_option("#n-per", "2"); pg.wait_for_timeout(150)
        assert "32 qualifiers" in pg.content()
        pg.screenshot(path=f"{OUT}/14b-ncaa-editor.png", full_page=True)
        pg.click("#n-save"); pg.wait_for_timeout(300)
        # Offseason: new conference, move teams, add a team, start the season
        pg.goto(url + "#/offseason"); pg.wait_for_selector("#o-start")
        assert pg.locator(".hotseat h2", has_text="Hot seat").count() == 1, "hot seat panel"
        assert pg.locator(".hotseat [data-fire]").count() == pg.locator(".hotseat [data-keep]").count(), "every suggestion has Fire and Keep"
        pg.screenshot(path=f"{OUT}/15-offseason.png", full_page=True)
        pg.click("#o-conf"); pg.fill("#cf-name", "Summit"); pg.click("#cf-save"); pg.wait_for_timeout(300)
        for t in ["Seattle U", "Pacific", "San Diego"]:
            pg.select_option(f"select[data-dconf='{t}']", "Summit"); pg.wait_for_timeout(150)
        pg.click("button[data-addto='Summit']"); pg.fill("#f-school", "Le Moyne"); pg.fill("#f-coach", "Pat Casey"); pg.click("#f-save"); pg.wait_for_timeout(300)
        # Coaching carousel: San Diego State hires Mercer's coach, Mercer hires someone new
        pg.click("button[data-hire='San Diego State']"); pg.wait_for_selector("dialog[open] .cand")
        pg.locator("dialog[open] .cand", has_text="Chris Kuhlmeyer").locator("[data-pick]").click(); pg.wait_for_timeout(300)
        assert pg.locator(".job", has_text="Mercer").count() == 1, "Mercer job is open"
        assert "leaves Mercer for" in pg.locator(".moves").inner_text(), "move logged"
        pg.locator(".job", has_text="Mercer").locator("[data-hire]").click(); pg.wait_for_selector("#hm-new")
        pg.click("#hm-new"); pg.wait_for_selector("#cn-name")
        pg.fill("#cn-name", "Sam Newman"); pg.click("#cn-save"); pg.wait_for_timeout(300)
        # Rating points: one more point on Nevada's offense puts it one over budget
        row = pg.locator(".off-table tr", has_text="Nevada").first
        before = row.locator(".pts-cell").inner_text()
        row.scroll_into_view_if_needed(); y0 = pg.evaluate("scrollY")
        row.locator("[data-step='1'][data-k='off']").click(); pg.wait_for_timeout(200)
        assert pg.evaluate("scrollY") == y0, "page stays put after +"
        row = pg.locator(".off-table tr", has_text="Nevada").first
        assert row.locator(".pts-cell").inner_text() != before, "points left updates"
        assert pg.evaluate("Math.max(...[...document.querySelectorAll('.off-conf .table-wrap')].map(w => w.scrollWidth - w.clientWidth))") <= 1, "offseason tables fit without sideways scrolling"
        if row.locator("[data-auto]").count():
            row.locator("[data-auto]").click(); pg.wait_for_timeout(200)
            row = pg.locator(".off-table tr", has_text="Nevada").first
            assert "all placed" in row.locator(".pts-cell").inner_text(), "Auto places the rest"
        row.locator("[data-clear]").click(); pg.wait_for_timeout(200)
        row = pg.locator(".off-table tr", has_text="Nevada").first
        assert row.locator(".pts-cell").inner_text().replace("Auto", "").replace("Reset", "").strip() == before.replace("Auto", "").replace("Reset", "").strip() or "to place" in row.locator(".pts-cell").inner_text() or "to take off" in row.locator(".pts-cell").inner_text(), "Reset"
        pg.screenshot(path=f"{OUT}/15b-offseason-realigned.png", full_page=True)
        pg.click("#o-start"); pg.wait_for_timeout(800)
        pg.goto(url + "#/standings"); pg.wait_for_timeout(300)
        assert "Summit" in pg.content() and "Le Moyne" in pg.content()
        pg.goto(url + "#/team/San Diego State"); pg.wait_for_timeout(300)
        assert "Chris Kuhlmeyer" in pg.content()
        pg.screenshot(path=f"{OUT}/16c-team-2027.png", full_page=True)
        pg.click("[data-ttab=history]"); pg.wait_for_timeout(250)
        pg.screenshot(path=f"{OUT}/16c2-team-history.png", full_page=True)
        pg.click("[data-ttab=season]"); pg.wait_for_timeout(150)
        pg.goto(url + "#/coaches"); pg.wait_for_timeout(300)
        assert "Sam Newman" in pg.content() and "Kelly Inouye-Perez" in pg.content()
        pg.screenshot(path=f"{OUT}/16d-coaches.png", full_page=True)
        pg.click("th[data-sort='titles']"); pg.wait_for_timeout(200)
        assert "sorted" in pg.locator("th[data-sort='titles']").get_attribute("class"), "coaches sort by titles"
        pg.click("a.team-link:has-text('Chris Kuhlmeyer')"); pg.wait_for_timeout(300)
        assert "Mercer" in pg.content() and "San Diego State" in pg.content(), "career shows both programs"
        pg.screenshot(path=f"{OUT}/16e-coach-page.png", full_page=True)
        pg.goto(url + "#/home"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/16-new-season.png", full_page=True)
        # 2027 runs 12 weeks with midweek doubleheaders / Tue-Wed sets
        pg.goto(url + "#/schedule"); pg.wait_for_selector(".chip")
        chips = pg.evaluate("[...document.querySelectorAll('.chip[data-week]')].map(c => c.textContent.trim())")
        assert chips[-1] == "Wk 12", chips
        pg.click(".chip[data-week='3']"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/16f-midweek.png")
        pg.click("#w-rest"); pg.wait_for_timeout(2500)
        pg.goto(url + "#/postseason"); pg.wait_for_timeout(300)
        pg.click("#ps-all"); pg.wait_for_timeout(4000)
        pg.goto(url + "#/postseason"); pg.wait_for_timeout(300)
        tabs = pg.evaluate("[...document.querySelectorAll('[data-pt]')].map(a => a.textContent)")
        assert "Super Regionals" in tabs, tabs
        pg.click("[data-pt=supers]"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/16g-supers.png", full_page=True)
        pg.click("[data-pt=mcws]"); pg.wait_for_timeout(300)
        assert "Bracket A" in pg.content() and "Bracket B" in pg.content() and "Championship Series" in pg.content()
        pg.screenshot(path=f"{OUT}/16h-mcws8.png", full_page=True)
        assert tabs.index("Participants") == tabs.index("Super Regionals") + 1, tabs
        pg.click("[data-pt=participants]"); pg.wait_for_timeout(300)
        assert pg.locator("table.participants tbody tr").count() == 8, "eight WCWS participants"
        assert "8 of 8 spots filled" in pg.content()
        pg.screenshot(path=f"{OUT}/16i-participants.png", full_page=True)
        pg.goto(url + "#/history"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/16b-history.png")
        pg.goto(url + "#/records"); pg.wait_for_timeout(400)
        assert "Programs" in pg.content() and "Most runs in a game" in pg.content() and "Career wins" in pg.content(), "records page"
        pg.click("[data-psort=titles]"); pg.wait_for_timeout(200)
        assert "Programs · in the polls" in pg.content() and "Biggest one-week rise" in pg.content(), "ranking records"
        pg.click("[data-rsort=at1]"); pg.wait_for_timeout(200)
        assert "sorted" in pg.locator("[data-rsort=at1]").get_attribute("class")
        pg.screenshot(path=f"{OUT}/17-records.png", full_page=True)
        # reload keeps data
        pg.goto(url + "#/home"); pg.reload(); pg.wait_for_selector(".kpis")
        assert "2027" in pg.locator("#season-picker").inner_text()
        # Layout check: nothing overlapping or spilling out, at four widths
        CHECK = """() => {
          const out = [];
          const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const name = el => (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
          if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + innerWidth);
          // Cells in a row must not overlap each other.
          for (const row of document.querySelectorAll('.bg-row, .line.sb, .rbar, .lsrow, .poll-row')) {
            const kids = [...row.children].filter(vis).map(k => k.getBoundingClientRect());
            for (let i = 1; i < kids.length; i++) if (kids[i].left < kids[i - 1].right - 1 && kids[i].top < kids[i - 1].bottom - 1) { out.push('cells overlap in ' + name(row)); break; }
          }
          // Text that spills out of its box (ellipsis is allowed).
          for (const el of document.querySelectorAll('.kpi .v, .kpi .l, .bg-team, .line.sb > div:first-child, .team-hero-name, .badge, .chip, .btn, h1, h2, h3, td, th')) {
            if (!vis(el)) continue;
            const cs = getComputedStyle(el);
            if (el.scrollWidth > el.clientWidth + 2 && cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis' && el.closest('.table-wrap, .bracket') == null) out.push('spills: ' + name(el));
          }
          // Sibling cards / tiles must not overlap.
          for (const sel of ['.card', '.game', '.bgame', '.kpi']) {
            const els = [...document.querySelectorAll(sel)].filter(vis);
            const byParent = new Map();
            for (const e of els) { const k = e.parentElement; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(e.getBoundingClientRect()); }
            for (const rs of byParent.values()) for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
              const a = rs[i], b = rs[j];
              if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(sel + ' boxes overlap');
            }
          }
          // Bracket cards must hold their content.
          for (const el of document.querySelectorAll('.bk-node > .bgame')) if (el.scrollHeight > el.clientHeight + 1) out.push('bracket card overflows: ' + name(el));
          for (const el of document.querySelectorAll('.series-tag')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) out.push('series text cut off: ' + name(el));
          // Truncated names (not an error, but counted).
          const cut = [...document.querySelectorAll('.bg-team .team-link, .line.sb .team-link, .kpi .team-link')].filter(e => vis(e) && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
          return { problems: [...new Set(out)].slice(0, 12), truncated: cut.slice(0, 8), truncatedCount: cut.length };
        }"""
        pages = ["#/home", "#/schedule", "#/standings", "#/rankings", "#/postseason", "#/teams", "#/coaches", "#/coach/c3", "#/team/San Diego State", "#/conferences", "#/conference/SEC", "#/history", "#/records", "#/settings"]
        layout_issues = []
        for w in [1400, 1024, 768, 390]:
            lp = b.new_page(viewport={"width": w, "height": 900})
            lp.route("**/gist.githubusercontent.com/**", lambda r: r.fulfill(status=404, body=""))
            for path in pages:
                lp.goto(url + path); lp.wait_for_timeout(250)
                if path == "#/postseason":
                    for tab in ["conf", "field", "regionals", "participants", "mcws"]:
                        if lp.locator(f"[data-pt={tab}]").count():
                            lp.click(f"[data-pt={tab}]"); lp.wait_for_timeout(150)
                            r = lp.evaluate(CHECK)
                            if r["problems"]: layout_issues.append((w, path + "/" + tab, r["problems"]))
                            if r["truncatedCount"]: print(f"  {w}px {path}/{tab}: {r['truncatedCount']} names shortened, e.g. {r['truncated'][:3]}")
                    continue
                if path.startswith("#/team/"):
                    for tab in ["history", "h2h", "season"]:
                        lp.click(f"[data-ttab={tab}]"); lp.wait_for_timeout(150)
                        r = lp.evaluate(CHECK)
                        if r["problems"]: layout_issues.append((w, path + "/" + tab, r["problems"]))
                    continue
                r = lp.evaluate(CHECK)
                if r["problems"]: layout_issues.append((w, path, r["problems"]))
                if r["truncatedCount"]: print(f"  {w}px {path}: {r['truncatedCount']} names shortened, e.g. {r['truncated'][:3]}")
            lp.close()
        for i in layout_issues: print("LAYOUT", i)
        assert not layout_issues, "layout problems"
        # mobile
        m = b.new_page(viewport={"width": 390, "height": 844})
        m.on("pageerror", lambda e: errors.append(str(e)))
        m.goto(url + "#/schedule"); m.wait_for_selector(".game"); m.wait_for_timeout(300)
        m.screenshot(path=f"{OUT}/17-mobile-schedule.png")
        sw = m.evaluate("document.documentElement.scrollWidth")
        print("mobile scrollWidth", sw)
        b.close()
finally:
    srv.terminate()
print("errors:", errors[:10])
assert not errors, errors
print("UI test passed")
