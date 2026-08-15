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
  await p.waitForTimeout(2600);
  for (let i = 0; i < 5; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(500);

  // short, fast line so completions come quickly
  await p.evaluate(() => {
    const t = document.getElementById('tempo'); t.value = 200; t.dispatchEvent(new Event('change'));
    const m = document.getElementById('measures'); m.value = '8'; m.dispatchEvent(new Event('change'));
    // hide ahead on at 1 beat
    document.getElementById('hide-unit').dataset.unit = 'beats';
    const v = document.getElementById('hide-val'); v.dataset.n = '0';
    document.getElementById('hide-up').click();
    // ramp on
    document.getElementById('ramp-toggle').click();
  });
  await p.waitForTimeout(1400);
  const hideN = () => p.evaluate(() => document.getElementById('hide-val').textContent);
  console.log('start      : hide =', await hideN(), ' ramp =', await p.evaluate(() => document.getElementById('ramp-on').checked));

  await p.click('#play');
  // 8 bars at 200bpm ≈ 9.6s + count-in; watch through ~2 completions
  const seen = [];
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(500);
    const n = await hideN();
    if (seen[seen.length - 1] !== n) seen.push(n);
    if (seen.length >= 3) break;
  }
  await p.click('#play').catch(() => {});
  console.log('progression:', seen.join(' → '), '(want 1 → 2 → 3…)');

  // ramp off: no growth
  await p.evaluate(() => document.getElementById('ramp-toggle').click());
  const before = await hideN();
  await p.click('#play');
  await p.waitForTimeout(8000);
  await p.click('#play').catch(() => {});
  console.log('ramp off   :', before, '→', await hideN(), '(want unchanged)');
  console.log('errors:', errs);
  await b.close();
})();
