#!/usr/bin/env python3
"""End-to-end test: plays the whole hunt in headless Chromium against a build of
tools/test/fixture.config.json, including the negative cases (wrong answers,
skipping ahead). Requires Node and `pip install playwright && playwright install chromium`.

    python3 tools/test/e2e.py
"""
import shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SITE = tempfile.mkdtemp(prefix="hunt-e2e-")
for f in ROOT.iterdir():
    if f.suffix in {".html", ".js", ".css", ".jpg", ".png"}:
        shutil.copy(f, SITE)
subprocess.run(["node", str(ROOT / "tools/build-hunt.mjs"),
                str(ROOT / "tools/test/fixture.config.json"), str(Path(SITE) / "hunt-data.js")], check=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", SITE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
B = "http://127.0.0.1:8765/"
ok = True
def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg); ok &= bool(cond)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        clue = lambda: pg.inner_text(".hidden-clue")
        def wait_clue(n, word):
            pg.wait_for_function(f"document.querySelector('.hidden-clue').textContent === '{n}. {word}'", timeout=20000)
            return True
        pg.goto(B + "puzzle-02.html"); pg.wait_for_timeout(500)
        check(pg.is_visible("#hunt-locked"), "puzzle 2 locked before puzzle 1")
        pg.goto(B + "index.html")
        pg.click("#secret-o"); check(pg.get_attribute("#button-container a", "href") == "puzzle-01.html", "index reveal links to puzzle 1")
        # 1: wrong then right
        pg.goto(B + "puzzle-01.html")
        check(clue() == "1. ······", "clue hidden before solving")
        pg.fill("#answerInput", "11"); pg.click("button:has-text('Submit')"); pg.wait_for_timeout(1500)
        check(pg.is_visible("#error") and clue() == "1. ······", "wrong answer rejected")
        t = time.time(); pg.fill("#answerInput", " 12 "); pg.click("button:has-text('Submit')")
        check(wait_clue(1, "alpha"), f"puzzle 1 solved ({time.time()-t:.2f}s)")
        check("active-ui" in pg.get_attribute("#ui-layer", "class"), "win UI shown")
        def typed(n, sel, val, word):
            pg.goto(B + f"puzzle-{n:02d}.html"); pg.fill(sel, val); pg.click("button:has-text('Submit')")
            check(wait_clue(n, word), f"puzzle {n} solved with {val!r}")
        def game(n, js, word):
            pg.goto(B + f"puzzle-{n:02d}.html"); pg.wait_for_timeout(300); pg.evaluate(js)
            check(wait_clue(n, word), f"puzzle {n} (game) completes")
        typed(2, "#answerInput", "Rover", "bravo")
        typed(3, "#answerInput", "7", "charlie")
        game(4, "gameWin()", "delta")
        game(5, "boardState = boardState.map((_, i) => i); checkWin()", "echo")
        pg.goto(B + "puzzle-06.html")
        for i, v in enumerate(["a red Scarf", "snow boots", "Gloves", "two puppies", "the star", "tree!"]):
            pg.locator(".answer-input").nth(i).fill(v)
        t = time.time(); pg.click("button:has-text('Submit')")
        check(wait_clue(6, "foxtrot"), f"puzzle 6 solved, fuzzy fields ({time.time()-t:.2f}s)")
        typed(7, "#yeti-msg", "Silent Night!", "golf")
        pg.goto(B + "puzzle-08.html"); pg.wait_for_timeout(300)
        t = time.time()
        pg.evaluate("[30, 5, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29].forEach(n => checkSequence(n))")
        check(wait_clue(8, "hotel"), f"puzzle 8 melody detected after noise ({time.time()-t:.2f}s)")
        game(9, "hits = NUM_SHIPS * SHIP_LENGTH; checkWin()", "india")
        typed(10, "#answerInput", "Merry and Bright", "juliett")
        game(11, "gameWin()", "kilo")
        typed(12, "#answerInput", "you  FOUND it", "lima")
        pg.goto(B + "puzzle-05.html"); pg.wait_for_timeout(800)
        check(clue() == "5. echo", "solved page restores its word on revisit")
        # fresh browser: game page cannot be completed without the chain
        ctx = br.new_context(); p2 = ctx.new_page()
        p2.goto(B + "puzzle-09.html"); p2.wait_for_timeout(300)
        p2.evaluate("hits = NUM_SHIPS * SHIP_LENGTH; checkWin()"); p2.wait_for_timeout(800)
        check(p2.inner_text(".hidden-clue") == "9. ······" and p2.is_visible("#hunt-locked"), "skipping ahead to a game page reveals nothing")
        p2.goto(B + "puzzle-12.html"); p2.fill("#answerInput", "you found it"); p2.click("button:has-text('Submit')"); p2.wait_for_timeout(1500)
        check(p2.inner_text(".hidden-clue") == "12. ······", "right answer without the chain reveals nothing")
        check(not errors, f"no JS errors {errors}")
        br.close()
finally:
    srv.terminate()
    shutil.rmtree(SITE, ignore_errors=True)
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
