// The onboarding mark's entrance, and the preview's note-glide.
//
// Both are geometry the eye reads and a diff cannot: that the three circles
// really start stacked and end on their triangle, that the note arrives after
// they part, and that switching preset moves the same four noteheads rather
// than replacing them. All measured off the live elements — which is the reason
// the mark stopped being a sprite <symbol>: nothing inside a <use> shadow tree
// can be measured at all.
//
//   node sight-reading/test/mark.js
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || "/opt/node22/lib/node_modules/playwright";
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = require(PW);
const BASE = "http://localhost:8091/index.html";
const SHOT = process.env.SHOT || "/tmp/";

// Read the circles off their computed transforms rather than off
// getBoundingClientRect: the ring rotates, and a rotated child's client rect is
// the axis-aligned box of a rotated box, which grows and shrinks on its own.
// The transform is the thing the animation actually drives.
const RING = `(() => {
  const cs = [...document.querySelectorAll(".ob-logo-c")].map((c) => {
    const m = new DOMMatrix(getComputedStyle(c).transform);
    return { x: m.e, y: m.f, r: m.a };
  });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const n = document.querySelector(".ob-logo-note");
  const nm = new DOMMatrix(getComputedStyle(n).transform);
  return {
    spread: +((d(cs[0], cs[1]) + d(cs[1], cs[2]) + d(cs[0], cs[2])) / 3).toFixed(3),
    radius: +cs[0].r.toFixed(3),
    turn: +(Math.atan2(...(() => { const g = new DOMMatrix(
      getComputedStyle(document.querySelector(".ob-logo-ring")).transform);
      return [g.b, g.a]; })()) * 180 / Math.PI).toFixed(2),
    noteOpacity: +(+getComputedStyle(n).opacity).toFixed(3),
    noteScale: +nm.a.toFixed(3)
  };
})()`;

const ring = (page) => page.evaluate(RING);

