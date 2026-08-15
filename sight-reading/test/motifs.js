// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

// Each bar's rhythm as a duration signature; how many non-phrase-start bars
// echo their phrase-start bar exactly.
function echoRate(xml) {
  const bars = xml.split(/<measure[ >]/).slice(1).map(m =>
    [...m.matchAll(/<duration>(\d+(?:\.\d+)?)<\/duration>/g)].map(x => x[1]).join(','));
  let echo = 0, total = 0;
  bars.forEach((sig, i) => {
    if (i % 4 === 0) return;
    total++;
    if (sig === bars[i - (i % 4)]) echo++;
  });
  return { echo, total, pct: Math.round(100 * echo / total) };
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

  // a varied palette, so identical bars can't happen by luck
  await p.evaluate(() => {
    const want = ['q', 'ee', 'ssss', 'des', 'h'];
    document.querySelectorAll('#beats .beat').forEach(cb => {
      const should = want.indexOf(cb.value) >= 0;
      if (cb.checked !== should) { cb.checked = should; cb.dataset.w = 1; cb.dispatchEvent(new Event('change')); }
    });
  });
  await p.waitForTimeout(1400);

  for (const m of [0, 80]) {
    await p.evaluate(v => {
      const M = document.getElementById('musicality');
      M.value = v; M.dispatchEvent(new Event('input')); M.dispatchEvent(new Event('change'));
    }, m);
    await p.waitForTimeout(1500);
    // average over three lines to steady the number
    let agg = { echo: 0, total: 0 };
    for (let r = 0; r < 3; r++) {
      await p.evaluate(() => document.getElementById('generate').click());
      await p.waitForTimeout(1300);
      const e = echoRate(await p.evaluate(() => window.__xml));
      agg.echo += e.echo; agg.total += e.total;
    }
    console.log(`musicality ${String(m).padStart(3)} : bars echoing their phrase-start ${agg.echo}/${agg.total} = ${Math.round(100 * agg.echo / agg.total)}%`);
  }
  console.log('errors:', errs);
  await b.close();
})();
