// Platter folds, and the stack's arrival into an opened rail.
//
// The fold used to be display:none, which is instant and cannot lie. A height
// animation can: it can leave a platter clipped once it has settled (cutting
// off the tooltips that reach outside it), leave closed controls in the tab
// order, or play every stored fold as a collapse on page load. Each of those is
// checked here because none of them is visible in a diff.
//
//   node sight-reading/test/fold.js
const PW = process.env.PW || "/opt/node22/lib/node_modules/playwright";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = require(PW);
const BASE = "http://localhost:8091/index.html";

const state = (page, sel) => page.evaluate((s) => {
  const band = document.querySelector(s);
  const body = band.querySelector(".band-body");
  return {
    folded: band.classList.contains("folded"),
    moving: band.classList.contains("moving"),
    h: +body.getBoundingClientRect().height.toFixed(1),
    overflow: getComputedStyle(body).overflow,
    vis: getComputedStyle(body).visibility,
    caret: getComputedStyle(band.querySelector(".band-caret")).transform
  };
}, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const fail = [];
  const ok = (n, c, d) => { console.log(`${c ? "  ok  " : "FAIL  "}${n}${d ? "  " + d : ""}`); if (!c) fail.push(n); };

  const open = async (ctx, w = 1280) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fail.push("pageerror: " + e.message));
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.click("#settings-toggle");
    await page.waitForTimeout(500);
    return page;
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("sr_onboarded", "1"); } catch (e) {} });

  // --- the fold itself -------------------------------------------------------
  {
    const page = await open(ctx);
    const SEL = '.band[data-band="music"]';
    const a = await state(page, SEL);
    ok("starts open, unclipped, visible",
       !a.folded && a.h > 40 && a.overflow === "visible" && a.vis === "visible", JSON.stringify(a));

    // The header's height, every frame. The grid-rows version of this fold
    // passed every check below while ballooning the header from 50px to 201px
    // and back mid-fold — the surplus space the collapsing row gave up landed
    // in the auto header row, which re-centred its label the whole way. Body
    // height and header top never saw it; only the header's own height does.
    await page.evaluate((sel) => {
      window.__hh = [];
      const h = document.querySelector(sel + " .band-h");
      const t = () => {
        window.__hh.push(+h.getBoundingClientRect().height.toFixed(1));
        if (window.__hh.length < 70) requestAnimationFrame(t);
      };
      requestAnimationFrame(t);
    }, SEL);

    await page.click(`${SEL} .band-h`);
    await page.waitForTimeout(70);
    const mid = await state(page, SEL);
    ok("collapses through intermediate heights, not in one step",
       mid.h > 2 && mid.h < a.h - 10, `${a.h} → ${mid.h}`);
    ok("clipped while it moves", mid.overflow === "hidden", mid.overflow);
    ok("still visible while it is closing", mid.vis === "visible", mid.vis);

    await page.waitForTimeout(500);
    const shut = await state(page, SEL);
    ok("settles closed", shut.folded && shut.h < 1, JSON.stringify({ h: shut.h }));
    ok("and leaves the tab order", shut.vis === "hidden", shut.vis);
    ok("the caret has turned", /matrix\(0,\s*-?1/.test(shut.caret) || shut.caret !== a.caret, shut.caret);
    ok("no longer flagged as moving", !shut.moving);

    await page.click(`${SEL} .band-h`);
    await page.waitForTimeout(600);
    const back = await state(page, SEL);
    ok("reopens to its own height", !back.folded && Math.abs(back.h - a.h) < 1, `${back.h} vs ${a.h}`);
    // The reason the clip is transient: a settled platter's tooltips reach past it.
    ok("and stops clipping, so its tooltips can reach out",
       back.overflow === "visible", back.overflow);

    const hh = await page.evaluate(() => window.__hh);
    ok("the header holds its height through fold and reopen",
       Math.max(...hh) - Math.min(...hh) < 1,
       `${Math.min(...hh)}–${Math.max(...hh)}px over ${hh.length} frames`);

    // iOS paints a grey box over the whole border box on release. On this
    // header — the biggest tap target in the app, inheriting the platter's 24px
    // radius on all four corners — that read as a flash at the moment of
    // letting go. The press already answers twice over: the label inks up while
    // the finger is down, and the platter starts folding.
    await page.evaluate((sel) => document.querySelector(sel + " .band-h")
      .scrollIntoView({ block: "center" }), SEL);
    await page.waitForTimeout(250);
    const at = await page.evaluate((sel) => {
      const r = document.querySelector(sel + " .band-h").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, SEL);
    const colour = () => page.evaluate((sel) =>
      getComputedStyle(document.querySelector(sel + " .band-h")).color, SEL);

    // Off the header first: the clicks above left it hovered, which already
    // inks the label, so "rest" measured in place is not rest at all.
    await page.mouse.move(4, 4);
    await page.waitForTimeout(200);
    const rest = await colour();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(220);   // past the 150ms colour transition, not on its first frame
    const held = await colour();
    await page.mouse.up();
    await page.waitForTimeout(600);

    const tap = await page.evaluate((sel) =>
      getComputedStyle(document.querySelector(sel + " .band-h")).webkitTapHighlightColor, SEL);
    ok("no tap highlight to flash on release", /rgba\(0, 0, 0, 0\)|transparent/.test(tap), tap);
    ok("the press still says something on its own", held !== rest, `${rest} → ${held}`);

    // That press folded it. The next block shares this context's localStorage,
    // so leaving the band shut would hand it a starting state it did not set.
    await page.click(`${SEL} .band-h`);
    await page.waitForTimeout(600);
    await page.mouse.move(4, 4);
    await page.close();
  }

  // --- restoring a stored fold is not a fold ---------------------------------
  {
    const page = await open(ctx);
    await page.click('.band[data-band="music"] .band-h');
    await page.waitForTimeout(500);
    await page.close();

    const p2 = await ctx.newPage();
    p2.on("pageerror", (e) => fail.push("pageerror: " + e.message));
    // Sample from the first frames: a stored fold that animates would be caught
    // here as a height on the way down.
    await p2.addInitScript(`(() => {
      window.__h = [];
      const tick = () => {
        const b = document.querySelector('.band[data-band="music"] .band-body');
        if (b) window.__h.push(+b.getBoundingClientRect().height.toFixed(1));
        if (window.__h.length < 40) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await p2.goto(BASE, { waitUntil: "load" });
    await p2.waitForTimeout(1600);
    await p2.click("#settings-toggle");
    await p2.waitForTimeout(600);
    const heights = await p2.evaluate(() => window.__h);
    ok("a stored fold is restored, not replayed",
       heights.every((h) => h < 1), `max ${Math.max(...heights, 0)}`);
    ok("and it is still shut after the reload",
       (await state(p2, '.band[data-band="music"]')).folded);
    await p2.click('.band[data-band="music"] .band-h');
    await p2.waitForTimeout(600);
    ok("and still opens", !(await state(p2, '.band[data-band="music"]')).folded);
    await p2.close();
  }

  // --- folding near the end of the rail --------------------------------------
  // Collapsing shortens the rail. With nothing below to fall into the gap, the
  // browser claws scrollTop back and everything above the fold slides down —
  // 176px of it here, 267 on an iPad — carrying the header out from under the
  // finger that tapped it. A spacer holds the length instead, so the tapped
  // header does not move at all and the platters below rise to close the gap,
  // which is the whole of what an accordion is for.
  {
    const page = await open(ctx);
    await page.evaluate(() => {
      const rb = document.querySelector(".rail-body");
      rb.scrollTop = rb.scrollHeight;
    });
    await page.waitForTimeout(400);
    const pick = await page.evaluate(() => {
      const hs = [...document.querySelectorAll(".band[data-band] .band-h")];
      const rb = document.querySelector(".rail-body").getBoundingClientRect();
      return hs.findIndex((h) => { const r = h.getBoundingClientRect();
        return r.top > rb.top + 20 && r.bottom < rb.bottom - 20; });
    });
    ok("a header is reachable near the rail's end", pick >= 0, `index ${pick}`);

    await page.evaluate(() => {
      window.__f = [];
      const hs = [...document.querySelectorAll(".band[data-band] .band-h")];
      const t = () => {
        window.__f.push(hs.map((h) => +h.getBoundingClientRect().top.toFixed(2)));
        if (window.__f.length < 90) requestAnimationFrame(t);
      };
      requestAnimationFrame(t);
    });
    const at = await page.evaluate((i) => {
      const r = document.querySelectorAll(".band[data-band] .band-h")[i].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, pick);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(1400);

    const f = await page.evaluate(() => window.__f);
    const travel = (i) => { const s = f.map((x) => x[i]); return Math.max(...s) - Math.min(...s); };

    ok("the tapped header does not move at all", travel(pick) < 0.5,
       `${travel(pick).toFixed(1)}px`);
    ok("nor does anything above it",
       f[0].every((_, i) => i > pick || travel(i) < 0.5));
    // …but the fold still has to be doing something.
    ok("the platters below still rise to close the gap",
       pick + 1 < f[0].length ? travel(pick + 1) > 40 : true,
       pick + 1 < f[0].length ? `${travel(pick + 1).toFixed(0)}px` : "(it was the last)");

    // The held length is given back as you scroll up — the one direction where
    // taking it away can never leave the scroll position out of bounds.
    const held = await page.evaluate(() => {
      const s = document.querySelector(".rail-spacer");
      return s ? Math.round(s.getBoundingClientRect().height) : 0;
    });
    ok("length is held while it is needed", held > 0, `${held}px`);
    await page.evaluate(() => { document.querySelector(".rail-body").scrollTop -= 400; });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const s = document.querySelector(".rail-spacer");
      return s ? Math.round(s.getBoundingClientRect().height) : 0;
    });
    ok("and given back on the way up", after < held, `${held}px → ${after}px`);
    await page.close();
  }

  // --- the stack arrives into an opened rail ---------------------------------
  {
    const page = await open(ctx);
    const later = await page.evaluate(() => {
      const b = [...document.querySelectorAll(".rail .band")];
      return b.map((e) => getComputedStyle(e).animationDelay);
    });
    ok("platters are staggered on a wide window, first one leading",
       later.length > 3 && later[0] === "0s" &&
       later.every((d, i) => i === 0 || parseFloat(d) >= parseFloat(later[i - 1])),
       JSON.stringify(later));
    await page.close();

    const narrow = await browser.newContext({ viewport: { width: 900, height: 900 } });
    await narrow.addInitScript(() => { try { localStorage.setItem("sr_onboarded", "1"); } catch (e) {} });
    const np = await open(narrow, 900);
    // Below the push breakpoint the rail slides as a drawer; a stagger on top of
    // that would be a second animation riding the first.
    const none = await np.evaluate(() =>
      getComputedStyle(document.querySelectorAll(".rail .band")[3]).animationName);
    ok("but not where the rail already slides", none === "none", none);
    await np.close();
    await narrow.close();
  }

  await browser.close();
  console.log(fail.length ? `\n${fail.length} failed: ${fail.join(", ")}` : "\nall ok");
  process.exit(fail.length ? 1 : 0);
})();