const notes = (page) => page.evaluate(() =>
  [...document.querySelectorAll(".ob-pnote")].map((g) => {
    const e = g.querySelector("ellipse").getBoundingClientRect();
    return { y: +e.y.toFixed(1), dir: g.classList.contains("up") ? "up" : "dn" };
  }));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const fail = [];
  const ok = (name, cond, detail) => {
    console.log(`${cond ? "  ok  " : "FAIL  "}${name}${detail ? "  " + detail : ""}`);
    if (!cond) fail.push(name);
  };

  // --- 1 · the assembly ------------------------------------------------------
  // Sampled every frame from inside the page. Polling from here cannot see the
  // opening frame: the entrance waits on document.fonts.ready, which resolves
  // in about the time one round trip takes, so by the first measurement it is
  // already a tenth of the way out.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(`(() => {
      window.__frames = [];
      const tick = () => {
        if (document.querySelector(".ob-logo-c")) window.__frames.push(${RING});
        if (window.__frames.length < 200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.waitForTimeout(1500);

    const f = await page.evaluate(() => window.__frames);
    const first = f[0], last = f[f.length - 1];

    // spread 7 · fit 24/(20+7) = 0.889 → each centre 6.222 units off the middle,
    // so the side of the triangle is 6.222·√3 = 10.78 in the 48-unit box.
    const want = 7 * (24 / 27) * Math.sqrt(3);

    ok("starts stacked on the centre", first.spread < 0.01, `spread ${first.spread}`);
    ok("starts with the ring wound", Math.abs(first.turn - 12) < 0.01, `${first.turn}°`);
    ok("starts with the note absent and small",
       first.noteOpacity === 0 && Math.abs(first.noteScale - 0.6) < 0.01,
       `opacity ${first.noteOpacity} scale ${first.noteScale}`);

    ok("the circles travel outward without reversing",
       f.every((s, i) => i === 0 || s.spread >= f[i - 1].spread - 0.001));
    ok("the radius never moves — only the dials set it",
       f.every((s) => Math.abs(s.radius - 20 * (24 / 27)) < 0.001), `r ${last.radius}`);

    // The note arrives after they have parted, which is the whole reason it is
    // animated at all: drawn on top, it can never be uncovered.
    const noteStart = f.findIndex((s) => s.noteOpacity > 0);
    const partedBy = f[noteStart] ? f[noteStart].spread / want : 0;
    ok("the note arrives once the circles are half apart",
       partedBy > 0.3 && partedBy < 0.65, `${(partedBy * 100).toFixed(0)}% apart`);

    ok("settles on the triangle the dials describe",
       Math.abs(last.spread - want) < 0.02, `spread ${last.spread} want ${want.toFixed(3)}`);
    ok("the ring unwinds to square", Math.abs(last.turn) < 0.02, `${last.turn}°`);
    ok("the note lands whole",
       last.noteOpacity === 1 && Math.abs(last.noteScale - 1) < 0.001, JSON.stringify(last));

    // Clicking replays it: back to stacked, then out again.
    await page.click(".ob-logo");
    await page.waitForTimeout(80);
    const replay = await ring(page);
    ok("click replays the assembly", replay.spread < last.spread - 1, `spread ${replay.spread}`);
    await page.waitForTimeout(1200);
    ok("replay settles back", Math.abs((await ring(page)).spread - last.spread) < 0.02);

    await page.screenshot({ path: SHOT + "mark-settled.png",
                            clip: { x: 300, y: 150, width: 680, height: 600 } });
    await page.close();
  }

  // --- 2 · stillness ---------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    const r = await ring(page);
    const want = 7 * (24 / 27) * Math.sqrt(3);
    ok("reduced motion: the mark is simply there",
       Math.abs(r.spread - want) < 0.02 && r.noteOpacity === 1 && r.turn === 0,
       JSON.stringify(r));
    ok("reduced motion: not stacked at any point",
       !(await page.evaluate(() => document.querySelector(".ob-logo").classList.contains("ob-stacked"))));
    ok("reduced motion: the card is simply there too",
       await page.evaluate(() => {
         const ob = document.getElementById("ob");
         return !ob.classList.contains("ob-entering") &&
                getComputedStyle(ob).opacity === "1" &&
                new DOMMatrix(getComputedStyle(ob.querySelector(".ob-card")).transform).f === 0;
       }));
    await page.close();
  }

  // --- 1b · the card arrives ---------------------------------------------------
  // Same move as the exit, run backwards, and on the same font gate as the mark
  // — the wordmark sits between them, so gating one without the other only
  // moves the face-swap onto the name.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(`(() => {
      window.__card = [];
      const tick = () => {
        const ob = document.getElementById("ob");
        if (ob && !ob.hidden) {
          const c = ob.querySelector(".ob-card");
          window.__card.push({
            scrim: +(+getComputedStyle(ob).opacity).toFixed(3),
            y: +new DOMMatrix(getComputedStyle(c).transform).f.toFixed(2),
            markStacked: ob.querySelector(".ob-logo.ob-stacked") ? 1 : 0
          });
        }
        if (window.__card.length < 200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.waitForTimeout(1500);

    const c = await page.evaluate(() => window.__card);
    const first = c[0], last = c[c.length - 1];
    ok("the card starts down and the scrim clear",
       first.scrim < 0.05 && Math.abs(first.y - 16) < 0.5, JSON.stringify(first));
    ok("it rises without overshooting past its resting place",
       c.every((f) => f.y >= -0.01), `min y ${Math.min(...c.map((f) => f.y)).toFixed(2)}`);
    ok("it settles flush and opaque",
       last.scrim === 1 && last.y === 0, JSON.stringify(last));

    // The mark starts partway through the card, not after it: two entrances in
    // sequence is one entrance too many.
    const cardDone = c.findIndex((f) => f.y === 0);
    const markGo = c.findIndex((f, i) => i > 0 && !f.markStacked && c[i - 1].markStacked);
    ok("the mark starts while the card is still moving",
       markGo > 0 && markGo < cardDone, `mark at frame ${markGo} of ${cardDone}`);
    await page.close();
  }

  // --- 1c · and leaves the way it came ------------------------------------------
  // The exit overrides the entrance's duration rather than owning the rule, so
  // it is exactly the kind of thing that breaks silently: still 280ms, still
  // finished inside obFinish's 320ms teardown, still landing on live ink.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.waitForTimeout(1200);
    await page.click("#ob-next"); await page.waitForTimeout(420);
    await page.click("#ob-next"); await page.waitForTimeout(420);

    const dur = await page.evaluate(() => {
      const ob = document.getElementById("ob");
      ob.classList.add("ob-leaving");
      const d = getComputedStyle(ob).transitionDuration;
      ob.classList.remove("ob-leaving");
      return d;
    });
    ok("the exit keeps its own, quicker duration", /^0\.28s/.test(dur), dur);

    await page.click("#ob-next");                    // Start practicing
    await page.waitForTimeout(120);
    ok("it drops rather than rises on the way out",
       await page.evaluate(() => new DOMMatrix(getComputedStyle(
         document.querySelector(".ob-card")).transform).f > 0));
    await page.waitForTimeout(500);
    ok("and it is gone, over live ink",
       await page.evaluate(() => document.getElementById("ob").hidden &&
         document.querySelectorAll(".vf-stavenote").length > 0));
    await page.close();
  }

  // --- 2b · the dials reach it ------------------------------------------------
  // The entrance is tuned by dragging, so the three timing tokens have to be
  // live the way every other tweak token is — and they are only observable
  // while it is running.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const r = document.documentElement.style;
      r.setProperty("--ob-mark-turn", "40");
      r.setProperty("--ob-mark-ms", "1600");
      r.setProperty("--ob-mark-stagger", "0");
    });
    await page.click(".ob-logo");
    await page.waitForTimeout(40);
    const a = await ring(page);
    ok("spin dial drives the wound angle", Math.abs(a.turn - 40) < 6, `${a.turn}°`);
    await page.waitForTimeout(400);
    const b = await ring(page);
    ok("duration dial slows it down", b.spread < 10, `spread ${b.spread} at 440ms of 1600`);
    await page.waitForTimeout(1600);
    ok("and it still lands", Math.abs((await ring(page)).spread - 10.777) < 0.02);
    await page.close();
  }

  // --- 3 · stepping back ------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.waitForTimeout(1200);

    // Back lives beside the small wordmark now, built with it, so on the intro
    // — which has neither — it is simply not in the document. It used to sit at
    // the head of the footer, held-not-hidden on the first page so the dots
    // would not shift under it, which left the dots permanently indented by a
    // control that was invisible half the time.
    const off = () => page.evaluate(() => !document.querySelector(".ob-back"));
    const edges = () => page.evaluate(() => {
      const l = (s) => { const e = document.querySelector(s);
        return e ? +e.getBoundingClientRect().left.toFixed(1) : null; };
      return { body: l(".ob-body"), dots: l("#ob-dots"), heading: l("#ob-title"),
               back: l(".ob-back svg") };
    });

    ok("no back on the intro — there is nowhere behind it", await off());

    await page.click("#ob-next");
    await page.waitForTimeout(450);
    ok("back appears on page two", !(await off()));
    const e = await edges();
    ok("the dots sit at the card's edge, with the heading and the back glyph",
       Math.abs(e.dots - e.body) < 1 && Math.abs(e.heading - e.body) < 1 &&
       Math.abs(e.back - e.body) < 2, JSON.stringify(e));

    await page.click("#ob-next");
    await page.waitForTimeout(450);
    const onVocab = await page.evaluate(() => document.querySelector("#ob-title").textContent);

    // Back walks the pages in reverse, and slides the other way doing it.
    await page.click(".ob-back");
    await page.waitForTimeout(30);
    ok("back slides the other way",
       await page.evaluate(() => !!document.querySelector(".ob-page.from-left") ||
                                 !!document.querySelector(".ob-ghost.to-right")));
    await page.waitForTimeout(450);
    ok("back reaches the instrument page",
       await page.evaluate(() => !!document.getElementById("ob-instr-cello") ||
                                 !!document.querySelector(".ob-instr")));

    await page.click(".ob-back");
    await page.waitForTimeout(500);
    ok("back reaches the intro", await off());
    const again = await ring(page);
    ok("the mark is simply there on the way back — no second entrance",
       Math.abs(again.spread - 7 * (24 / 27) * Math.sqrt(3)) < 0.02, `spread ${again.spread}`);

    await page.click(".ob-logo");
    await page.waitForTimeout(80);
    ok("but clicking it still replays", (await ring(page)).spread < again.spread - 1);

    // Forward again, to be sure nothing was consumed on the way back.
    await page.click("#ob-next"); await page.waitForTimeout(420);
    await page.click("#ob-next"); await page.waitForTimeout(420);
    ok("forward still lands on the vocab page",
       (await page.evaluate(() => document.querySelector("#ob-title").textContent)) === onVocab);

    await page.screenshot({ path: SHOT + "ob-foot.png",
                            clip: { x: 380, y: 430, width: 560, height: 300 } });
    await page.close();
  }

  // --- 4 · the preview glide -------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + "?onboarding", { waitUntil: "load" });
    await page.waitForSelector(".ob-logo-c");
    await page.click("#ob-next");                 // instrument
    await page.waitForTimeout(450);
    await page.click("#ob-next");                 // vocab
    await page.waitForTimeout(450);
    await page.waitForSelector(".ob-pnote");

    const ids = () => page.evaluate(() =>
      [...document.querySelectorAll(".ob-pnote ellipse")].map((e) => e.__seen = (e.__seen || 0) + 1));
    await ids();

    const steps = await notes(page);
    ok("four notes", steps.length === 4, JSON.stringify(steps.map((n) => n.y)));

    const pills = await page.$$(".ob-preset");
    await pills[2].click();                        // wide leaps
    await page.waitForTimeout(60);
    const mid = await notes(page);
    await page.waitForTimeout(600);
    const leaps = await notes(page);

    const spanOf = (ns) => Math.max(...ns.map((n) => n.y)) - Math.min(...ns.map((n) => n.y));
    ok("leaps span more staff than steps", spanOf(leaps) > spanOf(steps) + 8,
       `steps ${spanOf(steps).toFixed(1)} leaps ${spanOf(leaps).toFixed(1)}`);
    ok("they glided rather than jumped",
       spanOf(mid) > spanOf(steps) && spanOf(mid) < spanOf(leaps) - 2,
       `mid ${spanOf(mid).toFixed(1)}`);
    // The whole point of moving instead of redrawing: same elements throughout.
    const same = await page.evaluate(() =>
      [...document.querySelectorAll(".ob-pnote ellipse")].every((e) => e.__seen === 1));
    ok("the same four noteheads moved", same);
    ok("stems follow the direction rule",
       leaps.every((n, i) => n.dir === (i % 2 === 0 ? "up" : "dn")) ||
       leaps.some((n) => n.dir === "dn"), JSON.stringify(leaps.map((n) => n.dir)));

    await page.screenshot({ path: SHOT + "preview-leaps.png",
                            clip: { x: 300, y: 120, width: 680, height: 680 } });
    await page.close();
  }

  await browser.close();
  console.log(fail.length ? `\n${fail.length} failed: ${fail.join(", ")}` : "\nall ok");
  process.exit(fail.length ? 1 : 0);
})();
