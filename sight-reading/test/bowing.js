// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const P = window.osme.OpenSheetMusicDisplay.prototype, o = P.load;
    P.load = function (x) { window.__xml = x; return o.apply(this, arguments); };
  });
  await p.waitForTimeout(2200);
  for (let i = 0; i < 5; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(500);

  // eighths only, no rests: 8 sounding notes per 4/4 bar, so groups are clean
  await p.evaluate(() => {
    document.querySelectorAll('#beats .beat').forEach(cb => {
      const should = cb.value === 'ee';
      if (cb.checked !== should) { cb.checked = should; cb.dataset.w = 1; cb.dispatchEvent(new Event('change')); }
    });
  });
  await p.waitForTimeout(1400);

  const stats = async () => {
    const xml = await p.evaluate(() => window.__xml);
    const starts = (xml.match(/<slur type="start"/g) || []).length;
    const stops = (xml.match(/<slur type="stop"/g) || []).length;
    const notes = (xml.match(/<step>/g) || []).length;
    const curves = await p.evaluate(() =>
      document.querySelectorAll('#sheet .vf-curve, #sheet .vf-slur, #sheet [class*=curve]').length);
    return { starts, stops, notes, curves };
  };

  // Slur lengths are multi-select, so state is "which pills are lit" — click
  // whatever differs from the set we want.
  const setSlurs = async (want) => {
    await p.evaluate(w => {
      const target = new Set(w);
      [...document.querySelectorAll('#bowing-pills .opt')].forEach(b => {
        const n = +b.dataset.bowing;
        if (b.classList.contains('on') !== target.has(n)) b.click();
      });
    }, want);
    await p.waitForTimeout(1600);
  };

  // Every group length actually written into the score. A tied continuation
  // is skipped: it is the same note, and counting it would inflate the group.
  const groupTally = () => p.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__xml, 'application/xml');
    const tally = {}; let run = null, bare = 0, total = 0;
    doc.querySelectorAll('note').forEach(n => {
      if (n.querySelector('rest') || n.querySelector('tie[type=stop]')) return;
      total++;
      if (n.querySelector('slur[type=start]')) run = 1;
      else if (run != null) run++;
      else bare++;
      if (n.querySelector('slur[type=stop]')) { tally[run] = (tally[run] || 0) + 1; run = null; }
    });
    return { tally, bare, total };
  });

  await setSlurs([]);
  console.log('nothing lit :', JSON.stringify(await stats()), '(want 0 slurs)');

  for (const n of [2, 4]) {
    await setSlurs([n]);
    const s = await stats();
    console.log(`slurs of ${n}  :`, JSON.stringify(s),
      s.starts === s.stops && s.starts === s.notes / n ? '(counts exact)' : `(want ${s.notes / n} groups)`);
  }

  // A mixed selection must produce a mixture, and never a length nobody asked
  // for — the whole point of multi-select is phrasing that varies.
  for (const want of [[2, 3], [1, 2]]) {
    await setSlurs(want);
    const g = await groupTally();
    const got = Object.keys(g.tally).map(Number).sort((a, b) => a - b);
    const onMenu = got.every(n => want.includes(n));
    const mixed = want.filter(n => n >= 2).length < 2 || got.length > 1;
    console.log(`picked ${JSON.stringify(want)}  : groups ${JSON.stringify(g.tally)}` +
      ` bare ${g.bare}/${g.total}`,
      onMenu && mixed ? '(on-menu, mixed)' : (onMenu ? '(on-menu but not mixed)' : '(OFF-MENU LENGTH)'));
  }

  // The two things the per-bar reset used to get wrong.
  //
  // 1. No stranded notes. 3/4 with quarters is three notes to the bar, so
  //    "slur in 2s" used to join two and leave the third bare in every single
  //    bar. Running through the barline, every note lands under a curve
  //    except at most one leftover at the very end of the piece.
  await p.evaluate(() => [...document.querySelectorAll('#timesig-pills .opt')].find(b => b.textContent.trim() === '3/4').click());
  await p.waitForTimeout(1400);
  await p.evaluate(() => {
    document.querySelectorAll('#beats .beat').forEach(cb => {
      const should = cb.value === 'q';
      if (cb.checked !== should) { cb.checked = should; cb.dataset.w = 1; cb.dispatchEvent(new Event('change')); }
    });
  });
  await p.waitForTimeout(1400);
  await setSlurs([2]);
  const bare = await p.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__xml, 'application/xml');
    let inside = 0, total = 0, open = false;
    doc.querySelectorAll('note').forEach(n => {
      if (n.querySelector('rest')) { open = false; return; }
      total++;
      if (n.querySelector('slur[type=start]')) open = true;
      if (open) inside++;
      if (n.querySelector('slur[type=stop]')) open = false;
    });
    return { total, bare: total - inside };
  });
  console.log(`3/4 slurs of 2 : ${bare.bare} of ${bare.total} notes left bare`,
    bare.bare <= 1 ? '(at most one leftover — clean)' : '(LIMPING)');

  // 2. A slur must never start or stop on the far side of a tie. Both curves
  //    look the same and mean opposite things, so a slur restarting mid-hold
  //    made the line unreadable.
  await p.evaluate(() => [...document.querySelectorAll('#ties-pills .opt')].find(b => b.dataset.ties === 'lots').click());
  await p.waitForTimeout(1800);
  const clash = await p.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__xml, 'application/xml');
    let onContinuation = 0, onHeldOut = 0, ties = 0;
    doc.querySelectorAll('note').forEach(n => {
      if (n.querySelector('tie[type=start]')) ties++;
      if (n.querySelector('tie[type=stop]') && n.querySelector('slur[type=start]')) onContinuation++;
      if (n.querySelector('tie[type=start]') && n.querySelector('slur[type=stop]')) onHeldOut++;
    });
    return { ties, onContinuation, onHeldOut };
  });
  console.log(`slurs over ${clash.ties} ties : slur starting on a continuation ${clash.onContinuation},` +
    ` slur ending on a held-out note ${clash.onHeldOut}`,
    (clash.onContinuation === 0 && clash.onHeldOut === 0) ? '(both 0 — clean)' : '(CLASH)');

  await p.evaluate(() => [...document.querySelectorAll('#ties-pills .opt')].find(b => b.dataset.ties === 'off').click());
  await p.waitForTimeout(1200);
  await p.evaluate(() => [...document.querySelectorAll('#timesig-pills .opt')].find(b => b.textContent.trim() === '4/4').click());
  await p.waitForTimeout(1400);
  await setSlurs([4]);

  // round-trips as preset state
  await p.evaluate(() => { window.prompt = () => 'BowTest';
    [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('+')).click(); });
  await p.waitForTimeout(500);
  await setSlurs([]);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('BowTest')).click());
  await p.waitForTimeout(1200);
  console.log('preset round-trip bowing =', await p.evaluate(() => document.getElementById('bowing').value), '(want 4)');
  // and a preset saved before slurs became a set must still load
  await p.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sr_presets') || '{}');
    saved['LegacySingle'] = { bowing: '2', measures: '16' };
    localStorage.setItem('sr_presets', JSON.stringify(saved));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('LegacySingle')).click());
  await p.waitForTimeout(1800);
  const legacy = await p.evaluate(() => ({
    lit: [...document.querySelectorAll('#bowing-pills .opt')].filter(b => b.classList.contains('on')).map(b => b.dataset.bowing),
    // the header names the preset only if presetMatchesPanel agrees
    title: document.getElementById('sh-title').textContent.trim()
  }));
  console.log(`legacy preset bowing="2" : lit ${JSON.stringify(legacy.lit)} header "${legacy.title}"`,
    legacy.lit.join() === '2' && legacy.title === 'LegacySingle' ? '(loads + recognised)' : '(BROKEN)');
  await p.screenshot({ path: __dirname + '/out/bowing.png' });
  console.log('errors:', errs);
  await b.close();
})();
