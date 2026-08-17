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
