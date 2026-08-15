// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

// Count bars that are four quarters vs bars containing eighths.
function census(xml) {
  const dv = /<divisions>(\d+)<\/divisions>/.exec(xml);
  const div = dv ? +dv[1] : 1;
  let q = 0, e = 0;
  xml.split(/<measure[ >]/).slice(1).forEach(m => {
    [...m.matchAll(/<duration>(\d+(?:\.\d+)?)<\/duration>/g)].forEach(x => {
      const beats = +x[1] / div;
      if (Math.abs(beats - 1) < 1e-6) q++;
      else if (Math.abs(beats - 0.5) < 1e-6) e++;
    });
  });
  return { q, e };
}

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

  const cellFor = id => `#beats .beat[value="${id}"]`;
  const clickCell = id => p.evaluate(sel => document.querySelector(sel).closest('.fig-cell').click(), cellFor(id));
  const state = id => p.evaluate(sel => {
    const cb = document.querySelector(sel);
    return { on: cb.checked, w: +cb.dataset.w || 1, badge: cb.closest('.fig-cell').querySelector('.wt').textContent };
  }, cellFor(id));

  // start from just quarters + eighths, both weight 1
  await p.evaluate(() => {
    document.querySelectorAll('#beats .beat').forEach(cb => {
      const should = cb.value === 'q' || cb.value === 'ee';
      if (cb.checked !== should) { cb.checked = should; cb.dataset.w = 1; cb.dispatchEvent(new Event('change')); }
    });
  });
  await p.waitForTimeout(1500);
  let c = census(await p.evaluate(() => window.__xml));
  const base = c.q / Math.max(1, c.e / 2);   // eighths come in pairs; per-slot ratio
  console.log('weights 1:1     : quarters', c.q, 'eighths', c.e, ' slot ratio', base.toFixed(2));

  // the cycle: tap the quarter cell → ×2 → ×4, badge follows
  await clickCell('q'); await p.waitForTimeout(900);
  console.log('after 1 tap     :', JSON.stringify(await state('q')), '(want ×2)');
  await clickCell('q'); await p.waitForTimeout(900);
  console.log('after 2 taps    :', JSON.stringify(await state('q')), '(want ×4)');

  c = census(await p.evaluate(() => window.__xml));
  const skew = c.q / Math.max(1, c.e / 2);
  console.log('weights 4:1     : quarters', c.q, 'eighths', c.e, ' slot ratio', skew.toFixed(2),
    skew > base * 1.8 ? '(skewed as asked)' : '(NOT skewed)');

  // one more tap turns it off entirely
  await clickCell('q'); await p.waitForTimeout(900);
  console.log('after 3 taps    :', JSON.stringify(await state('q')), '(want off)');

  // round-trips through a preset, and old-style bare ids still apply
  await clickCell('q'); await clickCell('q'); await p.waitForTimeout(900);   // back to ×2
  await p.evaluate(() => { window.prompt = () => 'WeightTest';
    [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('+')).click(); });
  await p.waitForTimeout(500);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('Steps Only')).click());
  await p.waitForTimeout(900);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('WeightTest')).click());
  await p.waitForTimeout(900);
  console.log('preset round-trip:', JSON.stringify(await state('q')), '(want ×2)');
  console.log('errors:', errs);
  await b.close();
})();
